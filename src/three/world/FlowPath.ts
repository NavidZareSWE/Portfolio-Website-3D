import { BufferAttribute, BufferGeometry, Vector3 } from "three";

/** A point on the ground in a scene's local frame: (x, z). */
export type GroundPoint = readonly [number, number];

/**
 * A polyline on the ground, sampled by distance along it. Used for things
 * that travel along the floor (data packets, routing queries) and for the
 * light strips drawn under them.
 */
export class FlowPath {
  readonly length: number;
  private readonly cumulative: number[];

  constructor(readonly points: readonly GroundPoint[]) {
    this.cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1];
      const [bx, bz] = points[i];
      this.cumulative.push(
        this.cumulative[i - 1] + Math.hypot(bx - ax, bz - az),
      );
    }
    this.length = this.cumulative[this.cumulative.length - 1];
  }

  /** Point at distance `s` (clamped to the path), written to `out` with y = 0. */
  at(s: number, out: Vector3): Vector3 {
    const i = this.segmentAt(s);
    const [ax, az] = this.points[i];
    const [bx, bz] = this.points[i + 1];
    const span = this.cumulative[i + 1] - this.cumulative[i];
    const t = span > 0 ? (s - this.cumulative[i]) / span : 0;
    return out.set(ax + (bx - ax) * t, 0, az + (bz - az) * t);
  }

  /** Unit direction of travel at distance `s`, written to `out` (y = 0). */
  direction(s: number, out: Vector3): Vector3 {
    const i = this.segmentAt(s);
    const [ax, az] = this.points[i];
    const [bx, bz] = this.points[i + 1];
    return out.set(bx - ax, 0, bz - az).normalize();
  }

  private segmentAt(s: number): number {
    const clamped = Math.min(Math.max(s, 0), this.length);
    let i = 0;
    while (i < this.points.length - 2 && this.cumulative[i + 1] < clamped) i++;
    return i;
  }
}

/**
 * Flat strip along each path, `height` above the floor. `uv.x` is the
 * distance along the path in metres (so a track material can flow along
 * it) and `uv.y` runs 0..1 across the strip. Each segment is extended by
 * half the width past its end, so corners are filled.
 */
export function buildTrack(
  paths: readonly FlowPath[],
  width: number,
  height = 0.02,
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const half = width / 2;

  for (const path of paths) {
    let travelled = 0;
    for (let i = 0; i < path.points.length - 1; i++) {
      const [ax, az] = path.points[i];
      const [bx, bz] = path.points[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 1e-6) continue;
      const dx = (bx - ax) / length;
      const dz = (bz - az) / length;
      const last = i === path.points.length - 2;
      const end = length + (last ? 0 : half);
      // Left/right of the direction of travel.
      const nx = -dz * half;
      const nz = dx * half;
      const base = positions.length / 3;
      const corners: [number, number, number][] = [
        [ax + nx, az + nz, 0],
        [ax - nx, az - nz, 1],
        [ax + dx * end + nx, az + dz * end + nz, 0],
        [ax + dx * end - nx, az + dz * end - nz, 1],
      ];
      corners.forEach(([x, z, across], k) => {
        positions.push(x, height, z);
        normals.push(0, 1, 0);
        uvs.push(travelled + (k < 2 ? 0 : end), across);
      });
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      travelled += length;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array(normals), 3),
  );
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
