import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMatchState, createEmptyInput, stepMatch } from './combat';
import {
  BIG_HIT_SLOWMO_SCALE,
  KO_SLOWMO_SCALE,
  createReplayPlayback,
  createReplayRecorder,
  cycleReplaySpeed,
  getReplayProgress,
  recordReplayFrame,
  restartReplayPlayback,
  stepReplayPlayback,
  toggleReplayPause,
} from './replay';

describe('replay system logic', () => {
  it('records input frames and replays them deterministically via stepReplayPlayback', () => {
    const match = createMatchState('adnan', 'tika', 'living_room', 'cpu', 'normal');
    const recorder = createReplayRecorder(match);

    // Advance intro/combat for 45 frames
    for (let i = 0; i < 45; i++) {
      const p1In = createEmptyInput();
      if (i > 5 && i < 12) p1In.punchPressed = true;
      if (i >= 12 && i < 24) p1In.moveX = 1;

      const p2In = createEmptyInput();
      if (i > 15 && i < 22) p2In.kickPressed = true;

      const hp1 = match.p1.hp;
      const hp2 = match.p2.hp;
      const cues = stepMatch(match, p1In, p2In, 0.016);
      recordReplayFrame(recorder, p1In, p2In, 0.016, cues, hp1, hp2, match);
    }

    assert.equal(recorder.frames.length, 45);

    const { playback, matchState: replayMatch } = createReplayPlayback(recorder);
    for (let tick = 0; tick < 80 && !playback.finished; tick++) {
      stepReplayPlayback(playback, replayMatch, 0.016);
    }

    assert.equal(playback.finished, true);
    assert.equal(getReplayProgress(playback), 1);
    assert.equal(replayMatch.p1.x, match.p1.x);
    assert.equal(replayMatch.p2.x, match.p2.x);
    assert.equal(replayMatch.p1.hp, match.p1.hp);
    assert.equal(replayMatch.p2.hp, match.p2.hp);
    assert.equal(replayMatch.timeScale, 1);
  });

  it('triggers automatic slow-motion via matchState.timeScale on a non-knockdown big hit and recovers to 1.0', () => {
    // Training mode starts at -175 vs 175. Adnan's sp_neutral (Kibasan Debu) deals 13 dmg (>= 11) with no knockdown.
    const match = createMatchState('adnan', 'tika', 'living_room', 'training', 'normal');
    const recorder = createReplayRecorder(match);

    let fired = false;
    let minP2Hp = match.p2.hp;
    for (let i = 0; i < 240; i++) {
      const p1In = createEmptyInput();
      if (!fired && match.p2.x - match.p1.x > 110) {
        p1In.moveX = 1;
      } else if (!fired) {
        p1In.spPressed = true; // Kibasan Debu projectile (13 dmg, non-knockdown heavy hit)
        fired = true;
      }
      const p2In = createEmptyInput();
      const hp1 = match.p1.hp;
      const hp2 = match.p2.hp;
      const cues = stepMatch(match, p1In, p2In, 0.016);
      recordReplayFrame(recorder, p1In, p2In, 0.016, cues, hp1, hp2, match);
      if (match.p2.hp < minP2Hp) minP2Hp = match.p2.hp;
    }

    assert.ok(minP2Hp <= match.p2.maxHp - 13, `Expected Kibasan Debu to deal >=13 dmg, minHp=${minP2Hp}/${match.p2.maxHp}`);
    assert.ok(recorder.bigHitCount >= 1, 'Expected recorder to note big hit');

    const { playback, matchState: replayMatch } = createReplayPlayback(recorder);
    let minObservedScale = 1;
    let sawBigHitKind = false;
    let recoveredAfterSlowMo = false;

    for (let tick = 0; tick < 600 && !playback.finished; tick++) {
      stepReplayPlayback(playback, replayMatch, 0.016);
      if (playback.autoSlowMoKind === 'big_hit') {
        sawBigHitKind = true;
      }
      if (replayMatch.timeScale < minObservedScale) {
        minObservedScale = replayMatch.timeScale;
      }
      if (sawBigHitKind && playback.autoSlowMoKind === 'none' && replayMatch.timeScale > 0.98) {
        recoveredAfterSlowMo = true;
      }
    }

    assert.equal(sawBigHitKind, true, 'Expected big_hit auto slow-mo to trigger');
    assert.ok(
      minObservedScale <= BIG_HIT_SLOWMO_SCALE + 0.02,
      `Expected matchState.timeScale to drop near ${BIG_HIT_SLOWMO_SCALE}, got ${minObservedScale}`
    );
    assert.equal(recoveredAfterSlowMo, true, 'Expected timeScale to recover back to 1.0');
    assert.equal(replayMatch.p2.hp, match.p2.hp, 'Replay must stay deterministic after slow-mo');
  });

  it('triggers deeper automatic slow-motion via matchState.timeScale on KO without double-slowing', () => {
    const cleanMatch = createMatchState('adnan', 'iyen', 'dojo', 'cpu', 'easy');
    const cleanRec = createReplayRecorder(cleanMatch);
    let koFrameSeen = false;
    let postKoFrames = 0;

    for (let i = 0; i < 4500; i++) {
      const p1In = createEmptyInput();
      const p2In = createEmptyInput();
      if (cleanMatch.roundPhase === 'fight' && cleanMatch.p2.hp > 0) {
        const dist = cleanMatch.p2.x - cleanMatch.p1.x;
        if (Math.abs(dist) > 70) {
          p1In.moveX = dist > 0 ? 1 : -1;
        } else if (cleanMatch.p1.state !== 'attack') {
          if (cleanMatch.p1.superMeter >= 100) {
            p1In.superPressed = true;
          } else {
            p1In.moveY = -1;
            p1In.spPressed = true; // Belly Bump (16 dmg, knockdown)
          }
        }
      }
      const hp1 = cleanMatch.p1.hp;
      const hp2 = cleanMatch.p2.hp;
      const cues = stepMatch(cleanMatch, p1In, p2In, 0.016);
      recordReplayFrame(cleanRec, p1In, p2In, 0.016, cues, hp1, hp2, cleanMatch);

      if (cleanMatch.roundPhase === 'ko' || cleanMatch.p2.state === 'ko') {
        koFrameSeen = true;
      }
      if (koFrameSeen) {
        postKoFrames += 1;
        if (postKoFrames >= 120) break;
      }
    }

    assert.equal(koFrameSeen, true, 'Expected clean recorded match to reach KO');

    const { playback, matchState: replayMatch } = createReplayPlayback(cleanRec);
    let sawKoSlowMo = false;
    let minKoScale = 1;

    for (let tick = 0; tick < 8000 && !playback.finished; tick++) {
      stepReplayPlayback(playback, replayMatch, 0.016);
      if (playback.autoSlowMoKind === 'ko') {
        sawKoSlowMo = true;
        if (replayMatch.timeScale < minKoScale) {
          minKoScale = replayMatch.timeScale;
        }
      }
    }

    assert.equal(sawKoSlowMo, true, 'Expected KO slow-motion to trigger during replay');
    assert.ok(
      minKoScale <= KO_SLOWMO_SCALE + 0.02,
      `Expected KO timeScale <= ${KO_SLOWMO_SCALE + 0.02}, got ${minKoScale}`
    );
    assert.equal(playback.finished, true, 'Expected replay to finish cleanly without stalling');
    assert.equal(replayMatch.p2.hp, cleanMatch.p2.hp);
    assert.equal(replayMatch.p1.roundsWon, cleanMatch.p1.roundsWon);
  });

  it('supports pause, speed cycling, and restarting replay playback', () => {
    const match = createMatchState('adnan', 'tika', 'living_room', 'training', 'normal');
    const recorder = createReplayRecorder(match);
    for (let i = 0; i < 40; i++) {
      const p1In = createEmptyInput();
      p1In.moveX = 1;
      const p2In = createEmptyInput();
      stepMatch(match, p1In, p2In, 0.016);
      recordReplayFrame(recorder, p1In, p2In, 0.016);
    }

    const { playback, matchState: replayMatch } = createReplayPlayback(recorder);
    assert.equal(cycleReplaySpeed(playback), 2);
    assert.equal(cycleReplaySpeed(playback), 0.5);
    assert.equal(cycleReplaySpeed(playback), 1);

    assert.equal(toggleReplayPause(playback), true);
    stepReplayPlayback(playback, replayMatch, 0.016);
    assert.equal(playback.frameIndex, 0, 'Paused replay must not advance frames');

    assert.equal(toggleReplayPause(playback), false);
    stepReplayPlayback(playback, replayMatch, 0.032);
    assert.ok(playback.frameIndex >= 1);

    const restartedMatch = restartReplayPlayback(playback);
    assert.equal(playback.frameIndex, 0);
    assert.equal(playback.paused, false);
    assert.equal(restartedMatch.timeScale, 1);
    assert.equal(restartedMatch.p1.x, -175);
  });
});
