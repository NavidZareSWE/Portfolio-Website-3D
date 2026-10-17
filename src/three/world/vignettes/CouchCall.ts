import { CatmullRomCurve3, Group, Mesh, TubeGeometry, Vector3 } from "three";
import { THEME } from "@/theme/theme";
import type { GlyphFigure } from "../GlyphFigure";
import { SCENES } from "../../config";
import { PropKit, TINT } from "../PropKit";
import { SIT_PHONE } from "../poses";
import { TextPlane, Vignette, type VignetteContext } from "../Vignette";

/**
 * Contact: the hacker on a couch, one leg crossed over the other, holding a
 * corded phone to the hood with the head tilted, waiting for someone to
 * pick up. A "CALLING" label pulses above and rings leave the phone base.
 */
export class CouchCall extends Vignette {
  private readonly hacker: GlyphFigure;
  private readonly set = new Group();
  private readonly label: TextPlane;
  private readonly calling: string;
  private readonly rings: Mesh[] = [];
  private readonly ringOrigin = new Vector3(-1.2, 0.5, 0.02);
  private handset!: Mesh;
  private readonly grip = new Vector3();

  constructor(ctx: VignetteContext, center: { right: number; up: number }) {
    super(ctx, center, "vignette-contact", SCENES.npcScale);
    const set = this.set;
    set.rotation.y = -0.35;
    this.group.add(set);

    // Elements hidden independently while the player walks through them:
    // the couch (with the hacker and the cord), the side table with the phone, the lamp.
    const couch = new Group();
    const sideTable = new Group();
    const lamp = new Group();
    set.add(couch, sideTable, lamp);

    const rug = new PropKit();
    rug.box([3.1, 0.012, 1.7], [-0.1, 0, 0.15], { tint: TINT.dark });
    set.add(rug.build(ctx.materials.prop, "contact-rug"));

    const kit = new PropKit();
    // Couch: base, two seat cushions, backrest, back cushions, armrests, feet.
    kit.box([1.8, 0.15, 0.62], [0, 0.05, -0.04], { tint: TINT.base });
    for (const x of [-0.44, 0.44]) {
      kit.box([0.86, 0.06, 0.54], [x, 0.2, 0.0], { tint: TINT.light });
      kit.box([0.84, 0.3, 0.09], [x, 0.26, -0.24], {
        rot: [-0.1, 0, 0],
        tint: TINT.light,
      });
    }
    kit.box([1.8, 0.42, 0.15], [0, 0.2, -0.33], { tint: TINT.base });
    for (const x of [-0.97, 0.97])
      kit.box([0.15, 0.4, 0.64], [x, 0.05, -0.04], { tint: TINT.base });
    for (const x of [-0.95, 0.95]) {
      for (const z of [-0.3, 0.22])
        kit.cylinder(0.025, 0.02, 0.05, [x, 0, z], { tint: TINT.dark });
    }
    couch.add(kit.build(ctx.materials.prop, "contact-couch"));
    // Side table with the phone base and its rotary dial.
    const table = new PropKit();
    table.cylinder(0.2, 0.2, 0.03, [-1.2, 0.38, 0.02], {
      tint: TINT.light,
      segments: 20,
    });
    table.cylinder(0.03, 0.03, 0.38, [-1.2, 0, 0.02], { tint: TINT.dark });
    table.cylinder(0.13, 0.15, 0.02, [-1.2, 0, 0.02], { tint: TINT.dark });
    table.box([0.22, 0.07, 0.17], [-1.2, 0.41, 0.02], { tint: TINT.accent });
    table.box([0.22, 0.03, 0.1], [-1.2, 0.48, -0.02], {
      rot: [0.35, 0, 0],
      tint: TINT.accent,
    });
    table.torus(0.045, 0.008, [-1.2, 0.485, 0.06], {
      rot: [-Math.PI / 2 + 0.35, 0, 0],
      tint: TINT.light,
    });
    table.cylinder(0.014, 0.014, 0.012, [-1.2, 0.48, 0.06], {
      rot: [0.35, 0, 0],
      tint: TINT.light,
    });
    sideTable.add(table.build(ctx.materials.prop, "contact-side-table"));
    // Floor lamp at the other end.
    const lampKit = new PropKit();
    lampKit.cylinder(0.12, 0.14, 0.03, [1.25, 0, -0.2], { tint: TINT.dark });
    lampKit.cylinder(0.016, 0.016, 1.15, [1.25, 0.03, -0.2], {
      tint: TINT.dark,
    });
    lampKit.cylinder(0.12, 0.2, 0.2, [1.25, 1.1, -0.2], {
      tint: TINT.light,
      segments: 18,
    });
    lamp.add(lampKit.build(ctx.materials.prop, "contact-lamp"));

    // Handset, held at the right side of the hood (lives in the head's frame).
    this.hacker = this.figure(true, "contact-hacker");
    this.hacker.root.position.set(0.2, 0, 0.07);
    couch.add(this.hacker.root);

    const handsetKit = new PropKit();
    // The phone is the story object: drawn in the accent colour.
    handsetKit.bar([0, 0.11, -0.02], [0, -0.1, 0.07], 0.045, {
      tint: TINT.accent,
    });
    handsetKit.cylinder(0.04, 0.04, 0.04, [0.02, 0.11, -0.02], {
      rot: [0, 0, Math.PI / 2],
      tint: TINT.light,
      centered: true,
    });
    handsetKit.cylinder(0.04, 0.04, 0.04, [0.02, -0.1, 0.07], {
      rot: [0, 0, Math.PI / 2],
      tint: TINT.light,
      centered: true,
    });
    const handset = handsetKit.build(ctx.materials.prop, "contact-handset");
    handset.scale.setScalar(1.4); // chibi-scale prop, readable from the game camera
    // At the side of the hood opening, mouth end forward and down.
    handset.position.set(-0.36, 0.22, 0.27);
    handset.rotation.set(0.15, -0.35, 0.05);
    this.hacker.head.add(handset);

    // Pose once, then hang the coiled cord from the base to the handset.
    this.hacker.apply(this.posed(0));
    this.group.updateMatrixWorld(true);
    const mouth = handset.localToWorld(new Vector3(-0.02, -0.11, 0.07));
    set.worldToLocal(mouth);
    const cord = new PropKit().geometry(
      coiledCord(new Vector3(-1.1, 0.42, 0.02), mouth),
      [0, 0, 0],
      undefined,
      TINT.accent,
    );
    couch.add(cord.build(ctx.materials.prop, "contact-cord"));
    this.handset = handset;

    // Ringing: expanding rings from the phone and a pulsing label.
    const ringKit = new PropKit();
    ringKit.torus(1, 0.012, [0, 0, 0], {
      rot: [Math.PI / 2, 0, 0],
      tint: TINT.accent,
    });
    const ringMesh = ringKit.build(ctx.materials.prop, "contact-ring");
    for (let i = 0; i < 3; i++) {
      const ring = i === 0 ? ringMesh : ringMesh.clone();
      ring.position.copy(this.ringOrigin);
      sideTable.add(ring);
      this.rings.push(ring);
    }
    this.label = new TextPlane({
      width: 1.3,
      height: 0.32,
      color: THEME.green,
      frame: true,
      rtl: ctx.labels.rtl,
    });
    this.calling = ctx.labels.world.calling;
    // Labels live in the screen-aligned group so they face the camera squarely.
    this.label.mesh.position
      .set(0.1, 1.95, 0.2)
      .applyAxisAngle(new Vector3(0, 1, 0), set.rotation.y);
    this.label.setText(this.calling, `${this.calling}...`);
    this.group.add(this.label.mesh);

    this.shadow(couch, 0, 0.0, 2.3, 1.1);
    this.station(couch, 0, 0.05, 2.1, 0.9, set);
    this.station(sideTable, -1.2, 0.02, 0.45, 0.45, set);
    this.station(lamp, 1.25, -0.2, 0.32, 0.32, set);
  }

  /** The phone pose with the right hand placed on the handset grip. */
  private posed(time: number) {
    const p = { ...SIT_PHONE };
    // Impatient foot, fingers drumming on the backrest.
    p.footR = [
      SIT_PHONE.footR[0] + Math.sin(time * 5.5) * 0.18,
      SIT_PHONE.footR[1],
      SIT_PHONE.footR[2],
    ];
    p.wristL = [
      SIT_PHONE.wristL[0],
      SIT_PHONE.wristL[1] + Math.max(0, Math.sin(time * 9)) * 0.015,
      SIT_PHONE.wristL[2],
    ];
    return p;
  }

  protected animate(time: number) {
    const p = this.posed(time);
    this.hacker.apply(p);
    // Put the right hand on the handset grip (its position depends on the head pose).
    this.hacker.root.updateMatrixWorld(true);
    this.handset.localToWorld(this.grip.set(-0.04, -0.06, 0.05));
    this.hacker.root.worldToLocal(this.grip);
    p.wristR = [this.grip.x, this.grip.y, this.grip.z];
    this.hacker.apply(p);
    const dots = ".".repeat(Math.floor(time * 2) % 4);
    this.label.setText(
      `${this.calling}${dots.padEnd(3, " ")}`,
      `${this.calling}...`,
    );
    this.label.opacity = 0.75 + 0.25 * Math.sin(time * 3);
    // Rings expand from the phone in a two-pulse "ring-ring" rhythm.
    this.rings.forEach((ring, i) => {
      const cycle = (time * 0.8 + i * 0.18) % 2;
      const t = cycle < 1 ? cycle : 0;
      ring.visible = t > 0;
      const s = 0.05 + t * 0.45;
      ring.scale.set(s, s, s);
      ring.position.y = this.ringOrigin.y + t * 0.05;
    });
  }
}

/** A coiled telephone cord sagging between two points. */
function coiledCord(from: Vector3, to: Vector3): TubeGeometry {
  const mid = from.clone().lerp(to, 0.5);
  mid.y = Math.min(from.y, to.y) - 0.22;
  const path = new CatmullRomCurve3([
    from,
    from.clone().lerp(mid, 0.6),
    mid,
    mid.clone().lerp(to, 0.6),
    to,
  ]);
  const frames = path.computeFrenetFrames(240, false);
  const points: Vector3[] = [];
  const coils = 34;
  for (let i = 0; i <= 240; i++) {
    const u = i / 240;
    const a = u * coils * Math.PI * 2;
    const p = path.getPointAt(u);
    p.addScaledVector(frames.normals[i], Math.cos(a) * 0.018).addScaledVector(
      frames.binormals[i],
      Math.sin(a) * 0.018,
    );
    points.push(p);
  }
  return new TubeGeometry(new CatmullRomCurve3(points), 600, 0.005, 5, false);
}
