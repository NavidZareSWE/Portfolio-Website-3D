import { THEME } from "@/theme/theme";
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Euler,
  Vector3,
} from "three";
import { ATLAS_CODE_LENGTH, ATLAS_CODE_START } from "../../effects/AsciiAtlas";
import { createRandom } from "../../utils/math";
import { FlowPath, buildTrack, type GroundPoint } from "../FlowPath";
import { PropKit, TINT } from "../PropKit";
import {
  FACE_CAMERA_PITCH,
  TextPlane,
  Vignette,
  type VignetteContext,
} from "../Vignette";

/** Scene centre in layout units (right, up); everything below is relative to it. */
export const DATA_FLOW_CENTER = { right: -6, up: 17.4 } as const;

/** Layout point (right, up) → this scene's local ground point. */
const at = (right: number, up: number): GroundPoint => [
  right - DATA_FLOW_CENTER.right,
  -(up - DATA_FLOW_CENTER.up),
];

const SERVER = { right: -5.2, up: 18.6, width: 1.0, depth: 0.8, height: 2.4 };
const DATABASE = { right: -10.2, up: 18.6, radius: 0.75, height: 1.5 };

/** Requests: Projects card → API server → database. */
const REQUEST = new FlowPath([
  at(-1.2, 15.75),
  at(-5.35, 15.75),
  at(-5.35, 18.75),
  at(-9.5, 18.75),
]);
/** Responses: database → API server → Projects card. */
const RESPONSE = new FlowPath([
  at(-9.5, 18.45),
  at(-5.05, 18.45),
  at(-5.05, 16.05),
  at(-1.2, 16.05),
]);

const PACKETS_PER_LANE = 7;
const PACKET_SPEED = 1.3;
const PACKET_SIZE = 0.3;
const PACKET_HEIGHT = 0.34;
/** Packets fade in/out over this distance at either end of a lane. */
const EDGE = 0.45;

const TMP = new Vector3();
const MATRIX = new Matrix4();
const FACING = new Quaternion().setFromEuler(
  new Euler(FACE_CAMERA_PITCH, 0, 0),
);
const SCALE = new Vector3();

interface Lane {
  path: FlowPath;
  offset: number;
}

/**
 * Projects: "taking features from interface to database" as moving traffic.
 * Glyph packets leave the Projects card for the API server, go on to the
 * database, and come back as responses (cyan out, green back), on lit
 * floor tracks. All packets are one instanced draw call.
 */
export class DataFlow extends Vignette {
  private readonly packets: InstancedMesh;
  private readonly glyphs: InstancedBufferAttribute;
  private readonly lanes: Lane[] = [];
  private readonly random = createRandom(1717);
  private readonly lastLap: number[] = [];
  private readonly leds: MeshBasicMaterial;
  private travelled = 0;

  constructor(ctx: VignetteContext) {
    super(ctx, DATA_FLOW_CENTER, "vignette-data-flow");
    const { kit } = ctx;

    // --- API server: a rack with blades and green status LEDs ----------------
    const [sx, sz] = at(SERVER.right, SERVER.up);
    const server = new PropKit();
    server.box([SERVER.width, SERVER.height, SERVER.depth], [sx, 0, sz], {
      tint: TINT.base,
    });
    server.box(
      [SERVER.width + 0.1, 0.08, SERVER.depth + 0.1],
      [sx, SERVER.height, sz],
      {
        tint: TINT.light,
      },
    );
    for (let i = 0; i < 6; i++) {
      server.box(
        [SERVER.width - 0.16, 0.22, 0.04],
        [sx, 0.25 + i * 0.34, sz + SERVER.depth / 2],
        {
          tint: TINT.light,
        },
      );
    }
    this.group.add(server.build(ctx.materials.prop, "data-flow-server"));
    this.boxCollider(sx, sz, SERVER.width, SERVER.depth, Infinity);

    const led = new PropKit();
    for (let i = 0; i < 6; i++) {
      led.box(
        [0.07, 0.07, 0.02],
        [
          sx + SERVER.width / 2 - 0.2,
          0.33 + i * 0.34,
          sz + SERVER.depth / 2 + 0.03,
        ],
        {
          tint: "#ffffff",
        },
      );
    }
    this.leds = new MeshBasicMaterial({
      color: new Color(THEME.green),
      toneMapped: false,
    });
    this.group.add(led.build(this.leds, "data-flow-leds"));

    // --- Database: the classic stacked cylinder -------------------------------
    const [dx, dz] = at(DATABASE.right, DATABASE.up);
    const db = new PropKit();
    const layer = DATABASE.height / 3;
    for (let i = 0; i < 3; i++) {
      db.cylinder(
        DATABASE.radius,
        DATABASE.radius,
        layer - 0.06,
        [dx, i * layer, dz],
        {
          tint: TINT.base,
          segments: 28,
        },
      );
      db.cylinder(
        DATABASE.radius - 0.04,
        DATABASE.radius - 0.04,
        0.06,
        [dx, i * layer + layer - 0.06, dz],
        {
          tint: TINT.dark,
          segments: 28,
        },
      );
    }
    db.cylinder(
      DATABASE.radius,
      DATABASE.radius,
      0.05,
      [dx, DATABASE.height, dz],
      {
        tint: TINT.light,
        segments: 28,
      },
    );
    this.group.add(db.build(ctx.materials.prop, "data-flow-database"));
    this.circleCollider(dx, dz, DATABASE.radius + 0.05);

    // --- Labels -----------------------------------------------------------------
    const label = (text: string, x: number, y: number, z: number) => {
      const plane = new TextPlane({
        width: 2.3,
        height: 0.62,
        frame: true,
        rtl: ctx.labels.rtl,
      });
      plane.setText(text);
      plane.mesh.position.set(x, y, z);
      this.group.add(plane.mesh);
    };
    label(ctx.labels.world.server, sx, SERVER.height + 0.75, sz);
    label(ctx.labels.world.database, dx, DATABASE.height + 0.7, dz);

    // --- Tracks and packets -------------------------------------------------------
    const tracks = new Mesh(
      buildTrack([REQUEST], 0.16),
      kit.track(THEME.cyan, PACKET_SPEED, 0.9),
    );
    const replies = new Mesh(
      buildTrack([RESPONSE], 0.16),
      kit.track(THEME.green, PACKET_SPEED, 0.9),
    );
    tracks.name = "data-flow-requests";
    replies.name = "data-flow-responses";
    this.group.add(tracks, replies);

    this.lanes.push(
      { path: REQUEST, offset: 0 },
      { path: RESPONSE, offset: 0.5 },
    );
    const count = PACKETS_PER_LANE * this.lanes.length;
    this.packets = new InstancedMesh(
      new PlaneGeometry(1, 1),
      kit.sprites(),
      count,
    );
    this.packets.name = "data-flow-packets";
    this.glyphs = new InstancedBufferAttribute(new Float32Array(count), 1);
    this.packets.geometry.setAttribute("aGlyph", this.glyphs);
    const request = new Color(THEME.cyan);
    const response = new Color(THEME.green);
    for (let i = 0; i < count; i++) {
      this.packets.setColorAt(i, i < PACKETS_PER_LANE ? request : response);
      this.glyphs.setX(i, this.randomGlyph());
      this.lastLap.push(0);
    }
    this.packets.frustumCulled = false;
    this.group.add(this.packets);
    this.placePackets(0);
  }

  private randomGlyph() {
    return ATLAS_CODE_START + Math.floor(this.random() * ATLAS_CODE_LENGTH);
  }

  protected animate(time: number, dt: number) {
    this.travelled += dt * PACKET_SPEED * this.ctx.kit.motion;
    this.placePackets(time);
    // LEDs blink with the traffic.
    const blink =
      0.55 + 0.45 * Math.max(0, Math.sin(time * 9.0 * this.ctx.kit.motion));
    this.leds.color.set(THEME.green).multiplyScalar(blink);
  }

  private placePackets(time: number) {
    const [sx, sz] = at(SERVER.right, SERVER.up);
    const [dx, dz] = at(DATABASE.right, DATABASE.up);
    let glyphsChanged = false;
    this.lanes.forEach((lane, l) => {
      const { path } = lane;
      for (let k = 0; k < PACKETS_PER_LANE; k++) {
        const index = l * PACKETS_PER_LANE + k;
        const distance =
          this.travelled + ((k + lane.offset) / PACKETS_PER_LANE) * path.length;
        const lap = Math.floor(distance / path.length);
        const s = distance - lap * path.length;
        if (lap !== this.lastLap[index]) {
          // A new packet each lap: a different glyph.
          this.lastLap[index] = lap;
          this.glyphs.setX(index, this.randomGlyph());
          glyphsChanged = true;
        }
        path.at(s, TMP);
        // Hidden inside the server and the database; grows/shrinks at the lane ends.
        const inServer =
          Math.abs(TMP.x - sx) < SERVER.width / 2 + 0.05 &&
          Math.abs(TMP.z - sz) < SERVER.depth / 2 + 0.05;
        const inDatabase =
          Math.hypot(TMP.x - dx, TMP.z - dz) < DATABASE.radius + 0.05;
        const edge = Math.min(1, s / EDGE, (path.length - s) / EDGE);
        const size = inServer || inDatabase ? 0 : PACKET_SIZE * edge;
        TMP.y = PACKET_HEIGHT + Math.sin(time * 3 + index) * 0.035;
        MATRIX.compose(TMP, FACING, SCALE.setScalar(Math.max(size, 1e-4)));
        this.packets.setMatrixAt(index, MATRIX);
      }
    });
    this.packets.instanceMatrix.needsUpdate = true;
    if (glyphsChanged) this.glyphs.needsUpdate = true;
  }
}
