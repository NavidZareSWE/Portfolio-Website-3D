import { THEME } from "@/theme/theme";
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { MONO_FONT_FAMILY } from "../../effects/AsciiAtlas";
import { CRISP_LAYER } from "../../render/CrispComposite";
import { damp } from "../../utils/math";
import { CONTACT_EXTRAS } from "../layout";
import { PropKit, TINT } from "../PropKit";
import type { WorldStation } from "../stations";
import { TextPlane, Vignette, type VignetteContext } from "../Vignette";

/** A still of the game on the cabinet's screen: ground, a block, a battery, a bug, the hacker. */
function drawAttractScreen(): CanvasTexture {
  const w = 320;
  const h = 240;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#020a0d";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(95, 240, 255, 0.08)";
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  // Ground tiles.
  ctx.fillStyle = THEME.tealMid;
  for (let x = 0; x < w; x += 20) ctx.fillRect(x + 1, 196, 18, 18);
  ctx.fillStyle = THEME.tealDeep;
  ctx.fillRect(0, 216, w, 24);
  // A hack block, a battery, a bug.
  ctx.fillStyle = THEME.amber;
  ctx.fillRect(150, 120, 20, 20);
  ctx.fillStyle = "#1a0d00";
  ctx.font = `700 11px ${MONO_FONT_FAMILY}`;
  ctx.fillText("</>", 151, 134);
  ctx.fillStyle = THEME.green;
  ctx.fillRect(214, 150, 10, 16);
  ctx.fillRect(217, 147, 4, 3);
  ctx.fillStyle = THEME.alert;
  ctx.beginPath();
  ctx.ellipse(262, 188, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // The hacker.
  ctx.fillStyle = "#1b2236";
  ctx.beginPath();
  ctx.arc(80, 166, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(70, 176, 20, 16);
  ctx.fillStyle = THEME.green;
  ctx.fillRect(78, 182, 4, 4);
  ctx.fillStyle = "#e9fdff";
  ctx.fillRect(70, 192, 8, 4);
  ctx.fillRect(83, 192, 8, 4);
  // Title.
  ctx.fillStyle = THEME.cyan;
  ctx.font = `800 34px ${MONO_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.shadowColor = THEME.cyan;
  ctx.shadowBlur = 12;
  ctx.fillText("ROOT RUN", w / 2, 64);
  ctx.shadowBlur = 0;
  ctx.font = `600 13px ${MONO_FONT_FAMILY}`;
  ctx.fillStyle = THEME.amber;
  ctx.fillText("INSERT SPACE", w / 2, 92);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The arcade cabinet right of Contact. Holding Space in front of it opens
 * ROOT RUN (components/ui/Arcade.tsx), the 2D platformer.
 */
export class ArcadeCabinet extends Vignette implements WorldStation {
  readonly id = "arcade" as const;
  readonly radius = 1.7;
  readonly opensWindow = true;
  readonly anchor: Vector3;
  private readonly screen: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly marquee: TextPlane;
  private glow = 0;
  private nearby = false;

  constructor(ctx: VignetteContext) {
    super(ctx, CONTACT_EXTRAS.arcade, "arcade-cabinet");
    // The player stands in front of the cabinet (toward the camera).
    this.anchor = this.toWorld(0, 0.95);

    const kit = new PropKit();
    // Body: base, cabinet, control deck, the angled screen bezel, the marquee box.
    kit.box([1.1, 0.12, 0.9], [0, 0, 0], { tint: TINT.dark });
    kit.box([0.95, 1.05, 0.75], [0, 0.12, -0.05], { tint: TINT.base });
    kit.box([1.0, 0.1, 0.42], [0, 1.08, 0.24], {
      rot: [0.25, 0, 0],
      tint: TINT.light,
    });
    kit.box([0.95, 0.9, 0.3], [0, 1.17, -0.27], { tint: TINT.base });
    kit.box([1.0, 0.32, 0.5], [0, 2.07, -0.17], { tint: TINT.accent });
    // Joystick and buttons.
    kit.cylinder(0.018, 0.018, 0.12, [-0.22, 1.14, 0.28], { tint: TINT.dark });
    kit.sphere(0.04, [-0.22, 1.27, 0.28], { tint: TINT.accent });
    for (const x of [0.08, 0.2, 0.32]) {
      kit.cylinder(0.035, 0.035, 0.03, [x, 1.13, 0.3], { tint: TINT.light });
    }
    this.group.add(kit.build(ctx.materials.prop, "arcade-body"));
    this.boxCollider(0, 0, 1.1, 0.9, Infinity);
    this.shadow(this.group, 0, 0.1, 1.5, 1.2);

    const holder = new Group();
    holder.position.set(0, 1.62, -0.11);
    holder.rotation.x = -0.18;
    this.group.add(holder);
    this.screen = new Mesh(
      new PlaneGeometry(0.8, 0.6),
      new MeshBasicMaterial({ map: drawAttractScreen(), toneMapped: false }),
    );
    this.screen.layers.set(CRISP_LAYER);
    holder.add(this.screen);

    this.marquee = new TextPlane({
      width: 2.2,
      height: 0.62,
      color: THEME.amber,
      frame: true,
      rtl: ctx.labels.rtl,
    });
    this.marquee.setText(`${ctx.labels.world.arcade}\nROOT RUN`);
    this.marquee.mesh.position.set(0, 2.85, 0);
    this.group.add(this.marquee.mesh);
  }

  setNearby(nearby: boolean) {
    this.nearby = nearby;
  }

  protected animate(time: number, dt: number) {
    this.glow = damp(this.glow, this.nearby ? 1 : 0, 6, dt);
    const motion = this.ctx.kit.motion;
    // The screen flickers like a CRT; brighter while the player is in range.
    const flicker = 0.85 + 0.15 * Math.sin(time * 23 * motion);
    this.screen.material.color.setScalar((0.7 + 0.3 * this.glow) * flicker);
    this.marquee.mesh.position.y = 2.85 + Math.sin(time * 1.4 * motion) * 0.04;
    this.marquee.opacity = 0.7 + this.glow * 0.3;
  }
}
