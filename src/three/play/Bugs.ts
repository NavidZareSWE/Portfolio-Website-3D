import { THEME } from "@/theme/theme";
import { Group, Mesh, Vector3, type Material } from "three";
import type { SceneLabels } from "../labels";
import type { CollisionSystem } from "../physics/CollisionSystem";
import { SCREEN_ALIGNED_YAW, createRandom, screenToWorld } from "../utils/math";
import type { GlyphKit } from "../world/GlyphKit";
import { PLAY_LAYOUT } from "../world/layout";
import { PropKit, TINT } from "../world/PropKit";
import { TextPlane } from "../world/Vignette";

const BUG = {
  radius: 0.16,
  wanderSpeed: 0.7,
  fleeSpeed: 2.3,
  /** The player scares a bug inside this distance. */
  fleeRadius: 2.4,
  /** Landing within this distance of a bug squashes it. */
  squashRadius: 0.62,
  /** Seconds a squashed bug stays flat before it is cleared away. */
  flatTime: 1.1,
  /** Seconds before a new bug crawls out somewhere else. */
  respawnTime: 7,
  /** New bugs appear at least this far from the player. */
  respawnDistance: 6,
};

type BugState = "alive" | "squashed" | "gone";

interface Bug {
  root: Group;
  legsA: Mesh;
  legsB: Mesh;
  position: Vector3;
  heading: number;
  speed: number;
  nest: number;
  turnTimer: number;
  state: BugState;
  timer: number;
  /** 0..1 grow-in when a bug appears. */
  appear: number;
}

/** One body (with head and antennae) and the two alternating leg tripods. */
function buildBugParts(material: Material) {
  const body = new PropKit();
  body.sphere(0.13, [0, 0.09, 0], {
    scale: [0.85, 0.6, 1.25],
    tint: TINT.light,
  });
  body.sphere(0.075, [0, 0.1, 0.17], {
    scale: [1, 0.85, 0.9],
    tint: TINT.base,
  });
  body.bar([0.03, 0.13, 0.22], [0.09, 0.2, 0.36], 0.012, { tint: TINT.dark });
  body.bar([-0.03, 0.13, 0.22], [-0.09, 0.2, 0.36], 0.012, { tint: TINT.dark });
  body.box([0.01, 0.012, 0.22], [0, 0.155, -0.02], { tint: TINT.dark });

  const legs = (offsets: [number, number][]) => {
    const kit = new PropKit();
    for (const [side, z] of offsets) {
      kit.bar([side * 0.08, 0.08, z], [side * 0.2, 0.0, z + 0.04], 0.02, {
        tint: TINT.dark,
      });
    }
    return kit.build(material, "bug-legs");
  };
  return {
    body: body.build(material, "bug-body"),
    // Tripod gait: front-left, middle-right, back-left move together.
    legsA: legs([
      [-1, 0.1],
      [1, 0],
      [-1, -0.1],
    ]),
    legsB: legs([
      [1, 0.1],
      [-1, 0],
      [1, -0.1],
    ]),
  };
}

/**
 * Bugs that crawl around the open ground. They wander near their nests and
 * scatter when the player comes close; landing a jump on one squashes it
 * ("BUG FIXED"), and a new one crawls out elsewhere a few seconds later.
 */
export class Bugs {
  readonly group = new Group();
  private readonly bugs: Bug[] = [];
  private readonly random = createRandom(1337);
  private readonly popup: TextPlane;
  private readonly popupHolder = new Group();
  private popupTime = -1;
  private readonly tmp = new Vector3();

  constructor(
    kit: GlyphKit,
    private readonly collisions: CollisionSystem,
    labels: SceneLabels,
  ) {
    this.group.name = "bugs";
    const material = kit.solid({
      color: THEME.alert,
      accent: THEME.amber,
      base: "#1c0308",
      cell: 0.035,
      brightness: 1.25,
    });
    const parts = buildBugParts(material);
    for (let i = 0; i < PLAY_LAYOUT.bugCount; i++) {
      const root = new Group();
      root.add(parts.body.clone());
      const legsA = parts.legsA.clone();
      const legsB = parts.legsB.clone();
      root.add(legsA, legsB);
      this.group.add(root);
      const nest = i % PLAY_LAYOUT.bugNests.length;
      const bug: Bug = {
        root,
        legsA,
        legsB,
        position: new Vector3(),
        heading: this.random() * Math.PI * 2,
        speed: BUG.wanderSpeed,
        nest,
        turnTimer: 0,
        state: "alive",
        timer: 0,
        appear: 1,
      };
      this.placeInNest(bug, nest);
      this.bugs.push(bug);
    }

    this.popup = new TextPlane({
      width: 2.2,
      height: 0.56,
      color: THEME.green,
      frame: true,
      rtl: labels.rtl,
    });
    this.popup.setText(labels.world.bugFixed);
    this.popup.opacity = 0;
    this.popupHolder.rotation.y = SCREEN_ALIGNED_YAW;
    this.popupHolder.add(this.popup.mesh);
    this.group.add(this.popupHolder);
  }

  private placeInNest(bug: Bug, nest: number) {
    const n = PLAY_LAYOUT.bugNests[nest];
    const angle = this.random() * Math.PI * 2;
    const distance = Math.sqrt(this.random()) * n.radius;
    const p = screenToWorld(
      n.right + Math.cos(angle) * distance,
      n.up + Math.sin(angle) * distance,
    );
    bug.position.set(p.x, 0, p.z);
    this.collisions.resolve(bug.position, BUG.radius);
    bug.nest = nest;
  }

  /**
   * Squashes every live bug within reach of a landing at (x, z).
   * Returns how many were squashed.
   */
  squashAt(x: number, z: number, time: number): number {
    let count = 0;
    for (const bug of this.bugs) {
      if (bug.state !== "alive") continue;
      const d = Math.hypot(bug.position.x - x, bug.position.z - z);
      if (d > BUG.squashRadius) continue;
      bug.state = "squashed";
      bug.timer = 0;
      count++;
      this.popupHolder.position.set(bug.position.x, 1.9, bug.position.z);
      this.popupTime = time;
    }
    return count;
  }

  update(time: number, dt: number, player: Vector3, motion: number) {
    for (const bug of this.bugs) {
      if (bug.state === "alive") this.crawl(bug, time, dt, player, motion);
      else if (bug.state === "squashed") {
        bug.timer += dt;
        bug.root.scale.set(1.25, 0.18, 1.25);
        if (bug.timer > BUG.flatTime) {
          bug.state = "gone";
          bug.timer = 0;
          bug.root.visible = false;
        }
      } else {
        bug.timer += dt;
        if (bug.timer > BUG.respawnTime) this.respawn(bug, player);
      }
      if (bug.state !== "gone") {
        bug.root.position.copy(bug.position);
        bug.root.rotation.y = bug.heading;
      }
    }

    // "BUG FIXED" rises and fades over a second and a half.
    const age = this.popupTime < 0 ? Infinity : time - this.popupTime;
    if (age < 1.5) {
      this.popup.opacity = Math.min(1, (1.5 - age) * 2);
      this.popup.mesh.position.y = age * 0.5;
    } else {
      this.popup.opacity = 0;
    }
  }

  private crawl(
    bug: Bug,
    time: number,
    dt: number,
    player: Vector3,
    motion: number,
  ) {
    const dx = bug.position.x - player.x;
    const dz = bug.position.z - player.z;
    const distance = Math.hypot(dx, dz);
    const fleeing = distance < BUG.fleeRadius && player.y < 1.5;

    if (fleeing) {
      // Run away, with a little zig-zag so they are not trivial to catch.
      bug.heading = Math.atan2(dx, dz) + Math.sin(time * 9 + bug.nest) * 0.5;
      bug.speed = BUG.fleeSpeed;
    } else {
      bug.turnTimer -= dt;
      const nest = PLAY_LAYOUT.bugNests[bug.nest];
      const home = screenToWorld(nest.right, nest.up);
      const hx = home.x - bug.position.x;
      const hz = home.z - bug.position.z;
      if (Math.hypot(hx, hz) > nest.radius) {
        bug.heading = Math.atan2(hx, hz);
      } else if (bug.turnTimer <= 0) {
        bug.heading += (this.random() - 0.5) * 2.4;
        bug.turnTimer = 0.8 + this.random() * 2;
      }
      bug.speed =
        BUG.wanderSpeed * (0.6 + 0.4 * Math.sin(time * 1.3 + bug.nest * 2));
    }

    this.tmp.copy(bug.position);
    bug.position.x += Math.sin(bug.heading) * bug.speed * dt;
    bug.position.z += Math.cos(bug.heading) * bug.speed * dt;
    this.collisions.resolve(bug.position, BUG.radius);
    // Blocked: pick a new direction next time.
    if (bug.position.distanceToSquared(this.tmp) < (bug.speed * dt * 0.3) ** 2)
      bug.turnTimer = 0;

    bug.appear = Math.min(1, bug.appear + dt * 2.5);
    bug.root.scale.setScalar(bug.appear);
    const gait = time * (bug.speed * 14 + 4) * Math.max(motion, 0.4);
    bug.legsA.rotation.y = Math.sin(gait) * 0.35;
    bug.legsB.rotation.y = -Math.sin(gait) * 0.35;
  }

  private respawn(bug: Bug, player: Vector3) {
    const nests = PLAY_LAYOUT.bugNests;
    for (let attempt = 0; attempt < 8; attempt++) {
      this.placeInNest(bug, Math.floor(this.random() * nests.length));
      if (bug.position.distanceTo(player) > BUG.respawnDistance) break;
    }
    bug.state = "alive";
    bug.timer = 0;
    bug.appear = 0;
    bug.heading = this.random() * Math.PI * 2;
    bug.root.visible = true;
    bug.root.scale.setScalar(0.01);
  }
}
