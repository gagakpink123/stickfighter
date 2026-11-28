import * as THREE from 'three';
import { CHARACTERS } from './characters';
import { damp } from './math3d';
import { computeFighterPose, PoseAngles } from './pose';
import { FACE_MASK_PATHS } from './settings';
import { CharacterId, FighterRuntime } from './types';

export const DOODLE_PAPER_HEX = 0xffffff;
export const DOODLE_INK_HEX = 0x111111;
/** Uniform world-space half-width (radius) for all special-effect lines (thin, never hairline, never thick). */
export const VFX_LINE_RADIUS = 1.05;

export { FACE_MASK_PATHS };

interface FaceMaskFitSpec {
  phiMax: number;
  elevMin: number;
  elevMax: number;
  surfaceScale: number;
  centerYOffset: number;
}

const FACE_MASK_FIT_SPECS: Record<CharacterId, FaceMaskFitSpec> = {
  // Ayah Adnan: tucked right below flat-cap visor brim across forehead, fills round face
  adnan: {
    phiMax: 0.80,
    elevMin: -0.92,
    elevMax: 0.60,
    surfaceScale: 1.045,
    centerYOffset: -0.02,
  },
  // Ibu Tika: fills adult hijab ciput opening snugly
  tika: {
    phiMax: 0.78,
    elevMin: -0.92,
    elevMax: 0.78,
    surfaceScale: 1.045,
    centerYOffset: 0.02,
  },
  // Kak Dhira: fills child hijab ciput opening snugly
  dhira: {
    phiMax: 0.80,
    elevMin: -0.92,
    elevMax: 0.78,
    surfaceScale: 1.045,
    centerYOffset: 0.02,
  },
  // Dik Iyen: fills round toddler head generously beneath side-parted hair bangs
  iyen: {
    phiMax: 0.84,
    elevMin: -0.94,
    elevMax: 0.74,
    surfaceScale: 1.046,
    centerYOffset: -0.02,
  },
};

const faceMaskTextureCache = new Map<string, THREE.Texture>();
let faceTextureLoader: THREE.TextureLoader | null = null;

export function getFaceMaskTextureForSource(
  charId: CharacterId,
  customFaceUrl?: string | null
): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const src =
    typeof customFaceUrl === 'string' && customFaceUrl.startsWith('data:image/')
      ? customFaceUrl
      : FACE_MASK_PATHS[charId];

  const cached = faceMaskTextureCache.get(src);
  if (cached) return cached;

  if (!faceTextureLoader) {
    faceTextureLoader = new THREE.TextureLoader();
  }
  const tex = faceTextureLoader.load(src, (loaded) => {
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.minFilter = THREE.LinearMipmapLinearFilter;
    loaded.magFilter = THREE.LinearFilter;
    loaded.needsUpdate = true;
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  faceMaskTextureCache.set(src, tex);
  return tex;
}

export function getFaceMaskTexture(charId: CharacterId): THREE.Texture | null {
  return getFaceMaskTextureForSource(charId, null);
}

export function preloadAllFaceMaskTextures(): void {
  if (typeof document === 'undefined') return;
  for (const id of Object.keys(FACE_MASK_PATHS) as CharacterId[]) {
    getFaceMaskTexture(id);
  }
}

export interface CharacterColorTheme {
  primary: number;
  accent: number;
  deepAccent: number;
  cssHex: string;
}

export const CHARACTER_COLOR_THEMES: Record<CharacterId, CharacterColorTheme> = {
  adnan: {
    primary: 0xffffff,
    accent: 0x00e0ff,
    deepAccent: 0x00a5c4,
    cssHex: '#00E0FF',
  },
  tika: {
    primary: 0xffffff,
    accent: 0xff2aa5,
    deepAccent: 0xc90076,
    cssHex: '#FF2AA5',
  },
  dhira: {
    primary: 0xffffff,
    accent: 0xffd600,
    deepAccent: 0xdfa600,
    cssHex: '#FFD600',
  },
  iyen: {
    primary: 0xffffff,
    accent: 0xff7a00,
    deepAccent: 0xd65b00,
    cssHex: '#FF7A00',
  },
};

export interface DoodleShaderUniforms {
  uStepTime: { value: number };
  uJitterAmp: { value: number };
  uOutlineWidth: { value: number };
}

export interface DoodleFighterRig {
  charId: CharacterId;
  root: THREE.Group;
  bodyPivot: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftUpperArm: THREE.Group;
  leftElbow: THREE.Group;
  rightUpperArm: THREE.Group;
  rightElbow: THREE.Group;
  leftUpperLeg: THREE.Group;
  leftKnee: THREE.Group;
  leftFoot: THREE.Group;
  rightUpperLeg: THREE.Group;
  rightKnee: THREE.Group;
  rightFoot: THREE.Group;
  slashTrailGroup: THREE.Group;
  hitAuraGroup: THREE.Group;
  guardShieldGroup: THREE.Group;
  backpackOnBack: THREE.Group | null;
  blushGroup: THREE.Group | null;
  faceMaskGroup: THREE.Group;
  faceMaskMat: THREE.MeshBasicMaterial;
  faceMaskSrc: string;
  eyesNormalGroup: THREE.Group;
  eyesHitGroup: THREE.Group;
  browsGroup: THREE.Group;
  smileMouth: THREE.Object3D;
  shoutMouth: THREE.Mesh;
  serbetGroup: THREE.Group;
  sapuGroup: THREE.Group;
  bukuGroup: THREE.Group;
  kelerengPouchGroup: THREE.Group;
  tasWeaponGroup: THREE.Group;
  bellyWindGroup: THREE.Group;
  slashMat: THREE.MeshBasicMaterial;
  slashCoreMat: THREE.MeshBasicMaterial;
  hitOuterBurstGroup: THREE.Group;
  hitAuraMat: THREE.MeshBasicMaterial;
  guardShieldMat: THREE.MeshBasicMaterial;
  smoothedPose: PoseAngles | null;
  lastUpdateStamp: number;
  materialsToUpdate: DoodleShaderUniforms[];
  disposables: Array<{ dispose: () => void }>;
}

/**
 * Averages vertex normals at shared positions so Inverted Hull
 * black ink outlines wrap cleanly without corner splitting.
 */
export function createSmoothOutlineGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = src.clone();
  const pos = geo.attributes.position;
  if (!pos) return geo;

  if (!geo.attributes.normal) {
    geo.computeVertexNormals();
  }
  const norm = geo.attributes.normal;
  const buckets = new Map<string, THREE.Vector3>();

  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1000)}_${Math.round(pos.getY(i) * 1000)}_${Math.round(pos.getZ(i) * 1000)}`;
    let acc = buckets.get(key);
    if (!acc) {
      acc = new THREE.Vector3();
      buckets.set(key, acc);
    }
    acc.x += norm.getX(i);
    acc.y += norm.getY(i);
    acc.z += norm.getZ(i);
  }

  const smoothArr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1000)}_${Math.round(pos.getY(i) * 1000)}_${Math.round(pos.getZ(i) * 1000)}`;
    const acc = buckets.get(key)!;
    const len = acc.length() || 1;
    smoothArr[i * 3] = acc.x / len;
    smoothArr[i * 3 + 1] = acc.y / len;
    smoothArr[i * 3 + 2] = acc.z / len;
  }

  geo.setAttribute('aOutlineNormal', new THREE.BufferAttribute(smoothArr, 3));
  return geo;
}

export function attachDoodleVertexShader(
  material: THREE.Material,
  uniforms: DoodleShaderUniforms,
  isOutline: boolean,
  cacheKeySuffix = ''
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uStepTime = uniforms.uStepTime;
    shader.uniforms.uJitterAmp = uniforms.uJitterAmp;
    shader.uniforms.uOutlineWidth = uniforms.uOutlineWidth;

    const header = `
      uniform float uStepTime;
      uniform float uJitterAmp;
      uniform float uOutlineWidth;
      ${isOutline ? 'attribute vec3 aOutlineNormal;' : ''}
    `;

    shader.vertexShader = header + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float _jSeed = uStepTime * 1.13 + position.x * 0.14 + position.y * 0.19 + position.z * 0.27;
      vec3 _jOff = vec3(
        sin(_jSeed * 12.9898 + 1.3),
        cos(_jSeed * 78.233 + 2.7),
        sin(_jSeed * 37.719 + 4.1)
      ) * uJitterAmp;
      transformed += _jOff;
      ${isOutline ? 'transformed += normalize(aOutlineNormal) * uOutlineWidth;' : ''}
      `
    );
  };
  material.customProgramCacheKey = () =>
    (isOutline ? 'doodle-outline-flat-v3' : 'doodle-base-flat-v3') + cacheKeySuffix;
}

/**
 * Pure shadow-free flat illustration materials for crisp paper-white
 * modern doodle aesthetics with zero 3D shadow gradients.
 */
function createDoodleMaterialSet(
  theme: CharacterColorTheme,
  jitterAmp: number,
  outlineWidth: number
): {
  whiteFill: THREE.MeshBasicMaterial;
  accentFill: THREE.MeshBasicMaterial;
  deepAccentFill: THREE.MeshBasicMaterial;
  inkBasic: THREE.MeshBasicMaterial;
  outlineBack: THREE.MeshBasicMaterial;
  slashAccent: THREE.MeshBasicMaterial;
  uniforms: DoodleShaderUniforms[];
} {
  const mkUniforms = (uAmp: number, uOut: number): DoodleShaderUniforms => ({
    uStepTime: { value: 0 },
    uJitterAmp: { value: uAmp },
    uOutlineWidth: { value: uOut },
  });

  const uWhite = mkUniforms(jitterAmp, 0);
  const uAccent = mkUniforms(jitterAmp, 0);
  const uDeep = mkUniforms(jitterAmp, 0);
  const uInk = mkUniforms(jitterAmp * 0.45, 0);
  const uOut = mkUniforms(jitterAmp, outlineWidth);
  const uSlash = mkUniforms(jitterAmp * 1.1, 0);

  const whiteFill = new THREE.MeshBasicMaterial({ color: theme.primary });
  attachDoodleVertexShader(whiteFill, uWhite, false);

  const accentFill = new THREE.MeshBasicMaterial({ color: theme.accent });
  attachDoodleVertexShader(accentFill, uAccent, false);

  const deepAccentFill = new THREE.MeshBasicMaterial({ color: theme.deepAccent });
  attachDoodleVertexShader(deepAccentFill, uDeep, false);

  const inkBasic = new THREE.MeshBasicMaterial({ color: DOODLE_INK_HEX });
  attachDoodleVertexShader(inkBasic, uInk, false);

  const outlineBack = new THREE.MeshBasicMaterial({
    color: DOODLE_INK_HEX,
    side: THREE.BackSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  attachDoodleVertexShader(outlineBack, uOut, true);

  const slashAccent = new THREE.MeshBasicMaterial({
    color: theme.accent,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  attachDoodleVertexShader(slashAccent, uSlash, false);

  return {
    whiteFill,
    accentFill,
    deepAccentFill,
    inkBasic,
    outlineBack,
    slashAccent,
    uniforms: [uWhite, uAccent, uDeep, uInk, uOut, uSlash],
  };
}

/**
 * Uniform-thickness straight line segment with smooth spherical non-tapering ends.
 */
export function createCapsuleLineGeo(
  length: number,
  radius: number,
  axis: 'x' | 'y' | 'z'
): THREE.BufferGeometry {
  const bodyLen = Math.max(0.4, length - radius * 2);
  const geo = new THREE.CapsuleGeometry(radius, bodyLen, 6, 12);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  else if (axis === 'z') geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * Uniform-thickness curved stroke with blunt rounded spherical end-caps (zero tapering).
 */
export function createCappedTubeGroup(
  curve: THREE.Curve<THREE.Vector3>,
  radius: number,
  mat: THREE.Material,
  disposables: Array<{ dispose: () => void }>,
  tubularSegments = 16,
  radialSegments = 10
): THREE.Group {
  const grp = new THREE.Group();
  const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const capGeo = new THREE.SphereGeometry(radius, radialSegments, 8);
  const startCap = new THREE.Mesh(capGeo, mat);
  startCap.position.copy(curve.getPoint(0));
  const endCap = new THREE.Mesh(capGeo, mat);
  endCap.position.copy(curve.getPoint(1));
  grp.add(new THREE.Mesh(tubeGeo, mat), startCap, endCap);
  disposables.push(tubeGeo, capGeo);
  return grp;
}

/**
 * Outlined uniform-thickness curved stroke with blunt rounded end-caps (zero tapering).
 */
export function createOutlinedCappedTubeGroup(
  curve: THREE.Curve<THREE.Vector3>,
  radius: number,
  baseMat: THREE.Material,
  outlineMat: THREE.Material,
  disposables: Array<{ dispose: () => void }>,
  tubularSegments = 16,
  radialSegments = 10
): THREE.Group {
  const grp = new THREE.Group();
  const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  grp.add(createOutlinedMesh(tubeGeo, baseMat, outlineMat, disposables));

  const capGeoStart = new THREE.SphereGeometry(radius, radialSegments, 8);
  const startCap = createOutlinedMesh(capGeoStart, baseMat, outlineMat, disposables);
  startCap.position.copy(curve.getPoint(0));
  grp.add(startCap);

  const capGeoEnd = new THREE.SphereGeometry(radius, radialSegments, 8);
  const endCap = createOutlinedMesh(capGeoEnd, baseMat, outlineMat, disposables);
  endCap.position.copy(curve.getPoint(1));
  grp.add(endCap);

  return grp;
}

/**
 * Uniform-width comic-book arc speed line with rounded non-tapering caps.
 */
function createUniformArcLineGroup(
  radius: number,
  tubeRadius: number,
  startAng: number,
  endAng: number,
  mat: THREE.Material,
  disposables: Array<{ dispose: () => void }>,
  segments = 24,
  zArcDepth = 3.5
): THREE.Group {
  const pts: THREE.Vector3[] = [];
  const steps = Math.max(6, Math.round(segments * 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = startAng + (endAng - startAng) * t;
    const zCurve = Math.sin(t * Math.PI) * zArcDepth;
    pts.push(new THREE.Vector3(Math.cos(ang) * radius, Math.sin(ang) * radius, zCurve));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return createCappedTubeGroup(curve, tubeRadius, mat, disposables, segments, 10);
}

/**
 * Updates a pre-allocated closed 2D loop 4-sided tube BufferGeometry at an arbitrary scale
 * while keeping line stroke radius locked to a constant world-space halfWidth.
 */
export function updateClosedLoopTubeGeometry(
  geo: THREE.BufferGeometry,
  unitPoints: ReadonlyArray<readonly [number, number]>,
  scale: number,
  halfWidth: number
): void {
  const n = unitPoints.length;
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  for (let i = 0; i < n; i++) {
    const prev = unitPoints[(i - 1 + n) % n];
    const curr = unitPoints[i];
    const next = unitPoints[(i + 1) % n];

    const px = curr[0] * scale;
    const py = curr[1] * scale;

    let e0x = px - prev[0] * scale;
    let e0y = py - prev[1] * scale;
    const l0 = Math.hypot(e0x, e0y) || 1;
    e0x /= l0;
    e0y /= l0;

    let e1x = next[0] * scale - px;
    let e1y = next[1] * scale - py;
    const l1 = Math.hypot(e1x, e1y) || 1;
    e1x /= l1;
    e1y /= l1;

    const n0x = -e0y;
    const n0y = e0x;
    const n1x = -e1y;
    const n1y = e1x;

    let mx = n0x + n1x;
    let my = n0y + n1y;
    const mLen = Math.hypot(mx, my);
    if (mLen < 0.001) {
      mx = n0x;
      my = n0y;
    } else {
      mx /= mLen;
      my /= mLen;
    }

    const dot = mx * n0x + my * n0y;
    const miterLen = Math.min(halfWidth * 2.2, halfWidth / Math.max(0.42, Math.abs(dot)));

    const base = i * 4 * 3;
    // Outer, Front (+Z), Inner, Back (-Z)
    arr[base] = px + mx * miterLen;
    arr[base + 1] = py + my * miterLen;
    arr[base + 2] = 0;

    arr[base + 3] = px;
    arr[base + 4] = py;
    arr[base + 5] = halfWidth;

    arr[base + 6] = px - mx * miterLen;
    arr[base + 7] = py - my * miterLen;
    arr[base + 8] = 0;

    arr[base + 9] = px;
    arr[base + 10] = py;
    arr[base + 11] = -halfWidth;
  }
  posAttr.needsUpdate = true;
}

/**
 * Builds an indexed closed 4-sided tube BufferGeometry around a 2D polygon loop
 * with uniform stroke thickness (never 1px hairline in WebGL) and clean mitered corners.
 */
export function createClosedLoopTubeGeometry(
  unitPoints: ReadonlyArray<readonly [number, number]>,
  halfWidth = VFX_LINE_RADIUS,
  initialScale = 1
): THREE.BufferGeometry {
  const n = unitPoints.length;
  const positions = new Float32Array(n * 4 * 3);
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const iBase = i * 4;
    const jBase = j * 4;
    for (let s = 0; s < 4; s++) {
      const ns = (s + 1) % 4;
      indices.push(iBase + s, jBase + s, jBase + ns);
      indices.push(iBase + s, jBase + ns, iBase + ns);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  updateClosedLoopTubeGeometry(geo, unitPoints, initialScale, halfWidth);
  return geo;
}

export function createOutlinedMesh(
  geometry: THREE.BufferGeometry,
  baseMat: THREE.Material,
  outlineMat: THREE.Material,
  disposables: Array<{ dispose: () => void }>,
  addEdges = false
): THREE.Group {
  const group = new THREE.Group();
  const baseMesh = new THREE.Mesh(geometry, baseMat);
  baseMesh.castShadow = false;
  baseMesh.receiveShadow = false;
  group.add(baseMesh);

  const outGeo = createSmoothOutlineGeometry(geometry);
  const outMesh = new THREE.Mesh(outGeo, outlineMat);
  group.add(outMesh);

  disposables.push(geometry, outGeo);

  if (addEdges) {
    const edges = new THREE.EdgesGeometry(geometry, 28);
    const lines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: DOODLE_INK_HEX })
    );
    lines.scale.setScalar(1.015);
    group.add(lines);
    disposables.push(edges, lines.material as THREE.Material);
  }

  return group;
}

/**
 * Cute rounded head sphere with gentle cheek fullness.
 */
function createSmoothHeadGeometry(radius: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = y / radius;
    const cheekCurve = ny < -0.1 ? 1 + 0.055 * (1 - Math.abs(ny)) : 1 - 0.015 * Math.max(0, ny);
    pos.setXYZ(i, x * cheekCurve, y * 0.96, z * 1.03);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Curved front-face shell hugging createSmoothHeadGeometry(+X) with unmirrored
 * portrait UVs so attached photo face masks wrap naturally in 3D space.
 */
function createFaceMaskGeometry(radius: number, fit: FaceMaskFitSpec): THREE.BufferGeometry {
  const segU = 20;
  const segV = 20;
  const vertCount = (segU + 1) * (segV + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  let pIdx = 0;
  let uvIdx = 0;
  for (let iy = 0; iy <= segV; iy++) {
    const ty = iy / segV;
    const elev = fit.elevMin + (fit.elevMax - fit.elevMin) * ty;
    const cosE = Math.cos(elev);
    const sinE = Math.sin(elev);

    for (let ix = 0; ix <= segU; ix++) {
      const tx = ix / segU;
      // Viewer looks toward -X: u=0 (left of photo) -> +Z, u=1 (right of photo) -> -Z
      const phi = fit.phiMax * (1 - 2 * tx);
      const x0 = radius * cosE * Math.cos(phi);
      const y0 = radius * sinE;
      const z0 = radius * cosE * Math.sin(phi);

      const ny = y0 / radius;
      const cheekCurve = ny < -0.1 ? 1 + 0.055 * (1 - Math.abs(ny)) : 1 - 0.015 * Math.max(0, ny);

      positions[pIdx++] = x0 * cheekCurve * fit.surfaceScale;
      positions[pIdx++] = (y0 * 0.96 + radius * fit.centerYOffset) * fit.surfaceScale;
      positions[pIdx++] = z0 * 1.03 * fit.surfaceScale;

      uvs[uvIdx++] = tx;
      uvs[uvIdx++] = ty;
    }
  }

  for (let iy = 0; iy < segV; iy++) {
    for (let ix = 0; ix < segU; ix++) {
      const a = iy * (segU + 1) + ix;
      const b = a + 1;
      const c = a + (segU + 1);
      const d = c + 1;
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Plump rounded bean/tube body geometry with blunt rounded ends.
 */
function createBeanBodyGeometry(
  height: number,
  radiusX: number,
  radiusZ: number,
  bellyOut = 0
): THREE.BufferGeometry {
  const capRadius = Math.max(8, (radiusX + radiusZ) * 0.5);
  const bodyLen = Math.max(6, height - capRadius * 1.65);
  const geo = new THREE.CapsuleGeometry(capRadius, bodyLen, 14, 24);
  geo.translate(0, height * 0.5, 0);
  const pos = geo.attributes.position;
  const sx = radiusX / capRadius;
  const sz = radiusZ / capRadius;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = Math.max(0, Math.min(1, y / Math.max(1, height)));
    const beanPlump = 0.96 + 0.14 * Math.sin(t * Math.PI);
    const frontBelly = bellyOut > 0 && x > 0 ? bellyOut * Math.sin(t * Math.PI) * (x / capRadius) : 0;
    pos.setXYZ(i, x * sx * beanPlump + frontBelly, y, z * sz * beanPlump);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Thin fluid hand-drawn black ink marker stroke for arms and legs,
 * with a gentle organic bow curve and rounded joint caps.
 */
function createInkMarkerLimbGroup(
  length: number,
  radius: number,
  bowX: number,
  inkMat: THREE.Material,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const grp = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bowX, -length * 0.5, 0),
    new THREE.Vector3(0, -length, 0),
  ]);
  const tubeGeo = new THREE.TubeGeometry(curve, 12, radius, 10, false);
  const capGeo = new THREE.SphereGeometry(radius * 1.02, 10, 8);
  const topCap = new THREE.Mesh(capGeo, inkMat);
  const botCap = new THREE.Mesh(capGeo, inkMat);
  botCap.position.set(0, -length, 0);

  grp.add(new THREE.Mesh(tubeGeo, inkMat), topCap, botCap);
  disposables.push(tubeGeo, capGeo);
  return grp;
}

/**
 * Cute minimalist doodle sneakers (Adnan, Dhira, Iyen) or detailed flat shoes (Tika)
 * built with uniform ink line details and rounded non-tapering ends.
 */
function createFootwearGroup(
  charId: CharacterId,
  scaleH: number,
  mats: ReturnType<typeof createDoodleMaterialSet>,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const shoeGrp = new THREE.Group();
  const detailLineR = 1.2;

  if (charId === 'tika') {
    // Detailed minimalist flat shoe with capped strap & neat double-loop bow
    const flatGeo = new THREE.CapsuleGeometry(3.5 * scaleH, 9.2 * scaleH, 10, 16);
    flatGeo.rotateZ(Math.PI / 2);
    flatGeo.scale(1.0, 0.72, 1.04);
    const flatMesh = createOutlinedMesh(flatGeo, mats.accentFill, mats.outlineBack, disposables);
    flatMesh.position.set(4.5 * scaleH, 2.5 * scaleH, 0);
    shoeGrp.add(flatMesh);

    const strapCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(3.2 * scaleH, 2.2 * scaleH, -3.5 * scaleH),
      new THREE.Vector3(3.2 * scaleH, 5.2 * scaleH, 0),
      new THREE.Vector3(3.2 * scaleH, 2.2 * scaleH, 3.5 * scaleH),
    ]);
    shoeGrp.add(createCappedTubeGroup(strapCurve, detailLineR, mats.inkBasic, disposables, 12, 8));

    const bowLoopGeo = new THREE.TorusGeometry(1.5 * scaleH, 0.65 * scaleH, 8, 14);
    for (const sz of [-1, 1]) {
      const loop = createOutlinedMesh(bowLoopGeo.clone(), mats.whiteFill, mats.outlineBack, disposables);
      loop.position.set(8.2 * scaleH, 4.3 * scaleH, sz * 1.1 * scaleH);
      loop.rotation.y = sz * 0.45;
      shoeGrp.add(loop);
    }
    bowLoopGeo.dispose();

    const pipGeo = new THREE.SphereGeometry(1.4 * scaleH, 12, 10);
    const pip = createOutlinedMesh(pipGeo, mats.whiteFill, mats.outlineBack, disposables);
    pip.position.set(8.2 * scaleH, 4.3 * scaleH, 0);
    shoeGrp.add(pip);
  } else {
    // Detailed doodle sneaker: crisp white sole, accent upper, white toe-cap, rounded heel tab & uniform lace bars
    const soleGeo = new THREE.CapsuleGeometry(2.5 * scaleH, 10.2 * scaleH, 8, 16);
    soleGeo.rotateZ(Math.PI / 2);
    soleGeo.scale(1.02, 0.6, 1.08);
    const sole = createOutlinedMesh(soleGeo, mats.whiteFill, mats.outlineBack, disposables);
    sole.position.set(4.6 * scaleH, 1.8 * scaleH, 0);
    shoeGrp.add(sole);

    const upperGeo = new THREE.CapsuleGeometry(3.8 * scaleH, 7.8 * scaleH, 10, 16);
    upperGeo.rotateZ(Math.PI / 2);
    upperGeo.scale(1.0, 0.88, 0.98);
    const upper = createOutlinedMesh(upperGeo, mats.accentFill, mats.outlineBack, disposables);
    upper.position.set(3.6 * scaleH, 4.4 * scaleH, 0);
    shoeGrp.add(upper);

    const toeGeo = new THREE.SphereGeometry(2.85 * scaleH, 12, 10);
    toeGeo.scale(1.06, 0.78, 0.96);
    const toe = createOutlinedMesh(toeGeo, mats.whiteFill, mats.outlineBack, disposables);
    toe.position.set(8.7 * scaleH, 3.5 * scaleH, 0);
    shoeGrp.add(toe);

    // Rounded heel tab + uniform rounded lace/velcro ink stripes + crisp midsole side line
    const tabGeo = new THREE.CapsuleGeometry(1.35 * scaleH, 2.2 * scaleH, 8, 12);
    const tab = createOutlinedMesh(tabGeo, mats.whiteFill, mats.outlineBack, disposables);
    tab.position.set(-1.1 * scaleH, 6.2 * scaleH, 0);
    shoeGrp.add(tab);

    const laceGeo = createCapsuleLineGeo(4.8 * scaleH, detailLineR, 'z');
    disposables.push(laceGeo);
    for (const lx of [3.2 * scaleH, 5.8 * scaleH]) {
      const lace = new THREE.Mesh(laceGeo, mats.inkBasic);
      lace.position.set(lx, 7.15 * scaleH, 0);
      shoeGrp.add(lace);
    }

    const sideStripeGeo = createCapsuleLineGeo(8.4 * scaleH, detailLineR * 0.92, 'x');
    disposables.push(sideStripeGeo);
    for (const sz of [1, -1]) {
      const stripe = new THREE.Mesh(sideStripeGeo, mats.inkBasic);
      stripe.position.set(4.4 * scaleH, 2.75 * scaleH, sz * 2.75 * scaleH);
      shoeGrp.add(stripe);
    }
  }

  return shoeGrp;
}

export function buildDoodleFighterRig(charId: CharacterId): DoodleFighterRig {
  const spec = CHARACTERS[charId];
  const v = spec.visual;
  const theme = CHARACTER_COLOR_THEMES[charId];
  const scaleH = v.heightScale;

  // Toddlers have slightly larger adorable round heads relative to their tiny bean body
  const headRadius =
    charId === 'iyen'
      ? v.headRadius * 1.48
      : charId === 'dhira'
        ? v.headRadius * 1.38
        : v.headRadius * 1.35;

  const torsoLen = v.torsoHeight * 0.92;
  const upperArmLen = 27 * scaleH;
  const foreArmLen = 25 * scaleH;
  const legLen = 38 * scaleH;
  const shinLen = 38 * scaleH;

  // Uniform hand-drawn black ink marker stroke thickness across all 4 characters (no tapering)
  const armInkRadius = 1.9;
  const legInkRadius = 1.95;
  const detailLineRadius = 1.25;
  const outlineWidth = 2.6;

  const mats = createDoodleMaterialSet(theme, 0.08, outlineWidth);
  const disposables: Array<{ dispose: () => void }> = [
    mats.whiteFill,
    mats.accentFill,
    mats.deepAccentFill,
    mats.inkBasic,
    mats.outlineBack,
    mats.slashAccent,
  ];

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const hips = new THREE.Group();
  hips.position.set(0, legLen + shinLen, 0);
  bodyPivot.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);

  // Bean / Tube rounded body tailored per character
  const beanRadiusX =
    charId === 'adnan'
      ? 16.5 * scaleH
      : charId === 'tika'
        ? 14.5 * scaleH
        : charId === 'dhira'
          ? 14.2 * scaleH
          : 15.8 * scaleH;
  const beanRadiusZ = beanRadiusX * 1.06;
  const bellyShift = charId === 'adnan' ? 3.5 : 0;

  const torsoGeo = createBeanBodyGeometry(torsoLen, beanRadiusX, beanRadiusZ, bellyShift);
  const torsoMesh = createOutlinedMesh(torsoGeo, mats.whiteFill, mats.outlineBack, disposables);
  torso.add(torsoMesh);

  let backpackOnBack: THREE.Group | null = null;

  if (charId === 'adnan') {
    // Neckline collar ring of his plain t-shirt
    const collarGeo = new THREE.TorusGeometry(beanRadiusX * 0.56, detailLineRadius, 10, 24);
    collarGeo.rotateX(Math.PI / 2);
    const collar = new THREE.Mesh(collarGeo, mats.inkBasic);
    collar.position.set(0, torsoLen - 4, 0);
    torso.add(collar);
    disposables.push(collarGeo);

    // U-shaped pocket stitch line detail on t-shirt (uniform capped line)
    const pX = beanRadiusX * 0.96 + 1.4;
    const pY = torsoLen * 0.66;
    const pZ = beanRadiusZ * 0.42;
    const pocketCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(pX, pY + 4.2, pZ - 3.6),
      new THREE.Vector3(pX + 0.4, pY - 3.6, pZ - 3.2),
      new THREE.Vector3(pX + 0.4, pY - 3.6, pZ + 3.2),
      new THREE.Vector3(pX, pY + 4.2, pZ + 3.6),
    ]);
    torso.add(createCappedTubeGroup(pocketCurve, detailLineRadius, mats.inkBasic, disposables, 14, 8));
    const pocketTop = new THREE.Mesh(
      createCapsuleLineGeo(7.2, detailLineRadius, 'z'),
      mats.inkBasic
    );
    pocketTop.position.set(pX, pY + 4.2, pZ);
    torso.add(pocketTop);
    disposables.push(pocketTop.geometry);

    // Casual shorts wrapping the lower bean body + crisp waist & leg side lines
    const shortsH = 19 * scaleH;
    const shortsGeo = new THREE.CylinderGeometry(beanRadiusX * 1.03, beanRadiusX * 1.09, shortsH, 24);
    const shorts = createOutlinedMesh(shortsGeo, mats.accentFill, mats.outlineBack, disposables);
    shorts.position.set(0, 6 * scaleH, 0);
    torso.add(shorts);

    const hemGeo = new THREE.TorusGeometry(beanRadiusX * 1.08, detailLineRadius, 10, 24);
    hemGeo.rotateX(Math.PI / 2);
    const hem = new THREE.Mesh(hemGeo, mats.inkBasic);
    hem.position.set(0, 15.8 * scaleH, 0);
    torso.add(hem);
    disposables.push(hemGeo);

    // Uniform side stripe lines on casual shorts
    const sideStripeGeo = createCapsuleLineGeo(14 * scaleH, detailLineRadius, 'y');
    disposables.push(sideStripeGeo);
    for (const sz of [1, -1]) {
      const stripe = new THREE.Mesh(sideStripeGeo, mats.inkBasic);
      stripe.position.set(0, 6.2 * scaleH, sz * beanRadiusZ * 1.08);
      torso.add(stripe);
    }
  } else if (charId === 'tika') {
    // Elongated capsule / loose tunic-gamis flaring gracefully downward
    const skirtH = 52 * scaleH;
    const skirtGeo = new THREE.CylinderGeometry(beanRadiusX * 0.96, beanRadiusX * 1.54, skirtH, 28, 1, false);
    const skirt = createOutlinedMesh(skirtGeo, mats.accentFill, mats.outlineBack, disposables);
    skirt.position.set(0, -skirtH * 0.34, 0);
    torso.add(skirt);

    // Rounded smooth bottom hem of the gamis + crisp ink trim line
    const hemGeo = new THREE.TorusGeometry(beanRadiusX * 1.5, 2.2, 12, 28);
    hemGeo.rotateX(Math.PI / 2);
    const hemMesh = createOutlinedMesh(hemGeo, mats.whiteFill, mats.outlineBack, disposables);
    hemMesh.position.set(0, -skirtH * 0.82, 0);
    torso.add(hemMesh);

    const hemLineGeo = new THREE.TorusGeometry(beanRadiusX * 1.38, detailLineRadius, 8, 26);
    hemLineGeo.rotateX(Math.PI / 2);
    const hemLine = new THREE.Mesh(hemLineGeo, mats.inkBasic);
    hemLine.position.set(0, -skirtH * 0.68, 0);
    torso.add(hemLine);
    disposables.push(hemLineGeo);

    // Neat waist belt sash with front knot & two blunt-rounded sash ribbon tails
    const waistRingGeo = new THREE.TorusGeometry(beanRadiusX * 1.04, 1.9, 10, 24);
    waistRingGeo.rotateX(Math.PI / 2);
    const waistMesh = createOutlinedMesh(waistRingGeo, mats.whiteFill, mats.outlineBack, disposables);
    waistMesh.position.set(0, 6 * scaleH, 0);
    torso.add(waistMesh);

    const knotGeo = new THREE.SphereGeometry(2.6 * scaleH, 12, 10);
    const knot = createOutlinedMesh(knotGeo, mats.whiteFill, mats.outlineBack, disposables);
    knot.position.set(beanRadiusX * 1.05, 6 * scaleH, 3 * scaleH);
    torso.add(knot);

    const tail1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(beanRadiusX * 1.04, 4.5 * scaleH, 3.2 * scaleH),
      new THREE.Vector3(beanRadiusX * 1.16, -5 * scaleH, 5.2 * scaleH),
      new THREE.Vector3(beanRadiusX * 1.24, -14 * scaleH, 6.0 * scaleH),
    ]);
    const tail2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(beanRadiusX * 1.04, 4.5 * scaleH, 2.8 * scaleH),
      new THREE.Vector3(beanRadiusX * 1.14, -4 * scaleH, 0.2 * scaleH),
      new THREE.Vector3(beanRadiusX * 1.2, -12 * scaleH, -0.8 * scaleH),
    ]);
    torso.add(
      createOutlinedCappedTubeGroup(tail1, 1.55, mats.whiteFill, mats.outlineBack, disposables, 10, 8),
      createOutlinedCappedTubeGroup(tail2, 1.55, mats.whiteFill, mats.outlineBack, disposables, 10, 8)
    );
  } else if (charId === 'dhira') {
    // Modest tunic skirt hem for Kak Dhira + uniform collar & waist trim lines
    const collarGeo = new THREE.TorusGeometry(beanRadiusX * 0.56, detailLineRadius, 10, 22);
    collarGeo.rotateX(Math.PI / 2);
    const collar = new THREE.Mesh(collarGeo, mats.inkBasic);
    collar.position.set(0, torsoLen - 3.5, 0);
    torso.add(collar);
    disposables.push(collarGeo);

    const skirtH = 22 * scaleH;
    const skirtGeo = new THREE.CylinderGeometry(beanRadiusX * 0.96, beanRadiusX * 1.26, skirtH, 24);
    const skirt = createOutlinedMesh(skirtGeo, mats.accentFill, mats.outlineBack, disposables);
    skirt.position.set(0, 2 * scaleH, 0);
    torso.add(skirt);

    const waistTrimGeo = new THREE.TorusGeometry(beanRadiusX * 1.02, detailLineRadius, 10, 22);
    waistTrimGeo.rotateX(Math.PI / 2);
    const waistTrim = new THREE.Mesh(waistTrimGeo, mats.inkBasic);
    waistTrim.position.set(0, 12.5 * scaleH, 0);
    torso.add(waistTrim);
    disposables.push(waistTrimGeo);

    // Cute 3D school backpack + top handle loop + front buckle straps + clear shoulder straps
    backpackOnBack = new THREE.Group();
    const bagGeo = new THREE.BoxGeometry(15, 22, 17);
    const bagMesh = createOutlinedMesh(bagGeo, mats.whiteFill, mats.outlineBack, disposables, true);
    backpackOnBack.add(bagMesh);

    const flapGeo = new THREE.BoxGeometry(16, 8, 18);
    const flapMesh = createOutlinedMesh(flapGeo, mats.accentFill, mats.outlineBack, disposables);
    flapMesh.position.set(-0.5, 7.8, 0);
    backpackOnBack.add(flapMesh);

    const pocketGeo = new THREE.BoxGeometry(4, 8, 11);
    const pocketMesh = createOutlinedMesh(pocketGeo, mats.accentFill, mats.outlineBack, disposables);
    pocketMesh.position.set(-8.5, -3.5, 0);
    backpackOnBack.add(pocketMesh);

    const handleLoopGeo = new THREE.TorusGeometry(3.4, detailLineRadius, 8, 16, Math.PI);
    handleLoopGeo.rotateY(Math.PI / 2);
    const handleLoop = new THREE.Mesh(handleLoopGeo, mats.inkBasic);
    handleLoop.position.set(0.5, 11.8, 0);
    backpackOnBack.add(handleLoop);
    disposables.push(handleLoopGeo);

    const strapLineGeo = createCapsuleLineGeo(8.2, detailLineRadius, 'y');
    disposables.push(strapLineGeo);
    for (const sz of [-4.2, 4.2]) {
      const sLine = new THREE.Mesh(strapLineGeo, mats.inkBasic);
      sLine.position.set(-8.6, 6.2, sz);
      backpackOnBack.add(sLine);
    }

    backpackOnBack.position.set(-beanRadiusX * 1.2, torsoLen * 0.56, 0);
    torso.add(backpackOnBack);

    // Visible capped backpack straps over both shoulders + rounded chest strap buckle
    for (const sideZ of [beanRadiusZ * 0.58, -beanRadiusZ * 0.58]) {
      const strapCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-beanRadiusX * 0.72, torsoLen * 0.32, sideZ),
        new THREE.Vector3(-beanRadiusX * 0.45, torsoLen * 0.88, sideZ),
        new THREE.Vector3(beanRadiusX * 0.55, torsoLen * 0.92, sideZ * 0.85),
        new THREE.Vector3(beanRadiusX * 0.9, torsoLen * 0.54, sideZ * 0.95),
        new THREE.Vector3(beanRadiusX * 0.5, torsoLen * 0.28, sideZ),
      ]);
      torso.add(createCappedTubeGroup(strapCurve, 1.65, mats.inkBasic, disposables, 16, 8));
    }
    const chestBuckleGeo = createCapsuleLineGeo(beanRadiusZ * 1.15, detailLineRadius, 'z');
    const chestBuckle = new THREE.Mesh(chestBuckleGeo, mats.accentFill);
    chestBuckle.position.set(beanRadiusX * 0.98, torsoLen * 0.58, 0);
    torso.add(chestBuckle);
    disposables.push(chestBuckleGeo);
  } else {
    // Dik Iyen: short cute bean t-shirt with orange collar trim, sporty chest band & toddler shorts
    const collarGeo = new THREE.TorusGeometry(beanRadiusX * 0.58, 1.65, 10, 20);
    collarGeo.rotateX(Math.PI / 2);
    const collar = createOutlinedMesh(collarGeo, mats.accentFill, mats.outlineBack, disposables);
    collar.position.set(0, torsoLen - 2.5, 0);
    torso.add(collar);

    const chestBandGeo = new THREE.TorusGeometry(beanRadiusX * 1.07, detailLineRadius, 8, 22);
    chestBandGeo.rotateX(Math.PI / 2);
    const chestBand = new THREE.Mesh(chestBandGeo, mats.inkBasic);
    chestBand.position.set(0, torsoLen * 0.58, 0);
    torso.add(chestBand);
    disposables.push(chestBandGeo);

    const shortsGeo = new THREE.CylinderGeometry(beanRadiusX * 1.05, beanRadiusX * 1.14, 13 * scaleH, 22);
    const shorts = createOutlinedMesh(shortsGeo, mats.accentFill, mats.outlineBack, disposables);
    shorts.position.set(0, 3 * scaleH, 0);
    torso.add(shorts);

    const hemGeo = new THREE.TorusGeometry(beanRadiusX * 1.07, detailLineRadius, 8, 22);
    hemGeo.rotateX(Math.PI / 2);
    const hem = new THREE.Mesh(hemGeo, mats.inkBasic);
    hem.position.set(0, 9.5 * scaleH, 0);
    torso.add(hem);
    disposables.push(hemGeo);

    const iyenStripeGeo = createCapsuleLineGeo(9.5 * scaleH, detailLineRadius, 'y');
    disposables.push(iyenStripeGeo);
    for (const sz of [1, -1]) {
      const stripe = new THREE.Mesh(iyenStripeGeo, mats.inkBasic);
      stripe.position.set(0, 3.2 * scaleH, sz * beanRadiusZ * 1.1);
      torso.add(stripe);
    }
  }

  const neck = new THREE.Group();
  neck.position.set(0, torsoLen + 1, 0);
  torso.add(neck);

  const head = new THREE.Group();
  head.position.set(0, headRadius * 0.88, 0);
  neck.add(head);

  const headGeo = createSmoothHeadGeometry(headRadius);
  const headMesh = createOutlinedMesh(headGeo, mats.whiteFill, mats.outlineBack, disposables);
  head.add(headMesh);

  // Fitted 3D contoured photo face mask hugging the front (+X) head hemisphere
  const faceMaskGroup = new THREE.Group();
  const faceTex = getFaceMaskTexture(charId);
  const faceMaskGeo = createFaceMaskGeometry(headRadius, FACE_MASK_FIT_SPECS[charId]);
  const faceMaskMat = new THREE.MeshBasicMaterial({
    map: faceTex,
    transparent: true,
    alphaTest: 0.05,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.FrontSide,
  });
  attachDoodleVertexShader(faceMaskMat, mats.uniforms[0], false, '-facemask');
  const faceMaskMesh = new THREE.Mesh(faceMaskGeo, faceMaskMat);
  faceMaskMesh.renderOrder = 2;
  faceMaskGroup.add(faceMaskMesh);
  faceMaskGroup.visible = false;
  head.add(faceMaskGroup);
  disposables.push(faceMaskGeo, faceMaskMat);

  let blushGroup: THREE.Group | null = null;

  // Cute minimal black ink dot eyes (uniform across roster)
  const eyesNormalGroup = new THREE.Group();
  const eyeRadius = charId === 'iyen' ? 2.4 : 2.25;
  const eyeGeo = new THREE.SphereGeometry(eyeRadius, 14, 12);
  disposables.push(eyeGeo);
  const eyeL = new THREE.Mesh(eyeGeo, mats.inkBasic);
  eyeL.position.set(headRadius * 0.94, headRadius * 0.12, headRadius * 0.34);
  const eyeR = new THREE.Mesh(eyeGeo, mats.inkBasic);
  eyeR.position.set(headRadius * 0.94, headRadius * 0.12, -headRadius * 0.34);
  eyesNormalGroup.add(eyeL, eyeR);
  head.add(eyesNormalGroup);

  // Expressive attack/victory brows with rounded ends
  const browsGroup = new THREE.Group();
  const browScale = Math.max(0.78, scaleH);
  const browGeo = createCapsuleLineGeo(5.8 * browScale, detailLineRadius, 'z');
  disposables.push(browGeo);
  const browL = new THREE.Mesh(browGeo, mats.inkBasic);
  browL.position.set(headRadius * 0.95, headRadius * 0.36, headRadius * 0.34);
  browL.rotation.y = 0.25;
  browL.rotation.x = -0.22;
  const browR = new THREE.Mesh(browGeo, mats.inkBasic);
  browR.position.set(headRadius * 0.95, headRadius * 0.36, -headRadius * 0.34);
  browR.rotation.y = -0.25;
  browR.rotation.x = 0.22;
  browsGroup.add(browL, browR);
  head.add(browsGroup);

  // X eyes when hit/KO with rounded line ends
  const eyesHitGroup = new THREE.Group();
  eyesHitGroup.visible = false;
  const xBarGeo = createCapsuleLineGeo(6.4 * browScale, detailLineRadius, 'y');
  disposables.push(xBarGeo);
  for (const sideZ of [headRadius * 0.34, -headRadius * 0.34]) {
    const x1 = new THREE.Mesh(xBarGeo, mats.inkBasic);
    x1.position.set(headRadius * 0.95, headRadius * 0.12, sideZ);
    x1.rotation.x = Math.PI / 4;
    const x2 = new THREE.Mesh(xBarGeo, mats.inkBasic);
    x2.position.set(headRadius * 0.95, headRadius * 0.12, sideZ);
    x2.rotation.x = -Math.PI / 4;
    eyesHitGroup.add(x1, x2);
  }
  head.add(eyesHitGroup);

  // Friendly curved smile with blunt rounded tips (never open/tapering ends)
  const smileCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(headRadius * 0.87, -headRadius * 0.2, -headRadius * 0.28),
    new THREE.Vector3(headRadius * 0.99, -headRadius * 0.32, 0),
    new THREE.Vector3(headRadius * 0.87, -headRadius * 0.2, headRadius * 0.28),
  ]);
  const smileMouth = createCappedTubeGroup(smileCurve, detailLineRadius, mats.inkBasic, disposables, 16, 10);
  head.add(smileMouth);

  const shoutGeo = new THREE.TorusGeometry(2.9 * browScale, detailLineRadius, 10, 20);
  shoutGeo.rotateY(Math.PI / 2);
  const shoutMouth = new THREE.Mesh(shoutGeo, mats.inkBasic);
  shoutMouth.position.set(headRadius * 0.96, -headRadius * 0.28, 0);
  shoutMouth.visible = false;
  head.add(shoutMouth);
  disposables.push(shoutGeo);

  if (v.hairStyle === 'bald_side') {
    // Ayah Adnan: wears a classic Topi Copet (Flat Cap / Pet) on his round bald head + side ears
    const earGeo = new THREE.SphereGeometry(4.2, 14, 12);
    earGeo.scale(0.72, 1.05, 0.55);
    for (const sz of [1, -1]) {
      const ear = createOutlinedMesh(earGeo.clone(), mats.whiteFill, mats.outlineBack, disposables);
      ear.position.set(-1.5, -headRadius * 0.06, sz * headRadius * 0.96);
      head.add(ear);
    }
    earGeo.dispose();

    const capGroup = new THREE.Group();
    capGroup.position.set(0, headRadius * 0.72, 0);
    capGroup.rotation.z = -0.11;

    // Flat cap crown dome
    const crownGeo = new THREE.SphereGeometry(headRadius * 1.06, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.54);
    crownGeo.scale(1.18, 0.48, 1.02);
    const crownMesh = createOutlinedMesh(crownGeo, mats.accentFill, mats.outlineBack, disposables);
    crownMesh.position.set(1.5, 0, 0);
    capGroup.add(crownMesh);

    // Uniform black piping ring around base of flat cap crown
    const capPipingGeo = new THREE.TorusGeometry(headRadius * 1.05, detailLineRadius, 10, 26);
    capPipingGeo.rotateX(Math.PI / 2);
    capPipingGeo.scale(1.15, 1.0, 1.0);
    const capPiping = new THREE.Mesh(capPipingGeo, mats.inkBasic);
    capPiping.position.set(1.2, -0.4, 0);
    capGroup.add(capPiping);
    disposables.push(capPipingGeo);

    // Rounded pet visor brim jutting cleanly forward over brow (smooth rounded crescent, no sharp corners)
    const brimGeo = new THREE.SphereGeometry(headRadius * 0.94, 22, 14);
    brimGeo.scale(0.78, 0.16, 0.92);
    const brimMesh = createOutlinedMesh(brimGeo, mats.deepAccentFill, mats.outlineBack, disposables);
    brimMesh.position.set(headRadius * 0.85, -1.8, 0);
    brimMesh.rotation.z = -0.12;
    capGroup.add(brimMesh);

    // Top flat cap button pip
    const capBtnGeo = new THREE.SphereGeometry(2.4, 12, 10);
    capBtnGeo.scale(1.0, 0.6, 1.0);
    const capBtn = createOutlinedMesh(capBtnGeo, mats.whiteFill, mats.outlineBack, disposables);
    capBtn.position.set(-1.5, headRadius * 0.48, 0);
    capGroup.add(capBtn);

    head.add(capGroup);
  } else if (v.hairStyle === 'hijab_adult' || v.hairStyle === 'hijab_child') {
    const isChild = v.hairStyle === 'hijab_child';
    // Inner neat ciput / face-framing rim
    const ciputGeo = new THREE.TorusGeometry(headRadius * 0.97, 2.0, 10, 24);
    ciputGeo.rotateY(Math.PI / 2);
    const ciput = createOutlinedMesh(ciputGeo, mats.whiteFill, mats.outlineBack, disposables);
    ciput.position.set(headRadius * 0.16, headRadius * 0.04, 0);
    head.add(ciput);

    const hoodGeo = new THREE.SphereGeometry(
      headRadius * 1.1,
      28,
      22,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.78
    );
    hoodGeo.scale(1.02, 1.05, 1.09);
    hoodGeo.rotateZ(0.3);
    const hood = createOutlinedMesh(hoodGeo, mats.accentFill, mats.outlineBack, disposables);
    hood.position.set(-headRadius * 0.24, headRadius * 0.04, 0);
    head.add(hood);

    // Sculpted layered hijab shoulder drape
    const drapeH = isChild ? 14 : 23;
    const drapeGeo = new THREE.CylinderGeometry(headRadius * 0.9, headRadius * 1.14, drapeH, 24);
    drapeGeo.scale(1.04, 1.0, 1.08);
    const drape = createOutlinedMesh(drapeGeo, mats.accentFill, mats.outlineBack, disposables);
    drape.position.set(-headRadius * 0.24, -headRadius * 0.72 - drapeH * 0.2, 0);
    head.add(drape);

    const trimGeo = new THREE.TorusGeometry(headRadius * 1.12, 1.85, 12, 24);
    trimGeo.rotateX(Math.PI / 2);
    const trim = createOutlinedMesh(trimGeo, mats.whiteFill, mats.outlineBack, disposables);
    trim.position.set(-headRadius * 0.24, -headRadius * 0.72 - drapeH * 0.65, 0);
    head.add(trim);

    // Neat uniform front hijab fold curve across drape
    const foldCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(headRadius * 0.45, -headRadius * 0.48, -headRadius * 0.65),
      new THREE.Vector3(headRadius * 0.82, -headRadius * 0.85, 0),
      new THREE.Vector3(headRadius * 0.55, -headRadius * 0.58, headRadius * 0.72),
    ]);
    head.add(createCappedTubeGroup(foldCurve, detailLineRadius, mats.inkBasic, disposables, 14, 8));

    if (isChild) {
      // Cute double-loop ribbon bow on Kak Dhira's hijab + uniform cheek dots
      const bowLoopGeo = new THREE.TorusGeometry(2.5, 1.1, 8, 16);
      for (const sz of [-1, 1]) {
        const loop = createOutlinedMesh(bowLoopGeo.clone(), mats.whiteFill, mats.outlineBack, disposables);
        loop.position.set(headRadius * 0.3, headRadius * 0.98, 4.2 + sz * 2.2);
        loop.rotation.y = sz * 0.35;
        head.add(loop);
      }
      bowLoopGeo.dispose();

      const bowKnotGeo = new THREE.SphereGeometry(1.9, 12, 10);
      const bowKnot = createOutlinedMesh(bowKnotGeo, mats.whiteFill, mats.outlineBack, disposables);
      bowKnot.position.set(headRadius * 0.32, headRadius * 0.98, 4.2);
      head.add(bowKnot);

      const cheekGeo = new THREE.SphereGeometry(2.1, 10, 8);
      cheekGeo.scale(0.6, 0.85, 1.2);
      disposables.push(cheekGeo);
      blushGroup = new THREE.Group();
      for (const sz of [1, -1]) {
        const blush = new THREE.Mesh(cheekGeo, mats.accentFill);
        blush.position.set(headRadius * 0.88, -headRadius * 0.08, sz * headRadius * 0.56);
        blushGroup.add(blush);
      }
      head.add(blushGroup);
    } else {
      // Ibu Tika subtle brooch pin on side of hijab drape
      const broochGeo = new THREE.SphereGeometry(2.5, 12, 10);
      const brooch = createOutlinedMesh(broochGeo, mats.whiteFill, mats.outlineBack, disposables);
      brooch.position.set(headRadius * 0.65, -headRadius * 0.88, headRadius * 0.52);
      head.add(brooch);
    }
  } else {
    // Dik Iyen: cute toddler cheek dots + neat short side-parted hair with uniform rounded ends
    const cheekGeo = new THREE.SphereGeometry(2.3, 10, 8);
    cheekGeo.scale(0.6, 0.85, 1.2);
    disposables.push(cheekGeo);
    blushGroup = new THREE.Group();
    for (const sz of [1, -1]) {
      const blush = new THREE.Mesh(cheekGeo, mats.accentFill);
      blush.position.set(headRadius * 0.88, -headRadius * 0.08, sz * headRadius * 0.54);
      blushGroup.add(blush);
    }
    head.add(blushGroup);

    const hairCapGeo = new THREE.SphereGeometry(
      headRadius * 1.03,
      24,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.4
    );
    hairCapGeo.rotateZ(0.14);
    const hairCap = new THREE.Mesh(hairCapGeo, mats.inkBasic);
    hairCap.position.set(-2.2, headRadius * 0.14, 0);
    head.add(hairCap);
    disposables.push(hairCapGeo);

    // Uniform-width capped side-parted hair locks (zero tapering/pointed tips)
    const hairLockRadius = 3.0;
    const mainSweepCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(headRadius * 0.08, headRadius * 1.02, headRadius * 0.34),
      new THREE.Vector3(headRadius * 0.66, headRadius * 0.88, headRadius * 0.08),
      new THREE.Vector3(headRadius * 0.94, headRadius * 0.56, -headRadius * 0.34),
      new THREE.Vector3(headRadius * 0.76, headRadius * 0.44, -headRadius * 0.66),
    ]);
    head.add(createCappedTubeGroup(mainSweepCurve, hairLockRadius, mats.inkBasic, disposables, 14, 10));

    const minorSweepCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(headRadius * 0.18, headRadius * 0.98, headRadius * 0.48),
      new THREE.Vector3(headRadius * 0.68, headRadius * 0.78, headRadius * 0.64),
      new THREE.Vector3(headRadius * 0.66, headRadius * 0.54, headRadius * 0.74),
    ]);
    head.add(createCappedTubeGroup(minorSweepCurve, hairLockRadius, mats.inkBasic, disposables, 10, 10));
  }

  const shHalf = Math.max(9, beanRadiusZ * 0.96);

  const buildArmChain = (sideZ: number, isFront: boolean) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0, torsoLen - 6, sideZ);
    torso.add(shoulder);

    const upperArm = new THREE.Group();
    shoulder.add(upperArm);

    // Neat short/tunic sleeve cuff wrapping upper shoulder joint + crisp ink cuff line
    const sleeveH = charId === 'tika' ? 14 * scaleH : 9.5 * scaleH;
    const sleeveR = Math.max(3.4, 4.4 * scaleH);
    const sleeveGeo = new THREE.CylinderGeometry(sleeveR * 0.92, sleeveR * 1.15, sleeveH, 14);
    sleeveGeo.translate(0, -sleeveH * 0.45, 0);
    const sleeveMesh = createOutlinedMesh(sleeveGeo, mats.whiteFill, mats.outlineBack, disposables);
    upperArm.add(sleeveMesh);

    const cuffGeo = new THREE.TorusGeometry(sleeveR * 1.14, detailLineRadius, 8, 16);
    cuffGeo.rotateX(Math.PI / 2);
    const cuff = new THREE.Mesh(cuffGeo, mats.inkBasic);
    cuff.position.set(0, -sleeveH * 0.94, 0);
    upperArm.add(cuff);
    disposables.push(cuffGeo);

    upperArm.add(
      createInkMarkerLimbGroup(upperArmLen, armInkRadius, isFront ? -1.4 : 1.2, mats.inkBasic, disposables)
    );

    const elbow = new THREE.Group();
    elbow.position.set(0, -upperArmLen, 0);
    upperArm.add(elbow);

    const foreArm = new THREE.Group();
    elbow.add(foreArm);
    foreArm.add(
      createInkMarkerLimbGroup(foreArmLen, armInkRadius, isFront ? 1.2 : -1.0, mats.inkBasic, disposables)
    );

    const hand = new THREE.Group();
    hand.position.set(0, -foreArmLen, 0);
    foreArm.add(hand);

    // Cute minimalist rounded doodle mitten hand
    const handRadius = (isFront ? 4.2 : 3.9) * Math.max(0.75, scaleH);
    const handGeo = new THREE.SphereGeometry(handRadius, 18, 14);
    handGeo.scale(1.08, 0.96, 0.96);
    hand.add(createOutlinedMesh(handGeo, mats.whiteFill, mats.outlineBack, disposables));

    return { shoulder, upperArm, elbow, foreArm, hand };
  };

  const frontArm = buildArmChain(shHalf, true);
  const backArm = buildArmChain(-shHalf, false);

  const hipHalf = shHalf * 0.56;

  const buildLegChain = (sideZ: number, isFront: boolean) => {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(0, 0, sideZ);
    hips.add(hipJoint);

    const upperLeg = new THREE.Group();
    hipJoint.add(upperLeg);
    upperLeg.add(
      createInkMarkerLimbGroup(legLen, legInkRadius, isFront ? 1.3 : -1.1, mats.inkBasic, disposables)
    );

    const knee = new THREE.Group();
    knee.position.set(0, -legLen, 0);
    upperLeg.add(knee);

    const lowerLeg = new THREE.Group();
    knee.add(lowerLeg);
    lowerLeg.add(
      createInkMarkerLimbGroup(shinLen, legInkRadius, isFront ? -1.0 : 1.0, mats.inkBasic, disposables)
    );

    const foot = new THREE.Group();
    foot.position.set(0, -shinLen, 0);
    lowerLeg.add(foot);

    foot.add(createFootwearGroup(charId, Math.max(0.72, scaleH), mats, disposables));

    return { hipJoint, upperLeg, knee, lowerLeg, foot };
  };

  const frontLeg = buildLegChain(hipHalf, true);
  const backLeg = buildLegChain(-hipHalf, false);

  // Weapons & Attack Trails
  const weaponGroup = new THREE.Group();
  weaponGroup.rotation.z = -Math.PI / 2;
  frontArm.hand.add(weaponGroup);

  const sapuGroup = new THREE.Group();
  sapuGroup.visible = false;
  const handleGeo = new THREE.CylinderGeometry(2.1, 2.1, 92, 16);
  handleGeo.rotateZ(-Math.PI / 2);
  handleGeo.translate(46, 0, 0);
  sapuGroup.add(createOutlinedMesh(handleGeo, mats.whiteFill, mats.outlineBack, disposables));
  const pommelGeo = new THREE.SphereGeometry(2.6, 12, 10);
  sapuGroup.add(createOutlinedMesh(pommelGeo, mats.accentFill, mats.outlineBack, disposables));
  const ferruleGeo = new THREE.CylinderGeometry(2.9, 2.9, 6, 14);
  ferruleGeo.rotateZ(-Math.PI / 2);
  const ferruleMesh = createOutlinedMesh(ferruleGeo, mats.accentFill, mats.outlineBack, disposables);
  ferruleMesh.position.set(88, 0, 0);
  sapuGroup.add(ferruleMesh);
  for (let i = -4; i <= 4; i++) {
    const ang = i * 0.21;
    const fCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(88, 0, 0),
      new THREE.Vector3(88 + Math.cos(ang) * 18, Math.sin(ang) * 18, (i % 2 === 0 ? 1 : -1) * 5),
      new THREE.Vector3(88 + Math.cos(ang) * 34, Math.sin(ang) * 34, (i % 2 === 0 ? 1 : -1) * 8),
    ]);
    sapuGroup.add(
      createOutlinedCappedTubeGroup(
        fCurve,
        1.8,
        Math.abs(i) % 2 === 1 ? mats.accentFill : mats.whiteFill,
        mats.outlineBack,
        disposables,
        12,
        8
      )
    );
  }
  weaponGroup.add(sapuGroup);

  const serbetGroup = new THREE.Group();
  serbetGroup.visible = false;
  const serbetCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(55, 14, 8),
    new THREE.Vector3(115, -14, -8),
    new THREE.Vector3(175, 10, 6),
    new THREE.Vector3(230, -4, 0),
  ]);
  serbetGroup.add(
    createOutlinedCappedTubeGroup(serbetCurve, 4.4, mats.whiteFill, mats.outlineBack, disposables, 36, 12)
  );
  const serbetEdgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -4.4, 0),
    new THREE.Vector3(55, 9.6, 8),
    new THREE.Vector3(115, -18.4, -8),
    new THREE.Vector3(175, 5.6, 6),
    new THREE.Vector3(230, -8.4, 0),
  ]);
  serbetGroup.add(createCappedTubeGroup(serbetEdgeCurve, 2.0, mats.accentFill, disposables, 34, 10));
  weaponGroup.add(serbetGroup);

  const bukuGroup = new THREE.Group();
  bukuGroup.visible = false;
  const dhiraBookGeo = new THREE.BoxGeometry(22, 28, 7);
  const dhiraBookBase = new THREE.Mesh(dhiraBookGeo, mats.whiteFill);
  const dhiraBookOut = new THREE.Mesh(dhiraBookGeo, mats.outlineBack);
  dhiraBookOut.scale.set(1.13, 1.11, 1.32);
  const dhiraBookEdges = new THREE.EdgesGeometry(dhiraBookGeo, 28);
  const dhiraBookLines = new THREE.LineSegments(
    dhiraBookEdges,
    new THREE.LineBasicMaterial({ color: DOODLE_INK_HEX })
  );
  dhiraBookLines.scale.setScalar(1.015);
  dhiraBookBase.position.set(13, 0, 0);
  dhiraBookOut.position.set(13, 0, 0);
  dhiraBookLines.position.set(13, 0, 0);
  bukuGroup.add(dhiraBookBase, dhiraBookOut, dhiraBookLines);
  disposables.push(dhiraBookGeo, dhiraBookEdges, dhiraBookLines.material as THREE.Material);

  const dhiraSpineGeo = new THREE.BoxGeometry(5, 29, 8.2);
  const dhiraSpineBase = new THREE.Mesh(dhiraSpineGeo, mats.accentFill);
  const dhiraSpineOut = new THREE.Mesh(dhiraSpineGeo, mats.outlineBack);
  dhiraSpineOut.scale.set(1.25, 1.1, 1.28);
  dhiraSpineBase.position.set(3, 0, 0);
  dhiraSpineOut.position.set(3, 0, 0);
  bukuGroup.add(dhiraSpineBase, dhiraSpineOut);
  disposables.push(dhiraSpineGeo);

  const dhiraPageLineGeo = createCapsuleLineGeo(12, detailLineRadius, 'x');
  disposables.push(dhiraPageLineGeo);
  for (const py of [-6, 0, 6]) {
    const line = new THREE.Mesh(dhiraPageLineGeo, mats.inkBasic);
    line.position.set(14, py, 3.9);
    bukuGroup.add(line);
  }
  weaponGroup.add(bukuGroup);

  const kelerengPouchGroup = new THREE.Group();
  kelerengPouchGroup.visible = false;
  const pouchGeo = new THREE.SphereGeometry(10.5, 16, 14);
  pouchGeo.scale(1.05, 1.18, 0.92);
  const pouchMesh = createOutlinedMesh(pouchGeo, mats.accentFill, mats.outlineBack, disposables);
  pouchMesh.position.set(12, -2, 0);
  kelerengPouchGroup.add(pouchMesh);
  const pouchNeckGeo = new THREE.TorusGeometry(5.5, 1.5, 8, 16);
  pouchNeckGeo.rotateX(Math.PI / 2);
  const pouchNeck = createOutlinedMesh(pouchNeckGeo, mats.whiteFill, mats.outlineBack, disposables);
  pouchNeck.position.set(12, 8, 0);
  kelerengPouchGroup.add(pouchNeck);
  const orbGeo = new THREE.SphereGeometry(4.2, 14, 12);
  const orbMesh = createOutlinedMesh(orbGeo, mats.whiteFill, mats.outlineBack, disposables);
  orbMesh.position.set(22, 2, 4);
  kelerengPouchGroup.add(orbMesh);
  weaponGroup.add(kelerengPouchGroup);

  const tasWeaponGroup = new THREE.Group();
  tasWeaponGroup.visible = false;
  const swingBagGeo = new THREE.BoxGeometry(28, 34, 20);
  tasWeaponGroup.add(createOutlinedMesh(swingBagGeo, mats.whiteFill, mats.outlineBack, disposables, true));
  const swingFlapGeo = new THREE.BoxGeometry(30, 11, 21.5);
  const swingFlap = createOutlinedMesh(swingFlapGeo, mats.accentFill, mats.outlineBack, disposables);
  swingFlap.position.set(0, 12, 0);
  tasWeaponGroup.add(swingFlap);
  const swingHandleGeo = new THREE.TorusGeometry(4.8, detailLineRadius, 8, 16, Math.PI);
  swingHandleGeo.rotateY(Math.PI / 2);
  const swingHandle = new THREE.Mesh(swingHandleGeo, mats.inkBasic);
  swingHandle.position.set(0, 18, 0);
  tasWeaponGroup.add(swingHandle);
  disposables.push(swingHandleGeo);
  tasWeaponGroup.position.set(22, 0, 0);
  weaponGroup.add(tasWeaponGroup);

  // Pure accent-color comic-book action & impact lines (thin uniform line width, zero black outlines)
  const slashCoreMat = new THREE.MeshBasicMaterial({
    color: theme.accent,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  });
  const hitAuraMat = new THREE.MeshBasicMaterial({
    color: theme.accent,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
  });
  const guardShieldMat = new THREE.MeshBasicMaterial({
    color: theme.accent,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  disposables.push(slashCoreMat, hitAuraMat, guardShieldMat);

  // Uniform thin non-hairline line radius across all special effects
  const comicLineR = VFX_LINE_RADIUS;

  // Belly bump comic rush lines
  const bellyWindGroup = new THREE.Group();
  bellyWindGroup.visible = false;
  const bellyLineSpecs = [
    { y: 24, x: 4, len: 30, z: 6 },
    { y: 12, x: 10, len: 42, z: 2 },
    { y: 0, x: 14, len: 46, z: 0 },
    { y: -12, x: 10, len: 42, z: -2 },
    { y: -24, x: 4, len: 28, z: -6 },
  ];
  for (const bSpec of bellyLineSpecs) {
    const lineGeo = createCapsuleLineGeo(bSpec.len * scaleH, comicLineR, 'x');
    const lineMesh = new THREE.Mesh(lineGeo, mats.slashAccent);
    lineMesh.position.set(bSpec.x * scaleH, torsoLen * 0.45 + bSpec.y * scaleH, bSpec.z);
    bellyWindGroup.add(lineMesh);
    disposables.push(lineGeo);
  }
  torso.add(bellyWindGroup);

  // Thin comic-book parallel curved motion trails for punches, kicks & jurus swings
  const slashTrailGroup = new THREE.Group();
  slashTrailGroup.visible = false;
  slashTrailGroup.position.set(22 * scaleH, 92 * scaleH, 10);
  const slashArcSpecs = [
    { r: 44, a0: -Math.PI * 0.24, a1: Math.PI * 0.28, z: 0, core: false },
    { r: 51, a0: -Math.PI * 0.38, a1: Math.PI * 0.36, z: 2, core: true },
    { r: 58, a0: -Math.PI * 0.44, a1: Math.PI * 0.44, z: 0, core: false },
    { r: 65, a0: -Math.PI * 0.32, a1: Math.PI * 0.42, z: -2, core: true },
    { r: 72, a0: -Math.PI * 0.18, a1: Math.PI * 0.32, z: 1, core: false },
  ];
  for (const sSpec of slashArcSpecs) {
    const arcGrp = createUniformArcLineGroup(
      sSpec.r * scaleH,
      comicLineR,
      sSpec.a0,
      sSpec.a1,
      sSpec.core ? slashCoreMat : mats.slashAccent,
      disposables,
      20,
      3.0
    );
    arcGrp.position.z = sSpec.z;
    slashTrailGroup.add(arcGrp);
  }
  bodyPivot.add(slashTrailGroup);

  // Connected uniform-thickness jagged star collision explosion (random ray lengths, connected corners)
  const buildRandomStarPoints = (spikes: number, seedOffset: number, scale = 1): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    const total = spikes * 2;
    for (let i = 0; i < total; i++) {
      const h1 = Math.abs(Math.sin((i + 1 + seedOffset) * 12.9898) * 43758.5453) % 1;
      const h2 = Math.abs(Math.sin((i + 1 + seedOffset) * 78.233) * 19341.123) % 1;
      const ang = (i / total) * Math.PI * 2 + (h1 - 0.5) * 0.09;
      const r = (i % 2 === 0 ? 24 + h2 * 26 : 8 + h1 * 7) * scale;
      pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
    }
    return pts;
  };
  const hitAuraGroup = new THREE.Group();
  hitAuraGroup.visible = false;
  hitAuraGroup.renderOrder = 8;
  const hitStarPrimaryGeo = createClosedLoopTubeGeometry(
    buildRandomStarPoints(11, charId.length * 7 + 3, 1.0),
    comicLineR
  );
  const hitStarSecondaryGeo = createClosedLoopTubeGeometry(
    buildRandomStarPoints(9, charId.length * 13 + 11, 0.68),
    comicLineR
  );
  disposables.push(hitStarPrimaryGeo, hitStarSecondaryGeo);
  hitAuraGroup.add(new THREE.Mesh(hitStarPrimaryGeo, hitAuraMat));

  const hitOuterBurstGroup = new THREE.Group();
  const outerStar = new THREE.Mesh(hitStarSecondaryGeo, hitAuraMat);
  outerStar.position.z = 1;
  hitOuterBurstGroup.add(outerStar);
  hitAuraGroup.add(hitOuterBurstGroup);
  hitAuraGroup.position.set(0, torsoLen * 0.65, 18);
  hips.add(hitAuraGroup);

  // Comic-book parallel barrier lines when blocking
  const guardShieldGroup = new THREE.Group();
  guardShieldGroup.visible = false;
  const guardSpecs = [
    { r: 42, a0: -Math.PI * 0.24, a1: Math.PI * 0.24, z: -6 },
    { r: 48, a0: -Math.PI * 0.34, a1: Math.PI * 0.34, z: 0 },
    { r: 54, a0: -Math.PI * 0.28, a1: Math.PI * 0.28, z: 6 },
    { r: 60, a0: -Math.PI * 0.16, a1: Math.PI * 0.16, z: 3 },
  ];
  for (const gSpec of guardSpecs) {
    const gArc = createUniformArcLineGroup(
      gSpec.r * scaleH,
      comicLineR,
      gSpec.a0,
      gSpec.a1,
      guardShieldMat,
      disposables,
      18,
      2.0
    );
    gArc.position.set(14 * scaleH, 14 * scaleH, gSpec.z);
    guardShieldGroup.add(gArc);
  }
  hips.add(guardShieldGroup);

  return {
    charId,
    root,
    bodyPivot,
    hips,
    torso,
    head,
    leftUpperArm: frontArm.upperArm,
    leftElbow: frontArm.elbow,
    rightUpperArm: backArm.upperArm,
    rightElbow: backArm.elbow,
    leftUpperLeg: frontLeg.upperLeg,
    leftKnee: frontLeg.knee,
    leftFoot: frontLeg.foot,
    rightUpperLeg: backLeg.upperLeg,
    rightKnee: backLeg.knee,
    rightFoot: backLeg.foot,
    slashTrailGroup,
    hitAuraGroup,
    guardShieldGroup,
    backpackOnBack,
    blushGroup,
    faceMaskGroup,
    faceMaskMat,
    faceMaskSrc: FACE_MASK_PATHS[charId],
    eyesNormalGroup,
    eyesHitGroup,
    browsGroup,
    smileMouth,
    shoutMouth,
    serbetGroup,
    sapuGroup,
    bukuGroup,
    kelerengPouchGroup,
    tasWeaponGroup,
    bellyWindGroup,
    slashMat: mats.slashAccent,
    slashCoreMat,
    hitOuterBurstGroup,
    hitAuraMat,
    guardShieldMat,
    smoothedPose: null,
    lastUpdateStamp: -1,
    materialsToUpdate: mats.uniforms,
    disposables,
  };
}

function dampPoseAngles(current: PoseAngles, target: PoseAngles, lambda: number, dt: number): PoseAngles {
  return {
    torsoLean: damp(current.torsoLean, target.torsoLean, lambda, dt),
    torsoTwist: damp(current.torsoTwist, target.torsoTwist, lambda, dt),
    hipDrop: damp(current.hipDrop, target.hipDrop, lambda, dt),
    hipSway: damp(current.hipSway, target.hipSway, lambda, dt),
    headNod: damp(current.headNod, target.headNod, lambda, dt),
    armFrontUpper: damp(current.armFrontUpper, target.armFrontUpper, lambda, dt),
    armFrontFore: damp(current.armFrontFore, target.armFrontFore, lambda, dt),
    armBackUpper: damp(current.armBackUpper, target.armBackUpper, lambda, dt),
    armBackFore: damp(current.armBackFore, target.armBackFore, lambda, dt),
    legFrontUpper: damp(current.legFrontUpper, target.legFrontUpper, lambda, dt),
    legFrontLower: damp(current.legFrontLower, target.legFrontLower, lambda, dt),
    legBackUpper: damp(current.legBackUpper, target.legBackUpper, lambda, dt),
    legBackLower: damp(current.legBackLower, target.legBackLower, lambda, dt),
    footFront: damp(current.footFront, target.footFront, lambda, dt),
    footBack: damp(current.footBack, target.footBack, lambda, dt),
    bodyTilt: damp(current.bodyTilt, target.bodyTilt, lambda, dt),
    bodyLift: damp(current.bodyLift, target.bodyLift, lambda, dt),
    bodyYaw: damp(current.bodyYaw, target.bodyYaw, lambda, dt),
    weaponReach: damp(current.weaponReach, target.weaponReach, lambda, dt),
    weaponAngle: damp(current.weaponAngle, target.weaponAngle, lambda, dt),
  };
}

function setFighterJointPose(
  rig: DoodleFighterRig,
  pose: PoseAngles,
  overrideTwist?: number
): void {
  const scaleH = CHARACTERS[rig.charId].visual.heightScale;
  const baseHipY = 76 * scaleH;

  rig.hips.position.y = Math.max(16, baseHipY - pose.hipDrop * scaleH);
  rig.hips.position.z = pose.hipSway * 24 * scaleH;
  rig.bodyPivot.position.y = pose.bodyLift * scaleH;
  rig.bodyPivot.rotation.z = -pose.bodyTilt;

  const twist = overrideTwist !== undefined ? overrideTwist : pose.torsoTwist;
  rig.torso.rotation.z = -pose.torsoLean;
  rig.torso.rotation.y = twist;
  rig.torso.rotation.x = pose.hipSway * 0.65;

  rig.leftUpperArm.rotation.z = pose.armFrontUpper;
  rig.leftElbow.rotation.z = pose.armFrontFore;

  rig.rightUpperArm.rotation.z = pose.armBackUpper;
  rig.rightElbow.rotation.z = pose.armBackFore;

  rig.leftUpperLeg.rotation.z = pose.legFrontUpper;
  rig.leftKnee.rotation.z = pose.legFrontLower;
  rig.leftFoot.rotation.z = pose.footFront;

  rig.rightUpperLeg.rotation.z = pose.legBackUpper;
  rig.rightKnee.rotation.z = pose.legBackLower;
  rig.rightFoot.rotation.z = pose.footBack;
}

export function setFighterRigFaceSource(
  rig: DoodleFighterRig,
  customFaceUrl?: string | null
): void {
  const targetSrc =
    typeof customFaceUrl === 'string' && customFaceUrl.startsWith('data:image/')
      ? customFaceUrl
      : FACE_MASK_PATHS[rig.charId];
  if (rig.faceMaskSrc === targetSrc) return;
  const nextTex = getFaceMaskTextureForSource(rig.charId, customFaceUrl);
  if (nextTex) {
    rig.faceMaskMat.map = nextTex;
    rig.faceMaskMat.needsUpdate = true;
    rig.faceMaskSrc = targetSrc;
  }
}

export function updateDoodleFighterRig(
  rig: DoodleFighterRig,
  f: FighterRuntime,
  elapsedTime: number,
  overrideYaw?: number,
  faceMaskEnabled = false,
  customFaceUrl?: string | null
): void {
  if (faceMaskEnabled) {
    setFighterRigFaceSource(rig, customFaceUrl);
  }
  const targetPose = computeFighterPose(f);
  let pose = targetPose;
  if (rig.smoothedPose && rig.lastUpdateStamp >= 0 && elapsedTime >= rig.lastUpdateStamp) {
    const dt = Math.min(0.05, Math.max(0.001, elapsedTime - rig.lastUpdateStamp));
    const isSnappy =
      f.state === 'attack' ||
      f.state === 'hitstun' ||
      f.state === 'knockdown' ||
      f.state === 'ko' ||
      f.state === 'victory';
    const lambda = isSnappy ? 28 : 16;
    pose = dampPoseAngles(rig.smoothedPose, targetPose, lambda, dt);
  }
  rig.smoothedPose = { ...pose };
  rig.lastUpdateStamp = elapsedTime;

  rig.root.position.set(f.x, f.y, -f.z);

  if (overrideYaw !== undefined) {
    rig.bodyPivot.rotation.y = overrideYaw + pose.bodyYaw;
    setFighterJointPose(rig, pose, 0);
  } else {
    const targetYaw = f.facing >= 0 ? -0.22 : Math.PI + 0.22;
    rig.bodyPivot.rotation.y = targetYaw + pose.bodyYaw;
    setFighterJointPose(rig, pose);
  }

  rig.bodyPivot.scale.set(f.squashX, f.squashY, 1);

  const stepTick = Math.floor(elapsedTime * 7.5);
  for (const u of rig.materialsToUpdate) {
    u.uStepTime.value = stepTick + f.slot * 19.0;
  }

  const isHurt =
    f.state === 'hitstun' ||
    f.state === 'knockdown' ||
    f.state === 'ko' ||
    f.state === 'burnout' ||
    f.state === 'tantrum';
  const isAttack = f.state === 'attack';
  const isVictory = f.state === 'victory';
  const isOmelanAngry = f.charId === 'tika' && f.omelanMeter >= 30;
  const maskTex = rig.faceMaskMat.map;
  const maskReady = Boolean(
    faceMaskEnabled && maskTex && maskTex.image && (maskTex.image as { width?: number }).width
  );
  rig.faceMaskGroup.visible = maskReady;
  if (rig.blushGroup) {
    rig.blushGroup.visible = !maskReady;
  }
  rig.eyesNormalGroup.visible = !maskReady && !isHurt;
  rig.eyesHitGroup.visible = !maskReady && isHurt;
  rig.browsGroup.visible =
    !maskReady && !isHurt && (isAttack || isVictory || isOmelanAngry || f.state === 'counter_stance');
  rig.smileMouth.visible = !maskReady && !isHurt && !isAttack && f.coughTimer <= 0;
  rig.shoutMouth.visible = !maskReady && (isHurt || isAttack || f.coughTimer > 0);

  if (isVictory) {
    if (f.charId === 'adnan') {
      rig.head.rotation.set(0, 0, Math.sin(elapsedTime * 2.7) * 0.08 + 0.06);
    } else if (f.charId === 'tika') {
      rig.head.rotation.set(0, Math.sin(elapsedTime * 2.8) * 0.16, Math.sin(elapsedTime * 4.2) * 0.08);
    } else if (f.charId === 'dhira') {
      rig.head.rotation.set(0, 0, Math.sin(elapsedTime * 6.6) * 0.12);
    } else {
      rig.head.rotation.set(0, Math.sin(elapsedTime * 6.4) * 0.18, Math.sin(elapsedTime * 9.5) * 0.14);
    }
  } else {
    rig.head.rotation.set(0, 0, pose.headNod);
  }

  rig.hitAuraGroup.visible = f.hitFlashTimer > 0;
  if (rig.hitAuraGroup.visible) {
    const flashProg = 1 - Math.min(1, f.hitFlashTimer / 0.14);
    rig.hitAuraGroup.rotation.z = elapsedTime * 10;
    rig.hitOuterBurstGroup.rotation.z = -elapsedTime * 14;
    rig.hitAuraMat.opacity = Math.max(0.22, 0.95 * (1 - flashProg * 0.55));
  }

  const showGuardBarrier = f.state === 'block' || f.state === 'counter_stance' || f.magerArmorHits > 0;
  rig.guardShieldGroup.visible = showGuardBarrier;
  if (rig.guardShieldGroup.visible) {
    rig.guardShieldMat.opacity =
      f.state === 'counter_stance'
        ? 0.85 + Math.sin(elapsedTime * 24) * 0.14
        : f.magerArmorHits > 0 && f.state !== 'block'
          ? 0.36 + Math.sin(elapsedTime * 6) * 0.12
          : 0.72 + Math.sin(elapsedTime * 16) * 0.18;
  }

  const usingTas = isAttack && f.currentMove?.weapon === 'tas';
  if (rig.backpackOnBack) {
    rig.backpackOnBack.visible = !usingTas;
  }

  const m = f.currentMove;
  const activeAttack = Boolean(
    isAttack && m && f.moveTimer >= m.startup * 0.7 && f.moveTimer <= m.startup + m.active + 0.09
  );

  const adnanHoldingSapu =
    f.charId === 'adnan' && (f.state === 'block' || f.state === 'crouch' || f.magerArmorHits > 0);
  rig.sapuGroup.visible =
    Boolean(isAttack && m?.weapon === 'sapu_kelut') ||
    Boolean(isVictory && f.charId === 'adnan') ||
    adnanHoldingSapu;
  if (rig.sapuGroup.visible) {
    if (isVictory && f.charId === 'adnan') {
      rig.sapuGroup.rotation.z = pose.weaponAngle;
    } else if (m && isAttack) {
      rig.sapuGroup.rotation.z = m.id === 'super' ? Math.sin(f.animTime * 34) * 1.1 : pose.weaponAngle;
    } else if (f.state === 'block') {
      rig.sapuGroup.rotation.z = -0.68;
    } else if (f.state === 'crouch') {
      rig.sapuGroup.rotation.z = 1.05;
    } else {
      rig.sapuGroup.rotation.z = 0.35;
    }
  }

  rig.serbetGroup.visible =
    Boolean(isAttack && m?.weapon === 'serbet') ||
    Boolean(f.charId === 'tika' && (f.state === 'block' || f.state === 'crouch'));
  if (rig.serbetGroup.visible) {
    if (m && isAttack) {
      const reach = m.id === 'super' ? 1.12 : m.id === 'sp_up_fwd' ? 0.55 : Math.max(0.25, pose.weaponReach);
      rig.serbetGroup.scale.set(reach, 1, 1);
      rig.serbetGroup.rotation.x = Math.sin(f.animTime * 28) * 0.55;
      rig.serbetGroup.rotation.z = m.id === 'sp_up_fwd' ? f.animTime * 20 : m.id === 'sp_down' ? -0.3 : 0;
    } else if (f.state === 'crouch') {
      rig.serbetGroup.scale.set(0.32, 1, 1);
      rig.serbetGroup.rotation.x = 0.1;
      rig.serbetGroup.rotation.z = -0.35;
    } else {
      rig.serbetGroup.scale.set(0.45, 1, 1);
      rig.serbetGroup.rotation.x = 0.2;
      rig.serbetGroup.rotation.z = 0.6;
    }
  }

  rig.bukuGroup.visible =
    Boolean(isAttack && m?.weapon === 'buku') ||
    Boolean(
      f.charId === 'dhira' &&
        (f.state === 'block' ||
          f.state === 'counter_stance' ||
          f.state === 'idle' ||
          f.state === 'walk_fwd' ||
          f.state === 'walk_back')
    );
  if (rig.bukuGroup.visible) {
    const hugging = f.state === 'idle' || f.state === 'walk_fwd' || f.state === 'walk_back';
    rig.bukuGroup.position.set(0, 0, hugging ? 8 : 0);
    rig.bukuGroup.rotation.z = f.state === 'block' ? 0.32 : f.state === 'counter_stance' ? -0.25 : 0.12;
    rig.bukuGroup.scale.setScalar(f.state === 'block' ? 1.2 : hugging ? 0.92 : 1);
  }

  rig.kelerengPouchGroup.visible =
    Boolean(isAttack && (m?.weapon === 'kelereng_pouch' || m?.weapon === 'kelereng')) ||
    Boolean(f.charId === 'iyen' && f.state === 'crouch');
  if (rig.kelerengPouchGroup.visible) {
    rig.kelerengPouchGroup.rotation.z =
      f.state === 'crouch' ? Math.sin(f.animTime * 6) * 0.12 : Math.sin(f.animTime * 18) * 0.25;
  }

  rig.tasWeaponGroup.visible = usingTas;
  rig.bellyWindGroup.visible = Boolean(isAttack && m?.weapon === 'belly');
  if (rig.bellyWindGroup.visible) {
    rig.bellyWindGroup.position.x = Math.sin(f.animTime * 32) * 5;
  }

  rig.slashTrailGroup.visible = activeAttack;
  if (activeAttack && m) {
    const scaleH = CHARACTERS[rig.charId].visual.heightScale;
    const isKick = m.id.startsWith('k') || m.id === 'crouch_k' || m.id === 'air_k';
    const winStart = m.startup * 0.7;
    const winLen = Math.max(0.05, m.active + m.startup * 0.3 + 0.09);
    const arcProg = Math.max(0, Math.min(1, (f.moveTimer - winStart) / winLen));
    const fade = Math.sin(arcProg * Math.PI);

    rig.slashMat.opacity = 0.25 + fade * 0.7;
    rig.slashCoreMat.opacity = 0.18 + fade * 0.6;
    rig.slashTrailGroup.scale.setScalar(1);
    rig.slashTrailGroup.position.set(
      (isKick ? 32 : 28) * scaleH,
      (isKick ? 68 : 104) * scaleH,
      12
    );
    rig.slashTrailGroup.rotation.z =
      (isKick ? -0.28 : m.id === 'p4' || m.id === 'sp_up_fwd' ? 0.28 : 0.05) + (arcProg - 0.5) * 0.38;
  }
}

export function createDisplayFighterRuntime(
  slot: 1 | 2,
  charId: CharacterId,
  overrides: Partial<FighterRuntime> = {}
): FighterRuntime {
  const maxHp = CHARACTERS[charId].maxHp;
  return {
    slot,
    charId,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    facing: slot === 1 ? 1 : -1,
    hp: maxHp,
    trailHp: maxHp,
    maxHp,
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
    ...overrides,
  };
}

export function disposeDoodleFighterRig(rig: DoodleFighterRig): void {
  for (const d of rig.disposables) {
    d.dispose();
  }
}
