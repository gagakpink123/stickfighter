import { createEmptyInput } from './combat';
import { CpuDifficulty, InputSnapshot, MatchState } from './types';

export interface CpuBrainState {
  decisionTimer: number;
  desiredMoveX: number;
  desiredMoveY: number;
  blockTimer: number;
  comboQueue: Array<'punch' | 'kick' | 'sp'>;
  comboStepDelay: number;
}

export function createCpuBrain(): CpuBrainState {
  return {
    decisionTimer: 0,
    desiredMoveX: 0,
    desiredMoveY: 0,
    blockTimer: 0,
    comboQueue: [],
    comboStepDelay: 0,
  };
}

export function updateCpuInput(
  brain: CpuBrainState,
  state: MatchState,
  dt: number
): InputSnapshot {
  const input = createEmptyInput();
  if (state.mode === 'training') {
    // In training mode, dummy stands still or blocks occasionally if pushed, no offense
    return input;
  }
  if (state.roundPhase !== 'fight') return input;

  const cpu = state.p2;
  const player = state.p1;
  const dist = Math.abs(cpu.x - player.x);
  const toPlayer = player.x >= cpu.x ? 1 : -1;

  const diff: CpuDifficulty = state.difficulty;
  const reactionRate = diff === 'hard' ? 0.14 : diff === 'normal' ? 0.24 : 0.4;
  const blockChance = diff === 'hard' ? 0.62 : diff === 'normal' ? 0.38 : 0.16;
  const aggression = diff === 'hard' ? 0.85 : diff === 'normal' ? 0.62 : 0.38;

  // Execute queued chain combo steps smoothly
  if (brain.comboQueue.length > 0) {
    brain.comboStepDelay -= dt;
    if (brain.comboStepDelay <= 0) {
      const action = brain.comboQueue.shift()!;
      if (action === 'punch') input.punchPressed = true;
      else if (action === 'kick') input.kickPressed = true;
      else if (action === 'sp') {
        input.spPressed = true;
        input.moveX = brain.desiredMoveX;
        input.moveY = brain.desiredMoveY;
      }
      brain.comboStepDelay = diff === 'hard' ? 0.12 : 0.17;
    }
  }

  // Reactive block when player attacks nearby or fires projectile
  if (brain.blockTimer > 0) {
    brain.blockTimer -= dt;
    input.blockHeld = true;
    return input;
  }

  const incomingThreat =
    (player.state === 'attack' && dist < 210) ||
    state.projectiles.some((p) => p.active && p.ownerSlot === 1 && Math.abs(p.x - cpu.x) < 160);

  if (incomingThreat && brain.decisionTimer <= 0 && Math.random() < blockChance) {
    brain.blockTimer = 0.24 + Math.random() * 0.2;
    brain.comboQueue = [];
    input.blockHeld = true;
    return input;
  }

  // Respect knockdown / wakeup recovery rule: back off to mid-range until opponent stands up
  if (player.state === 'knockdown' || player.state === 'wakeup') {
    brain.comboQueue = [];
    if (dist < 220) {
      input.moveX = -toPlayer;
    }
    return input;
  }

  brain.decisionTimer -= dt;
  if (brain.decisionTimer <= 0) {
    brain.decisionTimer = reactionRate * (0.75 + Math.random() * 0.5);

    // Super ready!
    if (cpu.superMeter >= 100 && dist < 340 && Math.random() < aggression) {
      input.superPressed = true;
      return input;
    }

    // Anti-air if player jumps in
    if (player.y > 45 && dist < 175 && Math.random() < aggression) {
      brain.desiredMoveX = toPlayer;
      brain.desiredMoveY = 1;
      input.moveX = toPlayer;
      input.moveY = 1;
      input.spPressed = true;
      return input;
    }

    if (dist > 235) {
      // Far range: approach or use long-range secret weapon
      if (Math.random() < 0.38 * aggression) {
        brain.desiredMoveX = Math.random() < 0.35 ? -toPlayer : 0;
        brain.desiredMoveY = 0;
        input.spPressed = true;
      } else {
        brain.desiredMoveX = toPlayer;
        brain.desiredMoveY = Math.random() < 0.12 ? 1 : 0;
      }
    } else if (dist > 110) {
      // Mid range: poke, special, or dash in
      const roll = Math.random();
      if (roll < 0.36 * aggression) {
        const pickBack = Math.random() < 0.28;
        brain.desiredMoveY = pickBack ? 0 : Math.random() < 0.55 ? -1 : 0;
        brain.desiredMoveX = pickBack ? -toPlayer : toPlayer;
        input.moveX = brain.desiredMoveX;
        input.moveY = brain.desiredMoveY;
        input.spPressed = true;
      } else if (roll < 0.68) {
        brain.desiredMoveX = toPlayer;
        brain.desiredMoveY = 0;
      } else {
        brain.desiredMoveX = -toPlayer;
        brain.desiredMoveY = 0;
      }
    } else {
      // Close range: throw if player blocks, otherwise chain combo or low sweep!
      brain.desiredMoveX = 0;
      brain.desiredMoveY = 0;
      if (player.state === 'block' && Math.random() < 0.45 * aggression) {
        input.punchPressed = true;
        input.kickHeld = true;
        return input;
      }
      if (Math.random() < aggression) {
        const useLow = player.charId === 'iyen' || Math.random() < 0.35;
        if (useLow) {
          brain.desiredMoveY = -1;
          input.moveY = -1;
          input.kickPressed = true;
          brain.comboQueue = ['kick', 'sp'];
          brain.comboStepDelay = 0.15;
        } else {
          input.punchPressed = true;
          brain.comboQueue =
            diff === 'hard'
              ? ['punch', 'kick', 'punch', 'sp']
              : diff === 'normal'
                ? ['punch', 'kick', 'punch']
                : ['punch', 'punch'];
          brain.comboStepDelay = 0.14;
        }
      } else {
        brain.desiredMoveX = -toPlayer;
      }
    }
  }

  input.moveX = brain.desiredMoveX;
  input.moveY = brain.desiredMoveY;
  return input;
}
