import { CHARACTERS } from './characters';
import {
  deriveRoomConnectionState,
  isRoomExpired,
  isValidFaceDataUrl,
  RoomFighterProfile,
  sanitizeCharacterName,
} from './customization';
import { rtdb } from './firebaseClient';
import { clamp, damp } from './math3d';
import { PublicRoomInfo, validateRoomName } from './rooms';
import {
  AttackHeight,
  CharacterFsmStatus,
  CharacterId,
  FighterActionState,
  FighterRuntime,
  MoveId,
  OnlineRole,
  Projectile,
  RoundPhase,
  StageId,
} from './types';
import {
  ref,
  set,
  get,
  remove,
  update,
  onValue,
  onDisconnect,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/database';
import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

export const PEER_ID_PREFIX = 'stick-fighter-v1-room-';

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};

export function generateRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function normalizeRoomCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length === 4 ? digits : null;
}

export function roomCodeToPeerId(code: string): string {
  return `${PEER_ID_PREFIX}${code}`;
}

export interface NetStatePacket {
  t: 'st';
  seq: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  f: 1 | -1;
  s: FighterActionState;
  m: MoveId | null;
  mt: number;
  wp: number;
  hp: number;
  sm: number;
  fs?: CharacterFsmStatus;
}

export type NetReliablePacket =
  | { t: 'hello'; role: OnlineRole; profile?: RoomFighterProfile }
  | {
      t: 'lobby_pick';
      charId: CharacterId;
      ready: boolean;
      stageId?: StageId;
      customName?: string;
      customFace?: string | null;
      uid?: string | null;
      userName?: string;
      isGuest?: boolean;
    }
  | {
      t: 'match_start';
      p1Char: CharacterId;
      p2Char: CharacterId;
      stageId: StageId;
      p1Name?: string;
      p1Face?: string | null;
      p2Name?: string;
      p2Face?: string | null;
      matchId?: string;
      startedAt?: number;
      p1Uid?: string | null;
      p1UserName?: string;
      p1IsGuest?: boolean;
      p2Uid?: string | null;
      p2UserName?: string;
      p2IsGuest?: boolean;
    }
  | {
      t: 'hit';
      dmg: number;
      chip: number;
      hitstun: number;
      blockstun: number;
      hitstop: number;
      kbx: number;
      kby: number;
      kd: boolean;
      height: AttackHeight;
      ix: number;
      iy: number;
      superGain: number;
    }
  | { t: 'hp_sync'; hp: number; blocked: boolean; combo: number; sm: number; st: FighterActionState }
  | {
      t: 'proj';
      type: Projectile['type'];
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      g: number;
      r: number;
      dmg: number;
      chip: number;
      hitstun: number;
      hitstop: number;
      kbx: number;
      kby: number;
      kd: boolean;
      height: AttackHeight;
      bounces: number;
      maxLife: number;
    }
  | {
      t: 'round';
      phase: RoundPhase;
      num: number;
      timer: number;
      banner: string;
      sub: string;
      p1Wins: number;
      p2Wins: number;
      winner: 0 | 1 | 2;
    }
  | { t: 'rematch_req' }
  | { t: 'bye' }
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number };

export interface RemoteInterpTarget {
  seq: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  f: 1 | -1;
  s: FighterActionState;
  m: MoveId | null;
  mt: number;
  wp: number;
  hp: number;
  sm: number;
  fs: CharacterFsmStatus;
  hasData: boolean;
}

export function createRemoteTarget(): RemoteInterpTarget {
  return {
    seq: -1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    f: -1,
    s: 'idle',
    m: null,
    mt: 0,
    wp: 0,
    hp: 100,
    sm: 0,
    fs: 'normal',
    hasData: false,
  };
}

export function applyRemotePacketToTarget(
  target: RemoteInterpTarget,
  pkt: NetStatePacket
): boolean {
  if (pkt.seq < target.seq && target.seq - pkt.seq < 1000) {
    return false;
  }
  target.seq = pkt.seq;
  target.x = pkt.x;
  target.y = pkt.y;
  target.vx = pkt.vx;
  target.vy = pkt.vy;
  target.f = pkt.f;
  target.s = pkt.s;
  target.m = pkt.m;
  target.mt = pkt.mt;
  target.wp = pkt.wp;
  target.hp = pkt.hp;
  target.sm = pkt.sm;
  target.fs = pkt.fs ?? 'normal';
  target.hasData = true;
  return true;
}

export function interpolateRemoteFighter(
  fighter: FighterRuntime,
  target: RemoteInterpTarget,
  dt: number
): void {
  if (!target.hasData) return;

  const dist = Math.hypot(target.x - fighter.x, target.y - fighter.y);
  if (dist > 220) {
    fighter.x = target.x;
    fighter.y = target.y;
  } else {
    fighter.x = damp(fighter.x, target.x, 24, dt);
    fighter.y = damp(fighter.y, target.y, 24, dt);
  }
  fighter.vx = target.vx;
  fighter.vy = target.vy;
  fighter.facing = target.f;
  fighter.state = target.s;
  fighter.walkPhase = target.wp;
  fighter.superMeter = clamp(target.sm, 0, 100);
  fighter.charFsmStatus = target.fs;
  fighter.animTime += dt;
  fighter.hitFlashTimer = Math.max(0, fighter.hitFlashTimer - dt);

  if (fighter.trailHp > fighter.hp) {
    fighter.trailHp = Math.max(fighter.hp, fighter.trailHp - dt * 36);
  } else {
    fighter.trailHp = fighter.hp;
  }

  fighter.squashX += (1 - fighter.squashX) * (1 - Math.exp(-16 * dt));
  fighter.squashY += (1 - fighter.squashY) * (1 - Math.exp(-16 * dt));

  if (target.m) {
    const spec = CHARACTERS[fighter.charId];
    fighter.currentMove = spec.moves[target.m];
    fighter.moveTimer = target.mt;
  } else {
    fighter.currentMove = null;
    fighter.moveTimer = 0;
  }
}

export type PeerConnectionStatus =
  | 'idle'
  | 'initializing'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'disconnected';

export interface PeerSessionCallbacks {
  onStatusChange: (
    status: PeerConnectionStatus,
    detail: string,
    roomCode: string,
    roomName: string
  ) => void;
  onRoomsUpdate: (rooms: PublicRoomInfo[]) => void;
  onReliableMessage: (msg: NetReliablePacket) => void;
  onStatePacket: (pkt: NetStatePacket) => void;
  onPingUpdate: (pingMs: number) => void;
  onDisconnect: () => void;
}

function sanitizeRoomProfile(profile?: RoomFighterProfile | null): RoomFighterProfile | null {
  if (!profile) return null;
  return {
    charId: profile.charId,
    name: sanitizeCharacterName(profile.name) || CHARACTERS[profile.charId].name,
    faceBase64: isValidFaceDataUrl(profile.faceBase64) ? profile.faceBase64 : null,
    uid: typeof profile.uid === 'string' && profile.uid ? profile.uid : null,
    userName:
      typeof profile.userName === 'string' && profile.userName.trim()
        ? profile.userName.trim().slice(0, 32)
        : undefined,
    isGuest: profile.isGuest === true || !profile.uid,
  };
}

export class PeerSessionManager {
  private role: OnlineRole = 'host';
  private roomCode = '';
  private roomName = '';
  private status: PeerConnectionStatus = 'idle';
  private callbacks: PeerSessionCallbacks;
  private rooms: PublicRoomInfo[] = [];
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private roomsUnsub: Unsubscribe | null = null;
  private pingTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private connectTimeoutTimer: number | null = null;
  private pingMs = 0;
  private manualClosing = false;
  private lastRemoteActivityAt = 0;

  constructor(callbacks: PeerSessionCallbacks) {
    this.callbacks = callbacks;
  }

  public getRole(): OnlineRole {
    return this.role;
  }

  public getRoomCode(): string {
    return this.roomCode;
  }

  public getRoomName(): string {
    return this.roomName;
  }

  public getStatus(): PeerConnectionStatus {
    return this.status;
  }

  public getPing(): number {
    return this.pingMs;
  }

  public getRooms(): PublicRoomInfo[] {
    return this.rooms;
  }

  public isServerAvailable(): boolean {
    return true;
  }

  public isSocketOpen(): boolean {
    return Boolean(this.roomsUnsub !== null);
  }

  private setStatus(status: PeerConnectionStatus, detail: string): void {
    this.status = status;
    this.callbacks.onStatusChange(status, detail, this.roomCode, this.roomName);
  }

  public connectLobby(): void {
    this.manualClosing = false;
    if (this.roomsUnsub) {
      return;
    }

    try {
      const roomsRef = ref(rtdb, 'rooms');
      this.roomsUnsub = onValue(
        roomsRef,
        (snapshot) => {
          const list: PublicRoomInfo[] = [];
          const val = snapshot.val() as Record<string, unknown> | null;
          const now = Date.now();
          if (val && typeof val === 'object') {
            for (const key of Object.keys(val)) {
              const r = val[key] as Record<string, unknown> | undefined;
              if (!r || typeof r !== 'object') continue;
              const createdAt = typeof r.createdAt === 'number' ? r.createdAt : now;
              const lastActive = typeof r.lastActive === 'number' ? r.lastActive : createdAt;

              // Aturan Retensi 7 Hari: hapus permanen room tidak aktif > 7 hari (604.800.000 ms)
              if (isRoomExpired(lastActive, now)) {
                remove(ref(rtdb, `rooms/${key}`)).catch(() => {});
                continue;
              }

              const derived = deriveRoomConnectionState(r);
              const hostProf =
                r.hostProfile && typeof r.hostProfile === 'object'
                  ? (r.hostProfile as Record<string, unknown>)
                  : null;
              const creatorUid =
                typeof r.creatorUid === 'string' && r.creatorUid ? r.creatorUid : null;
              const creatorName =
                typeof r.creatorName === 'string' && r.creatorName
                  ? r.creatorName
                  : hostProf && typeof hostProf.userName === 'string' && hostProf.userName
                    ? hostProf.userName
                    : null;
              list.push({
                id: typeof r.id === 'string' && r.id ? r.id : key,
                name: typeof r.name === 'string' && r.name ? r.name : `Room ${key}`,
                status: derived.status,
                playerCount: derived.playerCount,
                hostOnline: derived.hostOnline,
                guestOnline: derived.guestOnline,
                isOnline: derived.isOnline,
                creatorUid,
                creatorName,
                createdAt,
                lastActive,
              });
            }
          }
          // Prioritaskan room ONLINE dulu (terbaru), lalu riwayat room OFFLINE (terbaru)
          list.sort((a, b) => {
            const aOn = a.isOnline ? 1 : 0;
            const bOn = b.isOnline ? 1 : 0;
            if (aOn !== bOn) return bOn - aOn;
            return (b.lastActive || b.createdAt) - (a.lastActive || a.createdAt);
          });
          this.rooms = list;
          if (
            this.roomCode &&
            this.status === 'waiting' &&
            (!val || typeof val !== 'object' || !(this.roomCode in val))
          ) {
            this.detachDeletedRoom(
              this.roomCode,
              'Room ini telah dihapus oleh pemilik atau Admin.'
            );
          }
          this.callbacks.onRoomsUpdate(this.rooms);
        },
        (err) => {
          console.warn('RTDB rooms onValue warning:', err);
        }
      );

      if (this.status === 'error' || this.status === 'idle') {
        this.setStatus('idle', 'Pilih Buat Room atau pilih room dari daftar.');
      }
    } catch (e) {
      console.error('Failed to connect lobby:', e);
      this.setStatus('error', 'Gagal menyambung ke direktori room online.');
    }
  }

  private startRoomHeartbeat(code: string): void {
    this.stopRoomHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.roomCode !== code || this.manualClosing) return;
      update(ref(rtdb, `rooms/${code}`), { lastActive: Date.now() }).catch(() => {});
    }, 25000);
  }

  private stopRoomHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private attachHostPresenceDisconnect(code: string): void {
    const roomRef = ref(rtdb, `rooms/${code}`);
    try {
      onDisconnect(roomRef)
        .update({
          hostOnline: false,
          guestOnline: false,
          status: 'offline',
          lastActive: serverTimestamp(),
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  }

  private attachGuestPresenceDisconnect(code: string): void {
    const roomRef = ref(rtdb, `rooms/${code}`);
    try {
      onDisconnect(roomRef)
        .update({
          guestOnline: false,
          guestClientId: null,
          status: 'waiting',
          lastActive: serverTimestamp(),
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  }

  private clearPresenceDisconnect(code: string): void {
    if (!code) return;
    try {
      onDisconnect(ref(rtdb, `rooms/${code}`)).cancel().catch(() => {});
    } catch {
      // ignore
    }
  }

  private markSelfOfflineOnRoom(code: string): void {
    if (!code) return;
    const roomRef = ref(rtdb, `rooms/${code}`);
    this.clearPresenceDisconnect(code);
    if (this.role === 'host') {
      update(roomRef, {
        hostOnline: false,
        guestOnline: false,
        status: 'offline',
        lastActive: Date.now(),
      }).catch(() => {});
    } else {
      update(roomRef, {
        guestOnline: false,
        guestClientId: null,
        status: 'waiting',
        lastActive: Date.now(),
      }).catch(() => {});
    }
  }

  public syncLocalRoomProfile(profile: RoomFighterProfile): void {
    if (!this.roomCode) return;
    const clean = sanitizeRoomProfile(profile);
    if (!clean) return;
    const field = this.role === 'host' ? 'hostProfile' : 'guestProfile';
    update(ref(rtdb, `rooms/${this.roomCode}`), {
      [field]: clean,
      lastActive: Date.now(),
    }).catch(() => {});
  }

  public createRoom(rawName: string, localProfile?: RoomFighterProfile | null): void {
    const checked = validateRoomName(rawName);
    if (!checked.ok) {
      this.setStatus('error', checked.error);
      return;
    }

    this.role = 'host';
    this.roomName = checked.name;
    const code = generateRoomCode();
    this.roomCode = code;
    const peerId = roomCodeToPeerId(code);
    const now = Date.now();
    const cleanProfile = sanitizeRoomProfile(localProfile);

    this.setStatus('initializing', `Membuat room "${checked.name}" (${code})...`);

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }

    const roomRef = ref(rtdb, `rooms/${code}`);

    set(roomRef, {
      id: code,
      name: checked.name,
      status: 'waiting',
      hostClientId: peerId,
      guestClientId: null,
      hostOnline: true,
      guestOnline: false,
      creatorUid: cleanProfile?.uid || null,
      creatorName: cleanProfile?.userName || null,
      hostProfile: cleanProfile,
      guestProfile: null,
      createdAt: now,
      lastActive: now,
    })
      .then(() => {
        if (this.manualClosing) return;
        this.attachHostPresenceDisconnect(code);
        this.startRoomHeartbeat(code);
        this.setStatus('waiting', `Room "${checked.name}" (${code}) ONLINE. Menunggu lawan...`);
      })
      .catch((e) => {
        console.error('RTDB set room error:', e);
        this.setStatus('error', 'Gagal mendaftarkan room ke database.');
      });

    this.openHostPeer(code, peerId, roomRef);
  }

  public async reenterOfflineRoom(
    roomId: string,
    roomNameHint = '',
    localProfile?: RoomFighterProfile | null
  ): Promise<void> {
    const cleanId = roomId.trim();
    if (!cleanId) {
      this.setStatus('error', 'Room tidak valid.');
      return;
    }

    this.role = 'host';
    this.roomCode = cleanId;
    this.roomName = roomNameHint || `Room ${cleanId}`;
    const peerId = roomCodeToPeerId(cleanId);
    const cleanProfile = sanitizeRoomProfile(localProfile);

    this.setStatus('initializing', `Membuka kembali room "${this.roomName}"...`);

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }

    try {
      const roomRef = ref(rtdb, `rooms/${cleanId}`);
      const snap = await get(roomRef);
      if (!snap.exists()) {
        this.roomCode = '';
        this.roomName = '';
        this.setStatus('error', 'Riwayat room sudah kadaluarsa (>7 hari) atau dihapus.');
        return;
      }
      const data = snap.val() as Record<string, unknown>;
      const lastActive =
        typeof data.lastActive === 'number'
          ? data.lastActive
          : typeof data.createdAt === 'number'
            ? data.createdAt
            : 0;
      if (isRoomExpired(lastActive)) {
        await remove(roomRef).catch(() => {});
        this.roomCode = '';
        this.roomName = '';
        this.setStatus('error', 'Room telah melewati batas retensi 7 hari dan dihapus.');
        return;
      }

      const derived = deriveRoomConnectionState(data);
      if (derived.isOnline) {
        // Sudah online kembali -> jika waiting, masuk sebagai guest saja
        if (derived.status === 'waiting' && !derived.guestOnline) {
          await this.joinRoom(cleanId, roomNameHint, localProfile);
          return;
        }
        this.roomCode = '';
        this.roomName = '';
        this.setStatus('error', 'Room sedang dipakai pemain lain.');
        return;
      }

      this.roomName =
        typeof data.name === 'string' && data.name ? data.name : this.roomName;

      const patch: Record<string, unknown> = {
        status: 'waiting',
        hostClientId: peerId,
        guestClientId: null,
        hostOnline: true,
        guestOnline: false,
        hostProfile: cleanProfile,
        guestProfile: null,
        lastActive: Date.now(),
      };
      if (!data.creatorUid && cleanProfile?.uid) {
        patch.creatorUid = cleanProfile.uid;
        patch.creatorName = cleanProfile.userName || null;
      }
      await update(roomRef, patch);

      if (this.manualClosing) return;
      this.attachHostPresenceDisconnect(cleanId);
      this.startRoomHeartbeat(cleanId);
      this.setStatus('waiting', `Room "${this.roomName}" kembali ONLINE. Menunggu lawan...`);
      this.openHostPeer(cleanId, peerId, roomRef);
    } catch (e) {
      console.error('Reenter room error:', e);
      this.roomCode = '';
      this.roomName = '';
      this.setStatus('error', 'Gagal membuka kembali room.');
    }
  }

  private openHostPeer(code: string, peerId: string, roomRef: ReturnType<typeof ref>): void {
    const peer = new Peer(peerId, PEER_CONFIG);
    this.peer = peer;

    peer.on('connection', (conn) => {
      if (this.manualClosing) return;
      this.conn = conn;
      this.setupConnectionHandlers();
      update(roomRef, {
        status: 'playing',
        guestClientId: conn.peer,
        guestOnline: true,
        lastActive: Date.now(),
      }).catch(() => {});
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (!this.manualClosing && this.status === 'initializing') {
        this.setStatus('error', 'Gagal inisialisasi jaringan P2P room.');
      }
    });
  }

  public async joinRoom(
    roomId: string,
    roomNameHint = '',
    localProfile?: RoomFighterProfile | null
  ): Promise<void> {
    const cleanId = roomId.trim();
    if (!cleanId) {
      this.setStatus('error', 'Pilih salah satu room aktif dari daftar.');
      return;
    }

    this.role = 'guest';
    this.roomCode = cleanId;
    this.roomName = roomNameHint;
    const cleanProfile = sanitizeRoomProfile(localProfile);

    this.setStatus('connecting', `Menghubungkan ke room "${roomNameHint || cleanId}"...`);

    if (this.connectTimeoutTimer !== null) clearTimeout(this.connectTimeoutTimer);
    this.connectTimeoutTimer = window.setTimeout(() => {
      if (this.status === 'connecting') {
        this.roomCode = '';
        this.roomName = '';
        this.setStatus('error', 'Waktu koneksi ke room habis. Coba pilih room lagi.');
      }
    }, 12000);

    try {
      const roomRef = ref(rtdb, `rooms/${cleanId}`);
      const snap = await get(roomRef);
      if (!snap.exists()) {
        this.roomCode = '';
        this.roomName = '';
        this.setStatus('error', 'Room sudah ditutup atau tidak ditemukan.');
        return;
      }
      const data = snap.val() as Record<string, unknown>;
      const derived = deriveRoomConnectionState(data);
      if (!data || !derived.isOnline || derived.status !== 'waiting' || derived.guestOnline) {
        this.roomCode = '';
        this.roomName = '';
        this.setStatus('error', 'Room sudah penuh, sedang bertanding, atau sedang offline.');
        return;
      }

      if (this.peer) {
        try {
          this.peer.destroy();
        } catch {
          // ignore
        }
        this.peer = null;
      }

      const guestPeer = new Peer(PEER_CONFIG);
      this.peer = guestPeer;

      guestPeer.on('open', async () => {
        if (this.manualClosing) return;
        try {
          await update(roomRef, {
            status: 'playing',
            guestClientId: guestPeer.id,
            guestOnline: true,
            guestProfile: cleanProfile,
            lastActive: Date.now(),
          });
          this.attachGuestPresenceDisconnect(cleanId);
          this.startRoomHeartbeat(cleanId);
        } catch (e) {
          console.error('Failed to update guestClientId:', e);
        }
        const hostPeerId =
          typeof data.hostClientId === 'string' && data.hostClientId
            ? data.hostClientId
            : roomCodeToPeerId(cleanId);
        const conn = guestPeer.connect(hostPeerId);
        this.conn = conn;
        this.setupConnectionHandlers();
      });

      guestPeer.on('error', (err) => {
        console.error('Guest peer error:', err);
        if (!this.manualClosing && this.status === 'connecting') {
          this.setStatus('error', 'Gagal terhubung ke host room.');
        }
      });
    } catch (e) {
      console.error('Join room error:', e);
      this.roomCode = '';
      this.roomName = '';
      this.setStatus('error', 'Gagal bergabung ke room.');
    }
  }

  private setupConnectionHandlers(): void {
    const conn = this.conn;
    if (!conn) return;

    conn.on('open', () => {
      if (this.connectTimeoutTimer !== null) {
        clearTimeout(this.connectTimeoutTimer);
        this.connectTimeoutTimer = null;
      }
      this.lastRemoteActivityAt = performance.now();
      this.setStatus('connected', `Terhubung di Room "${this.roomName || this.roomCode}"!`);
      this.startPingLoop();
      this.sendReliable({ t: 'hello', role: this.role });
    });

    conn.on('data', (data: unknown) => {
      if (this.manualClosing || this.conn !== conn) return;
      this.lastRemoteActivityAt = performance.now();
      const msg = data as NetReliablePacket | NetStatePacket;
      if (!msg || typeof msg !== 'object') return;

      if (msg.t === 'bye') {
        if (!this.manualClosing) {
          this.handleUnexpectedDisconnect();
        }
        return;
      }
      if (msg.t === 'ping') {
        this.sendReliable({ t: 'pong', ts: (msg as { ts: number }).ts });
        return;
      }
      if (msg.t === 'pong') {
        const rtt = Math.max(1, Math.round(performance.now() - (msg as { ts: number }).ts));
        this.pingMs = rtt;
        this.callbacks.onPingUpdate(rtt);
        return;
      }
      if (msg.t === 'st') {
        this.callbacks.onStatePacket(msg);
      } else {
        this.callbacks.onReliableMessage(msg);
      }
    });

    conn.on('close', () => {
      if (this.conn !== conn) return;
      this.conn = null;
      if (!this.manualClosing) {
        this.handleUnexpectedDisconnect();
      }
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  }

  public cancelRoom(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.stopRoomHeartbeat();
    if (this.connectTimeoutTimer !== null) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
    const code = this.roomCode;
    if (code) {
      this.markSelfOfflineOnRoom(code);
    }
    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        // ignore
      }
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }
    this.roomCode = '';
    this.roomName = '';
    this.setStatus('idle', 'Pilih Buat Room atau pilih room dari daftar.');
  }

  public detachDeletedRoom(roomId: string, reason = 'Room berhasil dihapus.'): void {
    if (!roomId || this.roomCode !== roomId) return;
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.stopRoomHeartbeat();
    if (this.connectTimeoutTimer !== null) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
    this.clearPresenceDisconnect(roomId);
    if (this.conn) {
      try {
        this.conn.close();
      } catch {
        // ignore
      }
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // ignore
      }
      this.peer = null;
    }
    this.roomCode = '';
    this.roomName = '';
    this.setStatus('idle', reason);
  }

  private startPingLoop(): void {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.lastRemoteActivityAt = performance.now();
    this.sendReliable({ t: 'ping', ts: performance.now() });
    this.pingTimer = window.setInterval(() => {
      if (this.status === 'connected') {
        if (performance.now() - this.lastRemoteActivityAt > 6000) {
          this.handleUnexpectedDisconnect();
          return;
        }
        this.sendReliable({ t: 'ping', ts: performance.now() });
      }
    }, 1500);
  }

  private handleUnexpectedDisconnect(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.stopRoomHeartbeat();
    if (this.status === 'disconnected' || this.status === 'idle') return;
    this.setStatus('disconnected', 'LAWAN TERPUTUS');
    this.callbacks.onDisconnect();
  }

  public sendBye(): void {
    try {
      this.sendReliable({ t: 'bye' });
    } catch {
      // ignore
    }
    const code = this.roomCode;
    if (code) {
      this.markSelfOfflineOnRoom(code);
    }
  }

  public sendReliable(msg: NetReliablePacket): void {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(msg);
      } catch {
        // ignore
      }
    }
  }

  public sendUnreliable(pkt: NetStatePacket): void {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(pkt);
      } catch {
        // ignore
      }
    }
  }

  public cleanup(): void {
    this.manualClosing = true;
    if (this.roomsUnsub) {
      try {
        this.roomsUnsub();
      } catch {
        // ignore
      }
      this.roomsUnsub = null;
    }
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.stopRoomHeartbeat();
    if (this.connectTimeoutTimer !== null) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
    const code = this.roomCode;
    if (code) {
      this.markSelfOfflineOnRoom(code);
    }
    try {
      this.sendReliable({ t: 'bye' });
      this.conn?.close();
      this.peer?.destroy();
    } catch {
      // ignore
    }
    this.conn = null;
    this.peer = null;
    this.roomCode = '';
    this.roomName = '';
    this.rooms = [];
    this.status = 'idle';
  }
}
