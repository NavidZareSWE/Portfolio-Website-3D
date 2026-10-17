import type { Vector3 } from "three";
import { PLAYER, WORLD } from "../config";

/**
 * Colliders are vertical prisms on the ground plane. `top` is the walkable
 * surface height; `Infinity` marks something that cannot be stood on.
 */
export type Collider =
  | { kind: "circle"; x: number; z: number; radius: number; top: number }
  | {
      /** Oriented box: centre, half extents along its local X/Z, rotation around Y. */
      kind: "box";
      x: number;
      z: number;
      halfWidth: number;
      halfDepth: number;
      yaw: number;
      top: number;
    };

export class CollisionSystem {
  private colliders: Collider[] = [];

  constructor(private readonly playRadius: number = WORLD.playRadius) {}

  add(collider: Collider) {
    this.colliders.push(collider);
  }

  /**
   * Pushes a circle of `radius` (at `position.xz`) out of every collider it is
   * not standing on top of, then keeps it inside the circular play area.
   * Mutates `position` in place; allocation-free.
   */
  resolve(position: Vector3, radius: number) {
    for (const c of this.colliders) {
      // Surfaces within step height are climbed (see groundHeightAt), not blocked.
      // This also keeps a player resting on a surface from being pushed off it.
      if (position.y >= c.top - PLAYER.stepHeight) continue;

      if (c.kind === "circle") {
        const dx = position.x - c.x;
        const dz = position.z - c.z;
        const minDist = c.radius + radius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 1e-6;
          const push = (minDist - dist) / dist;
          position.x += dx * push;
          position.z += dz * push;
        }
      } else {
        // Work in the box's local frame.
        const cos = Math.cos(c.yaw);
        const sin = Math.sin(c.yaw);
        const wx = position.x - c.x;
        const wz = position.z - c.z;
        let lx = wx * cos - wz * sin;
        let lz = wx * sin + wz * cos;
        const cx = Math.min(Math.max(lx, -c.halfWidth), c.halfWidth);
        const cz = Math.min(Math.max(lz, -c.halfDepth), c.halfDepth);
        const dx = lx - cx;
        const dz = lz - cz;
        const distSq = dx * dx + dz * dz;
        let moved = false;
        if (distSq > 1e-10) {
          if (distSq < radius * radius) {
            const dist = Math.sqrt(distSq);
            const push = (radius - dist) / dist;
            lx += dx * push;
            lz += dz * push;
            moved = true;
          }
        } else {
          // Centre is inside the box: leave along the axis of least penetration.
          const penX = c.halfWidth - Math.abs(lx);
          const penZ = c.halfDepth - Math.abs(lz);
          if (penX < penZ) lx = Math.sign(lx || 1) * (c.halfWidth + radius);
          else lz = Math.sign(lz || 1) * (c.halfDepth + radius);
          moved = true;
        }
        if (moved) {
          // Back to world space (inverse rotation).
          position.x = c.x + lx * cos + lz * sin;
          position.z = c.z - lx * sin + lz * cos;
        }
      }
    }

    // Circular world boundary.
    const limit = this.playRadius - radius;
    const lenSq = position.x * position.x + position.z * position.z;
    if (lenSq > limit * limit) {
      const scale = limit / Math.sqrt(lenSq);
      position.x *= scale;
      position.z *= scale;
    }
  }

  /**
   * Highest walkable surface under (x, z) that a body whose feet are at `y`
   * can stand on (surfaces up to `PLAYER.stepHeight` above the feet count,
   * so low steps are climbed automatically).
   */
  groundHeightAt(x: number, z: number, y: number): number {
    let ground =
      x * x + z * z <= this.playRadius * this.playRadius ? 0 : -Infinity;
    for (const c of this.colliders) {
      if (!Number.isFinite(c.top) || c.top <= ground) continue;
      if (y < c.top - PLAYER.stepHeight) continue;
      let inside: boolean;
      if (c.kind === "circle") {
        inside = (x - c.x) ** 2 + (z - c.z) ** 2 <= c.radius * c.radius;
      } else {
        const cos = Math.cos(c.yaw);
        const sin = Math.sin(c.yaw);
        const wx = x - c.x;
        const wz = z - c.z;
        inside =
          Math.abs(wx * cos - wz * sin) <= c.halfWidth &&
          Math.abs(wx * sin + wz * cos) <= c.halfDepth;
      }
      if (inside) ground = c.top;
    }
    return ground;
  }
}
