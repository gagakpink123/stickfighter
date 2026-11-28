import { ARENA_HALF_WIDTH, clamp, damp } from './math3d';
import { StageId } from './types';

export type CatBehavior =
  | 'walk'
  | 'sit'
  | 'lick_tail'
  | 'wash_face'
  | 'stretch'
  | 'loaf_nap'
  | 'pounce_hop'
  | 'jump_to_perch'
  | 'jump_to_floor';

export type DynamicPerchKind = 'park_swing_seat';

export interface CatPerchSpot {
  id: string;
  name: string;
  x: number;
  y: number;
  zGame: number;
  approachX: number;
  approachZGame: number;
  dynamicKind?: DynamicPerchKind;
}

export interface StageCatZone {
  floorY: number;
  floorZGame: number;
  minX: number;
  maxX: number;
  waypoints: readonly number[];
  perches: readonly CatPerchSpot[];
}

/** Cat can freely roam all the way near the leftmost & rightmost arena markers (±470). */
export const CAT_ARENA_MIN_X = -(ARENA_HALF_WIDTH - 10);
export const CAT_ARENA_MAX_X = ARENA_HALF_WIDTH - 10;

export function getParkSwingSeatPos(elapsed: number): {
  x: number;
  seatCenterY: number;
  seatTopY: number;
  zGame: number;
} {
  const zGame = 235 + Math.sin(elapsed * 2.1) * 26;
  const seatCenterY = 44 + Math.abs(Math.sin(elapsed * 2.1)) * 8;
  return {
    x: 345,
    seatCenterY,
    seatTopY: seatCenterY + 3,
    zGame,
  };
}

export const STAGE_CAT_ZONES: Record<StageId, StageCatZone> = {
  living_room: {
    floorY: 0,
    floorZGame: 182,
    minX: CAT_ARENA_MIN_X,
    maxX: CAT_ARENA_MAX_X,
    waypoints: [-455, -330, -210, -95, 0, 95, 210, 330, 455],
    perches: [
      {
        id: 'sofa',
        name: 'sofa',
        x: -345,
        y: 61,
        zGame: 224,
        approachX: -248,
        approachZGame: 184,
      },
      {
        id: 'coffee_table',
        name: 'coffee_table',
        x: -335,
        y: 28,
        zGame: 145,
        approachX: -278,
        approachZGame: 180,
      },
      {
        id: 'tv_stand',
        name: 'tv_stand',
        x: 292,
        y: 55,
        zGame: 232,
        approachX: 252,
        approachZGame: 184,
      },
      {
        id: 'tv_top',
        name: 'tv',
        x: 312,
        y: 126,
        zGame: 244,
        approachX: 272,
        approachZGame: 186,
      },
    ],
  },
  dojo: {
    floorY: 0,
    floorZGame: 188,
    minX: CAT_ARENA_MIN_X,
    maxX: CAT_ARENA_MAX_X,
    waypoints: [-455, -340, -215, -100, 0, 100, 215, 340, 455],
    perches: [
      {
        id: 'dojo_bench',
        name: 'bangku_dojo',
        x: -346,
        y: 23,
        zGame: 238,
        approachX: -290,
        approachZGame: 190,
      },
      {
        id: 'dojo_cabinet',
        name: 'lemari_dojo',
        x: 346,
        y: 58,
        zGame: 238,
        approachX: 290,
        approachZGame: 190,
      },
    ],
  },
  park: {
    floorY: 0,
    floorZGame: 162,
    minX: CAT_ARENA_MIN_X,
    maxX: CAT_ARENA_MAX_X,
    waypoints: [-455, -335, -215, -95, 0, 95, 215, 335, 455],
    perches: [
      {
        id: 'swing_seat',
        name: 'ayunan',
        x: 345,
        y: 47,
        zGame: 235,
        approachX: 295,
        approachZGame: 166,
        dynamicKind: 'park_swing_seat',
      },
      {
        id: 'swing_beam',
        name: 'tiang_ayunan',
        x: 345,
        y: 175,
        zGame: 235,
        approachX: 295,
        approachZGame: 166,
      },
      {
        id: 'slide_top',
        name: 'perosotan',
        x: -390,
        y: 150,
        zGame: 235,
        approachX: -322,
        approachZGame: 168,
      },
      {
        id: 'park_bench',
        name: 'bangku_taman',
        x: 455,
        y: 30,
        zGame: 188,
        approachX: 405,
        approachZGame: 162,
      },
    ],
  },
  kitchen: {
    floorY: 0,
    floorZGame: 160,
    minX: CAT_ARENA_MIN_X,
    maxX: CAT_ARENA_MAX_X,
    waypoints: [-455, -335, -210, -95, 0, 95, 210, 335, 455],
    perches: [
      {
        id: 'fridge_top',
        name: 'kulkas',
        x: -420,
        y: 210,
        zGame: 245,
        approachX: -365,
        approachZGame: 166,
      },
      {
        id: 'kitchen_counter',
        name: 'meja_dapur',
        x: -315,
        y: 84,
        zGame: 245,
        approachX: -260,
        approachZGame: 166,
      },
      {
        id: 'bar_island',
        name: 'meja_bar',
        x: 355,
        y: 52,
        zGame: 225,
        approachX: 268,
        approachZGame: 164,
      },
      {
        id: 'bar_stool',
        name: 'kursi_bar',
        x: 320,
        y: 38,
        zGame: 185,
        approachX: 270,
        approachZGame: 160,
      },
    ],
  },
  rooftop: {
    floorY: 0,
    floorZGame: 174,
    minX: CAT_ARENA_MIN_X,
    maxX: CAT_ARENA_MAX_X,
    waypoints: [-455, -335, -215, -105, 0, 105, 215, 335, 455],
    perches: [
      {
        id: 'water_tank_top',
        name: 'toren_air',
        x: -375,
        y: 215,
        zGame: 238,
        approachX: -310,
        approachZGame: 176,
      },
      {
        id: 'water_tank_deck',
        name: 'menara_air',
        x: -375,
        y: 95,
        zGame: 216,
        approachX: -310,
        approachZGame: 176,
      },
      {
        id: 'hvac_unit',
        name: 'unit_ac',
        x: 330,
        y: 72,
        zGame: 238,
        approachX: 265,
        approachZGame: 176,
      },
      {
        id: 'hvac_unit_2',
        name: 'unit_ac_kanan',
        x: 414,
        y: 56,
        zGame: 238,
        approachX: 385,
        approachZGame: 176,
      },
    ],
  },
  library: {
    floorY: 0,
    floorZGame: 128,
    minX: CAT_ARENA_MIN_X,
    maxX: CAT_ARENA_MAX_X,
    waypoints: [-455, -335, -210, -95, 0, 95, 210, 335, 455],
    perches: [
      {
        id: 'reading_table',
        name: 'meja_baca',
        x: -316,
        y: 41,
        zGame: 165,
        approachX: -252,
        approachZGame: 132,
      },
      {
        id: 'bookshelf_left',
        name: 'rak_buku_kiri',
        x: -375,
        y: 264,
        zGame: 250,
        approachX: -325,
        approachZGame: 134,
      },
      {
        id: 'bookshelf_right',
        name: 'rak_buku_kanan',
        x: 375,
        y: 264,
        zGame: 250,
        approachX: 320,
        approachZGame: 134,
      },
      {
        id: 'library_ladder',
        name: 'tangga',
        x: 349,
        y: 105,
        zGame: 209,
        approachX: 305,
        approachZGame: 134,
      },
    ],
  },
  simpang_lima_gumul: {
    floorY: 0,
    floorZGame: 162,
    minX: CAT_ARENA_MIN_X,
    maxX: CAT_ARENA_MAX_X,
    waypoints: [-455, -340, -215, -95, 0, 95, 215, 340, 455],
    perches: [
      {
        id: 'slg_plinth_left',
        name: 'umpak_kiri',
        x: -244,
        y: 33,
        zGame: 212,
        approachX: -210,
        approachZGame: 168,
      },
      {
        id: 'slg_plinth_right',
        name: 'umpak_kanan',
        x: 244,
        y: 33,
        zGame: 212,
        approachX: 210,
        approachZGame: 168,
      },
      {
        id: 'slg_bench_left',
        name: 'bangku_plaza_kiri',
        x: -415,
        y: 26,
        zGame: 196,
        approachX: -365,
        approachZGame: 164,
      },
      {
        id: 'slg_bench_right',
        name: 'bangku_plaza_kanan',
        x: 415,
        y: 26,
        zGame: 196,
        approachX: 365,
        approachZGame: 164,
      },
    ],
  },
  jembatan_brawijaya: {
    floorY: 0,
    floorZGame: 150,
    minX: CAT_ARENA_MIN_X,
    maxX: CAT_ARENA_MAX_X,
    waypoints: [-455, -340, -220, -95, 0, 95, 220, 340, 455],
    perches: [
      {
        id: 'jb_median_left',
        name: 'pembatas_tengah_kiri',
        x: -165,
        y: 18,
        zGame: 186,
        approachX: -145,
        approachZGame: 154,
      },
      {
        id: 'jb_median_right',
        name: 'pembatas_tengah_kanan',
        x: 165,
        y: 18,
        zGame: 186,
        approachX: 145,
        approachZGame: 154,
      },
      {
        id: 'jb_rail_left',
        name: 'pagar_jembatan_kiri',
        x: -365,
        y: 36,
        zGame: 224,
        approachX: -330,
        approachZGame: 162,
      },
      {
        id: 'jb_rail_right',
        name: 'pagar_jembatan_kanan',
        x: 365,
        y: 36,
        zGame: 224,
        approachX: 330,
        approachZGame: 162,
      },
    ],
  },
};

export interface CatNpcState {
  stageId: StageId;
  x: number;
  y: number;
  zGame: number;
  facing: 1 | -1;
  yaw: number;
  behavior: CatBehavior;
  behaviorTimer: number;
  behaviorDuration: number;
  behaviorElapsed: number;
  walkPhase: number;
  elapsed: number;
  stageElapsed: number;
  blinkTimer: number;
  blinking: boolean;
  onPerch: boolean;
  activePerch: CatPerchSpot | null;
  pendingPerch: CatPerchSpot | null;
  targetX: number;
  targetZGame: number;
  jumpStartX: number;
  jumpStartY: number;
  jumpStartZGame: number;
  jumpEndX: number;
  jumpEndY: number;
  jumpEndZGame: number;
  jumpToPerchAfterWalk: boolean;
  lastStationaryBehavior: CatBehavior;
  perchStepsTaken: number;
}

export interface CatPose {
  bodyY: number;
  bodyPitch: number;
  bodyRoll: number;
  squashX: number;
  squashY: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  earTwitchL: number;
  earTwitchR: number;
  legFL: number;
  legFR: number;
  legBL: number;
  legBR: number;
  legSpreadZ: number;
  tailBasePitch: number;
  tailBaseYaw: number;
  tailMidPitch: number;
  tailMidYaw: number;
  tailTipPitch: number;
  tailTipYaw: number;
  eyesClosed: boolean;
  happyEyes: boolean;
  tongueOut: boolean;
  sleeping: boolean;
}

const FLOOR_STATIONARY_POOL: readonly CatBehavior[] = [
  'sit',
  'lick_tail',
  'wash_face',
  'stretch',
  'loaf_nap',
  'pounce_hop',
];

const PERCH_STATIONARY_POOL: readonly CatBehavior[] = [
  'loaf_nap',
  'sit',
  'lick_tail',
  'wash_face',
  'loaf_nap',
];

function randRange(min: number, max: number, rng: () => number): number {
  return min + (max - min) * clamp(rng(), 0, 0.999999);
}

function pickFrom<T>(arr: readonly T[], rng: () => number): T {
  const idx = Math.floor(clamp(rng(), 0, 0.999999) * arr.length);
  return arr[idx];
}

function pickStationaryBehavior(
  onPerch: boolean,
  prev: CatBehavior,
  rng: () => number
): CatBehavior {
  const pool = onPerch ? PERCH_STATIONARY_POOL : FLOOR_STATIONARY_POOL;
  const filtered = pool.filter((b) => b !== prev);
  return pickFrom(filtered.length > 0 ? filtered : pool, rng);
}

function durationForBehavior(b: CatBehavior, rng: () => number): number {
  switch (b) {
    case 'sit':
      return randRange(2.1, 3.6, rng);
    case 'lick_tail':
      return randRange(2.6, 4.0, rng);
    case 'wash_face':
      return randRange(2.2, 3.4, rng);
    case 'stretch':
      return randRange(2.0, 2.8, rng);
    case 'loaf_nap':
      return randRange(3.6, 5.4, rng);
    case 'pounce_hop':
      return randRange(1.5, 2.2, rng);
    case 'jump_to_perch':
    case 'jump_to_floor':
      return 0.72;
    case 'walk':
      return 8.5;
  }
}

export function getStageCatZone(stageId: StageId): StageCatZone {
  return STAGE_CAT_ZONES[stageId];
}

export function createCatNpcState(
  stageId: StageId,
  rng: () => number = Math.random
): CatNpcState {
  const zone = getStageCatZone(stageId);
  const startX = pickFrom([-120, 0, 120], rng);
  const startFacing: 1 | -1 = rng() >= 0.5 ? 1 : -1;
  const startBeh = pickFrom(['walk', 'sit', 'loaf_nap'] as const, rng);
  const initDur = durationForBehavior(startBeh, rng);
  const state: CatNpcState = {
    stageId,
    x: startX,
    y: zone.floorY,
    zGame: zone.floorZGame,
    facing: startFacing,
    yaw: startFacing > 0 ? -0.35 : Math.PI + 0.35,
    behavior: startBeh,
    behaviorTimer: initDur,
    behaviorDuration: initDur,
    behaviorElapsed: 0,
    walkPhase: 0,
    elapsed: 0,
    stageElapsed: 0,
    blinkTimer: randRange(1.5, 3.5, rng),
    blinking: false,
    onPerch: false,
    activePerch: null,
    pendingPerch: null,
    targetX: startX,
    targetZGame: zone.floorZGame,
    jumpStartX: startX,
    jumpStartY: zone.floorY,
    jumpStartZGame: zone.floorZGame,
    jumpEndX: startX,
    jumpEndY: zone.floorY,
    jumpEndZGame: zone.floorZGame,
    jumpToPerchAfterWalk: false,
    lastStationaryBehavior: startBeh === 'walk' ? 'sit' : startBeh,
    perchStepsTaken: 0,
  };
  if (startBeh === 'walk') {
    assignNewFloorWalk(state, rng);
  }
  return state;
}

export function resetCatNpcForStage(
  state: CatNpcState,
  stageId: StageId,
  rng: () => number = Math.random
): void {
  const fresh = createCatNpcState(stageId, rng);
  Object.assign(state, fresh);
}

function assignNewFloorWalk(state: CatNpcState, rng: () => number): void {
  const zone = getStageCatZone(state.stageId);
  // 40% chance to explore anywhere continuously (including far left & far right edges)
  let nextX: number;
  if (rng() < 0.4) {
    nextX = randRange(zone.minX, zone.maxX, rng);
  } else {
    const candidates = zone.waypoints.filter((wx) => Math.abs(wx - state.x) > 55);
    nextX = pickFrom(candidates.length > 0 ? candidates : zone.waypoints, rng);
  }
  state.behavior = 'walk';
  state.targetX = clamp(nextX, zone.minX, zone.maxX);
  state.targetZGame = zone.floorZGame + randRange(-10, 10, rng);
  state.behaviorDuration = 12.0;
  state.behaviorTimer = 12.0;
  state.behaviorElapsed = 0;
  state.jumpToPerchAfterWalk = false;
  state.pendingPerch = null;
  if (Math.abs(state.targetX - state.x) > 2) {
    state.facing = state.targetX >= state.x ? 1 : -1;
  }
}

function resolvePerchCoords(
  perch: CatPerchSpot,
  stageElapsed: number
): { x: number; y: number; zGame: number } {
  if (perch.dynamicKind === 'park_swing_seat') {
    const pos = getParkSwingSeatPos(stageElapsed);
    return { x: pos.x, y: pos.seatTopY, zGame: pos.zGame };
  }
  return { x: perch.x, y: perch.y, zGame: perch.zGame };
}

function startJump(
  state: CatNpcState,
  kind: 'jump_to_perch' | 'jump_to_floor',
  endX: number,
  endY: number,
  endZGame: number
): void {
  const heightDiff = Math.abs(endY - state.y);
  const dur = clamp(0.58 + heightDiff * 0.0022, 0.58, 1.05);

  state.behavior = kind;
  state.jumpStartX = state.x;
  state.jumpStartY = state.y;
  state.jumpStartZGame = state.zGame;
  state.jumpEndX = endX;
  state.jumpEndY = endY;
  state.jumpEndZGame = endZGame;
  state.behaviorDuration = dur;
  state.behaviorTimer = dur;
  state.behaviorElapsed = 0;
  if (Math.abs(endX - state.x) > 2) {
    state.facing = endX >= state.x ? 1 : -1;
  }
}

function pickNextBehavior(state: CatNpcState, rng: () => number): void {
  const zone = getStageCatZone(state.stageId);

  if (state.onPerch) {
    // After 1-2 cute idle/sleep poses on top of the object, jump back down to the floor
    const shouldDrop = state.perchStepsTaken >= 2 || (state.perchStepsTaken >= 1 && rng() < 0.58);
    if (shouldDrop) {
      const perch = state.activePerch;
      const dropX = perch ? perch.approachX : clamp(state.x, zone.minX, zone.maxX);
      const dropZ = perch ? perch.approachZGame : zone.floorZGame;
      state.activePerch = null;
      state.perchStepsTaken = 0;
      startJump(state, 'jump_to_floor', dropX, zone.floorY, dropZ);
      return;
    }

    const beh = pickStationaryBehavior(true, state.lastStationaryBehavior, rng);
    state.behavior = beh;
    state.lastStationaryBehavior = beh;
    state.perchStepsTaken += 1;
    const dur = durationForBehavior(beh, rng);
    state.behaviorDuration = dur;
    state.behaviorTimer = dur;
    state.behaviorElapsed = 0;
    return;
  }

  // On floor: mix walking across entire arena (-460..+460), sleeping/grooming on floor, and jumping onto random objects
  const roll = rng();
  if (zone.perches.length > 0 && roll < 0.34) {
    const chosen = pickFrom(zone.perches, rng);
    state.behavior = 'walk';
    state.pendingPerch = chosen;
    state.targetX = clamp(chosen.approachX, zone.minX, zone.maxX);
    state.targetZGame = chosen.approachZGame;
    state.behaviorDuration = 12.0;
    state.behaviorTimer = 12.0;
    state.behaviorElapsed = 0;
    state.jumpToPerchAfterWalk = true;
    if (Math.abs(state.targetX - state.x) > 2) {
      state.facing = state.targetX >= state.x ? 1 : -1;
    }
    return;
  }

  if (roll < 0.78) {
    assignNewFloorWalk(state, rng);
    return;
  }

  const beh = pickStationaryBehavior(false, state.lastStationaryBehavior, rng);
  state.behavior = beh;
  state.lastStationaryBehavior = beh;
  const dur = durationForBehavior(beh, rng);
  state.behaviorDuration = dur;
  state.behaviorTimer = dur;
  state.behaviorElapsed = 0;
  if (beh === 'pounce_hop' && rng() < 0.5) {
    state.facing = state.facing === 1 ? -1 : 1;
  }
}

export function stepCatNpc(
  state: CatNpcState,
  rawDt: number,
  rng: () => number = Math.random,
  stageElapsed?: number
): void {
  const dt = clamp(rawDt, 0, 0.05);
  if (dt <= 0) return;

  state.elapsed += dt;
  state.stageElapsed = stageElapsed !== undefined ? stageElapsed : state.elapsed;
  state.behaviorElapsed += dt;

  // Periodic natural eye blinking
  state.blinkTimer -= dt;
  if (state.blinking) {
    if (state.blinkTimer <= 0) {
      state.blinking = false;
      state.blinkTimer = randRange(2.1, 4.4, rng);
    }
  } else if (state.blinkTimer <= 0) {
    state.blinking = true;
    state.blinkTimer = 0.14;
  }

  const zone = getStageCatZone(state.stageId);

  if (state.behavior === 'walk') {
    const dx = state.targetX - state.x;
    const dz = state.targetZGame - state.zGame;
    const dist = Math.hypot(dx, dz);
    const speed = 88;
    if (dist <= speed * dt + 2 || state.behaviorTimer <= 0) {
      state.x = clamp(state.targetX, zone.minX, zone.maxX);
      state.zGame = state.targetZGame;
      if (state.jumpToPerchAfterWalk && state.pendingPerch) {
        const perch = state.pendingPerch;
        state.jumpToPerchAfterWalk = false;
        state.pendingPerch = null;
        state.activePerch = perch;
        const dest = resolvePerchCoords(perch, state.stageElapsed);
        startJump(state, 'jump_to_perch', dest.x, dest.y, dest.zGame);
      } else {
        const beh = pickStationaryBehavior(false, state.lastStationaryBehavior, rng);
        state.behavior = beh;
        state.lastStationaryBehavior = beh;
        const dur = durationForBehavior(beh, rng);
        state.behaviorDuration = dur;
        state.behaviorTimer = dur;
        state.behaviorElapsed = 0;
      }
    } else {
      const step = speed * dt;
      state.x = clamp(state.x + (dx / dist) * step, zone.minX, zone.maxX);
      state.zGame += (dz / dist) * step;
      state.facing = dx >= 0 ? 1 : -1;
      state.walkPhase += step * 0.19;
      state.behaviorTimer -= dt;
    }
  } else if (state.behavior === 'jump_to_perch' || state.behavior === 'jump_to_floor') {
    // Track dynamic perch destination (e.g., moving park swing seat) during ascent
    if (state.behavior === 'jump_to_perch' && state.activePerch?.dynamicKind) {
      const dest = resolvePerchCoords(state.activePerch, state.stageElapsed);
      state.jumpEndX = dest.x;
      state.jumpEndY = dest.y;
      state.jumpEndZGame = dest.zGame;
    }

    const t = clamp(state.behaviorElapsed / Math.max(0.05, state.behaviorDuration), 0, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    state.x = state.jumpStartX + (state.jumpEndX - state.jumpStartX) * ease;
    state.zGame = state.jumpStartZGame + (state.jumpEndZGame - state.jumpStartZGame) * ease;
    const baseLinearY = state.jumpStartY + (state.jumpEndY - state.jumpStartY) * t;
    const heightDiff = Math.abs(state.jumpEndY - state.jumpStartY);
    const arcHeight = 36 + heightDiff * 0.36;
    state.y = baseLinearY + Math.sin(t * Math.PI) * arcHeight;

    if (t >= 1) {
      state.x = state.jumpEndX;
      state.y = state.jumpEndY;
      state.zGame = state.jumpEndZGame;
      state.onPerch = state.behavior === 'jump_to_perch';
      state.perchStepsTaken = state.onPerch ? 1 : 0;
      const beh = pickStationaryBehavior(state.onPerch, state.lastStationaryBehavior, rng);
      state.behavior = beh;
      state.lastStationaryBehavior = beh;
      const dur = durationForBehavior(beh, rng);
      state.behaviorDuration = dur;
      state.behaviorTimer = dur;
      state.behaviorElapsed = 0;
    }
  } else {
    // If resting/sleeping on a moving swing seat, keep riding it smoothly
    if (state.onPerch && state.activePerch?.dynamicKind) {
      const live = resolvePerchCoords(state.activePerch, state.stageElapsed);
      state.x = live.x;
      state.y = live.y;
      state.zGame = live.zGame;
    }

    state.behaviorTimer -= dt;
    if (state.behaviorTimer <= 0) {
      pickNextBehavior(state, rng);
    }
  }

  // Smooth yaw turn: angled slightly toward the camera when walking, more 3/4 front when grooming/sitting/sleeping
  const isFrontFacingPose =
    state.behavior === 'sit' ||
    state.behavior === 'lick_tail' ||
    state.behavior === 'wash_face' ||
    state.behavior === 'loaf_nap';
  const yawOffset = isFrontFacingPose ? 0.62 : 0.28;
  const targetYaw = state.facing >= 0 ? -yawOffset : Math.PI + yawOffset;
  state.yaw = damp(state.yaw, targetYaw, 10, dt);
}

export function computeCatPose(state: CatNpcState): CatPose {
  const t = state.elapsed;
  const bElapsed = state.behaviorElapsed;
  const bProg = clamp(bElapsed / Math.max(0.1, state.behaviorDuration), 0, 1);
  // Camera-facing local Z side sign (local +Z faces camera when facing=+1; local -Z faces camera when facing=-1)
  const camSide = state.facing >= 0 ? 1 : -1;

  const pose: CatPose = {
    bodyY: 16,
    bodyPitch: 0,
    bodyRoll: 0,
    squashX: 1,
    squashY: 1,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    earTwitchL: 0,
    earTwitchR: 0,
    legFL: 0,
    legFR: 0,
    legBL: 0,
    legBR: 0,
    legSpreadZ: 0,
    tailBasePitch: 0.45,
    tailBaseYaw: 0,
    tailMidPitch: 0.38,
    tailMidYaw: 0,
    tailTipPitch: 0.25,
    tailTipYaw: 0,
    eyesClosed: state.blinking,
    happyEyes: false,
    tongueOut: false,
    sleeping: false,
  };

  // Subtle idle ear twitch occasionally
  const earWave = Math.sin(t * 7.5);
  if (Math.sin(t * 1.1) > 0.85) {
    pose.earTwitchR = earWave * 0.16;
  }

  switch (state.behavior) {
    case 'walk': {
      const wp = state.walkPhase;
      const trot = Math.sin(wp);
      const trotOpp = Math.sin(wp + Math.PI);
      pose.bodyY = 16.2 + Math.abs(Math.cos(wp)) * 1.5;
      pose.bodyPitch = Math.sin(wp * 2) * 0.04;
      pose.headPitch = -0.05 + Math.sin(wp * 2) * 0.05;
      pose.headYaw = Math.sin(wp * 0.5) * 0.12;
      pose.legFL = trot * 0.56;
      pose.legBR = trot * 0.56;
      pose.legFR = trotOpp * 0.56;
      pose.legBL = trotOpp * 0.56;
      pose.tailBasePitch = 0.72 + Math.sin(t * 3.4) * 0.12;
      pose.tailBaseYaw = Math.sin(t * 2.8) * 0.28;
      pose.tailMidPitch = 0.35;
      pose.tailMidYaw = Math.sin(t * 2.8 - 0.8) * 0.35;
      pose.tailTipPitch = -0.18;
      pose.tailTipYaw = Math.sin(t * 2.8 - 1.5) * 0.42;
      break;
    }

    case 'sit': {
      pose.bodyY = 12.2;
      pose.bodyPitch = 0.58;
      pose.headPitch = -0.46 + Math.sin(t * 1.6) * 0.05;
      pose.headYaw = Math.sin(t * 1.1) * 0.36;
      pose.headRoll = Math.sin(t * 1.3) * 0.08;
      // Front legs reach straight down to floor despite upright torso
      pose.legFL = -0.58;
      pose.legFR = -0.58;
      // Hind legs tucked forward cleanly on ground
      pose.legBL = 0.92;
      pose.legBR = 0.92;
      pose.legSpreadZ = 1.6;
      pose.tailBasePitch = -0.22;
      pose.tailBaseYaw = camSide * (0.65 + Math.sin(t * 2.2) * 0.22);
      pose.tailMidPitch = 0.18;
      pose.tailMidYaw = camSide * (0.55 + Math.sin(t * 2.2 - 0.6) * 0.25);
      pose.tailTipPitch = 0.32;
      pose.tailTipYaw = camSide * (0.45 + Math.sin(t * 2.2 - 1.2) * 0.3);
      break;
    }

    case 'lick_tail': {
      const lickWave = Math.sin(bElapsed * 6.8);
      const lickDip = Math.max(0, lickWave);
      pose.bodyY = 11.8;
      pose.bodyPitch = 0.44;
      // Bend head down & toward camera side where the tail curls up
      pose.headPitch = -0.82 - lickDip * 0.22;
      pose.headYaw = -camSide * 0.46;
      pose.headRoll = camSide * (0.28 + lickDip * 0.12);
      pose.legFL = -0.45;
      pose.legFR = -0.45;
      pose.legBL = 0.95;
      pose.legBR = 0.95;
      pose.legSpreadZ = 1.8;
      // Curl tail forward along camera side right toward snout
      pose.tailBasePitch = 0.22;
      pose.tailBaseYaw = camSide * 1.28;
      pose.tailMidPitch = 0.48;
      pose.tailMidYaw = camSide * 1.05;
      pose.tailTipPitch = 0.32 + lickDip * 0.18;
      pose.tailTipYaw = camSide * (0.72 + Math.sin(bElapsed * 4.2) * 0.12);
      pose.happyEyes = true;
      pose.eyesClosed = false;
      pose.tongueOut = lickWave > -0.15;
      break;
    }

    case 'wash_face': {
      const rub = Math.sin(bElapsed * 8.2);
      pose.bodyY = 12.2;
      pose.bodyPitch = 0.6;
      pose.headPitch = -0.42 + rub * 0.12;
      pose.headYaw = -camSide * 0.18;
      pose.headRoll = camSide * (0.2 + rub * 0.14);
      // One paw lifted to rub cheek/ear!
      if (camSide > 0) {
        pose.legFL = 1.38 + rub * 0.38;
        pose.legFR = -0.58;
      } else {
        pose.legFR = 1.38 + rub * 0.38;
        pose.legFL = -0.58;
      }
      pose.legBL = 0.94;
      pose.legBR = 0.94;
      pose.legSpreadZ = 1.4;
      pose.tailBasePitch = -0.15;
      pose.tailBaseYaw = camSide * 0.72;
      pose.tailMidPitch = 0.22;
      pose.tailMidYaw = camSide * 0.65;
      pose.tailTipPitch = 0.25;
      pose.tailTipYaw = Math.sin(bElapsed * 2.6) * 0.25;
      pose.happyEyes = true;
      pose.eyesClosed = false;
      break;
    }

    case 'stretch': {
      // Smooth ramp in -> hold bow -> ease out
      const env = Math.sin(bProg * Math.PI);
      pose.bodyY = 16 - env * 2.2;
      pose.bodyPitch = -env * 0.42;
      pose.squashX = 1 + env * 0.14;
      pose.squashY = 1 - env * 0.12;
      pose.headPitch = env * 0.32;
      pose.legFL = env * 0.78;
      pose.legFR = env * 0.72;
      pose.legBL = -env * 0.35;
      pose.legBR = -env * 0.35;
      pose.tailBasePitch = 0.55 + env * 0.85;
      pose.tailMidPitch = 0.35 + env * 0.25;
      pose.tailTipPitch = -0.2;
      break;
    }

    case 'loaf_nap': {
      const breath = Math.sin(t * 2.3) * 0.045;
      pose.bodyY = 7.4;
      pose.bodyPitch = 0.04;
      pose.squashX = 1.07 + breath;
      pose.squashY = 0.92 - breath * 0.8;
      pose.headPitch = -0.24 + Math.sin(t * 2.3) * 0.045;
      pose.headYaw = -camSide * 0.15;
      pose.headRoll = camSide * 0.14;
      // Tuck all 4 paws inside loaf
      pose.legFL = 1.25;
      pose.legFR = 1.25;
      pose.legBL = 1.25;
      pose.legBR = 1.25;
      pose.tailBasePitch = -0.18;
      pose.tailBaseYaw = camSide * 1.15;
      pose.tailMidPitch = 0.08;
      pose.tailMidYaw = camSide * 0.95;
      pose.tailTipPitch = 0.06;
      pose.tailTipYaw = camSide * (0.7 + Math.sin(t * 1.4) * 0.12);
      pose.eyesClosed = true;
      pose.sleeping = true;
      break;
    }

    case 'pounce_hop': {
      // Two cute playful hops in place!
      const hopWave = Math.abs(Math.sin(bProg * Math.PI * 2));
      const hopPhase = Math.sin(bProg * Math.PI * 4);
      pose.bodyY = 15.5 + hopWave * 15;
      pose.bodyPitch = hopPhase * 0.24;
      pose.squashX = 1 - hopWave * 0.09;
      pose.squashY = 1 + hopWave * 0.12;
      pose.headPitch = -0.14 - hopWave * 0.1;
      pose.headYaw = Math.sin(bElapsed * 9) * 0.18;
      pose.earTwitchL = 0.12;
      pose.earTwitchR = -0.12;
      pose.legFL = 0.48 * hopWave;
      pose.legFR = 0.48 * hopWave;
      pose.legBL = -0.48 * hopWave;
      pose.legBR = -0.48 * hopWave;
      // Exclamation / question mark puffy tail!
      pose.tailBasePitch = 1.18;
      pose.tailMidPitch = 0.25;
      pose.tailTipPitch = -0.45;
      pose.tailTipYaw = Math.sin(bElapsed * 14) * 0.32;
      break;
    }

    case 'jump_to_perch':
    case 'jump_to_floor': {
      const arc = Math.sin(bProg * Math.PI);
      const ascend = Math.cos(bProg * Math.PI);
      pose.bodyY = 16.5;
      pose.bodyPitch = ascend * 0.36;
      pose.squashX = 0.92 + arc * 0.14;
      pose.squashY = 1.08 - arc * 0.1;
      pose.headPitch = -ascend * 0.22;
      pose.legFL = 0.55 * arc;
      pose.legFR = 0.55 * arc;
      pose.legBL = -0.6 * arc;
      pose.legBR = -0.6 * arc;
      pose.tailBasePitch = 0.72 - ascend * 0.25;
      pose.tailMidPitch = 0.25;
      pose.tailTipPitch = -0.18;
      break;
    }
  }

  return pose;
}
