import {
  Group,
  type Camera,
  type Texture,
  type Vector3,
  type WebGLRenderer,
} from "three";
import { WORLD } from "../config";
import { AsciiBlocks, type BlockSpec } from "../effects/AsciiBlocks";
import { AsciiFloor, type FloorLogo } from "../effects/AsciiFloor";
import { AsciiRain } from "../effects/AsciiRain";
import type { CollisionSystem } from "../physics/CollisionSystem";
import { SCREEN_ALIGNED_YAW, createRandom, screenToWorld } from "../utils/math";

interface ClusterBlock {
  /** Offset from the cluster origin in layout units (right, up). */
  right: number;
  up: number;
  width: number;
  depth: number;
  height: number;
}

/**
 * Walkable data-block clusters inside the play area (layout units). Heights
 * step up so the chibi (jump apex ≈ 1.15 m) can hop from block to block.
 */
const CLUSTERS: { right: number; up: number; blocks: ClusterBlock[] }[] = [
  // Placed in the open ground between the cards and their scenes.
  {
    right: -7,
    up: -6.5,
    blocks: [
      { right: 0, up: 0, width: 1.6, depth: 1.2, height: 0.35 },
      { right: 1.4, up: 0.1, width: 1.2, depth: 1.2, height: 0.7 },
    ],
  },
  {
    right: 7.5,
    up: -7,
    blocks: [
      { right: 0, up: 0, width: 1.3, depth: 1.3, height: 0.45 },
      { right: 0, up: 1.25, width: 1.3, depth: 1.1, height: 0.9 },
    ],
  },
  {
    right: -8.5,
    up: 9.5,
    blocks: [
      { right: 0, up: 0, width: 1.6, depth: 2.2, height: 0.5 },
      { right: 0.1, up: -1.9, width: 1.2, depth: 1.4, height: 1.0 },
    ],
  },
  {
    right: 8,
    up: 6,
    blocks: [
      { right: 0, up: 0, width: 1.6, depth: 1.6, height: 0.6 },
      { right: 1.2, up: 1.2, width: 1.0, depth: 1.0, height: 1.2 },
    ],
  },
  {
    right: -5,
    up: 24,
    blocks: [{ right: 0, up: 0, width: 2.4, depth: 1.2, height: 0.4 }],
  },
  {
    right: 1,
    up: -21,
    blocks: [
      { right: 0, up: 0, width: 1.4, depth: 1.4, height: 0.8 },
      { right: 1.3, up: 0, width: 1.1, depth: 1.1, height: 0.4 },
    ],
  },
  {
    right: 26,
    up: -3,
    blocks: [
      { right: 0, up: 0, width: 1.4, depth: 1.8, height: 0.5 },
      { right: 0, up: 1.6, width: 1.2, depth: 1.2, height: 0.95 },
    ],
  },
  {
    right: -27,
    up: -3.5,
    blocks: [{ right: 0, up: 0, width: 2.0, depth: 1.3, height: 0.45 }],
  },
];

/** The NZSWE logo is written into the floor in green glyphs, just below spawn. */
// 14 × 15 floor cells: the smallest size at which the N diagonal stays legible in glyphs.
const FLOOR_LOGO = {
  center: { right: 0, up: -3.6 },
  size: { width: 4.2, height: 4.4 },
};

/** A grid-aligned "city" of glyph towers beyond the play area. */
function createSkyline(seed: number): BlockSpec[] {
  const random = createRandom(seed);
  const blocks: BlockSpec[] = [];
  const spacing = 2.3;
  const reach = 58;
  for (let gx = -reach; gx <= reach; gx += spacing) {
    for (let gy = -reach; gy <= reach; gy += spacing) {
      const r = Math.hypot(gx, gy);
      if (r < WORLD.playRadius + 1.6 || r > reach) continue;
      if (random() < 0.32) continue;
      const p = screenToWorld(
        gx + (random() - 0.5) * 0.3,
        gy + (random() - 0.5) * 0.3,
      );
      const distance = r - WORLD.playRadius;
      blocks.push({
        x: p.x,
        z: p.z,
        width: 1.3 + random() * 0.8,
        depth: 1.3 + random() * 0.8,
        height: Math.min(
          14,
          0.6 + distance * 0.3 + random() * (2 + distance * 0.35),
        ),
        yaw: SCREEN_ALIGNED_YAW,
      });
    }
  }
  return blocks;
}

export interface Environment {
  group: Group;
  floor: AsciiFloor;
  update(time: number, player: Vector3, cardFocus: readonly number[]): void;
  /** Off-screen passes that must run before the scene is rendered. */
  prepare(renderer: WebGLRenderer, camera: Camera): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

export function createEnvironment(
  atlas: Texture,
  logoMask: Texture,
  collisions: CollisionSystem,
): Environment {
  const group = new Group();
  group.name = "environment";

  const logo: FloorLogo = { texture: logoMask, ...FLOOR_LOGO };
  const floor = new AsciiFloor(atlas, logo);
  group.add(floor.mesh);

  const walkable: BlockSpec[] = [];
  for (const cluster of CLUSTERS) {
    for (const block of cluster.blocks) {
      const p = screenToWorld(
        cluster.right + block.right,
        cluster.up + block.up,
      );
      walkable.push({
        x: p.x,
        z: p.z,
        width: block.width,
        depth: block.depth,
        height: block.height,
        yaw: SCREEN_ALIGNED_YAW,
      });
    }
  }
  for (const block of walkable) {
    collisions.add({
      kind: "box",
      x: block.x,
      z: block.z,
      halfWidth: block.width / 2,
      halfDepth: block.depth / 2,
      yaw: block.yaw,
      top: block.height,
    });
  }

  const blocks = new AsciiBlocks(atlas, [...walkable, ...createSkyline(42)]);
  group.add(blocks.mesh);

  const rain = new AsciiRain(atlas);
  group.add(rain.group);

  return {
    group,
    floor,
    update(time, player, cardFocus) {
      floor.update(time, player, cardFocus);
      blocks.update(time);
      rain.update(time);
    },
    prepare(renderer, camera) {
      floor.renderField(renderer, camera);
    },
    setReducedMotion(reduced) {
      floor.setReducedMotion(reduced);
      blocks.setReducedMotion(reduced);
      rain.setReducedMotion(reduced);
    },
    dispose() {
      floor.dispose();
    },
  };
}
