import { clamp } from './math3d';
import { FighterRuntime } from './types';

export interface PoseAngles {
  torsoLean: number;
  torsoTwist: number;
  hipDrop: number;
  hipSway: number;
  headNod: number;
  armFrontUpper: number;
  armFrontFore: number;
  armBackUpper: number;
  armBackFore: number;
  legFrontUpper: number;
  legFrontLower: number;
  legBackUpper: number;
  legBackLower: number;
  footFront: number;
  footBack: number;
  bodyTilt: number;
  bodyLift: number;
  bodyYaw: number;
  weaponReach: number;
  weaponAngle: number;
}

function easeOutCubic(x: number): number {
  const t = clamp(x, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(x: number): number {
  const t = clamp(x, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function computeFighterPose(f: FighterRuntime): PoseAngles {
  const t = f.animTime;
  const pose: PoseAngles = {
    torsoLean: 0.07,
    torsoTwist: 0.14,
    hipDrop: 0,
    hipSway: 0,
    headNod: 0,
    armFrontUpper: 0.62,
    armFrontFore: 1.15,
    armBackUpper: -0.22,
    armBackFore: 1.28,
    legFrontUpper: 0.24,
    legFrontLower: -0.24,
    legBackUpper: -0.28,
    legBackLower: -0.16,
    footFront: 0,
    footBack: 0,
    bodyTilt: 0,
    bodyLift: 0,
    bodyYaw: 0,
    weaponReach: 0,
    weaponAngle: 0,
  };

  if (f.state === 'idle') {
    const breath = Math.sin(t * 3.8);
    const bounce = Math.sin(t * 7.6);
    pose.hipDrop = 2.5 + breath * 2.8 + bounce * 0.6;
    pose.hipSway = Math.sin(t * 1.9) * 0.04;
    pose.torsoLean = 0.07 + breath * 0.028;
    pose.torsoTwist = 0.14 + Math.sin(t * 2.1) * 0.05;
    pose.headNod = -breath * 0.045;
    pose.armFrontUpper = 0.62 + breath * 0.065;
    pose.armFrontFore = 1.16 - breath * 0.05;
    pose.armBackUpper = -0.18 - breath * 0.055;
    pose.armBackFore = 1.28 + breath * 0.04;
    pose.legFrontUpper = 0.25 + breath * 0.025;
    pose.legFrontLower = -0.27 - breath * 0.04;
    pose.legBackUpper = -0.27 - breath * 0.02;
    pose.legBackLower = -0.18 - breath * 0.03;

    if (f.charId === 'adnan') {
      // Lazy slouch; even sleepier in Mode Mager
      pose.torsoLean = f.magerArmorHits > 0 ? 0.24 + breath * 0.03 : 0.15 + breath * 0.03;
      pose.headNod = f.magerArmorHits > 0 ? -0.2 + Math.sin(t * 2.2) * 0.06 : -0.06;
      pose.armFrontUpper = 0.34 + breath * 0.04;
      pose.armFrontFore = 0.85;
    } else if (f.charId === 'tika') {
      // Crisp, intimidating upright stance
      pose.torsoLean = 0.02 + breath * 0.02;
      pose.armFrontUpper = 0.78 + breath * 0.05;
      pose.armBackUpper = -0.42;
      pose.armBackFore = 1.55;
    } else if (f.charId === 'dhira') {
      // Hugging book at chest level with cheerful bounce (keeps face clear)
      pose.hipDrop = 2 + Math.abs(Math.sin(t * 4.5)) * 3.5;
      pose.armFrontUpper = 0.52 + breath * 0.05;
      pose.armFrontFore = 1.24;
      pose.armBackUpper = 0.34;
      pose.armBackFore = 1.32;
    } else if (f.charId === 'iyen') {
      // Toddler cute side-to-side sway
      pose.hipSway = Math.sin(t * 4.2) * 0.12;
      pose.headNod = Math.sin(t * 3.1) * 0.08;
    }
  } else if (f.state === 'walk_fwd' || f.state === 'walk_back') {
    const dir = f.state === 'walk_fwd' ? 1 : -1;
    const s = Math.sin(f.walkPhase);
    const c = Math.cos(f.walkPhase);
    pose.hipDrop = 3 + Math.abs(s) * 4.5;
    pose.hipSway = c * 0.065;
    pose.torsoLean = dir > 0 ? 0.15 + Math.abs(c) * 0.04 : -0.04;
    pose.torsoTwist = 0.14 - s * 0.24 * dir;
    pose.headNod = -0.04 + Math.abs(s) * 0.035;

    pose.legFrontUpper = s * 0.58 * dir;
    const frontSwing = Math.max(0, c * dir);
    pose.legFrontLower = -0.16 - frontSwing * 0.68 - Math.max(0, -s * dir) * 0.22;
    pose.footFront = s * dir > 0 ? 0.22 * s * dir : -0.28 * (-s * dir);

    pose.legBackUpper = -s * 0.58 * dir;
    const backSwing = Math.max(0, -c * dir);
    pose.legBackLower = -0.16 - backSwing * 0.68 - Math.max(0, s * dir) * 0.22;
    pose.footBack = -s * dir > 0 ? 0.22 * (-s * dir) : -0.28 * (s * dir);

    pose.armFrontUpper = 0.45 - s * 0.42 * dir;
    pose.armFrontFore = 0.92 + Math.max(0, -s * dir) * 0.34;
    pose.armBackUpper = -0.05 + s * 0.42 * dir;
    pose.armBackFore = 0.98 + Math.max(0, s * dir) * 0.34;

    if (f.charId === 'adnan') {
      // Lazy sandal-dragging shuffle
      pose.torsoLean = 0.22;
      pose.legFrontUpper = s * 0.38 * dir;
      pose.legFrontLower = -0.18 - frontSwing * 0.32;
      pose.legBackUpper = -s * 0.38 * dir;
      pose.legBackLower = -0.18 - backSwing * 0.32;
    } else if (f.charId === 'dhira') {
      // Cheerful book-hug stroll
      pose.armFrontUpper = 0.85;
      pose.armFrontFore = 1.62;
      pose.hipSway = c * 0.11;
    } else if (f.charId === 'iyen') {
      // Toddler waddle
      pose.hipSway = c * 0.16;
      pose.armFrontUpper = 0.9 + s * 0.3;
      pose.armBackUpper = -0.8 - s * 0.3;
    }
  } else if (f.state === 'dash') {
    const s = Math.sin(f.walkPhase * 1.4);
    if (f.charId === 'adnan') {
      // Stumble forward then slide
      pose.torsoLean = 0.48;
      pose.hipDrop = 14;
      pose.armFrontUpper = 1.15;
      pose.armBackUpper = -0.85;
      pose.legFrontUpper = 0.62;
      pose.legFrontLower = -0.78;
      pose.legBackUpper = -0.68;
    } else if (f.charId === 'iyen') {
      // Fast toddler crawl / low scurry!
      pose.hipDrop = 34;
      pose.torsoLean = 0.95;
      pose.headNod = 0.42;
      pose.armFrontUpper = 1.2 + s * 0.45;
      pose.armFrontFore = 0.4;
      pose.armBackUpper = 1.1 - s * 0.45;
      pose.legFrontUpper = 0.85 - s * 0.45;
      pose.legFrontLower = -1.35;
      pose.legBackUpper = 0.75 + s * 0.45;
      pose.legBackLower = -1.35;
    } else if (f.charId === 'dhira') {
      // Tip-toe sprint
      pose.torsoLean = 0.28;
      pose.bodyLift = 4 + Math.abs(s) * 5;
      pose.footFront = -0.4;
      pose.footBack = -0.4;
      pose.legFrontUpper = s * 0.65;
      pose.legBackUpper = -s * 0.65;
    } else {
      // Tika stomping blitz dash
      pose.torsoLean = 0.38;
      pose.hipDrop = 10;
      pose.legFrontUpper = s * 0.72;
      pose.legFrontLower = -0.65;
      pose.legBackUpper = -s * 0.72;
      pose.armFrontUpper = 0.8 - s * 0.5;
      pose.armBackUpper = -0.5 + s * 0.5;
    }
  } else if (f.state === 'backstep') {
    const arc = Math.sin(clamp(f.dashTimer / 0.26, 0, 1) * Math.PI);
    pose.bodyLift = arc * 20;
    if (f.charId === 'adnan') {
      // Yawning step back
      pose.torsoLean = -0.22;
      pose.headNod = 0.16;
      pose.armFrontUpper = 1.65;
      pose.armFrontFore = 1.35;
      pose.legBackUpper = -0.48;
    } else if (f.charId === 'tika') {
      // Agile hop back with hands on hips
      pose.torsoLean = -0.14;
      pose.armFrontUpper = -0.35;
      pose.armFrontFore = 1.65;
      pose.armBackUpper = -0.45;
      pose.armBackFore = 1.65;
    } else if (f.charId === 'dhira') {
      // Flirty backstep pose
      pose.torsoLean = -0.18;
      pose.hipSway = 0.18;
      pose.armFrontUpper = 1.85;
      pose.armFrontFore = 0.95;
      pose.legFrontUpper = 0.55;
      pose.legFrontLower = -0.9;
    } else {
      // Toddler comical sit-back bounce
      pose.bodyTilt = -0.48 * arc;
      pose.hipDrop = 24;
      pose.legFrontUpper = 1.1;
      pose.legBackUpper = 0.8;
    }
  } else if (f.state === 'crouch') {
    const subtle = Math.sin(t * 4.0) * 1.5;
    pose.hipDrop = 40 + subtle;
    pose.torsoLean = 0.26;
    pose.headNod = -0.1;
    pose.legFrontUpper = 0.96;
    pose.legFrontLower = -1.56;
    pose.legBackUpper = 0.54;
    pose.legBackLower = -1.36;
    pose.footFront = 0.24;
    pose.footBack = 0.32;
    pose.armFrontUpper = 0.72;
    pose.armFrontFore = 1.28;

    if (f.charId === 'adnan') {
      // Squatting lazily leaning on broom handle
      pose.torsoLean = 0.32;
      pose.armFrontUpper = 1.05;
      pose.armFrontFore = 0.42;
      pose.weaponReach = 0.6;
      pose.weaponAngle = -1.1;
    } else if (f.charId === 'dhira') {
      // Ultra-low compact duck
      pose.hipDrop = 46 + subtle;
      pose.torsoLean = 0.45;
      pose.headNod = -0.22;
    } else if (f.charId === 'iyen') {
      // Cross-legged sitting on floor playing marbles
      pose.hipDrop = 44 + subtle;
      pose.torsoLean = 0.14;
      pose.legFrontUpper = 1.25;
      pose.legFrontLower = -1.85;
      pose.legBackUpper = 1.15;
      pose.legBackLower = -1.85;
    }
  } else if (f.state === 'jump') {
    const vyNorm = clamp(f.vy / 520, -1, 1);
    if (vyNorm > 0.25) {
      pose.hipDrop = 8;
      pose.torsoLean = 0.14;
      pose.headNod = 0.08;
      pose.legFrontUpper = 0.92;
      pose.legFrontLower = -1.34;
      pose.legBackUpper = -0.18;
      pose.legBackLower = -0.78;
      pose.footFront = -0.25;
      pose.footBack = -0.35;
      pose.armFrontUpper = 1.45;
      pose.armFrontFore = 0.65;
      pose.armBackUpper = -0.45;
      pose.armBackFore = 0.95;
    } else if (vyNorm < -0.25) {
      pose.hipDrop = 4;
      pose.torsoLean = 0.18;
      pose.headNod = -0.1;
      pose.legFrontUpper = 0.52;
      pose.legFrontLower = -0.58;
      pose.legBackUpper = -0.26;
      pose.legBackLower = -0.46;
      pose.footFront = -0.18;
      pose.footBack = -0.22;
      pose.armFrontUpper = 0.92;
      pose.armFrontFore = 0.85;
      pose.armBackUpper = -0.78;
      pose.armBackFore = 0.72;
    } else {
      pose.hipDrop = 10;
      pose.torsoLean = 0.08;
      pose.legFrontUpper = 0.74;
      pose.legFrontLower = -1.06;
      pose.legBackUpper = 0.08;
      pose.legBackLower = -0.82;
      pose.footFront = -0.2;
      pose.footBack = -0.25;
      pose.armFrontUpper = 1.18;
      pose.armFrontFore = 0.95;
      pose.armBackUpper = -0.58;
    }
  } else if (f.state === 'block') {
    pose.hipDrop = 11;
    pose.torsoLean = -0.14;
    pose.headNod = -0.12;
    pose.legFrontUpper = 0.34;
    pose.legFrontLower = -0.42;
    pose.legBackUpper = -0.36;
    pose.legBackLower = -0.28;
    pose.armFrontUpper = 1.18;
    pose.armFrontFore = 1.68;
    pose.armBackUpper = 0.92;
    pose.armBackFore = 1.72;

    if (f.charId === 'adnan') {
      pose.weaponReach = 0.5;
      pose.weaponAngle = -0.7;
    } else if (f.charId === 'dhira') {
      // Covering face with open textbook
      pose.armFrontUpper = 1.55;
      pose.armFrontFore = 1.65;
    } else if (f.charId === 'iyen') {
      // Crouching & covering eyes with both hands
      pose.hipDrop = 34;
      pose.torsoLean = 0.25;
      pose.armFrontUpper = 1.68;
      pose.armFrontFore = 1.88;
      pose.armBackUpper = 1.55;
      pose.armBackFore = 1.88;
    }
  } else if (f.state === 'counter_stance') {
    // Kak Dhira Pose Centil counter stance
    pose.hipDrop = 12;
    pose.hipSway = 0.22;
    pose.torsoLean = -0.12;
    pose.torsoTwist = -0.38;
    pose.headNod = 0.1;
    pose.armFrontUpper = 1.85;
    pose.armFrontFore = 0.85;
    pose.armBackUpper = -0.55;
    pose.armBackFore = 1.45;
    pose.legFrontUpper = 0.45;
    pose.legFrontLower = -0.65;
  } else if (f.state === 'burnout') {
    const pant = Math.sin(t * 11);
    pose.hipDrop = 16 + pant * 2.5;
    pose.torsoLean = 0.32 + pant * 0.04;
    pose.headNod = -0.28 + pant * 0.06;
    pose.armFrontUpper = f.charId === 'adnan' ? -0.35 : -0.4;
    pose.armFrontFore = 1.75;
    pose.armBackUpper = -0.5;
    pose.armBackFore = 1.75;
  } else if (f.state === 'tantrum') {
    // Dik Iyen sitting on ground crying loudly & waving arms
    const wail = Math.sin(t * 22);
    pose.hipDrop = 44;
    pose.torsoLean = -0.22 + wail * 0.14;
    pose.headNod = 0.36;
    pose.armFrontUpper = 2.0 + wail * 0.55;
    pose.armFrontFore = 0.4;
    pose.armBackUpper = -1.9 - wail * 0.55;
    pose.armBackFore = -0.4;
    pose.legFrontUpper = 1.35 + wail * 0.2;
    pose.legFrontLower = -0.2;
    pose.legBackUpper = 1.2 - wail * 0.2;
    pose.legBackLower = -0.2;
  } else if (f.state === 'hitstun') {
    if (f.coughTimer > 0) {
      const cough = Math.sin(t * 24);
      pose.torsoLean = 0.28 + cough * 0.12;
      pose.headNod = -0.32 + cough * 0.16;
      pose.armFrontUpper = 1.35;
      pose.armFrontFore = 1.55;
    } else {
      const recoil = Math.min(1, f.animTime * 9);
      pose.torsoLean = -0.38 * recoil;
      pose.headNod = -0.28 * recoil;
      pose.hipDrop = 6;
      pose.armFrontUpper = -0.45;
      pose.armFrontFore = 0.45;
      pose.armBackUpper = -0.75;
      pose.legFrontUpper = 0.36;
      pose.legFrontLower = -0.32;
    }
  } else if (f.state === 'knockdown' || f.state === 'ko') {
    pose.bodyTilt = -1.46;
    pose.hipDrop = 16;
    pose.headNod = -0.2;
    pose.armFrontUpper = -0.52;
    pose.armFrontFore = 0.35;
    pose.armBackUpper = 0.88;
    pose.legFrontUpper = 0.26;
    pose.legFrontLower = -0.22;
    pose.legBackUpper = -0.22;
    pose.legBackLower = -0.18;
  } else if (f.state === 'wakeup') {
    const upProg = clamp(1 - f.stateTimer / (f.charId === 'adnan' ? 0.44 : 0.36), 0, 1);
    const e = easeInOutQuad(upProg);
    if (f.backRiseActive && f.charId === 'dhira') {
      // Dhira quick back-roll adjusting hair
      pose.bodyTilt = -Math.PI * 2 * (1 - e);
      pose.bodyLift = Math.sin(e * Math.PI) * 26;
      pose.hipDrop = 24 * (1 - e) + 4;
      pose.armFrontUpper = 2.05;
      pose.armFrontFore = 1.55;
    } else {
      pose.bodyTilt = -0.65 * (1 - e);
      pose.hipDrop = 34 * (1 - e) + 6;
      pose.torsoLean = 0.35 * (1 - e) + 0.08 * e;
      pose.legFrontUpper = 0.78 * (1 - e) + 0.25 * e;
      pose.legFrontLower = -1.25 * (1 - e) - 0.25 * e;
      pose.armFrontUpper = 0.4 + (1 - e) * 0.4;
      pose.armBackUpper = -0.35;
    }
  } else if (f.state === 'victory') {
    if (f.charId === 'adnan') {
      const groove = Math.sin(t * 7.4);
      const stepAlt = Math.sin(t * 3.7);
      pose.hipDrop = 10 + Math.abs(groove) * 12;
      pose.hipSway = groove * 0.42;
      pose.torsoLean = Math.sin(t * 3.7) * 0.24;
      pose.torsoTwist = Math.sin(t * 5.2) * 0.56;
      pose.headNod = groove * 0.22;
      pose.armFrontUpper = 1.5 + groove * 1.05;
      pose.armFrontFore = 0.85 + Math.cos(t * 14.8) * 0.62;
      pose.armBackUpper = -1.1 + Math.cos(t * 7.4) * 1.05;
      pose.armBackFore = 1.1 + Math.sin(t * 14.8) * 0.62;
      pose.legFrontUpper = 0.28 + Math.max(0, stepAlt) * 0.68;
      pose.legFrontLower = -0.34 - Math.max(0, stepAlt) * 0.72;
      pose.legBackUpper = -0.26 + Math.max(0, -stepAlt) * 0.68;
      pose.legBackLower = -0.24 - Math.max(0, -stepAlt) * 0.72;
      pose.footFront = Math.sin(t * 7.4) * 0.24;
      pose.footBack = -Math.sin(t * 7.4) * 0.24;
      pose.weaponReach = 1;
      pose.weaponAngle = Math.sin(t * 9.5) * 0.65;
    } else if (f.charId === 'tika') {
      const breath = Math.sin(t * 2.8);
      pose.bodyYaw = t * 4.6;
      pose.bodyLift = 4 + Math.abs(Math.sin(t * 2.3)) * 5;
      pose.hipDrop = 2;
      pose.torsoLean = -0.05;
      pose.torsoTwist = 0.08 * breath;
      pose.headNod = 0.06 + breath * 0.05;
      pose.armFrontUpper = 2.24 + breath * 0.16;
      pose.armFrontFore = 0.68;
      pose.armBackUpper = -2.24 - breath * 0.16;
      pose.armBackFore = -0.68;
      pose.legFrontUpper = 0.84;
      pose.legFrontLower = -1.48;
      pose.footFront = -0.46;
      pose.legBackUpper = -0.06;
      pose.legBackLower = -0.08;
      pose.footBack = -0.42;
    } else if (f.charId === 'dhira') {
      const cycleRate = 0.92;
      const totalCycles = Math.floor(t * cycleRate);
      const cyc = (t * cycleRate) % 1;
      if (cyc < 0.15) {
        const prep = cyc / 0.15;
        pose.hipDrop = 34 * prep;
        pose.torsoLean = 0.36 * prep;
        pose.bodyTilt = totalCycles * Math.PI * 2;
        pose.bodyLift = 0;
        pose.legFrontUpper = 0.85 * prep;
        pose.legFrontLower = -1.45 * prep;
        pose.legBackUpper = 0.65 * prep;
        pose.legBackLower = -1.35 * prep;
        pose.armFrontUpper = 0.85;
        pose.armBackUpper = -0.55;
      } else if (cyc < 0.82) {
        const flipProg = (cyc - 0.15) / 0.67;
        const flipEase = easeInOutQuad(flipProg);
        const airArc = Math.sin(flipProg * Math.PI);
        pose.bodyTilt = (totalCycles + flipEase) * Math.PI * 2;
        pose.bodyLift = airArc * 68;
        pose.hipDrop = 18;
        pose.torsoLean = 0.32;
        pose.armFrontUpper = 1.15;
        pose.armFrontFore = 1.48;
        pose.armBackUpper = 0.95;
        pose.armBackFore = 1.48;
        pose.legFrontUpper = 1.45;
        pose.legFrontLower = -2.05;
        pose.legBackUpper = 1.28;
        pose.legBackLower = -1.98;
      } else {
        const landProg = (cyc - 0.82) / 0.18;
        const rebound = Math.sin(landProg * Math.PI);
        pose.bodyTilt = (totalCycles + 1) * Math.PI * 2;
        pose.bodyLift = 0;
        pose.hipDrop = 16 * rebound + 4;
        pose.torsoLean = -0.06;
        pose.armFrontUpper = 2.45;
        pose.armFrontFore = 0.2;
        pose.armBackUpper = -2.25;
        pose.armBackFore = -0.2;
      }
    } else {
      const hopCycle = (t * 2.15) % 1;
      if (hopCycle < 0.2) {
        const sq = hopCycle / 0.2;
        pose.bodyLift = 0;
        pose.hipDrop = 16 * Math.sin(sq * Math.PI * 0.5);
        pose.torsoLean = 0.16;
        pose.legFrontUpper = 0.68;
        pose.legFrontLower = -1.15;
        pose.legBackUpper = 0.38;
        pose.legBackLower = -0.95;
        pose.armFrontUpper = 0.4;
        pose.armBackUpper = -0.4;
      } else if (hopCycle < 0.84) {
        const airProg = (hopCycle - 0.2) / 0.64;
        const arc = Math.sin(airProg * Math.PI);
        pose.bodyLift = arc * 64;
        pose.hipDrop = 4;
        pose.torsoLean = -0.06;
        pose.bodyTilt = Math.sin(t * 4.5) * 0.08;
        pose.headNod = Math.sin(t * 12) * 0.14;
        pose.armFrontUpper = 2.38 + Math.sin(t * 14) * 0.34;
        pose.armFrontFore = 0.35;
        pose.armBackUpper = -2.28 - Math.sin(t * 14) * 0.34;
        pose.armBackFore = -0.35;
        pose.legFrontUpper = 0.85 * arc + 0.2;
        pose.legFrontLower = -1.25 * arc - 0.2;
        pose.legBackUpper = -0.22 + 0.45 * arc;
        pose.legBackLower = -0.82 * arc - 0.2;
      } else {
        const land = (hopCycle - 0.84) / 0.16;
        pose.bodyLift = 0;
        pose.hipDrop = 14 * (1 - land);
        pose.armFrontUpper = 1.9;
        pose.armBackUpper = -1.9;
      }
    }
  } else if (f.state === 'attack' && f.currentMove) {
    const m = f.currentMove;
    const total = m.startup + m.active + m.recovery;
    const p = Math.min(1, f.moveTimer / Math.max(0.01, total));
    const activeMid = f.moveTimer >= m.startup && f.moveTimer <= m.startup + m.active;
    const windup = f.moveTimer < m.startup ? clamp(f.moveTimer / Math.max(0.01, m.startup), 0, 1) : 1;
    const ext = activeMid
      ? 1
      : f.moveTimer < m.startup
        ? easeOutCubic(windup) * 0.28
        : 1 - easeInOutQuad((f.moveTimer - m.startup - m.active) / Math.max(0.01, m.recovery));

    pose.hipDrop = 5 * ext;
    pose.legFrontUpper = 0.34 * ext + 0.24 * (1 - ext);
    pose.legFrontLower = -0.36 * ext - 0.22 * (1 - ext);

    if (m.id === 'throw') {
      pose.torsoLean = 0.34 * ext;
      pose.armFrontUpper = 1.58 * ext;
      pose.armFrontFore = 0.25;
      pose.armBackUpper = 1.28 * ext;
      pose.armBackFore = 0.3;
      pose.weaponReach = ext;
    } else if (m.id === 'p1' || m.id === 'p2' || m.id === 'p3' || m.id === 'crouch_p' || m.id === 'air_p') {
      if (m.id === 'crouch_p') {
        pose.hipDrop = 40;
        pose.legFrontUpper = 0.95;
        pose.legFrontLower = -1.55;
      }
      pose.torsoTwist = m.id === 'p2' ? -0.65 * ext : 0.65 * ext;
      pose.torsoLean = 0.24 * ext;
      pose.headNod = f.charId === 'adnan' && m.id === 'p1' ? -0.32 : -0.08 * ext;
      pose.armFrontUpper = (m.isOverhead ? 2.15 : 1.48) * ext + 0.32 * (1 - ext);
      pose.armFrontFore = 0.08 + (1 - ext) * 1.1;
      pose.armBackUpper = -0.38 * ext;
      pose.weaponReach = ext;
      pose.weaponAngle = m.isOverhead ? -0.65 + ext * 1.35 : 0;
    } else if (m.id === 'p4') {
      pose.torsoLean = m.height === 'low' ? 0.42 * ext : -0.1 * ext;
      pose.torsoTwist = 0.7 * ext;
      pose.headNod = 0.14 * ext;
      pose.armFrontUpper = m.height === 'low' ? 0.95 * ext : 2.55 * ext;
      pose.armFrontFore = 0.15;
      pose.weaponReach = ext;
    } else if (m.id.startsWith('k') || m.id === 'crouch_k' || m.id === 'air_k') {
      if (m.id === 'crouch_k') {
        pose.hipDrop = 46;
        pose.torsoLean = -0.35;
        pose.legFrontUpper = 1.45 * ext;
        pose.legFrontLower = 0.05;
        pose.footFront = -0.28 * ext;
      } else if (m.id === 'k3') {
        pose.torsoTwist = Math.PI * 2 * easeInOutQuad(p);
        pose.legFrontUpper = 1.75 * ext;
        pose.legFrontLower = 0.05;
        pose.footFront = -0.25 * ext;
      } else if (m.id === 'k4') {
        pose.hipDrop = 38;
        pose.torsoLean = -0.4;
        pose.legFrontUpper = 1.55 * ext;
        pose.legFrontLower = 0.05;
        pose.footFront = -0.3 * ext;
      } else {
        pose.torsoLean = -0.22 * ext;
        pose.legFrontUpper = 1.5 * ext;
        pose.legFrontLower = 0.05 + (1 - ext) * 0.9;
        pose.footFront = -0.24 * ext;
        pose.armFrontUpper = 0.42;
        pose.armBackUpper = -0.48 * ext;
      }
      pose.weaponReach = ext;
    } else if (
      m.id.startsWith('sp') ||
      m.id === 'super' ||
      m.id === 'parry_counter' ||
      m.id === 'counter_slash'
    ) {
      if (f.charId === 'iyen' && m.id === 'sp_down') {
        // Berguling Lucu (Tantrum Roll)
        pose.hipDrop = 34;
        pose.bodyTilt = p * Math.PI * 4;
        pose.legFrontUpper = 1.3;
        pose.legFrontLower = -1.9;
        pose.armFrontUpper = 1.1;
      } else if (
        (f.charId === 'adnan' && m.id === 'sp_back') ||
        (f.charId === 'dhira' && m.id === 'sp_down')
      ) {
        // Putaran Pemalas / Putaran Balet Buku
        pose.bodyYaw = p * Math.PI * 2;
        pose.armFrontUpper = 1.52;
        pose.armFrontFore = 0.1;
        pose.armBackUpper = -1.52;
        pose.armBackFore = -0.1;
        pose.weaponReach = 1;
      } else {
        pose.torsoLean = 0.32 * ext;
        pose.torsoTwist = m.id === 'super' ? Math.sin(t * 24) * 0.72 : 0.52 * ext;
        pose.armFrontUpper = m.id === 'sp_up_fwd' ? 2.35 * ext : 1.52 * ext;
        pose.armFrontFore = 0.12;
        pose.weaponReach = ext;
        pose.weaponAngle = m.id === 'sp_up_fwd' ? -0.9 + ext * 1.6 : m.id === 'sp_down' ? 0.45 : 0;
        if (m.id === 'sp_down' && m.weapon === 'belly') {
          pose.torsoLean = 0.46 * ext;
          pose.armFrontUpper = -0.45;
          pose.armBackUpper = -0.55;
        }
      }
    }
  }
  return pose;
}
