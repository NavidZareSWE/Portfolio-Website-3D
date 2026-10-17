import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  Mesh,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type Vec3 = readonly [number, number, number];

/** Albedo tints understood by the glyph material (see GlyphKit `solid`). */
export const TINT = {
  /** Default surface. */
  base: "#5a5a5a",
  /** Darker, recessed parts (legs, frames, cushions' seams). */
  dark: "#2a2a2a",
  /** Highlighted parts (tops, white details). */
  light: "#b4b4b4",
  /** Brand accent (rendered in neon-green glyphs). */
  accent: "#2a8a3a",
} as const;

const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();
const tmpScale = new Vector3(1, 1, 1);
const tmpPos = new Vector3();

/**
 * Collects primitive parts with their transforms and tints, then merges
 * them into a single geometry, so one static prop is one draw call.
 * Coordinates are in the prop's local space (metres, Y up).
 */
export class PropKit {
  private readonly parts: BufferGeometry[] = [];

  /** Axis-aligned box; `at` is the centre of its base unless `centered`. */
  box(
    size: Vec3,
    at: Vec3,
    options: {
      rot?: Vec3;
      tint?: ColorRepresentation;
      centered?: boolean;
    } = {},
  ) {
    const geometry = new BoxGeometry(size[0], size[1], size[2]);
    if (!options.centered) geometry.translate(0, size[1] / 2, 0);
    return this.add(geometry, at, options.rot, options.tint);
  }

  /** Vertical cylinder standing on `at` unless `centered`. */
  cylinder(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    at: Vec3,
    options: {
      rot?: Vec3;
      tint?: ColorRepresentation;
      segments?: number;
      centered?: boolean;
    } = {},
  ) {
    const geometry = new CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      options.segments ?? 14,
    );
    if (!options.centered) geometry.translate(0, height / 2, 0);
    return this.add(geometry, at, options.rot, options.tint);
  }

  /** A straight bar between two points (beams, crane lattice, cords). */
  bar(
    from: Vec3,
    to: Vec3,
    thickness: number,
    options: { tint?: ColorRepresentation; round?: boolean } = {},
  ) {
    const a = new Vector3(...from);
    const b = new Vector3(...to);
    const length = a.distanceTo(b);
    const geometry = options.round
      ? new CylinderGeometry(thickness / 2, thickness / 2, length, 8)
      : new BoxGeometry(thickness, length, thickness);
    const direction = b.clone().sub(a).normalize();
    tmpQuat.setFromUnitVectors(new Vector3(0, 1, 0), direction);
    const mid = a.add(b).multiplyScalar(0.5);
    tmpMatrix.compose(mid, tmpQuat, tmpScale);
    geometry.applyMatrix4(tmpMatrix);
    return this.push(geometry, options.tint);
  }

  sphere(
    radius: number,
    at: Vec3,
    options: { scale?: Vec3; tint?: ColorRepresentation } = {},
  ) {
    const geometry = new SphereGeometry(radius, 16, 12);
    if (options.scale) geometry.scale(...options.scale);
    return this.add(geometry, at, undefined, options.tint);
  }

  torus(
    radius: number,
    tube: number,
    at: Vec3,
    options: { rot?: Vec3; tint?: ColorRepresentation; arc?: number } = {},
  ) {
    const geometry = new TorusGeometry(
      radius,
      tube,
      8,
      24,
      options.arc ?? Math.PI * 2,
    );
    return this.add(geometry, at, options.rot, options.tint);
  }

  /** Adds an arbitrary geometry (ownership passes to the kit). */
  geometry(
    geometry: BufferGeometry,
    at: Vec3 = [0, 0, 0],
    rot?: Vec3,
    tint?: ColorRepresentation,
  ) {
    return this.add(geometry, at, rot, tint);
  }

  get isEmpty() {
    return this.parts.length === 0;
  }

  build(material: Material, name: string): Mesh {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error(`PropKit could not merge "${name}"`);
    this.parts.forEach((part) => part.dispose());
    this.parts.length = 0;
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, material);
    mesh.name = name;
    return mesh;
  }

  private add(
    geometry: BufferGeometry,
    at: Vec3,
    rot: Vec3 | undefined,
    tint: ColorRepresentation | undefined,
  ) {
    tmpEuler.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
    tmpQuat.setFromEuler(tmpEuler);
    tmpMatrix.compose(tmpPos.set(...at), tmpQuat, tmpScale);
    geometry.applyMatrix4(tmpMatrix);
    return this.push(geometry, tint);
  }

  /** Normalises attributes (non-indexed position/normal/color) so parts merge. */
  private push(source: BufferGeometry, tint: ColorRepresentation = TINT.base) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== "position" && name !== "normal")
        geometry.deleteAttribute(name);
    }
    const color = new Color(tint);
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++)
      colors.set([color.r, color.g, color.b], i * 3);
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    this.parts.push(geometry);
    return this;
  }
}
