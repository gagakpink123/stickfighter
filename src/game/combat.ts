import { CHARACTERS } from './characters';
import { ARENA_HALF_WIDTH, addCameraTrauma, clamp, createCamera, updateCamera } from './math3d';
import {
  AttackHeight,
  CharacterId,
  CpuDifficulty,
  FighterRuntime,
  GameMode,
  InputSnapshot,
  MatchState,
  MoveId,
  MoveSpec,
  OnlineRole,
  Particle,
  Projectile,
  StageId,
} from './types';
import {
  NetReliablePacket,
  RemoteInterpTarget,
  interpolateRemoteFighter,
} from './net';

export type SoundCue =
  | 'punch_swing'
  | 'kick_swing'
  | 'hit_light'
  | 'hit_heavy'
  | 'block'
  | 'parry'
  | 'dash'
  | 'throw_grab'
  | 'tantrum_cry'
  | 'jump'
  | 'land'
  | 'body_slam'
  | 'bullet_time'
  | 'sp_sapu'
  | 'sp_serbet'
  | 'sp_buku'
  | 'sp_kelereng'
  | 'super_activate'
  | 'round_call'
  | 'countdown_tick'
  | 'fight_call'
  | 'ko_call'
  | 'victory_call';

const PARTICLE_POOL_SIZE = 120;
const PROJECTILE_POOL_SIZE = 48;

export function createEmptyInput(): InputSnapshot {
  return {
    moveX: 0,
    moveY: 0,
    punchHeld: false,
    kickHeld: false,
    spHeld: false,
    blockHeld: false,
    superHeld: false,
    punchPressed: false,
    kickPressed: false,
    spPressed: false,
    superPressed: false,
  };
}

function createFighter(slot: 1 | 2, charId: CharacterId): FighterRuntime {
  const spec = CHARACTERS[charId];
  return {
    slot,
    charId,
    x: slot === 1 ? -175 : 175,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    facing: slot === 1 ? 1 : -1,
    hp: spec.maxHp,
    trailHp: spec.maxHp,
    maxHp: spec.maxHp,
    superMeter: 0,
    guardStamina: 100,
    burnoutTimer: 0,
    idleTime: 0,
    magerArmorHits: 0,
    omelanMeter: 0,
    parryWindowTimer: 0,
    wasBlockHeld: false,
    counterActiveTimer: 0,
    backRiseActive: false,
    damageTakenSinceTantrum: 0,
    tantrumCooldown: 0,
    charFsmStatus: 'normal',
    dashDir: 0,
    dashTimer: 0,
    lastTapX: 0,
    lastTapTimer: 0,
    prevMoveX: 0,
    coughTimer: 0,
    state: 'idle',
    stateTimer: 0,
    animTime: 0,
    walkPhase: 0,
    currentMove: null,
    moveTimer: 0,
    moveHitLanded: false,
    moveHitsRemaining: 1,
    multiHitCooldown: 0,
    bufferedMove: null,
    bufferTimer: 0,
    hitFlashTimer: 0,
    invulnTimer: 0,
    comboCountReceived: 0,
    comboCountDealt: 0,
    comboDisplayTimer: 0,
    roundsWon: 0,
    totalDamageDealt: 0,
    maxComboAchieved: 0,
    squashX: 1,
    squashY: 1,
  };
}

function createParticlePool(): Particle[] {
  const pool: Particle[] = [];
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    pool.push({
      active: false,
      ownerSlot: 1,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 10,
      life: 0,
      maxLife: 0.25,
      kind: 'spark',
      angle: 0,
    });
  }
  return pool;
}

function createProjectilePool(): Projectile[] {
  const pool: Projectile[] = [];
  for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) {
    pool.push({
      active: false,
      ownerSlot: 1,
      type: 'sapu_spin',
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      gravity: 0,
      radius: 20,
      damage: 10,
      chipDamage: 2,
      hitstun: 0.3,
      hitstop: 0.04,
      knockbackX: 150,
      knockbackY: 50,
      knockdown: false,
      height: 'mid',
      bouncesLeft: 0,
      life: 0,
      maxLife: 2,
      spinAngle: 0,
      hitsLeft: 1,
    });
  }
  return pool;
}

export function createMatchState(
  p1Char: CharacterId,
  p2Char: CharacterId,
  stageId: StageId,
  mode: GameMode,
  difficulty: CpuDifficulty = 'normal'
): MatchState {
  const p1 = createFighter(1, p1Char);
  const p2 = createFighter(2, p2Char);
  if (mode === 'training') {
    p1.superMeter = 100;
  }
  return {
    mode,
    difficulty,
    stageId,
    roundNumber: 1,
    roundPhase: mode === 'training' ? 'fight' : 'intro',
    phaseTimer: mode === 'training' ? 0 : 4.65,
    roundTimer: 99,
    hitstopTimer: 0,
    bannerText: mode === 'training' ? '' : 'ROUND 1',
    subBannerText: mode === 'training' ? '' : 'SIAP BERTARUNG!',
    winnerSlot: 0,
    matchTimeElapsed: 0,
    p1,
    p2,
    camera: createCamera(),
    projectiles: createProjectilePool(),
    particles: createParticlePool(),
    particleCursor: 0,
    projectileCursor: 0,
    pendingSuperBannerTimer: 0,
    pendingSuperName: '',
    timeScale: 1,
    dramaticCam: {
      active: false,
      timer: 0,
      duration: 0.9,
      cooldown: 0,
      targetX: 0,
      targetY: 85,
      orbitSign: 1,
      isKo: false,
    },
  };
}

export function resetForNextRound(state: MatchState): void {
  const p1Wins = state.p1.roundsWon;
  const p2Wins = state.p2.roundsWon;
  const p1Super = state.p1.superMeter;
  const p2Super = state.p2.superMeter;
  const p1Dmg = state.p1.totalDamageDealt;
  const p2Dmg = state.p2.totalDamageDealt;
  const p1MaxCombo = state.p1.maxComboAchieved;
  const p2MaxCombo = state.p2.maxComboAchieved;

  state.p1 = createFighter(1, state.p1.charId);
  state.p2 = createFighter(2, state.p2.charId);
  state.p1.roundsWon = p1Wins;
  state.p2.roundsWon = p2Wins;
  state.p1.superMeter = p1Super;
  state.p2.superMeter = p2Super;
  state.p1.totalDamageDealt = p1Dmg;
  state.p2.totalDamageDealt = p2Dmg;
  state.p1.maxComboAchieved = p1MaxCombo;
  state.p2.maxComboAchieved = p2MaxCombo;

  state.roundNumber += 1;
  state.roundPhase = 'intro';
  state.phaseTimer = 3.35;
  state.roundTimer = 99;
  state.hitstopTimer = 0;
  state.bannerText = `ROUND ${state.roundNumber}`;
  state.subBannerText = 'SIAP BERTARUNG!';
  state.timeScale = 1;
  state.dramaticCam = {
    active: false,
    timer: 0,
    duration: 0.9,
    cooldown: 0,
    targetX: 0,
    targetY: 85,
    orbitSign: 1,
    isKo: false,
  };
  for (const p of state.projectiles) p.active = false;
  for (const pt of state.particles) pt.active = false;
}

function triggerDramaticSlowMo(
  state: MatchState,
  targetX: number,
  targetY: number,
  orbitSign: 1 | -1,
  isKo: boolean,
  cues: SoundCue[]
): void {
  if (!isKo && state.dramaticCam.cooldown > 0) return;
  const duration = isKo ? 1.35 : 0.9;
  state.dramaticCam.active = true;
  state.dramaticCam.timer = duration;
  state.dramaticCam.duration = duration;
  state.dramaticCam.cooldown = isKo ? 0 : 1.7;
  state.dramaticCam.targetX = targetX;
  state.dramaticCam.targetY = targetY;
  state.dramaticCam.orbitSign = orbitSign;
  state.dramaticCam.isKo = isKo;
  state.timeScale = isKo ? 0.18 : 0.24;
  cues.push('bullet_time');
}

function updateDramaticSlowMo(state: MatchState, realDt: number): void {
  if (state.dramaticCam.cooldown > 0) {
    state.dramaticCam.cooldown = Math.max(0, state.dramaticCam.cooldown - realDt);
  }
  if (!state.dramaticCam.active) {
    state.timeScale += (1 - state.timeScale) * Math.min(1, realDt * 12);
    if (Math.abs(1 - state.timeScale) < 0.005) state.timeScale = 1;
    return;
  }

  state.dramaticCam.timer = Math.max(0, state.dramaticCam.timer - realDt);
  const target =
    state.p1.state === 'knockdown' || state.p1.state === 'ko'
      ? state.p1
      : state.p2.state === 'knockdown' || state.p2.state === 'ko'
        ? state.p2
        : null;
  if (target) {
    state.dramaticCam.targetX += (target.x - state.dramaticCam.targetX) * Math.min(1, realDt * 10);
    state.dramaticCam.targetY += (target.y - state.dramaticCam.targetY) * Math.min(1, realDt * 10);
  }

  const dur = Math.max(0.1, state.dramaticCam.duration);
  const progress = 1 - state.dramaticCam.timer / dur;
  const minScale = state.dramaticCam.isKo ? 0.18 : 0.24;

  if (progress < 0.55) {
    state.timeScale = minScale;
  } else {
    const ease = (progress - 0.55) / 0.45;
    state.timeScale = minScale + (1 - minScale) * (ease * ease);
  }

  if (state.dramaticCam.timer <= 0) {
    state.dramaticCam.active = false;
    state.timeScale = 1;
  }
}

function spawnParticle(
  state: MatchState,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  size: number,
  maxLife: number,
  kind: Particle['kind'],
  ownerSlot: 1 | 2 = 1
): void {
  const pt = state.particles[state.particleCursor];
  state.particleCursor = (state.particleCursor + 1) % state.particles.length;
  pt.active = true;
  pt.ownerSlot = ownerSlot;
  pt.x = x;
  pt.y = y;
  pt.z = z;
  pt.vx = vx;
  pt.vy = vy;
  pt.vz = vz;
  pt.size = size;
  pt.life = 0;
  pt.maxLife = maxLife;
  pt.kind = kind;
  pt.angle = Math.random() * Math.PI * 2;
}

function spawnHitBurst(
  state: MatchState,
  x: number,
  y: number,
  heavy: boolean,
  ownerSlot: 1 | 2
): void {
  const count = heavy ? 14 : 7;
  spawnParticle(state, x, y, 0, 0, 0, 0, heavy ? 64 : 44, heavy ? 0.28 : 0.24, 'starburst', ownerSlot);
  if (heavy) {
    spawnParticle(state, x, y, 2, 0, 0, 0, 78, 0.42, 'shockwave', ownerSlot);
  }
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const spd = (heavy ? 360 : 220) * (0.65 + Math.random() * 0.7);
    spawnParticle(
      state,
      x,
      y,
      (Math.random() - 0.5) * 16,
      Math.cos(a) * spd,
      Math.sin(a) * spd,
      (Math.random() - 0.5) * 140,
      heavy ? 18 : 11,
      heavy ? 0.28 : 0.2,
      'spark',
      ownerSlot
    );
  }
}

function spawnProjectile(
  state: MatchState,
  opts: Omit<Projectile, 'active' | 'life' | 'spinAngle'>,
  netOut?: NetReliablePacket[]
): void {
  const proj = state.projectiles[state.projectileCursor];
  state.projectileCursor = (state.projectileCursor + 1) % state.projectiles.length;
  proj.active = true;
  proj.life = 0;
  proj.spinAngle = 0;
  proj.ownerSlot = opts.ownerSlot;
  proj.type = opts.type;
  proj.x = opts.x;
  proj.y = opts.y;
  proj.z = opts.z;
  proj.vx = opts.vx;
  proj.vy = opts.vy;
  proj.gravity = opts.gravity;
  proj.radius = opts.radius;
  proj.damage = opts.damage;
  proj.chipDamage = opts.chipDamage;
  proj.hitstun = opts.hitstun;
  proj.hitstop = opts.hitstop;
  proj.knockbackX = opts.knockbackX;
  proj.knockbackY = opts.knockbackY;
  proj.knockdown = opts.knockdown;
  proj.height = opts.height;
  proj.bouncesLeft = opts.bouncesLeft;
  proj.maxLife = opts.maxLife;
  proj.hitsLeft = opts.hitsLeft;

  if (netOut) {
    netOut.push({
      t: 'proj',
      type: opts.type,
      x: opts.x,
      y: opts.y,
      z: opts.z,
      vx: opts.vx,
      vy: opts.vy,
      g: opts.gravity,
      r: opts.radius,
      dmg: opts.damage,
      chip: opts.chipDamage,
      hitstun: opts.hitstun,
      hitstop: opts.hitstop,
      kbx: opts.knockbackX,
      kby: opts.knockbackY,
      kd: opts.knockdown,
      height: opts.height,
      bounces: opts.bouncesLeft,
      maxLife: opts.maxLife,
    });
  }
}

export function getFighterHurtbox(f: FighterRuntime): {
  left: number;
  right: number;
  bottom: number;
  top: number;
} {
  const spec = CHARACTERS[f.charId];
  const halfW = spec.hurtboxWidth * 0.5;
  let height = spec.standingHeight;
  if (
    f.state === 'crouch' ||
    f.state === 'tantrum' ||
    (f.charId === 'iyen' && f.state === 'dash') ||
    (f.state === 'attack' &&
      (f.currentMove?.id === 'crouch_p' ||
        f.currentMove?.id === 'crouch_k' ||
        (f.charId === 'iyen' && f.currentMove?.id === 'sp_down')))
  ) {
    height = spec.crouchingHeight;
  } else if (f.state === 'knockdown') {
    height = 38;
  }
  return {
    left: f.x - halfW,
    right: f.x + halfW,
    bottom: f.y,
    top: f.y + height,
  };
}

export function getMoveHitboxWorld(
  attacker: FighterRuntime,
  move: MoveSpec
): { left: number; right: number; bottom: number; top: number } {
  const centerX = attacker.x + attacker.facing * move.hitbox.xOffset;
  const halfW = move.hitbox.width * 0.5;
  return {
    left: centerX - halfW,
    right: centerX + halfW,
    bottom: attacker.y + move.hitbox.yMin,
    top: attacker.y + move.hitbox.yMax,
  };
}

function boxesOverlap(
  a: { left: number; right: number; bottom: number; top: number },
  b: { left: number; right: number; bottom: number; top: number }
): boolean {
  return a.left <= b.right && a.right >= b.left && a.bottom <= b.top && a.top >= b.bottom;
}

function resolveSpecialMoveId(fighter: FighterRuntime, input: InputSnapshot): MoveId {
  if (input.moveY < -0.45) {
    return 'sp_down';
  }
  if (input.moveX * fighter.facing < -0.45) {
    return 'sp_back';
  }
  if (input.moveY > 0.45 || input.moveX * fighter.facing > 0.4) {
    return 'sp_up_fwd';
  }
  return 'sp_neutral';
}

function isHeavyMoveId(moveId: MoveId): boolean {
  return (
    moveId === 'p3' ||
    moveId === 'p4' ||
    moveId === 'k3' ||
    moveId === 'k4' ||
    moveId === 'crouch_k' ||
    moveId === 'sp_down'
  );
}

function getEffectiveMoveRecovery(f: FighterRuntime, move: MoveSpec): number {
  if (f.charId === 'tika' && f.omelanMeter >= 25 && move.id.startsWith('sp')) {
    const speedup = 1 - 0.38 * clamp(f.omelanMeter / 100, 0, 1);
    return Number((move.recovery * speedup).toFixed(4));
  }
  return move.recovery;
}

function syncFighterFsmStatus(f: FighterRuntime): void {
  if (f.burnoutTimer > 0) {
    f.charFsmStatus = 'burnout';
    return;
  }
  if (f.state === 'tantrum') {
    f.charFsmStatus = 'rewel';
    return;
  }
  if (
    f.charId === 'dhira' &&
    (f.state === 'counter_stance' || (f.state === 'attack' && Boolean(f.currentMove?.isCounterStance)))
  ) {
    f.charFsmStatus = 'counter_stance';
    return;
  }
  if (f.charId === 'adnan' && f.magerArmorHits > 0) {
    f.charFsmStatus = 'mager';
    return;
  }
  if (f.charId === 'tika' && f.omelanMeter >= 30) {
    f.charFsmStatus = 'omelan';
    return;
  }
  f.charFsmStatus = 'normal';
}

function triggerIyenTantrum(
  state: MatchState,
  f: FighterRuntime,
  opp: FighterRuntime,
  cues: SoundCue[],
  netOut?: NetReliablePacket[]
): void {
  f.state = 'tantrum';
  f.stateTimer = 0.58;
  f.invulnTimer = 0.28;
  f.currentMove = null;
  f.vx = 0;
  f.damageTakenSinceTantrum = 0;
  f.tantrumCooldown = 6.0;
  f.charFsmStatus = 'rewel';
  cues.push('tantrum_cry');

  spawnParticle(state, f.x, f.y + 42, 0, 0, 0, 0, 88, 0.44, 'shockwave', f.slot);
  spawnParticle(state, f.x, 6, 0, 0, 0, 0, 96, 0.48, 'shockwave_ground', f.slot);

  const dist = Math.abs(opp.x - f.x);
  if (!netOut && dist < 215 && opp.state !== 'ko' && opp.invulnTimer <= 0) {
    const pushDir = opp.x >= f.x ? 1 : -1;
    opp.currentMove = null;
    opp.state = 'hitstun';
    opp.stateTimer = 0.26;
    opp.vx = pushDir * 440;
    opp.vy = Math.max(opp.vy, 145);
    addCameraTrauma(state.camera, 0.24);
  }
}

function startMove(
  state: MatchState,
  fighter: FighterRuntime,
  moveId: MoveId,
  cues: SoundCue[],
  netOut?: NetReliablePacket[]
): void {
  const spec = CHARACTERS[fighter.charId];
  const move = spec.moves[moveId];
  fighter.state = move.isCounterStance ? 'counter_stance' : 'attack';
  fighter.currentMove = move;
  fighter.moveTimer = 0;
  fighter.moveHitLanded = false;
  fighter.moveHitsRemaining = move.multiHitCount ?? 1;
  fighter.multiHitCooldown = 0;
  fighter.bufferedMove = null;
  fighter.bufferTimer = 0;
  fighter.idleTime = 0;
  fighter.dashTimer = 0;

  if (moveId === 'super') {
    fighter.superMeter = 0;
    state.hitstopTimer = 0.12;
    state.pendingSuperBannerTimer = 0.85;
    state.pendingSuperName = move.name;
    addCameraTrauma(state.camera, 0.45);
    spawnParticle(
      state,
      fighter.x,
      fighter.y + spec.standingHeight * 0.55,
      4,
      0,
      0,
      0,
      92,
      0.42,
      'shockwave',
      fighter.slot
    );
    spawnParticle(state, fighter.x, 4, 0, 0, 0, 0, 96, 0.44, 'shockwave_ground', fighter.slot);
    cues.push('super_activate');
  } else if (move.isThrow) {
    cues.push('throw_grab');
  } else if (move.weapon === 'sapu_kelut') {
    cues.push('sp_sapu');
  } else if (move.weapon === 'serbet') {
    cues.push('sp_serbet');
  } else if (move.weapon === 'buku' || move.weapon === 'tas') {
    cues.push('sp_buku');
  } else if (move.weapon === 'kelereng' || move.weapon === 'kelereng_pouch') {
    cues.push('sp_kelereng');
  } else if (moveId.startsWith('k') || moveId === 'crouch_k' || moveId === 'air_k') {
    cues.push('kick_swing');
  } else {
    cues.push('punch_swing');
  }

  if (move.lungeVx) {
    fighter.vx = fighter.facing * move.lungeVx;
  } else if (fighter.y === 0) {
    fighter.vx = 0;
  }
  if (move.lungeVy) {
    fighter.vy = move.lungeVy;
    fighter.squashX = 0.86;
    fighter.squashY = 1.16;
  }

  if (move.projectileType) {
    spawnMoveProjectiles(state, fighter, move, netOut);
  }
  syncFighterFsmStatus(fighter);
}

function spawnMoveProjectiles(
  state: MatchState,
  f: FighterRuntime,
  move: MoveSpec,
  netOut?: NetReliablePacket[]
): void {
  const spec = CHARACTERS[f.charId];
  const spawnX = f.x + f.facing * 48;
  const spawnY = f.y + spec.standingHeight * 0.56;

  switch (move.projectileType) {
    case 'sapu_spin':
      spawnProjectile(state, {
        ownerSlot: f.slot,
        type: 'sapu_spin',
        x: spawnX,
        y: spawnY,
        z: 0,
        vx: f.facing * 490,
        vy: 0,
        gravity: 0,
        radius: 28,
        damage: move.damage,
        chipDamage: move.chipDamage,
        hitstun: move.hitstun,
        hitstop: move.hitstop,
        knockbackX: move.knockbackX,
        knockbackY: move.knockbackY,
        knockdown: false,
        height: 'mid',
        bouncesLeft: 0,
        maxLife: 1.9,
        hitsLeft: 1,
      }, netOut);
      break;

    case 'dust_cloud':
      spawnProjectile(state, {
        ownerSlot: f.slot,
        type: 'dust_cloud',
        x: spawnX + f.facing * 18,
        y: Math.max(58, spawnY - 8),
        z: 0,
        vx: f.facing * 425,
        vy: 0,
        gravity: 0,
        radius: 34,
        damage: move.damage,
        chipDamage: move.chipDamage,
        hitstun: move.hitstun,
        hitstop: move.hitstop,
        knockbackX: move.knockbackX,
        knockbackY: move.knockbackY,
        knockdown: false,
        height: 'mid',
        bouncesLeft: 0,
        maxLife: 1.65,
        hitsLeft: 1,
      }, netOut);
      break;

    case 'buku_arc':
    case 'origami_arc':
      spawnProjectile(state, {
        ownerSlot: f.slot,
        type: move.projectileType,
        x: spawnX,
        y: spawnY + 12,
        z: 0,
        vx: f.facing * 425,
        vy: 295,
        gravity: 670,
        radius: 24,
        damage: move.damage,
        chipDamage: move.chipDamage,
        hitstun: move.hitstun,
        hitstop: move.hitstop,
        knockbackX: move.knockbackX,
        knockbackY: move.knockbackY,
        knockdown: false,
        height: 'mid',
        bouncesLeft: 0,
        maxLife: 2.2,
        hitsLeft: 1,
      }, netOut);
      break;

    case 'buku_stack': {
      const sx = clamp(f.x + f.facing * 92, -ARENA_HALF_WIDTH + 30, ARENA_HALF_WIDTH - 30);
      spawnParticle(state, sx, 4, 0, 0, 0, 0, 56, 0.32, 'shockwave_ground', f.slot);
      spawnProjectile(state, {
        ownerSlot: f.slot,
        type: 'buku_stack',
        x: sx,
        y: 16,
        z: 0,
        vx: 0,
        vy: 0,
        gravity: 0,
        radius: 34,
        damage: move.damage,
        chipDamage: move.chipDamage,
        hitstun: move.hitstun,
        hitstop: move.hitstop,
        knockbackX: move.knockbackX,
        knockbackY: move.knockbackY,
        knockdown: true,
        height: 'low',
        bouncesLeft: 0,
        maxLife: 0.75,
        hitsLeft: 1,
      }, netOut);
      break;
    }

    case 'buku_rain': {
      const opp = f.slot === 1 ? state.p2 : state.p1;
      for (let i = 0; i < 8; i++) {
        const targetX = clamp(
          opp.x + (i - 3.5) * 64 + (Math.random() - 0.5) * 24,
          -ARENA_HALF_WIDTH + 20,
          ARENA_HALF_WIDTH - 20
        );
        spawnProjectile(state, {
          ownerSlot: f.slot,
          type: 'buku_rain',
          x: targetX - f.facing * 95,
          y: 380 + i * 52,
          z: ((i % 3) - 1) * 14,
          vx: f.facing * 145,
          vy: -420 - (i % 3) * 75,
          gravity: 280,
          radius: 24,
          damage: 7,
          chipDamage: 2,
          hitstun: 0.36,
          hitstop: 0.035,
          knockbackX: 110,
          knockbackY: 160,
          knockdown: i >= 6,
          height: 'high',
          bouncesLeft: 0,
          maxLife: 2.4,
          hitsLeft: 1,
        }, netOut);
      }
      break;
    }

    case 'kelereng_low':
      spawnProjectile(state, {
        ownerSlot: f.slot,
        type: 'kelereng_low',
        x: spawnX,
        y: 16,
        z: 0,
        vx: f.facing * 590,
        vy: 0,
        gravity: 0,
        radius: 14,
        damage: move.damage,
        chipDamage: move.chipDamage,
        hitstun: move.hitstun,
        hitstop: move.hitstop,
        knockbackX: move.knockbackX,
        knockbackY: move.knockbackY,
        knockdown: false,
        height: 'low',
        bouncesLeft: 0,
        maxLife: 1.5,
        hitsLeft: 1,
      }, netOut);
      break;

    case 'kelereng_trap': {
      for (let i = 0; i < 3; i++) {
        const tx = clamp(
          f.x + f.facing * (76 + i * 44),
          -ARENA_HALF_WIDTH + 24,
          ARENA_HALF_WIDTH - 24
        );
        spawnProjectile(state, {
          ownerSlot: f.slot,
          type: 'kelereng_trap',
          x: tx,
          y: 8,
          z: (i - 1) * 8,
          vx: 0,
          vy: 0,
          gravity: 0,
          radius: 18,
          damage: move.damage,
          chipDamage: 0,
          hitstun: 0.46,
          hitstop: 0.055,
          knockbackX: 145,
          knockbackY: 235,
          knockdown: true,
          height: 'low',
          bouncesLeft: 0,
          maxLife: 5.5,
          hitsLeft: 1,
        }, netOut);
      }
      break;
    }

    case 'kelereng_burst':
      for (let i = 0; i < 3; i++) {
        spawnProjectile(state, {
          ownerSlot: f.slot,
          type: 'kelereng_burst',
          x: spawnX + f.facing * (i * 22),
          y: 34 + i * 10,
          z: 0,
          vx: f.facing * (540 + i * 55),
          vy: (i - 1) * 24,
          gravity: 0,
          radius: 13,
          damage: move.damage,
          chipDamage: move.chipDamage,
          hitstun: move.hitstun,
          hitstop: move.hitstop,
          knockbackX: move.knockbackX,
          knockbackY: move.knockbackY,
          knockdown: false,
          height: 'low',
          bouncesLeft: 0,
          maxLife: 1.4,
          hitsLeft: 1,
        }, netOut);
      }
      break;

    case 'kelereng_air':
      for (let i = 0; i < 2; i++) {
        spawnProjectile(state, {
          ownerSlot: f.slot,
          type: 'kelereng_air',
          x: spawnX,
          y: f.y + 68,
          z: 0,
          vx: f.facing * (350 + i * 110),
          vy: -240 - i * 80,
          gravity: 420,
          radius: 14,
          damage: move.damage,
          chipDamage: move.chipDamage,
          hitstun: move.hitstun,
          hitstop: move.hitstop,
          knockbackX: move.knockbackX,
          knockbackY: move.knockbackY,
          knockdown: false,
          height: 'mid',
          bouncesLeft: 1,
          maxLife: 1.6,
          hitsLeft: 1,
        }, netOut);
      }
      break;

    case 'kelereng_storm':
      for (let i = 0; i < 12; i++) {
        spawnProjectile(state, {
          ownerSlot: f.slot,
          type: 'kelereng_storm',
          x: spawnX,
          y: 44 + (i % 4) * 28,
          z: ((i % 3) - 1) * 12,
          vx: f.facing * (380 + (i % 5) * 85),
          vy: 180 + (i % 4) * 110,
          gravity: 980,
          radius: 15,
          damage: 6,
          chipDamage: 2,
          hitstun: 0.34,
          hitstop: 0.03,
          knockbackX: 135,
          knockbackY: 165,
          knockdown: i >= 9,
          height: 'low',
          bouncesLeft: 3,
          maxLife: 2.8,
          hitsLeft: 1,
        }, netOut);
      }
      break;
  }
}

function isDefenderBlocking(
  defender: FighterRuntime,
  defenderInput: InputSnapshot,
  attackHeight: AttackHeight,
  isOverhead = false,
  isThrow = false
): boolean {
  if (isThrow) return false;
  if (defender.y > 0) return false;
  if (defender.burnoutTimer > 0) return false;
  if (
    defender.state !== 'idle' &&
    defender.state !== 'walk_back' &&
    defender.state !== 'crouch' &&
    defender.state !== 'block'
  ) {
    return false;
  }

  // Dedicated mobile/keyboard BLOCK button guards standard heights
  if (defenderInput.blockHeld) {
    // Overheads punish crouch-turtling if holding down simultaneously
    if (isOverhead && defenderInput.moveY < -0.4 && defender.state === 'crouch') {
      return false;
    }
    return true;
  }

  // Classic 2D fighter back-hold guard
  const holdingBack = defenderInput.moveX * defender.facing < -0.35;
  if (!holdingBack) return false;
  if (attackHeight === 'low') {
    return defenderInput.moveY < -0.4;
  }
  if (isOverhead && defenderInput.moveY < -0.4) {
    return false;
  }
  return true;
}

function isDhiraCounterStanceActive(f: FighterRuntime): boolean {
  if (f.charId !== 'dhira') return false;
  if (f.state === 'counter_stance' && f.currentMove?.isCounterStance) {
    return (
      f.moveTimer >= f.currentMove.startup &&
      f.moveTimer <= f.currentMove.startup + f.currentMove.active
    );
  }
  return f.counterActiveTimer > 0;
}

function applyHitToDefender(
  state: MatchState,
  attacker: FighterRuntime,
  defender: FighterRuntime,
  defenderInput: InputSnapshot,
  hitParams: {
    damage: number;
    chipDamage: number;
    hitstun: number;
    blockstun: number;
    hitstop: number;
    knockbackX: number;
    knockbackY: number;
    knockdown: boolean;
    height: AttackHeight;
    isOverhead?: boolean;
    isThrow?: boolean;
    isCough?: boolean;
    superGainHit: number;
    impactX: number;
    impactY: number;
    isMultiHitPart?: boolean;
  },
  cues: SoundCue[],
  netOut?: NetReliablePacket[]
): void {
  if (
    defender.invulnTimer > 0 ||
    defender.state === 'ko' ||
    defender.state === 'knockdown' ||
    defender.state === 'wakeup'
  ) {
    return;
  }

  if (netOut) {
    attacker.superMeter = clamp(attacker.superMeter + hitParams.superGainHit, 0, 100);
    state.hitstopTimer = Math.max(state.hitstopTimer, hitParams.hitstop);
    defender.hitFlashTimer = 0.06;
    const heavy = hitParams.damage >= 11 || hitParams.knockdown;
    addCameraTrauma(state.camera, heavy ? 0.36 : 0.2);
    spawnHitBurst(state, hitParams.impactX, hitParams.impactY, heavy, attacker.slot);
    cues.push(heavy ? 'hit_heavy' : 'hit_light');
    if (hitParams.knockdown) {
      const orbitSign: 1 | -1 = attacker.x <= defender.x ? 1 : -1;
      triggerDramaticSlowMo(state, defender.x, defender.y + 60, orbitSign, false, cues);
    }
    netOut.push({
      t: 'hit',
      dmg: hitParams.damage,
      chip: hitParams.chipDamage,
      hitstun: hitParams.hitstun,
      blockstun: hitParams.blockstun,
      hitstop: hitParams.hitstop,
      kbx: hitParams.knockbackX,
      kby: hitParams.knockbackY,
      kd: hitParams.knockdown,
      height: hitParams.height,
      ix: hitParams.impactX,
      iy: hitParams.impactY,
      superGain: hitParams.superGainHit,
    });
    return;
  }

  // Pilar 3 - Kak Dhira Pose Centil Counter Stance: evade behind opponent & counter!
  if (!hitParams.isThrow && isDhiraCounterStanceActive(defender)) {
    const defSpec = CHARACTERS[defender.charId];
    const halfW = defSpec.hurtboxWidth * 0.5;
    defender.counterActiveTimer = 0;
    defender.invulnTimer = 0.36;
    defender.x = clamp(
      attacker.x - attacker.facing * 74,
      -ARENA_HALF_WIDTH + halfW,
      ARENA_HALF_WIDTH - halfW
    );
    defender.facing = attacker.x >= defender.x ? 1 : -1;
    state.hitstopTimer = Math.max(state.hitstopTimer, 0.09);
    spawnHitBurst(state, hitParams.impactX, hitParams.impactY, true, defender.slot);
    cues.push('parry');
    startMove(state, defender, 'counter_slash', cues);
    return;
  }

  // Pilar 3 - Ibu Tika Perfect Parry: fresh block tap triggers glare & reflex whip counter!
  if (
    !hitParams.isThrow &&
    defender.charId === 'tika' &&
    defender.parryWindowTimer > 0 &&
    defender.burnoutTimer <= 0 &&
    defender.y === 0
  ) {
    defender.parryWindowTimer = 0;
    defender.invulnTimer = 0.25;
    defender.omelanMeter = clamp(defender.omelanMeter + 22, 0, 100);
    defender.guardStamina = Math.min(100, defender.guardStamina + 18);
    state.hitstopTimer = Math.max(state.hitstopTimer, 0.085);
    spawnHitBurst(state, hitParams.impactX, hitParams.impactY, true, defender.slot);
    cues.push('parry');
    startMove(state, defender, 'parry_counter', cues);
    return;
  }

  // Pilar 3 - Ayah Adnan Mode Mager: 1-hit Super Armor on Heavy attacks!
  if (
    !hitParams.isThrow &&
    defender.charId === 'adnan' &&
    defender.magerArmorHits > 0 &&
    defender.state === 'attack' &&
    defender.currentMove &&
    isHeavyMoveId(defender.currentMove.id)
  ) {
    defender.magerArmorHits = 0;
    const armorDmg = Math.max(1, Math.round(hitParams.damage * 0.5));
    defender.hp = Math.max(0, defender.hp - armorDmg);
    attacker.totalDamageDealt += armorDmg;
    defender.hitFlashTimer = 0.06;
    state.hitstopTimer = Math.max(state.hitstopTimer, hitParams.hitstop * 0.8);
    spawnHitBurst(state, hitParams.impactX, hitParams.impactY, false, attacker.slot);
    cues.push('block');
    syncFighterFsmStatus(defender);
    return;
  }

  const blocked = isDefenderBlocking(
    defender,
    defenderInput,
    hitParams.height,
    Boolean(hitParams.isOverhead),
    Boolean(hitParams.isThrow)
  );
  const dmg = blocked ? hitParams.chipDamage : hitParams.damage;

  defender.hp = Math.max(0, defender.hp - dmg);
  attacker.totalDamageDealt += dmg;
  attacker.superMeter = clamp(
    attacker.superMeter + (state.mode === 'training' ? hitParams.superGainHit * 2 : hitParams.superGainHit),
    0,
    100
  );
  defender.superMeter = clamp(defender.superMeter + (blocked ? 3 : 6), 0, 100);

  state.hitstopTimer = Math.max(state.hitstopTimer, blocked ? hitParams.hitstop * 0.7 : hitParams.hitstop);
  defender.hitFlashTimer = blocked ? 0.04 : 0.085;

  const pushDir = attacker.x <= defender.x ? 1 : -1;

  if (blocked) {
    defender.state = 'block';
    defender.stateTimer = hitParams.blockstun;
    defender.currentMove = null;
    defender.vx = pushDir * hitParams.knockbackX * 0.55;
    addCameraTrauma(state.camera, 0.14);
    spawnHitBurst(state, hitParams.impactX, hitParams.impactY, false, attacker.slot);
    cues.push('block');

    // Ibu Tika Mode Omelan: blocked pressure fuels faster special recovery
    if (attacker.charId === 'tika') {
      attacker.omelanMeter = clamp(attacker.omelanMeter + 24, 0, 100);
      syncFighterFsmStatus(attacker);
    }

    // Guard Stamina depletion -> Burnout state
    const staminaCost = 6 + hitParams.damage * 0.65;
    defender.guardStamina = Math.max(0, defender.guardStamina - staminaCost);
    if (defender.guardStamina <= 0 && defender.hp > 0) {
      defender.burnoutTimer = 2.1;
      defender.state = 'burnout';
      defender.stateTimer = 0.55;
      defender.vx = pushDir * 155;
      if (defender.charId === 'iyen' && defender.tantrumCooldown <= 0) {
        triggerIyenTantrum(state, defender, attacker, cues);
      } else {
        syncFighterFsmStatus(defender);
      }
    }
  } else {
    if (defender.state === 'hitstun' || defender.vy > 0) {
      defender.comboCountReceived += 1;
    } else {
      defender.comboCountReceived = 1;
    }
    attacker.comboCountDealt = defender.comboCountReceived;
    attacker.comboDisplayTimer = 1.4;
    if (attacker.comboCountDealt > attacker.maxComboAchieved) {
      attacker.maxComboAchieved = attacker.comboCountDealt;
    }

    if (hitParams.isCough) {
      defender.coughTimer = 0.55;
    }

    const antiSpamKnockdown =
      !hitParams.isMultiHitPart &&
      !hitParams.knockdown &&
      defender.state === 'hitstun' &&
      defender.comboCountReceived >= 5;
    const effectiveKnockdown = hitParams.knockdown || antiSpamKnockdown;
    const effectiveKbX = antiSpamKnockdown
      ? Math.max(245, hitParams.knockbackX)
      : hitParams.knockbackX;
    const effectiveKbY = antiSpamKnockdown
      ? Math.max(225, hitParams.knockbackY)
      : hitParams.knockbackY;

    const heavy = hitParams.damage >= 11 || effectiveKnockdown;
    addCameraTrauma(state.camera, heavy ? 0.42 : 0.22);
    spawnHitBurst(state, hitParams.impactX, hitParams.impactY, heavy, attacker.slot);
    cues.push(heavy ? 'hit_heavy' : 'hit_light');

    defender.currentMove = null;
    defender.idleTime = 0;
    defender.vx = pushDir * effectiveKbX;

    // Dik Iyen Mode Rewel: cumulative heavy damage triggers automatic tantrum pushback
    if (defender.charId === 'iyen' && defender.hp > 0) {
      defender.damageTakenSinceTantrum += dmg;
      if (
        defender.damageTakenSinceTantrum >= 85 &&
        defender.tantrumCooldown <= 0 &&
        defender.y === 0 &&
        !effectiveKnockdown
      ) {
        triggerIyenTantrum(state, defender, attacker, cues);
        return;
      }
    }

    if (effectiveKnockdown || defender.hp <= 0) {
      const isKo = defender.hp <= 0;
      defender.state = isKo ? 'ko' : 'knockdown';
      defender.vy = Math.max(210, effectiveKbY);
      defender.stateTimer = 0.85;
      defender.squashX = 1.2;
      defender.squashY = 0.8;
      triggerDramaticSlowMo(
        state,
        defender.x,
        defender.y + 60,
        pushDir >= 0 ? 1 : -1,
        isKo,
        cues
      );
    } else {
      defender.state = 'hitstun';
      defender.stateTimer = hitParams.hitstun + (hitParams.isCough ? 0.1 : 0);
      if (hitParams.knockbackY > 0) {
        defender.vy = hitParams.knockbackY;
      }
      defender.squashX = 0.84;
      defender.squashY = 1.15;
    }
  }
}

function updateFighter(
  state: MatchState,
  f: FighterRuntime,
  opp: FighterRuntime,
  input: InputSnapshot,
  oppInput: InputSnapshot,
  dt: number,
  canControl: boolean,
  cues: SoundCue[],
  netOut?: NetReliablePacket[]
): void {
  const spec = CHARACTERS[f.charId];
  f.animTime += dt;
  f.hitFlashTimer = Math.max(0, f.hitFlashTimer - dt);
  f.invulnTimer = Math.max(0, f.invulnTimer - dt);
  f.comboDisplayTimer = Math.max(0, f.comboDisplayTimer - dt);
  f.parryWindowTimer = Math.max(0, f.parryWindowTimer - dt);
  f.counterActiveTimer = Math.max(0, f.counterActiveTimer - dt);
  f.tantrumCooldown = Math.max(0, f.tantrumCooldown - dt);
  f.lastTapTimer = Math.max(0, f.lastTapTimer - dt);
  f.coughTimer = Math.max(0, f.coughTimer - dt);

  if (f.burnoutTimer > 0) {
    f.burnoutTimer = Math.max(0, f.burnoutTimer - dt);
    if (f.burnoutTimer <= 0) {
      f.guardStamina = 100;
    }
  } else if (f.state !== 'block') {
    f.guardStamina = Math.min(100, f.guardStamina + dt * 14);
  }

  if (f.charId === 'tika' && f.omelanMeter > 0 && f.state !== 'attack') {
    f.omelanMeter = Math.max(0, f.omelanMeter - dt * 4.5);
  }

  if (f.comboDisplayTimer <= 0) {
    f.comboCountDealt = 0;
  }

  // Smooth trailing HP bar proportional to maxHp
  if (f.trailHp > f.hp) {
    f.trailHp = Math.max(f.hp, f.trailHp - dt * Math.max(42, f.maxHp * 0.32));
  } else {
    f.trailHp = f.hp;
  }

  // Training mode auto-heal & meter top-up when idle
  if (state.mode === 'training') {
    if (f.slot === 2 && f.state === 'idle' && f.hp < f.maxHp) {
      f.hp = Math.min(f.maxHp, f.hp + dt * Math.max(60, f.maxHp * 0.35));
    }
    if (f.slot === 1 && f.superMeter < 100 && f.state === 'idle') {
      f.superMeter = Math.min(100, f.superMeter + dt * 16);
    }
  }

  // Damping squash and stretch back to 1
  f.squashX += (1 - f.squashX) * (1 - Math.exp(-16 * dt));
  f.squashY += (1 - f.squashY) * (1 - Math.exp(-16 * dt));

  // Auto face opponent when neutral/idle/walking/crouching/blocking
  if (
    f.y === 0 &&
    (f.state === 'idle' ||
      f.state === 'walk_fwd' ||
      f.state === 'walk_back' ||
      f.state === 'crouch' ||
      f.state === 'block' ||
      f.state === 'burnout')
  ) {
    if (Math.abs(opp.x - f.x) > 8) {
      f.facing = opp.x >= f.x ? 1 : -1;
    }
  }

  // Track fresh block edge for Ibu Tika Perfect Parry
  const freshBlockPress = input.blockHeld && !f.wasBlockHeld;
  f.wasBlockHeld = input.blockHeld;
  if (
    canControl &&
    f.charId === 'tika' &&
    freshBlockPress &&
    f.y === 0 &&
    f.burnoutTimer <= 0 &&
    (f.state === 'idle' || f.state === 'walk_fwd' || f.state === 'walk_back' || f.state === 'crouch' || f.state === 'block')
  ) {
    f.parryWindowTimer = 0.1; // 6-frame (100ms) Perfect Parry window
  }

  // Track double-tap horizontal direction for Dash / Backstep
  const tapDirNow: -1 | 0 | 1 = input.moveX > 0.55 ? 1 : input.moveX < -0.55 ? -1 : 0;
  const wasDirNeutral = Math.abs(f.prevMoveX) <= 0.4;
  f.prevMoveX = input.moveX;
  let doubleTapDir: -1 | 0 | 1 = 0;
  if (canControl && wasDirNeutral && tapDirNow !== 0) {
    if (f.lastTapX === tapDirNow && f.lastTapTimer > 0) {
      doubleTapDir = tapDirNow;
      f.lastTapX = 0;
      f.lastTapTimer = 0;
    } else {
      f.lastTapX = tapDirNow;
      f.lastTapTimer = 0.26;
    }
  }

  // Buffer inputs during attacks
  if (canControl && (f.state === 'attack' || f.state === 'counter_stance') && f.currentMove) {
    if (input.superPressed && f.superMeter >= 100 && f.currentMove.id !== 'super') {
      f.bufferedMove = 'super';
      f.bufferTimer = 0.2;
    } else if (input.spPressed && !f.currentMove.id.startsWith('sp') && f.currentMove.id !== 'super') {
      f.bufferedMove = resolveSpecialMoveId(f, input);
      f.bufferTimer = 0.2;
    } else if (input.punchPressed && f.currentMove.chainNext) {
      const nextP = f.currentMove.chainNext.find((m) => m.startsWith('p'));
      if (nextP) {
        f.bufferedMove = nextP;
        f.bufferTimer = 0.22;
      }
    } else if (input.kickPressed && f.currentMove.chainNext) {
      const nextK = f.currentMove.chainNext.find((m) => m.startsWith('k') || m === 'crouch_k');
      if (nextK) {
        f.bufferedMove = nextK;
        f.bufferTimer = 0.22;
      }
    }
  }

  if (f.bufferTimer > 0) {
    f.bufferTimer -= dt;
    if (f.bufferTimer <= 0) f.bufferedMove = null;
  }

  // State updates
  if (f.state === 'hitstun' || f.state === 'block' || f.state === 'burnout') {
    f.stateTimer -= dt;
    f.vx *= Math.exp(-9 * dt);
    if (f.stateTimer <= 0) {
      f.state = f.y > 0 ? 'jump' : 'idle';
      f.comboCountReceived = 0;
    }
  } else if (f.state === 'tantrum') {
    f.stateTimer -= dt;
    f.vx = 0;
    if (f.stateTimer <= 0) {
      f.state = 'idle';
    }
  } else if (f.state === 'dash' || f.state === 'backstep') {
    f.dashTimer -= dt;
    const isDash = f.state === 'dash';
    f.vx = f.dashDir * (isDash ? spec.dashSpeed : spec.backstepSpeed);
    if (isDash) f.walkPhase += Math.abs(f.vx) * dt * 0.036;
    if (canControl && input.superPressed && f.superMeter >= 100) {
      startMove(state, f, 'super', cues, netOut);
    } else if (canControl && input.spPressed) {
      startMove(state, f, resolveSpecialMoveId(f, input), cues, netOut);
    } else if (canControl && isDash && input.punchPressed) {
      startMove(state, f, 'p1', cues, netOut);
    } else if (canControl && isDash && input.kickPressed) {
      startMove(state, f, 'k1', cues, netOut);
    } else if (f.dashTimer <= 0) {
      f.state = 'idle';
      f.vx = 0;
      f.dashDir = 0;
    }
  } else if (f.state === 'knockdown') {
    f.vx *= Math.exp(-4.5 * dt);
    if (f.y === 0) {
      f.stateTimer -= dt;
      if (f.stateTimer <= 0) {
        f.state = 'wakeup';
        // Pilar 3: Adnan slower encok wakeup when burned out or combo'd; Dhira fast Back Rise!
        if (f.charId === 'adnan' && (f.burnoutTimer > 0 || f.comboCountReceived >= 3)) {
          f.stateTimer = 0.44;
          f.invulnTimer = 0.62;
          f.backRiseActive = false;
        } else if (f.charId === 'dhira') {
          f.stateTimer = 0.22;
          f.invulnTimer = 0.52;
          f.backRiseActive = true;
        } else {
          f.stateTimer = 0.28;
          f.invulnTimer = 0.55;
          f.backRiseActive = false;
        }
        f.comboCountReceived = 0;
      }
    }
  } else if (f.state === 'wakeup') {
    f.stateTimer -= dt;
    f.vx = f.backRiseActive ? -f.facing * 255 : 0;
    if (f.stateTimer <= 0) {
      f.backRiseActive = false;
      f.vx = 0;
      f.state = 'idle';
    }
  } else if (f.state === 'ko') {
    f.vx *= Math.exp(-3.5 * dt);
  } else if (f.state === 'victory') {
    f.vx = 0;
    f.currentMove = null;
  } else if ((f.state === 'attack' || f.state === 'counter_stance') && f.currentMove) {
    const move = f.currentMove;
    f.moveTimer += dt;
    const effRecovery = getEffectiveMoveRecovery(f, move);
    const total = move.startup + move.active + effRecovery;

    if (f.y === 0) {
      f.vx *= Math.exp(-7 * dt);
    }

    if (f.moveTimer >= move.startup && f.moveTimer <= move.startup + move.active) {
      if (move.isCounterStance) {
        f.counterActiveTimer = 0.05;
      } else if (move.multiHitCount && move.multiHitCount > 1) {
        f.multiHitCooldown -= dt;
        if (f.multiHitCooldown <= 0 && f.moveHitsRemaining > 0) {
          const box = getMoveHitboxWorld(f, move);
          const oppHurt = getFighterHurtbox(opp);
          if (boxesOverlap(box, oppHurt)) {
            f.moveHitsRemaining -= 1;
            f.multiHitCooldown = move.active / (move.multiHitCount + 0.3);
            const isFinalHit = f.moveHitsRemaining === 0;
            const tikaLowFinisher =
              isFinalHit && f.charId === 'tika' && move.id === 'sp_down' && input.moveY < -0.45;
            applyHitToDefender(
              state,
              f,
              opp,
              oppInput,
              {
                damage: move.damage,
                chipDamage: move.chipDamage,
                hitstun: move.hitstun,
                blockstun: move.blockstun,
                hitstop: isFinalHit ? 0.075 : move.hitstop,
                knockbackX: isFinalHit ? move.knockbackX : 55,
                knockbackY: isFinalHit ? move.knockbackY : 50,
                knockdown: isFinalHit ? Boolean(move.knockdown) : false,
                height: tikaLowFinisher ? 'low' : move.height,
                isOverhead: tikaLowFinisher ? false : Boolean(move.isOverhead && isFinalHit),
                superGainHit: move.superGainHit,
                impactX: (Math.max(box.left, oppHurt.left) + Math.min(box.right, oppHurt.right)) * 0.5,
                impactY: (Math.max(box.bottom, oppHurt.bottom) + Math.min(box.top, oppHurt.top)) * 0.5,
                isMultiHitPart: !isFinalHit,
              },
              cues,
              netOut
            );
          }
        }
      } else if (!f.moveHitLanded && !move.projectileType) {
        const box = getMoveHitboxWorld(f, move);
        const oppHurt = getFighterHurtbox(opp);
        if (boxesOverlap(box, oppHurt)) {
          f.moveHitLanded = true;
          applyHitToDefender(
            state,
            f,
            opp,
            oppInput,
            {
              damage: move.damage,
              chipDamage: move.chipDamage,
              hitstun: move.hitstun,
              blockstun: move.blockstun,
              hitstop: move.hitstop,
              knockbackX: move.knockbackX,
              knockbackY: move.knockbackY,
              knockdown: Boolean(move.knockdown),
              height: move.height,
              isOverhead: Boolean(move.isOverhead),
              isThrow: Boolean(move.isThrow),
              superGainHit: move.superGainHit,
              impactX: (Math.max(box.left, oppHurt.left) + Math.min(box.right, oppHurt.right)) * 0.5,
              impactY: (Math.max(box.bottom, oppHurt.bottom) + Math.min(box.top, oppHurt.top)) * 0.5,
            },
            cues,
            netOut
          );
        }
      }
    }

    // Chain cancel window
    if (
      canControl &&
      !move.isCounterStance &&
      f.bufferedMove &&
      (f.moveTimer >= move.startup + move.active * 0.6 || (f.moveHitLanded && f.moveTimer >= move.startup + 0.04))
    ) {
      const next = f.bufferedMove;
      startMove(state, f, next, cues, netOut);
      return;
    }

    if (f.moveTimer >= total) {
      f.currentMove = null;
      f.counterActiveTimer = 0;
      f.state = f.y > 0 ? 'jump' : 'idle';
    }
  } else if (canControl) {
    const closeForThrow = f.y === 0 && opp.y === 0 && Math.abs(opp.x - f.x) <= 95;
    const throwTriggered =
      closeForThrow &&
      ((input.punchPressed && input.kickHeld) ||
        (input.kickPressed && input.punchHeld) ||
        (input.punchPressed && input.kickPressed));

    if (input.superPressed && f.superMeter >= 100) {
      startMove(state, f, 'super', cues, netOut);
    } else if (throwTriggered) {
      startMove(state, f, 'throw', cues, netOut);
    } else if (input.spPressed) {
      startMove(state, f, resolveSpecialMoveId(f, input), cues, netOut);
    } else if (input.punchPressed) {
      if (f.y > 0) startMove(state, f, 'air_p', cues, netOut);
      else if (input.moveY < -0.45) startMove(state, f, 'crouch_p', cues, netOut);
      else startMove(state, f, 'p1', cues, netOut);
    } else if (input.kickPressed) {
      if (f.y > 0) startMove(state, f, 'air_k', cues, netOut);
      else if (input.moveY < -0.45) startMove(state, f, 'crouch_k', cues, netOut);
      else startMove(state, f, 'k1', cues, netOut);
    } else if (f.y === 0) {
      if (input.blockHeld && f.burnoutTimer <= 0) {
        f.state = 'block';
        f.vx = 0;
        f.idleTime = 0;
      } else if (doubleTapDir !== 0) {
        const isDash = doubleTapDir === f.facing;
        f.state = isDash ? 'dash' : 'backstep';
        f.dashDir = doubleTapDir;
        f.dashTimer = isDash ? (f.charId === 'adnan' ? 0.24 : 0.2) : f.charId === 'adnan' ? 0.28 : 0.24;
        if (!isDash) {
          f.invulnTimer = f.charId === 'adnan' ? 0.15 : f.charId === 'dhira' ? 0.14 : 0.12;
        }
        f.idleTime = 0;
        cues.push('dash');
        spawnParticle(state, f.x, 6, 0, -doubleTapDir * 85, 35, 0, 14, 0.22, 'dust', f.slot);
      } else if (input.moveY > 0.5) {
        f.state = 'jump';
        f.vy = spec.jumpVelocity;
        f.vx = Math.abs(input.moveX) > 0.25 ? Math.sign(input.moveX) * spec.walkSpeed * 0.92 : 0;
        f.squashX = 0.84;
        f.squashY = 1.18;
        f.idleTime = 0;
        cues.push('jump');
        spawnParticle(state, f.x, 4, 0, -40, 45, 0, 14, 0.22, 'dust');
        spawnParticle(state, f.x, 4, 0, 40, 45, 0, 14, 0.22, 'dust');
      } else if (input.moveY < -0.45) {
        f.state = 'crouch';
        f.vx = 0;
        f.idleTime = 0;
      } else if (Math.abs(input.moveX) > 0.22) {
        const dir = Math.sign(input.moveX);
        const isForward = dir === f.facing;
        const magerWalkMult = f.charId === 'adnan' && f.magerArmorHits > 0 ? 0.72 : 1;
        f.state = isForward ? 'walk_fwd' : 'walk_back';
        f.vx = dir * (isForward ? spec.walkSpeed : spec.backSpeed) * magerWalkMult;
        f.walkPhase += Math.abs(f.vx) * dt * 0.032;
        f.idleTime = 0;
      } else {
        f.state = 'idle';
        f.vx = 0;
        if (f.charId === 'adnan') {
          f.idleTime += dt;
          if (f.idleTime >= 2.0 && f.magerArmorHits <= 0) {
            f.magerArmorHits = 1;
          }
        }
      }
    }
  } else {
    if (f.y === 0) {
      f.vx = 0;
      f.state = 'idle';
    }
  }

  syncFighterFsmStatus(f);

  // Integrate position & gravity
  const wasAirborne = f.y > 0;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  if (f.y > 0 || f.vy > 0) {
    f.vy -= spec.gravity * dt;
  }
  if (f.y <= 0) {
    f.y = 0;
    f.vy = 0;
    if (wasAirborne) {
      f.squashX = 1.22;
      f.squashY = 0.78;
      if (f.state === 'knockdown' || f.state === 'ko') {
        addCameraTrauma(state.camera, 0.28);
        cues.push('body_slam');
        spawnParticle(state, f.x, 4, 0, 0, 0, 0, 70, 0.34, 'shockwave_ground', opp.slot);
        spawnParticle(state, f.x - 24, 4, 0, -90, 50, 0, 16, 0.28, 'dust', f.slot);
        spawnParticle(state, f.x + 24, 4, 0, 90, 50, 0, 16, 0.28, 'dust', f.slot);
      } else {
        if (f.state === 'jump') {
          f.state = 'idle';
        } else if (f.state === 'attack' && (f.currentMove?.id === 'air_p' || f.currentMove?.id === 'air_k')) {
          f.currentMove = null;
          f.state = 'idle';
        }
        cues.push('land');
        spawnParticle(state, f.x - 16, 4, 0, -65, 35, 0, 12, 0.2, 'dust');
        spawnParticle(state, f.x + 16, 4, 0, 65, 35, 0, 12, 0.2, 'dust');
      }
    }
  }

  const halfBody = spec.hurtboxWidth * 0.5;
  f.x = clamp(f.x, -ARENA_HALF_WIDTH + halfBody, ARENA_HALF_WIDTH - halfBody);
}

function resolvePushboxes(p1: FighterRuntime, p2: FighterRuntime): void {
  if (p1.state === 'ko' || p2.state === 'ko') return;
  const spec1 = CHARACTERS[p1.charId];
  const spec2 = CHARACTERS[p2.charId];
  const minDist = (spec1.hurtboxWidth + spec2.hurtboxWidth) * 0.44;
  const verticalClose = Math.abs(p1.y - p2.y) < Math.min(spec1.standingHeight, spec2.standingHeight) * 0.75;
  if (!verticalClose) return;

  const dx = p2.x - p1.x;
  const absDx = Math.abs(dx);
  if (absDx < minDist) {
    const overlap = (minDist - absDx) * 0.5;
    const sign = dx >= 0 ? 1 : -1;
    p1.x -= sign * overlap;
    p2.x += sign * overlap;

    const h1 = spec1.hurtboxWidth * 0.5;
    const h2 = spec2.hurtboxWidth * 0.5;
    p1.x = clamp(p1.x, -ARENA_HALF_WIDTH + h1, ARENA_HALF_WIDTH - h1);
    p2.x = clamp(p2.x, -ARENA_HALF_WIDTH + h2, ARENA_HALF_WIDTH - h2);
  }
}

function updateProjectiles(
  state: MatchState,
  p1Input: InputSnapshot,
  p2Input: InputSnapshot,
  dt: number,
  cues: SoundCue[],
  onlineLocalSlot?: 1 | 2,
  netOut?: NetReliablePacket[]
): void {
  for (const proj of state.projectiles) {
    if (!proj.active) continue;
    proj.life += dt;
    proj.spinAngle += dt * 16;
    if (proj.life >= proj.maxLife) {
      proj.active = false;
      continue;
    }

    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;
    proj.vy -= proj.gravity * dt;

    // Bounce off floor
    if (proj.y <= proj.radius && proj.vy < 0) {
      if (proj.bouncesLeft > 0) {
        proj.y = proj.radius;
        proj.vy = Math.abs(proj.vy) * 0.76;
        proj.bouncesLeft -= 1;
        spawnParticle(state, proj.x, 4, 0, -40, 50, 0, 8, 0.16, 'dust');
      } else if (proj.type === 'buku_rain') {
        spawnParticle(state, proj.x, 6, 0, 0, 40, 0, 14, 0.18, 'dust');
        proj.active = false;
        continue;
      } else {
        proj.y = proj.radius;
        proj.vy = 0;
      }
    }

    // Bounce off arena walls if bouncing marble storm
    if (Math.abs(proj.x) > ARENA_HALF_WIDTH - 15) {
      if (proj.bouncesLeft > 0) {
        proj.vx = -proj.vx;
        proj.x = clamp(proj.x, -ARENA_HALF_WIDTH + 15, ARENA_HALF_WIDTH - 15);
        proj.bouncesLeft -= 1;
      } else {
        proj.active = false;
        continue;
      }
    }

    const attacker = proj.ownerSlot === 1 ? state.p1 : state.p2;
    const defender = proj.ownerSlot === 1 ? state.p2 : state.p1;
    const defenderInput = proj.ownerSlot === 1 ? p2Input : p1Input;

    const projBox = {
      left: proj.x - proj.radius,
      right: proj.x + proj.radius,
      bottom: proj.y - proj.radius,
      top: proj.y + proj.radius,
    };

    // Ayah Adnan Putaran Pemalas reflector: deflects moving projectiles back!
    if (
      proj.type !== 'kelereng_trap' &&
      proj.type !== 'buku_stack' &&
      defender.state === 'attack' &&
      defender.currentMove?.isReflector &&
      defender.moveTimer >= defender.currentMove.startup &&
      defender.moveTimer <= defender.currentMove.startup + defender.currentMove.active
    ) {
      const refBox = getMoveHitboxWorld(defender, defender.currentMove);
      if (boxesOverlap(projBox, refBox)) {
        proj.ownerSlot = defender.slot;
        proj.vx = defender.facing * Math.max(440, Math.abs(proj.vx) * 1.15);
        proj.life = 0;
        cues.push('parry');
        spawnHitBurst(state, proj.x, proj.y, false, defender.slot);
        continue;
      }
    }

    if (onlineLocalSlot && proj.ownerSlot !== onlineLocalSlot) {
      continue;
    }

    // Floor marble trap only trips opponents walking/running/dashing on ground
    if (proj.type === 'kelereng_trap') {
      const oppMovingOnGround =
        defender.y <= 4 &&
        (Math.abs(defender.vx) > 45 ||
          defender.state === 'dash' ||
          defender.state === 'walk_fwd' ||
          defender.state === 'walk_back');
      if (!oppMovingOnGround) continue;
    }

    const hurt = getFighterHurtbox(defender);

    if (boxesOverlap(projBox, hurt)) {
      applyHitToDefender(
        state,
        attacker,
        defender,
        defenderInput,
        {
          damage: proj.damage,
          chipDamage: proj.chipDamage,
          hitstun: proj.hitstun,
          blockstun: 0.16,
          hitstop: proj.hitstop,
          knockbackX: proj.knockbackX,
          knockbackY: proj.knockbackY,
          knockdown: proj.knockdown,
          height: proj.height,
          isThrow: proj.type === 'kelereng_trap',
          isCough: proj.type === 'dust_cloud',
          superGainHit: 6,
          impactX: proj.x,
          impactY: proj.y,
        },
        cues,
        netOut
      );
      proj.hitsLeft -= 1;
      if (proj.hitsLeft <= 0) {
        proj.active = false;
      }
    }
  }
}

function updateParticles(state: MatchState, dt: number): void {
  for (const pt of state.particles) {
    if (!pt.active) continue;
    pt.life += dt;
    if (pt.life >= pt.maxLife) {
      pt.active = false;
      continue;
    }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.z += pt.vz * dt;
    if (pt.kind === 'spark') {
      pt.vy -= 420 * dt;
    }
  }
}

function advanceRoundStateMachine(
  state: MatchState,
  dt: number,
  simDt: number,
  cues: SoundCue[]
): void {
  if (state.roundPhase === 'intro') {
    state.phaseTimer -= dt;
    const isRound1 = state.roundNumber === 1;
    const t3 = isRound1 ? 2.7 : 2.65;
    const t2 = isRound1 ? 2.0 : 1.95;
    const t1 = isRound1 ? 1.3 : 1.25;
    const tFight = isRound1 ? 0.6 : 0.55;

    if (state.phaseTimer <= tFight) {
      if (state.bannerText !== 'FIGHT!') {
        state.bannerText = 'FIGHT!';
        state.subBannerText = '';
        cues.push('fight_call');
      }
    } else if (state.phaseTimer <= t1) {
      if (state.bannerText !== '1') {
        state.bannerText = '1';
        state.subBannerText = `ROUND ${state.roundNumber}`;
        cues.push('countdown_tick');
      }
    } else if (state.phaseTimer <= t2) {
      if (state.bannerText !== '2') {
        state.bannerText = '2';
        state.subBannerText = `ROUND ${state.roundNumber}`;
        cues.push('countdown_tick');
      }
    } else if (state.phaseTimer <= t3) {
      if (state.bannerText !== '3') {
        state.bannerText = '3';
        state.subBannerText = `ROUND ${state.roundNumber}`;
        cues.push('countdown_tick');
      }
    }

    if (state.phaseTimer <= 0) {
      state.roundPhase = 'fight';
      state.bannerText = '';
      state.subBannerText = '';
    }
  } else if (state.roundPhase === 'fight') {
    state.roundTimer = Math.max(0, state.roundTimer - simDt);

    if (state.p1.hp <= 0 || state.p2.hp <= 0) {
      state.roundPhase = 'ko';
      state.phaseTimer = 1.9;
      state.bannerText = 'K.O.!';
      state.subBannerText =
        state.p1.hp <= 0 && state.p2.hp <= 0
          ? 'DOUBLE K.O.!'
          : state.p2.hp <= 0
            ? `${CHARACTERS[state.p1.charId].name} MENANG!`
            : `${CHARACTERS[state.p2.charId].name} MENANG!`;
      if (state.p2.hp <= 0 && state.p1.hp > 0) {
        state.p1.roundsWon += 1;
        state.p1.currentMove = null;
        state.p1.state = 'victory';
      } else if (state.p1.hp <= 0 && state.p2.hp > 0) {
        state.p2.roundsWon += 1;
        state.p2.currentMove = null;
        state.p2.state = 'victory';
      }
      cues.push('ko_call');
    } else if (state.roundTimer <= 0) {
      state.roundPhase = 'timeover';
      state.phaseTimer = 1.9;
      state.bannerText = 'TIME OVER';
      const p1Pct = state.p1.hp / state.p1.maxHp;
      const p2Pct = state.p2.hp / state.p2.maxHp;
      if (p1Pct > p2Pct) {
        state.p1.roundsWon += 1;
        state.p1.currentMove = null;
        state.p1.state = 'victory';
        state.subBannerText = `${CHARACTERS[state.p1.charId].name} UNGGUL!`;
      } else if (p2Pct > p1Pct) {
        state.p2.roundsWon += 1;
        state.p2.currentMove = null;
        state.p2.state = 'victory';
        state.subBannerText = `${CHARACTERS[state.p2.charId].name} UNGGUL!`;
      } else {
        state.subBannerText = 'SERI!';
      }
      cues.push('ko_call');
    }
  } else if (state.roundPhase === 'ko' || state.roundPhase === 'timeover') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      if (state.p1.roundsWon >= 2 || state.p2.roundsWon >= 2) {
        state.roundPhase = 'match_end';
        state.winnerSlot = state.p1.roundsWon >= 2 ? 1 : 2;
        const winner = state.winnerSlot === 1 ? state.p1 : state.p2;
        winner.currentMove = null;
        winner.state = 'victory';
        state.bannerText = 'VICTORY!';
        state.subBannerText = `${CHARACTERS[winner.charId].name} JUARA!`;
        cues.push('victory_call');
      } else {
        resetForNextRound(state);
        cues.push('round_call');
      }
    }
  }
}

export function stepMatch(
  state: MatchState,
  p1Input: InputSnapshot,
  p2Input: InputSnapshot,
  rawDt: number
): SoundCue[] {
  const dt = Math.min(rawDt, 0.05);
  const cues: SoundCue[] = [];
  state.matchTimeElapsed += dt;

  updateDramaticSlowMo(state, dt);
  const simDt = dt * state.timeScale;
  updateParticles(state, simDt);
  if (state.pendingSuperBannerTimer > 0) {
    state.pendingSuperBannerTimer = Math.max(0, state.pendingSuperBannerTimer - dt);
  }
  updateCamera(state.camera, state.p1.x, state.p1.y, state.p2.x, state.p2.y, dt, state.matchTimeElapsed);

  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    state.p1.hitFlashTimer = Math.max(0, state.p1.hitFlashTimer - dt);
    state.p2.hitFlashTimer = Math.max(0, state.p2.hitFlashTimer - dt);
    return cues;
  }

  if (state.mode !== 'training') {
    advanceRoundStateMachine(state, dt, simDt, cues);
  }

  const canFight = state.roundPhase === 'fight';
  updateFighter(state, state.p1, state.p2, p1Input, p2Input, simDt, canFight, cues);
  updateFighter(state, state.p2, state.p1, p2Input, p1Input, simDt, canFight, cues);
  resolvePushboxes(state.p1, state.p2);
  updateProjectiles(state, p1Input, p2Input, simDt, cues);

  return cues;
}

export function stepOnlineMatch(
  state: MatchState,
  localRole: OnlineRole,
  localInput: InputSnapshot,
  remoteTarget: RemoteInterpTarget,
  rawDt: number
): { cues: SoundCue[]; netPackets: NetReliablePacket[] } {
  const dt = Math.min(rawDt, 0.05);
  const cues: SoundCue[] = [];
  const netPackets: NetReliablePacket[] = [];
  state.matchTimeElapsed += dt;

  updateDramaticSlowMo(state, dt);
  const simDt = dt * state.timeScale;
  updateParticles(state, simDt);
  if (state.pendingSuperBannerTimer > 0) {
    state.pendingSuperBannerTimer = Math.max(0, state.pendingSuperBannerTimer - dt);
  }
  updateCamera(state.camera, state.p1.x, state.p1.y, state.p2.x, state.p2.y, dt, state.matchTimeElapsed);

  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    state.p1.hitFlashTimer = Math.max(0, state.p1.hitFlashTimer - dt);
    state.p2.hitFlashTimer = Math.max(0, state.p2.hitFlashTimer - dt);
    return { cues, netPackets };
  }

  if (localRole === 'host') {
    const prevPhase = state.roundPhase;
    const prevBanner = state.bannerText;
    const prevSec = Math.ceil(state.roundTimer);

    advanceRoundStateMachine(state, dt, simDt, cues);

    const curSec = Math.ceil(state.roundTimer);
    if (prevPhase !== state.roundPhase || prevBanner !== state.bannerText || prevSec !== curSec) {
      netPackets.push({
        t: 'round',
        phase: state.roundPhase,
        num: state.roundNumber,
        timer: state.roundTimer,
        banner: state.bannerText,
        sub: state.subBannerText,
        p1Wins: state.p1.roundsWon,
        p2Wins: state.p2.roundsWon,
        winner: state.winnerSlot,
      });
    }
  } else {
    if (state.roundPhase === 'fight') {
      state.roundTimer = Math.max(0, state.roundTimer - simDt);
    }
  }

  const localSlot: 1 | 2 = localRole === 'host' ? 1 : 2;
  const localFighter = localSlot === 1 ? state.p1 : state.p2;
  const remoteFighter = localSlot === 1 ? state.p2 : state.p1;
  const canFight = state.roundPhase === 'fight';

  updateFighter(
    state,
    localFighter,
    remoteFighter,
    localInput,
    createEmptyInput(),
    simDt,
    canFight,
    cues,
    netPackets
  );
  interpolateRemoteFighter(remoteFighter, remoteTarget, simDt);
  resolvePushboxes(state.p1, state.p2);
  updateProjectiles(state, localInput, localInput, simDt, cues, localSlot, netPackets);

  return { cues, netPackets };
}

export function receiveNetHit(
  state: MatchState,
  localRole: OnlineRole,
  localInput: InputSnapshot,
  pkt: Extract<NetReliablePacket, { t: 'hit' }>,
  cues: SoundCue[]
): Extract<NetReliablePacket, { t: 'hp_sync' }> {
  const defender = localRole === 'host' ? state.p1 : state.p2;
  const attacker = localRole === 'host' ? state.p2 : state.p1;
  const prevHp = defender.hp;

  applyHitToDefender(
    state,
    attacker,
    defender,
    localInput,
    {
      damage: pkt.dmg,
      chipDamage: pkt.chip,
      hitstun: pkt.hitstun,
      blockstun: pkt.blockstun,
      hitstop: pkt.hitstop,
      knockbackX: pkt.kbx,
      knockbackY: pkt.kby,
      knockdown: pkt.kd,
      height: pkt.height,
      superGainHit: pkt.superGain,
      impactX: pkt.ix,
      impactY: pkt.iy,
    },
    cues
  );

  const blocked = defender.state === 'block' || (prevHp - defender.hp <= pkt.chip && pkt.dmg > pkt.chip);
  return {
    t: 'hp_sync',
    hp: defender.hp,
    blocked,
    combo: defender.comboCountReceived,
    sm: defender.superMeter,
    st: defender.state,
  };
}

export function receiveNetHpSync(
  state: MatchState,
  localRole: OnlineRole,
  pkt: Extract<NetReliablePacket, { t: 'hp_sync' }>
): void {
  const localFighter = localRole === 'host' ? state.p1 : state.p2;
  const remoteFighter = localRole === 'host' ? state.p2 : state.p1;
  const dmg = Math.max(0, remoteFighter.hp - pkt.hp);
  remoteFighter.hp = pkt.hp;
  remoteFighter.superMeter = pkt.sm;
  remoteFighter.state = pkt.st;
  localFighter.totalDamageDealt += dmg;
  if (!pkt.blocked && pkt.combo > 0) {
    localFighter.comboCountDealt = pkt.combo;
    localFighter.comboDisplayTimer = 1.4;
    if (pkt.combo > localFighter.maxComboAchieved) {
      localFighter.maxComboAchieved = pkt.combo;
    }
  }
}

export function receiveNetProjectile(
  state: MatchState,
  localRole: OnlineRole,
  pkt: Extract<NetReliablePacket, { t: 'proj' }>
): void {
  const remoteSlot: 1 | 2 = localRole === 'host' ? 2 : 1;
  spawnProjectile(state, {
    ownerSlot: remoteSlot,
    type: pkt.type,
    x: pkt.x,
    y: pkt.y,
    z: pkt.z,
    vx: pkt.vx,
    vy: pkt.vy,
    gravity: pkt.g,
    radius: pkt.r,
    damage: pkt.dmg,
    chipDamage: pkt.chip,
    hitstun: pkt.hitstun,
    hitstop: pkt.hitstop,
    knockbackX: pkt.kbx,
    knockbackY: pkt.kby,
    knockdown: pkt.kd,
    height: pkt.height,
    bouncesLeft: pkt.bounces,
    maxLife: pkt.maxLife,
    hitsLeft: 1,
  });
}

export function receiveNetRoundSync(
  state: MatchState,
  pkt: Extract<NetReliablePacket, { t: 'round' }>,
  cues: SoundCue[]
): void {
  if (pkt.num > state.roundNumber) {
    state.p1.roundsWon = pkt.p1Wins;
    state.p2.roundsWon = pkt.p2Wins;
    resetForNextRound(state);
    cues.push('round_call');
  }
  if (state.bannerText !== pkt.banner) {
    if (pkt.banner === 'FIGHT!') cues.push('fight_call');
    else if (pkt.banner === '3' || pkt.banner === '2' || pkt.banner === '1') cues.push('countdown_tick');
    else if (pkt.banner === 'K.O.!' || pkt.banner === 'TIME OVER') cues.push('ko_call');
  }
  if (pkt.phase === 'match_end' && state.roundPhase !== 'match_end') {
    cues.push('victory_call');
  }
  state.roundPhase = pkt.phase;
  state.roundNumber = pkt.num;
  state.roundTimer = pkt.timer;
  state.bannerText = pkt.banner;
  state.subBannerText = pkt.sub;
  state.p1.roundsWon = pkt.p1Wins;
  state.p2.roundsWon = pkt.p2Wins;
  state.winnerSlot = pkt.winner;
  if (pkt.phase === 'match_end' && pkt.winner) {
    const winner = pkt.winner === 1 ? state.p1 : state.p2;
    winner.state = 'victory';
    winner.currentMove = null;
    winner.vx = 0;
  }
}
