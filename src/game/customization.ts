import { CHARACTERS, CHARACTER_ORDER } from './characters';
import { FACE_MASK_PATHS } from './settings';
import { CharacterId, OnlineRole, StageId } from './types';

export const ADMIN_EMAIL = 'adnanjogja@gmail.com';
export const ROOM_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 604,800,000 ms (7 hari)

export const MIN_CHARACTER_NAME_LEN = 2;
export const MAX_CHARACTER_NAME_LEN = 22;
export const MIN_USER_DISPLAY_NAME_LEN = 2;
export const MAX_USER_DISPLAY_NAME_LEN = 24;
export const MAX_FACE_DATA_URL_BYTES = 25 * 1024; // 25 KB target per karakter
export const MAX_FACE_DB_CHARS = 35000;

export const CROP_OUTPUT_WIDTH = 160;
export const CROP_OUTPUT_HEIGHT = 200;
export const CROP_GUIDE_LABELS = {
  eye: 'MATA',
  nose: 'HIDUNG',
} as const;

export const CHAT_MESSAGE_MAX_LEN = 140;

export interface CustomCharacterData {
  name: string;
  faceBase64?: string | null;
  updatedAt?: number;
}

export type CustomCharactersMap = Partial<Record<CharacterId, CustomCharacterData>>;

export interface RoomFighterProfile {
  charId: CharacterId;
  name: string;
  faceBase64?: string | null;
  uid?: string | null;
  userName?: string;
  isGuest?: boolean;
}

export interface RoomChatMessage {
  id: string;
  senderName: string;
  senderRole: OnlineRole | 'guest';
  uid?: string | null;
  text: string;
  createdAt: number;
}

export interface OnlineMatchHistoryRecord {
  matchId: string;
  roomId: string;
  roomName: string;
  playedAt: number;
  durationMs: number;
  result: 'win' | 'loss';
  myName: string;
  myCharId: CharacterId;
  myCharName: string;
  myRoundsWon: number;
  opponentUid: string | null;
  opponentName: string;
  opponentIsGuest: boolean;
  opponentCharId: CharacterId;
  opponentCharName: string;
  opponentRoundsWon: number;
  stageId: StageId;
}

export interface OnlineLeaderboardEntry {
  key: string;
  isGuest: boolean;
  uid: string | null;
  name: string;
  wins: number;
  losses: number;
  matches: number;
  lastMatchAt: number;
  updatedAt: number;
  lastRecordedMatchId?: string;
}

export const MIN_CROP_ROTATION_DEG = -45;
export const MAX_CROP_ROTATION_DEG = 45;

export interface CropTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg?: number;
}

export function clampCropRotationDeg(deg: unknown): number {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return 0;
  return Math.max(MIN_CROP_ROTATION_DEG, Math.min(MAX_CROP_ROTATION_DEG, Math.round(deg)));
}

export function cropRotationDegToRad(deg: unknown): number {
  return (clampCropRotationDeg(deg) * Math.PI) / 180;
}

export function formatCropTiltLabel(deg: unknown): string {
  const clamped = clampCropRotationDeg(deg);
  return clamped > 0 ? `+${clamped}°` : `${clamped}°`;
}

export function isAdminEmail(email?: string | null): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL;
}

export function sanitizeCharacterName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARACTER_NAME_LEN);
}

export function validateCharacterName(raw: string, fallback: string): string {
  const clean = sanitizeCharacterName(raw);
  return clean.length >= MIN_CHARACTER_NAME_LEN ? clean : fallback;
}

export function isValidFaceDataUrl(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  if (val.length > MAX_FACE_DB_CHARS) return false;
  return /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(val);
}

export function estimateDataUrlBytes(dataUrl: string): number {
  return new TextEncoder().encode(dataUrl).length;
}

export function getEffectiveCharacterName(
  charId: CharacterId,
  customChars?: CustomCharactersMap | null,
  overrideName?: string | null
): string {
  if (typeof overrideName === 'string') {
    const cleanOverride = sanitizeCharacterName(overrideName);
    if (cleanOverride.length >= MIN_CHARACTER_NAME_LEN) {
      return cleanOverride;
    }
  }
  const custom = customChars?.[charId];
  if (custom && typeof custom.name === 'string') {
    const cleanCustom = sanitizeCharacterName(custom.name);
    if (cleanCustom.length >= MIN_CHARACTER_NAME_LEN) {
      return cleanCustom;
    }
  }
  return CHARACTERS[charId].name;
}

export function getEffectiveCharacterFaceSrc(
  charId: CharacterId,
  customChars?: CustomCharactersMap | null,
  overrideFace?: string | null
): string {
  if (isValidFaceDataUrl(overrideFace)) {
    return overrideFace;
  }
  const custom = customChars?.[charId];
  if (custom && isValidFaceDataUrl(custom.faceBase64)) {
    return custom.faceBase64;
  }
  return FACE_MASK_PATHS[charId];
}

export function getCustomFaceOverride(
  charId: CharacterId,
  customChars?: CustomCharactersMap | null
): string | null {
  const custom = customChars?.[charId];
  return custom && isValidFaceDataUrl(custom.faceBase64) ? custom.faceBase64 : null;
}

export function sanitizeCustomCharactersMap(raw: unknown): CustomCharactersMap {
  const result: CustomCharactersMap = {};
  if (!raw || typeof raw !== 'object') return result;
  const obj = raw as Record<string, unknown>;
  for (const id of CHARACTER_ORDER) {
    const entry = obj[id];
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const name = validateCharacterName(
      typeof rec.name === 'string' ? rec.name : '',
      CHARACTERS[id].name
    );
    const faceBase64 = isValidFaceDataUrl(rec.faceBase64) ? rec.faceBase64 : null;
    const updatedAt = typeof rec.updatedAt === 'number' ? rec.updatedAt : Date.now();
    if (name !== CHARACTERS[id].name || faceBase64) {
      result[id] = { name, faceBase64, updatedAt };
    }
  }
  return result;
}

export function isRoomExpired(lastActive: number, now = Date.now()): boolean {
  if (!Number.isFinite(lastActive) || lastActive <= 0) return true;
  return now - lastActive > ROOM_RETENTION_MS;
}

export function deriveRoomConnectionState(raw: {
  hostOnline?: unknown;
  guestOnline?: unknown;
  status?: unknown;
}): {
  isOnline: boolean;
  hostOnline: boolean;
  guestOnline: boolean;
  playerCount: 0 | 1 | 2;
  status: 'waiting' | 'playing' | 'offline';
} {
  const hostOnline = raw.hostOnline === true;
  const guestOnline = raw.guestOnline === true;
  const playerCount = ((hostOnline ? 1 : 0) + (guestOnline ? 1 : 0)) as 0 | 1 | 2;
  const isOnline = playerCount > 0;
  let status: 'waiting' | 'playing' | 'offline' = 'offline';
  if (isOnline) {
    status = guestOnline || raw.status === 'playing' ? 'playing' : 'waiting';
  }
  return { isOnline, hostOnline, guestOnline, playerCount, status };
}

export function formatRelativeRoomTime(lastActive: number, now = Date.now()): string {
  const diff = Math.max(0, now - lastActive);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'BARU SAJA';
  if (mins < 60) return `${mins} MENIT LALU`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} JAM LALU`;
  const days = Math.floor(hours / 24);
  return `${days} HARI LALU`;
}

export function sanitizeChatMessageText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MESSAGE_MAX_LEN);
}

export function sanitizeSenderLabel(raw: string): string {
  const clean = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
  return clean || 'PEMAIN';
}

export function computeCoverFitScale(
  imgW: number,
  imgH: number,
  targetW: number,
  targetH: number
): number {
  if (imgW <= 0 || imgH <= 0) return 1;
  return Math.max(targetW / imgW, targetH / imgH);
}

export function getOvalCropBounds(width: number, height: number): {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
} {
  return {
    cx: width * 0.5,
    cy: height * 0.5,
    rx: width * 0.44,
    ry: height * 0.46,
  };
}

export function renderCropCanvasPreview(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  img: HTMLImageElement | null,
  transform: CropTransform
): void {
  ctx.clearRect(0, 0, width, height);

  // Subtle checkerboard outside & backdrop so transparency is obvious
  const tile = 14;
  for (let y = 0; y < height; y += tile) {
    for (let x = 0; x < width; x += tile) {
      const even = ((x / tile) + (y / tile)) % 2 === 0;
      ctx.fillStyle = even ? '#F5F5F5' : '#E2E2E2';
      ctx.fillRect(x, y, tile, tile);
    }
  }

  const { cx, cy, rx, ry } = getOvalCropBounds(width, height);

  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const rotRad = cropRotationDegToRad(transform.rotationDeg);

    // Draw dimmed full photo behind mask so user can pan & tilt comfortably
    ctx.save();
    ctx.translate(cx + transform.offsetX, cy + transform.offsetY);
    if (rotRad !== 0) ctx.rotate(rotRad);
    ctx.scale(transform.scale, transform.scale);
    ctx.globalAlpha = 0.28;
    ctx.drawImage(img, -img.naturalWidth * 0.5, -img.naturalHeight * 0.5);
    ctx.restore();

    // Draw full-opacity photo strictly inside oval mask
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.01)';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(cx + transform.offsetX, cy + transform.offsetY);
    if (rotRad !== 0) ctx.rotate(rotRad);
    ctx.scale(transform.scale, transform.scale);
    ctx.drawImage(img, -img.naturalWidth * 0.5, -img.naturalHeight * 0.5);
    ctx.restore();
  }

  // Dark vignette outside oval
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(17, 17, 17, 0.52)';
  ctx.fill();
  ctx.restore();

  // Crisp oval frame border
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Clip overlay guide lines inside the oval
  ctx.clip();

  // 1. Vertical center axis
  ctx.beginPath();
  ctx.setLineDash([5, 4]);
  ctx.moveTo(cx, cy - ry);
  ctx.lineTo(cx, cy + ry);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy - ry);
  ctx.lineTo(cx, cy + ry);
  ctx.strokeStyle = '#FF0000';
  ctx.lineWidth = 1.25;
  ctx.stroke();

  // 2. Horizontal Eye guide line (MATA)
  const eyeY = cy - ry * 0.14;
  ctx.beginPath();
  ctx.moveTo(cx - rx, eyeY);
  ctx.lineTo(cx + rx, eyeY);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - rx, eyeY);
  ctx.lineTo(cx + rx, eyeY);
  ctx.strokeStyle = '#FF0000';
  ctx.lineWidth = 1.25;
  ctx.stroke();

  // 3. Horizontal Nose guide line (HIDUNG)
  const noseY = cy + ry * 0.34;
  ctx.beginPath();
  ctx.moveTo(cx - rx, noseY);
  ctx.lineTo(cx + rx, noseY);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - rx, noseY);
  ctx.lineTo(cx + rx, noseY);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1.25;
  ctx.stroke();

  // Guide labels inside oval
  ctx.setLineDash([]);
  ctx.font = 'bold 10px monospace';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';

  const drawTag = (label: string, tx: number, ty: number, bg: string) => {
    const padX = 4;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = bg;
    ctx.fillRect(tx, ty - 12, tw + padX * 2, 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, tx + padX, ty - 1);
  };

  drawTag(CROP_GUIDE_LABELS.eye, cx - rx + 14, eyeY - 2, '#FF0000');
  drawTag(CROP_GUIDE_LABELS.nose, cx - rx + 18, noseY - 2, '#111111');

  ctx.restore();
}

export function exportOvalCroppedFaceDataUrl(
  img: HTMLImageElement,
  transform: CropTransform,
  previewWidth: number,
  previewHeight: number
): string {
  const attemptEncode = (outW: number, outH: number, mime: 'image/webp' | 'image/png', quality?: number): string => {
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.clearRect(0, 0, outW, outH);
    const { cx, cy, rx, ry } = getOvalCropBounds(outW, outH);
    const ratioX = outW / Math.max(1, previewWidth);
    const ratioY = outH / Math.max(1, previewHeight);
    const ratio = (ratioX + ratioY) * 0.5;

    const rotRad = cropRotationDegToRad(transform.rotationDeg);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx + transform.offsetX * ratioX, cy + transform.offsetY * ratioY);
    if (rotRad !== 0) ctx.rotate(rotRad);
    ctx.scale(transform.scale * ratio, transform.scale * ratio);
    ctx.drawImage(img, -img.naturalWidth * 0.5, -img.naturalHeight * 0.5);
    ctx.restore();

    return quality !== undefined ? canvas.toDataURL(mime, quality) : canvas.toDataURL(mime);
  };

  // Prefer transparent WebP compressed <= 25 KB (max 160x200)
  const webpProbe = attemptEncode(CROP_OUTPUT_WIDTH, CROP_OUTPUT_HEIGHT, 'image/webp', 0.84);
  if (webpProbe.startsWith('data:image/webp')) {
    for (const q of [0.84, 0.72, 0.6, 0.48, 0.36]) {
      const out = attemptEncode(CROP_OUTPUT_WIDTH, CROP_OUTPUT_HEIGHT, 'image/webp', q);
      if (out.length <= MAX_FACE_DATA_URL_BYTES) return out;
    }
    for (const q of [0.65, 0.48, 0.34]) {
      const out = attemptEncode(128, 160, 'image/webp', q);
      if (out.length <= MAX_FACE_DATA_URL_BYTES) return out;
    }
    return attemptEncode(112, 140, 'image/webp', 0.4);
  }

  // Transparent PNG fallback if browser does not support WebP canvas encoding
  for (const [w, h] of [
    [CROP_OUTPUT_WIDTH, CROP_OUTPUT_HEIGHT],
    [128, 160],
    [96, 120],
    [80, 100],
  ] as const) {
    const out = attemptEncode(w, h, 'image/png');
    if (out.length <= MAX_FACE_DATA_URL_BYTES) return out;
  }
  return attemptEncode(72, 90, 'image/png');
}

export function autoFitOvalFaceDataUrl(img: HTMLImageElement): string {
  const scale = computeCoverFitScale(
    img.naturalWidth,
    img.naturalHeight,
    CROP_OUTPUT_WIDTH,
    CROP_OUTPUT_HEIGHT
  );
  return exportOvalCroppedFaceDataUrl(
    img,
    { scale, offsetX: 0, offsetY: 0 },
    CROP_OUTPUT_WIDTH,
    CROP_OUTPUT_HEIGHT
  );
}

export interface AdminUserSummaryLike {
  uid: string;
  email: string;
}

export function filterAdminUsers<T extends AdminUserSummaryLike>(
  users: T[],
  searchQuery: string
): T[] {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return users;
  return users.filter(
    (u) => u.email.toLowerCase().includes(q) || u.uid.toLowerCase().includes(q)
  );
}

export interface AdminCharDraftEntry {
  name: string;
  faceBase64: string | null;
}

export type AdminCharDraftMap = Record<CharacterId, AdminCharDraftEntry>;

export function createAdminCharDraftMap(
  customCharacters?: CustomCharactersMap | null
): AdminCharDraftMap {
  return {
    adnan: {
      name: getEffectiveCharacterName('adnan', customCharacters),
      faceBase64: getCustomFaceOverride('adnan', customCharacters),
    },
    tika: {
      name: getEffectiveCharacterName('tika', customCharacters),
      faceBase64: getCustomFaceOverride('tika', customCharacters),
    },
    dhira: {
      name: getEffectiveCharacterName('dhira', customCharacters),
      faceBase64: getCustomFaceOverride('dhira', customCharacters),
    },
    iyen: {
      name: getEffectiveCharacterName('iyen', customCharacters),
      faceBase64: getCustomFaceOverride('iyen', customCharacters),
    },
  };
}

export function buildAdminUserUpdatePayload(
  targetEmail: string,
  isBlocked: boolean,
  draftChars: AdminCharDraftMap,
  now = Date.now()
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    isBlocked: isAdminEmail(targetEmail) ? false : Boolean(isBlocked),
  };

  for (const charId of CHARACTER_ORDER) {
    const entry = draftChars[charId];
    const cleanName = validateCharacterName(entry?.name || '', CHARACTERS[charId].name);
    const cleanFace = isValidFaceDataUrl(entry?.faceBase64) ? entry.faceBase64 : null;

    if (cleanName === CHARACTERS[charId].name && !cleanFace) {
      updates[`customCharacters/${charId}`] = null;
    } else {
      updates[`customCharacters/${charId}`] = {
        name: cleanName,
        faceBase64: cleanFace,
        updatedAt: now,
      };
    }
  }

  return updates;
}

export function formatAdminTimestamp(ts?: number | null): string {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) {
    return 'Belum tercatat';
  }
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
  }
}

export function sanitizeUserDisplayName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_USER_DISPLAY_NAME_LEN);
}

export function deriveDefaultUserDisplayName(email?: string | null): string {
  if (typeof email === 'string' && email.trim()) {
    const local = email.trim().split('@')[0] || '';
    const clean = sanitizeUserDisplayName(local.replace(/[._-]+/g, ' '));
    if (clean.length >= MIN_USER_DISPLAY_NAME_LEN) {
      return clean;
    }
  }
  return 'Pemain';
}

export function getEffectiveUserDisplayName(
  displayName?: string | null,
  email?: string | null
): string {
  if (typeof displayName === 'string') {
    const clean = sanitizeUserDisplayName(displayName);
    if (clean.length >= MIN_USER_DISPLAY_NAME_LEN) {
      return clean;
    }
  }
  return deriveDefaultUserDisplayName(email);
}

export function formatMatchDuration(durationMs: number): string {
  const totalSec = Math.max(1, Math.round((Number.isFinite(durationMs) ? durationMs : 0) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins <= 0) return `${secs} detik`;
  return `${mins}m ${String(secs).padStart(2, '0')}d`;
}

export function createOnlineMatchId(
  roomCode: string,
  timestamp = Date.now(),
  suffix?: string
): string {
  const safeRoom = roomCode.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12) || 'room';
  const tsPart = Math.max(0, Math.floor(timestamp)).toString(36);
  const randPart =
    (suffix || Math.random().toString(36).slice(2, 7))
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 8) || 'match';
  return `m_${safeRoom}_${tsPart}_${randPart}`;
}

export function buildGuestLeaderboardKey(matchId: string, localSlot: 1 | 2): string {
  const safeMatch = matchId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 54) || 'match';
  return `guest_${safeMatch}_${localSlot}`;
}

export function buildGuestLeaderboardName(charName?: string | null): string {
  const cleanChar = typeof charName === 'string' ? sanitizeCharacterName(charName) : '';
  if (!cleanChar) return 'Guest';
  const shortChar = cleanChar.slice(0, 22);
  return `Guest (${shortChar})`.slice(0, 32);
}

function isValidCharacterId(val: unknown): val is CharacterId {
  return val === 'adnan' || val === 'tika' || val === 'dhira' || val === 'iyen';
}

function isValidStageId(val: unknown): val is StageId {
  return (
    val === 'living_room' ||
    val === 'dojo' ||
    val === 'park' ||
    val === 'kitchen' ||
    val === 'rooftop' ||
    val === 'library' ||
    val === 'simpang_lima_gumul' ||
    val === 'jembatan_brawijaya'
  );
}

export function sanitizeOnlineMatchHistoryList(raw: unknown): OnlineMatchHistoryRecord[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const list: OnlineMatchHistoryRecord[] = [];
  for (const key of Object.keys(obj)) {
    const rec = obj[key] as Record<string, unknown> | undefined;
    if (!rec || typeof rec !== 'object') continue;
    const matchId = typeof rec.matchId === 'string' && rec.matchId ? rec.matchId : key;
    const roomName =
      typeof rec.roomName === 'string' && rec.roomName.trim()
        ? rec.roomName.trim().slice(0, 32)
        : 'Room Online';
    const playedAt = typeof rec.playedAt === 'number' && Number.isFinite(rec.playedAt) ? rec.playedAt : 0;
    const durationMs =
      typeof rec.durationMs === 'number' && Number.isFinite(rec.durationMs)
        ? Math.max(1000, rec.durationMs)
        : 1000;
    const result = rec.result === 'win' ? 'win' : rec.result === 'loss' ? 'loss' : null;
    if (!result) continue;

    const myCharId: CharacterId = isValidCharacterId(rec.myCharId) ? rec.myCharId : 'adnan';
    const opponentCharId: CharacterId = isValidCharacterId(rec.opponentCharId)
      ? rec.opponentCharId
      : 'tika';
    const stageId: StageId = isValidStageId(rec.stageId) ? rec.stageId : 'living_room';

    list.push({
      matchId,
      roomId: typeof rec.roomId === 'string' ? rec.roomId : '',
      roomName,
      playedAt,
      durationMs,
      result,
      myName:
        typeof rec.myName === 'string' && rec.myName.trim()
          ? rec.myName.trim().slice(0, 32)
          : 'Pemain',
      myCharId,
      myCharName:
        typeof rec.myCharName === 'string' && rec.myCharName.trim()
          ? rec.myCharName.trim().slice(0, 22)
          : CHARACTERS[myCharId].name,
      myRoundsWon: typeof rec.myRoundsWon === 'number' ? Math.max(0, Math.round(rec.myRoundsWon)) : 0,
      opponentUid: typeof rec.opponentUid === 'string' && rec.opponentUid ? rec.opponentUid : null,
      opponentName:
        typeof rec.opponentName === 'string' && rec.opponentName.trim()
          ? rec.opponentName.trim().slice(0, 32)
          : 'Guest',
      opponentIsGuest: rec.opponentIsGuest === true || !rec.opponentUid,
      opponentCharId,
      opponentCharName:
        typeof rec.opponentCharName === 'string' && rec.opponentCharName.trim()
          ? rec.opponentCharName.trim().slice(0, 22)
          : CHARACTERS[opponentCharId].name,
      opponentRoundsWon:
        typeof rec.opponentRoundsWon === 'number'
          ? Math.max(0, Math.round(rec.opponentRoundsWon))
          : 0,
      stageId,
    });
  }
  list.sort((a, b) => b.playedAt - a.playedAt);
  return list;
}

export function computeUserMatchStats(records: OnlineMatchHistoryRecord[]): {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
} {
  const total = records.length;
  let wins = 0;
  let losses = 0;
  for (const r of records) {
    if (r.result === 'win') wins += 1;
    else losses += 1;
  }
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  return { total, wins, losses, winRate };
}

export function computeLeaderboardWinRate(entry: { wins: number; matches: number }): number {
  if (!entry.matches || entry.matches <= 0) return 0;
  return Math.round((entry.wins / entry.matches) * 100);
}

export function sortOnlineLeaderboard(entries: OnlineLeaderboardEntry[]): OnlineLeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const rateA = a.wins / Math.max(1, a.matches);
    const rateB = b.wins / Math.max(1, b.matches);
    if (Math.abs(rateB - rateA) > 0.0001) return rateB - rateA;
    if (b.matches !== a.matches) return b.matches - a.matches;
    const tsA = a.lastMatchAt || a.updatedAt || 0;
    const tsB = b.lastMatchAt || b.updatedAt || 0;
    if (tsB !== tsA) return tsB - tsA;
    return a.name.localeCompare(b.name, 'id');
  });
}

export function sanitizeOnlineLeaderboardList(raw: unknown): OnlineLeaderboardEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const out: OnlineLeaderboardEntry[] = [];
  for (const key of Object.keys(obj)) {
    const rec = obj[key] as Record<string, unknown> | undefined;
    if (!rec || typeof rec !== 'object') continue;
    const isGuest = rec.isGuest === true || key.startsWith('guest_');
    const uid = !isGuest && typeof rec.uid === 'string' && rec.uid ? rec.uid : isGuest ? null : key;
    const rawName = typeof rec.name === 'string' ? rec.name.trim() : '';
    const name = rawName ? rawName.slice(0, 32) : isGuest ? 'Guest' : 'Pemain';
    const wins = typeof rec.wins === 'number' && Number.isFinite(rec.wins) ? Math.max(0, Math.round(rec.wins)) : 0;
    const losses =
      typeof rec.losses === 'number' && Number.isFinite(rec.losses) ? Math.max(0, Math.round(rec.losses)) : 0;
    const matchesRaw =
      typeof rec.matches === 'number' && Number.isFinite(rec.matches)
        ? Math.max(1, Math.round(rec.matches))
        : Math.max(1, wins + losses);
    const updatedAt = typeof rec.updatedAt === 'number' && Number.isFinite(rec.updatedAt) ? rec.updatedAt : 0;
    const lastMatchAt =
      typeof rec.lastMatchAt === 'number' && Number.isFinite(rec.lastMatchAt) ? rec.lastMatchAt : updatedAt;

    out.push({
      key,
      isGuest,
      uid,
      name,
      wins: isGuest ? Math.min(1, wins) : wins,
      losses: isGuest ? Math.min(1, losses) : losses,
      matches: isGuest ? 1 : matchesRaw,
      lastMatchAt,
      updatedAt,
      lastRecordedMatchId:
        typeof rec.lastRecordedMatchId === 'string' ? rec.lastRecordedMatchId : undefined,
    });
  }
  return sortOnlineLeaderboard(out);
}

export const ACCOUNT_DELETE_WARNING_TEXT =
  'PERINGATAN: Semua riwayat pertandingan Online 1v1, nama & foto wajah karakter kustom, peringkat Anda, room yang Anda buat, dan data akun akan dihapus PERMANEN dan TIDAK DAPAT DIKEMBALIKAN. Setelah terhapus, Anda dapat mendaftar akun baru lagi dari awal.';

export function canDeleteOnlineRoom(
  room: { creatorUid?: string | null } | null | undefined,
  session: { uid?: string | null; isAdmin?: boolean } | null | undefined
): boolean {
  if (!room || !session) return false;
  if (session.isAdmin === true) return true;
  if (typeof session.uid === 'string' && session.uid && typeof room.creatorUid === 'string' && room.creatorUid) {
    return session.uid === room.creatorUid;
  }
  return false;
}

export function validateAccountDeletePassword(
  rawPassword: string
): { ok: true; password: string } | { ok: false; error: string } {
  if (typeof rawPassword !== 'string' || rawPassword.length === 0) {
    return {
      ok: false,
      error: 'Masukkan password akun Anda saat ini untuk mengonfirmasi penghapusan permanen.',
    };
  }
  return { ok: true, password: rawPassword };
}

export function isFirebasePermissionDeniedError(err: unknown): boolean {
  if (!err) return false;
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '').toLowerCase()
      : '';
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    code.includes('permission_denied') ||
    code.includes('permission-denied') ||
    msg.includes('permission_denied') ||
    msg.includes('permission-denied') ||
    msg.includes('permission denied')
  );
}

export function applyLeaderboardMatchToMap(
  currentMap: Record<string, OnlineLeaderboardEntry>,
  params: {
    matchId: string;
    localSlot: 1 | 2;
    won: boolean;
    uid: string | null;
    displayName: string;
    charName: string;
    now?: number;
  }
): Record<string, OnlineLeaderboardEntry> {
  const now = typeof params.now === 'number' && Number.isFinite(params.now) ? params.now : Date.now();
  const next = { ...currentMap };

  if (params.uid) {
    const existing = next[params.uid];
    const cleanName = sanitizeUserDisplayName(params.displayName) || 'Pemain';
    if (existing) {
      if (existing.lastRecordedMatchId === params.matchId) {
        return next;
      }
      next[params.uid] = {
        key: params.uid,
        isGuest: false,
        uid: params.uid,
        name: cleanName,
        wins: existing.wins + (params.won ? 1 : 0),
        losses: existing.losses + (params.won ? 0 : 1),
        matches: existing.matches + 1,
        lastMatchAt: now,
        updatedAt: now,
        lastRecordedMatchId: params.matchId,
      };
    } else {
      next[params.uid] = {
        key: params.uid,
        isGuest: false,
        uid: params.uid,
        name: cleanName,
        wins: params.won ? 1 : 0,
        losses: params.won ? 0 : 1,
        matches: 1,
        lastMatchAt: now,
        updatedAt: now,
        lastRecordedMatchId: params.matchId,
      };
    }
    return next;
  }

  const guestKey = buildGuestLeaderboardKey(params.matchId, params.localSlot);
  if (next[guestKey]) return next;
  next[guestKey] = {
    key: guestKey,
    isGuest: true,
    uid: null,
    name: buildGuestLeaderboardName(params.charName),
    wins: params.won ? 1 : 0,
    losses: params.won ? 0 : 1,
    matches: 1,
    lastMatchAt: now,
    updatedAt: now,
    lastRecordedMatchId: params.matchId,
  };
  return next;
}

export function mergeOnlineLeaderboardEntries(
  primary: OnlineLeaderboardEntry[],
  fallback: OnlineLeaderboardEntry[]
): OnlineLeaderboardEntry[] {
  const byKey = new Map<string, OnlineLeaderboardEntry>();
  for (const entry of fallback) {
    byKey.set(entry.key, entry);
  }
  for (const entry of primary) {
    const prev = byKey.get(entry.key);
    if (!prev || entry.matches >= prev.matches || entry.updatedAt >= prev.updatedAt) {
      byKey.set(entry.key, entry);
    }
  }
  return sortOnlineLeaderboard(Array.from(byKey.values()));
}

export function mergeOnlineMatchHistoryRecords(
  primary: OnlineMatchHistoryRecord[],
  fallback: OnlineMatchHistoryRecord[]
): OnlineMatchHistoryRecord[] {
  const byId = new Map<string, OnlineMatchHistoryRecord>();
  for (const rec of fallback) {
    byId.set(rec.matchId, rec);
  }
  for (const rec of primary) {
    byId.set(rec.matchId, rec);
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => b.playedAt - a.playedAt);
  return merged;
}

