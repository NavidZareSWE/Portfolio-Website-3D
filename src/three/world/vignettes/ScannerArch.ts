import { THEME } from "@/theme/theme";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PropKit, TINT } from "../PropKit";
import {
  FACE_CAMERA_PITCH,
  TextPlane,
  Vignette,
  type VignetteContext,
} from "../Vignette";

/** On the walk from spawn to the Projects card (layout units). */
export const SCANNER_CENTER = { right: 0, up: 8.3 } as const;

const HALF_SPAN = 1.75;
const OPENING = HALF_SPAN - 0.25;
const HEIGHT = 2.8;

/** Detection box around the hacker's head (the hood), in metres. */
const BOX = { width: 1.1, height: 0.98, centerY: 1.2 };
/** Two-line label above the box ("HACKER DETECTED" / "90% ACCURACY"). */
const READOUT = { width: 1.6, height: 0.46 };
const LOCK_IN = 0.25;
const HOLD = 2.4;
const FADE_OUT = 0.4;

const LOCAL = new Vector3();

/** Corner brackets (four L shapes) of a w × h box, as one flat geometry. */
function brackets(
  width: number,
  height: number,
  arm: number,
  thickness: number,
) {
  const parts: BufferGeometry[] = [];
  const w = width / 2;
  const h = height / 2;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const horizontal = new PlaneGeometry(arm, thickness);
      horizontal.translate(sx * (w - arm / 2), sy * (h - thickness / 2), 0);
      const vertical = new PlaneGeometry(thickness, arm);
      vertical.translate(sx * (w - thickness / 2), sy * (h - arm / 2), 0);
      parts.push(horizontal, vertical);
    }
  }
  // A faint full outline between the brackets.
  for (const sy of [-1, 1]) {
    const edge = new PlaneGeometry(width, thickness * 0.35);
    edge.translate(0, sy * (h - thickness * 0.17), 0);
    parts.push(edge);
  }
  for (const sx of [-1, 1]) {
    const edge = new PlaneGeometry(thickness * 0.35, height);
    edge.translate(sx * (w - thickness * 0.17), 0, 0);
    parts.push(edge);
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  return merged;
}

/**
 * face-recognition-brain: an arch on the path to the Projects card. A scan
 * beam sweeps it; walking through it locks a detection box onto the hacker
 * with the readout "HACKER DETECTED · 90% ACCURACY" — a nod to running
 * face detection in the browser.
 */
export class ScannerArch extends Vignette {
  private readonly beam: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly overlay = new Group();
  private readonly box: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly readout: TextPlane;
  private readonly idleBeam = new Color(THEME.cyan);
  private readonly hitBeam = new Color(THEME.green);
  private lastSide = 0;
  private detectedAt = -Infinity;

  constructor(ctx: VignetteContext) {
    super(ctx, SCANNER_CENTER, "vignette-scanner");

    // Arch: two posts, a lintel with a lens, green strips on the inner faces.
    const arch = new PropKit();
    for (const side of [-1, 1]) {
      arch.box([0.36, HEIGHT, 0.5], [side * HALF_SPAN, 0, 0], {
        tint: TINT.base,
      });
      arch.box(
        [0.04, HEIGHT - 0.3, 0.12],
        [side * (HALF_SPAN - 0.2), 0.15, 0],
        {
          tint: TINT.accent,
        },
      );
      this.circleCollider(side * HALF_SPAN, 0, 0.3);
    }
    arch.box([HALF_SPAN * 2 + 0.36, 0.42, 0.56], [0, HEIGHT, 0], {
      tint: TINT.light,
    });
    arch.box([0.34, 0.14, 0.2], [0, HEIGHT - 0.14, 0.12], { tint: TINT.dark });
    arch.cylinder(0.07, 0.07, 0.05, [0, HEIGHT - 0.2, 0.2], {
      rot: [Math.PI / 2, 0, 0],
      tint: TINT.accent,
      centered: true,
    });
    this.group.add(arch.build(ctx.materials.prop, "scanner-arch"));

    // Sweeping scan beam between the posts.
    this.beam = new Mesh(
      new PlaneGeometry(OPENING * 2 - 0.1, 0.05),
      new MeshBasicMaterial({
        color: this.idleBeam.clone(),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    );
    this.beam.name = "scanner-beam";
    this.group.add(this.beam);

    // The sign sits on the lintel's front face, so it never hides the card behind.
    const sign = new TextPlane({
      width: 3.4,
      height: 0.5,
      frame: true,
      rtl: ctx.labels.rtl,
    });
    sign.setText(ctx.labels.world.scanner);
    sign.mesh.position.set(0, HEIGHT + 0.24, 0.5);
    this.group.add(sign.mesh);

    // Detection overlay (follows the player; drawn over everything).
    this.box = new Mesh(
      brackets(BOX.width, BOX.height, 0.22, 0.035),
      new MeshBasicMaterial({
        color: new Color(THEME.green),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.box.renderOrder = 20;
    this.readout = new TextPlane({
      width: READOUT.width,
      height: READOUT.height,
      frame: true,
      color: THEME.green,
      rtl: ctx.labels.rtl,
    });
    this.readout.setText(ctx.labels.world.detected);
    this.readout.mesh.material.depthTest = false;
    this.readout.mesh.renderOrder = 21;
    // Box and readout share one camera-facing panel at head height.
    const panel = new Group();
    panel.position.y = BOX.centerY;
    panel.rotation.x = FACE_CAMERA_PITCH;
    this.readout.mesh.rotation.x = 0;
    this.readout.mesh.position.set(
      0,
      BOX.height / 2 + READOUT.height / 2 + 0.06,
      0,
    );
    panel.add(this.box, this.readout.mesh);
    this.overlay.add(panel);
    this.overlay.visible = false;
    this.overlay.name = "scanner-detection";
    this.group.add(this.overlay);
  }

  protected animate(time: number, _dt: number, player: Vector3) {
    const motion = this.ctx.kit.motion;
    LOCAL.copy(player);
    this.group.worldToLocal(LOCAL);

    // Walking through the opening (crossing the arch's plane) triggers a detection.
    const side = Math.sign(LOCAL.z);
    if (
      side !== 0 &&
      this.lastSide !== 0 &&
      side !== this.lastSide &&
      Math.abs(LOCAL.x) < OPENING &&
      Math.abs(LOCAL.z) < 1 &&
      player.y < HEIGHT
    ) {
      this.detectedAt = time;
    }
    if (side !== 0) this.lastSide = side;

    const age = time - this.detectedAt;
    const active = age >= 0 && age < HOLD + FADE_OUT;

    // Beam sweeps up and down; it turns green and holds at head height while detecting.
    const sweep = 0.5 + 0.5 * Math.sin(time * 2.6 * motion);
    this.beam.position.set(0, active ? BOX.centerY : 0.25 + sweep * 2.3, 0.02);
    this.beam.material.color.copy(active ? this.hitBeam : this.idleBeam);
    this.beam.material.opacity = active ? 1 : 0.8;

    this.overlay.visible = active;
    if (!active) return;
    this.overlay.position.set(LOCAL.x, LOCAL.y, LOCAL.z);
    // Locks on: starts wide and snaps to the head, flickering for a moment.
    const lock = Math.min(1, age / LOCK_IN);
    const scale = 1.45 - 0.45 * (1 - (1 - lock) * (1 - lock));
    this.box.scale.setScalar(scale);
    const flicker = lock < 1 ? (Math.floor(age * 30) % 2 ? 0.35 : 1) : 1;
    const fade = age > HOLD ? 1 - (age - HOLD) / FADE_OUT : 1;
    this.box.material.opacity = flicker * fade;
    this.readout.opacity = lock < 1 ? 0 : fade;
  }
}
