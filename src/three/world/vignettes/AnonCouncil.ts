import {
  Group,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import {
  GlyphFigure,
  SHOULDER,
  blendPose,
  ease,
  pose,
  solveElbow,
  type Pose,
} from "../GlyphFigure";
import { SCENES } from "../../config";
import { PropKit, TINT } from "../PropKit";
import { SIT, SIT_TYPING, STAND, typing, walking } from "../poses";
import { Vignette, type VignetteContext } from "../Vignette";

/* Table layout (set-local metres). Far-side seats face +Z (the camera). */
// Seats 1.2 m apart: the chibi hoods are ~0.8 m wide.
const TABLE = { width: 2.6, depth: 0.9, height: 0.4 };
const SEATS = [
  { x: -0.6, z: -0.72, yaw: 0 }, // far left  — Anonymous
  { x: 0.6, z: -0.72, yaw: 0 }, //  far right — empty: our hacker sits here
  { x: -0.6, z: 0.72, yaw: Math.PI }, // near left  — Anonymous
  { x: 0.6, z: 0.72, yaw: Math.PI }, //  near right — Anonymous
];
const EMPTY_SEAT = 1;
/** Which two-tone mask the hackers wear ("white" or "dark"; both ship in public/textures). */
const MASK_VARIANT: "white" | "dark" = "white";
/** Lid hinge angles: folded onto the keyboard / tilted back, open. */
const LID_CLOSED = -Math.PI / 2;
const LID_OPEN = 0.28;

/** Arrival path (set-local): walk in from the right, stop beside the chair. */
const ENTRY = new Vector3(3.4, 0, -1.7);
const BESIDE = new Vector3(1.3, 0, -0.78);
const WALK_SPEED = 0.85;

/** Timeline of the arrival (seconds after the player first comes close). */
const T = (() => {
  const walk = ENTRY.distanceTo(BESIDE) / WALK_SPEED;
  const turn = walk + 0.6;
  const sit = turn + 1.0;
  const reach = sit + 0.8;
  const lift = reach + 0.9;
  const fit = lift + 0.45;
  const type = fit + 0.8;
  return { walk, turn, sit, reach, lift, fit, type };
})();

/** Start the arrival when the player is this close (m); re-arm when far away. */
const TRIGGER_DISTANCE = 11;
const RESET_DISTANCE = 30;

/**
 * Experience: a table of hackers in Anonymous masks typing on laptops. Two
 * sit opposite two; one seat is empty. When the player approaches, our
 * hacker walks in, takes the empty seat beside another hacker, puts on a
 * mask and starts typing too. Our hacker keeps the N emblems; the others
 * have none — otherwise they are the same figure.
 */
export class AnonCouncil extends Vignette {
  private readonly set = new Group();
  private readonly table: Group;
  private readonly seats: Group[];
  private readonly members: { figure: GlyphFigure; seed: number }[] = [];
  private readonly hacker: GlyphFigure;
  private readonly hackerMask: Mesh;
  private readonly lid: Group;
  private readonly centre: Vector3;
  private startedAt: number | null = null;
  private readonly tmp = new Vector3();
  private readonly tmpQ = new Quaternion();
  private readonly maskOnTable = {
    position: new Vector3(),
    quaternion: new Quaternion(),
  };

  constructor(ctx: VignetteContext, center: { right: number; up: number }) {
    super(ctx, center, "vignette-experience", SCENES.npcScale);
    const set = this.set;
    // Turned so both rows are seen from the side: masks on the camera-facing row read clearly.
    set.rotation.y = -1.15;
    this.group.add(set);

    // Elements hidden independently while the player walks through them: the
    // table (with the laptops), and each chair with whoever sits on it.
    this.table = new Group();
    set.add(this.table);
    this.seats = SEATS.map(() => new Group());
    this.seats.forEach((seatGroup) => set.add(seatGroup));

    const kit = new PropKit();
    kit.box([TABLE.width, 0.05, TABLE.depth], [0, TABLE.height - 0.05, 0], {
      tint: TINT.light,
    });
    for (const x of [-1.2, 1.2])
      for (const z of [-0.36, 0.36])
        kit.box([0.05, TABLE.height - 0.05, 0.05], [x, 0, z], {
          tint: TINT.dark,
        });
    kit.box([2.2, 0.02, 0.05], [0, 0.18, 0], { tint: TINT.dark });
    kit.cylinder(0.05, 0.06, 0.14, [0, TABLE.height, 0], { tint: TINT.light });
    this.table.add(kit.build(ctx.materials.prop, "experience-table"));
    SEATS.forEach((seat, i) => {
      const back = seat.yaw === 0 ? -1 : 1;
      const chair = new PropKit();
      chair.box([0.42, 0.05, 0.4], [seat.x, 0.21, seat.z], { tint: TINT.base });
      for (const dx of [-0.18, 0.18])
        for (const dz of [-0.16, 0.16])
          chair.box([0.035, 0.21, 0.035], [seat.x + dx, 0, seat.z + dz], {
            tint: TINT.dark,
          });
      chair.box([0.42, 0.26, 0.04], [seat.x, 0.26, seat.z + back * 0.2], {
        tint: TINT.base,
      });
      this.seats[i].add(
        chair.build(ctx.materials.prop, `experience-chair-${i}`),
      );
    });
    // A server rack and its cable run behind (solid, no figure in it).
    const rack = new PropKit();
    rack.box([0.5, 1.2, 0.5], [-2.0, 0, -1.3], { tint: TINT.base });
    for (let i = 0; i < 6; i++)
      rack.box([0.42, 0.02, 0.01], [-2.0, 0.12 + i * 0.18, -1.045], {
        tint: i % 2 ? TINT.accent : TINT.light,
      });
    rack.bar([-1.75, 0.02, -1.1], [-1.2, 0.02, -0.3], 0.03, {
      tint: TINT.dark,
    });
    set.add(rack.build(ctx.materials.prop, "experience-rack"));

    // Laptops in front of every seat (lids open; ours opens when he sits).
    const laptop = createLaptopParts(ctx);
    let ourLid: Group | null = null;
    SEATS.forEach((seat, i) => {
      const toward = seat.yaw === 0 ? 1 : -1; // laptop sits toward the table centre
      const group = new Group();
      group.position.set(seat.x, TABLE.height, seat.z + toward * 0.36);
      group.rotation.y = seat.yaw;
      const base = new Mesh(laptop.base, ctx.materials.prop);
      const lid = new Group();
      lid.position.set(0, 0.02, 0.12);
      lid.add(new Mesh(laptop.lid, ctx.materials.prop));
      const screen = new Mesh(
        laptop.screen,
        ctx.kit.screen([18, 11], i * 3.7 + 1, 6 + i),
      );
      screen.position.set(0, 0.11, -0.012);
      screen.rotation.y = Math.PI;
      lid.add(screen);
      lid.rotation.x = i === EMPTY_SEAT ? LID_CLOSED : LID_OPEN;
      group.add(base, lid);
      this.table.add(group);
      if (i === EMPTY_SEAT) ourLid = lid;
    });
    this.lid = ourLid!;

    // One mask shell and material shared by all four masks.
    const maskShared = {
      geometry: createMaskGeometry(),
      // Glyph mask from the reference image: one character per cell, white on dark.
      material: ctx.kit.image({
        map: ctx.maskTextures[MASK_VARIANT],
        grid: [26, 35],
        alphaCut: 0.5,
        glyphContrast: 1,
      }),
    };

    // The three Anonymous hackers (no emblems), already typing.
    SEATS.forEach((seat, i) => {
      if (i === EMPTY_SEAT) return;
      const figure = this.figure(false, `experience-anon-${i}`);
      figure.root.position.set(seat.x, 0, seat.z);
      figure.root.rotation.y = seat.yaw === 0 ? 0 : Math.PI;
      figure.head.add(createMask(maskShared));
      this.seats[i].add(figure.root);
      this.members.push({ figure, seed: i * 2.3 });
    });

    // Our hacker and the mask waiting on the table in front of the empty seat.
    this.hacker = this.figure(true, "experience-hacker");
    // Wrapper so walking through him hides him without touching the arrival logic.
    const hackerWrap = new Group();
    hackerWrap.add(this.hacker.root);
    this.seats[EMPTY_SEAT].add(hackerWrap);
    this.hackerMask = createMask(maskShared);
    this.table.add(this.hackerMask);
    const seat = SEATS[EMPTY_SEAT];
    this.maskOnTable.position.set(
      seat.x + 0.3,
      TABLE.height + 0.012,
      seat.z + 0.3,
    );
    this.maskOnTable.quaternion.setFromAxisAngle(
      new Vector3(1, 0, 0),
      -Math.PI / 2,
    );
    this.reset();

    this.centre = this.toWorld(0, 0);
    this.shadow(this.table, 0, 0, 3.0, 1.2);
    this.station(this.table, 0, 0, TABLE.width + 0.05, TABLE.depth + 0.05, set);
    SEATS.forEach((seat, i) => {
      this.shadow(this.seats[i], seat.x, seat.z, 0.9, 0.8);
      this.station(this.seats[i], seat.x, seat.z, 0.9, 0.85, set);
    });
    this.ghost(hackerWrap, this.hacker.root, 0.45);
    this.boxCollider(-2.0, -1.3, 0.6, 0.6, Infinity, set);
  }

  /** Back to the waiting state: seat empty, mask on the table, lid closed. */
  private reset() {
    this.startedAt = null;
    this.hacker.root.visible = false;
    this.lid.rotation.x = LID_CLOSED;
    this.placeMask(
      this.maskOnTable.position,
      this.maskOnTable.quaternion,
      false,
    );
  }

  private placeMask(
    position: Vector3,
    quaternion: Quaternion,
    onFace: boolean,
  ) {
    const mask = this.hackerMask;
    if (onFace) {
      if (mask.parent !== this.hacker.head) {
        this.hacker.head.add(mask);
      }
      mask.position.copy(MASK_ON_FACE.position);
      mask.quaternion.identity();
      return;
    }
    if (mask.parent !== this.table) this.table.add(mask);
    mask.position.copy(position);
    mask.quaternion.copy(quaternion);
  }

  protected animate(time: number, _dt: number, player: Vector3) {
    for (const { figure, seed } of this.members)
      figure.apply(typing(SIT_TYPING, time, seed));

    const distance = Math.hypot(
      player.x - this.centre.x,
      player.z - this.centre.z,
    );
    if (this.startedAt === null && distance < TRIGGER_DISTANCE)
      this.startedAt = time;
    if (
      this.startedAt !== null &&
      distance > RESET_DISTANCE &&
      time - this.startedAt > T.type
    )
      this.reset();
    if (this.startedAt === null) return;
    this.hacker.root.visible = true;
    this.performArrival(time - this.startedAt, time);
  }

  private performArrival(t: number, time: number) {
    const seat = SEATS[EMPTY_SEAT];
    const root = this.hacker.root;
    const seatPos = this.tmp.set(seat.x, 0, seat.z);

    if (t < T.walk) {
      // Walk in from the side.
      const k = t / T.walk;
      root.position.lerpVectors(ENTRY, BESIDE, k);
      root.rotation.y = Math.atan2(BESIDE.x - ENTRY.x, BESIDE.z - ENTRY.z);
      this.hacker.apply(walking(t * 7.5));
      this.placeMask(
        this.maskOnTable.position,
        this.maskOnTable.quaternion,
        false,
      );
      return;
    }
    const walkYaw = Math.atan2(BESIDE.x - ENTRY.x, BESIDE.z - ENTRY.z);
    if (t < T.turn) {
      // Turn to face the table (+Z for the far side).
      root.position.copy(BESIDE);
      root.rotation.y =
        walkYaw + (0 - walkYaw) * ease((t - T.walk) / (T.turn - T.walk));
      this.hacker.apply(STAND);
      return;
    }
    root.rotation.y = 0;
    if (t < T.sit) {
      // Slide into the seat while sitting down.
      const k = ease((t - T.turn) / (T.sit - T.turn));
      root.position.lerpVectors(BESIDE, seatPos, k);
      this.hacker.apply(blendPose(STAND, SIT, k));
      return;
    }
    root.position.copy(seatPos);
    root.updateMatrixWorld(true);

    // Mask grip point in figure space (on the table to the right of the laptop).
    const maskLocal = root.worldToLocal(
      this.set.localToWorld(this.maskOnTable.position.clone()),
    );
    const grab: [number, number, number] = [
      maskLocal.x,
      maskLocal.y + 0.04,
      maskLocal.z,
    ];
    const face: [number, number, number] = [-0.12, 0.98, 0.42];
    const reachPose = (target: [number, number, number]): Pose =>
      pose({
        ...SIT,
        lean: [0.12, 0, 0],
        head: [0.2, -0.3, 0],
        elbowR: solveElbow(SHOULDER.R, target, [-1, -0.6, -0.4]),
        wristR: target,
      });

    if (t < T.reach) {
      // Reach for the mask.
      const k = ease((t - T.sit) / (T.reach - T.sit));
      this.hacker.apply(blendPose(SIT, reachPose(grab), k));
      this.placeMask(
        this.maskOnTable.position,
        this.maskOnTable.quaternion,
        false,
      );
      return;
    }
    if (t < T.fit) {
      // Lift it to the face; the mask follows the hand, turning to face forward.
      const k = ease((t - T.reach) / (T.lift - T.reach));
      const target: [number, number, number] = [
        grab[0] + (face[0] - grab[0]) * k,
        grab[1] + (face[1] - grab[1]) * k,
        grab[2] + (face[2] - grab[2]) * k,
      ];
      const p = reachPose(target);
      p.head = [0.2 * (1 - k), -0.3 * (1 - k), 0];
      this.hacker.apply(p);
      // Hand position (world → set) and an orientation easing from flat to upright.
      root.updateMatrixWorld(true);
      const hand = this.hacker.forearmR.localToWorld(
        GlyphFigure.wristOffset("R"),
      );
      this.set.worldToLocal(hand);
      const upright = this.tmpQ.identity();
      const q = this.maskOnTable.quaternion.clone().slerp(upright, k);
      if (t < T.lift) {
        this.placeMask(hand.add(new Vector3(0.02, 0.0, 0.06)), q, false);
      } else {
        // Settle onto the face.
        const faceWorld = this.hacker.head.localToWorld(
          MASK_ON_FACE.position.clone(),
        );
        this.set.worldToLocal(faceWorld);
        const s = ease((t - T.lift) / (T.fit - T.lift));
        this.placeMask(hand.lerp(faceWorld, s), upright, false);
      }
      return;
    }
    this.placeMask(
      this.maskOnTable.position,
      this.maskOnTable.quaternion,
      true,
    );
    if (t < T.type) {
      // Hands down to the keyboard while the lid opens.
      const k = ease((t - T.fit) / (T.type - T.fit));
      this.lid.rotation.x = LID_CLOSED + (LID_OPEN - LID_CLOSED) * k;
      this.hacker.apply(blendPose(reachPose(face), SIT_TYPING, k));
      return;
    }
    this.lid.rotation.x = LID_OPEN;
    this.hacker.apply(typing(SIT_TYPING, time, 9.1));
  }
}

/** Where the mask sits on the face, in the head's frame. */
const MASK_ON_FACE = {
  position: GlyphFigure.faceOffset().add(new Vector3(0, -0.03, 0.3)),
};

/** A curved mask shell carrying the supplied Anonymous mask as glyph art. */
function createMask(shared: {
  geometry: BufferGeometry;
  material: Material;
}): Mesh {
  const mesh = new Mesh(shared.geometry, shared.material);
  mesh.position.copy(MASK_ON_FACE.position);
  mesh.name = "anonymous-mask";
  return mesh;
}

function createMaskGeometry(): BufferGeometry {
  // 400 × 540 artwork → 0.4 × 0.54 m, bent around the face.
  const geometry = new PlaneGeometry(0.4, 0.54, 16, 16);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    position.setZ(i, -(x * x) / (2 * 0.24) - (y * y) / (2 * 0.6));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createLaptopParts(ctx: VignetteContext) {
  void ctx;
  const base = new PropKit();
  base.box([0.36, 0.02, 0.25], [0, 0, 0], { tint: TINT.base });
  base.box([0.3, 0.004, 0.1], [0, 0.02, -0.02], { tint: TINT.light });
  const lid = new PropKit();
  lid.box([0.36, 0.23, 0.014], [0, 0, 0], { tint: TINT.base });
  // The lid's back faces the person across the table: a small green status mark.
  lid.box([0.05, 0.05, 0.004], [0, 0.09, 0.009], { tint: TINT.accent });
  return {
    base: base.build(ctx.materials.prop, "laptop-base").geometry,
    lid: lid.build(ctx.materials.prop, "laptop-lid").geometry,
    screen: new PlaneGeometry(0.32, 0.19),
  };
}
