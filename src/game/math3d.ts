import { Camera3D } from './types';

export const ARENA_HALF_WIDTH = 470;
const CAMERA_MIN_Z = -480;
const CAMERA_MAX_Z = -860;

export function createCamera(): Camera3D {
  return {
    x: 0,
    y: 105,
    z: -620,
    shakeTrauma: 0,
    shakeOffsetX: 0,
    shakeOffsetY: 0,
  };
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function addCameraTrauma(camera: Camera3D, amount: number): void {
  camera.shakeTrauma = clamp(camera.shakeTrauma + amount, 0, 1);
}

export function updateCamera(
  camera: Camera3D,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  dt: number,
  timeNow: number
): void {
  const midX = (p1x + p2x) * 0.5;
  const distX = Math.abs(p1x - p2x);
  const maxY = Math.max(p1y, p2y);

  // Clamp camera horizontal pan so edges of arena stay framed
  const targetX = clamp(midX, -230, 230);
  const targetY = 98 + maxY * 0.28;

  // Dynamic zoom in when close, zoom out when far
  const distNorm = clamp((distX - 110) / 560, 0, 1);
  const targetZ = CAMERA_MIN_Z + (CAMERA_MAX_Z - CAMERA_MIN_Z) * distNorm;

  camera.x = damp(camera.x, targetX, 8.5, dt);
  camera.y = damp(camera.y, targetY, 7.0, dt);
  camera.z = damp(camera.z, targetZ, 6.5, dt);

  // Decay screen shake using trauma^2
  if (camera.shakeTrauma > 0) {
    camera.shakeTrauma = Math.max(0, camera.shakeTrauma - dt * 2.8);
    const shakeMag = camera.shakeTrauma * camera.shakeTrauma * 22;
    camera.shakeOffsetX = Math.sin(timeNow * 67.3) * shakeMag;
    camera.shakeOffsetY = Math.cos(timeNow * 83.1) * shakeMag * 0.85;
  } else {
    camera.shakeOffsetX = 0;
    camera.shakeOffsetY = 0;
  }
}
