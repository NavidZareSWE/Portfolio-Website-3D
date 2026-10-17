import { Group, Mesh, Vector3, type Material } from "three";
import { THEME } from "@/theme/theme";
import { Fader } from "../Fade";
import type { GlyphFigure } from "../GlyphFigure";
import { SCENES } from "../../config";
import type { Collider } from "../../physics/CollisionSystem";
import { PropKit, TINT, type Vec3 } from "../PropKit";
import { SIT_CONTROLS } from "../poses";
import { TextPlane, Vignette, type VignetteContext } from "../Vignette";

/* Site layout (metres, site-local; −Z is up the screen). */
const MAST = new Vector3(1.7, 0, -1.4);
// Kept low enough that the cab and jib stay inside the game camera's frame.
const MAST_HEIGHT = 3.4;
const JIB_LENGTH = 5.0;
const BUILDING = {
  x: -1.6,
  z: -0.8,
  width: 2.4,
  depth: 2.0,
  storey: 0.8,
  storeys: 2,
};
const ROOF_Y = BUILDING.storey * BUILDING.storeys + 0.08;
const BLOCK: Vec3 = [0.72, 0.46, 0.86];
const BLOCK_CAP = 0.05;
const SLOTS: [number, number][] = [
  [-0.8, -0.46],
  [0, -0.46],
  [0.8, -0.46],
  [-0.8, 0.46],
  [0, 0.46],
  [0.8, 0.46],
].map(([x, z]) => [BUILDING.x + x, BUILDING.z + z] as [number, number]);
const PILE = new Vector3(3.7, 0, 0.7);

/**
 * Climbing route to the roof (site-local metres; heights are standable tops).
 * Every rise is below the jump apex (~1.15 m in world units after the 1.5x
 * scene scale), so the player can hop step by step:
 * pallet → crate → deck 1 → crate on the deck → deck 2 → roof.
 */
const CLIMB: {
  kind: "deck" | "box";
  at: [number, number];
  size: [number, number];
  base: number;
  top: number;
}[] = [
  { kind: "box", at: [0.6, 0.48], size: [0.4, 0.5], base: 0, top: 0.3 },
  { kind: "box", at: [0.2, 0.48], size: [0.4, 0.5], base: 0, top: 0.58 },
  { kind: "deck", at: [-0.8, 0.475], size: [1.6, 0.55], base: 0, top: 0.83 },
  { kind: "box", at: [-1.35, 0.48], size: [0.4, 0.4], base: 0.83, top: 1.15 },
  { kind: "deck", at: [-2.25, 0.475], size: [1.3, 0.55], base: 0, top: 1.63 },
];
const PILE_TOP = BLOCK[1] * 2;
/** Height of the hook's underside while travelling (clears the roof with a load). */
const TRAVEL_Y = MAST_HEIGHT - 0.7;
const HOOK_DROP = 0.32; // hook bottom → load top
/** Cab floor height relative to the slewing ring (the seated operator's base). */
const CAB_FLOOR = -0.72;

/** One delivery: lower, attach, lift, swing, lower, release, lift, swing back (s). */
const PHASES = {
  lower: 1.4,
  attach: 0.5,
  lift: 1.4,
  swing: 3.0,
  set: 1.4,
  release: 0.5,
  rise: 1.0,
  back: 3.0,
};
const DELIVERY = Object.values(PHASES).reduce((a, b) => a + b, 0);
const PAUSE_WHEN_DONE = 4;
/** End of the pause: the finished roof dissolves, then stays empty briefly. */
const ROOF_FADE_TIME = 1.1;
const ROOF_EMPTY_TIME = 0.3;

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * Projects: a construction site. The hacker sits in the cab of a tower
 * crane, swinging glyph blocks from the stock pile onto the top floor of a
 * building under construction; when the floor is complete it resets.
 */
export class ConstructionSite extends Vignette {
  private readonly operator: GlyphFigure;
  private readonly slew = new Group();
  private readonly trolley: Mesh;
  private readonly cable: Mesh;
  private readonly hook: Mesh;
  private readonly load: Mesh;
  private readonly pileTop: Mesh;
  private readonly slots: Mesh[] = [];
  private readonly roofFader: Fader;
  private readonly drum: Mesh;
  private readonly slotColliders: Collider[];
  private readonly pileCollider: Collider;

  constructor(ctx: VignetteContext, center: { right: number; up: number }) {
    super(ctx, center, "vignette-projects", SCENES.npcScale);
    const prop = ctx.materials.prop;

    const kit = new PropKit();
    // Site pad.
    kit.box([9.4, 0.015, 6.4], [0.2, 0, 0], { tint: TINT.dark });
    this.buildBuilding(kit);
    this.buildMast(kit);
    this.buildSiteProps(kit);
    this.group.add(kit.build(prop, "projects-site"));
    this.buildLooseProps(prop);

    // Blocks: stock pile top (the next one to lift), the hanging load, the roof slots.
    const blockKit = () => {
      const k = new PropKit();
      // The body stops where the green cap starts: two top faces at the same
      // height z-fight, flickering between cap and body as the camera eases.
      k.box([BLOCK[0], BLOCK[1] - BLOCK_CAP, BLOCK[2]], [0, 0, 0], {
        tint: TINT.light,
      });
      k.box(
        [BLOCK[0] + 0.02, BLOCK_CAP, BLOCK[2] + 0.02],
        [0, BLOCK[1] - BLOCK_CAP, 0],
        { tint: TINT.accent },
      );
      return k.build(prop, "projects-block");
    };
    const blockTemplate = blockKit();
    this.pileTop = blockTemplate;
    this.pileTop.position.set(PILE.x, PILE_TOP, PILE.z);
    this.group.add(this.pileTop);
    // Roof blocks share one fade: the finished floor dissolves before the next build.
    const roofBlocks = new Group();
    roofBlocks.name = "projects-roof-blocks";
    this.group.add(roofBlocks);
    for (const [x, z] of SLOTS) {
      const slot = blockTemplate.clone();
      slot.position.set(x, ROOF_Y, z);
      slot.visible = false;
      roofBlocks.add(slot);
      this.slots.push(slot);
    }
    this.roofFader = new Fader(roofBlocks);

    // Slewing top: jib, counter-jib, cab with the operator, trolley, cable, hook, load.
    this.slew.position.set(MAST.x, MAST_HEIGHT, MAST.z);
    this.group.add(this.slew);
    const top = new PropKit();
    this.buildSlewingTop(top);
    this.slew.add(top.build(prop, "projects-crane-top"));

    const trolleyKit = new PropKit();
    trolleyKit.box([0.34, 0.1, 0.42], [0, -0.1, 0], { tint: TINT.base });
    for (const z of [-0.16, 0.16])
      trolleyKit.cylinder(0.04, 0.04, 0.03, [0, 0, z], {
        rot: [Math.PI / 2, 0, 0],
        tint: TINT.dark,
        centered: true,
      });
    this.trolley = trolleyKit.build(prop, "projects-trolley");
    this.slew.add(this.trolley);

    const cableKit = new PropKit();
    for (const z of [-0.05, 0.05])
      cableKit.bar([0, 0, z], [0, -1, z], 0.014, { tint: TINT.dark });
    this.cable = cableKit.build(prop, "projects-cable");
    this.slew.add(this.cable);

    const hookKit = new PropKit();
    hookKit.box([0.16, 0.18, 0.16], [0, 0.0, 0], { tint: TINT.accent });
    hookKit.torus(0.06, 0.016, [0, -0.04, 0], {
      arc: Math.PI * 1.5,
      rot: [0, 0, Math.PI],
      tint: TINT.light,
    });
    for (const x of [-0.25, 0.25])
      hookKit.bar([0, -0.04, 0], [x, -HOOK_DROP + 0.01, 0], 0.012, {
        tint: TINT.dark,
      });
    this.hook = hookKit.build(prop, "projects-hook");
    this.slew.add(this.hook);
    this.load = blockTemplate.clone();
    this.load.visible = false;
    this.slew.add(this.load);

    this.operator = this.figure(true, "projects-operator");
    // Seat in the cab (see buildSlewingTop), facing along the jib (+X).
    this.operator.root.position.set(0.42, CAB_FLOOR, 0.62);
    this.operator.root.rotation.y = Math.PI / 2;
    this.slew.add(this.operator.root);

    // Cement mixer drum turns slowly.
    const drumKit = new PropKit();
    drumKit.cylinder(0.32, 0.22, 0.5, [0, -0.25, 0], {
      tint: TINT.light,
      segments: 16,
    });
    drumKit.cylinder(0.22, 0.14, 0.18, [0, 0.25, 0], {
      tint: TINT.light,
      segments: 16,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      drumKit.bar(
        [Math.cos(a) * 0.31, -0.2, Math.sin(a) * 0.31],
        [Math.cos(a + 0.6) * 0.27, 0.15, Math.sin(a + 0.6) * 0.27],
        0.03,
        { tint: TINT.accent },
      );
    }
    this.drum = drumKit.build(prop, "projects-drum");
    this.drum.position.set(-3.9, 0.62, 1.4);
    this.drum.rotation.z = -0.7;
    this.group.add(this.drum);

    const sign = new TextPlane({
      width: 1.9,
      height: 0.44,
      color: THEME.green,
      frame: true,
      fontSize: 23,
      rtl: ctx.labels.rtl,
    });
    // The code line stays as-is; only the heading is translated.
    sign.setText(
      `${ctx.labels.world.underConstruction}\n${ctx.labels.world.build}`,
    );
    sign.mesh.position.set(0.35, 1.05, 2.62);
    this.group.add(sign.mesh);

    this.shadow(
      this.group,
      BUILDING.x,
      BUILDING.z,
      BUILDING.width + 0.8,
      BUILDING.depth + 0.8,
    );
    this.shadow(this.group, MAST.x, MAST.z, 1.8, 1.8);
    // Physics: the site is climbable. Tops are in site-local metres (scaled with the scene).
    this.boxCollider(
      BUILDING.x,
      BUILDING.z,
      BUILDING.width,
      BUILDING.depth,
      ROOF_Y,
    );
    for (const step of CLIMB)
      this.boxCollider(
        step.at[0],
        step.at[1],
        step.size[0],
        step.size[1],
        step.top,
      );
    // Roof blocks are solid only while they are there.
    this.slotColliders = SLOTS.map(([x, z]) =>
      this.boxCollider(x, z, BLOCK[0], BLOCK[2], ROOF_Y),
    );
    // Crane: concrete base to stand on, the lattice mast itself is solid.
    this.boxCollider(MAST.x, MAST.z, 1.2, 1.2, 0.35);
    this.boxCollider(MAST.x, MAST.z, 0.56, 0.56, Infinity);
    // Stock pile: the double block, the block on it, and the next block to be lifted.
    this.boxCollider(PILE.x, PILE.z, BLOCK[0] * 2 + 0.06, BLOCK[2], BLOCK[1]);
    this.boxCollider(
      PILE.x - 0.2,
      PILE.z - 0.05,
      BLOCK[0],
      BLOCK[2],
      BLOCK[1] * 2,
    );
    this.pileCollider = this.boxCollider(
      PILE.x,
      PILE.z,
      BLOCK[0],
      BLOCK[2],
      PILE_TOP + BLOCK[1],
    );
    // I-beam stack (low step) and the mixer and sign (solid).
    this.boxCollider(3.1, -2.6, 2.3, 0.62, 0.24);
    this.circleCollider(-3.9, 1.3, 0.55);
    this.boxCollider(0.35, 2.62, 2.0, 0.3, Infinity);
  }

  private buildBuilding(kit: PropKit) {
    const { x, z, width: w, depth: d, storey, storeys } = BUILDING;
    for (let k = 0; k <= storeys; k++)
      kit.box([w, 0.08, d], [x, k * storey, z], { tint: TINT.light });
    const colsX = [-w / 2 + 0.06, 0, w / 2 - 0.06];
    const colsZ = [-d / 2 + 0.06, d / 2 - 0.06];
    for (let k = 0; k < storeys; k++) {
      for (const cx of colsX)
        for (const cz of colsZ)
          kit.box([0.1, storey, 0.1], [x + cx, k * storey, z + cz], {
            tint: TINT.base,
          });
    }
    // Walls close in on the lower floors, open frames above. They run from the
    // top of one floor plate to the underside of the next, and stop 2 cm short
    // of the plates' outer faces: shared faces would z-fight.
    const wall = storey - 0.08;
    kit.box([w - 0.02, wall, 0.06], [x, 0.08, z - d / 2 + 0.03], {
      tint: TINT.base,
    });
    kit.box([0.06, wall, d - 0.02], [x - w / 2 + 0.03, 0.08, z - 0.01], {
      tint: TINT.base,
    });
    kit.box(
      [w * 0.5, storey * 0.5, 0.06],
      [x - w * 0.25, 0.08, z + d / 2 - 0.03],
      { tint: TINT.base },
    );
    kit.box([w, storey * 0.6, 0.06], [x, storey + 0.08, z - d / 2 + 0.03], {
      tint: TINT.base,
    });
    // Window lights on the closed walls.
    for (const wx of [-0.7, 0, 0.7])
      kit.box([0.3, 0.2, 0.02], [x + wx, 0.45, z - d / 2 - 0.01], {
        tint: TINT.accent,
      });
    // Scaffolding in front: a climbable route of steps and decks up to the roof.
    for (const step of CLIMB) {
      const [cx, cz] = step.at;
      const [sw, sd] = step.size;
      if (step.kind === "deck") {
        kit.box([sw, 0.06, sd], [cx, step.top - 0.06, cz], {
          tint: TINT.light,
        });
        for (const px of [-sw / 2 + 0.03, sw / 2 - 0.03]) {
          for (const pz of [-sd / 2 + 0.03, sd / 2 - 0.03])
            kit.bar(
              [cx + px, 0, cz + pz],
              [cx + px, step.top - 0.06, cz + pz],
              0.035,
              { tint: TINT.dark },
            );
        }
        kit.bar(
          [cx - sw / 2, step.top - 0.3, cz + sd / 2 - 0.03],
          [cx + sw / 2, step.top - 0.06, cz + sd / 2 - 0.03],
          0.02,
          { tint: TINT.dark },
        );
      } else {
        // Pallets and crates: solid boxes from whatever they stand on.
        kit.box([sw, step.top - step.base, sd], [cx, step.base, cz], {
          tint: TINT.base,
        });
      }
      // Bright edge on every standable top, so the route reads as one.
      kit.box([sw, 0.012, 0.025], [cx, step.top, cz + sd / 2 - 0.0125], {
        tint: TINT.accent,
      });
      kit.box([sw, 0.012, 0.025], [cx, step.top, cz - sd / 2 + 0.0125], {
        tint: TINT.accent,
      });
    }
  }

  /**
   * Small pass-through props: each traffic cone, barrier and the wheelbarrow
   * is its own element, hidden while the player walks through it.
   */
  private buildLooseProps(prop: Material) {
    const add = (
      kit: PropKit,
      name: string,
      x: number,
      z: number,
      width: number,
      depth: number,
    ) => {
      const mesh = kit.build(prop, name);
      this.group.add(mesh);
      this.station(mesh, x, z, width, depth, this.group);
    };
    for (const cx of [-3.8, -2.6, -1.4, 1.6, 2.8, 4.0]) {
      const kit = new PropKit();
      kit.box([0.26, 0.03, 0.26], [cx, 0, 2.9], { tint: TINT.dark });
      kit.cylinder(0.02, 0.1, 0.36, [cx, 0.03, 2.9], {
        tint: TINT.light,
        segments: 10,
      });
      kit.cylinder(0.05, 0.065, 0.06, [cx, 0.17, 2.9], {
        tint: TINT.accent,
        segments: 10,
      });
      add(kit, "projects-cone", cx, 2.9, 0.26, 0.26);
    }
    // Sawhorse barriers with striped boards.
    for (const [bx, bz, yaw] of [
      [-2.9, 2.2, 0.15],
      [2.6, 2.2, -0.1],
    ]) {
      const kit = new PropKit();
      for (let s = 0; s < 6; s++) {
        kit.box(
          [0.18, 0.12, 0.03],
          [
            bx + (s - 2.5) * 0.18 * Math.cos(yaw),
            0.5,
            bz - (s - 2.5) * 0.18 * Math.sin(yaw),
          ],
          {
            rot: [0, yaw, 0],
            tint: s % 2 ? TINT.accent : TINT.light,
          },
        );
      }
      for (const side of [-1, 1]) {
        const lx = bx + side * 0.48 * Math.cos(yaw);
        const lz = bz - side * 0.48 * Math.sin(yaw);
        kit.bar([lx, 0.62, lz], [lx, 0, lz - 0.18], 0.03, { tint: TINT.dark });
        kit.bar([lx, 0.62, lz], [lx, 0, lz + 0.18], 0.03, { tint: TINT.dark });
      }
      add(kit, "projects-barrier", bx, bz, 1.1, 0.42);
    }
    const barrow = new PropKit();
    barrow.box([0.5, 0.18, 0.36], [-0.2, 0.22, 1.9], {
      rot: [0, 0, -0.12],
      tint: TINT.light,
    });
    barrow.cylinder(0.1, 0.1, 0.05, [0.12, 0.1, 1.9], {
      rot: [Math.PI / 2, 0, 0],
      tint: TINT.dark,
      centered: true,
    });
    for (const hz of [1.76, 2.04])
      barrow.bar([-0.3, 0.3, hz], [-0.78, 0.36, hz], 0.025, {
        tint: TINT.dark,
      });
    add(barrow, "projects-wheelbarrow", -0.3, 1.9, 1.0, 0.45);
  }

  private buildMast(kit: PropKit) {
    const { x, z } = MAST;
    const h = 0.25;
    kit.box([1.2, 0.35, 1.2], [x, 0, z], { tint: TINT.light });
    const corners: [number, number][] = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ];
    for (const [cx, cz] of corners)
      kit.bar([x + cx, 0.35, z + cz], [x + cx, MAST_HEIGHT, z + cz], 0.05, {
        tint: TINT.base,
      });
    const step = 0.55;
    for (let y = 0.35, i = 0; y < MAST_HEIGHT - 0.1; y += step, i++) {
      for (let c = 0; c < 4; c++) {
        const [ax, az] = corners[c];
        const [bx, bz] = corners[(c + 1) % 4];
        kit.bar([x + ax, y, z + az], [x + bx, y, z + bz], 0.025, {
          tint: TINT.dark,
        });
        const flip = (i + c) % 2 === 0;
        kit.bar(
          [x + ax, flip ? y : y + step, z + az],
          [x + bx, flip ? y + step : y, z + bz],
          0.02,
          { tint: TINT.dark },
        );
      }
    }
  }

  private buildSlewingTop(kit: PropKit) {
    // Slewing ring and tower head.
    kit.cylinder(0.42, 0.42, 0.16, [0, -0.16, 0], { tint: TINT.base });
    kit.bar([-0.2, 0, -0.2], [0, 1.3, 0], 0.04, { tint: TINT.base });
    kit.bar([-0.2, 0, 0.2], [0, 1.3, 0], 0.04, { tint: TINT.base });
    kit.bar([0.2, 0, -0.2], [0, 1.3, 0], 0.04, { tint: TINT.base });
    kit.bar([0.2, 0, 0.2], [0, 1.3, 0], 0.04, { tint: TINT.base });
    // Jib: triangular lattice along +X.
    const top = 0.42;
    for (const zc of [-0.18, 0.18])
      kit.bar([0.2, 0, zc], [JIB_LENGTH, 0, zc], 0.035, { tint: TINT.base });
    kit.bar([0.2, top, 0], [JIB_LENGTH - 0.3, 0.08, 0], 0.035, {
      tint: TINT.base,
    });
    for (let x = 0.2; x < JIB_LENGTH - 0.3; x += 0.42) {
      const y = top - ((x - 0.2) / (JIB_LENGTH - 0.5)) * (top - 0.08);
      kit.bar([x, 0, -0.18], [x, 0, 0.18], 0.02, { tint: TINT.dark });
      kit.bar([x, 0, -0.18], [x + 0.21, y, 0], 0.018, { tint: TINT.dark });
      kit.bar([x, 0, 0.18], [x + 0.21, y, 0], 0.018, { tint: TINT.dark });
    }
    kit.box([0.12, 0.12, 0.4], [JIB_LENGTH, -0.06, 0], { tint: TINT.accent });
    // Counter-jib with counterweights.
    for (const zc of [-0.2, 0.2])
      kit.bar([0, 0, zc], [-2.0, 0, zc], 0.04, { tint: TINT.base });
    for (let i = 0; i < 3; i++)
      kit.box([0.22, 0.42, 0.5], [-1.45 - i * 0.24, -0.3, 0], {
        tint: TINT.light,
      });
    // Pendant ties from the tower head.
    kit.bar([0, 1.3, 0], [JIB_LENGTH * 0.62, top * 0.5, 0], 0.016, {
      tint: TINT.dark,
    });
    kit.bar([0, 1.3, 0], [-2.0, 0.02, 0], 0.016, { tint: TINT.dark });
    // Operator cab: open frame with a floor, seat and two control sticks.
    const cx = 0.42;
    const cz = 0.62;
    kit.box([0.66, 0.04, 0.66], [cx, -0.76, cz], { tint: TINT.light });
    kit.box([0.66, 0.04, 0.66], [cx, 0.0, cz], { tint: TINT.base });
    for (const [px, pz] of [
      [-0.31, -0.31],
      [0.31, -0.31],
      [0.31, 0.31],
      [-0.31, 0.31],
    ]) {
      kit.bar([cx + px, -0.74, cz + pz], [cx + px, 0, cz + pz], 0.03, {
        tint: TINT.base,
      });
    }
    kit.bar(
      [cx + 0.31, -0.45, cz - 0.31],
      [cx + 0.31, -0.45, cz + 0.31],
      0.025,
      { tint: TINT.accent },
    );
    kit.box([0.36, 0.05, 0.3], [cx - 0.02, -0.52, cz], { tint: TINT.base });
    kit.box([0.05, 0.3, 0.32], [cx - 0.2, -0.5, cz], { tint: TINT.base });
    for (const dz of [-0.2, 0.2])
      kit.bar([cx + 0.24, -0.74, cz + dz], [cx + 0.2, -0.5, cz + dz], 0.02, {
        tint: TINT.dark,
      });
    kit.bar([0.0, -0.1, 0.2], [cx - 0.31, -0.1, cz - 0.31], 0.03, {
      tint: TINT.base,
    });
  }

  private buildSiteProps(kit: PropKit) {
    // Stock pile under the jib's reach.
    kit.box([BLOCK[0] * 2 + 0.06, BLOCK[1], BLOCK[2]], [PILE.x, 0, PILE.z], {
      tint: TINT.base,
    });
    kit.box(BLOCK, [PILE.x - 0.2, BLOCK[1], PILE.z - 0.05], {
      tint: TINT.base,
      rot: [0, 0.08, 0],
    });
    // I-beam stack.
    for (let i = 0; i < 4; i++) {
      const y = i < 3 ? 0 : 0.12;
      const zz = -2.6 + (i < 3 ? (i - 1) * 0.2 : 0);
      kit.box([2.2, 0.02, 0.12], [3.1, y, zz], { tint: TINT.light });
      kit.box([2.2, 0.08, 0.02], [3.1, y + 0.02, zz], { tint: TINT.light });
      kit.box([2.2, 0.02, 0.12], [3.1, y + 0.1, zz], { tint: TINT.light });
    }
    // Cement mixer stand and wheels (the drum is animated separately).
    kit.box([0.7, 0.06, 0.4], [-3.9, 0.22, 1.4], { tint: TINT.dark });
    kit.bar([-4.2, 0.28, 1.4], [-3.9, 0.62, 1.4], 0.04, { tint: TINT.dark });
    for (const wz of [1.18, 1.62])
      kit.cylinder(0.12, 0.12, 0.05, [-3.65, 0.12, wz], {
        rot: [Math.PI / 2, 0, 0],
        tint: TINT.base,
        centered: true,
      });
    // Sign posts.
    for (const px of [-0.6, 1.3])
      kit.bar([px, 0, 2.62], [px, 0.82, 2.62], 0.05, { tint: TINT.dark });
  }

  protected animate(time: number) {
    this.drum.rotation.y = time * 0.9;

    const cycle = SLOTS.length * DELIVERY + PAUSE_WHEN_DONE;
    const t = time % cycle;
    const index = Math.min(SLOTS.length - 1, Math.floor(t / DELIVERY));
    const finished = t >= SLOTS.length * DELIVERY;
    let u = finished ? DELIVERY : t - index * DELIVERY;

    const pile = this.polar(PILE.x, PILE.z);
    const slot = this.polar(SLOTS[index][0], SLOTS[index][1]);
    const pileHook = PILE_TOP + BLOCK[1] + HOOK_DROP;
    const slotHook = ROOF_Y + BLOCK[1] + HOOK_DROP;
    const travel = TRAVEL_Y + HOOK_DROP;

    let angle = pile.angle;
    let radius = pile.radius;
    let hookY = travel;
    let carrying = false;
    let placed = false;
    const P = PHASES;
    const step = (duration: number) => {
      const k = Math.min(1, u / duration);
      u -= duration;
      return smooth(k);
    };
    // Each phase consumes its duration from u; later phases only run once u reaches them.
    const k1 = step(P.lower);
    hookY = travel + (pileHook - travel) * k1;
    if (u >= 0) {
      step(P.attach);
      carrying = true;
    }
    if (u >= 0) hookY = pileHook + (travel - pileHook) * step(P.lift);
    if (u >= 0) {
      const k = step(P.swing);
      angle = lerpAngle(pile.angle, slot.angle, k);
      radius = pile.radius + (slot.radius - pile.radius) * k;
    }
    if (u >= 0) hookY = travel + (slotHook - travel) * step(P.set);
    if (u >= 0) {
      step(P.release);
      carrying = false;
      placed = true;
    }
    if (u >= 0) hookY = slotHook + (travel - slotHook) * step(P.rise);
    if (u >= 0) {
      const k = step(P.back);
      angle = lerpAngle(slot.angle, pile.angle, k);
      radius = slot.radius + (pile.radius - slot.radius) * k;
    }
    if (finished) {
      angle = pile.angle;
      radius = pile.radius;
      hookY = travel;
      carrying = false;
    }

    this.slew.rotation.y = angle;
    this.trolley.position.set(radius, 0, 0);
    const hookLocalY = hookY - MAST_HEIGHT;
    this.hook.position.set(radius, hookLocalY, 0);
    this.cable.position.set(radius, -0.1, 0);
    this.cable.scale.y = Math.max(0.05, -hookLocalY - 0.28);
    this.load.visible = carrying;
    this.load.position.set(radius, hookLocalY - HOOK_DROP - BLOCK[1], 0);
    // The stock pile always shows the next block, except while it hangs on the hook.
    this.pileTop.visible = !carrying;
    this.slots.forEach(
      (s, i) =>
        (s.visible = i < index || (i === index && (placed || finished))),
    );
    // Floor complete: the blocks dissolve in the glyph grid (same fade as the
    // pass-through elements), then construction starts over.
    const fadeStart = cycle - ROOF_FADE_TIME - ROOF_EMPTY_TIME;
    const roofFade =
      finished && t > fadeStart
        ? 1 - smooth(Math.min(1, (t - fadeStart) / ROOF_FADE_TIME))
        : 1;
    this.roofFader.set(roofFade);
    // Keep the physics in step with the blocks (scaled heights, see boxCollider);
    // the blocks stay solid until they have fully faded.
    const scale = this.group.scale.x;
    this.slotColliders.forEach(
      (c, i) =>
        (c.top =
          (ROOF_Y + (this.slots[i].visible && roofFade > 0 ? BLOCK[1] : 0)) *
          scale),
    );
    this.pileCollider.top =
      (carrying ? BLOCK[1] * 2 : PILE_TOP + BLOCK[1]) * scale;

    // Operator: hands on the sticks, watching the hook.
    const p = { ...SIT_CONTROLS };
    const nudge = Math.sin(time * 1.7) * 0.03;
    p.wristL = [
      SIT_CONTROLS.wristL[0],
      SIT_CONTROLS.wristL[1],
      SIT_CONTROLS.wristL[2] + nudge,
    ];
    p.wristR = [
      SIT_CONTROLS.wristR[0],
      SIT_CONTROLS.wristR[1],
      SIT_CONTROLS.wristR[2] - nudge,
    ];
    // The hook is on the operator's left (−Z of the cab); turn the head toward it.
    const turn = Math.min(
      0.9,
      Math.atan2(0.62, Math.max(0.05, radius - 0.42)) * 0.8,
    );
    p.head = [
      Math.min(0.55, 0.2 + (TRAVEL_Y + HOOK_DROP - hookY) * 0.12),
      turn,
      0,
    ];
    this.operator.apply(p, CAB_FLOOR);
  }

  /** Slew angle and trolley radius that put the hook over (x, z). */
  private polar(x: number, z: number) {
    const dx = x - MAST.x;
    const dz = z - MAST.z;
    return { angle: Math.atan2(-dz, dx), radius: Math.hypot(dx, dz) };
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
