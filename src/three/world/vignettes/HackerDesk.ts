import { Group, Mesh, PlaneGeometry } from "three";
import type { GlyphFigure } from "../GlyphFigure";
import { SCENES } from "../../config";
import { PropKit, TINT } from "../PropKit";
import { SIT_TYPING, typing } from "../poses";
import { Vignette, type VignetteContext } from "../Vignette";

/** Skills: the hacker at a two-monitor station, typing fast while green code pours down the screens. */
export class HackerDesk extends Vignette {
  private readonly hacker: GlyphFigure;

  constructor(ctx: VignetteContext, center: { right: number; up: number }) {
    super(ctx, center, "vignette-skills", SCENES.npcScale);

    // The station is turned so the right-hand screen faces the camera over
    // the hacker's shoulder while the main screen is seen at an angle.
    const set = new Group();
    set.rotation.y = 1.0;
    this.group.add(set);

    const kit = new PropKit();
    // Desk.
    kit.box([1.9, 0.04, 0.66], [0, 0.36, -0.5], { tint: TINT.light });
    for (const x of [-0.9, 0.9]) {
      for (const z of [-0.22, -0.78])
        kit.box([0.045, 0.36, 0.045], [x, 0, z], { tint: TINT.dark });
    }
    kit.box([0.4, 0.24, 0.56], [-0.62, 0.12, -0.5], { tint: TINT.base });
    // Keyboard and mouse.
    kit.box([0.42, 0.024, 0.14], [0, 0.4, -0.32], { tint: TINT.light });
    kit.box([0.065, 0.022, 0.1], [-0.32, 0.4, -0.32], { tint: TINT.light });
    // Main monitor and the angled right-hand monitor (stands + bezels).
    const monitor = (x: number, z: number, yaw: number) => {
      kit.box([0.22, 0.012, 0.14], [x, 0.4, z], {
        rot: [0, yaw, 0],
        tint: TINT.dark,
      });
      kit.box([0.035, 0.16, 0.035], [x, 0.41, z], {
        rot: [0, yaw, 0],
        tint: TINT.dark,
      });
      kit.box([0.9, 0.56, 0.035], [x, 0.54, z], {
        rot: [0, yaw, 0],
        tint: TINT.dark,
      });
    };
    monitor(0, -0.7, 0);
    monitor(0.82, -0.5, -0.6);
    // Tower PC with a green status strip, mug and a desk lamp on the left.
    kit.box([0.22, 0.46, 0.48], [-0.62, 0, -0.5], { tint: TINT.base });
    kit.box([0.014, 0.32, 0.014], [-0.5, 0.07, -0.255], { tint: TINT.accent });
    kit.cylinder(0.04, 0.034, 0.09, [-0.62, 0.38, -0.34], { tint: TINT.light });
    kit.torus(0.025, 0.007, [-0.665, 0.43, -0.34], {
      rot: [0, 0, Math.PI / 2],
      tint: TINT.light,
    });
    kit.cylinder(0.065, 0.075, 0.02, [-0.78, 0.4, -0.7], { tint: TINT.dark });
    kit.bar([-0.78, 0.4, -0.7], [-0.72, 0.7, -0.64], 0.02, { tint: TINT.dark });
    kit.bar([-0.72, 0.7, -0.64], [-0.56, 0.77, -0.54], 0.02, {
      tint: TINT.dark,
    });
    kit.cylinder(0.022, 0.08, 0.09, [-0.54, 0.7, -0.52], {
      rot: [0.5, 0, -0.3],
      tint: TINT.light,
    });
    // Desk and chair (with the hacker) are separate elements, each hidden on its own
    // while the player walks through it.
    const desk = new Group();
    const seat = new Group();
    set.add(desk, seat);
    desk.add(kit.build(ctx.materials.prop, "skills-desk"));

    // Office chair: five-star base, gas lift, seat and low backrest.
    const chair = new PropKit();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      chair.bar(
        [0, 0.04, 0.05],
        [Math.cos(a) * 0.24, 0.03, 0.05 + Math.sin(a) * 0.24],
        0.03,
        { tint: TINT.dark },
      );
      chair.sphere(
        0.025,
        [Math.cos(a) * 0.24, 0.025, 0.05 + Math.sin(a) * 0.24],
        { tint: TINT.dark },
      );
    }
    chair.cylinder(0.025, 0.025, 0.17, [0, 0.04, 0.05], { tint: TINT.dark });
    chair.box([0.44, 0.05, 0.42], [0, 0.21, 0.05], { tint: TINT.base });
    chair.box([0.42, 0.3, 0.05], [0, 0.32, 0.28], {
      rot: [-0.12, 0, 0],
      tint: TINT.base,
    });
    chair.bar([0, 0.24, 0.27], [0, 0.34, 0.29], 0.03, { tint: TINT.dark });
    seat.add(chair.build(ctx.materials.prop, "skills-chair"));

    // Screens: Matrix-style code rain.
    const main = new Mesh(
      new PlaneGeometry(0.84, 0.5),
      ctx.kit.screen([40, 22], 3.1, 10),
    );
    main.position.set(0, 0.82, -0.68);
    const side = new Mesh(
      new PlaneGeometry(0.84, 0.5),
      ctx.kit.screen([40, 22], 7.7, 8),
    );
    side.position.set(0.82, 0.82, -0.5);
    side.rotation.y = -0.6;
    side.translateZ(0.019);
    desk.add(main, side);

    this.hacker = this.figure(true, "skills-hacker");
    this.hacker.root.position.set(0, 0, 0.02);
    this.hacker.root.rotation.y = Math.PI;
    seat.add(this.hacker.root);

    this.shadow(desk, 0, -0.45, 2.3, 1.0);
    this.shadow(seat, 0, 0.05, 0.9, 0.9);
    this.station(desk, 0, -0.5, 1.95, 0.72, set);
    this.station(seat, 0, 0.08, 0.9, 0.85, set);
  }

  protected animate(time: number) {
    // Bursts of fast typing with short pauses to glance between the screens.
    const burst = 0.55 + 0.45 * Math.sin(time * 0.9);
    const p = typing(SIT_TYPING, time, 1.7, 0.6 + burst);
    // Glance at the right-hand screen now and then (figure faces -Z here, so its right is +X).
    p.head = [
      p.head[0],
      Math.sin(time * 0.45) > 0.6 ? -0.5 : p.head[1],
      p.head[2],
    ];
    p.lean = [SIT_TYPING.lean[0] + burst * 0.06, 0, 0];
    this.hacker.apply(p);
  }
}
