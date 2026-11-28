import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import {
  get,
  getDatabase,
  limitToLast,
  onValue,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
  Unsubscribe,
  update,
} from 'firebase/database';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AdminCharDraftMap,
  applyLeaderboardMatchToMap,
  buildAdminUserUpdatePayload,
  buildGuestLeaderboardKey,
  buildGuestLeaderboardName,
  canDeleteOnlineRoom,
  CustomCharacterData,
  CustomCharactersMap,
  getEffectiveUserDisplayName,
  isAdminEmail,
  isFirebasePermissionDeniedError,
  isValidFaceDataUrl,
  mergeOnlineLeaderboardEntries,
  mergeOnlineMatchHistoryRecords,
  validateAccountDeletePassword,
  MIN_USER_DISPLAY_NAME_LEN,
  OnlineLeaderboardEntry,
  OnlineMatchHistoryRecord,
  RoomChatMessage,
  sanitizeCharacterName,
  sanitizeChatMessageText,
  sanitizeCustomCharactersMap,
  sanitizeOnlineLeaderboardList,
  sanitizeOnlineMatchHistoryList,
  sanitizeSenderLabel,
  sanitizeUserDisplayName,
  sortOnlineLeaderboard,
} from './customization';
import { CHARACTERS } from './characters';
import { CharacterId, OnlineRole } from './types';

export const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const rtdb = getDatabase(firebaseApp, firebaseConfig.databaseURL || undefined);
export const firebaseAuth = getAuth(firebaseApp);

const LEADERBOARD_LOCAL_KEY = 'aff_leaderboard_fallback_v1';
const HISTORY_LOCAL_PREFIX = 'aff_match_history_';
let rtdbLeaderboardDenied = false;
let rtdbHistoryDenied = false;
let warnedLeaderboardFallback = false;
let warnedHistoryFallback = false;

function readLocalLeaderboardMap(): Record<string, OnlineLeaderboardEntry> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(LEADERBOARD_LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    const sanitized = sanitizeOnlineLeaderboardList(parsed);
    const map: Record<string, OnlineLeaderboardEntry> = {};
    for (const entry of sanitized) {
      map[entry.key] = entry;
    }
    return map;
  } catch {
    return {};
  }
}

function writeLocalLeaderboardMap(map: Record<string, OnlineLeaderboardEntry>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(LEADERBOARD_LOCAL_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

function cacheLeaderboardEntriesLocal(entries: OnlineLeaderboardEntry[]): void {
  if (entries.length === 0) return;
  const current = Object.values(readLocalLeaderboardMap());
  const merged = mergeOnlineLeaderboardEntries(entries, current);
  const map: Record<string, OnlineLeaderboardEntry> = {};
  for (const e of merged) {
    map[e.key] = e;
  }
  writeLocalLeaderboardMap(map);
}

async function fetchServerLeaderboardEntries(): Promise<OnlineLeaderboardEntry[]> {
  if (typeof fetch !== 'function') return [];
  try {
    const res = await fetch('/api/leaderboard1v1', { method: 'GET' });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: unknown };
    const list = Array.isArray(data?.entries) ? data.entries : [];
    const byKey: Record<string, unknown> = {};
    for (const item of list) {
      if (item && typeof item === 'object' && 'key' in item) {
        const k = String((item as { key?: unknown }).key || '').trim();
        if (k) byKey[k] = item;
      }
    }
    const sanitized = sanitizeOnlineLeaderboardList(byKey);
    cacheLeaderboardEntriesLocal(sanitized);
    return sanitized;
  } catch {
    return [];
  }
}

async function postServerLeaderboardRecord(params: {
  matchId: string;
  localSlot: 1 | 2;
  won: boolean;
  uid: string | null;
  displayName: string;
  charName: string;
}): Promise<void> {
  if (typeof fetch !== 'function') return;
  try {
    const res = await fetch('/api/leaderboard1v1/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { entries?: unknown };
    const list = Array.isArray(data?.entries) ? data.entries : [];
    const byKey: Record<string, unknown> = {};
    for (const item of list) {
      if (item && typeof item === 'object' && 'key' in item) {
        const k = String((item as { key?: unknown }).key || '').trim();
        if (k) byKey[k] = item;
      }
    }
    cacheLeaderboardEntriesLocal(sanitizeOnlineLeaderboardList(byKey));
  } catch {
    // ignore offline/static host fetch errors
  }
}

async function postServerLeaderboardSyncName(uid: string, displayName: string): Promise<void> {
  if (typeof fetch !== 'function') return;
  try {
    await fetch('/api/leaderboard1v1/sync-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, displayName }),
    });
  } catch {
    // ignore
  }
}

async function deleteServerLeaderboardUid(uid: string): Promise<void> {
  if (typeof fetch !== 'function') return;
  try {
    await fetch(`/api/leaderboard1v1/${encodeURIComponent(uid)}`, { method: 'DELETE' });
  } catch {
    // ignore
  }
}

function readLocalMatchHistory(uid: string): OnlineMatchHistoryRecord[] {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return [];
  try {
    const raw = window.localStorage.getItem(`${HISTORY_LOCAL_PREFIX}${uid}_v1`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeOnlineMatchHistoryList(parsed);
  } catch {
    return [];
  }
}

function writeLocalMatchHistory(uid: string, records: OnlineMatchHistoryRecord[]): void {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return;
  try {
    const map: Record<string, OnlineMatchHistoryRecord> = {};
    for (const rec of records.slice(0, 60)) {
      map[rec.matchId] = rec;
    }
    window.localStorage.setItem(`${HISTORY_LOCAL_PREFIX}${uid}_v1`, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function removeLocalMatchHistory(uid: string): void {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return;
  try {
    window.localStorage.removeItem(`${HISTORY_LOCAL_PREFIX}${uid}_v1`);
  } catch {
    // ignore
  }
}

export interface AuthSessionState {
  uid: string;
  email: string;
  displayName: string;
  isBlocked: boolean;
  isAdmin: boolean;
  customCharacters: CustomCharactersMap;
}

export interface AdminUserRecord {
  uid: string;
  email: string;
  displayName: string;
  isBlocked: boolean;
  createdAt: number;
  lastSeen: number;
  customCount: number;
  customCharacters: CustomCharactersMap;
}

export function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Format email tidak valid.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email atau password salah.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah terdaftar. Silakan Login atau Lupa Password.';
    case 'auth/weak-password':
      return 'Password minimal 6 karakter.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Coba lagi beberapa saat.';
    case 'auth/network-request-failed':
      return 'Koneksi internet bermasalah. Periksa jaringan Anda.';
    case 'auth/operation-not-allowed':
      return 'Login Email/Password belum diaktifkan di Firebase Console.';
    default:
      if (err instanceof Error && err.message) {
        return err.message;
      }
      return 'Terjadi kesalahan autentikasi.';
  }
}

async function ensureAndReadUserProfile(user: User): Promise<AuthSessionState> {
  const email = user.email || '';
  const userRef = ref(rtdb, `users/${user.uid}`);
  const snap = await get(userRef);
  const now = Date.now();

  if (!snap.exists()) {
    const defaultDisplayName = getEffectiveUserDisplayName(null, email);
    const initial = {
      email,
      displayName: defaultDisplayName,
      isBlocked: false,
      createdAt: now,
      lastSeen: now,
    };
    await set(userRef, initial);
    return {
      uid: user.uid,
      email,
      displayName: defaultDisplayName,
      isBlocked: false,
      isAdmin: isAdminEmail(email),
      customCharacters: {},
    };
  }

  const val = snap.val() as Record<string, unknown>;
  const isBlocked = val.isBlocked === true;
  const effectiveEmail = typeof val.email === 'string' && val.email ? val.email : email;
  const displayName = getEffectiveUserDisplayName(
    typeof val.displayName === 'string' ? val.displayName : null,
    effectiveEmail
  );
  if (!isBlocked) {
    const patch: Record<string, unknown> = { lastSeen: now };
    if (typeof val.displayName !== 'string' || !val.displayName.trim()) {
      patch.displayName = displayName;
    }
    await update(userRef, patch).catch(() => {});
  }
  const customCharacters = sanitizeCustomCharactersMap(val.customCharacters);
  return {
    uid: user.uid,
    email: effectiveEmail,
    displayName,
    isBlocked,
    isAdmin: isAdminEmail(email),
    customCharacters,
  };
}

export function subscribeAuthSession(
  onSession: (session: AuthSessionState | null) => void,
  onBlocked: (email: string) => void
): () => void {
  let userProfileUnsub: Unsubscribe | null = null;

  const authUnsub = onAuthStateChanged(firebaseAuth, async (user) => {
    if (userProfileUnsub) {
      userProfileUnsub();
      userProfileUnsub = null;
    }

    if (!user) {
      onSession(null);
      return;
    }

    try {
      const profile = await ensureAndReadUserProfile(user);
      if (profile.isBlocked) {
        await signOut(firebaseAuth).catch(() => {});
        onSession(null);
        onBlocked(profile.email || user.email || '');
        return;
      }

      onSession(profile);

      // Keep displayName, customCharacters and isBlocked synced in real-time while logged in
      const userRef = ref(rtdb, `users/${user.uid}`);
      userProfileUnsub = onValue(userRef, async (snap) => {
        if (!snap.exists()) return;
        const val = snap.val() as Record<string, unknown>;
        if (val.isBlocked === true) {
          await signOut(firebaseAuth).catch(() => {});
          onSession(null);
          onBlocked(typeof val.email === 'string' ? val.email : user.email || '');
          return;
        }
        const effectiveEmail =
          typeof val.email === 'string' && val.email ? val.email : user.email || '';
        onSession({
          uid: user.uid,
          email: effectiveEmail,
          displayName: getEffectiveUserDisplayName(
            typeof val.displayName === 'string' ? val.displayName : null,
            effectiveEmail
          ),
          isBlocked: false,
          isAdmin: isAdminEmail(user.email),
          customCharacters: sanitizeCustomCharactersMap(val.customCharacters),
        });
      });
    } catch (e) {
      if (isFirebasePermissionDeniedError(e)) {
        console.warn('Auth profile RTDB sync permission denied; using basic auth profile.');
      } else {
        console.warn('Auth profile sync warning:', e);
      }
      const fallbackEmail = user.email || '';
      onSession({
        uid: user.uid,
        email: fallbackEmail,
        displayName: getEffectiveUserDisplayName(null, fallbackEmail),
        isBlocked: false,
        isAdmin: isAdminEmail(user.email),
        customCharacters: {},
      });
    }
  });

  return () => {
    if (userProfileUnsub) userProfileUnsub();
    authUnsub();
  };
}

export async function loginWithEmail(email: string, password: string): Promise<AuthSessionState> {
  const cleanEmail = email.trim();
  const cred = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password);
  const profile = await ensureAndReadUserProfile(cred.user);
  if (profile.isBlocked) {
    await signOut(firebaseAuth).catch(() => {});
    const blockedErr = new Error(
      `Akun (${profile.email}) telah diblokir oleh Administrator.`
    ) as Error & { isBlocked?: boolean };
    blockedErr.isBlocked = true;
    throw blockedErr;
  }
  return profile;
}

export async function registerWithEmail(email: string, password: string): Promise<AuthSessionState> {
  const cleanEmail = email.trim();
  const cred = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password);
  const profile = await ensureAndReadUserProfile(cred.user);
  return profile;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth, email.trim());
}

export async function logoutAccount(): Promise<void> {
  await signOut(firebaseAuth);
}

export async function updateUserDisplayName(uid: string, rawName: string): Promise<string> {
  const clean = sanitizeUserDisplayName(rawName);
  if (clean.length < MIN_USER_DISPLAY_NAME_LEN) {
    throw new Error(`Nama user minimal ${MIN_USER_DISPLAY_NAME_LEN} karakter.`);
  }
  const now = Date.now();
  await update(ref(rtdb, `users/${uid}`), {
    displayName: clean,
    lastSeen: now,
  });

  // Automatically sync updated display name onto local/server fallback and RTDB leaderboard entry if present
  const localMap = readLocalLeaderboardMap();
  if (localMap[uid]) {
    localMap[uid] = {
      ...localMap[uid],
      name: clean,
      updatedAt: now,
    };
    writeLocalLeaderboardMap(localMap);
  }
  void postServerLeaderboardSyncName(uid, clean);

  if (!rtdbLeaderboardDenied) {
    try {
      const lbRef = ref(rtdb, `leaderboard1v1/${uid}`);
      const lbSnap = await get(lbRef);
      if (lbSnap.exists()) {
        await update(lbRef, {
          name: clean,
          updatedAt: now,
        });
      }
    } catch (e) {
      if (isFirebasePermissionDeniedError(e)) {
        rtdbLeaderboardDenied = true;
      } else {
        console.warn('Leaderboard name sync warning:', e);
      }
    }
  }

  return clean;
}

export async function saveUserOnlineMatchHistory(
  uid: string,
  record: OnlineMatchHistoryRecord
): Promise<void> {
  const localExisting = readLocalMatchHistory(uid);
  const mergedLocal = mergeOnlineMatchHistoryRecords([record], localExisting);
  writeLocalMatchHistory(uid, mergedLocal);

  if (rtdbHistoryDenied) return;
  try {
    const matchRef = ref(rtdb, `users/${uid}/matchHistory1v1/${record.matchId}`);
    const existing = await get(matchRef);
    if (existing.exists()) return;
    await set(matchRef, record);
  } catch (err) {
    if (isFirebasePermissionDeniedError(err)) {
      rtdbHistoryDenied = true;
      if (!warnedHistoryFallback) {
        warnedHistoryFallback = true;
        console.warn('RTDB matchHistory1v1 permission denied; using local match history cache.');
      }
      return;
    }
    console.warn('RTDB saveUserOnlineMatchHistory warning:', err);
  }
}

export function subscribeUserOnlineMatchHistory(
  uid: string,
  onHistory: (records: OnlineMatchHistoryRecord[]) => void
): Unsubscribe {
  let localRecords = readLocalMatchHistory(uid);
  let rtdbRecords: OnlineMatchHistoryRecord[] = [];
  onHistory(localRecords);

  const histQuery = query(ref(rtdb, `users/${uid}/matchHistory1v1`), limitToLast(60));
  return onValue(
    histQuery,
    (snap) => {
      rtdbHistoryDenied = false;
      rtdbRecords = sanitizeOnlineMatchHistoryList(snap.val());
      const merged = mergeOnlineMatchHistoryRecords(rtdbRecords, localRecords);
      localRecords = merged;
      writeLocalMatchHistory(uid, merged);
      onHistory(merged);
    },
    (err) => {
      if (isFirebasePermissionDeniedError(err)) {
        rtdbHistoryDenied = true;
        if (!warnedHistoryFallback) {
          warnedHistoryFallback = true;
          console.warn('RTDB matchHistory1v1 permission denied; using local match history cache.');
        }
      } else {
        console.warn('RTDB matchHistory1v1 warning:', err);
      }
      onHistory(readLocalMatchHistory(uid));
    }
  );
}

export function subscribeOnlineLeaderboard(
  onEntries: (entries: OnlineLeaderboardEntry[]) => void,
  onModeChange?: (info: { usingFallback: boolean }) => void
): Unsubscribe {
  let closed = false;
  let rtdbEntries: OnlineLeaderboardEntry[] = [];
  let fallbackEntries: OnlineLeaderboardEntry[] = sortOnlineLeaderboard(
    Object.values(readLocalLeaderboardMap())
  );
  let pollTimer: number | null = null;

  const emit = () => {
    if (closed) return;
    onEntries(mergeOnlineLeaderboardEntries(rtdbEntries, fallbackEntries));
  };

  const refreshFallback = async () => {
    const serverEntries = await fetchServerLeaderboardEntries();
    if (closed) return;
    const localEntries = Object.values(readLocalLeaderboardMap());
    fallbackEntries = mergeOnlineLeaderboardEntries(serverEntries, localEntries);
    emit();
  };

  emit();
  void refreshFallback();

  const startFallbackPolling = () => {
    if (pollTimer !== null || typeof window === 'undefined') return;
    pollTimer = window.setInterval(() => {
      if (closed) return;
      void refreshFallback();
    }, 8000);
  };

  if (rtdbLeaderboardDenied) {
    onModeChange?.({ usingFallback: true });
    startFallbackPolling();
  }

  const lbRef = ref(rtdb, 'leaderboard1v1');
  const unsubRtdb = onValue(
    lbRef,
    (snap) => {
      rtdbLeaderboardDenied = false;
      rtdbEntries = sanitizeOnlineLeaderboardList(snap.val());
      cacheLeaderboardEntriesLocal(rtdbEntries);
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      onModeChange?.({ usingFallback: false });
      emit();
    },
    (err) => {
      if (isFirebasePermissionDeniedError(err)) {
        rtdbLeaderboardDenied = true;
        if (!warnedLeaderboardFallback) {
          warnedLeaderboardFallback = true;
          console.warn(
            'RTDB leaderboard1v1 permission denied; falling back to app server leaderboard.'
          );
        }
        onModeChange?.({ usingFallback: true });
        void refreshFallback();
        startFallbackPolling();
        return;
      }
      console.warn('RTDB leaderboard1v1 warning:', err);
      onModeChange?.({ usingFallback: true });
      void refreshFallback();
    }
  );

  return () => {
    closed = true;
    unsubRtdb();
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

export async function recordOnlineLeaderboardMatchResult(params: {
  matchId: string;
  localSlot: 1 | 2;
  won: boolean;
  uid: string | null;
  displayName: string;
  charName: string;
}): Promise<void> {
  const now = Date.now();

  // Always update local cache + app server endpoint so leaderboard works even if RTDB rules aren't published yet
  const updatedLocal = applyLeaderboardMatchToMap(readLocalLeaderboardMap(), {
    ...params,
    now,
  });
  writeLocalLeaderboardMap(updatedLocal);
  await postServerLeaderboardRecord(params);

  if (rtdbLeaderboardDenied) return;

  try {
    if (params.uid) {
      const entryRef = ref(rtdb, `leaderboard1v1/${params.uid}`);
      const cleanName = sanitizeUserDisplayName(params.displayName) || 'Pemain';
      await runTransaction(entryRef, (current) => {
        if (current && typeof current === 'object') {
          const rec = current as Record<string, unknown>;
          if (rec.lastRecordedMatchId === params.matchId) {
            return current;
          }
          const prevWins = typeof rec.wins === 'number' ? rec.wins : 0;
          const prevLosses = typeof rec.losses === 'number' ? rec.losses : 0;
          const prevMatches = typeof rec.matches === 'number' ? rec.matches : prevWins + prevLosses;
          return {
            key: params.uid,
            isGuest: false,
            uid: params.uid,
            name: cleanName,
            wins: prevWins + (params.won ? 1 : 0),
            losses: prevLosses + (params.won ? 0 : 1),
            matches: prevMatches + 1,
            lastMatchAt: now,
            updatedAt: now,
            lastRecordedMatchId: params.matchId,
          };
        }
        return {
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
      });
      return;
    }

    // Guest rule: strictly recorded 1 time per match
    const guestKey = buildGuestLeaderboardKey(params.matchId, params.localSlot);
    const guestRef = ref(rtdb, `leaderboard1v1/${guestKey}`);
    const snap = await get(guestRef);
    if (snap.exists()) return;
    await set(guestRef, {
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
    });
  } catch (err) {
    if (isFirebasePermissionDeniedError(err)) {
      rtdbLeaderboardDenied = true;
      if (!warnedLeaderboardFallback) {
        warnedLeaderboardFallback = true;
        console.warn(
          'RTDB leaderboard1v1 write permission denied; saved to app server leaderboard.'
        );
      }
      return;
    }
    console.warn('RTDB leaderboard1v1 write warning:', err);
  }
}

export async function saveCustomCharacterToDb(
  uid: string,
  charId: CharacterId,
  name: string,
  faceBase64: string | null
): Promise<CustomCharacterData> {
  const cleanName = sanitizeCharacterName(name) || CHARACTERS[charId].name;
  const payload: CustomCharacterData = {
    name: cleanName,
    faceBase64: isValidFaceDataUrl(faceBase64) ? faceBase64 : null,
    updatedAt: Date.now(),
  };
  await set(ref(rtdb, `users/${uid}/customCharacters/${charId}`), payload);
  return payload;
}

export async function resetCustomCharacterInDb(uid: string, charId: CharacterId): Promise<void> {
  await remove(ref(rtdb, `users/${uid}/customCharacters/${charId}`));
}

export function subscribeAllUsersForAdmin(
  onUsers: (users: AdminUserRecord[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const usersRef = ref(rtdb, 'users');
  return onValue(
    usersRef,
    (snap) => {
      const list: AdminUserRecord[] = [];
      const val = snap.val() as Record<string, unknown> | null;
      if (val && typeof val === 'object') {
        for (const uid of Object.keys(val)) {
          const rec = val[uid] as Record<string, unknown> | undefined;
          if (!rec || typeof rec !== 'object') continue;
          const customCharacters = sanitizeCustomCharactersMap(rec.customCharacters);
          const customCount = Object.keys(customCharacters).length;
          const createdAt = typeof rec.createdAt === 'number' ? rec.createdAt : 0;
          const lastSeen = typeof rec.lastSeen === 'number' ? rec.lastSeen : 0;
          const email = typeof rec.email === 'string' ? rec.email : uid;
          const displayName = getEffectiveUserDisplayName(
            typeof rec.displayName === 'string' ? rec.displayName : null,
            email
          );
          list.push({
            uid,
            email,
            displayName,
            isBlocked: rec.isBlocked === true,
            createdAt,
            lastSeen,
            customCount,
            customCharacters,
          });
        }
      }
      list.sort((a, b) => (b.lastSeen || b.createdAt) - (a.lastSeen || a.createdAt));
      onUsers(list);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export async function setUserBlockedStatus(targetUid: string, isBlocked: boolean): Promise<void> {
  await update(ref(rtdb, `users/${targetUid}`), { isBlocked });
}

export async function adminUpdateUserAccount(
  targetUid: string,
  targetEmail: string,
  isBlocked: boolean,
  draftChars: AdminCharDraftMap
): Promise<void> {
  const updates = buildAdminUserUpdatePayload(targetEmail, isBlocked, draftChars);
  await update(ref(rtdb, `users/${targetUid}`), updates);
}

export function subscribeRoomMessages(
  roomCode: string,
  onMessages: (messages: RoomChatMessage[]) => void
): Unsubscribe {
  const cleanRoom = roomCode.trim();
  const msgQuery = query(ref(rtdb, `rooms/${cleanRoom}/messages`), limitToLast(45));
  return onValue(msgQuery, (snap) => {
    const out: RoomChatMessage[] = [];
    const val = snap.val() as Record<string, unknown> | null;
    if (val && typeof val === 'object') {
      for (const id of Object.keys(val)) {
        const rec = val[id] as Record<string, unknown> | undefined;
        if (!rec || typeof rec !== 'object') continue;
        const text = sanitizeChatMessageText(typeof rec.text === 'string' ? rec.text : '');
        if (!text) continue;
        const roleRaw = rec.senderRole;
        const senderRole: OnlineRole | 'guest' =
          roleRaw === 'host' || roleRaw === 'guest' ? roleRaw : 'guest';
        out.push({
          id,
          senderName: sanitizeSenderLabel(
            typeof rec.senderName === 'string' ? rec.senderName : 'PEMAIN'
          ),
          senderRole,
          uid: typeof rec.uid === 'string' ? rec.uid : null,
          text,
          createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : 0,
        });
      }
    }
    out.sort((a, b) => a.createdAt - b.createdAt);
    onMessages(out);
  });
}

export async function sendRoomMessage(
  roomCode: string,
  input: {
    senderName: string;
    senderRole: OnlineRole | 'guest';
    uid?: string | null;
    text: string;
  }
): Promise<boolean> {
  const cleanText = sanitizeChatMessageText(input.text);
  if (!cleanText || !roomCode.trim()) return false;
  await push(ref(rtdb, `rooms/${roomCode.trim()}/messages`), {
    senderName: sanitizeSenderLabel(input.senderName),
    senderRole: input.senderRole,
    uid: input.uid || null,
    text: cleanText,
    createdAt: Date.now(),
  });
  return true;
}

export async function deleteOnlineRoomInDb(
  roomId: string,
  requester: { uid: string | null; isAdmin: boolean }
): Promise<void> {
  const cleanId = roomId.trim();
  if (!cleanId) throw new Error('ID room tidak valid.');
  const roomRef = ref(rtdb, `rooms/${cleanId}`);
  const snap = await get(roomRef);
  if (!snap.exists()) return;
  const val = snap.val() as Record<string, unknown> | null;
  const creatorUid =
    val && typeof val.creatorUid === 'string' && val.creatorUid ? val.creatorUid : null;
  if (!canDeleteOnlineRoom({ creatorUid }, requester)) {
    throw new Error('Anda tidak memiliki izin untuk menghapus room ini.');
  }
  await remove(roomRef);
}

export async function deleteOwnAccountAndHistory(password: string): Promise<void> {
  const check = validateAccountDeletePassword(password);
  if (!check.ok) {
    throw new Error(check.error);
  }
  const user = firebaseAuth.currentUser;
  if (!user || !user.email) {
    throw new Error('Sesi akun tidak ditemukan. Silakan login ulang.');
  }
  const uid = user.uid;
  const credential = EmailAuthProvider.credential(user.email, check.password);
  await reauthenticateWithCredential(user, credential);

  // 1. Remove user's leaderboard entry first (RTDB, server fallback, and local cache)
  const localLbMap = readLocalLeaderboardMap();
  if (localLbMap[uid]) {
    delete localLbMap[uid];
    writeLocalLeaderboardMap(localLbMap);
  }
  removeLocalMatchHistory(uid);
  await deleteServerLeaderboardUid(uid);
  await remove(ref(rtdb, `leaderboard1v1/${uid}`)).catch(() => {});

  // 2. Remove any public rooms created by this user
  try {
    const roomsSnap = await get(ref(rtdb, 'rooms'));
    if (roomsSnap.exists()) {
      const roomsVal = roomsSnap.val() as Record<string, unknown> | null;
      if (roomsVal && typeof roomsVal === 'object') {
        const removals: Promise<void>[] = [];
        for (const roomId of Object.keys(roomsVal)) {
          const rec = roomsVal[roomId] as Record<string, unknown> | undefined;
          if (rec && rec.creatorUid === uid) {
            removals.push(remove(ref(rtdb, `rooms/${roomId}`)).catch(() => {}));
          }
        }
        await Promise.all(removals);
      }
    }
  } catch {
    // ignore room cleanup error and continue account deletion
  }

  // 3. Remove user profile, custom characters, and all 1v1 match history
  await remove(ref(rtdb, `users/${uid}`));

  // 4. Delete Firebase Auth account so user can register again from scratch
  await deleteUser(user);
}

