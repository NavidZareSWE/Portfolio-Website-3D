import {
  Group,
  Mesh,
  PlaneGeometry,
  Vector3,
  type ShaderMaterial,
  type Vector2,
} from "three";
import { THEME } from "@/theme/theme";
import {
  ARM_LENGTHS,
  GlyphFigure,
  SHOULDER,
  pose,
  solveElbow,
  type Pose,
} from "../GlyphFigure";
import { SCENES } from "../../config";
import { PropKit, TINT } from "../PropKit";
import { SIT_GUITAR, STAND, strumming } from "../poses";
import { TextPlane, Vignette, type VignetteContext } from "../Vignette";

const UP = new Vector3(0, 1, 0);

/** Local layout (metres, relative to the About card; −Z is up the screen). */
// Each station is scaled by SCENES.npcScale around its own origin.
const GUITAR_AT = new Vector3(-6.6, 0, 2.8);
const EASEL_AT = new Vector3(-6.4, 0, -3.3);
const POOL_AT = new Vector3(-4.9, 0, -9.6);
const S = SCENES.npcScale;
const POOL = { length: 5.4, width: 2.6, wall: 0.14, height: 0.32, water: 0.24 };

/** Swim cycle timing: one length, then a turn at the wall. */
const SWIM = { span: 3.6, speed: 0.55, turn: 1.1, strokeRate: 2.6 };
const DRAW = { draw: 7, hold: 3, wipe: 0.8 };
/** The painter holds a long brush, which extends his (short, chibi) reach. */
const BRUSH = 0.3;

/**
 * About: three hobbies around the card — playing guitar on an amp,
 * swimming laps in a pool, and drawing the N logo on an easel canvas.
 */
export class Hobbies extends Vignette {
  private readonly guitarist: GlyphFigure;
  private readonly swimmer: GlyphFigure;
  private readonly painter: GlyphFigure;
  private readonly water: ShaderMaterial;
  private readonly canvasMaterial: ShaderMaterial;
  private readonly canvasMesh: Mesh;
  private readonly notes: { plane: TextPlane; offset: number }[] = [];
  private readonly easel = new Group();
  private readonly tmp = new Vector3();
  private readonly swimCentre = new Vector3();
  private readonly swimDir = new Vector3();

  constructor(ctx: VignetteContext, center: { right: number; up: number }) {
    super(ctx, center, "vignette-about");

    /* ---------------------------------------------------------------- guitar */
    const stage = new Group();
    stage.position.copy(GUITAR_AT);
    stage.rotation.y = 0.45;
    stage.scale.setScalar(S);
    this.group.add(stage);
    const ampKit = new PropKit();
    // The amp he sits on (seat top at the shared seat height) and a cabinet stack behind.
    ampKit.box([0.5, 0.26, 0.34], [0, 0, 0.0], { tint: TINT.base });
    ampKit.box([0.42, 0.18, 0.012], [0, 0.04, 0.172], { tint: TINT.dark });
    // Elements hidden independently: the amp with the guitarist, and the cabinet stack.
    const seat = new Group();
    const cabinet = new Group();
    stage.add(seat, cabinet);
    seat.add(ampKit.build(ctx.materials.prop, "about-amp"));
    const cabKit = new PropKit();
    cabKit.box([0.7, 0.62, 0.36], [0.55, 0, -0.55], { tint: TINT.base });
    cabKit.box([0.62, 0.5, 0.012], [0.55, 0.06, -0.37], { tint: TINT.dark });
    for (const [x, y] of [
      [0.4, 0.18],
      [0.7, 0.18],
      [0.4, 0.42],
      [0.7, 0.42],
    ]) {
      cabKit.torus(0.09, 0.012, [x, y, -0.36], { tint: TINT.light });
    }
    cabKit.box([0.7, 0.05, 0.36], [0.55, 0.62, -0.55], { tint: TINT.light });
    for (let i = 0; i < 4; i++)
      cabKit.cylinder(0.012, 0.012, 0.02, [0.32 + i * 0.07, 0.67, -0.42], {
        rot: [Math.PI / 2, 0, 0],
        tint: TINT.accent,
      });
    cabinet.add(cabKit.build(ctx.materials.prop, "about-cabinet"));

    this.guitarist = this.figure(true, "about-guitarist");
    this.guitarist.root.position.set(0, 0, 0.0);
    seat.add(this.guitarist.root);
    const guitar = buildGuitar().build(ctx.materials.prop, "about-guitar");
    // Across the lap: body at the right hip, neck rising to the figure's left.
    guitar.scale.setScalar(1.25);
    guitar.position.set(-0.06, 0.44, 0.36);
    guitar.rotation.set(0.1, 0.15, 0.4);
    this.guitarist.root.add(guitar);
    // Cable from the guitar to the cabinet.
    const cable = new PropKit();
    cable.bar([-0.2, 0.33, 0.25], [-0.25, 0.01, 0.35], 0.012, {
      tint: TINT.dark,
    });
    cable.bar([-0.25, 0.01, 0.35], [0.25, 0.01, -0.3], 0.012, {
      tint: TINT.dark,
    });
    cable.bar([0.25, 0.01, -0.3], [0.3, 0.2, -0.37], 0.012, {
      tint: TINT.dark,
    });
    seat.add(cable.build(ctx.materials.prop, "about-cable"));
    for (let i = 0; i < 3; i++) {
      const plane = new TextPlane({
        width: 0.3 * S,
        height: 0.3 * S,
        color: THEME.green,
        fontSize: 70,
      });
      plane.setText(i % 2 ? "♫" : "♪");
      this.group.add(plane.mesh);
      this.notes.push({ plane, offset: i / 3 });
    }
    this.shadow(seat, 0, 0.05, 1.0, 0.9);
    this.shadow(cabinet, 0.55, -0.55, 0.9, 0.55);
    this.station(seat, 0, 0.08, 0.9, 0.85, stage);
    this.station(cabinet, 0.55, -0.55, 0.72, 0.38, stage);

    /* ------------------------------------------------------------------ pool */
    const pool = new Group();
    pool.position.copy(POOL_AT);
    pool.scale.setScalar(S);
    this.group.add(pool);
    const poolKit = new PropKit();
    const { length: L, width: W, wall: t, height: h } = POOL;
    poolKit.box([L, h, t], [0, 0, -W / 2 + t / 2], { tint: TINT.light });
    poolKit.box([L, h, t], [0, 0, W / 2 - t / 2], { tint: TINT.light });
    poolKit.box([t, h, W - 2 * t], [-L / 2 + t / 2, 0, 0], {
      tint: TINT.light,
    });
    poolKit.box([t, h, W - 2 * t], [L / 2 - t / 2, 0, 0], { tint: TINT.light });
    // Ladder and a lounge chair beside the pool.
    for (const x of [1.6, 1.9]) {
      poolKit.bar([x, 0, W / 2 + 0.12], [x, 0.55, W / 2 + 0.05], 0.025, {
        tint: TINT.accent,
        round: true,
      });
      poolKit.bar([x, 0.55, W / 2 + 0.05], [x, 0.5, W / 2 - 0.2], 0.025, {
        tint: TINT.accent,
        round: true,
      });
    }
    poolKit.bar([1.6, 0.18, W / 2 + 0.1], [1.9, 0.18, W / 2 + 0.1], 0.02, {
      tint: TINT.accent,
    });
    poolKit.box([0.5, 0.06, 1.1], [-L / 2 - 0.7, 0.16, 0.2], {
      tint: TINT.light,
    });
    poolKit.box([0.5, 0.06, 0.42], [-L / 2 - 0.7, 0.2, -0.45], {
      rot: [0.7, 0, 0],
      tint: TINT.light,
    });
    for (const z of [-0.25, 0.65])
      poolKit.box([0.46, 0.16, 0.04], [-L / 2 - 0.7, 0, z], {
        tint: TINT.dark,
      });
    pool.add(poolKit.build(ctx.materials.prop, "about-pool"));

    this.water = ctx.kit.water();
    const water = new Mesh(new PlaneGeometry(L - 2 * t, W - 2 * t), this.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = POOL.water;
    pool.add(water);

    this.swimmer = this.figure(true, "about-swimmer");
    this.swimmer.root.rotation.order = "YXZ";
    pool.add(this.swimmer.root);
    this.shadow(pool, -0.35, 0, L + 1.8, W + 0.8);
    // The pool itself stays solid (no walking on the water).
    this.boxCollider(-0.35, 0, L + 1.6, W + 0.3, Infinity, pool);

    /* ----------------------------------------------------------------- easel */
    this.easel.position.copy(EASEL_AT);
    this.easel.rotation.y = -0.45;
    this.easel.scale.setScalar(S);
    this.group.add(this.easel);
    // Elements: the easel with its canvas, the stool, and the (moving) painter.
    const board = new Group();
    const stool = new Group();
    const painterWrap = new Group();
    this.easel.add(board, stool, painterWrap);
    const easelKit = new PropKit();
    easelKit.bar([-0.32, 0, 0.12], [-0.06, 1.35, -0.02], 0.035, {
      tint: TINT.base,
    });
    easelKit.bar([0.32, 0, 0.12], [0.06, 1.35, -0.02], 0.035, {
      tint: TINT.base,
    });
    easelKit.bar([0, 0, -0.45], [0, 1.3, -0.04], 0.035, { tint: TINT.base });
    easelKit.box([0.82, 0.035, 0.1], [0, 0.55, 0.07], { tint: TINT.base });
    easelKit.box([0.76, 0.64, 0.03], [0, 0.59, 0.03], { tint: TINT.light });
    easelKit.box([0.2, 0.03, 0.08], [0, 1.24, 0.03], { tint: TINT.base });
    board.add(easelKit.build(ctx.materials.prop, "about-easel"));
    // Paint stool and a jar of pencils.
    const stoolKit = new PropKit();
    stoolKit.cylinder(0.16, 0.16, 0.03, [0.65, 0.3, 0.3], { tint: TINT.light });
    for (const a of [0, 2.1, 4.2])
      stoolKit.bar(
        [0.65, 0.3, 0.3],
        [0.65 + Math.cos(a) * 0.14, 0, 0.3 + Math.sin(a) * 0.14],
        0.025,
        { tint: TINT.dark },
      );
    stoolKit.cylinder(0.04, 0.035, 0.09, [0.62, 0.33, 0.3], {
      tint: TINT.light,
    });
    for (const dx of [-0.015, 0.01, 0.02])
      stoolKit.bar(
        [0.62 + dx, 0.36, 0.3],
        [0.62 + dx * 3, 0.5, 0.3 + dx],
        0.01,
        { tint: TINT.accent },
      );
    stool.add(stoolKit.build(ctx.materials.prop, "about-stool"));

    this.canvasMaterial = ctx.kit.image({
      map: ctx.logoMask,
      grid: [30, 25],
      tint: THEME.green,
      paper: "#8fb3ae",
      mask: true,
      alphaCut: -1,
      reveal: 0,
    });
    // Keep the logo's square aspect on the 0.7 × 0.58 canvas (edges show paper).
    const canvasGeometry = new PlaneGeometry(0.7, 0.58);
    const uv = canvasGeometry.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setX(i, (uv.getX(i) - 0.5) * (0.7 / 0.58) + 0.5);
    this.canvasMesh = new Mesh(canvasGeometry, this.canvasMaterial);
    this.canvasMesh.position.set(0, 0.91, 0.047);
    board.add(this.canvasMesh);

    this.painter = this.figure(true, "about-painter");
    this.painter.root.position.set(-0.62, 0, 0.22);
    this.painter.root.rotation.y = 1.75;
    painterWrap.add(this.painter.root);
    const pencilKit = new PropKit();
    // Brush along the forearm, continuing past the hand.
    const wrist = GlyphFigure.wristOffset("R");
    const along = wrist.clone().normalize();
    pencilKit.bar(
      wrist.clone().addScaledVector(along, -0.02).toArray(),
      wrist.clone().addScaledVector(along, BRUSH).toArray(),
      0.016,
      { tint: TINT.light, round: true },
    );
    pencilKit.bar(
      wrist
        .clone()
        .addScaledVector(along, BRUSH - 0.05)
        .toArray(),
      wrist.clone().addScaledVector(along, BRUSH).toArray(),
      0.022,
      { tint: TINT.accent, round: true },
    );
    this.painter.forearmR.add(
      pencilKit.build(ctx.materials.prop, "about-brush"),
    );
    this.shadow(board, 0, 0, 0.9, 0.7);
    this.station(board, 0, -0.08, 0.8, 0.6, this.easel);
    this.station(stool, 0.65, 0.3, 0.34, 0.34, this.easel);
    this.ghost(painterWrap, this.painter.root, 0.45);
  }

  protected animate(time: number) {
    /* guitar */
    this.guitarist.apply(strumming(SIT_GUITAR, time));
    this.notes.forEach(({ plane, offset }, i) => {
      const t = (time * 0.35 + offset) % 1;
      const local = new Vector3(
        0.15 + Math.sin(t * 6 + i) * 0.15,
        1.2 + t * 1.1,
        0.25,
      )
        .applyAxisAngle(UP, 0.45)
        .multiplyScalar(S)
        .add(GUITAR_AT);
      plane.mesh.position.copy(local);
      plane.opacity = Math.sin(t * Math.PI) * 0.9;
    });

    /* swimming */
    this.updateSwimmer(time);

    /* drawing */
    const cycle = DRAW.draw + DRAW.hold + DRAW.wipe;
    const c = time % cycle;
    const reveal =
      c < DRAW.draw
        ? c / DRAW.draw
        : c < DRAW.draw + DRAW.hold
          ? 1
          : 1 - (c - DRAW.draw - DRAW.hold) / DRAW.wipe;
    this.canvasMaterial.uniforms.uReveal.value = reveal;
    const drawing = c < DRAW.draw;
    // The brush tip follows the drawing front, scribbling up and down the
    // strokes; the painter side-steps along the canvas as the drawing grows.
    const u = drawing ? reveal : 0;
    const v = drawing ? 0.5 + Math.sin(time * 11) * 0.38 : 0.5;
    this.painter.root.position.x = -0.62 + u * 0.3;
    this.easel.updateMatrixWorld(true);
    this.tmp.set((u - 0.5) * 0.6, 0.91 + (v - 0.5) * 0.46, 0.06);
    this.easel.localToWorld(this.tmp);
    this.painter.root.worldToLocal(this.tmp);
    const tip: [number, number, number] = [this.tmp.x, this.tmp.y, this.tmp.z];
    const p: Pose = drawing
      ? pose({
          ...STAND,
          lean: [0.06, 0, 0],
          head: [0.18, -0.25, 0],
          elbowR: solveElbow(
            SHOULDER.R,
            tip,
            [-0.6, -1, 0],
            ARM_LENGTHS.lower + BRUSH,
          ),
          wristR: tip,
        })
      : pose({
          ...STAND,
          head: [0.1, -0.1, 0],
          elbowR: [-0.33, 0.6, 0.08],
          wristR: [-0.2, 0.62, 0.25],
        });
    this.painter.apply(p);
  }

  private updateSwimmer(time: number) {
    const half = SWIM.span / 2;
    const lap = SWIM.span / SWIM.speed;
    const period = 2 * (lap + SWIM.turn);
    const t = time % period;
    let x: number;
    let heading: number;
    // Out along +X, turn, back along −X, turn.
    if (t < lap) {
      x = -half + t * SWIM.speed;
      heading = Math.PI / 2;
    } else if (t < lap + SWIM.turn) {
      x = half;
      heading = Math.PI / 2 + ((t - lap) / SWIM.turn) * Math.PI;
    } else if (t < 2 * lap + SWIM.turn) {
      x = half - (t - lap - SWIM.turn) * SWIM.speed;
      heading = -Math.PI / 2;
    } else {
      x = -half;
      heading =
        -Math.PI / 2 + ((t - 2 * lap - SWIM.turn) / SWIM.turn) * Math.PI;
    }
    const root = this.swimmer.root;
    // Lying face down: pitch the figure forward, then point the head along the heading.
    const dir = this.swimDir.set(Math.sin(heading), 0, Math.cos(heading));
    // Body axis just above the surface: back, hood and the recovering arms show.
    this.swimCentre.set(x, POOL.water + 0.06, 0);
    root.position.copy(this.swimCentre).addScaledVector(dir, -0.75);
    root.rotation.set(Math.PI / 2, heading, 0);

    // Freestyle: arms windmill in opposite phase, legs flutter, breathe every other stroke.
    const s = time * SWIM.strokeRate;
    const arm = (
      phase: number,
      side: 1 | -1,
    ): { elbow: [number, number, number]; wrist: [number, number, number] } => {
      const a = s + phase;
      const sx = 0.255 * side;
      return {
        elbow: [
          sx + side * 0.08,
          0.745 + Math.cos(a - 0.4) * 0.17,
          Math.sin(a - 0.4) * 0.17,
        ],
        wrist: [
          sx + side * 0.03,
          0.745 + Math.cos(a) * 0.36,
          Math.sin(a) * 0.36,
        ],
      };
    };
    const l = arm(0, 1);
    const r = arm(Math.PI, -1);
    const kick = Math.sin(time * 9);
    this.swimmer.apply(
      pose({
        lift: 0,
        head: [0, Math.max(0, Math.sin(s / 2)) * 0.9, 0],
        elbowL: l.elbow,
        wristL: l.wrist,
        elbowR: r.elbow,
        wristR: r.wrist,
        kneeL: [0.15, 0.31, 0.02 + kick * 0.03],
        ankleL: [0.18, 0.21, kick * 0.06],
        kneeR: [-0.15, 0.31, 0.02 - kick * 0.03],
        ankleR: [-0.18, 0.21, -kick * 0.06],
      }),
      0,
    );
    root.position.y = this.swimCentre.y;
    // Ripples follow the head (world space).
    const head = this.tmp.copy(this.swimCentre).addScaledVector(dir, 0.6);
    this.swimmer.root.parent!.localToWorld(head);
    (this.water.uniforms.uSwimmer.value as Vector2).set(head.x, head.z);
  }
}

/** Acoustic guitar facing +Z, centred on its body; neck along +X. */
function buildGuitar(): PropKit {
  const kit = new PropKit();
  const facing: [number, number, number] = [Math.PI / 2, 0, 0];
  kit.cylinder(0.15, 0.15, 0.07, [0, 0, 0], {
    rot: facing,
    tint: TINT.light,
    centered: true,
    segments: 20,
  });
  kit.cylinder(0.11, 0.11, 0.07, [0.16, 0.01, 0], {
    rot: facing,
    tint: TINT.light,
    centered: true,
    segments: 18,
  });
  kit.torus(0.15, 0.008, [0, 0, 0.036], { tint: TINT.accent });
  kit.torus(0.045, 0.01, [0.1, 0.0, 0.037], { tint: TINT.accent });
  kit.box([0.04, 0.025, 0.03], [-0.08, 0, 0.04], {
    tint: TINT.dark,
    centered: true,
  });
  // Neck face 5 mm proud of the body face (flush faces z-fight where they overlap).
  kit.box([0.44, 0.05, 0.03], [0.46, 0.0, 0.025], {
    tint: TINT.base,
    centered: true,
  });
  kit.box([0.12, 0.07, 0.028], [0.73, 0.0, 0.02], {
    tint: TINT.dark,
    centered: true,
  });
  for (const y of [-0.012, 0, 0.012])
    kit.bar([-0.08, y, 0.045], [0.68, y, 0.04], 0.004, { tint: TINT.light });
  return kit;
}
