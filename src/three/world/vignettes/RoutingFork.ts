import { THEME } from "@/theme/theme";
import {
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { createRandom } from "../../utils/math";
import { FlowPath, buildTrack, type GroundPoint } from "../FlowPath";
import { PropKit, TINT } from "../PropKit";
import { TextPlane, Vignette, type VignetteContext } from "../Vignette";

/** Beside the Experience card, where the M.Sc. is listed (layout units). */
export const ROUTING_CENTER = { right: -7.6, up: -16.6 } as const;

/** Local layout (x = screen right, z = toward the camera). */
const SOURCE: GroundPoint = [-3.6, 0];
const ROUTER: GroundPoint = [-0.6, 0];
const SMALL_TOWER = { x: 2.9, z: 1.6, size: 0.75, height: 1.1 };
const LARGE_TOWER = { x: 3.2, z: -2.3, size: 1.3, height: 2.7 };

const MAIN = new FlowPath([[-3.2, 0], ROUTER]);
const TO_SMALL = new FlowPath([
  ROUTER,
  [1.3, SMALL_TOWER.z],
  [SMALL_TOWER.x - SMALL_TOWER.size / 2, SMALL_TOWER.z],
]);
const TO_LARGE = new FlowPath([
  ROUTER,
  [1.3, LARGE_TOWER.z],
  [LARGE_TOWER.x - LARGE_TOWER.size / 2, LARGE_TOWER.z],
]);

const ORBS = 12;
const SPAWN_EVERY = 0.9;
const RADIUS = { small: 0.11, large: 0.21 } as const;
const SPEED = { small: 1.7, large: 1.1 } as const;
/** Share of queries that are simple enough for the small model. */
const SMALL_SHARE = 0.6;

interface Orb {
  active: boolean;
  large: boolean;
  /** Distance along MAIN, then along the branch. */
  s: number;
  roll: Quaternion;
}

const TMP = new Vector3();
const DIR = new Vector3();
const AXIS = new Vector3();
const UP = new Vector3(0, 1, 0);
const SPIN = new Quaternion();
const MATRIX = new Matrix4();
const SCALE = new Vector3();

/**
 * M.Sc. research, LLM routing: queries (glyph orbs) roll from the source to
 * a router; light ones go to the small model, heavy ones to the large model,
 * and the tower that answers lights up. A sign spells out the trade-off
 * being balanced: quality, cost and latency.
 */
export class RoutingFork extends Vignette {
  private readonly orbs: Orb[] = [];
  private readonly mesh: InstancedMesh<SphereGeometry, ShaderMaterial>;
  private readonly random = createRandom(9001);
  private readonly smallTrack: ShaderMaterial;
  private readonly largeTrack: ShaderMaterial;
  private readonly smallLight: MeshBasicMaterial;
  private readonly largeLight: MeshBasicMaterial;
  private readonly routerLight: MeshBasicMaterial;
  private spawnTimer = 0;
  /** Times of the latest routing decision / arrival per branch (for pulses). */
  private routedAt = { small: -Infinity, large: -Infinity };
  private arrivedAt = { small: -Infinity, large: -Infinity };
  private clock = 0;

  constructor(ctx: VignetteContext) {
    super(ctx, ROUTING_CENTER, "vignette-routing");
    const { kit } = ctx;

    // --- Props: source pad, router, two model towers ---------------------------------
    const props = new PropKit();
    props.cylinder(0.55, 0.6, 0.12, [SOURCE[0], 0, SOURCE[1]], {
      tint: TINT.dark,
      segments: 24,
    });
    props.torus(0.42, 0.03, [SOURCE[0], 0.13, SOURCE[1]], {
      rot: [Math.PI / 2, 0, 0],
      tint: TINT.accent,
    });
    this.circleCollider(SOURCE[0], SOURCE[1], 0.6, 0.12);

    props.cylinder(0.42, 0.48, 0.75, [ROUTER[0], 0, ROUTER[1]], {
      tint: TINT.base,
      segments: 6,
    });
    this.circleCollider(ROUTER[0], ROUTER[1], 0.48);

    const tower = (t: typeof SMALL_TOWER, tiers: number) => {
      const tier = t.height / tiers;
      for (let i = 0; i < tiers; i++) {
        const inset = i * 0.06;
        props.box(
          [t.size - inset, tier - 0.05, t.size - inset],
          [t.x, i * tier, t.z],
          {
            tint: i % 2 ? TINT.light : TINT.base,
          },
        );
      }
      this.boxCollider(t.x, t.z, t.size, t.size, Infinity);
    };
    tower(SMALL_TOWER, 2);
    tower(LARGE_TOWER, 5);
    // Sign post for the title.
    props.box([0.08, 1.35, 0.08], [SOURCE[0], 0, SOURCE[1] - 1.05], {
      tint: TINT.dark,
    });
    this.circleCollider(SOURCE[0], SOURCE[1] - 1.05, 0.12);
    this.group.add(props.build(ctx.materials.prop, "routing-props"));

    // Lights on top of the router and towers (pulse on routing / answering).
    const light = (
      name: string,
      x: number,
      y: number,
      z: number,
      size: number,
    ) => {
      const material = new MeshBasicMaterial({
        color: new Color(THEME.cyan),
        toneMapped: false,
      });
      const kitLight = new PropKit();
      kitLight.box([size, 0.08, size], [x, y, z], { tint: "#ffffff" });
      this.group.add(kitLight.build(material, name));
      return material;
    };
    this.routerLight = light(
      "routing-router-light",
      ROUTER[0],
      0.75,
      ROUTER[1],
      0.5,
    );
    this.smallLight = light(
      "routing-small-light",
      SMALL_TOWER.x,
      SMALL_TOWER.height,
      SMALL_TOWER.z,
      SMALL_TOWER.size * 0.7,
    );
    this.largeLight = light(
      "routing-large-light",
      LARGE_TOWER.x,
      LARGE_TOWER.height,
      LARGE_TOWER.z,
      LARGE_TOWER.size * 0.6,
    );

    // --- Tracks ------------------------------------------------------------------------
    const main = new Mesh(
      buildTrack([MAIN], 0.2),
      kit.track(THEME.cyan, 1.4, 0.8),
    );
    this.smallTrack = kit.track(THEME.green, SPEED.small, 0.7);
    this.largeTrack = kit.track(THEME.blue, SPEED.large, 0.7);
    const small = new Mesh(buildTrack([TO_SMALL], 0.16), this.smallTrack);
    const large = new Mesh(buildTrack([TO_LARGE], 0.24), this.largeTrack);
    main.name = "routing-track-main";
    small.name = "routing-track-small";
    large.name = "routing-track-large";
    this.group.add(main, small, large);

    // --- Signs ---------------------------------------------------------------------------
    const sign = (
      text: string,
      width: number,
      height: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const plane = new TextPlane({
        width,
        height,
        frame: true,
        rtl: ctx.labels.rtl,
      });
      plane.setText(text);
      plane.mesh.position.set(x, y, z);
      this.group.add(plane.mesh);
    };
    const { world } = ctx.labels;
    sign(world.routing, 2.4, 0.64, SOURCE[0], 1.75, SOURCE[1] - 1.0);
    sign(world.routingTradeoff, 2.5, 0.34, ROUTER[0], 1.35, ROUTER[1]);
    // The small model's label sits in front of it, so the large tower behind never covers it.
    sign(
      world.smallModel,
      1.5,
      0.32,
      SMALL_TOWER.x,
      0.3,
      SMALL_TOWER.z + SMALL_TOWER.size / 2 + 0.45,
    );
    sign(
      world.largeModel,
      1.6,
      0.34,
      LARGE_TOWER.x,
      LARGE_TOWER.height + 0.55,
      LARGE_TOWER.z,
    );

    // --- Orbs (one instanced draw call) ----------------------------------------------------
    this.mesh = new InstancedMesh(
      new SphereGeometry(1, 16, 12),
      kit.orbs(),
      ORBS,
    );
    this.mesh.name = "routing-orbs";
    this.mesh.frustumCulled = false;
    for (let i = 0; i < ORBS; i++) {
      this.orbs.push({
        active: false,
        large: false,
        s: 0,
        roll: new Quaternion(),
      });
      this.mesh.setColorAt(i, new Color(THEME.cyan));
      this.mesh.setMatrixAt(i, MATRIX.makeScale(0, 0, 0));
    }
    this.group.add(this.mesh);
  }

  protected animate(_time: number, dt: number) {
    const motion = this.ctx.kit.motion;
    const step = dt * motion;
    this.clock += step;

    this.spawnTimer -= step;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_EVERY * (0.7 + this.random() * 0.6);
      const orb = this.orbs.find((o) => !o.active);
      if (orb) {
        orb.active = true;
        orb.large = this.random() > SMALL_SHARE;
        orb.s = 0;
        orb.roll.identity();
        const i = this.orbs.indexOf(orb);
        this.mesh.setColorAt(
          i,
          new Color(orb.large ? THEME.blue : THEME.green).lerp(
            new Color(THEME.cyan),
            0.35,
          ),
        );
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      }
    }

    this.orbs.forEach((orb, i) => {
      if (!orb.active) return;
      const kind = orb.large ? "large" : "small";
      const radius = RADIUS[kind];
      const before = orb.s;
      orb.s += SPEED[kind] * step;
      const branch = orb.large ? TO_LARGE : TO_SMALL;
      // The router decides as the orb reaches it.
      if (before < MAIN.length && orb.s >= MAIN.length)
        this.routedAt[kind] = this.clock;
      if (orb.s >= MAIN.length + branch.length) {
        orb.active = false;
        this.arrivedAt[kind] = this.clock;
        this.mesh.setMatrixAt(i, MATRIX.makeScale(0, 0, 0));
        return;
      }
      const onMain = orb.s < MAIN.length;
      const path = onMain ? MAIN : branch;
      const s = onMain ? orb.s : orb.s - MAIN.length;
      path.at(s, TMP);
      path.direction(s, DIR);
      // Roll: rotate about the axis perpendicular to travel by distance / radius.
      AXIS.crossVectors(UP, DIR).normalize();
      SPIN.setFromAxisAngle(AXIS, (SPEED[kind] * step) / radius);
      orb.roll.premultiply(SPIN);
      // Hidden while "inside" the router, and shrinking into the tower at the end.
      const nearRouter =
        Math.hypot(TMP.x - ROUTER[0], TMP.z - ROUTER[1]) < 0.42;
      const toEnd = MAIN.length + branch.length - orb.s;
      const grow = Math.min(1, orb.s / 0.3, toEnd / 0.25);
      const size = nearRouter ? 0 : radius * grow;
      TMP.y = radius;
      MATRIX.compose(TMP, orb.roll, SCALE.setScalar(Math.max(size, 1e-4)));
      this.mesh.setMatrixAt(i, MATRIX);
    });
    this.mesh.instanceMatrix.needsUpdate = true;

    // Pulses: the chosen branch brightens, the answering tower flashes.
    const pulse = (at: number) => Math.exp(-(this.clock - at) * 3.5);
    this.smallTrack.uniforms.uIntensity.value =
      0.6 + 1.6 * pulse(this.routedAt.small);
    this.largeTrack.uniforms.uIntensity.value =
      0.6 + 1.6 * pulse(this.routedAt.large);
    const routed = Math.max(
      pulse(this.routedAt.small),
      pulse(this.routedAt.large),
    );
    this.routerLight.color.set(THEME.cyan).multiplyScalar(0.45 + 0.9 * routed);
    this.smallLight.color
      .set(THEME.green)
      .multiplyScalar(0.35 + 1.0 * pulse(this.arrivedAt.small));
    this.largeLight.color
      .set(THEME.blue)
      .multiplyScalar(0.35 + 1.2 * pulse(this.arrivedAt.large));
  }
}
