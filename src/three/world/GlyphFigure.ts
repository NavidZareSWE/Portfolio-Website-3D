import {
  Group,
  Mesh,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Shape,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createEmblem } from "../character/Character";
import {
  CHARACTER_LOGOS,
  CHARACTER_RIG,
} from "../character/characterRig.generated";
import { timedFetch, type DownloadSample } from "../quality/ModelDetail";

export const GLYPH_MODEL_URL = "/models/hacker-glyph.glb";

type Tuple3 = [number, number, number];
type PivotName =
  | "hip"
  | "neck"
  | "shoulderL"
  | "shoulderR"
  | "elbowL"
  | "elbowR"
  | "legL"
  | "legR"
  | "kneeL"
  | "kneeR"
  | "ankleL"
  | "ankleR";

/** Generated parts grouped by the pivot that moves them. */
const PIVOT_PARTS: Record<PivotName, string[]> = {
  hip: ["torso", "backpack", "straps", "packPiping"],
  neck: ["hood"],
  shoulderL: ["upperArmL"],
  shoulderR: ["upperArmR"],
  elbowL: ["forearmL", "cuffBandsL", "handL"],
  elbowR: ["forearmR", "cuffBandsR", "handR"],
  legL: ["thighL"],
  legR: ["thighR"],
  kneeL: ["shinL"],
  kneeR: ["shinR"],
  ankleL: ["shoeL", "soleL", "shoeGlowL"],
  ankleR: ["shoeR", "soleR", "shoeGlowR"],
};

const v3 = (a: readonly number[]) => new Vector3(a[0], a[1], a[2]);
const RIG = {
  hip: v3(CHARACTER_RIG.hip),
  neck: v3(CHARACTER_RIG.neck),
  shoulderL: v3(CHARACTER_RIG.shoulderL),
  shoulderR: v3(CHARACTER_RIG.shoulderR),
  elbowL: v3(CHARACTER_RIG.elbowL),
  elbowR: v3(CHARACTER_RIG.elbowR),
  wristL: v3(CHARACTER_RIG.wristL),
  wristR: v3(CHARACTER_RIG.wristR),
  legL: v3(CHARACTER_RIG.legL),
  legR: v3(CHARACTER_RIG.legR),
  kneeL: v3(CHARACTER_RIG.kneeL),
  kneeR: v3(CHARACTER_RIG.kneeR),
  ankleL: v3(CHARACTER_RIG.ankleL),
  ankleR: v3(CHARACTER_RIG.ankleR),
};

/** Rest joint positions in figure space (metres, figure faces +Z, +X is its left). */
export const REST = {
  elbowL: RIG.elbowL.toArray() as Tuple3,
  elbowR: RIG.elbowR.toArray() as Tuple3,
  wristL: RIG.wristL.toArray() as Tuple3,
  wristR: RIG.wristR.toArray() as Tuple3,
  kneeL: RIG.kneeL.toArray() as Tuple3,
  kneeR: RIG.kneeR.toArray() as Tuple3,
  ankleL: RIG.ankleL.toArray() as Tuple3,
  ankleR: RIG.ankleR.toArray() as Tuple3,
  headCenter: CHARACTER_RIG.headCenter as readonly number[],
  headRadii: CHARACTER_RIG.headRadii as readonly number[],
} as const;

/**
 * A pose is a set of joint *targets* in figure space, not joint angles:
 * arms are aimed so the elbow and wrist land on the given points, legs so
 * the knee and ankle do. That makes poses readable ("hand on the keyboard
 * at …") and lets two poses blend by plain interpolation.
 */
export interface Pose {
  /** Vertical offset of the whole figure (negative to sit). */
  lift: number;
  /** Body rotation around the hips: x leans forward (+), z rolls. */
  lean: Tuple3;
  head: Tuple3;
  elbowL: Tuple3;
  wristL: Tuple3;
  elbowR: Tuple3;
  wristR: Tuple3;
  kneeL: Tuple3;
  ankleL: Tuple3;
  kneeR: Tuple3;
  ankleR: Tuple3;
  footL: Tuple3;
  footR: Tuple3;
}

export const REST_POSE: Pose = {
  lift: 0,
  lean: [0, 0, 0],
  head: [0, 0, 0],
  elbowL: REST.elbowL,
  wristL: REST.wristL,
  elbowR: REST.elbowR,
  wristR: REST.wristR,
  kneeL: REST.kneeL,
  ankleL: REST.ankleL,
  kneeR: REST.kneeR,
  ankleR: REST.ankleR,
  footL: [0, 0, 0],
  footR: [0, 0, 0],
};

export function pose(partial: Partial<Pose>): Pose {
  return { ...REST_POSE, ...partial };
}

const lerp3 = (a: Tuple3, b: Tuple3, t: number): Tuple3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = { lift: a.lift + (b.lift - a.lift) * t } as Pose;
  for (const key of Object.keys(REST_POSE) as (keyof Pose)[]) {
    if (key === "lift") continue;
    (out[key] as Tuple3) = lerp3(a[key] as Tuple3, b[key] as Tuple3, t);
  }
  return out;
}

/** Smooth 0→1 easing used for pose transitions. */
export const ease = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Shared geometry built once from the low-detail model. */
export interface FigureTemplate {
  geometries: Record<PivotName, BufferGeometry>;
  face: BufferGeometry;
}

/** Loads the glyph-figure model; the download also serves as a connection-speed sample. */
export async function loadGlyphTemplate(
  signal?: AbortSignal,
): Promise<{ template: FigureTemplate; sample: DownloadSample }> {
  const { buffer, sample } = await timedFetch(GLYPH_MODEL_URL, signal);
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  return { template: createTemplate(gltf.scene), sample };
}

function createTemplate(model: Object3D): FigureTemplate {
  const geometries = {} as Record<PivotName, BufferGeometry>;
  for (const [pivot, names] of Object.entries(PIVOT_PARTS) as [
    PivotName,
    string[],
  ][]) {
    const parts = names.map((name) => {
      const mesh = model.getObjectByName(name);
      if (!(mesh instanceof Mesh))
        throw new Error(`Glyph model is missing "${name}"`);
      return mesh.geometry as BufferGeometry;
    });
    const merged = mergeGeometries(parts, false);
    if (!merged) throw new Error(`Could not merge glyph parts for ${pivot}`);
    merged.computeBoundingSphere();
    geometries[pivot] = merged;
  }
  return { geometries, face: new SphereGeometry(1, 20, 14) };
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpQ = new Quaternion();
const tmpQInv = new Quaternion();

/**
 * A glyph-rendered copy of the hacker that can be posed. It shares the
 * player's proportions and pivots (same generator, lower detail) and is
 * drawn with the glyph material; the N emblems stay solid green so the
 * brand reads at a distance. Anonymous figures are built without emblems.
 */
export class GlyphFigure {
  readonly root = new Group();
  readonly body: Group;
  readonly head: Group;
  readonly armL: Group;
  readonly armR: Group;
  readonly forearmL: Group;
  readonly forearmR: Group;
  readonly legL: Group;
  readonly legR: Group;
  readonly shinL: Group;
  readonly shinR: Group;
  readonly footL: Group;
  readonly footR: Group;

  constructor(
    template: FigureTemplate,
    material: Material,
    voidMaterial: Material,
    options: {
      logoShapes?: Shape[] | null;
      logoMaterial?: Material;
      outlineMaterial?: Material;
      name?: string;
    } = {},
  ) {
    this.root.name = options.name ?? "glyph-figure";
    const pivot = (
      parent: Group,
      parentAt: Vector3,
      at: Vector3,
      part?: PivotName,
    ) => {
      const group = new Group();
      group.position.copy(at).sub(parentAt);
      if (part) {
        group.add(new Mesh(template.geometries[part], material));
        // Silhouette line: keeps poses readable through the glyph texture.
        if (options.outlineMaterial)
          group.add(
            new Mesh(template.geometries[part], options.outlineMaterial),
          );
      }
      parent.add(group);
      return group;
    };
    const origin = new Vector3();
    const logo = (
      parent: Group,
      parentAt: Vector3,
      key: keyof typeof CHARACTER_LOGOS,
    ) => {
      if (!options.logoShapes || !options.logoMaterial) return;
      parent.add(
        createEmblem(
          options.logoShapes,
          CHARACTER_LOGOS[key],
          parentAt,
          options.logoMaterial,
          key,
        ),
      );
    };

    this.body = pivot(this.root, origin, RIG.hip, "hip");
    logo(this.body, RIG.hip, "logoChest");
    logo(this.body, RIG.hip, "logoBack");

    this.head = pivot(this.body, RIG.hip, RIG.neck, "neck");
    const face = new Mesh(template.face, voidMaterial);
    face.scale.copy(v3(CHARACTER_RIG.headRadii));
    face.position.copy(v3(CHARACTER_RIG.headCenter)).sub(RIG.neck);
    this.head.add(face);

    this.armL = pivot(this.body, RIG.hip, RIG.shoulderL, "shoulderL");
    this.armR = pivot(this.body, RIG.hip, RIG.shoulderR, "shoulderR");
    logo(this.armL, RIG.shoulderL, "logoSleeveL");
    logo(this.armR, RIG.shoulderR, "logoSleeveR");
    this.forearmL = pivot(this.armL, RIG.shoulderL, RIG.elbowL, "elbowL");
    this.forearmR = pivot(this.armR, RIG.shoulderR, RIG.elbowR, "elbowR");

    this.legL = pivot(this.root, origin, RIG.legL, "legL");
    this.legR = pivot(this.root, origin, RIG.legR, "legR");
    this.shinL = pivot(this.legL, RIG.legL, RIG.kneeL, "kneeL");
    this.shinR = pivot(this.legR, RIG.legR, RIG.kneeR, "kneeR");
    this.footL = pivot(this.shinL, RIG.kneeL, RIG.ankleL, "ankleL");
    this.footR = pivot(this.shinR, RIG.kneeR, RIG.ankleR, "ankleR");
  }

  /** Point in the figure's hand frame (for props held in the hand). */
  static wristOffset(side: "L" | "R"): Vector3 {
    return side === "L"
      ? RIG.wristL.clone().sub(RIG.elbowL)
      : RIG.wristR.clone().sub(RIG.elbowR);
  }

  /** Head-space offset of the face centre (for the mask). */
  static faceOffset(): Vector3 {
    return v3(CHARACTER_RIG.headCenter).sub(RIG.neck);
  }

  apply(p: Pose, baseY = 0) {
    this.root.position.y = baseY + p.lift;
    this.body.rotation.set(p.lean[0], p.lean[1], p.lean[2]);
    this.head.rotation.set(p.head[0], p.head[1], p.head[2]);

    // Arm targets are in figure space; convert into the (possibly leaning) body frame.
    tmpQInv.copy(this.body.quaternion).invert();
    const toBody = (t: Tuple3, out: Vector3) =>
      out.set(t[0], t[1], t[2]).sub(RIG.hip).applyQuaternion(tmpQInv);
    aimLimb(
      this.armL,
      this.forearmL,
      RIG.elbowL.clone().sub(RIG.shoulderL),
      RIG.wristL.clone().sub(RIG.elbowL),
      toBody(p.elbowL, tmpA),
      toBody(p.wristL, tmpB),
    );
    aimLimb(
      this.armR,
      this.forearmR,
      RIG.elbowR.clone().sub(RIG.shoulderR),
      RIG.wristR.clone().sub(RIG.elbowR),
      toBody(p.elbowR, tmpA),
      toBody(p.wristR, tmpB),
    );

    // Legs hang from the root, so figure space is already their parent frame.
    aimLimb(
      this.legL,
      this.shinL,
      RIG.kneeL.clone().sub(RIG.legL),
      RIG.ankleL.clone().sub(RIG.kneeL),
      tmpA.set(...p.kneeL),
      tmpB.set(...p.ankleL),
    );
    aimLimb(
      this.legR,
      this.shinR,
      RIG.kneeR.clone().sub(RIG.legR),
      RIG.ankleR.clone().sub(RIG.kneeR),
      tmpA.set(...p.kneeR),
      tmpB.set(...p.ankleR),
    );
    // Feet: undo the shin's rotation so soles stay level, then add the pose's own angle.
    this.levelFoot(this.footL, this.legL, this.shinL, p.footL);
    this.levelFoot(this.footR, this.legR, this.shinR, p.footR);
  }

  private levelFoot(foot: Group, leg: Group, shin: Group, extra: Tuple3) {
    tmpQ.copy(leg.quaternion).multiply(shin.quaternion).invert();
    foot.quaternion.copy(tmpQ);
    if (extra[0] || extra[1] || extra[2]) {
      foot.rotateX(extra[0]);
      foot.rotateY(extra[1]);
      foot.rotateZ(extra[2]);
    }
  }
}

/**
 * Two-bone aim: rotates `upper` so its child joint points at `jointTarget`,
 * then `lower` so its end points at `endTarget`. Bone lengths are kept;
 * targets only provide directions. All vectors are in `upper`'s parent frame.
 */
function aimLimb(
  upper: Group,
  lower: Group,
  restUpper: Vector3,
  restLower: Vector3,
  jointTarget: Vector3,
  endTarget: Vector3,
) {
  const upperDir = tmpC.copy(jointTarget).sub(upper.position).normalize();
  upper.quaternion.setFromUnitVectors(restUpper.clone().normalize(), upperDir);
  const joint = upper.position
    .clone()
    .addScaledVector(upperDir, restUpper.length());
  const lowerDir = endTarget.clone().sub(joint).normalize();
  lowerDir.applyQuaternion(tmpQ.copy(upper.quaternion).invert());
  lower.quaternion.setFromUnitVectors(restLower.normalize(), lowerDir);
}

/** Rest bone lengths of the arm (shoulder→elbow, elbow→wrist), metres. */
export const ARM_LENGTHS = {
  upper: RIG.elbowL.distanceTo(RIG.shoulderL),
  lower: RIG.wristL.distanceTo(RIG.elbowL),
};

/** Rest shoulder positions in figure space. */
export const SHOULDER = {
  L: RIG.shoulderL.toArray() as Tuple3,
  R: RIG.shoulderR.toArray() as Tuple3,
};

/**
 * Two-bone IK for the elbow: returns the elbow position that lets a
 * forearm of `lowerLength` (wrist, or a held tool's tip) end exactly on
 * `target`, bending toward `pole`. Out-of-reach targets get a straight arm.
 */
export function solveElbow(
  shoulder: Tuple3,
  target: Tuple3,
  pole: Tuple3,
  lowerLength = ARM_LENGTHS.lower,
  upperLength = ARM_LENGTHS.upper,
): Tuple3 {
  const s = new Vector3(...shoulder);
  const toTarget = new Vector3(...target).sub(s);
  const d = Math.max(1e-4, toTarget.length());
  const u = toTarget.divideScalar(d);
  const cos = Math.min(
    1,
    Math.max(
      -1,
      (d * d + upperLength * upperLength - lowerLength * lowerLength) /
        (2 * d * upperLength),
    ),
  );
  const w = new Vector3(...pole);
  w.addScaledVector(u, -w.dot(u));
  if (w.lengthSq() < 1e-8) w.set(0, -1, 0).addScaledVector(u, u.y);
  w.normalize();
  const sin = Math.sqrt(1 - cos * cos);
  return s
    .addScaledVector(u, upperLength * cos)
    .addScaledVector(w, upperLength * sin)
    .toArray() as Tuple3;
}
