import * as THREE from 'three';
import { CHARACTERS } from './characters';
import { ARENA_HALF_WIDTH } from './math3d';
import {
  buildDoodleFighterRig,
  CHARACTER_COLOR_THEMES,
  createClosedLoopTubeGeometry,
  createDisplayFighterRuntime,
  disposeDoodleFighterRig,
  DOODLE_INK_HEX,
  DOODLE_PAPER_HEX,
  DoodleFighterRig,
  preloadAllFaceMaskTextures,
  updateClosedLoopTubeGeometry,
  updateDoodleFighterRig,
  VFX_LINE_RADIUS,
} from './threeCharacters';
import {
  CatNpcState,
  createCatNpcState,
  getParkSwingSeatPos,
  resetCatNpcForStage,
  stepCatNpc,
} from './catNpc';
import { buildDoodleCatRig, disposeDoodleCatRig, DoodleCatRig, updateDoodleCatRig } from './threeCat';
import { CharacterId, MatchState, StageId } from './types';

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function scheduleAfterSoftwareDraw(
  renderer: THREE.WebGLRenderer,
  cb: () => void,
  registerTimer: (id: number) => void
): void {
  try {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      registerTimer(window.setTimeout(cb, 80));
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (!sync) {
        registerTimer(window.setTimeout(cb, 80));
        return;
      }
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        registerTimer(window.setTimeout(poll, 5));
      } else {
        gl.deleteSync(sync);
        registerTimer(window.setTimeout(cb, 80));
      }
    };
    registerTimer(window.setTimeout(poll, 5));
  } catch {
    registerTimer(window.setTimeout(cb, 80));
  }
}

function addWireBox(
  parent: THREE.Object3D,
  x: number,
  y: number,
  zGame: number,
  bw: number,
  bh: number,
  bd: number,
  fillMat: THREE.Material,
  edgeMat: THREE.LineBasicMaterial,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const grp = new THREE.Group();
  grp.position.set(x, y, -zGame);
  const geo = new THREE.BoxGeometry(bw, bh, bd);
  const mesh = new THREE.Mesh(geo, fillMat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const edges = new THREE.EdgesGeometry(geo);
  const lines = new THREE.LineSegments(edges, edgeMat);
  grp.add(mesh, lines);
  parent.add(grp);
  disposables.push(geo, edges);
  return grp;
}

function addLineSegments(
  parent: THREE.Object3D,
  pts: number[],
  mat: THREE.LineBasicMaterial,
  disposables: Array<{ dispose: () => void }>
): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const seg = new THREE.LineSegments(geo, mat);
  parent.add(seg);
  disposables.push(geo);
  return seg;
}

function createComicLineGeo(length: number, radius: number, axis: 'x' | 'y' = 'y'): THREE.BufferGeometry {
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.4, length - radius * 2), 6, 10);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  return geo;
}

type MonumentGlyph = 'A' | 'D' | 'N' | 'F' | 'M' | 'I' | 'L' | 'Y' | 'K' | 'O' | 'T' | 'E' | 'R' | 'G' | 'H';

function createMonumentGlyphShape(ch: MonumentGlyph, h: number): { shape: THREE.Shape; width: number } {
  const s = (x: number, y: number): [number, number] => [x * h, y * h];
  const shape = new THREE.Shape();
  const poly = (pts: Array<[number, number]>, target: THREE.Path) => {
    target.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) target.lineTo(pts[i][0], pts[i][1]);
    target.closePath();
  };

  let w = 0.9;
  switch (ch) {
    case 'I': {
      w = 0.36;
      poly([s(0, 0), s(0.36, 0), s(0.36, 1), s(0, 1)], shape);
      break;
    }
    case 'L': {
      w = 0.78;
      poly([s(0, 0), s(0.78, 0), s(0.78, 0.28), s(0.32, 0.28), s(0.32, 1), s(0, 1)], shape);
      break;
    }
    case 'F': {
      w = 0.8;
      poly(
        [
          s(0, 0),
          s(0.32, 0),
          s(0.32, 0.38),
          s(0.7, 0.38),
          s(0.7, 0.62),
          s(0.32, 0.62),
          s(0.32, 0.74),
          s(0.8, 0.74),
          s(0.8, 1),
          s(0, 1),
        ],
        shape
      );
      break;
    }
    case 'N': {
      w = 0.92;
      poly(
        [
          s(0, 0),
          s(0.28, 0),
          s(0.28, 0.5),
          s(0.64, 0),
          s(0.92, 0),
          s(0.92, 1),
          s(0.64, 1),
          s(0.64, 0.5),
          s(0.28, 1),
          s(0, 1),
        ],
        shape
      );
      break;
    }
    case 'M': {
      w = 1.08;
      poly(
        [
          s(0, 0),
          s(0.28, 0),
          s(0.28, 0.52),
          s(0.46, 0.2),
          s(0.62, 0.2),
          s(0.8, 0.52),
          s(0.8, 0),
          s(1.08, 0),
          s(1.08, 1),
          s(0.78, 1),
          s(0.54, 0.52),
          s(0.3, 1),
          s(0, 1),
        ],
        shape
      );
      break;
    }
    case 'Y': {
      w = 0.9;
      poly(
        [
          s(0.29, 0),
          s(0.61, 0),
          s(0.61, 0.42),
          s(0.9, 1),
          s(0.58, 1),
          s(0.45, 0.64),
          s(0.32, 1),
          s(0, 1),
          s(0.29, 0.42),
        ],
        shape
      );
      break;
    }
    case 'A': {
      w = 0.96;
      poly(
        [
          s(0, 0),
          s(0.28, 0),
          s(0.33, 0.23),
          s(0.63, 0.23),
          s(0.68, 0),
          s(0.96, 0),
          s(0.67, 1),
          s(0.29, 1),
        ],
        shape
      );
      const hole = new THREE.Path();
      poly([s(0.36, 0.43), s(0.42, 0.78), s(0.54, 0.78), s(0.6, 0.43)], hole);
      shape.holes.push(hole);
      break;
    }
    case 'D': {
      w = 0.9;
      poly(
        [s(0, 0), s(0.72, 0), s(0.9, 0.2), s(0.9, 0.8), s(0.72, 1), s(0, 1)],
        shape
      );
      const hole = new THREE.Path();
      poly(
        [s(0.3, 0.23), s(0.3, 0.77), s(0.55, 0.77), s(0.62, 0.69), s(0.62, 0.31), s(0.55, 0.23)],
        hole
      );
      shape.holes.push(hole);
      break;
    }
    case 'T': {
      w = 0.86;
      poly(
        [
          s(0.28, 0),
          s(0.58, 0),
          s(0.58, 0.74),
          s(0.86, 0.74),
          s(0.86, 1),
          s(0, 1),
          s(0, 0.74),
          s(0.28, 0.74),
        ],
        shape
      );
      break;
    }
    case 'E': {
      w = 0.82;
      poly(
        [
          s(0, 0),
          s(0.82, 0),
          s(0.82, 0.24),
          s(0.3, 0.24),
          s(0.3, 0.39),
          s(0.72, 0.39),
          s(0.72, 0.61),
          s(0.3, 0.61),
          s(0.3, 0.76),
          s(0.82, 0.76),
          s(0.82, 1),
          s(0, 1),
        ],
        shape
      );
      break;
    }
    case 'O': {
      w = 0.94;
      poly(
        [
          s(0.18, 0),
          s(0.76, 0),
          s(0.94, 0.2),
          s(0.94, 0.8),
          s(0.76, 1),
          s(0.18, 1),
          s(0, 0.8),
          s(0, 0.2),
        ],
        shape
      );
      const hole = new THREE.Path();
      poly([s(0.3, 0.25), s(0.3, 0.75), s(0.64, 0.75), s(0.64, 0.25)], hole);
      shape.holes.push(hole);
      break;
    }
    case 'K': {
      w = 0.9;
      poly(
        [
          s(0, 0),
          s(0.3, 0),
          s(0.3, 0.38),
          s(0.58, 0),
          s(0.9, 0),
          s(0.54, 0.5),
          s(0.9, 1),
          s(0.58, 1),
          s(0.3, 0.6),
          s(0.3, 1),
          s(0, 1),
        ],
        shape
      );
      break;
    }
    case 'R': {
      w = 0.9;
      poly(
        [
          s(0, 0),
          s(0.3, 0),
          s(0.3, 0.38),
          s(0.46, 0.38),
          s(0.62, 0),
          s(0.92, 0),
          s(0.72, 0.43),
          s(0.88, 0.56),
          s(0.88, 0.82),
          s(0.72, 1),
          s(0, 1),
        ],
        shape
      );
      const hole = new THREE.Path();
      poly(
        [s(0.3, 0.58), s(0.3, 0.78), s(0.58, 0.78), s(0.62, 0.68), s(0.58, 0.58)],
        hole
      );
      shape.holes.push(hole);
      break;
    }
    case 'H': {
      w = 0.92;
      poly(
        [
          s(0, 0),
          s(0.3, 0),
          s(0.3, 0.38),
          s(0.62, 0.38),
          s(0.62, 0),
          s(0.92, 0),
          s(0.92, 1),
          s(0.62, 1),
          s(0.62, 0.62),
          s(0.3, 0.62),
          s(0.3, 1),
          s(0, 1),
        ],
        shape
      );
      break;
    }
    case 'G': {
      w = 0.94;
      poly(
        [
          s(0.18, 0),
          s(0.76, 0),
          s(0.94, 0.18),
          s(0.94, 0.56),
          s(0.48, 0.56),
          s(0.48, 0.35),
          s(0.66, 0.35),
          s(0.66, 0.24),
          s(0.3, 0.24),
          s(0.3, 0.76),
          s(0.66, 0.76),
          s(0.66, 0.72),
          s(0.94, 0.72),
          s(0.94, 0.82),
          s(0.76, 1),
          s(0.18, 1),
          s(0, 0.82),
          s(0, 0.18),
        ],
        shape
      );
      break;
    }
  }
  return { shape, width: w * h };
}

function buildExtrudedSign3D(
  parent: THREE.Object3D,
  text: string,
  x: number,
  yPos: number,
  zGame: number,
  letterH: number,
  letterGap: number,
  spaceW: number,
  letterDepth: number,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const signGroup = new THREE.Group();
  signGroup.position.set(x, yPos, -zGame);
  signGroup.userData.baseY = yPos;

  const frontFaceMat = new THREE.MeshBasicMaterial({
    color: DOODLE_PAPER_HEX,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const sideSolidMat = new THREE.MeshBasicMaterial({
    color: DOODLE_PAPER_HEX,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const sharpEdgeMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  disposables.push(frontFaceMat, sideSolidMat, sharpEdgeMat);

  const glyphEntries: Array<{ ch: MonumentGlyph | ' '; width: number; shape?: THREE.Shape }> = [];
  let totalW = 0;
  for (let i = 0; i < text.length; i++) {
    const raw = text[i];
    if (raw === ' ') {
      glyphEntries.push({ ch: ' ', width: spaceW });
      totalW += spaceW;
    } else {
      const g = createMonumentGlyphShape(raw as MonumentGlyph, letterH);
      glyphEntries.push({ ch: raw as MonumentGlyph, width: g.width, shape: g.shape });
      totalW += g.width;
    }
    if (i < text.length - 1) totalW += letterGap;
  }

  let cursorX = -totalW * 0.5;

  for (const entry of glyphEntries) {
    if (entry.shape) {
      const extrudeGeo = new THREE.ExtrudeGeometry(entry.shape, {
        depth: letterDepth,
        bevelEnabled: false,
        curveSegments: 1,
      });
      // Extrude backward into -Z while front face rests cleanly at z = 0 (local) & bottom at y = 0
      extrudeGeo.translate(0, 0, -letterDepth);
      const edgesGeo = new THREE.EdgesGeometry(extrudeGeo, 15);
      const letterMesh = new THREE.Mesh(extrudeGeo, [frontFaceMat, sideSolidMat]);
      letterMesh.castShadow = false;
      letterMesh.receiveShadow = false;
      const letterEdges = new THREE.LineSegments(edgesGeo, sharpEdgeMat);
      letterMesh.position.set(cursorX, 0, 0);
      letterEdges.position.copy(letterMesh.position);
      signGroup.add(letterMesh, letterEdges);
      disposables.push(extrudeGeo, edgesGeo);
    }
    cursorX += entry.width + letterGap;
  }

  parent.add(signGroup);
  return signGroup;
}

/**
 * Thin jet-black cursive wire handwriting ("Welcome to") constructed from smooth 3D Catmull-Rom spline tubes.
 * Positioned centered & closer to the camera (+Z offset) above "FAMILY FIGHTER" so its lower loops
 * visually overlap the top edge of "FAMILY FIGHTER" from front view while preserving deep 3D Z separation.
 */
function buildWelcomeToWireScript3D(
  parent: THREE.Object3D,
  x: number,
  yLocal: number,
  zLocal: number,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const scriptGroup = new THREE.Group();
  scriptGroup.position.set(x, yLocal, zLocal);

  const wireMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const wireRadius = 1.05;
  const endCapGeo = new THREE.SphereGeometry(wireRadius, 6, 5);
  disposables.push(wireMat, endCapGeo);

  const scaleX = 27;
  const scaleY = 19.5;
  const centerX = 4.02; // midpoint of [0.00 .. 8.04]

  // Normalized cursive strokes for "Welcome to" (baseline y = 0, x-height = 0.94, ascenders = 1.78)
  const strokes: Array<{ pts: Array<[number, number]>; closed?: boolean; tubular?: number }> = [
    // Capital cursive 'W' with entry curl and top-right finish
    {
      pts: [
        [0.0, 1.28],
        [0.14, 1.58],
        [0.3, 1.48],
        [0.38, 0.72],
        [0.52, 0.04],
        [0.72, 0.22],
        [0.96, 1.22],
        [1.12, 0.48],
        [1.26, 0.04],
        [1.46, 0.24],
        [1.74, 1.5],
        [1.92, 1.58],
        [1.88, 1.4],
      ],
      tubular: 56,
    },
    // Continuous 'el' ligature
    {
      pts: [
        [1.82, 0.28],
        [2.16, 0.56],
        [2.24, 0.86],
        [2.06, 0.96],
        [1.84, 0.72],
        [1.84, 0.16],
        [2.1, 0.02],
        [2.42, 0.34],
        [2.72, 1.14],
        [2.8, 1.72],
        [2.66, 1.8],
        [2.48, 1.3],
        [2.48, 0.18],
        [2.7, 0.02],
        [2.98, 0.26],
      ],
      tubular: 64,
    },
    // Cursive 'c'
    {
      pts: [
        [3.4, 0.78],
        [3.22, 0.94],
        [2.98, 0.72],
        [2.98, 0.16],
        [3.22, 0.02],
        [3.54, 0.26],
      ],
      tubular: 28,
    },
    // Cursive 'o' + bridge toward 'm'
    {
      pts: [
        [4.0, 0.78],
        [3.8, 0.94],
        [3.56, 0.7],
        [3.56, 0.14],
        [3.8, 0.02],
        [4.04, 0.26],
        [4.02, 0.78],
        [4.24, 0.74],
      ],
      tubular: 36,
    },
    // Cursive 'm' stem 1
    {
      pts: [
        [4.24, 0.74],
        [4.32, 0.86],
        [4.32, 0.04],
      ],
      tubular: 16,
    },
    // Cursive 'm' arch 2
    {
      pts: [
        [4.32, 0.48],
        [4.48, 0.9],
        [4.68, 0.86],
        [4.7, 0.04],
      ],
      tubular: 20,
    },
    // Cursive 'm' arch 3 + exit into final 'e'
    {
      pts: [
        [4.7, 0.48],
        [4.86, 0.9],
        [5.06, 0.84],
        [5.1, 0.24],
        [5.24, 0.04],
        [5.44, 0.22],
      ],
      tubular: 26,
    },
    // Final 'e' of "Welcome" with gentle swoop out
    {
      pts: [
        [5.44, 0.22],
        [5.76, 0.54],
        [5.84, 0.84],
        [5.66, 0.94],
        [5.44, 0.7],
        [5.44, 0.14],
        [5.7, 0.02],
        [6.04, 0.2],
      ],
      tubular: 34,
    },
    // 't' stem
    {
      pts: [
        [6.76, 1.54],
        [6.72, 0.84],
        [6.7, 0.16],
        [6.88, 0.02],
        [7.18, 0.26],
      ],
      tubular: 26,
    },
    // 't' flowing crossbar
    {
      pts: [
        [6.44, 1.04],
        [6.78, 1.12],
        [7.16, 1.06],
      ],
      tubular: 16,
    },
    // 'o' of "to" (closed loop)
    {
      pts: [
        [7.18, 0.26],
        [7.24, 0.76],
        [7.46, 0.94],
        [7.68, 0.68],
        [7.64, 0.14],
        [7.4, 0.02],
      ],
      closed: true,
      tubular: 30,
    },
    // Finishing cursive wire flick on 'o'
    {
      pts: [
        [7.66, 0.64],
        [7.86, 0.56],
        [8.04, 0.72],
      ],
      tubular: 14,
    },
  ];

  for (const stroke of strokes) {
    const vecs = stroke.pts.map(([px, py]) => {
      // Slight italic shear (+0.11 * py) gives graceful handwriting slant
      const vx = (px - centerX + py * 0.1) * scaleX;
      const vy = py * scaleY;
      return new THREE.Vector3(vx, vy, 0);
    });
    const curve = new THREE.CatmullRomCurve3(vecs, Boolean(stroke.closed), 'centripetal', 0.45);
    const tubeGeo = new THREE.TubeGeometry(curve, stroke.tubular || 28, wireRadius, 6, Boolean(stroke.closed));
    const mesh = new THREE.Mesh(tubeGeo, wireMat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    scriptGroup.add(mesh);
    disposables.push(tubeGeo);

    if (!stroke.closed && vecs.length >= 2) {
      const startCap = new THREE.Mesh(endCapGeo, wireMat);
      startCap.position.copy(vecs[0]);
      const endCap = new THREE.Mesh(endCapGeo, wireMat);
      endCap.position.copy(vecs[vecs.length - 1]);
      scriptGroup.add(startCap, endCap);
    }
  }

  parent.add(scriptGroup);
  return scriptGroup;
}

/**
 * Floating 3D monument asset reading two centered lines:
 * 1) "Welcome to" (smaller aesthetic black wireframe/thin-tube handwriting, forward in +Z)
 * 2) "FAMILY FIGHTER" (ultra-bold extruded pure white sans-serif with crisp black edges below it)
 * Front camera shows "Welcome to" lower curves slightly overlapping the top edge of "FAMILY FIGHTER",
 * while side/oblique angles reveal a clean 38-unit Z-depth gap with zero physical intersection.
 */
function buildAdnanFamilyMonument3D(
  parent: THREE.Object3D,
  zGame: number,
  disposables: Array<{ dispose: () => void }>,
  yPos = 252
): THREE.Group {
  const monumentRoot = new THREE.Group();
  monumentRoot.position.set(0, yPos, -zGame);
  monumentRoot.userData.baseY = yPos;

  // Bottom line centered at local (0, 0, 0), height = 42, depth = 34 into -Z
  buildExtrudedSign3D(monumentRoot, 'FAMILY FIGHTER', 0, 0, 0, 42, 5.5, 20, 34, disposables);
  // Top line centered at local (0, 26, +38): closer to camera (+Z) with slight vertical front-view overlap
  buildWelcomeToWireScript3D(monumentRoot, 0, 26, 38, disposables);

  parent.add(monumentRoot);
  return monumentRoot;
}

interface StageBuildResult {
  group: THREE.Group;
  monument?: THREE.Group;
  swingSeat?: THREE.Group;
  swingRopes?: THREE.LineSegments;
  disposables: Array<{ dispose: () => void }>;
}

/**
 * Architectural 3D replica of Monumen Simpang Lima Gumul (Kediri) in crisp monochrome sketchbook ink-on-paper style:
 * 4 corner stepped piers with lower & upper relief panels, hollow semicircular central & side vaulted arches,
 * double overhanging cornices, 16-window attic gallery, crenellated roof crown, guardian corner statues,
 * patterned pedestrian plaza approach, curbs, benches, bollards, and tropical palm perimeter.
 */
function buildSimpangLimaGumul3D(
  group: THREE.Group,
  paperFill: THREE.MeshBasicMaterial,
  tintFill: THREE.MeshBasicMaterial,
  inkLine: THREE.LineBasicMaterial,
  pushSeg: (x1: number, y1: number, z1Game: number, x2: number, y2: number, z2Game: number) => void,
  disposables: Array<{ dispose: () => void }>
): void {
  const darkTintFill = new THREE.MeshBasicMaterial({
    color: 0xdadada,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  disposables.push(darkTintFill);

  const zFront = -130;
  const zBack = 520;
  const floorMinX = -ARENA_HALF_WIDTH - 180;
  const floorMaxX = ARENA_HALF_WIDTH + 180;

  // 1. Patterned Plaza Floor (Pelataran Simpang Lima Gumul)
  for (let x = -640; x <= 640; x += 160) {
    pushSeg(x, 0, zFront, x, 0, zBack);
  }
  for (let z = zFront; z <= zBack; z += 90) {
    pushSeg(floorMinX, 0, z, floorMaxX, 0, z);
  }
  // Central ceremonial walkway strips & geometric stone bands leading into the main arch
  for (const wx of [-170, -110, -56, 56, 110, 170]) {
    pushSeg(wx, 0.2, zFront, wx, 0.2, 285);
  }
  for (let gz = -70; gz <= 265; gz += 56) {
    pushSeg(-170, 0.2, gz, -56, 0.2, gz);
    pushSeg(56, 0.2, gz, 170, 0.2, gz);
    pushSeg(-110, 0.2, gz + 28, -56, 0.2, gz + 28);
    pushSeg(56, 0.2, gz + 28, 110, 0.2, gz + 28);
  }

  // Low raised stone curbs separating the central plaza from park lawns left & right
  for (const side of [-1, 1] as const) {
    addWireBox(group, side * 265, 5, 165, 16, 10, 560, tintFill, inkLine, disposables);
    // Side park lawn walkway slabs
    addWireBox(group, side * 415, 11, 196, 98, 10, 34, paperFill, inkLine, disposables);
    addWireBox(group, side * 415, 22, 196, 104, 8, 38, tintFill, inkLine, disposables);
    pushSeg(side * 376, 0, 182, side * 376, 18, 182);
    pushSeg(side * 454, 0, 182, side * 454, 18, 182);

    // Plaza pedestrian bollards / bins flanking the approach
    addWireBox(group, side * 244, 15, 212, 22, 30, 22, darkTintFill, inkLine, disposables);
    addWireBox(group, side * 244, 31, 212, 26, 4, 26, paperFill, inkLine, disposables);
  }

  // Stylized Tropical Palms & Plaza Streetlamps on outer roundabout perimeter
  for (const side of [-1, 1] as const) {
    for (const [px, pz, ph] of [
      [side * 485, 310, 165],
      [side * 565, 385, 190],
    ] as const) {
      // Palm trunk
      pushSeg(px, 0, pz, px + side * 8, ph, pz);
      pushSeg(px + side * 6, 0, pz, px + side * 12, ph, pz);
      // Sweeping multi-ribbed tropical palm fronds
      for (let f = -3; f <= 3; f++) {
        const fx = px + side * 10 + f * 22;
        const fy = ph + 24 - Math.abs(f) * 5;
        const fz = pz + (f % 2) * 12;
        pushSeg(px + side * 10, ph, pz, fx, fy, fz);
        pushSeg(fx, fy, fz, fx + f * 12, fy - 24, fz + 6);
        pushSeg(px + side * 10 + f * 11, ph + 12, pz, fx + f * 7, fy - 14, fz + 4);
      }
    }
    // Slender curved roundabout light post
    const lx = side * 340;
    pushSeg(lx, 0, 255, lx, 150, 255);
    pushSeg(lx, 150, 255, lx - side * 28, 162, 255);
    addWireBox(group, lx - side * 32, 160, 255, 16, 6, 10, paperFill, inkLine, disposables);
  }

  // 2. Monumen Simpang Lima Gumul Kediri (Tall Proportional 4-Pier Triumphal Monument: H=355, Cornice W=342, Piers W=280)
  const monGroup = new THREE.Group();
  group.add(monGroup);

  const monCenterZ = 420; // front pier face at zGame = 326, rear pier face at zGame = 514
  const frontPierZ = 362;
  const rearPierZ = 478;

  // Four Tall Corner Piers with 3-tier Stepped Dark Plinth Bases + Vertical Shafts
  for (const sx of [-1, 1] as const) {
    const px = sx * 92; // Pier centers ±92, width 96 -> inner arch opening x = -44..+44 (88 wide), outer span ±140 (280 wide)
    for (const pz of [frontPierZ, rearPierZ]) {
      // Tier 1-3 Stepped Dark Plinth Base (y = 0..64, ~18% of total height)
      addWireBox(monGroup, px, 4, pz, 112, 8, 88, darkTintFill, inkLine, disposables);
      addWireBox(monGroup, px, 31, pz, 102, 46, 78, darkTintFill, inkLine, disposables);
      addWireBox(monGroup, px, 59, pz, 108, 10, 84, tintFill, inkLine, disposables);

      // Tall Main Pier Body (y = 64..192, ~36% of total height)
      addWireBox(monGroup, px, 128, pz, 96, 128, 72, paperFill, inkLine, disposables);

      // Vertical Corner Pilasters on each pier front
      addWireBox(monGroup, px - sx * 43, 128, pz - 37, 10, 124, 3, tintFill, inkLine, disposables);
      addWireBox(monGroup, px + sx * 43, 128, pz - 37, 10, 124, 3, tintFill, inkLine, disposables);

      // Pier Impost Cornice (arch springing band, y = 192..202)
      addWireBox(monGroup, px, 197, pz, 106, 10, 82, tintFill, inkLine, disposables);

      // Upper Pier Attic Spandrel Block (y = 202..252)
      addWireBox(monGroup, px, 227, pz, 96, 50, 72, paperFill, inkLine, disposables);
    }

    // Side Archway Span connecting front & rear piers (4-way Gumul vault!)
    const sideSpanShape = new THREE.Shape();
    sideSpanShape.moveTo(-22, 192);
    sideSpanShape.lineTo(22, 192);
    sideSpanShape.lineTo(22, 252);
    sideSpanShape.lineTo(-22, 252);
    sideSpanShape.closePath();
    const sideArchHole = new THREE.Path();
    sideArchHole.absarc(0, 192, 20, 0, Math.PI, false);
    sideArchHole.closePath();
    sideSpanShape.holes.push(sideArchHole);

    const sideArchGeo = new THREE.ExtrudeGeometry(sideSpanShape, {
      depth: 94,
      bevelEnabled: false,
      curveSegments: 16,
    });
    sideArchGeo.rotateY(Math.PI / 2);
    sideArchGeo.translate(px - 47, 0, -monCenterZ);
    const sideArchEdges = new THREE.EdgesGeometry(sideArchGeo, 20);
    const sideArchMesh = new THREE.Mesh(sideArchGeo, paperFill);
    const sideArchLines = new THREE.LineSegments(sideArchEdges, inkLine);
    monGroup.add(sideArchMesh, sideArchLines);
    disposables.push(sideArchGeo, sideArchEdges);

    // Outer Stepped Corner Wing & Guardian Statue ("Arca Penjaga") flanking the plinth
    const wingX = sx * 150;
    const wingZ = 330;
    addWireBox(monGroup, wingX, 27, wingZ, 30, 54, 30, darkTintFill, inkLine, disposables);
    addWireBox(monGroup, wingX, 56, wingZ, 34, 4, 34, tintFill, inkLine, disposables);
    // Guard Statue silhouette (pedestal + robe body + shoulder + head)
    addWireBox(monGroup, wingX, 63, wingZ, 15, 10, 15, tintFill, inkLine, disposables);
    addWireBox(monGroup, wingX, 77, wingZ, 11, 18, 10, paperFill, inkLine, disposables);
    addWireBox(monGroup, wingX, 90, wingZ, 7, 8, 7, paperFill, inkLine, disposables);
  }

  // Front Pier Relief Panels (Lower Square & Upper Horizontal Frieze Panels) + Projecting Stone Sills
  const reliefLines: number[] = [];
  for (const sx of [-1, 1] as const) {
    const px = sx * 92;
    const faceZ = frontPierZ - 36; // 326
    const rZ = -(faceZ - 3.5);

    // Lower Large Square Relief Panel (y = 84..166) + Projecting Cornice Sill
    addWireBox(monGroup, px, 125, faceZ - 1.5, 62, 78, 3, tintFill, inkLine, disposables);
    addWireBox(monGroup, px, 82, faceZ - 4, 70, 5, 9, darkTintFill, inkLine, disposables);

    // Bas-relief carving ink sketch inside square frame (figure, banner/whip arc, temple tier)
    reliefLines.push(
      px - 24, 92, rZ, px + 24, 92, rZ,
      px - 20, 92, rZ, px - 18, 122, rZ,
      px - 18, 122, rZ, px - 10, 136, rZ,
      px - 10, 136, rZ, px - 5, 118, rZ,
      px - 5, 118, rZ, px - 3, 92, rZ,
      px + 4, 92, rZ, px + 6, 128, rZ,
      px + 6, 128, rZ, px + 13, 150, rZ,
      px + 13, 150, rZ, px + 18, 126, rZ,
      px + 18, 126, rZ, px + 20, 92, rZ,
      px - 12, 142, rZ, px - 1, 156, rZ,
      px - 1, 156, rZ, px + 10, 152, rZ,
      px - 16, 108, rZ, px + 16, 112, rZ
    );

    // Upper Wide Horizontal Frieze Relief Panel (y = 216..244) + Projecting Sill
    addWireBox(monGroup, px, 230, faceZ - 1.5, 70, 26, 3, tintFill, inkLine, disposables);
    addWireBox(monGroup, px, 214, faceZ - 4, 76, 4.5, 8, darkTintFill, inkLine, disposables);

    // Stylized frieze procession relief figures & cloud curls
    reliefLines.push(
      px - 28, 220, rZ, px + 28, 220, rZ,
      px - 24, 220, rZ, px - 18, 236, rZ,
      px - 18, 236, rZ, px - 11, 225, rZ,
      px - 7, 220, rZ, px, 239, rZ,
      px, 239, rZ, px + 7, 225, rZ,
      px + 10, 220, rZ, px + 17, 238, rZ,
      px + 17, 238, rZ, px + 25, 227, rZ,
      px - 20, 238, rZ, px + 18, 239, rZ
    );

    // Side-wall Relief Panel on outer flank
    addWireBox(monGroup, sx * 141, 125, frontPierZ, 3, 74, 44, tintFill, inkLine, disposables);
    addWireBox(monGroup, sx * 143, 84, frontPierZ, 7, 5, 50, darkTintFill, inkLine, disposables);
  }
  addLineSegments(monGroup, reliefLines, inkLine, disposables);

  // Tall Soaring Semicircular Central Vaulted Archway (spanning x = -44..+44, springing at y = 192, crown y = 236)
  const archSpringY = 192;
  const archRadius = 44;
  const archSpanShape = new THREE.Shape();
  archSpanShape.moveTo(-44, archSpringY);
  archSpanShape.lineTo(44, archSpringY);
  archSpanShape.lineTo(44, 252);
  archSpanShape.lineTo(-44, 252);
  archSpanShape.closePath();

  const mainArchHole = new THREE.Path();
  mainArchHole.absarc(0, archSpringY, archRadius, 0, Math.PI, false);
  mainArchHole.closePath();
  archSpanShape.holes.push(mainArchHole);

  const archDepth = 188; // spans from front face (zGame 326) to rear face (zGame 514)
  const mainArchGeo = new THREE.ExtrudeGeometry(archSpanShape, {
    depth: archDepth,
    bevelEnabled: false,
    curveSegments: 24,
  });
  mainArchGeo.translate(0, 0, -326 - archDepth);
  const mainArchEdges = new THREE.EdgesGeometry(mainArchGeo, 18);
  const mainArchMesh = new THREE.Mesh(mainArchGeo, paperFill);
  const mainArchLines = new THREE.LineSegments(mainArchEdges, inkLine);
  monGroup.add(mainArchMesh, mainArchLines);
  disposables.push(mainArchGeo, mainArchEdges);

  // Arch Intrados Moulding Ring & Vaulted Rib Detail lines inside the tunnel
  const archSegs: number[] = [];
  const arcSteps = 20;
  for (let i = 0; i < arcSteps; i++) {
    const a1 = (i / arcSteps) * Math.PI;
    const a2 = ((i + 1) / arcSteps) * Math.PI;
    const x1 = Math.cos(a1) * (archRadius + 4);
    const y1 = archSpringY + Math.sin(a1) * (archRadius + 4);
    const x2 = Math.cos(a2) * (archRadius + 4);
    const y2 = archSpringY + Math.sin(a2) * (archRadius + 4);
    archSegs.push(x1, y1, -325, x2, y2, -325);

    // Inner vaulted ceiling rib arcs inside tunnel
    for (const ribZ of [-370, -420, -470]) {
      const rx1 = Math.cos(a1) * archRadius;
      const ry1 = archSpringY + Math.sin(a1) * archRadius;
      const rx2 = Math.cos(a2) * archRadius;
      const ry2 = archSpringY + Math.sin(a2) * archRadius;
      archSegs.push(rx1, ry1, ribZ, rx2, ry2, ribZ);
    }
  }
  addLineSegments(monGroup, archSegs, inkLine, disposables);

  // 3. Double Overhanging Cantilevered Cornice (y = 252..292)
  addWireBox(monGroup, 0, 259, monCenterZ, 306, 14, 210, darkTintFill, inkLine, disposables);
  addWireBox(monGroup, 0, 273, monCenterZ, 336, 14, 236, paperFill, inkLine, disposables);
  addWireBox(monGroup, 0, 286, monCenterZ, 352, 12, 250, tintFill, inkLine, disposables);

  // 4. Attica Gallery Row with 16 Tall Vertical Niche Windows (y = 292..334)
  addWireBox(monGroup, 0, 313, monCenterZ, 304, 42, 206, paperFill, inkLine, disposables);
  const frontWinZ = monCenterZ - 103.5; // front attic wall face
  for (let i = 0; i < 16; i++) {
    const wx = -131 + i * 17.46;
    addWireBox(monGroup, wx, 312.5, frontWinZ, 8, 27, 2.5, darkTintFill, inkLine, disposables);
    const winSegs: number[] = [
      wx - 5.2, 297.5, -(frontWinZ - 1), wx + 5.2, 297.5, -(frontWinZ - 1),
      wx - 5.2, 327.5, -(frontWinZ - 1), wx + 5.2, 327.5, -(frontWinZ - 1),
    ];
    addLineSegments(monGroup, winSegs, inkLine, disposables);
  }
  // Matching vertical windows on left & right attic flanks
  for (const sx of [-1, 1] as const) {
    for (let j = 0; j < 10; j++) {
      const wz = monCenterZ - 81 + j * 18;
      addWireBox(monGroup, sx * 152.5, 312.5, wz, 2.5, 27, 8, darkTintFill, inkLine, disposables);
    }
  }

  // 5. Stepped Roof Crown & Crenellated Parapet Coping Blocks (y = 334..355)
  addWireBox(monGroup, 0, 338.5, monCenterZ, 330, 9, 230, tintFill, inkLine, disposables);
  addWireBox(monGroup, 0, 346.5, monCenterZ, 300, 7, 202, paperFill, inkLine, disposables);
  for (let c = 0; c < 10; c++) {
    const cx = -126 + c * 28;
    addWireBox(monGroup, cx, 352.5, monCenterZ - 95, 14, 5, 8, darkTintFill, inkLine, disposables);
  }
}

function createSketchbookAsphaltTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#6e6e6e';
    ctx.fillRect(0, 0, size, size);

    // Subtle deterministic asphalt aggregate & hand-inked stipple grain
    let seed = 133742;
    const nextRand = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let i = 0; i < 2400; i++) {
      const x = Math.floor(nextRand() * size);
      const y = Math.floor(nextRand() * size);
      const shade = nextRand();
      ctx.fillStyle = shade < 0.36 ? '#545454' : shade < 0.72 ? '#7c7c7c' : '#8c8c8c';
      const w = nextRand() > 0.8 ? 2 : 1;
      ctx.fillRect(x, y, w, 1);
    }

    // Fine sketchbook asphalt cross-hatch micro-strokes
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 64; i++) {
      const x = nextRand() * size;
      const y = nextRand() * size;
      const len = 4 + nextRand() * 10;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (nextRand() - 0.5) * 2);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Architectural 3D replica of Jembatan Brawijaya Kota Kediri in crisp monochrome sketchbook ink-on-paper style:
 * 3D framed asphalt roadway with white-and-ink dashed centerlines, open center bridge portal
 * (middle railing & median removed so the asphalt road flows directly through the twin "PYLON UTAMA"
 * gate and continues behind the "KOTA KEDIRI" crossbeam), side wing guardrails, Y-shaped lamps,
 * Sungai Brantas piers & water ripples, and distant receding second portal silhouette.
 */
function buildJembatanBrawijaya3D(
  group: THREE.Group,
  paperFill: THREE.MeshBasicMaterial,
  tintFill: THREE.MeshBasicMaterial,
  inkLine: THREE.LineBasicMaterial,
  pushSeg: (x1: number, y1: number, z1Game: number, x2: number, y2: number, z2Game: number) => void,
  disposables: Array<{ dispose: () => void }>
): void {
  const darkTintFill = new THREE.MeshBasicMaterial({
    color: 0xdadada,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const asphaltSideMat = new THREE.MeshBasicMaterial({
    color: 0x525252,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const mainAsphaltTex = createSketchbookAsphaltTexture(11, 2.5);
  const bridgeAsphaltTex = createSketchbookAsphaltTexture(1.7, 2.9);
  const mainAsphaltMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: mainAsphaltTex,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const bridgeAsphaltMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: bridgeAsphaltTex,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const farLineMat = new THREE.LineBasicMaterial({ color: 0x666666 });
  disposables.push(
    darkTintFill,
    asphaltSideMat,
    mainAsphaltTex,
    bridgeAsphaltTex,
    mainAsphaltMat,
    bridgeAsphaltMat,
    farLineMat
  );

  // Open central corridor aligned cleanly inside twin pylons (pylonX = ±152, pedestal inner face = ±119)
  const gateOpenHalfW = 118;

  // 1A. Foreground 3D Asphalt Road Slab (x = -760..+760, zGame = -112..224, top at y = -0.25)
  const mainRoadW = 1520;
  const mainRoadD = 336;
  const mainRoadGeo = new THREE.BoxGeometry(mainRoadW, 10, mainRoadD);
  const mainRoadMats = [
    asphaltSideMat,
    asphaltSideMat,
    mainAsphaltMat,
    asphaltSideMat,
    asphaltSideMat,
    asphaltSideMat,
  ];
  const mainRoadMesh = new THREE.Mesh(mainRoadGeo, mainRoadMats);
  const mainRoadEdges = new THREE.EdgesGeometry(mainRoadGeo);
  const mainRoadLines = new THREE.LineSegments(mainRoadEdges, inkLine);
  mainRoadMesh.position.set(0, -5.25, -56);
  mainRoadLines.position.copy(mainRoadMesh.position);
  group.add(mainRoadMesh, mainRoadLines);
  disposables.push(mainRoadGeo, mainRoadEdges);

  // 1B. Continuous Through-Bridge 3D Asphalt Road Slab behind the open gate (zGame = 224..624, width = 236)
  const bridgeRoadW = gateOpenHalfW * 2; // 236
  const bridgeRoadD = 400;
  const bridgeRoadCenterZ = 224 + bridgeRoadD * 0.5; // 424
  const bridgeRoadGeo = new THREE.BoxGeometry(bridgeRoadW, 10, bridgeRoadD);
  const bridgeRoadMats = [
    asphaltSideMat,
    asphaltSideMat,
    bridgeAsphaltMat,
    asphaltSideMat,
    asphaltSideMat,
    asphaltSideMat,
  ];
  const bridgeRoadMesh = new THREE.Mesh(bridgeRoadGeo, bridgeRoadMats);
  const bridgeRoadEdges = new THREE.EdgesGeometry(bridgeRoadGeo);
  const bridgeRoadLines = new THREE.LineSegments(bridgeRoadEdges, inkLine);
  bridgeRoadMesh.position.set(0, -5.25, -bridgeRoadCenterZ);
  bridgeRoadLines.position.copy(bridgeRoadMesh.position);
  group.add(bridgeRoadMesh, bridgeRoadLines);
  disposables.push(bridgeRoadGeo, bridgeRoadEdges);

  // Concrete bridge box-girder underside & structural edge frame beneath the bridge deck (zGame = 224..624)
  addWireBox(
    group,
    0,
    -16.25,
    bridgeRoadCenterZ,
    bridgeRoadW + 20,
    12,
    bridgeRoadD,
    tintFill,
    inkLine,
    disposables
  );

  // 3D Concrete Curb Frame Borders around the asphalt road
  // Foreground 3D road shoulder curb fascia (zGame = -116, solid 3D cross-section frame)
  addWireBox(group, 0, -5.0, -116, mainRoadW + 16, 11, 10, tintFill, inkLine, disposables);
  // Outer left & right 3D road wing end-frames
  addWireBox(group, -756, 2.5, 56, 8, 6, mainRoadD, tintFill, inkLine, disposables);
  addWireBox(group, 756, 2.5, 56, 8, 6, mainRoadD, tintFill, inkLine, disposables);

  // Crisp White-with-Ink Road Edge Lines & 3D Dashed Centerline Markings ("garis putus-putus di tengah jalan")
  // Outer foreground edge line
  addWireBox(group, 0, -0.05, -96, 1480, 0.35, 5.5, paperFill, inkLine, disposables);
  // Left & Right back edge lines stopping cleanly at the open bridge entrance (|x| = 104)
  addWireBox(group, -422, -0.05, 204, 636, 0.35, 5.5, paperFill, inkLine, disposables);
  addWireBox(group, 422, -0.05, 204, 636, 0.35, 5.5, paperFill, inkLine, disposables);
  // Inner bridge roadway lane edge lines continuing from zGame = 204 straight through the gate to zGame = 620
  for (const sx of [-1, 1] as const) {
    addWireBox(group, sx * 102, -0.05, 412, 4.5, 0.35, 416, paperFill, inkLine, disposables);
  }

  // Central dashed road lines leading from the arena straight through the open gate into the bridge
  for (let dz = -70; dz <= 580; dz += 58) {
    addWireBox(group, 0, -0.05, dz, 9, 0.35, 30, paperFill, inkLine, disposables);
  }
  // Cross-road dashed centerlines on left & right arena wings (zGame = 52)
  for (const sx of [-1, 1] as const) {
    for (let dx = 165; dx <= 615; dx += 90) {
      addWireBox(group, sx * dx, -0.05, 52, 52, 0.35, 12, paperFill, inkLine, disposables);
    }
  }

  // 1C. Split Concrete Median Barrier (left & right wings only; center |x| < 118 is OPEN toward the bridge!)
  for (const mx of [-495, -385, -275, -165, 165, 275, 385, 495]) {
    // Alternating white & tinted kerb segments (preserves x = ±165 cat perches)
    addWireBox(group, mx - 24, 9, 186, 46, 18, 12, paperFill, inkLine, disposables);
    addWireBox(group, mx + 24, 9, 186, 46, 18, 12, darkTintFill, inkLine, disposables);
  }

  // 1D. Split Sidewalk Curb & Pedestrian Guardrail ("pagar") — middle removed (|x| < 118 open to bridge!)
  // Left wing sidewalk curb & guardrail (x = -680..-118)
  addWireBox(group, -409, 4, 228, 582, 8.5, 18, tintFill, inkLine, disposables);
  addWireBox(group, -399, 34, 224, 562, 4, 5, paperFill, inkLine, disposables);
  pushSeg(-680, 20, 224, -118, 20, 224);
  for (let rx = -668; rx <= -128; rx += 27) {
    pushSeg(rx, 8.5, 224, rx, 32, 224);
  }
  pushSeg(-118, 8.5, 224, -118, 32, 224);

  // Right wing sidewalk curb & guardrail (x = +118..+680)
  addWireBox(group, 409, 4, 228, 582, 8.5, 18, tintFill, inkLine, disposables);
  addWireBox(group, 399, 34, 224, 562, 4, 5, paperFill, inkLine, disposables);
  pushSeg(118, 20, 224, 680, 20, 224);
  for (let rx = 128; rx <= 668; rx += 27) {
    pushSeg(rx, 8.5, 224, rx, 32, 224);
  }
  pushSeg(118, 8.5, 224, 118, 32, 224);

  // Inner 3D bridge curbs & guardrails turning into the bridge along both sides of the roadway (zGame = 224..620)
  for (const sx of [-1, 1] as const) {
    const innerEdgeX = sx * 115;
    addWireBox(group, innerEdgeX, 4, bridgeRoadCenterZ, 8, 8.5, bridgeRoadD, tintFill, inkLine, disposables);
    addWireBox(group, sx * 116, 34, 422, 4, 4, 396, paperFill, inkLine, disposables);
    pushSeg(sx * 116, 20, 224, sx * 116, 20, 620);
    for (let rz = 236; rz <= 608; rz += 28) {
      pushSeg(sx * 116, 8.5, rz, sx * 116, 32, rz);
    }
  }

  // Y-Shaped Double-Arm Bridge Streetlamps along the deck wings & receding span
  for (const [lx, lz] of [
    [-430, 236],
    [-255, 236],
    [255, 236],
    [430, 236],
    [-116, 405],
    [116, 405],
  ] as const) {
    pushSeg(lx, 0, lz, lx, 146, lz);
    pushSeg(lx - 2, 0, lz, lx - 2, 146, lz);
    pushSeg(lx, 142, lz, lx - 14, 156, lz);
    pushSeg(lx - 14, 156, lz, lx - 28, 160, lz);
    pushSeg(lx, 142, lz, lx + 14, 156, lz);
    pushSeg(lx + 14, 156, lz, lx + 28, 160, lz);
    addWireBox(group, lx - 30, 159, lz, 12, 4, 6, paperFill, inkLine, disposables);
    addWireBox(group, lx + 30, 159, lz, 12, 4, 6, paperFill, inkLine, disposables);
  }

  // 2. Sungai Brantas Distant Horizon, Piers & Riverbank Ripples outside bridge road (zGame = 345..525)
  for (let wz = 345; wz <= 525; wz += 45) {
    pushSeg(-680, -24, wz, -132, -24, wz);
    pushSeg(132, -24, wz, 680, -24, wz);
  }
  pushSeg(-740, 14, 440, -310, -18, 395);
  pushSeg(310, -18, 395, 740, 14, 440);

  // 3. Monumental Twin Main Pylons ("PYLON UTAMA") & "KOTA KEDIRI" Portal (zGame = 305)
  const pylonZ = 305;
  const pylonX = 152; // Twin towers at x = ±152, inner faces at ±119 framing the open 236-wide road

  const createCrownMesh = (sx: -1 | 1) => {
    const crownShape = new THREE.Shape();
    if (sx < 0) {
      crownShape.moveTo(-27, 0);
      crownShape.lineTo(27, 0);
      crownShape.lineTo(27, 46);
      crownShape.lineTo(-27, 22);
    } else {
      crownShape.moveTo(-27, 0);
      crownShape.lineTo(27, 0);
      crownShape.lineTo(27, 22);
      crownShape.lineTo(-27, 46);
    }
    crownShape.closePath();

    const crownGeo = new THREE.ExtrudeGeometry(crownShape, {
      depth: 42,
      bevelEnabled: false,
      curveSegments: 1,
    });
    crownGeo.translate(sx * pylonX, 304, -pylonZ - 21);
    const crownEdges = new THREE.EdgesGeometry(crownGeo, 18);
    const cMesh = new THREE.Mesh(crownGeo, paperFill);
    const cLines = new THREE.LineSegments(crownEdges, inkLine);
    group.add(cMesh, cLines);
    disposables.push(crownGeo, crownEdges);

    for (let fx = -21; fx <= 21; fx += 7) {
      const t = sx < 0 ? (fx + 27) / 54 : (27 - fx) / 54;
      const topY = 304 + 22 + t * 24;
      pushSeg(sx * pylonX + fx, 304, pylonZ - 21.5, sx * pylonX + fx, topY, pylonZ - 21.5);
    }
  };

  for (const sx of [-1, 1] as const) {
    const px = sx * pylonX;

    // Pylon Base Pedestal (PYLON UTAMA, y = 0..54)
    addWireBox(group, px, 23, pylonZ, 66, 46, 66, darkTintFill, inkLine, disposables);
    addWireBox(group, px, 50, pylonZ, 62, 8, 62, tintFill, inkLine, disposables);

    // Main Tower Shaft (y = 54..304)
    addWireBox(group, px, 179, pylonZ, 54, 250, 54, paperFill, inkLine, disposables);
    addWireBox(group, px - sx * 22, 179, pylonZ - 27, 10, 246, 3, tintFill, inkLine, disposables);
    addWireBox(group, px + sx * 22, 179, pylonZ - 27, 10, 246, 3, tintFill, inkLine, disposables);

    // Recessed Vertical Louver Facade Panel (y = 68..224) with horizontal ribs
    addWireBox(group, px, 146, pylonZ - 27, 26, 152, 2.5, tintFill, inkLine, disposables);
    for (let ly = 74; ly <= 218; ly += 6) {
      pushSeg(px - 12, ly, pylonZ - 29, px + 12, ly, pylonZ - 29);
    }

    // Three Recessed Horizontal Accent Bands near top of shaft
    for (const bandY of [234, 246, 258]) {
      addWireBox(group, px, bandY, pylonZ - 27.5, 32, 6, 3, darkTintFill, inkLine, disposables);
    }

    // Upper Stay-Cable Anchor Collar & Head Block
    addWireBox(group, px, 284, pylonZ, 60, 40, 60, paperFill, inkLine, disposables);
    addWireBox(group, px, 284, pylonZ - 30.5, 42, 28, 3, tintFill, inkLine, disposables);

    createCrownMesh(sx);

    // 4. Sweeping Diagonal Stay Cables fanning from Upper Pylon down to Guardrails
    const cableAnchorZ = pylonZ - 14;
    for (let c = 0; c < 4; c++) {
      const topY = 295 - c * 9;
      const deckX = px + sx * (118 + c * 68);
      pushSeg(px + sx * 24, topY, cableAnchorZ, deckX, 34, 224);
      const rearZ = pylonZ + 62 + c * 40;
      pushSeg(px, topY - 4, pylonZ + 28, sx * 116, 34, rearZ);
    }
  }

  // Ornate Crossbeam Portal Architrave connecting Twin Pylons (y = 264..298)
  addWireBox(group, 0, 281, pylonZ, 252, 34, 26, paperFill, inkLine, disposables);
  addWireBox(group, 0, 299, pylonZ, 258, 5, 30, tintFill, inkLine, disposables);
  addWireBox(group, 0, 263, pylonZ, 258, 5, 30, tintFill, inkLine, disposables);

  // Recessed dark signboard plate behind "KOTA KEDIRI" 3D letters
  addWireBox(group, 0, 281, pylonZ - 13.5, 166, 24, 3, darkTintFill, inkLine, disposables);

  // Decorative Kediri filigree scrollwork panels flanking "KOTA KEDIRI"
  const scrollPts: number[] = [];
  const beamFrontZ = -(pylonZ - 14.5);
  for (const sx of [-1, 1] as const) {
    const cx = sx * 102;
    scrollPts.push(
      cx - 14, 273, beamFrontZ, cx + 14, 273, beamFrontZ,
      cx - 14, 289, beamFrontZ, cx + 14, 289, beamFrontZ,
      cx - 14, 273, beamFrontZ, cx - 14, 289, beamFrontZ,
      cx + 14, 273, beamFrontZ, cx + 14, 289, beamFrontZ,
      cx - 12, 281, beamFrontZ, cx, 288, beamFrontZ,
      cx, 288, beamFrontZ, cx + 12, 281, beamFrontZ,
      cx + 12, 281, beamFrontZ, cx, 274, beamFrontZ,
      cx, 274, beamFrontZ, cx - 12, 281, beamFrontZ,
      cx - 6, 281, beamFrontZ, cx + 6, 281, beamFrontZ
    );
  }
  addLineSegments(group, scrollPts, inkLine, disposables);

  // Crisp 3D Extruded "KOTA KEDIRI" lettering centered on the crossbeam
  buildExtrudedSign3D(group, 'KOTA KEDIRI', 0, 272.5, pylonZ - 15.5, 17, 2.6, 8, 5, disposables);

  // 5. Distant Receding Second Bridge Portal along the through-bridge deck (zGame = 540)
  const farZ = -540;
  const farPts: number[] = [];
  for (const sx of [-1, 1] as const) {
    const fx = sx * 145;
    farPts.push(
      fx - 22, 0, farZ, fx - 22, 250, farZ,
      fx + 22, 0, farZ, fx + 22, 250, farZ,
      fx - 22, 250, farZ, fx + 22, 272, farZ,
      fx + 22, 272, farZ, fx + 22, 250, farZ
    );
    for (let c = 0; c < 3; c++) {
      farPts.push(fx, 232 - c * 10, farZ, sx * 116, 34, farZ + 38 + c * 32);
    }
  }
  farPts.push(-123, 218, farZ, 123, 218, farZ, -123, 240, farZ, 123, 240, farZ);
  addLineSegments(group, farPts, farLineMat, disposables);
}

function buildStage3D(stageId: StageId): StageBuildResult {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const paperFill = new THREE.MeshBasicMaterial({
    color: DOODLE_PAPER_HEX,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const tintFill = new THREE.MeshBasicMaterial({
    color: 0xefefef,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const inkLine = new THREE.LineBasicMaterial({ color: DOODLE_INK_HEX });
  disposables.push(paperFill, tintFill, inkLine);

  const zFront = -130;
  const zBack = 360;
  const floorMinX = -ARENA_HALF_WIDTH - 140;
  const floorMaxX = ARENA_HALF_WIDTH + 140;
  const floorPts: number[] = [];

  const pushSeg = (x1: number, y1: number, z1Game: number, x2: number, y2: number, z2Game: number) => {
    floorPts.push(x1, y1, -z1Game, x2, y2, -z2Game);
  };

  let monument: THREE.Group | undefined;
  let swingSeat: THREE.Group | undefined;
  let swingRopes: THREE.LineSegments | undefined;

  if (stageId === 'living_room') {
    for (let x = -576; x <= 576; x += 96) {
      pushSeg(x, 0, zFront, x, 0, zBack);
    }
    for (let z = zFront; z <= zBack; z += 80) {
      pushSeg(floorMinX, 0, z, floorMaxX, 0, z);
    }
    for (let x = -384; x < 384; x += 192) {
      pushSeg(x, 0, 0, x + 96, 0, 80);
    }
    pushSeg(floorMinX, 0, zBack, floorMaxX, 0, zBack);
    pushSeg(floorMinX, 12, zBack, floorMaxX, 12, zBack);
    pushSeg(-560, 78, 330, 560, 78, 330);
    pushSeg(-560, 42, 330, 560, 42, 330);
    for (let x = -520; x <= 520; x += 65) {
      pushSeg(x, 0, 330, x, 78, 330);
    }

    // Floating 3D "ADNAN FAMILY" white monument with black frame lines
    monument = buildAdnanFamilyMonument3D(group, 225, disposables);

    // Sofa shifted left so center monument clears completely
    addWireBox(group, -345, 32, 235, 165, 58, 72, paperFill, inkLine, disposables);
    addWireBox(group, -345, 74, 260, 165, 56, 22, paperFill, inkLine, disposables);
    addWireBox(group, -420, 48, 235, 22, 64, 72, paperFill, inkLine, disposables);
    addWireBox(group, -270, 48, 235, 22, 64, 72, paperFill, inkLine, disposables);
    pushSeg(-345, 20, 199, -345, 61, 199);

    // Coffee table left
    addWireBox(group, -335, 22, 145, 78, 12, 42, tintFill, inkLine, disposables);
    pushSeg(-366, 0, 128, -366, 16, 128);
    pushSeg(-304, 0, 128, -304, 16, 128);

    // TV Stand & TV shifted right
    addWireBox(group, 345, 28, 240, 140, 54, 52, paperFill, inkLine, disposables);
    addWireBox(group, 345, 92, 244, 108, 68, 22, paperFill, inkLine, disposables);
    addWireBox(group, 345, 92, 231, 86, 50, 2, tintFill, inkLine, disposables);
    pushSeg(345, 126, 244, 315, 164, 244);
    pushSeg(345, 126, 244, 375, 164, 244);

    // Plant pot far right
    addWireBox(group, 460, 22, 215, 34, 44, 34, paperFill, inkLine, disposables);
    pushSeg(460, 44, 215, 438, 98, 215);
    pushSeg(460, 44, 215, 460, 112, 215);
    pushSeg(460, 44, 215, 482, 96, 215);
  } else if (stageId === 'dojo') {
    for (let x = -588; x <= 588; x += 84) {
      pushSeg(x, 0, zFront, x, 0, zBack);
    }
    for (let z = zFront; z <= zBack; z += 115) {
      pushSeg(floorMinX, 0, z, floorMaxX, 0, z);
    }

    // Back Shoji sliding screens
    for (let sx = -420; sx <= 420; sx += 140) {
      addWireBox(group, sx, 142, 312, 134, 284, 8, paperFill, inkLine, disposables);
      for (let gx = -44; gx <= 44; gx += 44) {
        pushSeg(sx + gx, 12, 307, sx + gx, 274, 307);
      }
      for (let gy = 54; gy <= 246; gy += 48) {
        pushSeg(sx - 66, gy, 307, sx + 66, gy, 307);
      }
    }

    // Wide Dojo pillars framing the floating center monument
    for (const px of [-425, -268, 268, 425]) {
      addWireBox(group, px, 190, 268, 28, 380, 28, paperFill, inkLine, disposables);
    }
    addWireBox(group, 0, 368, 268, 1080, 28, 32, paperFill, inkLine, disposables);

    // Floating 3D "ADNAN FAMILY" white monument with black frame lines
    monument = buildAdnanFamilyMonument3D(group, 225, disposables);

    // Minimalist Dojo wooden bench left & wooden tansu cabinet right
    addWireBox(group, -346, 18, 238, 92, 10, 38, tintFill, inkLine, disposables);
    pushSeg(-382, 0, 222, -382, 13, 222);
    pushSeg(-310, 0, 222, -310, 13, 222);

    addWireBox(group, 346, 29, 238, 92, 58, 42, paperFill, inkLine, disposables);
    pushSeg(346, 0, 217, 346, 58, 217);
    pushSeg(300, 29, 217, 392, 29, 217);
  } else if (stageId === 'park') {
    for (let x = -600; x <= 600; x += 100) {
      pushSeg(x, 0, zFront, x, 0, zBack);
    }
    for (let z = zFront; z <= zBack; z += 90) {
      pushSeg(floorMinX, 0, z, floorMaxX, 0, z);
    }
    const buildings = [
      { x: -420, w: 95, h: 240 },
      { x: -305, w: 80, h: 310 },
      { x: -195, w: 105, h: 190 },
      { x: -45, w: 90, h: 280 },
      { x: 95, w: 110, h: 220 },
      { x: 235, w: 85, h: 335 },
      { x: 375, w: 115, h: 250 },
    ];
    for (const b of buildings) {
      addWireBox(group, b.x, b.h * 0.5, 520, b.w, b.h, 36, paperFill, inkLine, disposables);
    }

    // Floating 3D "ADNAN FAMILY" white monument with black frame lines in Park Plaza
    monument = buildAdnanFamilyMonument3D(group, 225, disposables);

    // Slide shifted far left
    addWireBox(group, -390, 75, 235, 55, 150, 55, paperFill, inkLine, disposables);
    for (let sy = 25; sy <= 130; sy += 26) {
      pushSeg(-417, sy, 208, -417, sy, 262);
    }
    pushSeg(-362, 145, 212, -265, 10, 212);
    pushSeg(-362, 145, 258, -265, 10, 258);
    pushSeg(-265, 10, 212, -265, 10, 258);
    pushSeg(-362, 162, 212, -265, 26, 212);
    pushSeg(-362, 162, 258, -265, 26, 258);

    // Swing frame shifted far right
    pushSeg(270, 0, 200, 295, 175, 235);
    pushSeg(320, 0, 270, 295, 175, 235);
    pushSeg(420, 0, 200, 395, 175, 235);
    pushSeg(370, 0, 270, 395, 175, 235);
    pushSeg(295, 175, 235, 395, 175, 235);

    swingSeat = addWireBox(group, 345, 44, 235, 44, 6, 18, paperFill, inkLine, disposables);
    swingRopes = addLineSegments(
      group,
      [327, 175, -235, 327, 44, -235, 363, 175, -235, 363, 44, -235],
      inkLine,
      disposables
    );

    // Park bench
    addWireBox(group, 475, 24, 195, 95, 12, 38, tintFill, inkLine, disposables);
    addWireBox(group, 475, 52, 213, 95, 34, 10, paperFill, inkLine, disposables);
    pushSeg(435, 0, 180, 435, 24, 180);
    pushSeg(515, 0, 180, 515, 24, 180);
  } else if (stageId === 'kitchen') {
    // Checkered / geometric kitchen floor tiles
    for (let x = -616; x <= 616; x += 88) {
      pushSeg(x, 0, zFront, x, 0, zBack);
    }
    for (let z = zFront; z <= zBack; z += 88) {
      pushSeg(floorMinX, 0, z, floorMaxX, 0, z);
    }

    // Back wall window & architectural dado rail
    pushSeg(floorMinX, 95, 330, floorMaxX, 95, 330);
    for (const wx of [-280, 0, 280]) {
      addWireBox(group, wx, 175, 332, 160, 110, 6, paperFill, inkLine, disposables);
      pushSeg(wx, 120, 328, wx, 230, 328);
      pushSeg(wx - 80, 175, 328, wx + 80, 175, 328);
    }

    // Floating 3D "ADNAN FAMILY" white monument with black frame lines
    monument = buildAdnanFamilyMonument3D(group, 225, disposables);

    // Left: Tall Refrigerator + Kitchen Counter + Range Hood
    addWireBox(group, -420, 105, 245, 78, 210, 68, paperFill, inkLine, disposables);
    pushSeg(-459, 132, 211, -381, 132, 211);
    pushSeg(-395, 145, 210, -395, 178, 210);
    pushSeg(-395, 95, 210, -395, 122, 210);

    addWireBox(group, -315, 42, 245, 120, 84, 62, tintFill, inkLine, disposables);
    addWireBox(group, -315, 200, 250, 96, 36, 48, paperFill, inkLine, disposables);
    addWireBox(group, -315, 248, 250, 36, 62, 32, paperFill, inkLine, disposables);

    // Right: Dining Bar Island + 2 Minimalist Bar Stools
    addWireBox(group, 355, 46, 225, 165, 12, 58, paperFill, inkLine, disposables);
    addWireBox(group, 285, 22, 225, 16, 44, 48, tintFill, inkLine, disposables);
    addWireBox(group, 425, 22, 225, 16, 44, 48, tintFill, inkLine, disposables);
    for (const sx of [320, 390]) {
      addWireBox(group, sx, 34, 185, 30, 8, 28, paperFill, inkLine, disposables);
      pushSeg(sx - 11, 0, 175, sx - 11, 30, 175);
      pushSeg(sx + 11, 0, 175, sx + 11, 30, 175);
    }

    // Hanging pendant lamps overhead
    for (const lx of [-180, 180]) {
      pushSeg(lx, 245, 215, lx, 330, 215);
      addWireBox(group, lx, 236, 215, 36, 18, 36, paperFill, inkLine, disposables);
    }
  } else if (stageId === 'rooftop') {
    // Wide concrete rooftop deck slabs
    for (let x = -624; x <= 624; x += 104) {
      pushSeg(x, 0, zFront, x, 0, zBack);
    }
    for (let z = zFront; z <= zBack; z += 104) {
      pushSeg(floorMinX, 0, z, floorMaxX, 0, z);
    }

    // Perimeter rooftop safety railing
    pushSeg(floorMinX, 58, 320, floorMaxX, 58, 320);
    pushSeg(floorMinX, 30, 320, floorMaxX, 30, 320);
    for (let rx = -560; rx <= 560; rx += 70) {
      pushSeg(rx, 0, 320, rx, 58, 320);
    }

    // Distant minimalist skyline towers
    const skyline = [
      { x: -460, w: 90, h: 210 },
      { x: -320, w: 110, h: 285 },
      { x: -165, w: 85, h: 175 },
      { x: 15, w: 95, h: 250 },
      { x: 185, w: 105, h: 195 },
      { x: 345, w: 90, h: 300 },
      { x: 475, w: 95, h: 220 },
    ];
    for (const b of skyline) {
      addWireBox(group, b.x, b.h * 0.5 - 30, 520, b.w, b.h, 34, paperFill, inkLine, disposables);
    }

    // Floating 3D "ADNAN FAMILY" white monument with black frame lines on rooftop slab
    monument = buildAdnanFamilyMonument3D(group, 225, disposables);

    // Left: Elevated rooftop water tank tower
    for (const lx of [-415, -335]) {
      pushSeg(lx, 0, 210, lx, 86, 225);
      pushSeg(lx, 0, 265, lx, 86, 250);
    }
    addWireBox(group, -375, 90, 238, 108, 10, 72, tintFill, inkLine, disposables);
    addWireBox(group, -375, 148, 238, 86, 104, 62, paperFill, inkLine, disposables);
    addWireBox(group, -375, 208, 238, 96, 14, 68, tintFill, inkLine, disposables);

    // Right: Twin HVAC mechanical units + Antenna mast
    addWireBox(group, 330, 36, 238, 92, 72, 66, paperFill, inkLine, disposables);
    addWireBox(group, 330, 38, 204, 46, 46, 4, tintFill, inkLine, disposables);
    addWireBox(group, 435, 28, 238, 76, 56, 58, tintFill, inkLine, disposables);

    pushSeg(435, 56, 238, 435, 265, 238);
    pushSeg(402, 195, 238, 468, 195, 238);
    pushSeg(414, 232, 238, 456, 232, 238);
  } else if (stageId === 'library') {
    // 'library' — Grand Family Study & Bookshelves
    for (let x = -552; x <= 552; x += 92) {
      pushSeg(x, 0, zFront, x, 0, zBack);
    }
    for (let z = zFront; z <= zBack; z += 76) {
      pushSeg(floorMinX, 0, z, floorMaxX, 0, z);
    }

    // Tall library gallery windows in center background
    for (const wx of [-175, 0, 175]) {
      addWireBox(group, wx, 175, 326, 128, 210, 8, paperFill, inkLine, disposables);
      pushSeg(wx, 70, 321, wx, 280, 321);
      pushSeg(wx - 64, 145, 321, wx + 64, 145, 321);
      pushSeg(wx - 64, 215, 321, wx + 64, 215, 321);
    }

    // Floating 3D "ADNAN FAMILY" white monument with black frame lines
    monument = buildAdnanFamilyMonument3D(group, 225, disposables);

    // Left & Right floor-to-ceiling bookcases with book clusters
    for (const sideX of [-375, 375]) {
      addWireBox(group, sideX, 132, 250, 165, 264, 52, paperFill, inkLine, disposables);
      for (let sy = 44; sy <= 220; sy += 44) {
        pushSeg(sideX - 82, sy, 224, sideX + 82, sy, 224);
        // Minimalist geometric book stacks on shelves
        addWireBox(group, sideX - 42, sy + 15, 226, 48, 30, 26, tintFill, inkLine, disposables);
        addWireBox(group, sideX + 26, sy + 17, 226, 56, 34, 26, paperFill, inkLine, disposables);
      }
    }

    // Reading ladder on right bookcase
    pushSeg(325, 0, 200, 345, 240, 220);
    pushSeg(355, 0, 200, 375, 240, 220);
    for (let ly = 35; ly <= 210; ly += 35) {
      const t = ly / 240;
      pushSeg(325 + t * 20, ly, 200 + t * 20, 355 + t * 20, ly, 200 + t * 20);
    }

    // Study reading table & lamp left
    addWireBox(group, -295, 36, 165, 86, 10, 42, tintFill, inkLine, disposables);
    pushSeg(-330, 0, 148, -330, 31, 148);
    pushSeg(-260, 0, 148, -260, 31, 148);
    pushSeg(-280, 41, 165, -280, 74, 165);
    addWireBox(group, -280, 80, 165, 26, 16, 26, paperFill, inkLine, disposables);
  } else if (stageId === 'simpang_lima_gumul') {
    buildSimpangLimaGumul3D(group, paperFill, tintFill, inkLine, pushSeg, disposables);
    // Floating 3D "ADNAN FAMILY" white monument positioned in front of the Simpang Lima Gumul building
    monument = buildAdnanFamilyMonument3D(group, 228, disposables, 216);
    monument.scale.set(0.8, 0.8, 0.8);
  } else if (stageId === 'jembatan_brawijaya') {
    buildJembatanBrawijaya3D(group, paperFill, tintFill, inkLine, pushSeg, disposables);
    // Floating 3D two-line monument centered cleanly inside the portal bay below "KOTA KEDIRI"
    monument = buildAdnanFamilyMonument3D(group, 224, disposables, 200);
    monument.scale.set(0.5, 0.5, 0.5);
  }

  // Distant background architectural depth silhouette layer (zGame = 560) for smooth 3D parallax
  const farMat = new THREE.LineBasicMaterial({ color: 0xd0d0d0 });
  disposables.push(farMat);
  if (stageId === 'living_room' || stageId === 'kitchen' || stageId === 'library' || stageId === 'dojo') {
    const farPts: number[] = [];
    for (let fx = -660; fx <= 660; fx += 132) {
      farPts.push(fx, 0, -560, fx, 260, -560);
    }
    farPts.push(-660, 120, -560, 660, 120, -560);
    farPts.push(-660, 220, -560, 660, 220, -560);
    addLineSegments(group, farPts, farMat, disposables);
  }

  // Subtle low-profile foreground edge framing markers (zGame = -88) & arena corner markers
  const cornerPts: number[] = [];
  for (const edgeX of [-ARENA_HALF_WIDTH, ARENA_HALF_WIDTH]) {
    cornerPts.push(edgeX, 0.5, 30, edgeX, 0.5, -30);
    cornerPts.push(edgeX, 0.5, -30, edgeX, 28, -30);
    // Low foreground rail ticks sweeping cleanly in perspective parallax
    const fgX = edgeX > 0 ? edgeX + 34 : edgeX - 34;
    cornerPts.push(fgX, 0, 88, fgX, 24, 88);
    cornerPts.push(fgX - 10, 24, 88, fgX + 10, 24, 88);
  }
  addLineSegments(group, floorPts, inkLine, disposables);
  addLineSegments(group, cornerPts, inkLine, disposables);

  return { group, monument, swingSeat, swingRopes, disposables };
}

function setupSketchbookScene(scene: THREE.Scene): void {
  scene.background = new THREE.Color(DOODLE_PAPER_HEX);
  scene.fog = new THREE.Fog(DOODLE_PAPER_HEX, 950, 1850);
}

interface ProjectileVisualSlot {
  group: THREE.Group;
  sapu: THREE.Group;
  sapuAccentParts: THREE.Mesh[];
  dustCloud: THREE.Group;
  dustCloudParts: THREE.Mesh[];
  buku: THREE.Group;
  bukuSpine: THREE.Mesh;
  origami: THREE.Group;
  origamiCore: THREE.Mesh;
  bukuStack: THREE.Group;
  bukuStackAccentParts: THREE.Mesh[];
  kelereng: THREE.Group;
  kelerengSwirl: THREE.Mesh;
  kelerengTrap: THREE.Group;
  kelerengTrapSwirls: THREE.Mesh[];
}

interface ParticleVisualSlot {
  group: THREE.Group;
  starburst: THREE.Group;
  starOuterGeo: THREE.BufferGeometry;
  starInnerGeo: THREE.BufferGeometry;
  starOuterPts: Array<[number, number]>;
  starInnerPts: Array<[number, number]>;
  starMat: THREE.MeshBasicMaterial;
  shockwave: THREE.Group;
  shockOuterGeo: THREE.BufferGeometry;
  shockInnerGeo: THREE.BufferGeometry;
  shockMat: THREE.MeshBasicMaterial;
  spark: THREE.Mesh;
  dust: THREE.Group;
}

export class ThreeMainRenderer {
  public readonly isSoftwareGl: boolean;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly canvas: HTMLCanvasElement;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private baseFov = 44;

  private currentStageId: StageId | null = null;
  private stageBuild: StageBuildResult | null = null;

  private p1Rig: DoodleFighterRig | null = null;
  private p2Rig: DoodleFighterRig | null = null;
  private p1Char: CharacterId | null = null;
  private p2Char: CharacterId | null = null;

  private titleP1Rig: DoodleFighterRig;
  private titleP2Rig: DoodleFighterRig;
  private catRig: DoodleCatRig;
  private catState: CatNpcState;

  private accentMats: Record<CharacterId, THREE.MeshBasicMaterial>;
  private particleAccentMats: Record<CharacterId, THREE.MeshBasicMaterial>;
  private dustMat!: THREE.MeshBasicMaterial;
  private projPool: ProjectileVisualSlot[] = [];
  private partPool: ParticleVisualSlot[] = [];
  private shockCircleUnitPts: Array<[number, number]> = [];
  private sharedDisposables: Array<{ dispose: () => void }> = [];

  // Dynamic Slow-Mo (Bullet Time) Action Close-up & Victory camera smoothing state
  private dramaticBlend = 0;
  private victoryBlend = 0;
  private victoryElapsed = 0;
  private lastCamTargetX = 0;
  private lastCamTargetY = 85;
  private lastOrbitSign = 1;
  private lastIsKo = false;
  private lastMatchTime = 0;
  private lastTitleTime = -1;
  private faceMaskEnabled = false;
  private slotFaceOverrides: Partial<Record<1 | 2, string | null>> = {};
  private titleFaceOverrides: Partial<Record<CharacterId, string | null>> = {};

  constructor(container: HTMLElement, initialFaceMask = false) {
    this.faceMaskEnabled = initialFaceMask;
    preloadAllFaceMaskTextures();
    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = false;

    this.canvas = this.renderer.domElement;
    this.canvas.className = 'sf-canvas';
    this.canvas.dataset.testid = 'game-canvas';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 10, 3000);
    setupSketchbookScene(this.scene);

    this.accentMats = {
      adnan: new THREE.MeshBasicMaterial({ color: CHARACTER_COLOR_THEMES.adnan.accent }),
      tika: new THREE.MeshBasicMaterial({ color: CHARACTER_COLOR_THEMES.tika.accent }),
      dhira: new THREE.MeshBasicMaterial({ color: CHARACTER_COLOR_THEMES.dhira.accent }),
      iyen: new THREE.MeshBasicMaterial({ color: CHARACTER_COLOR_THEMES.iyen.accent }),
    };
    this.particleAccentMats = {
      adnan: new THREE.MeshBasicMaterial({
        color: CHARACTER_COLOR_THEMES.adnan.accent,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
      tika: new THREE.MeshBasicMaterial({
        color: CHARACTER_COLOR_THEMES.tika.accent,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
      dhira: new THREE.MeshBasicMaterial({
        color: CHARACTER_COLOR_THEMES.dhira.accent,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
      iyen: new THREE.MeshBasicMaterial({
        color: CHARACTER_COLOR_THEMES.iyen.accent,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    };
    this.dustMat = new THREE.MeshBasicMaterial({
      color: DOODLE_INK_HEX,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.sharedDisposables.push(
      this.accentMats.adnan,
      this.accentMats.tika,
      this.accentMats.dhira,
      this.accentMats.iyen,
      this.particleAccentMats.adnan,
      this.particleAccentMats.tika,
      this.particleAccentMats.dhira,
      this.particleAccentMats.iyen,
      this.dustMat
    );

    // Pre-build title showcase rigs
    this.titleP1Rig = buildDoodleFighterRig('adnan');
    this.titleP2Rig = buildDoodleFighterRig('tika');
    this.titleP1Rig.root.visible = false;
    this.titleP2Rig.root.visible = false;
    this.scene.add(this.titleP1Rig.root, this.titleP2Rig.root);

    // Pre-build background white & black-outlined cat NPC
    this.catRig = buildDoodleCatRig();
    this.catState = createCatNpcState('dojo');
    this.scene.add(this.catRig.root);

    this.initPools();
  }

  private initPools(): void {
    const whiteMat = new THREE.MeshBasicMaterial({ color: DOODLE_PAPER_HEX });
    const inkMat = new THREE.MeshBasicMaterial({ color: DOODLE_INK_HEX });
    const lineMat = new THREE.LineBasicMaterial({ color: DOODLE_INK_HEX });
    this.sharedDisposables.push(whiteMat, inkMat, lineMat);

    // Uniform non-tapering geometries for projectile & comic-book line impact pools
    const sapuStickGeo = new THREE.CapsuleGeometry(2.4, 60, 6, 14);
    sapuStickGeo.rotateZ(Math.PI / 2);
    const sapuBrisGeo = new THREE.CapsuleGeometry(1.5, 19, 6, 12);
    sapuBrisGeo.rotateZ(Math.PI / 2);
    const bookGeo = new THREE.BoxGeometry(34, 24, 12);
    const bookEdges = new THREE.EdgesGeometry(bookGeo);
    const stackBoxGeo = new THREE.BoxGeometry(44, 14, 32);
    const stackEdges = new THREE.EdgesGeometry(stackBoxGeo);
    const marbleGeo = new THREE.SphereGeometry(14, 22, 18);
    const marbleOutlineGeo = new THREE.SphereGeometry(17.5, 22, 18);
    const marbleSwirlGeo = new THREE.TorusGeometry(14.5, 2.1, 12, 28);
    const dustPuffGeo = new THREE.SphereGeometry(15, 16, 12);
    const dustPuffOutGeo = new THREE.SphereGeometry(18.2, 16, 12);
    const origamiGeo = new THREE.ConeGeometry(16, 36, 4);
    origamiGeo.rotateZ(-Math.PI / 2);
    origamiGeo.scale(1, 0.32, 0.72);
    const origamiEdges = new THREE.EdgesGeometry(origamiGeo);
    const trapMarbleGeo = new THREE.SphereGeometry(7.5, 14, 12);
    const trapMarbleOutGeo = new THREE.SphereGeometry(9.6, 14, 12);
    const sparkGeo = createComicLineGeo(18, VFX_LINE_RADIUS, 'x');
    const dustLineGeo = createComicLineGeo(14, VFX_LINE_RADIUS, 'x');

    // Pre-build 6 random-ray connected star point loops + shared unit Shockwave circle loop
    const starOuterUnitSets: Array<Array<[number, number]>> = [];
    const starInnerUnitSets: Array<Array<[number, number]>> = [];
    const buildStarLoopPoints = (spikes: number, seed: number, scale: number): Array<[number, number]> => {
      const pts: Array<[number, number]> = [];
      const total = spikes * 2;
      for (let i = 0; i < total; i++) {
        const h1 = Math.abs(Math.sin((i + 1 + seed) * 12.9898) * 43758.5453) % 1;
        const h2 = Math.abs(Math.sin((i + 1 + seed) * 78.233) * 19341.123) % 1;
        const ang = (i / total) * Math.PI * 2 + (h1 - 0.5) * 0.1;
        const r = (i % 2 === 0 ? 18 + h2 * 24 : 5 + h1 * 6) * scale;
        pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
      }
      return pts;
    };
    for (let v = 0; v < 6; v++) {
      starOuterUnitSets.push(buildStarLoopPoints(9 + (v % 3) * 2, v * 17 + 5, 1.0));
      starInnerUnitSets.push(buildStarLoopPoints(7 + (v % 3) * 2, v * 23 + 19, 0.58));
    }

    this.shockCircleUnitPts = [];
    const circleSegs = 44;
    for (let i = 0; i < circleSegs; i++) {
      const a = (i / circleSegs) * Math.PI * 2;
      this.shockCircleUnitPts.push([Math.cos(a) * 32, Math.sin(a) * 32]);
    }

    const outlineBackMat = new THREE.MeshBasicMaterial({
      color: DOODLE_INK_HEX,
      side: THREE.BackSide,
    });
    this.sharedDisposables.push(
      sapuStickGeo,
      sapuBrisGeo,
      bookGeo,
      bookEdges,
      stackBoxGeo,
      stackEdges,
      marbleGeo,
      marbleOutlineGeo,
      marbleSwirlGeo,
      dustPuffGeo,
      dustPuffOutGeo,
      origamiGeo,
      origamiEdges,
      trapMarbleGeo,
      trapMarbleOutGeo,
      sparkGeo,
      dustLineGeo,
      outlineBackMat
    );

    for (let i = 0; i < 28; i++) {
      const group = new THREE.Group();
      group.visible = false;

      // Sapu projectile
      const sapu = new THREE.Group();
      sapu.add(new THREE.Mesh(sapuStickGeo, inkMat));
      const sapuAccentParts: THREE.Mesh[] = [];
      for (let b = -2; b <= 2; b++) {
        const isAcc = b % 2 === 0;
        const br = new THREE.Mesh(sapuBrisGeo, isAcc ? this.accentMats.adnan : inkMat);
        br.position.set(36, b * 4, 0);
        br.rotation.z = b * 0.24;
        sapu.add(br);
        if (isAcc) sapuAccentParts.push(br);
      }

      // Dust Cloud projectile (Ayah Adnan Kibasan Debu)
      const dustCloud = new THREE.Group();
      const dustCloudParts: THREE.Mesh[] = [];
      for (const [px, py, ps] of [
        [0, 4, 1.05],
        [-14, -4, 0.78],
        [14, -2, 0.82],
      ] as const) {
        const puff = new THREE.Mesh(dustPuffGeo, whiteMat);
        puff.position.set(px, py, 0);
        puff.scale.setScalar(ps);
        const puffOut = new THREE.Mesh(dustPuffOutGeo, outlineBackMat);
        puffOut.position.set(px, py, 0);
        puffOut.scale.setScalar(ps);
        const core = new THREE.Mesh(trapMarbleGeo, this.accentMats.adnan);
        core.position.set(px, py, 6);
        dustCloud.add(puff, puffOut, core);
        dustCloudParts.push(core);
      }

      // Buku projectile
      const buku = new THREE.Group();
      buku.add(new THREE.Mesh(bookGeo, whiteMat));
      buku.add(new THREE.LineSegments(bookEdges, lineMat));
      const bukuSpine = new THREE.Mesh(new THREE.BoxGeometry(7, 25, 13.5), this.accentMats.dhira);
      bukuSpine.position.set(-14, 0, 0);
      buku.add(bukuSpine);
      this.sharedDisposables.push(bukuSpine.geometry);

      // Origami Paper Airplane projectile (Kak Dhira Lemparan Kertas Origami)
      const origami = new THREE.Group();
      origami.add(new THREE.Mesh(origamiGeo, whiteMat));
      origami.add(new THREE.LineSegments(origamiEdges, lineMat));
      const origamiCore = new THREE.Mesh(new THREE.BoxGeometry(18, 4, 4), this.accentMats.dhira);
      origami.add(origamiCore);
      this.sharedDisposables.push(origamiCore.geometry);

      // Buku stack
      const bukuStack = new THREE.Group();
      const bukuStackAccentParts: THREE.Mesh[] = [];
      for (let s = 0; s < 3; s++) {
        const isAcc = s !== 1;
        const box = new THREE.Mesh(stackBoxGeo, isAcc ? this.accentMats.dhira : whiteMat);
        const edges = new THREE.LineSegments(stackEdges, lineMat);
        box.position.set((s % 2 === 0 ? 1 : -1) * 2, 8 + s * 14, 0);
        edges.position.copy(box.position);
        bukuStack.add(box, edges);
        if (isAcc) bukuStackAccentParts.push(box);
      }

      // Kelereng projectile with thick black hull & character accent swirl
      const kelereng = new THREE.Group();
      kelereng.add(new THREE.Mesh(marbleGeo, whiteMat));
      kelereng.add(new THREE.Mesh(marbleOutlineGeo, outlineBackMat));
      const kelerengSwirl = new THREE.Mesh(marbleSwirlGeo, this.accentMats.iyen);
      kelerengSwirl.rotation.x = 0.7;
      kelereng.add(kelerengSwirl);

      // Kelereng Floor Trap cluster (Dik Iyen Jebakan Kelereng Berceceran)
      const kelerengTrap = new THREE.Group();
      const kelerengTrapSwirls: THREE.Mesh[] = [];
      for (const [tx, tz] of [
        [-10, 6],
        [10, -5],
        [0, 0],
      ] as const) {
        const tm = new THREE.Mesh(trapMarbleGeo, whiteMat);
        tm.position.set(tx, 7.5, tz);
        const tOut = new THREE.Mesh(trapMarbleOutGeo, outlineBackMat);
        tOut.position.set(tx, 7.5, tz);
        const tDot = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), this.accentMats.iyen);
        tDot.position.set(tx, 11, tz + 4);
        this.sharedDisposables.push(tDot.geometry);
        kelerengTrap.add(tm, tOut, tDot);
        kelerengTrapSwirls.push(tDot);
      }

      group.add(sapu, dustCloud, buku, origami, bukuStack, kelereng, kelerengTrap);
      this.scene.add(group);
      this.projPool.push({
        group,
        sapu,
        sapuAccentParts,
        dustCloud,
        dustCloudParts,
        buku,
        bukuSpine,
        origami,
        origamiCore,
        bukuStack,
        bukuStackAccentParts,
        kelereng,
        kelerengSwirl,
        kelerengTrap,
        kelerengTrapSwirls,
      });
    }

    for (let i = 0; i < 48; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const starMat = new THREE.MeshBasicMaterial({
        color: CHARACTER_COLOR_THEMES.adnan.accent,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
      });
      const shockMat = new THREE.MeshBasicMaterial({
        color: CHARACTER_COLOR_THEMES.adnan.accent,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      });

      const variant = i % starOuterUnitSets.length;
      const starOuterPts = starOuterUnitSets[variant];
      const starInnerPts = starInnerUnitSets[variant];
      const starOuterGeo = createClosedLoopTubeGeometry(starOuterPts, VFX_LINE_RADIUS);
      const starInnerGeo = createClosedLoopTubeGeometry(starInnerPts, VFX_LINE_RADIUS);

      const starburst = new THREE.Group();
      starburst.renderOrder = 8;
      starburst.add(new THREE.Mesh(starOuterGeo, starMat));
      starburst.add(new THREE.Mesh(starInnerGeo, starMat));

      const shockOuterGeo = createClosedLoopTubeGeometry(this.shockCircleUnitPts, VFX_LINE_RADIUS);
      const shockInnerGeo = createClosedLoopTubeGeometry(this.shockCircleUnitPts, VFX_LINE_RADIUS, 0.76);
      const shockwave = new THREE.Group();
      shockwave.renderOrder = 8;
      shockwave.add(new THREE.Mesh(shockOuterGeo, shockMat));
      shockwave.add(new THREE.Mesh(shockInnerGeo, shockMat));

      this.sharedDisposables.push(starMat, shockMat, starOuterGeo, starInnerGeo, shockOuterGeo, shockInnerGeo);

      const spark = new THREE.Mesh(sparkGeo, this.particleAccentMats.adnan);

      const dust = new THREE.Group();
      for (let d = -1; d <= 1; d++) {
        const dLine = new THREE.Mesh(dustLineGeo, this.dustMat);
        dLine.position.set(d * 5, d * 4.5, 0);
        dust.add(dLine);
      }

      group.add(starburst, shockwave, spark, dust);
      this.scene.add(group);
      this.partPool.push({
        group,
        starburst,
        starOuterGeo,
        starInnerGeo,
        starOuterPts,
        starInnerPts,
        starMat,
        shockwave,
        shockOuterGeo,
        shockInnerGeo,
        shockMat,
        spark,
        dust,
      });
    }
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const aspect = w / h;
    this.camera.aspect = aspect;
    if (aspect < 16 / 9) {
      const refHalfTan = Math.tan(THREE.MathUtils.degToRad(44 * 0.5)) * (16 / 9);
      const adaptedRad = 2 * Math.atan(refHalfTan / Math.max(0.95, aspect));
      this.baseFov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(adaptedRad), 44, 62);
    } else {
      this.baseFov = 44;
    }
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
  }

  private ensureStage(stageId: StageId, elapsed: number): void {
    if (this.currentStageId !== stageId) {
      if (this.stageBuild) {
        this.scene.remove(this.stageBuild.group);
        for (const d of this.stageBuild.disposables) d.dispose();
      }
      this.stageBuild = buildStage3D(stageId);
      this.scene.add(this.stageBuild.group);
      this.currentStageId = stageId;
      resetCatNpcForStage(this.catState, stageId);
    }

    if (this.stageBuild?.monument) {
      const baseY =
        typeof this.stageBuild.monument.userData.baseY === 'number'
          ? this.stageBuild.monument.userData.baseY
          : 252;
      this.stageBuild.monument.position.y = baseY + Math.sin(elapsed * 1.45) * 4.5;
    }

    if (stageId === 'park' && this.stageBuild?.swingSeat && this.stageBuild.swingRopes) {
      const swingPos = getParkSwingSeatPos(elapsed);
      this.stageBuild.swingSeat.position.set(swingPos.x, swingPos.seatCenterY, -swingPos.zGame);
      const posAttr = this.stageBuild.swingRopes.geometry.attributes.position;
      posAttr.setXYZ(1, 327, swingPos.seatCenterY, -swingPos.zGame);
      posAttr.setXYZ(3, 363, swingPos.seatCenterY, -swingPos.zGame);
      posAttr.needsUpdate = true;
    }
  }

  private hidePools(): void {
    for (const p of this.projPool) p.group.visible = false;
    for (const pt of this.partPool) pt.group.visible = false;
  }

  public setFaceMaskEnabled(enabled: boolean): void {
    this.faceMaskEnabled = enabled;
  }

  public setSlotFaceOverrides(faces: Partial<Record<1 | 2, string | null>>): void {
    this.slotFaceOverrides = { ...faces };
  }

  public setTitleFaceOverrides(faces: Partial<Record<CharacterId, string | null>>): void {
    this.titleFaceOverrides = { ...faces };
  }

  public renderTitleShowcase(time: number): void {
    this.ensureStage('dojo', time);
    this.dramaticBlend = 0;
    this.victoryBlend = 0;
    this.victoryElapsed = 0;
    this.lastMatchTime = 0;

    if (this.p1Rig) this.p1Rig.root.visible = false;
    if (this.p2Rig) this.p2Rig.root.visible = false;
    this.titleP1Rig.root.visible = true;
    this.titleP2Rig.root.visible = true;
    this.hidePools();

    if (Math.abs(this.camera.fov - this.baseFov) > 0.05) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }

    const camX = Math.sin(time * 0.42) * 34;
    const camY = 128;
    const camZ = 635 + Math.sin(time * 0.28) * 28;
    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(camX * 0.28, 108, -30);

    const demoP1 = createDisplayFighterRuntime(1, 'adnan', {
      x: -305,
      animTime: time,
      state: Math.sin(time * 1.4) > 0.65 ? 'attack' : 'idle',
      currentMove: Math.sin(time * 1.4) > 0.65 ? CHARACTERS.adnan.moves.sp_up_fwd : null,
      moveTimer: 0.16,
    });
    const demoP2 = createDisplayFighterRuntime(2, 'tika', {
      x: 305,
      animTime: time,
      state: Math.sin(time * 1.4) < -0.65 ? 'attack' : 'idle',
      currentMove: Math.sin(time * 1.4) < -0.65 ? CHARACTERS.tika.moves.sp_neutral : null,
      moveTimer: 0.18,
    });

    updateDoodleFighterRig(
      this.titleP1Rig,
      demoP1,
      time,
      undefined,
      this.faceMaskEnabled,
      this.titleFaceOverrides.adnan
    );
    updateDoodleFighterRig(
      this.titleP2Rig,
      demoP2,
      time,
      undefined,
      this.faceMaskEnabled,
      this.titleFaceOverrides.tika
    );

    const titleDt =
      this.lastTitleTime >= 0 && time >= this.lastTitleTime
        ? Math.min(0.05, Math.max(0.001, time - this.lastTitleTime))
        : 0.016;
    this.lastTitleTime = time;
    stepCatNpc(this.catState, titleDt, Math.random, time);
    updateDoodleCatRig(this.catRig, this.catState, time);

    this.renderer.render(this.scene, this.camera);
  }

  public renderMatchScene(state: MatchState): void {
    this.titleP1Rig.root.visible = false;
    this.titleP2Rig.root.visible = false;
    this.lastTitleTime = -1;

    this.ensureStage(state.stageId, state.matchTimeElapsed);

    if (!this.p1Rig || this.p1Char !== state.p1.charId) {
      if (this.p1Rig) {
        this.scene.remove(this.p1Rig.root);
        disposeDoodleFighterRig(this.p1Rig);
      }
      this.p1Rig = buildDoodleFighterRig(state.p1.charId);
      this.scene.add(this.p1Rig.root);
      this.p1Char = state.p1.charId;
    }

    if (!this.p2Rig || this.p2Char !== state.p2.charId) {
      if (this.p2Rig) {
        this.scene.remove(this.p2Rig.root);
        disposeDoodleFighterRig(this.p2Rig);
      }
      this.p2Rig = buildDoodleFighterRig(state.p2.charId);
      this.scene.add(this.p2Rig.root);
      this.p2Char = state.p2.charId;
    }

    this.p1Rig.root.visible = true;
    this.p2Rig.root.visible = true;

    updateDoodleFighterRig(
      this.p1Rig,
      state.p1,
      state.matchTimeElapsed,
      undefined,
      this.faceMaskEnabled,
      this.slotFaceOverrides[1]
    );
    updateDoodleFighterRig(
      this.p2Rig,
      state.p2,
      state.matchTimeElapsed,
      undefined,
      this.faceMaskEnabled,
      this.slotFaceOverrides[2]
    );

    // Real-time delta for smooth camera transitions even when match simulation is in slow-motion
    const dt =
      this.lastMatchTime > 0 && state.matchTimeElapsed >= this.lastMatchTime
        ? Math.min(0.05, Math.max(0.001, state.matchTimeElapsed - this.lastMatchTime))
        : 0.016;
    this.lastMatchTime = state.matchTimeElapsed;

    stepCatNpc(this.catState, dt, Math.random, state.matchTimeElapsed);
    updateDoodleCatRig(this.catRig, this.catState, state.matchTimeElapsed);

    if (state.dramaticCam.active) {
      this.lastCamTargetX = state.dramaticCam.targetX;
      this.lastCamTargetY = state.dramaticCam.targetY;
      this.lastOrbitSign = state.dramaticCam.orbitSign;
      this.lastIsKo = state.dramaticCam.isKo;
      this.dramaticBlend += (1 - this.dramaticBlend) * Math.min(1, dt * 13);
    } else {
      this.dramaticBlend += (0 - this.dramaticBlend) * Math.min(1, dt * 5.2);
    }

    if (state.roundPhase === 'match_end' && state.winnerSlot && !state.dramaticCam.active) {
      this.victoryElapsed += dt;
      this.victoryBlend += (1 - this.victoryBlend) * Math.min(1, dt * 4.8);
    } else {
      this.victoryElapsed = 0;
      this.victoryBlend += (0 - this.victoryBlend) * Math.min(1, dt * 8);
    }

    // Standard 2.5D fighting camera with smooth 3D angular parallax across depth layers
    const baseCamX = state.camera.x;
    const baseCamY = state.camera.y + 12;
    const baseCamZ = Math.max(380, -state.camera.z);
    const baseLookX = baseCamX * 0.68;
    const baseLookY = baseCamY - 14;

    // Cinematic Bullet-Time Action Close-Up / Dramatic Zoom camera
    const midX = (state.p1.x + state.p2.x) * 0.5;
    const targetLookX = this.lastCamTargetX * 0.72 + midX * 0.28;
    const targetLookY = Math.max(66, this.lastCamTargetY + 62);
    const closeDist = this.lastIsKo ? 285 : 330;
    const orbitYaw = this.lastOrbitSign * (0.44 + (1 - this.dramaticBlend) * 0.08);
    const closeCamX = targetLookX + Math.sin(orbitYaw) * closeDist;
    const closeCamY = Math.max(76, targetLookY - 10);
    const closeCamZ = Math.cos(orbitYaw) * closeDist;

    const b = this.dramaticBlend;
    let camX = baseCamX + (closeCamX - baseCamX) * b + state.camera.shakeOffsetX;
    let camY = baseCamY + (closeCamY - baseCamY) * b + state.camera.shakeOffsetY;
    let camZ = baseCamZ + (closeCamZ - baseCamZ) * b;
    let lookX = baseLookX + (targetLookX - baseLookX) * b;
    let lookY = baseLookY + (targetLookY - baseLookY) * b;
    let targetFov = this.baseFov - b * (this.lastIsKo ? 9.5 : 7) - this.victoryBlend * 5.5;

    // Opening Match Camera: Start at P1 POV looking at P2, then smoothly orbit into side-view battle camera
    const introOrbitDur = 1.95;
    if (state.roundNumber === 1 && state.matchTimeElapsed < introOrbitDur) {
      const tRaw = Math.max(0, Math.min(1, state.matchTimeElapsed / introOrbitDur));
      const e = tRaw < 0.5 ? 4 * tRaw * tRaw * tRaw : 1 - Math.pow(-2 * tRaw + 2, 3) / 2;

      const p1H = CHARACTERS[state.p1.charId].standingHeight;
      const p2H = CHARACTERS[state.p2.charId].standingHeight;
      const povCamX = state.p1.x + state.p1.facing * 26;
      const povCamY = Math.max(86, p1H * 0.74);
      const povCamZ = 42;
      const povLookX = state.p2.x;
      const povLookY = Math.max(66, p2H * 0.68);

      const orbitLookX = povLookX + (lookX - povLookX) * e;
      const orbitLookY = povLookY + (lookY - povLookY) * e;

      const dx0 = povCamX - povLookX;
      const dz0 = povCamZ;
      const r0 = Math.hypot(dx0, dz0);
      const ang0 = Math.atan2(dx0, dz0);

      const dx1 = camX - lookX;
      const dz1 = camZ;
      const r1 = Math.hypot(dx1, dz1);
      const ang1 = Math.atan2(dx1, dz1);

      const ang = ang0 + (ang1 - ang0) * e;
      const rad = r0 + (r1 - r0) * e;

      camX = orbitLookX + Math.sin(ang) * rad;
      camZ = Math.cos(ang) * rad;
      camY = povCamY + (camY - povCamY) * e;
      lookX = orbitLookX;
      lookY = orbitLookY;
      const povFov = Math.min(68, this.baseFov + 6);
      targetFov = povFov + (targetFov - povFov) * e;
    }

    if (this.victoryBlend > 0.005 && state.winnerSlot) {
      const winner = state.winnerSlot === 1 ? state.p1 : state.p2;
      const winH = CHARACTERS[winner.charId].standingHeight;
      const winLookX = winner.x;
      const winLookY = Math.max(58, winH * 0.54);
      const orbitRadius = 264 - Math.min(28, this.victoryElapsed * 7.5);
      const orbitAngle = winner.facing * (-0.28 + Math.min(1.72, this.victoryElapsed * 0.44));
      const winCamX = winLookX + Math.sin(orbitAngle) * orbitRadius;
      const winCamZ = Math.cos(orbitAngle) * orbitRadius;
      const winCamY = Math.max(76, winH * 0.58 + 10) + Math.sin(this.victoryElapsed * 1.15) * 9;
      const vb = this.victoryBlend;
      camX += (winCamX - camX) * vb;
      camY += (winCamY - camY) * vb;
      camZ += (winCamZ - camZ) * vb;
      lookX += (winLookX - lookX) * vb;
      lookY += (winLookY - lookY) * vb;
    }

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(lookX, lookY, 0);

    // Projectiles tinted by owner fighter's character color
    let pIdx = 0;
    for (const pr of state.projectiles) {
      if (!pr.active || pIdx >= this.projPool.length) continue;
      const slot = this.projPool[pIdx++];
      const ownerChar = pr.ownerSlot === 1 ? state.p1.charId : state.p2.charId;
      const accMat = this.accentMats[ownerChar];

      slot.group.visible = true;
      slot.group.position.set(pr.x, pr.y, -pr.z);
      slot.sapu.visible = pr.type === 'sapu_spin';
      slot.dustCloud.visible = pr.type === 'dust_cloud';
      slot.buku.visible = pr.type === 'buku_arc' || pr.type === 'buku_rain';
      slot.origami.visible = pr.type === 'origami_arc';
      slot.bukuStack.visible = pr.type === 'buku_stack';
      slot.kelereng.visible =
        pr.type === 'kelereng_burst' ||
        pr.type === 'kelereng_low' ||
        pr.type === 'kelereng_air' ||
        pr.type === 'kelereng_storm';
      slot.kelerengTrap.visible = pr.type === 'kelereng_trap';

      if (slot.sapu.visible) {
        slot.sapu.rotation.z = pr.spinAngle;
        for (const m of slot.sapuAccentParts) m.material = accMat;
      }
      if (slot.dustCloud.visible) {
        slot.dustCloud.rotation.z = pr.spinAngle * 0.4;
        slot.dustCloud.scale.setScalar(1 + Math.sin(state.matchTimeElapsed * 12) * 0.08);
        for (const m of slot.dustCloudParts) m.material = accMat;
      }
      if (slot.buku.visible) {
        slot.bukuSpine.material = accMat;
        slot.buku.rotation.set(pr.spinAngle * 0.35, pr.spinAngle * 0.25, pr.spinAngle * 0.6);
      }
      if (slot.origami.visible) {
        slot.origamiCore.material = accMat;
        slot.origami.rotation.set(0, pr.vx >= 0 ? 0 : Math.PI, Math.atan2(pr.vy, Math.abs(pr.vx) || 1) * 0.6);
      }
      if (slot.bukuStack.visible) {
        slot.group.position.set(pr.x, 0, -pr.z);
        for (const m of slot.bukuStackAccentParts) m.material = accMat;
      }
      if (slot.kelereng.visible) {
        slot.kelerengSwirl.material = accMat;
        const s = Math.max(0.65, pr.radius / 14);
        slot.kelereng.scale.setScalar(s);
        slot.kelereng.rotation.set(pr.spinAngle, pr.spinAngle * 0.7, 0);
      }
      if (slot.kelerengTrap.visible) {
        slot.group.position.set(pr.x, 0, -pr.z);
        slot.kelerengTrap.rotation.y = state.matchTimeElapsed * 2.4;
        for (const m of slot.kelerengTrapSwirls) m.material = accMat;
      }
    }
    for (let i = pIdx; i < this.projPool.length; i++) {
      this.projPool[i].group.visible = false;
    }

    // Sleek accent-color comic star impacts, thin sparks & expanding thin-line shockwaves
    let ptIdx = 0;
    for (const pt of state.particles) {
      if (!pt.active || ptIdx >= this.partPool.length) continue;
      const slot = this.partPool[ptIdx++];
      const t = pt.life / pt.maxLife;
      const easeOut = 1 - Math.pow(1 - t, 3);
      const shrink = Math.max(0.1, 1 - t);
      slot.group.visible = true;
      slot.group.position.set(pt.x, pt.y, -pt.z);
      slot.starburst.visible = pt.kind === 'starburst';
      slot.shockwave.visible = pt.kind === 'shockwave' || pt.kind === 'shockwave_ground';
      slot.spark.visible = pt.kind === 'spark';
      slot.dust.visible = pt.kind === 'dust';

      const ownerChar = pt.ownerSlot === 2 ? state.p2.charId : state.p1.charId;
      const accentHex = CHARACTER_COLOR_THEMES[ownerChar].accent;
      const burstMat = this.particleAccentMats[ownerChar];

      if (slot.starburst.visible) {
        slot.starMat.color.setHex(accentHex);
        slot.starMat.opacity = Math.max(0.08, 0.98 * (1 - t * 0.85));
        const sc = (pt.size / 32) * (0.45 + easeOut * 1.15);
        updateClosedLoopTubeGeometry(slot.starOuterGeo, slot.starOuterPts, sc, VFX_LINE_RADIUS);
        updateClosedLoopTubeGeometry(slot.starInnerGeo, slot.starInnerPts, sc, VFX_LINE_RADIUS);
        slot.starburst.rotation.z = pt.angle + t * 0.55;
      } else if (slot.shockwave.visible) {
        slot.shockMat.color.setHex(accentHex);
        slot.shockMat.opacity = Math.max(0.04, 0.92 * (1 - t));
        const sc = (pt.size / 32) * (0.28 + easeOut * 1.68);
        updateClosedLoopTubeGeometry(slot.shockOuterGeo, this.shockCircleUnitPts, sc, VFX_LINE_RADIUS);
        updateClosedLoopTubeGeometry(
          slot.shockInnerGeo,
          this.shockCircleUnitPts,
          sc * (0.68 + 0.14 * t),
          VFX_LINE_RADIUS
        );
        if (pt.kind === 'shockwave_ground') {
          slot.shockwave.rotation.set(Math.PI / 2, 0, pt.angle);
        } else {
          slot.shockwave.rotation.set(0.18, -0.18, pt.angle);
        }
      } else if (slot.spark.visible) {
        slot.spark.material = burstMat;
        slot.spark.scale.set(Math.max(0.4, shrink * (pt.size / 18)), 1, 1);
        slot.spark.rotation.z = Math.atan2(pt.vy, pt.vx);
      } else {
        slot.dust.scale.set(Math.max(0.45, (pt.size / 12) * (0.45 + t * 0.8) * shrink), 1, 1);
      }
    }
    for (let i = ptIdx; i < this.partPool.length; i++) {
      this.partPool[i].group.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    if (this.stageBuild) {
      for (const d of this.stageBuild.disposables) d.dispose();
    }
    if (this.p1Rig) disposeDoodleFighterRig(this.p1Rig);
    if (this.p2Rig) disposeDoodleFighterRig(this.p2Rig);
    disposeDoodleFighterRig(this.titleP1Rig);
    disposeDoodleFighterRig(this.titleP2Rig);
    disposeDoodleCatRig(this.catRig);
    for (const d of this.sharedDisposables) d.dispose();
    this.renderer.dispose();
  }
}

export class ThreePreviewRenderer {
  public readonly isSoftwareGl: boolean;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly canvas: HTMLCanvasElement;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rig: DoodleFighterRig;
  private charId: CharacterId;
  private pedestalGeo: THREE.CylinderGeometry;
  private pedestalMat: THREE.MeshBasicMaterial;
  private pedestalEdges: THREE.EdgesGeometry;
  private pedestalLineMat: THREE.LineBasicMaterial;
  private pedestalGroup: THREE.Group;
  private faceMaskEnabled = false;
  private customFaceUrl: string | null = null;

  constructor(
    container: HTMLElement,
    initialCharId: CharacterId,
    width = 440,
    height = 290,
    initialFaceMask = false,
    initialCustomFaceUrl: string | null = null
  ) {
    this.faceMaskEnabled = initialFaceMask;
    this.customFaceUrl = initialCustomFaceUrl;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);

    this.canvas = this.renderer.domElement;
    this.canvas.className = 'sf-preview-canvas';
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, width / height, 10, 1500);
    setupSketchbookScene(this.scene);

    // Octagonal pedestal on ground
    this.pedestalGroup = new THREE.Group();
    this.pedestalGeo = new THREE.CylinderGeometry(48, 52, 6, 8);
    this.pedestalMat = new THREE.MeshBasicMaterial({
      color: DOODLE_PAPER_HEX,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.pedestalEdges = new THREE.EdgesGeometry(this.pedestalGeo);
    this.pedestalLineMat = new THREE.LineBasicMaterial({ color: DOODLE_INK_HEX });
    const pedMesh = new THREE.Mesh(this.pedestalGeo, this.pedestalMat);
    const pedLines = new THREE.LineSegments(this.pedestalEdges, this.pedestalLineMat);
    this.pedestalGroup.add(pedMesh, pedLines);
    this.pedestalGroup.position.set(0, -3, 0);
    this.scene.add(this.pedestalGroup);

    this.charId = initialCharId;
    this.rig = buildDoodleFighterRig(initialCharId);
    this.scene.add(this.rig.root);
  }

  public setCharacter(charId: CharacterId): void {
    if (this.charId === charId) return;
    this.scene.remove(this.rig.root);
    disposeDoodleFighterRig(this.rig);
    this.charId = charId;
    this.rig = buildDoodleFighterRig(charId);
    this.scene.add(this.rig.root);
  }

  public setFaceMaskEnabled(enabled: boolean): void {
    this.faceMaskEnabled = enabled;
  }

  public setCustomFaceUrl(url: string | null): void {
    this.customFaceUrl = url;
  }

  public render(time: number): void {
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (cw > 20 && ch > 20) {
      const targetAspect = cw / ch;
      if (Math.abs(this.camera.aspect - targetAspect) > 0.01) {
        this.camera.aspect = targetAspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(cw, ch, false);
      }
    }

    const h = CHARACTERS[this.charId].standingHeight;
    const camDist = 148 + h * 1.15;
    this.camera.position.set(0, h * 0.56 + 10, camDist);
    this.camera.lookAt(0, h * 0.48, 0);
    this.pedestalGroup.rotation.y = time * 0.55;

    const demo = createDisplayFighterRuntime(1, this.charId, { animTime: time });

    updateDoodleFighterRig(
      this.rig,
      demo,
      time,
      -Math.PI / 2 + Math.sin(time * 0.9) * 0.55,
      this.faceMaskEnabled,
      this.customFaceUrl
    );
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    disposeDoodleFighterRig(this.rig);
    this.pedestalGeo.dispose();
    this.pedestalMat.dispose();
    this.pedestalEdges.dispose();
    this.pedestalLineMat.dispose();
    this.renderer.dispose();
  }
}
