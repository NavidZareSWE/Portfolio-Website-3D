import { THEME } from "@/theme/theme";
import { SphereGeometry } from "three";
import { BlinkLights, type BlinkLight } from "../../effects/BlinkLights";
import { DISTRICT_LAYOUT } from "../layout";
import { PropKit } from "../PropKit";
import { buildMast } from "../structures";
import { Vignette, type VignetteContext } from "../Vignette";

/**
 * Contact district: small radio masts around the Contact card. Their
 * beacons blink cyan and the floor sends rings out from each base
 * (AsciiFloor beacons), as if the world were broadcasting.
 */
export class SignalTowers extends Vignette {
  private readonly lights: BlinkLights;

  constructor(ctx: VignetteContext) {
    super(ctx, { right: 0, up: 0 }, "vignette-contact-towers");
    const kit = new PropKit();
    const lights: BlinkLight[] = [];
    DISTRICT_LAYOUT.towers.forEach((tower, i) => {
      const x = tower.right;
      const z = -tower.up;
      const top = buildMast(kit, x, z, tower.height, 0.8);
      this.circleCollider(x, z, 0.62);
      lights.push({
        position: top,
        scale: 0.13,
        color: THEME.cyan,
        rate: 1.4,
        phase: i * 0.33,
      });
    });
    this.group.add(kit.build(ctx.materials.prop, "contact-towers"));
    this.lights = new BlinkLights(new SphereGeometry(1, 10, 8), lights);
    this.lights.mesh.name = "contact-tower-lights";
    this.group.add(this.lights.mesh);
  }

  protected animate(time: number) {
    this.lights.update(time);
    this.lights.setMotion(this.ctx.kit.motion);
  }
}
