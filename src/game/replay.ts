import { createMatchState, SoundCue, stepMatch } from './combat';
import {
  CharacterId,
  CpuDifficulty,
  GameMode,
  InputSnapshot,
  MatchState,
  RoundPhase,
  StageId,
} from './types';

export type ReplayHighlightKind = 'none' | 'big_hit' | 'ko';

export interface ReplayFrame {
  p1: InputSnapshot;
  p2: InputSnapshot;
  dt: number;
}

export interface MatchReplayRecording {
  p1Char: CharacterId;
  p2Char: CharacterId;
  stageId: StageId;
  mode: GameMode;
  difficulty: CpuDifficulty;
  frames: ReplayFrame[];
  totalDuration: number;
  bigHitCount: number;
  koCount: number;
}

export interface ReplayPlaybackState {
  recording: MatchReplayRecording;
  frameIndex: number;
  accum: number;
  paused: boolean;
  finished: boolean;
  userSpeed: number;
  simTimeScale: number;
  autoSlowMoKind: ReplayHighlightKind;
  autoSlowMoTimer: number;
  autoSlowMoDuration: number;
  autoSlowMoMinScale: number;
  autoSlowMoCooldown: number;
  prevRoundPhase: RoundPhase;
}

export const MAX_REPLAY_FRAMES = 24000;
export const BIG_HIT_DAMAGE_THRESHOLD = 11;
export const BIG_HIT_SLOWMO_SCALE = 0.28;
export const BIG_HIT_SLOWMO_DURATION = 0.95;
export const KO_SLOWMO_SCALE = 0.16;
export const KO_SLOWMO_DURATION = 1.6;

export function cloneInputSnapshot(inp: InputSnapshot): InputSnapshot {
  return {
    moveX: inp.moveX,
    moveY: inp.moveY,
    punchHeld: inp.punchHeld,
    kickHeld: inp.kickHeld,
    spHeld: inp.spHeld,
    blockHeld: inp.blockHeld,
    superHeld: inp.superHeld,
    punchPressed: inp.punchPressed,
    kickPressed: inp.kickPressed,
    spPressed: inp.spPressed,
    superPressed: inp.superPressed,
  };
}

export function createReplayRecorder(state: MatchState): MatchReplayRecording {
  return {
    p1Char: state.p1.charId,
    p2Char: state.p2.charId,
    stageId: state.stageId,
    mode: state.mode,
    difficulty: state.difficulty,
    frames: [],
    totalDuration: 0,
    bigHitCount: 0,
    koCount: 0,
  };
}

export function recordReplayFrame(
  recording: MatchReplayRecording,
  p1Input: InputSnapshot,
  p2Input: InputSnapshot,
  rawDt: number,
  cues: SoundCue[] = [],
  hpBeforeP1?: number,
  hpBeforeP2?: number,
  stateAfterStep?: MatchState
): void {
  if (recording.frames.length >= MAX_REPLAY_FRAMES) return;
  const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
  recording.frames.push({
    p1: cloneInputSnapshot(p1Input),
    p2: cloneInputSnapshot(p2Input),
    dt,
  });
  recording.totalDuration += dt;

  const hpDrop =
    typeof hpBeforeP1 === 'number' && typeof hpBeforeP2 === 'number' && stateAfterStep
      ? Math.max(hpBeforeP1 - stateAfterStep.p1.hp, hpBeforeP2 - stateAfterStep.p2.hp)
      : 0;
  if (cues.includes('ko_call') || stateAfterStep?.roundPhase === 'ko') {
    recording.koCount += 1;
  } else if (
    hpDrop >= BIG_HIT_DAMAGE_THRESHOLD ||
    cues.includes('hit_heavy') ||
    cues.includes('super_activate')
  ) {
    recording.bigHitCount += 1;
  }
}

function createReplayMatchState(recording: MatchReplayRecording): MatchState {
  return createMatchState(
    recording.p1Char,
    recording.p2Char,
    recording.stageId,
    recording.mode,
    recording.difficulty
  );
}

export function createReplayPlayback(recording: MatchReplayRecording): {
  playback: ReplayPlaybackState;
  matchState: MatchState;
} {
  const matchState = createReplayMatchState(recording);
  const playback: ReplayPlaybackState = {
    recording,
    frameIndex: 0,
    accum: 0,
    paused: false,
    finished: recording.frames.length === 0,
    userSpeed: 1,
    simTimeScale: 1,
    autoSlowMoKind: 'none',
    autoSlowMoTimer: 0,
    autoSlowMoDuration: BIG_HIT_SLOWMO_DURATION,
    autoSlowMoMinScale: 1,
    autoSlowMoCooldown: 0,
    prevRoundPhase: matchState.roundPhase,
  };
  return { playback, matchState };
}

export function restartReplayPlayback(playback: ReplayPlaybackState): MatchState {
  const matchState = createReplayMatchState(playback.recording);
  playback.frameIndex = 0;
  playback.accum = 0;
  playback.paused = false;
  playback.finished = playback.recording.frames.length === 0;
  playback.simTimeScale = 1;
  playback.autoSlowMoKind = 'none';
  playback.autoSlowMoTimer = 0;
  playback.autoSlowMoDuration = BIG_HIT_SLOWMO_DURATION;
  playback.autoSlowMoMinScale = 1;
  playback.autoSlowMoCooldown = 0;
  playback.prevRoundPhase = matchState.roundPhase;
  return matchState;
}

export function toggleReplayPause(playback: ReplayPlaybackState): boolean {
  if (playback.finished) return false;
  playback.paused = !playback.paused;
  return playback.paused;
}

export function cycleReplaySpeed(playback: ReplayPlaybackState): number {
  if (playback.userSpeed === 1) playback.userSpeed = 2;
  else if (playback.userSpeed === 2) playback.userSpeed = 0.5;
  else playback.userSpeed = 1;
  return playback.userSpeed;
}

export function getReplayProgress(playback: ReplayPlaybackState): number {
  const total = playback.recording.frames.length;
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, playback.frameIndex / total));
}

function computeAutoSlowMoScale(playback: ReplayPlaybackState): number {
  if (playback.autoSlowMoTimer <= 0 || playback.autoSlowMoKind === 'none') {
    return 1;
  }
  const dur = Math.max(0.1, playback.autoSlowMoDuration);
  const progress = Math.max(0, Math.min(1, 1 - playback.autoSlowMoTimer / dur));
  const minScale = playback.autoSlowMoMinScale;
  if (progress < 0.55) {
    return minScale;
  }
  const ease = (progress - 0.55) / 0.45;
  return minScale + (1 - minScale) * (ease * ease);
}

/**
 * Advances replay playback deterministically while modulating `matchState.timeScale`
 * for automatic slow-motion on big hits (`hit besar`) and KO events.
 */
export function stepReplayPlayback(
  playback: ReplayPlaybackState,
  matchState: MatchState,
  rawDt: number
): SoundCue[] {
  const realDt = Math.min(Math.max(rawDt, 0.0005), 0.05);
  const cues: SoundCue[] = [];

  if (playback.finished) {
    playback.autoSlowMoKind = 'none';
    playback.autoSlowMoTimer = 0;
    playback.autoSlowMoMinScale = 1;
    matchState.timeScale = 1;
    return cues;
  }

  if (playback.paused) {
    return cues;
  }

  if (playback.autoSlowMoCooldown > 0) {
    playback.autoSlowMoCooldown = Math.max(0, playback.autoSlowMoCooldown - realDt);
  }
  if (playback.autoSlowMoTimer > 0) {
    playback.autoSlowMoTimer = Math.max(0, playback.autoSlowMoTimer - realDt);
    if (playback.autoSlowMoTimer <= 0) {
      playback.autoSlowMoKind = 'none';
      playback.autoSlowMoMinScale = 1;
    }
  }

  const preAutoScale = computeAutoSlowMoScale(playback);
  matchState.timeScale = Math.min(playback.simTimeScale, preAutoScale);

  // Prevent double slowdown on frames where combat.ts dramaticCam already reduced simTimeScale
  const frameRateScale = Math.min(
    1,
    matchState.timeScale / Math.max(0.05, playback.simTimeScale)
  );
  playback.accum += realDt * playback.userSpeed * frameRateScale;

  let stepsThisTick = 0;
  const maxStepsPerTick = 8;
  while (
    playback.frameIndex < playback.recording.frames.length &&
    playback.accum >= playback.recording.frames[playback.frameIndex].dt &&
    stepsThisTick < maxStepsPerTick
  ) {
    const frame = playback.recording.frames[playback.frameIndex];
    playback.accum -= frame.dt;
    playback.frameIndex += 1;
    stepsThisTick += 1;

    const hpBeforeP1 = matchState.p1.hp;
    const hpBeforeP2 = matchState.p2.hp;
    const prevPhase = matchState.roundPhase;
    const prevP1Ko = matchState.p1.state === 'ko';
    const prevP2Ko = matchState.p2.state === 'ko';
    const prevDramaticKo = matchState.dramaticCam.active && matchState.dramaticCam.isKo;

    // Restore deterministic combat.ts timeScale before stepping the simulation
    matchState.timeScale = playback.simTimeScale;
    const frameCues = stepMatch(matchState, frame.p1, frame.p2, frame.dt);
    playback.simTimeScale = matchState.timeScale;
    for (const c of frameCues) cues.push(c);

    const hpDrop = Math.max(hpBeforeP1 - matchState.p1.hp, hpBeforeP2 - matchState.p2.hp);
    const enteredKoState =
      (!prevP1Ko && matchState.p1.state === 'ko') ||
      (!prevP2Ko && matchState.p2.state === 'ko');
    const isKoEvent =
      frameCues.includes('ko_call') ||
      (prevPhase !== 'ko' && matchState.roundPhase === 'ko') ||
      enteredKoState ||
      (matchState.dramaticCam.active && matchState.dramaticCam.isKo && !prevDramaticKo);

    const isBigHitEvent =
      !isKoEvent &&
      (hpDrop >= BIG_HIT_DAMAGE_THRESHOLD ||
        frameCues.includes('hit_heavy') ||
        frameCues.includes('super_activate') ||
        (matchState.dramaticCam.active && !matchState.dramaticCam.isKo));

    if (isKoEvent) {
      const alreadyInKoSlowMo = playback.autoSlowMoKind === 'ko' && playback.autoSlowMoTimer > 0.6;
      if (!alreadyInKoSlowMo) {
        playback.autoSlowMoKind = 'ko';
        playback.autoSlowMoDuration = KO_SLOWMO_DURATION;
        playback.autoSlowMoTimer = KO_SLOWMO_DURATION;
        playback.autoSlowMoMinScale = KO_SLOWMO_SCALE;
        playback.autoSlowMoCooldown = 0.5;
        if (!frameCues.includes('bullet_time')) cues.push('bullet_time');
      }
    } else if (
      isBigHitEvent &&
      playback.autoSlowMoKind !== 'ko' &&
      playback.autoSlowMoCooldown <= 0
    ) {
      playback.autoSlowMoKind = 'big_hit';
      playback.autoSlowMoDuration = BIG_HIT_SLOWMO_DURATION;
      playback.autoSlowMoTimer = BIG_HIT_SLOWMO_DURATION;
      playback.autoSlowMoMinScale = BIG_HIT_SLOWMO_SCALE;
      playback.autoSlowMoCooldown = 1.05;
      if (!frameCues.includes('bullet_time')) cues.push('bullet_time');
    }

    playback.prevRoundPhase = matchState.roundPhase;

    if (playback.frameIndex >= playback.recording.frames.length) {
      playback.finished = true;
      break;
    }
  }

  if (playback.finished) {
    playback.autoSlowMoKind = 'none';
    playback.autoSlowMoTimer = 0;
    playback.autoSlowMoMinScale = 1;
    matchState.timeScale = 1;
  } else {
    const postAutoScale = computeAutoSlowMoScale(playback);
    matchState.timeScale = Math.min(playback.simTimeScale, postAutoScale);
  }

  return cues;
}
