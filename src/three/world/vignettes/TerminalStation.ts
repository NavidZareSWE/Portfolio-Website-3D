import { THEME } from "@/theme/theme";
import { Group, Mesh, PlaneGeometry, Vector3 } from "three";
import { damp } from "../../utils/math";
import { PLAY_LAYOUT } from "../layout";
import type { WorldStation } from "../stations";
import { PropKit, TINT } from "../PropKit";
import { TextPlane, Vignette, type VignetteContext } from "../Vignette";

/** Within this distance of the kiosk, Space opens the terminal. */
export const TERMINAL_RADIUS = 1.9;

/**
 * A walk-up terminal kiosk near spawn: a pedestal, an angled screen running
 * green code and a keyboard ledge, with a sign above. Standing next to it
 * and holding Space opens the terminal window (components/ui/Terminal.tsx).
 */
export class TerminalStation extends Vignette implements WorldStation {
  readonly id = "terminal" as const;
  readonly radius = TERMINAL_RADIUS;
  readonly opensWindow = true;
  /** Ground point the player's distance is measured from. */
  readonly anchor: Vector3;
  private readonly sign: TextPlane;
  private readonly screen: Mesh;
  private glow = 0;
  private nearby = false;

  constructor(ctx: VignetteContext) {
    super(ctx, PLAY_LAYOUT.terminal, "terminal-station");
    this.anchor = this.toWorld(0, 0);

    const kit = new PropKit();
    kit.box([0.9, 0.08, 0.7], [0, 0, 0], { tint: TINT.dark });
    kit.box([0.42, 0.95, 0.4], [0, 0.08, -0.05], { tint: TINT.base });
    kit.box([0.86, 0.06, 0.42], [0, 0.98, 0.12], {
      rot: [0.18, 0, 0],
      tint: TINT.light,
    });
    // Screen housing, tilted back toward the camera.
    const housing = new Group();
    housing.position.set(0, 1.0, -0.12);
    housing.rotation.x = -0.32;
    this.group.add(housing);
    const shell = new PropKit();
    shell.box([1.0, 0.7, 0.08], [0, 0, -0.04], { tint: TINT.base });
    shell.box([1.06, 0.05, 0.12], [0, 0.69, -0.04], { tint: TINT.accent });
    housing.add(shell.build(ctx.materials.prop, "terminal-housing"));
    this.screen = new Mesh(
      new PlaneGeometry(0.88, 0.58),
      ctx.kit.screen([26, 15], 4.2, 7),
    );
    this.screen.position.set(0, 0.35, 0.005);
    housing.add(this.screen);

    this.group.add(kit.build(ctx.materials.prop, "terminal-kiosk"));
    this.boxCollider(0, 0, 0.9, 0.7, Infinity);
    this.shadow(this.group, 0, 0.05, 1.3, 1.0);

    this.sign = new TextPlane({
      width: 2.2,
      height: 0.6,
      color: THEME.green,
      frame: true,
      rtl: ctx.labels.rtl,
    });
    this.sign.setText(ctx.labels.world.terminal);
    this.sign.mesh.position.set(0, 2.25, 0);
    this.group.add(this.sign.mesh);
  }

  setNearby(nearby: boolean) {
    this.nearby = nearby;
  }

  protected animate(time: number, dt: number) {
    this.glow = damp(this.glow, this.nearby ? 1 : 0, 6, dt);
    const motion = this.ctx.kit.motion;
    this.sign.mesh.position.y = 2.25 + Math.sin(time * 1.6 * motion) * 0.05;
    this.sign.opacity = 0.6 + this.glow * 0.4;
    this.screen.scale.setScalar(1 + this.glow * 0.03);
  }
}
