import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRemotePacketToTarget,
  createRemoteTarget,
  generateRoomCode,
  interpolateRemoteFighter,
  normalizeRoomCode,
  PEER_ID_PREFIX,
  roomCodeToPeerId,
} from './net';
import {
  createEmptyInput,
  createMatchState,
  receiveNetHit,
  receiveNetHpSync,
  receiveNetProjectile,
  receiveNetRoundSync,
  stepOnlineMatch,
} from './combat';

test('Room code generator & validator use 4-digit numeric codes with unique prefix', () => {
  for (let i = 0; i < 20; i++) {
    const code = generateRoomCode();
    assert.match(code, /^\d{4}$/);
    assert.equal(roomCodeToPeerId(code), `${PEER_ID_PREFIX}${code}`);
  }
  assert.equal(normalizeRoomCode(' 7392 '), '7392');
  assert.equal(normalizeRoomCode('ab12cd34'), '1234');
  assert.equal(normalizeRoomCode('123'), null);
});

test('Out-of-order state packets are ignored and remote fighter interpolates smoothly', () => {
  const target = createRemoteTarget();
  const ok1 = applyRemotePacketToTarget(target, {
    t: 'st',
    seq: 10,
    x: 120,
    y: 40,
    vx: 100,
    vy: 0,
    f: -1,
    s: 'jump',
    m: null,
    mt: 0,
    wp: 0,
    hp: 95,
    sm: 15,
  });
  assert.equal(ok1, true);

  // Stale packet seq=8 should be rejected
  const stale = applyRemotePacketToTarget(target, {
    t: 'st',
    seq: 8,
    x: -50,
    y: 0,
    vx: 0,
    vy: 0,
    f: 1,
    s: 'idle',
    m: null,
    mt: 0,
    wp: 0,
    hp: 100,
    sm: 0,
  });
  assert.equal(stale, false);
  assert.equal(target.x, 120);

  const state = createMatchState('adnan', 'tika', 'dojo', 'online_1v1');
  state.p2.x = 40;
  state.p2.y = 0;
  interpolateRemoteFighter(state.p2, target, 0.016);
  assert.ok(state.p2.x > 40 && state.p2.x < 120, `Expected smooth X interp, got ${state.p2.x}`);
  assert.ok(state.p2.y > 0 && state.p2.y < 40, `Expected smooth Y interp, got ${state.p2.y}`);
});

test('Online melee hit, defender block check, projectile sync, and round sync work across Host & Guest', () => {
  const hostState = createMatchState('adnan', 'tika', 'living_room', 'online_1v1');
  const guestState = createMatchState('adnan', 'tika', 'living_room', 'online_1v1');
  hostState.roundPhase = 'fight';
  guestState.roundPhase = 'fight';

  hostState.p1.x = -120;
  hostState.p2.x = 120;
  guestState.p1.x = -120;
  guestState.p2.x = 120;

  const hostTarget = createRemoteTarget();
  const guestTarget = createRemoteTarget();

  // Host fires Neutral+SP (Lemparan Sapu Kelut projectile)
  const hostIn = createEmptyInput();
  hostIn.spPressed = true;
  const { netPackets: hostPkts } = stepOnlineMatch(hostState, 'host', hostIn, hostTarget, 0.016);

  const projPkt = hostPkts.find((p) => p.t === 'proj');
  assert.ok(projPkt, 'Host should emit projectile packet');
  if (projPkt && projPkt.t === 'proj') {
    receiveNetProjectile(guestState, 'guest', projPkt);
    assert.equal(guestState.projectiles.some((p) => p.active && p.ownerSlot === 1), true);
  }

  // Step host until projectile overlaps P2 and emits hit packet
  let hitPkt: Extract<(typeof hostPkts)[number], { t: 'hit' }> | undefined =
    hostPkts.find((p): p is Extract<(typeof hostPkts)[number], { t: 'hit' }> => p.t === 'hit');
  for (let i = 0; i < 30 && !hitPkt; i++) {
    const res = stepOnlineMatch(hostState, 'host', createEmptyInput(), hostTarget, 0.016);
    const found = res.netPackets.find((p) => p.t === 'hit');
    if (found && found.t === 'hit') {
      hitPkt = found;
      break;
    }
  }
  assert.ok(hitPkt, 'Host projectile should emit hit packet');

  // Guest receives hit while NOT blocking -> takes damage and returns hp_sync
  const guestCues: any[] = [];
  const hpSync = receiveNetHit(guestState, 'guest', createEmptyInput(), hitPkt!, guestCues);
  assert.ok(hpSync.hp < guestState.p2.maxHp);
  assert.equal(hpSync.blocked, false);

  // Host applies hp_sync
  receiveNetHpSync(hostState, 'host', hpSync);
  assert.equal(hostState.p2.hp, hpSync.hp);

  // Host round sync updates Guest
  const guestRoundCues: any[] = [];
  receiveNetRoundSync(
    guestState,
    {
      t: 'round',
      phase: 'ko',
      num: 1,
      timer: 88,
      banner: 'K.O.!',
      sub: 'AYAH ADNAN MENANG!',
      p1Wins: 1,
      p2Wins: 0,
      winner: 0,
    },
    guestRoundCues
  );
  assert.equal(guestState.roundPhase, 'ko');
  assert.equal(guestState.p1.roundsWon, 1);
  assert.equal(guestState.bannerText, 'K.O.!');
  void guestTarget;
});
