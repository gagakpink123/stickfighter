export type RoomStatus = 'waiting' | 'playing' | 'offline';

export interface PublicRoomInfo {
  id: string;
  name: string;
  status: RoomStatus;
  playerCount: 0 | 1 | 2;
  hostOnline?: boolean;
  guestOnline?: boolean;
  isOnline?: boolean;
  creatorUid?: string | null;
  creatorName?: string | null;
  createdAt: number;
  lastActive?: number;
}

interface InternalRoom {
  id: string;
  name: string;
  normalizedKey: string;
  status: 'waiting' | 'playing';
  hostClientId: string;
  guestClientId: string | null;
  createdAt: number;
}

export const ROOM_NAME_MIN_LEN = 2;
export const ROOM_NAME_MAX_LEN = 28;

export function sanitizeRoomName(raw: string): string {
  // Collapse whitespace and strip control characters
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ROOM_NAME_MAX_LEN);
}

export function validateRoomName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = sanitizeRoomName(raw);
  if (name.length < ROOM_NAME_MIN_LEN) {
    return {
      ok: false,
      error: `Nama room minimal ${ROOM_NAME_MIN_LEN} karakter.`,
    };
  }
  return { ok: true, name };
}

function toPublicRoom(room: InternalRoom): PublicRoomInfo {
  return {
    id: room.id,
    name: room.name,
    status: room.status,
    playerCount: room.guestClientId ? 2 : 1,
    hostOnline: true,
    guestOnline: Boolean(room.guestClientId),
    isOnline: true,
    createdAt: room.createdAt,
    lastActive: room.createdAt,
  };
}

export class RoomDirectory {
  private rooms = new Map<string, InternalRoom>();
  private clientToRoom = new Map<string, string>();
  private seq = 1000;

  private nextRoomId(): string {
    for (let i = 0; i < 100; i++) {
      this.seq = (this.seq + 173) % 9000;
      const candidate = String(1000 + this.seq);
      if (!this.rooms.has(candidate)) return candidate;
    }
    return String(Date.now()).slice(-6);
  }

  public getWaitingRooms(): PublicRoomInfo[] {
    const list: PublicRoomInfo[] = [];
    for (const room of this.rooms.values()) {
      if (room.status === 'waiting' && !room.guestClientId) {
        list.push(toPublicRoom(room));
      }
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }

  public createRoom(
    hostClientId: string,
    rawName: string,
    now = Date.now()
  ): { ok: true; room: PublicRoomInfo } | { ok: false; error: string } {
    const checked = validateRoomName(rawName);
    if (!checked.ok) {
      return checked;
    }
    const normalizedKey = checked.name.toLowerCase();

    // If this client already belongs to an old waiting/active room, leave it cleanly first
    const prevRoomId = this.clientToRoom.get(hostClientId);
    if (prevRoomId) {
      this.leaveClient(hostClientId);
    }

    for (const existing of this.rooms.values()) {
      if (existing.status === 'waiting' && existing.normalizedKey === normalizedKey) {
        return {
          ok: false,
          error: `Room "${checked.name}" sudah ada di daftar aktif. Pilih nama lain.`,
        };
      }
    }

    const id = this.nextRoomId();
    const room: InternalRoom = {
      id,
      name: checked.name,
      normalizedKey,
      status: 'waiting',
      hostClientId,
      guestClientId: null,
      createdAt: now,
    };
    this.rooms.set(id, room);
    this.clientToRoom.set(hostClientId, id);
    return { ok: true, room: toPublicRoom(room) };
  }

  public joinRoom(
    guestClientId: string,
    roomId: string
  ):
    | { ok: true; room: PublicRoomInfo; hostClientId: string }
    | { ok: false; error: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { ok: false, error: 'Room sudah ditutup atau tidak ditemukan.' };
    }
    if (room.hostClientId === guestClientId) {
      return { ok: false, error: 'Tidak bisa bergabung ke room milik sendiri.' };
    }
    if (room.status !== 'waiting' || room.guestClientId) {
      return { ok: false, error: `Room "${room.name}" sudah penuh.` };
    }

    const prevRoomId = this.clientToRoom.get(guestClientId);
    if (prevRoomId && prevRoomId !== roomId) {
      this.leaveClient(guestClientId);
    }

    room.guestClientId = guestClientId;
    room.status = 'playing';
    this.clientToRoom.set(guestClientId, roomId);
    return {
      ok: true,
      room: toPublicRoom(room),
      hostClientId: room.hostClientId,
    };
  }

  public getPeerClientId(clientId: string): string | null {
    const roomId = this.clientToRoom.get(clientId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.hostClientId === clientId) return room.guestClientId;
    if (room.guestClientId === clientId) return room.hostClientId;
    return null;
  }

  public getClientRoom(clientId: string): PublicRoomInfo | null {
    const roomId = this.clientToRoom.get(clientId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    return room ? toPublicRoom(room) : null;
  }

  public leaveClient(clientId: string): {
    removedRoomId: string | null;
    notifyPeerId: string | null;
    listChanged: boolean;
  } {
    const roomId = this.clientToRoom.get(clientId);
    if (!roomId) {
      return { removedRoomId: null, notifyPeerId: null, listChanged: false };
    }
    this.clientToRoom.delete(clientId);

    const room = this.rooms.get(roomId);
    if (!room) {
      return { removedRoomId: null, notifyPeerId: null, listChanged: false };
    }

    const wasWaiting = room.status === 'waiting';
    const otherPeerId =
      room.hostClientId === clientId ? room.guestClientId : room.hostClientId;

    if (otherPeerId) {
      this.clientToRoom.delete(otherPeerId);
    }
    this.rooms.delete(roomId);

    return {
      removedRoomId: roomId,
      notifyPeerId: otherPeerId || null,
      listChanged: wasWaiting,
    };
  }
}
