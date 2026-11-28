import * as THREE from 'three';
import { CatNpcState, computeCatPose } from './catNpc';
import {
  attachDoodleVertexShader,
  createCapsuleLineGeo,
  createCappedTubeGroup,
  createOutlinedMesh,
  DOODLE_INK_HEX,
  DOODLE_PAPER_HEX,
  DoodleShaderUniforms,
} from './threeCharacters';

export interface DoodleCatRig {
  root: THREE.Group;
  shadowMesh: THREE.Mesh;
  bodyPivot: THREE.Group;
  torsoPivot: THREE.Group;
  headPivot: THREE.Group;
  earL: THREE.Group;
  earR: THREE.Group;
  eyesOpenGroup: THREE.Group;
  eyesHappyGroup: THREE.Group;
  eyesSleepGroup: THREE.Group;
  tongueMesh: THREE.Mesh;
  legFL: THREE.Group;
  legFR: THREE.Group;
  legBL: THREE.Group;
  legBR: THREE.Group;
  tailBase: THREE.Group;
  tailMid: THREE.Group;
  tailTip: THREE.Group;
  sleepZGroup: THREE.Group;
  sleepZItems: THREE.Group[];
  materialsToUpdate: DoodleShaderUniforms[];
  disposables: Array<{ dispose: () => void }>;
}

function createCatBodyGeometry(): THREE.BufferGeometry {
  // Horizontal bean-shaped feline torso along X (back -X, chest +X)
  const geo = new THREE.CapsuleGeometry(9.4, 15.5, 10, 18);
  geo.rotateZ(Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Slightly fuller belly & gently tapered chest
    const belly = y < 0 ? 1.07 : 0.96;
    const widthScale = 0.88;
    pos.setXYZ(i, x, y * belly, z * widthScale);
  }
  geo.computeVertexNormals();
  return geo;
}

function createCatHeadGeometry(): THREE.BufferGeometry {
  // Cute slightly wide feline head with soft cheeks
  const geo = new THREE.SphereGeometry(10.0, 22, 18);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = y / 10.0;
    const cheek = ny < 0 ? 1 + 0.08 * (1 - Math.abs(ny)) : 1 - 0.04 * ny;
    // Slight snout protrusion on +X
    const snout = x > 3 ? (x - 3) * 0.14 : 0;
    pos.setXYZ(i, x * 0.95 + snout, y * 0.9, z * 1.08 * cheek);
  }
  geo.computeVertexNormals();
  return geo;
}

function createCatEarGeometry(): THREE.BufferGeometry {
  // Triangular pointed ear cone with 4-sided rounded pyramid feel
  const geo = new THREE.ConeGeometry(4.3, 9.6, 8);
  geo.translate(0, 4.4, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) * 0.68);
  }
  geo.computeVertexNormals();
  return geo;
}

function createCatLegGroup(
  whiteMat: THREE.Material,
  outlineMat: THREE.Material,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const pivot = new THREE.Group();

  const legGeo = new THREE.CapsuleGeometry(2.65, 6.8, 6, 12);
  legGeo.translate(0, -5.2, 0);
  const legMesh = createOutlinedMesh(legGeo, whiteMat, outlineMat, disposables);

  // Little rounded paw sticking slightly forward along +X
  const pawGeo = new THREE.SphereGeometry(2.9, 12, 10);
  pawGeo.scale(1.22, 0.72, 0.96);
  const pawMesh = createOutlinedMesh(pawGeo, whiteMat, outlineMat, disposables);
  pawMesh.position.set(1.3, -9.8, 0);

  pivot.add(legMesh, pawMesh);
  return pivot;
}

function createTailSegment(
  length: number,
  radius: number,
  whiteMat: THREE.Material,
  outlineMat: THREE.Material,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const grp = new THREE.Group();
  const geo = new THREE.CapsuleGeometry(radius, Math.max(2, length - radius * 2), 6, 12);
  geo.rotateZ(Math.PI / 2);
  geo.translate(-length * 0.5, 0, 0);
  grp.add(createOutlinedMesh(geo, whiteMat, outlineMat, disposables));
  return grp;
}

function createSleepZGlyph(
  inkMat: THREE.Material,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const grp = new THREE.Group();
  const barGeo = createCapsuleLineGeo(5.2, 0.52, 'x');
  const diagGeo = createCapsuleLineGeo(6.4, 0.52, 'x');
  disposables.push(barGeo, diagGeo);

  const top = new THREE.Mesh(barGeo, inkMat);
  top.position.set(0, 2.2, 0);
  const bot = new THREE.Mesh(barGeo, inkMat);
  bot.position.set(0, -2.2, 0);
  const diag = new THREE.Mesh(diagGeo, inkMat);
  diag.rotation.z = 0.78;
  grp.add(top, diag, bot);
  return grp;
}

export function buildDoodleCatRig(): DoodleCatRig {
  const disposables: Array<{ dispose: () => void }> = [];

  const mkUniforms = (amp: number, outWidth: number): DoodleShaderUniforms => ({
    uStepTime: { value: 0 },
    uJitterAmp: { value: amp },
    uOutlineWidth: { value: outWidth },
  });

  const uWhite = mkUniforms(0.045, 0);
  const uInk = mkUniforms(0.025, 0);
  const uOut = mkUniforms(0.045, 2.45);
  const uTongue = mkUniforms(0.025, 0);

  const whiteMat = new THREE.MeshBasicMaterial({ color: DOODLE_PAPER_HEX });
  attachDoodleVertexShader(whiteMat, uWhite, false);

  const inkMat = new THREE.MeshBasicMaterial({ color: DOODLE_INK_HEX });
  attachDoodleVertexShader(inkMat, uInk, false);

  const outlineMat = new THREE.MeshBasicMaterial({
    color: DOODLE_INK_HEX,
    side: THREE.BackSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  attachDoodleVertexShader(outlineMat, uOut, true);

  const tongueMat = new THREE.MeshBasicMaterial({ color: 0xff6b8a });
  attachDoodleVertexShader(tongueMat, uTongue, false);

  const shadowMat = new THREE.MeshBasicMaterial({
    color: DOODLE_INK_HEX,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });

  disposables.push(whiteMat, inkMat, outlineMat, tongueMat, shadowMat);

  const root = new THREE.Group();
  root.name = 'DoodleCatNPC';

  // Soft contact shadow disc on ground / furniture surface
  const shadowGeo = new THREE.CircleGeometry(15.5, 20);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.set(0, 0.55, 0);
  shadowMesh.scale.set(1.22, 1, 0.78);
  root.add(shadowMesh);
  disposables.push(shadowGeo);

  const bodyPivot = new THREE.Group();
  bodyPivot.position.set(0, 16, 0);
  root.add(bodyPivot);

  const torsoPivot = new THREE.Group();
  bodyPivot.add(torsoPivot);

  // Pure white torso with crisp black outline
  const torsoMesh = createOutlinedMesh(
    createCatBodyGeometry(),
    whiteMat,
    outlineMat,
    disposables
  );
  torsoPivot.add(torsoMesh);

  // Head pivot at front chest (+X, +Y)
  const headPivot = new THREE.Group();
  headPivot.position.set(12.2, 8.2, 0);
  torsoPivot.add(headPivot);

  const headMesh = createOutlinedMesh(
    createCatHeadGeometry(),
    whiteMat,
    outlineMat,
    disposables
  );
  headPivot.add(headMesh);

  // Left & Right pointed cat ears with crisp black inner triangle detail
  const buildEar = (sideZ: number): THREE.Group => {
    const earGrp = new THREE.Group();
    earGrp.position.set(0.4, 6.8, sideZ * 6.0);
    earGrp.rotation.x = sideZ * 0.24;
    earGrp.rotation.z = -0.08;
    earGrp.add(createOutlinedMesh(createCatEarGeometry(), whiteMat, outlineMat, disposables));

    // Dark ink inner-ear triangle on the front face (+X)
    const innerGeo = new THREE.ConeGeometry(2.05, 5.1, 4);
    innerGeo.translate(0, 3.6, 0);
    const innerMesh = new THREE.Mesh(innerGeo, inkMat);
    innerMesh.position.set(1.9, 0.2, 0);
    innerMesh.scale.set(0.38, 1, 0.92);
    earGrp.add(innerMesh);
    disposables.push(innerGeo);
    return earGrp;
  };

  const earL = buildEar(-1);
  const earR = buildEar(1);
  headPivot.add(earL, earR);

  // Facial features group (+X front of head)
  const faceGroup = new THREE.Group();
  faceGroup.position.set(9.4, -0.2, 0);
  headPivot.add(faceGroup);

  // Open eyes (cute crisp black ink ovals + tiny nose/mouth)
  const eyesOpenGroup = new THREE.Group();
  const eyeGeo = new THREE.SphereGeometry(1.42, 10, 10);
  eyeGeo.scale(0.65, 1.15, 0.95);
  disposables.push(eyeGeo);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, inkMat);
    eye.position.set(0.3, 1.5, s * 3.7);
    eyesOpenGroup.add(eye);
  }
  faceGroup.add(eyesOpenGroup);

  // Happy squinted eyes (^ ^) for tail licking & face washing
  const eyesHappyGroup = new THREE.Group();
  eyesHappyGroup.visible = false;
  for (const s of [-1, 1]) {
    const arcCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.4, 1.1, s * 2.4),
      new THREE.Vector3(0.75, 2.35, s * 3.7),
      new THREE.Vector3(0.35, 1.1, s * 5.0)
    );
    eyesHappyGroup.add(createCappedTubeGroup(arcCurve, 0.45, inkMat, disposables, 8, 6));
  }
  faceGroup.add(eyesHappyGroup);

  // Sleepy / blinking eyes (- -)
  const eyesSleepGroup = new THREE.Group();
  eyesSleepGroup.visible = false;
  for (const s of [-1, 1]) {
    const sleepCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.45, 1.5, s * 2.4),
      new THREE.Vector3(0.65, 1.15, s * 3.7),
      new THREE.Vector3(0.4, 1.5, s * 5.0)
    );
    eyesSleepGroup.add(createCappedTubeGroup(sleepCurve, 0.44, inkMat, disposables, 8, 6));
  }
  faceGroup.add(eyesSleepGroup);

  // Tiny black triangular cat nose
  const noseGeo = new THREE.ConeGeometry(1.05, 1.25, 3);
  noseGeo.rotateX(Math.PI);
  noseGeo.rotateY(Math.PI / 2);
  const noseMesh = new THREE.Mesh(noseGeo, inkMat);
  noseMesh.position.set(1.15, -0.65, 0);
  noseMesh.scale.set(0.55, 0.85, 1.1);
  faceGroup.add(noseMesh);
  disposables.push(noseGeo);

  // Cute ":3" W-shaped ink cat mouth
  for (const s of [-1, 1]) {
    const mouthArc = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(1.1, -1.35, 0),
      new THREE.Vector3(1.05, -2.55, s * 1.15),
      new THREE.Vector3(0.85, -1.75, s * 2.3)
    );
    faceGroup.add(createCappedTubeGroup(mouthArc, 0.34, inkMat, disposables, 8, 6));
  }

  // Cute coral-pink tongue (only visible when licking tail)
  const tongueGeo = new THREE.CapsuleGeometry(0.72, 1.35, 4, 8);
  tongueGeo.rotateZ(0.45);
  const tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
  tongueMesh.position.set(1.45, -2.75, 0);
  tongueMesh.visible = false;
  faceGroup.add(tongueMesh);
  disposables.push(tongueGeo);

  // Three crisp ink whiskers on each cheek
  const whiskerGeo = createCapsuleLineGeo(6.2, 0.28, 'z');
  disposables.push(whiskerGeo);
  for (const s of [-1, 1]) {
    for (let w = -1; w <= 1; w++) {
      const whisker = new THREE.Mesh(whiskerGeo, inkMat);
      whisker.position.set(-0.2, -0.7 + w * 1.15, s * 8.6);
      whisker.rotation.y = -s * 0.22;
      whisker.rotation.x = s * w * 0.16;
      faceGroup.add(whisker);
    }
  }

  // 4 outlined white cat legs
  const legFL = createCatLegGroup(whiteMat, outlineMat, disposables);
  legFL.position.set(8.2, -4.6, 4.6);

  const legFR = createCatLegGroup(whiteMat, outlineMat, disposables);
  legFR.position.set(8.2, -4.6, -4.6);

  const legBL = createCatLegGroup(whiteMat, outlineMat, disposables);
  legBL.position.set(-8.6, -4.6, 4.6);

  const legBR = createCatLegGroup(whiteMat, outlineMat, disposables);
  legBR.position.set(-8.6, -4.6, -4.6);

  torsoPivot.add(legFL, legFR, legBL, legBR);

  // Articulated 3-segment curved tail anchored at rump (-X)
  const tailBase = createTailSegment(9.5, 2.35, whiteMat, outlineMat, disposables);
  tailBase.position.set(-11.4, 2.4, 0);
  torsoPivot.add(tailBase);

  const tailMid = createTailSegment(9.0, 2.15, whiteMat, outlineMat, disposables);
  tailMid.position.set(-8.6, 0, 0);
  tailBase.add(tailMid);

  const tailTip = createTailSegment(8.2, 1.95, whiteMat, outlineMat, disposables);
  tailTip.position.set(-8.1, 0, 0);
  tailMid.add(tailTip);

  // Floating ink "Z" sleep indicators directly in root space (always upright facing camera)
  const sleepZGroup = new THREE.Group();
  sleepZGroup.visible = false;
  root.add(sleepZGroup);

  const sleepZItems: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) {
    const zGlyph = createSleepZGlyph(inkMat, disposables);
    sleepZGroup.add(zGlyph);
    sleepZItems.push(zGlyph);
  }

  return {
    root,
    shadowMesh,
    bodyPivot,
    torsoPivot,
    headPivot,
    earL,
    earR,
    eyesOpenGroup,
    eyesHappyGroup,
    eyesSleepGroup,
    tongueMesh,
    legFL,
    legFR,
    legBL,
    legBR,
    tailBase,
    tailMid,
    tailTip,
    sleepZGroup,
    sleepZItems,
    materialsToUpdate: [uWhite, uInk, uOut, uTongue],
    disposables,
  };
}

export function updateDoodleCatRig(
  rig: DoodleCatRig,
  state: CatNpcState,
  elapsedTime: number
): void {
  const stepTime = Math.floor(elapsedTime * 8) / 8;
  for (const u of rig.materialsToUpdate) {
    u.uStepTime.value = stepTime;
  }

  const pose = computeCatPose(state);

  // Place cat in game coordinates (scene z = -zGame)
  rig.root.position.set(state.x, state.y, -state.zGame);

  // Adjust contact shadow during jumps so it stays anchored near the surface
  if (state.behavior === 'jump_to_perch' || state.behavior === 'jump_to_floor') {
    const dur = Math.max(0.05, state.behaviorDuration);
    const prog = Math.max(0, Math.min(1, state.behaviorElapsed / dur));
    const baseLinearY = state.jumpStartY + (state.jumpEndY - state.jumpStartY) * prog;
    const lift = Math.max(0, state.y - baseLinearY);
    rig.shadowMesh.position.y = 0.55 - lift;
    const shScale = Math.max(0.55, 1 - lift * 0.008);
    rig.shadowMesh.scale.set(1.22 * shScale, 1, 0.78 * shScale);
  } else {
    rig.shadowMesh.position.y = 0.55;
    const loafWiden = state.behavior === 'loaf_nap' ? 1.12 : 1.0;
    rig.shadowMesh.scale.set(1.22 * loafWiden, 1, 0.78 * loafWiden);
  }

  // Smooth rotation via yaw (never negative scale so BackSide outlines keep correct winding)
  rig.bodyPivot.rotation.set(0, state.yaw, 0);
  rig.bodyPivot.position.y = pose.bodyY;

  rig.torsoPivot.rotation.set(pose.bodyRoll, 0, pose.bodyPitch);
  rig.torsoPivot.scale.set(pose.squashX, pose.squashY, 1);

  // Head articulation
  rig.headPivot.rotation.set(pose.headRoll, pose.headYaw, pose.headPitch);
  rig.earL.rotation.z = -0.08 + pose.earTwitchL;
  rig.earR.rotation.z = -0.08 + pose.earTwitchR;

  // Facial expressions
  rig.eyesHappyGroup.visible = pose.happyEyes;
  rig.eyesSleepGroup.visible = !pose.happyEyes && pose.eyesClosed;
  rig.eyesOpenGroup.visible = !pose.happyEyes && !pose.eyesClosed;
  rig.tongueMesh.visible = pose.tongueOut;

  // Four legs
  rig.legFL.rotation.z = pose.legFL;
  rig.legFR.rotation.z = pose.legFR;
  rig.legBL.rotation.z = pose.legBL;
  rig.legBR.rotation.z = pose.legBR;
  rig.legBL.position.z = 4.6 + pose.legSpreadZ;
  rig.legBR.position.z = -(4.6 + pose.legSpreadZ);

  // Articulated 3-segment tail (negative Z-rotation raises -X tail upward in Three.js right-handed coords)
  rig.tailBase.rotation.set(0, pose.tailBaseYaw, -pose.tailBasePitch);
  rig.tailMid.rotation.set(0, pose.tailMidYaw, -pose.tailMidPitch);
  rig.tailTip.rotation.set(0, pose.tailTipYaw, -pose.tailTipPitch);

  // Floating doodle-ink "Z" indicators while sleeping
  rig.sleepZGroup.visible = pose.sleeping;
  if (pose.sleeping) {
    const headSideX = state.facing >= 0 ? 12 : -12;
    for (let i = 0; i < rig.sleepZItems.length; i++) {
      const zItem = rig.sleepZItems[i];
      const phase = ((elapsedTime * 0.55 + i * 0.5) % 1 + 1) % 1;
      const arc = Math.sin(phase * Math.PI);
      zItem.position.set(
        headSideX + Math.sin(phase * 4.5 + i) * 3.5 + phase * (state.facing >= 0 ? 7 : -7),
        25 + phase * 22,
        6
      );
      zItem.rotation.z = Math.sin(elapsedTime * 2.2 + i) * 0.12;
      const sc = Math.max(0.05, arc * (0.85 - i * 0.14));
      zItem.scale.setScalar(sc);
    }
  }
}

export function disposeDoodleCatRig(rig: DoodleCatRig): void {
  for (const d of rig.disposables) {
    d.dispose();
  }
}
