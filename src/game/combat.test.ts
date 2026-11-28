import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createEmptyInput,
  createMatchState,
  getFighterHurtbox,
  getMoveHitboxWorld,
  stepMatch,
} from './combat';
import { CHARACTERS, CHARACTER_ORDER } from './characters';
import { STAGE_ORDER, STAGES } from './stages';
import { ARENA_HALF_WIDTH, createCamera, updateCamera } from './math3d';
import { computeFighterPose } from './pose';
import {
  buildHudOvalFrameSvg,
  DEFAULT_FACE_MASK_ENABLED,
  FACE_MASK_STORAGE_KEY,
  getHudFacePortraitSpec,
  readFaceMaskSetting,
  writeFaceMaskSetting,
} from './settings';
import { FACE_MASK_PATHS } from './threeCharacters';

test('Round 1 intro plays camera drone sweep then 3-2-1 countdown before FIGHT!', () => {
  const st = createMatchState('adnan', 'tika', 'living_room', 'cpu');
  assert.equal(st.roundPhase, 'intro');
  assert.equal(st.bannerText, 'ROUND 1');
  assert.ok(st.phaseTimer >= 4.5, `Expected Round 1 phaseTimer >= 4.5 for drone sweep + 3-2-1, got ${st.phaseTimer}`);

  const seenBanners: string[] = [];
  const seenCues = new Set<string>();
  const empty = createEmptyInput();
  for (let i = 0; i < 260 && st.roundPhase === 'intro'; i++) {
    const cues = stepMatch(st, empty, empty, 0.02);
    for (const c of cues) seenCues.add(c);
    if (st.bannerText && seenBanners[seenBanners.length - 1] !== st.bannerText) {
      seenBanners.push(st.bannerText);
    }
  }

  assert.equal(st.roundPhase, 'fight');
  assert.deepEqual(seenBanners, ['ROUND 1', '3', '2', '1', 'FIGHT!']);
  assert.equal(seenCues.has('countdown_tick'), true);
  assert.equal(seenCues.has('fight_call'), true);

  const tr = createMatchState('adnan', 'tika', 'living_room', 'training');
  assert.equal(tr.roundPhase, 'fight');
});

test('Natural motion pose outputs ankle, hipSway, headNod, and jump phase articulation', () => {
  const st = createMatchState('adnan', 'tika', 'dojo', 'training');
  st.p1.state = 'walk_fwd';
  st.p1.walkPhase = Math.PI * 0.5;
  const walkPose = computeFighterPose(st.p1);
  assert.ok(Number.isFinite(walkPose.footFront) && Number.isFinite(walkPose.footBack));
  assert.ok(Math.abs(walkPose.hipSway) > 0.1 || Math.abs(walkPose.headNod) > 0.001);

  st.p1.state = 'jump';
  st.p1.vy = 320; // Rising
  const risePose = computeFighterPose(st.p1);
  st.p1.vy = -320; // Falling
  const fallPose = computeFighterPose(st.p1);
  assert.ok(Number.isFinite(risePose.legFrontLower) && Number.isFinite(fallPose.legFrontLower));
  assert.notEqual(risePose.legFrontLower, fallPose.legFrontLower);
});

test('Dynamic camera zooms in when fighters are close and zooms out when apart', () => {
  const camClose = createCamera();
  const camApart = createCamera();
  for (let i = 0; i < 60; i++) {
    updateCamera(camClose, -50, 0, 50, 0, 0.03, i * 0.03);
    updateCamera(camApart, -380, 0, 380, 0, 0.03, i * 0.03);
  }
  assert.ok(camClose.z > camApart.z, `Expected close camZ (${camClose.z}) > apart camZ (${camApart.z})`);
});

test('Dik Iyen avoids Ayah Adnan & Ibu Tika standing High attacks due to toddler height hurtbox', () => {
  const state = createMatchState('adnan', 'iyen', 'living_room', 'training');
  state.p1.x = -30;
  state.p2.x = 30;
  const highJab = CHARACTERS.adnan.moves.p1;
  const jabBox = getMoveHitboxWorld(state.p1, highJab);
  const iyenHurt = getFighterHurtbox(state.p2);

  assert.ok(
    jabBox.bottom > iyenHurt.top,
    `Adnan high jab bottom (${jabBox.bottom}) should clear Dik Iyen top (${iyenHurt.top})`
  );

  // Confirm Ibu Tika standing Highs (p1 & k3) also clear Dik Iyen, while hitting Kak Dhira
  const tikaState = createMatchState('tika', 'iyen', 'kitchen', 'training');
  tikaState.p1.x = -30;
  tikaState.p2.x = 30;
  const tikaP1 = getMoveHitboxWorld(tikaState.p1, CHARACTERS.tika.moves.p1);
  const tikaK3 = getMoveHitboxWorld(tikaState.p1, CHARACTERS.tika.moves.k3);
  assert.ok(tikaP1.bottom > iyenHurt.top, `Tika p1 bottom (${tikaP1.bottom}) clears Iyen (${iyenHurt.top})`);
  assert.ok(tikaK3.bottom > iyenHurt.top, `Tika k3 bottom (${tikaK3.bottom}) clears Iyen (${iyenHurt.top})`);
  assert.ok(tikaP1.bottom < CHARACTERS.dhira.standingHeight, 'Tika p1 hits Kak Dhira');

  // Confirm Adnan's crouch_p CAN hit Dik Iyen
  const lowPunch = CHARACTERS.adnan.moves.crouch_p;
  const lowBox = getMoveHitboxWorld(state.p1, lowPunch);
  assert.ok(lowBox.bottom < iyenHurt.top && lowBox.top > iyenHurt.bottom);
});

test('Auto chain combo progresses p1 -> p2 -> p3 -> p4 on sequential punch presses', () => {
  const state = createMatchState('tika', 'adnan', 'dojo', 'training');
  state.p1.x = -35;
  state.p2.x = 35;

  const p1In = createEmptyInput();
  const p2In = createEmptyInput();

  // Start p1
  p1In.punchPressed = true;
  stepMatch(state, p1In, p2In, 0.016);
  assert.equal(state.p1.currentMove?.id, 'p1');

  // Advance until p1 active window & buffer p2
  p1In.punchPressed = false;
  for (let i = 0; i < 10; i++) {
    stepMatch(state, p1In, p2In, 0.016);
  }
  p1In.punchPressed = true;
  stepMatch(state, p1In, p2In, 0.016);
  p1In.punchPressed = false;

  // Step a few frames for chain transition to trigger
  let sawP2 = false;
  for (let i = 0; i < 15; i++) {
    stepMatch(state, p1In, p2In, 0.016);
    const curId: string | undefined = state.p1.currentMove?.id;
    if (curId === 'p2') {
      sawP2 = true;
      break;
    }
  }
  assert.equal(sawP2, true, 'Expected chain combo to advance from p1 to p2');
});

test('All 4 characters trigger Neutral+SP, Up/Fwd+SP, Down+SP, and Super Move cleanly', () => {
  const chars = ['adnan', 'tika', 'dhira', 'iyen'] as const;
  for (const ch of chars) {
    const state = createMatchState(ch, 'adnan', 'park', 'training');
    const p1In = createEmptyInput();
    const p2In = createEmptyInput();

    // Neutral + SP
    p1In.spPressed = true;
    stepMatch(state, p1In, p2In, 0.016);
    assert.equal(state.p1.currentMove?.id, 'sp_neutral', `${ch} neutral SP`);

    // Wait recovery
    p1In.spPressed = false;
    for (let i = 0; i < 45; i++) stepMatch(state, p1In, p2In, 0.02);

    // Up/Fwd + SP
    p1In.moveX = 1;
    p1In.spPressed = true;
    stepMatch(state, p1In, p2In, 0.016);
    assert.equal(state.p1.currentMove?.id, 'sp_up_fwd', `${ch} up/fwd SP`);

    // Wait land & recovery
    p1In.moveX = 0;
    p1In.spPressed = false;
    for (let i = 0; i < 65; i++) stepMatch(state, p1In, p2In, 0.02);

    // Down + SP
    p1In.moveY = -1;
    p1In.spPressed = true;
    stepMatch(state, p1In, p2In, 0.016);
    assert.equal(state.p1.currentMove?.id, 'sp_down', `${ch} down SP`);

    for (let i = 0; i < 55; i++) {
      p1In.moveY = 0;
      p1In.spPressed = false;
      stepMatch(state, p1In, p2In, 0.02);
    }

    // Super Move requires 100 meter
    state.p1.superMeter = 100;
    p1In.superPressed = true;
    stepMatch(state, p1In, p2In, 0.016);
    assert.equal(state.p1.currentMove?.id, 'super', `${ch} super move`);
    assert.equal(state.p1.superMeter, 0, `${ch} super consumes meter`);
  }
});

test('Arena boundaries clamp fighters and block reduces damage to chip', () => {
  const state = createMatchState('adnan', 'tika', 'living_room', 'cpu');
  state.roundPhase = 'fight';
  state.p1.x = -1000;
  state.p2.x = 1000;
  stepMatch(state, createEmptyInput(), createEmptyInput(), 0.016);
  assert.ok(state.p1.x >= -ARENA_HALF_WIDTH);
  assert.ok(state.p2.x <= ARENA_HALF_WIDTH);

  // Test blocking
  state.p1.x = -35;
  state.p2.x = 35;
  const p2StartHp = state.p2.hp;
  const p1In = createEmptyInput();
  const p2In = createEmptyInput();
  p2In.blockHeld = true;
  p1In.spPressed = true;
  p1In.moveY = -1; // Adnan Belly Bump (16 dmg, 4 chip)

  for (let i = 0; i < 20; i++) {
    stepMatch(state, p1In, p2In, 0.016);
    p1In.spPressed = false;
    p1In.moveY = 0;
  }
  const dmgTaken = p2StartHp - state.p2.hp;
  assert.equal(dmgTaken, CHARACTERS.adnan.moves.sp_down.chipDamage);
});

test('Best of 3 round transitions reach match_end after 2 round wins', () => {
  const state = createMatchState('adnan', 'tika', 'dojo', 'cpu');
  state.roundPhase = 'fight';
  state.p2.hp = 0;

  // Step through KO transition
  for (let i = 0; i < 130; i++) {
    stepMatch(state, createEmptyInput(), createEmptyInput(), 0.02);
  }
  assert.equal(state.p1.roundsWon, 1);
  assert.equal(state.roundNumber, 2);

  // Win round 2
  state.roundPhase = 'fight';
  state.p2.hp = 0;
  for (let i = 0; i < 130; i++) {
    stepMatch(state, createEmptyInput(), createEmptyInput(), 0.02);
  }
  assert.equal(state.p1.roundsWon, 2);
  assert.equal(state.roundPhase, 'match_end');
  assert.equal(state.winnerSlot, 1);
});

test('All characters have extended maxHp for longer matches (>= 390)', () => {
  assert.equal(CHARACTERS.adnan.maxHp, 520);
  assert.equal(CHARACTERS.tika.maxHp, 460);
  assert.equal(CHARACTERS.dhira.maxHp, 420);
  assert.equal(CHARACTERS.iyen.maxHp, 390);
  for (const id of ['adnan', 'tika', 'dhira', 'iyen'] as const) {
    const state = createMatchState(id, 'adnan', 'dojo', 'cpu');
    assert.ok(state.p1.maxHp >= 390);
    assert.equal(state.p1.hp, state.p1.maxHp);
  }
});

test('Knockdown activates Bullet-Time slow-mo & Dramatic Close-up camera then recovers cleanly', () => {
  const state = createMatchState('adnan', 'tika', 'dojo', 'training');
  state.p1.x = -35;
  state.p2.x = 35;

  const p1In = createEmptyInput();
  const p2In = createEmptyInput();
  p1In.spPressed = true;
  p1In.moveY = -1; // Ayah Adnan Belly Bump (knockdown = true)

  let sawBulletTimeCue = false;
  let sawDramaticSlowMo = false;

  for (let i = 0; i < 30; i++) {
    const cues = stepMatch(state, p1In, p2In, 0.016);
    p1In.spPressed = false;
    p1In.moveY = 0;
    if (cues.includes('bullet_time')) sawBulletTimeCue = true;
    if (state.dramaticCam.active && state.timeScale < 0.5) {
      sawDramaticSlowMo = true;
      break;
    }
  }

  assert.equal(sawBulletTimeCue, true, 'Expected bullet_time cue on knockdown');
  assert.equal(sawDramaticSlowMo, true, 'Expected dramaticCam.active and timeScale < 0.5');

  // Step forward in real time until dramatic camera completes & timeScale recovers to 1.0
  for (let i = 0; i < 80; i++) {
    stepMatch(state, createEmptyInput(), createEmptyInput(), 0.02);
  }
  assert.equal(state.dramaticCam.active, false);
  assert.ok(state.timeScale > 0.98, `Expected timeScale to recover near 1.0, got ${state.timeScale}`);
});

test('Wakeup protection blocks hits while knocked down or getting up, and anti-spam forces knockdown after 5 hits', () => {
  const state = createMatchState('adnan', 'tika', 'dojo', 'training');
  state.p1.x = -35;
  state.p2.x = 35;

  // Knockdown & wakeup invulnerability: hits must deal 0 damage until defender fully stands up
  state.p2.state = 'knockdown';
  state.p2.stateTimer = 0.25;
  const hpDuringKd = state.p2.hp;
  const p1Attack = createEmptyInput();
  p1Attack.punchPressed = true;
  for (let i = 0; i < 12; i++) {
    stepMatch(state, p1Attack, createEmptyInput(), 0.016);
    p1Attack.punchPressed = false;
  }
  assert.equal(state.p2.hp, hpDuringKd, 'Opponent must take 0 damage during knockdown/wakeup');

  // Reset P2 to standing with 4 prior combo hits -> 5th hit must trigger protective knockdown blowback
  state.p2.state = 'hitstun';
  state.p2.stateTimer = 0.6;
  state.p2.invulnTimer = 0;
  state.p2.comboCountReceived = 4;
  state.p1.state = 'idle';
  state.p1.currentMove = null;
  state.p1.x = -30;
  state.p2.x = 30;
  const p1Punch = createEmptyInput();
  p1Punch.punchPressed = true;
  for (let i = 0; i < 12; i++) {
    stepMatch(state, p1Punch, createEmptyInput(), 0.016);
    p1Punch.punchPressed = false;
    if ((state.p2.state as string) === 'knockdown') break;
  }
  assert.equal(state.p2.state, 'knockdown', '5th consecutive hit must trigger anti-spam knockdown blowback');
});

test('Each of the 4 characters has a distinct victory pose and winner enters victory state on match_end', () => {
  const poses = (['adnan', 'tika', 'dhira', 'iyen'] as const).map((charId) => {
    const st = createMatchState(charId, 'adnan', 'dojo', 'cpu');
    st.p1.state = 'victory';
    st.p1.animTime = 0.35;
    return { charId, pose: computeFighterPose(st.p1) };
  });

  // Verify every pair differs meaningfully across joints/weapon angles
  for (let i = 0; i < poses.length; i++) {
    for (let j = i + 1; j < poses.length; j++) {
      const a = poses[i].pose;
      const b = poses[j].pose;
      const diff =
        Math.abs(a.armFrontUpper - b.armFrontUpper) +
        Math.abs(a.armFrontFore - b.armFrontFore) +
        Math.abs(a.armBackUpper - b.armBackUpper) +
        Math.abs(a.hipDrop - b.hipDrop) +
        Math.abs(a.bodyTilt - b.bodyTilt) +
        Math.abs(a.torsoTwist - b.torsoTwist) +
        Math.abs(a.weaponReach - b.weaponReach);
      assert.ok(diff > 0.35, `Expected distinct victory poses for ${poses[i].charId} vs ${poses[j].charId}`);
    }
  }

  // Verify unique signature behaviors: Adnan goofy dance, Tika ballet pirouette, Dhira koprol, Iyen hopping
  const checkVictoryStyle = (charId: 'adnan' | 'tika' | 'dhira' | 'iyen', t: number) => {
    const m = createMatchState(charId, 'adnan', 'dojo', 'cpu');
    m.p1.state = 'victory';
    m.p1.animTime = t;
    return computeFighterPose(m.p1);
  };
  assert.ok(Math.abs(checkVictoryStyle('adnan', 0.25).hipSway) > 0.1, 'Adnan goofy dance hip sway');
  assert.ok(checkVictoryStyle('tika', 0.8).bodyYaw > 2.5, 'Tika ballet pirouette continuous yaw spin');
  assert.ok(checkVictoryStyle('dhira', 0.5).bodyTilt > 1.0 && checkVictoryStyle('dhira', 0.5).bodyLift > 20, 'Dhira koprol forward flip + lift');
  assert.ok(checkVictoryStyle('iyen', 0.24).bodyLift > 20, 'Iyen joyful hopping lift');

  // Winner remains in 'victory' state when roundPhase transitions to 'match_end'
  const match = createMatchState('iyen', 'dhira', 'park', 'cpu');
  match.roundPhase = 'fight';
  match.p1.roundsWon = 1;
  match.p2.hp = 0;
  for (let i = 0; i < 130; i++) {
    stepMatch(match, createEmptyInput(), createEmptyInput(), 0.02);
  }
  assert.equal(match.roundPhase, 'match_end');
  assert.equal(match.winnerSlot, 1);
  assert.equal(match.p1.state, 'victory');
});

test('Shockwave particles spawn on Super activation and heavy knockdown impacts', () => {
  const st = createMatchState('adnan', 'tika', 'dojo', 'training');
  st.p1.x = -35;
  st.p2.x = 35;
  st.p1.superMeter = 100;
  const p1In = createEmptyInput();
  p1In.superPressed = true;
  stepMatch(st, p1In, createEmptyInput(), 0.016);

  const hasAirShock = st.particles.some((p) => p.active && p.kind === 'shockwave');
  const hasGroundShock = st.particles.some((p) => p.active && p.kind === 'shockwave_ground');
  assert.equal(hasAirShock, true, 'Expected shockwave particle on Super activation');
  assert.equal(hasGroundShock, true, 'Expected ground shockwave particle on Super activation');
});

test('All 8 arenas and proportional character heights are configured cleanly', () => {
  assert.equal(STAGE_ORDER.length, 8);
  for (const stageId of STAGE_ORDER) {
    assert.ok(STAGES[stageId]);
    const st = createMatchState('adnan', 'tika', stageId, 'cpu');
    assert.equal(st.stageId, stageId);
  }
  assert.ok(CHARACTERS.adnan.standingHeight > CHARACTERS.tika.standingHeight);
  assert.ok(CHARACTERS.tika.standingHeight > CHARACTERS.dhira.standingHeight);
  assert.ok(CHARACTERS.dhira.standingHeight > CHARACTERS.iyen.standingHeight);
  const dhiraRatio = CHARACTERS.dhira.visual.heightScale / CHARACTERS.adnan.visual.heightScale;
  assert.ok(Math.abs(dhiraRatio - 2 / 3) < 0.02);
});

test('Double-tap dash, yawning backstep i-frames, and close throw breaking continuous block', () => {
  const st = createMatchState('adnan', 'tika', 'dojo', 'training');
  st.p1.x = -100;
  st.p2.x = 100;
  const p1In = createEmptyInput();
  const p2In = createEmptyInput();

  // Forward double-tap -> dash
  p1In.moveX = 1;
  stepMatch(st, p1In, p2In, 0.016);
  p1In.moveX = 0;
  stepMatch(st, p1In, p2In, 0.016);
  p1In.moveX = 1;
  stepMatch(st, p1In, p2In, 0.016);
  assert.equal(st.p1.state, 'dash');

  // Recover to idle, then backward double-tap -> backstep with i-frames
  p1In.moveX = 0;
  for (let i = 0; i < 20; i++) stepMatch(st, p1In, p2In, 0.02);
  assert.equal(st.p1.state, 'idle');

  p1In.moveX = -1;
  stepMatch(st, p1In, p2In, 0.016);
  p1In.moveX = 0;
  stepMatch(st, p1In, p2In, 0.016);
  p1In.moveX = -1;
  stepMatch(st, p1In, p2In, 0.016);
  assert.equal(st.p1.state, 'backstep');
  assert.ok(st.p1.invulnTimer >= 0.12, 'Backstep grants brief invulnerability');

  // Close throw breaks continuous block
  const throwState = createMatchState('tika', 'adnan', 'dojo', 'training');
  throwState.p1.x = -30;
  throwState.p2.x = 30;
  const tIn1 = createEmptyInput();
  const tIn2 = createEmptyInput();
  tIn2.blockHeld = true;
  tIn1.punchPressed = true;
  tIn1.kickHeld = true;

  const startHp = throwState.p2.hp;
  for (let i = 0; i < 16; i++) {
    stepMatch(throwState, tIn1, tIn2, 0.016);
    tIn1.punchPressed = false;
    tIn1.kickHeld = false;
  }
  assert.ok(throwState.p2.hp < startHp - 5, 'Throw must bypass block and deal full throw damage');
  assert.equal(throwState.p2.state, 'knockdown', 'Throw must knock down blocking opponent');
});

test('Ayah Adnan Mode Mager grants 1-hit Heavy armor & slow walk, Putaran Pemalas reflects projectiles', () => {
  const st = createMatchState('adnan', 'dhira', 'living_room', 'training');
  const p1In = createEmptyInput();
  const p2In = createEmptyInput();

  // Stand still for > 2.0s -> Mode Mager activates
  for (let i = 0; i < 110; i++) stepMatch(st, p1In, p2In, 0.02);
  assert.equal(st.p1.magerArmorHits, 1);
  assert.equal(st.p1.charFsmStatus, 'mager');

  // Walking in Mager is reduced to 0.72x walkSpeed
  p1In.moveX = 1;
  stepMatch(st, p1In, p2In, 0.016);
  assert.ok(
    Math.abs(st.p1.vx - CHARACTERS.adnan.walkSpeed * 0.72) < 1,
    `Expected Mager walk speed ~${CHARACTERS.adnan.walkSpeed * 0.72}, got ${st.p1.vx}`
  );

  // Heavy attack absorbs 1 hit without entering hitstun
  st.p1.x = -35;
  st.p2.x = 35;
  p1In.moveX = 0;
  p1In.moveY = -1;
  p1In.spPressed = true; // sp_down is a Heavy move
  p2In.punchPressed = true;
  stepMatch(st, p1In, p2In, 0.016);
  p1In.spPressed = false;
  p1In.moveY = 0;
  p2In.punchPressed = false;

  for (let i = 0; i < 12; i++) {
    stepMatch(st, p1In, p2In, 0.016);
  }
  assert.equal(st.p1.magerArmorHits, 0, 'Mager armor hit should be consumed on impact');
  assert.notEqual(st.p1.state, 'hitstun', 'Adnan should tank through hitstun using Mode Mager armor');

  // Putaran Pemalas (sp_back) reflects Kak Dhira origami projectile
  const reflState = createMatchState('adnan', 'dhira', 'living_room', 'training');
  reflState.p1.x = -190;
  reflState.p2.x = 190;
  const r1 = createEmptyInput();
  const r2 = createEmptyInput();
  r2.spPressed = true; // Dhira throws origami_arc toward P1
  stepMatch(reflState, r1, r2, 0.016);
  r2.spPressed = false;

  // Trigger Adnan sp_back (back + SP) while projectile travels across arena
  for (let i = 0; i < 16; i++) stepMatch(reflState, r1, r2, 0.016);
  r1.moveX = -1;
  r1.spPressed = true;
  stepMatch(reflState, r1, r2, 0.016);
  r1.moveX = 0;
  r1.spPressed = false;

  let reflected = false;
  for (let i = 0; i < 30; i++) {
    stepMatch(reflState, r1, r2, 0.016);
    if (reflState.projectiles.some((p) => p.active && p.ownerSlot === 1 && p.vx > 0)) {
      reflected = true;
      break;
    }
  }
  assert.equal(reflected, true, 'Putaran Pemalas should reflect incoming projectile back to owner 1');
});

test('Ibu Tika Perfect Parry, Mode Omelan recovery speedup, and Guard Burnout', () => {
  // Perfect Parry
  const parryState = createMatchState('adnan', 'tika', 'kitchen', 'training');
  parryState.p1.x = -35;
  parryState.p2.x = 35;
  const aIn = createEmptyInput();
  const tIn = createEmptyInput();

  aIn.punchPressed = true;
  stepMatch(parryState, aIn, tIn, 0.016);
  aIn.punchPressed = false;

  // Tap block right before active frames
  for (let i = 0; i < 4; i++) stepMatch(parryState, aIn, tIn, 0.016);
  tIn.blockHeld = true;
  for (let i = 0; i < 6; i++) {
    stepMatch(parryState, aIn, tIn, 0.016);
    if (parryState.p2.currentMove?.id === 'parry_counter') break;
  }
  assert.equal(parryState.p2.currentMove?.id, 'parry_counter', 'Fresh block press triggers Ibu Tika Perfect Parry');
  assert.ok(parryState.p2.omelanMeter >= 20, 'Perfect Parry increases Omelan meter');

  // Mode Omelan & Guard Burnout
  const omelanState = createMatchState('tika', 'adnan', 'kitchen', 'cpu');
  omelanState.roundPhase = 'fight';
  omelanState.p1.x = -40;
  omelanState.p2.x = 40;
  omelanState.p2.guardStamina = 10; // low stamina so blocked heavy triggers Burnout

  const p1In = createEmptyInput();
  const p2In = createEmptyInput();
  p2In.blockHeld = true;
  p1In.spPressed = true;
  p1In.moveY = -1; // Omelan Beruntun into guard

  for (let i = 0; i < 30; i++) {
    stepMatch(omelanState, p1In, p2In, 0.016);
    p1In.spPressed = false;
    p1In.moveY = 0;
  }
  assert.ok(omelanState.p1.omelanMeter >= 30, 'Blocking Tika attacks builds Mode Omelan');
  assert.equal(omelanState.p1.charFsmStatus, 'omelan');
  assert.ok(omelanState.p2.burnoutTimer > 0, 'Depleting guard stamina triggers Burnout');
  assert.equal(omelanState.p2.charFsmStatus, 'burnout');

  // Omelan Beruntun Low vs Overhead finisher mix-up: holding Down hits low through stand-back guard
  const mixState = createMatchState('tika', 'adnan', 'kitchen', 'training');
  mixState.p1.x = -40;
  mixState.p2.x = 40;
  const m1 = createEmptyInput();
  const m2 = createEmptyInput();
  m2.moveX = 1; // P2 (facing left) holds back = standing guard (blocked mid/overhead, vulnerable to low!)
  m1.moveY = -1;
  m1.spPressed = true;
  for (let i = 0; i < 35; i++) {
    stepMatch(mixState, m1, m2, 0.016);
    m1.spPressed = false;
    // Keep holding m1.moveY = -1 so final hit is LOW and breaks standing back-guard
  }
  assert.equal(mixState.p2.state, 'knockdown', 'Holding Down on Omelan Beruntun triggers Low finisher breaking standing guard');
});

test('Kak Dhira Pose Centil Counter Stance evades behind attacker and triggers Back Rise', () => {
  const st = createMatchState('adnan', 'dhira', 'library', 'training');
  st.p1.x = -35;
  st.p2.x = 35;
  const p1In = createEmptyInput();
  const p2In = createEmptyInput();

  // Dhira (P2, facing -1) holds forward/+1 (her back) + SP -> Pose Centil
  p2In.moveX = 1;
  p2In.spPressed = true;
  stepMatch(st, p1In, p2In, 0.016);
  p2In.moveX = 0;
  p2In.spPressed = false;
  assert.equal(st.p2.state, 'counter_stance');

  // Step through Dhira 4f startup so counter window is active, then Adnan punches
  for (let i = 0; i < 4; i++) stepMatch(st, p1In, p2In, 0.016);
  p1In.punchPressed = true;
  stepMatch(st, p1In, p2In, 0.016);
  p1In.punchPressed = false;

  let countered = false;
  for (let i = 0; i < 12; i++) {
    stepMatch(st, p1In, p2In, 0.016);
    if (st.p2.currentMove?.id === 'counter_slash') {
      countered = true;
      break;
    }
  }
  assert.equal(countered, true, 'Dhira Pose Centil should trigger counter_slash on hit');
  assert.ok(st.p2.x < st.p1.x, 'Dhira should evade behind Adnan during Pose Centil counter');

  // Back Rise wakeup moves backward (clear dramatic slow-mo from counter_slash first)
  st.dramaticCam.active = false;
  st.timeScale = 1;
  st.hitstopTimer = 0;
  st.p2.state = 'knockdown';
  st.p2.y = 0;
  st.p2.stateTimer = 0.01;
  st.p2.x = 80;
  st.p2.facing = -1;
  const beforeX = st.p2.x;
  stepMatch(st, createEmptyInput(), createEmptyInput(), 0.02);
  assert.equal(st.p2.state, 'wakeup');
  assert.equal(st.p2.backRiseActive, true);
  stepMatch(st, createEmptyInput(), createEmptyInput(), 0.05);
  assert.ok(st.p2.x > beforeX, 'Dhira Back Rise rolls backward away from opponent');

  // Low crouch hurtbox avoids high jab
  st.p2.state = 'crouch';
  const jabBox = getMoveHitboxWorld(st.p1, CHARACTERS.adnan.moves.p1);
  const crouchHurt = getFighterHurtbox(st.p2);
  assert.ok(jabBox.bottom > crouchHurt.top, 'Adnan high jab clears crouching Kak Dhira');
});

test('Dik Iyen kelereng traps trip moving opponent, Tantrum Roll dodges highs, and Mode Rewel pushes corner pressure', () => {
  const st = createMatchState('iyen', 'tika', 'park', 'training');
  st.p1.x = -110;
  st.p2.x = 60;
  const p1In = createEmptyInput();
  const p2In = createEmptyInput();

  // P1 Iyen back + SP -> spawns 3 floor kelereng_trap projectiles
  p1In.moveX = -1;
  p1In.spPressed = true;
  stepMatch(st, p1In, p2In, 0.016);
  p1In.moveX = 0;
  p1In.spPressed = false;
  assert.ok(st.projectiles.some((p) => p.active && p.type === 'kelereng_trap'));

  // P2 Tika walks forward onto the traps -> slips into knockdown
  p2In.moveX = -1;
  let slipped = false;
  for (let i = 0; i < 45; i++) {
    stepMatch(st, p1In, p2In, 0.016);
    if (st.p2.state === 'knockdown') {
      slipped = true;
      break;
    }
  }
  assert.equal(slipped, true, 'Walking onto kelereng_trap should trip opponent into knockdown');

  // Wait for Iyen sp_back recovery and clear hitstop/slow-mo from trap hit before testing sp_down
  st.hitstopTimer = 0;
  st.dramaticCam.active = false;
  st.timeScale = 1;
  p2In.moveX = 0;
  for (let i = 0; i < 30; i++) stepMatch(st, p1In, p2In, 0.02);
  p1In.moveY = -1;
  p1In.spPressed = true;
  stepMatch(st, p1In, p2In, 0.016);
  p1In.moveY = 0;
  p1In.spPressed = false;
  assert.equal(st.p1.currentMove?.id, 'sp_down');
  assert.equal(getFighterHurtbox(st.p1).top - getFighterHurtbox(st.p1).bottom, CHARACTERS.iyen.crouchingHeight);

  // Mode Rewel triggers on cumulative >= 85 damage and pushes nearby opponent away
  const rewelState = createMatchState('adnan', 'iyen', 'park', 'cpu');
  rewelState.roundPhase = 'fight';
  rewelState.p1.x = -35;
  rewelState.p2.x = 35;
  rewelState.p2.damageTakenSinceTantrum = 82;
  const aIn = createEmptyInput();
  aIn.punchPressed = true;
  aIn.moveY = -1; // low crouch_p hits Iyen for 7 dmg -> crosses 85 threshold
  let tantrumSeen = false;
  for (let i = 0; i < 20; i++) {
    const cues = stepMatch(rewelState, aIn, createEmptyInput(), 0.016);
    aIn.punchPressed = false;
    aIn.moveY = 0;
    if (cues.includes('tantrum_cry') || rewelState.p2.state === 'tantrum') {
      tantrumSeen = true;
      break;
    }
  }
  assert.equal(tantrumSeen, true, 'Crossing 85 cumulative damage triggers Dik Iyen Mode Rewel tantrum');
  assert.equal(rewelState.p2.charFsmStatus, 'rewel');
  assert.equal(rewelState.p1.state, 'hitstun', 'Tantrum shockwave pushes nearby attacker into hitstun');
});

test('Face mask asset mapping points to existing PNG files for all 4 characters', () => {
  const expected: Record<string, string> = {
    adnan: '/assets/aistudio/Ayah_Adnan_fabd0a5b.png',
    tika: '/assets/aistudio/Ibu_TIka_4d5a6b7c.png',
    dhira: '/assets/aistudio/Kak_Dhira_4ca87974.png',
    iyen: '/assets/aistudio/Dik_Iyen_5d7e9c6f.png',
  };

  for (const id of CHARACTER_ORDER) {
    assert.equal(FACE_MASK_PATHS[id], expected[id]);
    const diskPath = path.join(process.cwd(), 'public', FACE_MASK_PATHS[id].replace(/^\//, ''));
    assert.equal(fs.existsSync(diskPath), true, `Missing face mask file on disk: ${diskPath}`);
  }
});

test('Face mask defaults to enabled and HUD portrait preview activates by default', () => {
  assert.equal(DEFAULT_FACE_MASK_ENABLED, true);
  assert.equal(readFaceMaskSetting(null), true);

  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  assert.equal(readFaceMaskSetting(mockStorage), true);
  writeFaceMaskSetting(mockStorage, true);
  assert.equal(mem.get(FACE_MASK_STORAGE_KEY), '1');
  assert.equal(readFaceMaskSetting(mockStorage), true);
  writeFaceMaskSetting(mockStorage, false);
  assert.equal(mem.get(FACE_MASK_STORAGE_KEY), '0');
  assert.equal(readFaceMaskSetting(mockStorage), false);

  for (const id of CHARACTER_ORDER) {
    assert.equal(getHudFacePortraitSpec(id, false), null);
    assert.deepEqual(getHudFacePortraitSpec(id, true), {
      charId: id,
      src: FACE_MASK_PATHS[id],
    });
  }

  const p1Svg = buildHudOvalFrameSvg(1);
  const p2Svg = buildHudOvalFrameSvg(2);
  assert.ok(p1Svg.includes('viewBox="0 0 100 120"'));
  assert.ok(p1Svg.includes('<ellipse'));
  assert.ok(p1Svg.includes('data-slot="1"'));
  assert.ok(p2Svg.includes('data-slot="2"'));
  assert.ok(p1Svg.includes('stroke="#FFFFFF"'));
  assert.ok(p1Svg.includes('stroke="#111111"'));
  assert.ok(p1Svg.includes('#FF0000'));
  assert.ok(p1Svg.includes('<path'));
});
