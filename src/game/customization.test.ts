import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_DELETE_WARNING_TEXT,
  ADMIN_EMAIL,
  CROP_GUIDE_LABELS,
  MAX_CROP_ROTATION_DEG,
  MIN_CROP_ROTATION_DEG,
  ROOM_RETENTION_MS,
  applyLeaderboardMatchToMap,
  buildAdminUserUpdatePayload,
  buildGuestLeaderboardKey,
  buildGuestLeaderboardName,
  canDeleteOnlineRoom,
  clampCropRotationDeg,
  computeCoverFitScale,
  computeLeaderboardWinRate,
  computeUserMatchStats,
  createAdminCharDraftMap,
  createOnlineMatchId,
  cropRotationDegToRad,
  deriveDefaultUserDisplayName,
  deriveRoomConnectionState,
  estimateDataUrlBytes,
  filterAdminUsers,
  formatAdminTimestamp,
  formatCropTiltLabel,
  formatMatchDuration,
  getCustomFaceOverride,
  getEffectiveCharacterFaceSrc,
  getEffectiveCharacterName,
  getEffectiveUserDisplayName,
  getOvalCropBounds,
  isAdminEmail,
  isFirebasePermissionDeniedError,
  isRoomExpired,
  isValidFaceDataUrl,
  mergeOnlineLeaderboardEntries,
  mergeOnlineMatchHistoryRecords,
  sanitizeCharacterName,
  sanitizeChatMessageText,
  sanitizeCustomCharactersMap,
  sanitizeOnlineLeaderboardList,
  sanitizeOnlineMatchHistoryList,
  sanitizeSenderLabel,
  sanitizeUserDisplayName,
  sortOnlineLeaderboard,
  validateAccountDeletePassword,
  validateCharacterName,
} from './customization';
import { getHudFacePortraitSpec } from './settings';
import { CHARACTERS } from './characters';

test('Admin email detection strictly matches adnanjogja@gmail.com (case-insensitive trimmed)', () => {
  assert.equal(ADMIN_EMAIL, 'adnanjogja@gmail.com');
  assert.equal(isAdminEmail('adnanjogja@gmail.com'), true);
  assert.equal(isAdminEmail('  AdnanJogja@GMAIL.com '), true);
  assert.equal(isAdminEmail('other@gmail.com'), false);
  assert.equal(isAdminEmail(null), false);
  assert.equal(isAdminEmail(undefined), false);
});

test('Character name sanitization & validation preserves safe names and falls back properly', () => {
  assert.equal(sanitizeCharacterName('  Papa   Adnan\n\t '), 'Papa Adnan');
  assert.equal(validateCharacterName('A', 'Ayah Adnan'), 'Ayah Adnan');
  assert.equal(validateCharacterName('Budi Santoso', 'Ayah Adnan'), 'Budi Santoso');
  assert.ok(sanitizeCharacterName('X'.repeat(40)).length <= 22);
});

test('Base64 face data URL validation accepts lightweight compressed PNG/WebP/JPEG only', () => {
  const validWebp = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
  assert.equal(isValidFaceDataUrl(validWebp), true);
  assert.equal(isValidFaceDataUrl(validPng), true);
  assert.equal(isValidFaceDataUrl('javascript:alert(1)'), false);
  assert.equal(isValidFaceDataUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isValidFaceDataUrl('data:image/png;base64,' + 'A'.repeat(40000)), false);
  assert.ok(estimateDataUrlBytes(validWebp) < 25 * 1024);
});

test('Effective character name and face portrait resolve overrides cleanly', () => {
  const validFace = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const customMap = sanitizeCustomCharactersMap({
    adnan: { name: 'Papa Hebat', faceBase64: validFace, updatedAt: 1000 },
    tika: { name: 'X', faceBase64: 'bad-url', updatedAt: 1000 },
  });

  assert.equal(getEffectiveCharacterName('adnan', customMap), 'Papa Hebat');
  assert.equal(getEffectiveCharacterName('adnan', customMap, 'Lawan Custom'), 'Lawan Custom');
  assert.equal(getEffectiveCharacterName('tika', customMap), CHARACTERS.tika.name);

  assert.equal(getCustomFaceOverride('adnan', customMap), validFace);
  assert.equal(getCustomFaceOverride('tika', customMap), null);
  assert.equal(getEffectiveCharacterFaceSrc('adnan', customMap), validFace);
  assert.ok(getEffectiveCharacterFaceSrc('tika', customMap).endsWith('.png'));

  // Default faceMaskEnabled=false never exposes HUD portrait even with override
  assert.equal(getHudFacePortraitSpec('adnan', false, validFace), null);
  // Enabled faceMaskEnabled=true uses custom Base64 override when valid
  const hudSpec = getHudFacePortraitSpec('adnan', true, validFace);
  assert.ok(hudSpec !== null);
  assert.equal(hudSpec.src, validFace);
});

test('Room 7-day retention rule (604,800,000 ms) and Online/Offline connection state derivation', () => {
  assert.equal(ROOM_RETENTION_MS, 7 * 24 * 60 * 60 * 1000);
  const now = 1_750_000_000_000;
  assert.equal(isRoomExpired(now - ROOM_RETENTION_MS + 1000, now), false);
  assert.equal(isRoomExpired(now - ROOM_RETENTION_MS, now), false);
  assert.equal(isRoomExpired(now - ROOM_RETENTION_MS - 1, now), true);
  assert.equal(isRoomExpired(0, now), true);

  const waiting = deriveRoomConnectionState({ hostOnline: true, guestOnline: false, status: 'waiting' });
  assert.deepEqual(waiting, {
    isOnline: true,
    hostOnline: true,
    guestOnline: false,
    playerCount: 1,
    status: 'waiting',
  });

  const playing = deriveRoomConnectionState({ hostOnline: true, guestOnline: true, status: 'waiting' });
  assert.deepEqual(playing, {
    isOnline: true,
    hostOnline: true,
    guestOnline: true,
    playerCount: 2,
    status: 'playing',
  });

  const offline = deriveRoomConnectionState({ hostOnline: false, guestOnline: false, status: 'offline' });
  assert.deepEqual(offline, {
    isOnline: false,
    hostOnline: false,
    guestOnline: false,
    playerCount: 0,
    status: 'offline',
  });
});

test('Chat text sanitization & oval cropper math preserve invariants', () => {
  assert.equal(sanitizeChatMessageText('  Halo\nSemua!  '), 'Halo Semua!');
  assert.equal(sanitizeChatMessageText('   '), '');
  assert.ok(sanitizeChatMessageText('z'.repeat(300)).length === 140);
  assert.equal(sanitizeSenderLabel('  '), 'PEMAIN');

  const bounds = getOvalCropBounds(240, 300);
  assert.equal(bounds.cx, 120);
  assert.equal(bounds.cy, 150);
  assert.ok(bounds.rx > 0 && bounds.ry > 0);
  assert.equal(computeCoverFitScale(400, 200, 240, 300), 1.5);
});

test('Admin user search filters accurately by email or UID', () => {
  const sample = [
    { uid: 'uid-alpha-01', email: 'budi@example.com' },
    { uid: 'uid-beta-99', email: 'sari@jogja.id' },
    { uid: 'uid-gamma-77', email: 'adnanjogja@gmail.com' },
  ];
  assert.equal(filterAdminUsers(sample, '').length, 3);
  assert.equal(filterAdminUsers(sample, 'BUDI').length, 1);
  assert.equal(filterAdminUsers(sample, 'beta-99')[0]?.email, 'sari@jogja.id');
  assert.equal(filterAdminUsers(sample, 'tidak-ada').length, 0);
});

test('Admin draft creation and RTDB update payload handle edits, default resets, and self-admin protection', () => {
  const validFace = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const draft = createAdminCharDraftMap({
    adnan: { name: 'Ayah Hebat', faceBase64: validFace, updatedAt: 1000 },
  });

  assert.equal(draft.adnan.name, 'Ayah Hebat');
  assert.equal(draft.adnan.faceBase64, validFace);
  assert.equal(draft.tika.name, CHARACTERS.tika.name);
  assert.equal(draft.tika.faceBase64, null);

  // Admin edits Adnan name, resets Adnan face to default, sets custom Dhira name
  draft.adnan.name = CHARACTERS.adnan.name;
  draft.adnan.faceBase64 = null;
  draft.dhira.name = 'Dhira Juara';

  const payload = buildAdminUserUpdatePayload('player@example.com', true, draft, 9999);
  assert.equal(payload.isBlocked, true);
  assert.equal(payload['customCharacters/adnan'], null);
  assert.equal(payload['customCharacters/tika'], null);
  assert.deepEqual(payload['customCharacters/dhira'], {
    name: 'Dhira Juara',
    faceBase64: null,
    updatedAt: 9999,
  });

  // Self-admin cannot be marked blocked in payload
  const selfPayload = buildAdminUserUpdatePayload(ADMIN_EMAIL, true, draft, 9999);
  assert.equal(selfPayload.isBlocked, false);
  assert.equal(formatAdminTimestamp(0), 'Belum tercatat');
  assert.notEqual(formatAdminTimestamp(1750000000000), 'Belum tercatat');
});

test('Oval face cropper tilt rotation clamps [-45, 45], converts radians, and formats labels', () => {
  assert.equal(MIN_CROP_ROTATION_DEG, -45);
  assert.equal(MAX_CROP_ROTATION_DEG, 45);
  assert.equal(clampCropRotationDeg(-120), -45);
  assert.equal(clampCropRotationDeg(120), 45);
  assert.equal(clampCropRotationDeg(undefined), 0);
  assert.equal(clampCropRotationDeg(Number.NaN), 0);
  assert.equal(clampCropRotationDeg(-14.6), -15);
  assert.equal(clampCropRotationDeg(18.2), 18);

  assert.ok(Math.abs(cropRotationDegToRad(45) - Math.PI / 4) < 1e-9);
  assert.ok(Math.abs(cropRotationDegToRad(-45) + Math.PI / 4) < 1e-9);
  assert.equal(cropRotationDegToRad(0), 0);

  assert.equal(formatCropTiltLabel(-15), '-15°');
  assert.equal(formatCropTiltLabel(0), '0°');
  assert.equal(formatCropTiltLabel(15), '+15°');
  assert.deepEqual(CROP_GUIDE_LABELS, { eye: 'MATA', nose: 'HIDUNG' });
});

test('User display name helpers, match duration, and Online 1v1 match IDs normalize cleanly', () => {
  assert.equal(sanitizeUserDisplayName('  Budi\n  Santoso  '), 'Budi Santoso');
  assert.ok(sanitizeUserDisplayName('A'.repeat(40)).length <= 24);
  assert.equal(deriveDefaultUserDisplayName('adnan.jogja@gmail.com'), 'adnan jogja');
  assert.equal(deriveDefaultUserDisplayName('a@b.com'), 'Pemain');
  assert.equal(getEffectiveUserDisplayName('  Juara Keluarga ', 'a@b.com'), 'Juara Keluarga');
  assert.equal(getEffectiveUserDisplayName('X', 'budi_ku@mail.com'), 'budi ku');

  assert.equal(formatMatchDuration(500), '1 detik');
  assert.equal(formatMatchDuration(45_000), '45 detik');
  assert.equal(formatMatchDuration(125_000), '2m 05d');

  const id = createOnlineMatchId('ruang-1', 1750000000000, 'abc12');
  assert.equal(id.startsWith('m_ruang-1_'), true);
  assert.equal(buildGuestLeaderboardKey(id, 1), `guest_${id}_1`);
  assert.equal(buildGuestLeaderboardName('Ayah Adnan'), 'Guest (Ayah Adnan)');
  assert.equal(buildGuestLeaderboardName(''), 'Guest');
});

test('Online 1v1 match history sanitization and KPI stats handle edge cases', () => {
  const list = sanitizeOnlineMatchHistoryList({
    m1: {
      matchId: 'm1',
      roomName: 'Ruang Keluarga',
      playedAt: 1000,
      durationMs: 42_000,
      result: 'win',
      myCharId: 'adnan',
      myCharName: 'Ayah Adnan',
      myRoundsWon: 2,
      opponentUid: null,
      opponentName: 'Guest',
      opponentIsGuest: true,
      opponentCharId: 'tika',
      opponentCharName: 'Ibu Tika',
      opponentRoundsWon: 1,
      stageId: 'monas',
    },
    m2: {
      matchId: 'm2',
      roomName: 'Arena Jogja',
      playedAt: 3000,
      durationMs: 65_000,
      result: 'loss',
      myCharId: 'dhira',
      myRoundsWon: 0,
      opponentUid: 'uid-2',
      opponentName: 'Budi',
      opponentIsGuest: false,
      opponentCharId: 'iyen',
      opponentRoundsWon: 2,
      stageId: 'tugu_jogja',
    },
    invalid: { result: 'draw' },
  });

  assert.equal(list.length, 2);
  assert.equal(list[0].matchId, 'm2'); // sorted newest first
  assert.equal(list[1].roomName, 'Ruang Keluarga');

  const stats = computeUserMatchStats(list);
  assert.deepEqual(stats, { total: 2, wins: 1, losses: 1, winRate: 50 });
  assert.deepEqual(computeUserMatchStats([]), { total: 0, wins: 0, losses: 0, winRate: 0 });
});

test('Online 1v1 leaderboard enforces Guest 1x cap and ranks deterministically', () => {
  const entries = sanitizeOnlineLeaderboardList({
    uid_budi: {
      isGuest: false,
      uid: 'uid_budi',
      name: 'Budi',
      wins: 3,
      losses: 1,
      matches: 4,
      lastMatchAt: 2000,
      updatedAt: 2000,
    },
    guest_m1_1: {
      isGuest: true,
      uid: null,
      name: 'Guest (Ayah Adnan)',
      wins: 5, // malicious/stale high value must be capped to 1 for guests
      losses: 0,
      matches: 9,
      lastMatchAt: 5000,
      updatedAt: 5000,
    },
    uid_sari: {
      isGuest: false,
      uid: 'uid_sari',
      name: 'Sari',
      wins: 3,
      losses: 0,
      matches: 3,
      lastMatchAt: 1500,
      updatedAt: 1500,
    },
  });

  assert.equal(entries.length, 3);
  // Sari has 3 wins, 100% WR; Budi has 3 wins, 75% WR; Guest capped to 1 win, 1 match
  assert.equal(entries[0].uid, 'uid_sari');
  assert.equal(computeLeaderboardWinRate(entries[0]), 100);
  assert.equal(entries[1].uid, 'uid_budi');
  assert.equal(computeLeaderboardWinRate(entries[1]), 75);
  assert.equal(entries[2].key, 'guest_m1_1');
  assert.equal(entries[2].wins, 1);
  assert.equal(entries[2].matches, 1);

  const resorted = sortOnlineLeaderboard(entries);
  assert.deepEqual(resorted.map((e) => e.key), ['uid_sari', 'uid_budi', 'guest_m1_1']);
});

test('Room deletion permissions allow Admin on any room and logged-in user only on rooms they created', () => {
  const userRoom = { creatorUid: 'uid-user-1' };
  const otherUserRoom = { creatorUid: 'uid-user-2' };
  const guestRoom = { creatorUid: null };

  const adminSession = { uid: 'uid-admin', isAdmin: true };
  const user1Session = { uid: 'uid-user-1', isAdmin: false };
  const guestSession = null;

  assert.equal(canDeleteOnlineRoom(userRoom, adminSession), true);
  assert.equal(canDeleteOnlineRoom(otherUserRoom, adminSession), true);
  assert.equal(canDeleteOnlineRoom(guestRoom, adminSession), true);

  assert.equal(canDeleteOnlineRoom(userRoom, user1Session), true);
  assert.equal(canDeleteOnlineRoom(otherUserRoom, user1Session), false);
  assert.equal(canDeleteOnlineRoom(guestRoom, user1Session), false);

  assert.equal(canDeleteOnlineRoom(userRoom, guestSession), false);
  assert.equal(canDeleteOnlineRoom(guestRoom, guestSession), false);
});

test('Account deletion warning text and password confirmation validation protect against accidental wipe', () => {
  assert.ok(ACCOUNT_DELETE_WARNING_TEXT.toLowerCase().includes('riwayat'));
  assert.ok(ACCOUNT_DELETE_WARNING_TEXT.toLowerCase().includes('tidak dapat dikembalikan'));

  assert.equal(validateAccountDeletePassword('').ok, false);
  const valid = validateAccountDeletePassword('rahasia123');
  assert.deepEqual(valid, { ok: true, password: 'rahasia123' });
});

test('Firebase permission_denied error detector recognizes RTDB and SDK error variants', () => {
  assert.equal(
    isFirebasePermissionDeniedError(
      new Error('permission_denied at /leaderboard1v1: Client doesn\'t have permission to access the desired data.')
    ),
    true
  );
  assert.equal(isFirebasePermissionDeniedError({ code: 'PERMISSION-DENIED' }), true);
  assert.equal(isFirebasePermissionDeniedError(new Error('network timeout')), false);
  assert.equal(isFirebasePermissionDeniedError(null), false);
});

test('Fallback leaderboard match map handles idempotent logged-in accumulation and Guest 1x cap', () => {
  let map = applyLeaderboardMatchToMap(
    {},
    {
      matchId: 'm-001',
      localSlot: 1,
      won: true,
      uid: 'uid-adnan',
      displayName: 'Ayah Adnan',
      charName: 'Ayah Adnan',
      now: 1000,
    }
  );
  // Duplicate call with same matchId must be idempotent
  map = applyLeaderboardMatchToMap(map, {
    matchId: 'm-001',
    localSlot: 1,
    won: true,
    uid: 'uid-adnan',
    displayName: 'Ayah Adnan',
    charName: 'Ayah Adnan',
    now: 1500,
  });
  assert.equal(map['uid-adnan'].wins, 1);
  assert.equal(map['uid-adnan'].matches, 1);

  // Second distinct match accumulates wins/matches and refreshes displayName
  map = applyLeaderboardMatchToMap(map, {
    matchId: 'm-002',
    localSlot: 1,
    won: false,
    uid: 'uid-adnan',
    displayName: 'Adnan Juara',
    charName: 'Ayah Adnan',
    now: 2000,
  });
  assert.equal(map['uid-adnan'].wins, 1);
  assert.equal(map['uid-adnan'].losses, 1);
  assert.equal(map['uid-adnan'].matches, 2);
  assert.equal(map['uid-adnan'].name, 'Adnan Juara');

  // Guest stays strictly 1x per match
  map = applyLeaderboardMatchToMap(map, {
    matchId: 'm-002',
    localSlot: 2,
    won: true,
    uid: null,
    displayName: 'Guest',
    charName: 'Ibu Tika',
    now: 2000,
  });
  const guestKey = buildGuestLeaderboardKey('m-002', 2);
  assert.equal(map[guestKey].isGuest, true);
  assert.equal(map[guestKey].matches, 1);
  assert.equal(map[guestKey].name, 'Guest (Ibu Tika)');
});

test('Leaderboard and match history merge keeps newest combined records without duplicates', () => {
  const mergedLb = mergeOnlineLeaderboardEntries(
    [
      {
        key: 'uid-1',
        isGuest: false,
        uid: 'uid-1',
        name: 'Adnan',
        wins: 2,
        losses: 0,
        matches: 2,
        lastMatchAt: 2000,
        updatedAt: 2000,
      },
    ],
    [
      {
        key: 'uid-1',
        isGuest: false,
        uid: 'uid-1',
        name: 'Adnan Lama',
        wins: 1,
        losses: 0,
        matches: 1,
        lastMatchAt: 1000,
        updatedAt: 1000,
      },
      {
        key: 'guest_m1_2',
        isGuest: true,
        uid: null,
        name: 'Guest (Dik Iyen)',
        wins: 1,
        losses: 0,
        matches: 1,
        lastMatchAt: 1500,
        updatedAt: 1500,
      },
    ]
  );
  assert.equal(mergedLb.length, 2);
  assert.equal(mergedLb[0].key, 'uid-1');
  assert.equal(mergedLb[0].matches, 2);

  const mergedHist = mergeOnlineMatchHistoryRecords(
    [
      {
        matchId: 'm2',
        roomId: 'r2',
        roomName: 'Ruang Tamu',
        playedAt: 3000,
        durationMs: 25000,
        result: 'win',
        myName: 'Adnan',
        myCharId: 'adnan',
        myCharName: 'Ayah Adnan',
        myRoundsWon: 2,
        opponentUid: null,
        opponentName: 'Guest',
        opponentIsGuest: true,
        opponentCharId: 'tika',
        opponentCharName: 'Ibu Tika',
        opponentRoundsWon: 0,
        stageId: 'simpang_lima_gumul',
      },
    ],
    [
      {
        matchId: 'm1',
        roomId: 'r1',
        roomName: 'Jogja',
        playedAt: 1000,
        durationMs: 40000,
        result: 'loss',
        myName: 'Adnan',
        myCharId: 'adnan',
        myCharName: 'Ayah Adnan',
        myRoundsWon: 1,
        opponentUid: 'uid-2',
        opponentName: 'Tika',
        opponentIsGuest: false,
        opponentCharId: 'tika',
        opponentCharName: 'Ibu Tika',
        opponentRoundsWon: 2,
        stageId: 'dojo',
      },
    ]
  );
  assert.deepEqual(
    mergedHist.map((r) => r.matchId),
    ['m2', 'm1']
  );
});


