import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAT_ARENA_MAX_X,
  CAT_ARENA_MIN_X,
  CatBehavior,
  computeCatPose,
  createCatNpcState,
  getParkSwingSeatPos,
  getStageCatZone,
  resetCatNpcForStage,
  STAGE_CAT_ZONES,
  stepCatNpc,
} from './catNpc';
import { ARENA_HALF_WIDTH } from './math3d';
import { STAGE_ORDER } from './stages';

function makeDeterministicRng(seed = 1234567): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('catNpc', () => {
  it('defines full-width floor roaming bounds and multi-object perches for all 8 stages', () => {
    assert.equal(STAGE_ORDER.length, 8);
    assert.ok(CAT_ARENA_MIN_X <= -450 && CAT_ARENA_MIN_X >= -ARENA_HALF_WIDTH);
    assert.ok(CAT_ARENA_MAX_X >= 450 && CAT_ARENA_MAX_X <= ARENA_HALF_WIDTH);

    for (const stageId of STAGE_ORDER) {
      const zone = getStageCatZone(stageId);
      assert.ok(zone, `Missing zone for ${stageId}`);
      assert.equal(STAGE_CAT_ZONES[stageId], zone);
      assert.equal(zone.floorY, 0);
      assert.ok(zone.minX <= -450, `${stageId} reaches far left boundary`);
      assert.ok(zone.maxX >= 450, `${stageId} reaches far right boundary`);
      assert.ok(zone.waypoints.some((x) => x <= -400), `${stageId} has far-left waypoint`);
      assert.ok(zone.waypoints.includes(0), `${stageId} has center waypoint`);
      assert.ok(zone.waypoints.some((x) => x >= 400), `${stageId} has far-right waypoint`);
      assert.ok(zone.perches.length >= 2, `${stageId} has multiple climbable objects`);

      for (const perch of zone.perches) {
        assert.ok(perch.y > 0, `${stageId}.${perch.id} perch height > 0`);
        assert.ok(perch.zGame >= 120 && perch.zGame <= 265, `${stageId}.${perch.id} zGame valid`);
      }
    }

    const jbZone = getStageCatZone('jembatan_brawijaya');
    for (const perch of jbZone.perches) {
      assert.ok(
        Math.abs(perch.x) >= 130,
        `Jembatan Brawijaya perch ${perch.id} sits outside open center bridge road (|x| >= 130)`
      );
    }
  });

  it('walks freely to far-left and far-right arena limits, climbs random objects, sleeps on floor & objects, and jumps back down', () => {
    const rng = makeDeterministicRng(424242);
    const state = createCatNpcState('living_room', rng);
    const seenBehaviors = new Set<CatBehavior>([state.behavior]);
    const visitedPerches = new Set<string>();
    let sleptOnFloor = false;
    let sleptOnPerch = false;
    let sawFloorReturn = false;
    let minX = state.x;
    let maxX = state.x;

    // Simulate 320 seconds at 30 Hz
    for (let i = 0; i < 320 * 30; i++) {
      stepCatNpc(state, 1 / 30, rng);
      seenBehaviors.add(state.behavior);
      minX = Math.min(minX, state.x);
      maxX = Math.max(maxX, state.x);

      if (state.onPerch && state.activePerch) {
        visitedPerches.add(state.activePerch.id);
        if (state.behavior === 'loaf_nap') sleptOnPerch = true;
      } else if (!state.onPerch && state.behavior === 'loaf_nap') {
        sleptOnFloor = true;
      }

      if (visitedPerches.size > 0 && !state.onPerch) {
        sawFloorReturn = true;
      }

      assert.ok(state.x >= -ARENA_HALF_WIDTH && state.x <= ARENA_HALF_WIDTH, 'stays within arena X bounds');
      assert.ok(Number.isFinite(state.x), 'state.x finite');
      assert.ok(Number.isFinite(state.y), 'state.y finite');
      assert.ok(Number.isFinite(state.zGame), 'state.zGame finite');
      assert.ok(Number.isFinite(state.yaw), 'state.yaw finite');
    }

    assert.ok(minX <= -410, `Expected cat to walk to far left edge (minX=${minX})`);
    assert.ok(maxX >= 410, `Expected cat to walk to far right edge (maxX=${maxX})`);
    assert.ok(seenBehaviors.has('walk'));
    assert.ok(seenBehaviors.has('sit'));
    assert.ok(seenBehaviors.has('lick_tail'));
    assert.ok(seenBehaviors.has('wash_face'));
    assert.ok(seenBehaviors.has('stretch'));
    assert.ok(seenBehaviors.has('loaf_nap'));
    assert.ok(seenBehaviors.has('pounce_hop'));
    assert.ok(seenBehaviors.has('jump_to_perch'));
    assert.ok(seenBehaviors.has('jump_to_floor'));
    assert.ok(visitedPerches.size >= 3, `Expected cat to climb multiple objects (got ${visitedPerches.size})`);
    assert.equal(sleptOnFloor, true, 'Expected cat to sleep on the floor');
    assert.equal(sleptOnPerch, true, 'Expected cat to sleep on top of an object');
    assert.equal(sawFloorReturn, true, 'Expected cat to jump back down to floor');
  });

  it('tracks live park swing seat motion and climbs objects in kitchen, library, and dojo', () => {
    const rng = makeDeterministicRng(998877);
    const state = createCatNpcState('park', rng);
    const swingPerch = getStageCatZone('park').perches.find((p) => p.id === 'swing_seat')!;
    assert.ok(swingPerch);

    state.onPerch = true;
    state.activePerch = swingPerch;
    state.behavior = 'loaf_nap';
    state.behaviorTimer = 3.0;
    state.behaviorDuration = 3.0;

    const stageT = 2.4;
    stepCatNpc(state, 1 / 30, rng, stageT);
    const expected = getParkSwingSeatPos(stageT);
    assert.equal(state.x, expected.x);
    assert.equal(state.y, expected.seatTopY);
    assert.equal(state.zGame, expected.zGame);

    for (const stageId of ['kitchen', 'library', 'dojo', 'rooftop'] as const) {
      resetCatNpcForStage(state, stageId, rng);
      assert.equal(state.stageId, stageId);
      assert.equal(state.y, 0);
      assert.equal(state.onPerch, false);
      const climbed = new Set<string>();
      for (let i = 0; i < 160 * 30; i++) {
        stepCatNpc(state, 1 / 30, rng);
        if (state.onPerch && state.activePerch) {
          climbed.add(state.activePerch.id);
        }
      }
      assert.ok(climbed.size >= 1, `Expected cat to climb at least 1 object in ${stageId}`);
    }
  });

  it('computes distinct expressive poses including sleeping state for cute cat behaviors', () => {
    const rng = makeDeterministicRng(7);
    const state = createCatNpcState('dojo', rng);

    state.behavior = 'lick_tail';
    state.behaviorElapsed = 0.25;
    state.behaviorDuration = 3.0;
    const lickPose = computeCatPose(state);
    assert.equal(lickPose.happyEyes, true);
    assert.equal(lickPose.tongueOut, true);
    assert.equal(lickPose.sleeping, false);
    assert.ok(Math.abs(lickPose.tailBaseYaw) > 1.0);

    state.behavior = 'loaf_nap';
    const loafPose = computeCatPose(state);
    assert.equal(loafPose.eyesClosed, true);
    assert.equal(loafPose.sleeping, true);
    assert.ok(loafPose.bodyY < 9);

    state.behavior = 'wash_face';
    const washPose = computeCatPose(state);
    assert.equal(washPose.happyEyes, true);
    assert.ok(Math.max(washPose.legFL, washPose.legFR) > 0.9);

    state.behavior = 'stretch';
    state.behaviorElapsed = 1.25;
    state.behaviorDuration = 2.5;
    const stretchPose = computeCatPose(state);
    assert.ok(stretchPose.bodyPitch < -0.2);

    state.behavior = 'pounce_hop';
    state.behaviorElapsed = 0.25;
    state.behaviorDuration = 2.0;
    const hopPose = computeCatPose(state);
    assert.ok(hopPose.bodyY > 18);
  });
});
