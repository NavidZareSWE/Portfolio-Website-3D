import { THEME } from "@/theme/theme";
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { damp } from "../../utils/math";
import { SKILLS_EXTRAS } from "../layout";
import { PropKit, TINT } from "../PropKit";
import { TextPlane, Vignette, type VignetteContext } from "../Vignette";

/**
 * Skills district: the tech stack as a tower you climb. Four tiers, widest
 * at the bottom (database, API, frontend, browser), each low enough to jump
 * onto from the one below. Reaching the top lights a beam and shows
 * "FULL STACK".
 */
export class StackTower extends Vignette {
  private readonly reward: TextPlane;
  private readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  private readonly topY: number;
  private readonly topHalf: number;
  private glow = 0;
  private readonly local = new Vector3();

  constructor(ctx: VignetteContext) {
    super(ctx, SKILLS_EXTRAS.tower, "stack-tower");
    const { sizes, tier } = SKILLS_EXTRAS.tower;
    const tints = [TINT.dark, TINT.base, TINT.light, TINT.base];
    const kit = new PropKit();
    const labels = ctx.labels.world.stackTiers;

    sizes.forEach((size, i) => {
      const base = i * tier;
      kit.box([size, tier, size], [0, base, 0], { tint: tints[i] });
      // A glowing lip along the front edge of each tier.
      kit.box([size + 0.02, 0.05, 0.05], [0, base + tier - 0.05, size / 2], {
        tint: TINT.accent,
      });
      this.boxCollider(0, 0, size, size, base + tier);
      const label = new TextPlane({
        width: Math.max(1.4, size * 0.95),
        height: 0.44,
        color: i === sizes.length - 1 ? THEME.green : THEME.cyan,
        rtl: ctx.labels.rtl,
      });
      label.setText(labels[i]);
      label.mesh.position.set(0, base + tier * 0.5, size / 2 + 0.12);
      this.group.add(label.mesh);
    });
    this.group.add(kit.build(ctx.materials.prop, "stack-tower"));
    this.shadow(this.group, 0, 0.1, sizes[0] * 1.25, sizes[0] * 1.2);
    this.topY = sizes.length * tier;
    this.topHalf = sizes[sizes.length - 1] / 2;

    const sign = new TextPlane({
      width: 2.6,
      height: 0.5,
      color: THEME.amber,
      frame: true,
      rtl: ctx.labels.rtl,
    });
    sign.setText(ctx.labels.world.stackSign);
    sign.mesh.position.set(-sizes[0] / 2 - 0.9, 1.1, sizes[0] / 2);
    this.group.add(sign.mesh);

    this.beam = new Mesh(
      new CylinderGeometry(0.35, 0.6, 7, 20, 1, true),
      new MeshBasicMaterial({
        color: new Color(THEME.green),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.beam.position.y = this.topY + 3.5;
    this.beam.visible = false;
    this.group.add(this.beam);

    this.reward = new TextPlane({
      width: 2.6,
      height: 0.55,
      color: THEME.green,
      frame: true,
      rtl: ctx.labels.rtl,
    });
    this.reward.setText(ctx.labels.world.stackDone);
    this.reward.opacity = 0;
    this.reward.mesh.position.y = this.topY + 2.4;
    this.group.add(this.reward.mesh);
  }

  protected animate(time: number, dt: number, player: Vector3) {
    const local = this.group.worldToLocal(this.local.copy(player));
    const onTop =
      player.y > this.topY - 0.06 &&
      Math.abs(local.x) < this.topHalf + 0.2 &&
      Math.abs(local.z) < this.topHalf + 0.2;
    this.glow = damp(this.glow, onTop ? 1 : 0, onTop ? 5 : 1.5, dt);
    const motion = this.ctx.kit.motion;
    this.beam.visible = this.glow > 0.01;
    this.beam.material.opacity =
      this.glow * (0.18 + 0.08 * Math.sin(time * 5 * motion));
    this.beam.rotation.y = time * 0.6 * motion;
    this.reward.opacity = Math.min(1, this.glow * 1.3);
    this.reward.mesh.position.y =
      this.topY + 2.4 + Math.sin(time * 2 * motion) * 0.06;
  }
}
