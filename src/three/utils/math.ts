import { Vector3 } from "three";
import { CAMERA } from "../config";

/** Frame-rate independent exponential smoothing toward a target. */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Shortest-path angular damping (radians). */
export function dampAngle(
  current: number,
  target: number,
  lambda: number,
  dt: number,
): number {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Deterministic PRNG (mulberry32) so procedural layouts are stable between reloads. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Ground-plane basis derived from the fixed camera direction. Because the
 * camera never rotates, "screen up" is a constant world direction, so W
 * always walks up the screen and D always walks right.
 */
export const CAMERA_DIRECTION = new Vector3(...CAMERA.direction).normalize();

export const SCREEN_FORWARD = new Vector3(
  -CAMERA_DIRECTION.x,
  0,
  -CAMERA_DIRECTION.z,
).normalize();

export const SCREEN_RIGHT = new Vector3(-SCREEN_FORWARD.z, 0, SCREEN_FORWARD.x);

/** Yaw that aligns an object's local X axis with the screen's right axis (+Z then faces the camera). */
export const SCREEN_ALIGNED_YAW = Math.atan2(-SCREEN_RIGHT.z, SCREEN_RIGHT.x);

/** Y rotation that makes an object's +Z face point toward the camera. */
export const YAW_FACING_CAMERA = Math.atan2(
  CAMERA_DIRECTION.x,
  CAMERA_DIRECTION.z,
);

/** Converts screen-aligned layout coordinates (right, up) into world XZ. */
export function screenToWorld(
  right: number,
  up: number,
): { x: number; z: number } {
  return {
    x: SCREEN_RIGHT.x * right + SCREEN_FORWARD.x * up,
    z: SCREEN_RIGHT.z * right + SCREEN_FORWARD.z * up,
  };
}
