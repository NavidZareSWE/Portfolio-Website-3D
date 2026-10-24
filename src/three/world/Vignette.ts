import { THEME } from "@/theme/theme";
import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Quaternion,
  Vector3,
  type Material,
  type Object3D,
  type Shape,
  type Texture,
} from "three";
import { PLAYER } from "../config";
import type { SceneLabels } from "../labels";
import type { Collider, CollisionSystem } from "../physics/CollisionSystem";
import { FONTS } from "@/theme/theme";
import { MONO_FONT_FAMILY } from "../effects/AsciiAtlas";
import { SCREEN_ALIGNED_YAW, screenToWorld } from "../utils/math";
import { CRISP_LAYER } from "../render/CrispComposite";
import { Fader } from "./Fade";
import { GlyphFigure, type FigureTemplate } from "./GlyphFigure";
import type { GlyphKit } from "./GlyphKit";

/** Everything a vignette needs, created once per world. */
export interface VignetteContext {
  kit: GlyphKit;
  template: FigureTemplate;
  collisions: CollisionSystem;
  logoShapes: Shape[] | null;
  /** Logo as a white-on-black mask (for the easel drawing). */
  logoMask: Texture;
  /** Two-tone Anonymous mask images (RGBA, transparent outside the face). */
  maskTextures: { white: Texture; dark: Texture };
  /** Translated signs and labels. */
  labels: SceneLabels;
  materials: {
    figure: Material;
    figureOutline: Material;
    prop: Material;
    void: Material;
    logo: Material;
    shadow: Material;
  };
}

/** Camera elevation seen from the screen-aligned frame (camera is fixed). */
export const FACE_CAMERA_PITCH = -Math.atan2(1.15, Math.hypot(1.135, 1.45));

/**
 * A small scene placed beside a card. Its group is screen-aligned: local +X
 * is screen-right, local −Z is "up the screen" and +Z faces the camera, so
 * layouts can be authored the way they will be seen.
 */
export abstract class Vignette {
  readonly group = new Group();
  private readonly stations: Station[] = [];
  private readonly ghosts: Ghost[] = [];

  constructor(
    protected readonly ctx: VignetteContext,
    center: { right: number; up: number },
    name: string,
    /** Uniform scale of the whole scene (figures are 1.5x the player). */
    scale = 1,
  ) {
    const p = screenToWorld(center.right, center.up);
    this.group.position.set(p.x, 0, p.z);
    this.group.rotation.y = SCREEN_ALIGNED_YAW;
    this.group.scale.setScalar(scale);
    this.group.name = name;
  }

  update(time: number, dt: number, player: Vector3) {
    this.updateStations(player, dt);
    this.animate(time, dt, player);
  }

  protected abstract animate(time: number, dt: number, player: Vector3): void;

  /** Local (x, z) of `frame` (default: the scene group) → world position on the ground. */
  protected toWorld(
    x: number,
    z: number,
    frame: Object3D = this.group,
  ): Vector3 {
    frame.updateWorldMatrix(true, false);
    const p = frame.localToWorld(new Vector3(x, 0, z));
    p.y = 0;
    return p;
  }

  /** World-space footprint of a box authored in `frame` (centre, half extents, yaw). */
  private footprint(
    frame: Object3D,
    x: number,
    z: number,
    width: number,
    depth: number,
  ) {
    const centre = this.toWorld(x, z, frame);
    const scale = frame.getWorldScale(new Vector3()).x;
    const quaternion = frame.getWorldQuaternion(new Quaternion());
    const axis = new Vector3(1, 0, 0).applyQuaternion(quaternion);
    return {
      x: centre.x,
      z: centre.z,
      halfWidth: (width * scale) / 2,
      halfDepth: (depth * scale) / 2,
      yaw: Math.atan2(-axis.z, axis.x),
    };
  }

  /**
   * Solid box (things without figures in them). `top` is the standable
   * height in `frame` units (scaled with the scene); Infinity = cannot be
   * stood on. Returns the collider so moving parts can update its top.
   */
  protected boxCollider(
    x: number,
    z: number,
    width: number,
    depth: number,
    top: number,
    frame: Object3D = this.group,
  ): Collider {
    const scale = frame.getWorldScale(new Vector3()).x;
    const collider: Collider = {
      kind: "box",
      ...this.footprint(frame, x, z, width, depth),
      top: top * scale,
    };
    this.ctx.collisions.add(collider);
    return collider;
  }

  protected circleCollider(
    x: number,
    z: number,
    radius: number,
    top = Infinity,
    frame: Object3D = this.group,
  ): Collider {
    const c = this.toWorld(x, z, frame);
    const scale = frame.getWorldScale(new Vector3()).x;
    const collider: Collider = {
      kind: "circle",
      x: c.x,
      z: c.z,
      radius: radius * scale,
      top: top * scale,
    };
    this.ctx.collisions.add(collider);
    return collider;
  }

  /**
   * A pass-through station (a figure and its furniture). It has no collider;
   * when the player enters its footprint the whole station dissolves (see
   * Fade.ts), so only the playable character is seen, and it fades back in
   * once the player has fully left.
   */
  protected station(
    object: Object3D,
    x: number,
    z: number,
    width: number,
    depth: number,
    frame: Object3D = object,
  ) {
    this.stations.push({
      fader: new Fader(object),
      ...this.footprint(frame, x, z, width, depth),
      inside: false,
    });
  }

  /**
   * A moving pass-through element (a walking or drawing figure): `wrapper`
   * fades out while the player is within `radius` (in `track`'s units) of `track`.
   */
  protected ghost(wrapper: Object3D, track: Object3D, radius: number) {
    track.updateWorldMatrix(true, false);
    const scale = track.getWorldScale(new Vector3()).x;
    this.ghosts.push({
      fader: new Fader(wrapper),
      track,
      radius: radius * scale,
      inside: false,
    });
  }

  private updateStations(player: Vector3, dt: number) {
    for (const s of this.stations) {
      // Hysteresis: enter at the footprint + player radius, leave 0.3 m further out.
      const margin = s.inside ? PLAYER_RADIUS + 0.3 : PLAYER_RADIUS;
      const dx = player.x - s.x;
      const dz = player.z - s.z;
      const cos = Math.cos(s.yaw);
      const sin = Math.sin(s.yaw);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      s.inside =
        Math.abs(lx) < s.halfWidth + margin &&
        Math.abs(lz) < s.halfDepth + margin;
      s.fader.update(s.inside, dt);
    }
    for (const g of this.ghosts) {
      const p = g.track.getWorldPosition(TMP);
      const limit = g.radius + PLAYER_RADIUS + (g.inside ? 0.3 : 0);
      g.inside = Math.hypot(player.x - p.x, player.z - p.z) < limit;
      g.fader.update(g.inside, dt);
    }
  }

  protected figure(withLogo: boolean, name: string): GlyphFigure {
    return new GlyphFigure(
      this.ctx.template,
      this.ctx.materials.figure,
      this.ctx.materials.void,
      {
        logoShapes: withLogo ? this.ctx.logoShapes : null,
        logoMaterial: this.ctx.materials.logo,
        outlineMaterial: this.ctx.materials.figureOutline,
        name,
      },
    );
  }

  /** Soft contact shadow on the floor. */
  protected shadow(
    parent: Group,
    x: number,
    z: number,
    width: number,
    depth: number,
    yaw = 0,
  ) {
    const mesh = new Mesh(SHADOW_GEOMETRY, this.ctx.materials.shadow);
    mesh.rotation.set(-Math.PI / 2, 0, yaw);
    mesh.scale.set(width, depth, 1);
    // Above the thin ground layers (site pad 15 mm, rugs 12 mm): a shadow at
    // the same height as the surface under it z-fights or disappears.
    mesh.position.set(x, SHADOW_HEIGHT, z);
    mesh.renderOrder = 1;
    parent.add(mesh);
    return mesh;
  }
}

interface Station {
  fader: Fader;
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  yaw: number;
  inside: boolean;
}

interface Ghost {
  fader: Fader;
  track: Object3D;
  radius: number;
  inside: boolean;
}

const PLAYER_RADIUS = PLAYER.radius;
const TMP = new Vector3();
const SHADOW_GEOMETRY = new PlaneGeometry(1, 1);
const SHADOW_HEIGHT = 0.025;

export function createShadowMaterial(): MeshBasicMaterial {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0.85)");
  gradient.addColorStop(0.55, "rgba(0,0,0,0.5)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new MeshBasicMaterial({
    map: new CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    color: 0x000000,
  });
}

/**
 * Text drawn in the world's monospace face onto a plane that faces the
 * (fixed) camera: signs, "CALLING…" and similar labels. `setText` redraws
 * only when the text actually changes.
 */
const PERSIAN_SCRIPT = /[\u0600-\u06FF]/;

/**
 * Canvas pixels per metre for world text. High enough that signs stay sharp
 * when the camera is close (a section open) on 4K and high-DPI screens;
 * mipmaps keep them smooth when they are small. `fontSize`, line widths and
 * glow are given at the old 160 px/m and scaled with this.
 */
const TEXT_PPM = 384;
const BASE_PPM = 160;

export class TextPlane {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private text = "";
  /** Canvas pixels per pixel at the base density (scales sizes given in px). */
  private readonly unit: number;

  constructor(
    private readonly options: {
      width: number;
      height: number;
      pixelsPerMetre?: number;
      color?: string;
      fontSize?: number;
      align?: CanvasTextAlign;
      frame?: boolean;
      /** Right-to-left text (Persian): Vazirmatn and RTL shaping. */
      rtl?: boolean;
    },
  ) {
    const ppm = options.pixelsPerMetre ?? TEXT_PPM;
    this.unit = ppm / BASE_PPM;
    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.round(options.width * ppm);
    this.canvas.height = Math.round(options.height * ppm);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.mesh = new Mesh(
      new PlaneGeometry(options.width, options.height),
      new MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.mesh.rotation.x = FACE_CAMERA_PITCH;
    // Drawn in the full-resolution pass when the world renders below it.
    this.mesh.layers.set(CRISP_LAYER);
  }

  /**
   * @param fitAs  Text used to size the font instead of `text`, so animated
   *               labels ("CALLING", "CALLING.", ...) keep a steady size.
   */
  setText(text: string, fitAs = text) {
    if (text === this.text) return;
    this.text = text;
    const { canvas, options } = this;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const color = options.color ?? THEME.cyan;
    if (options.frame) {
      // Cut-corner frame, the same silhouette as the HUD panels and cards.
      const c = canvas.height * 0.22;
      const w = canvas.width;
      const h = canvas.height;
      ctx.beginPath();
      ctx.moveTo(c, 2);
      ctx.lineTo(w - c, 2);
      ctx.lineTo(w - 2, c);
      ctx.lineTo(w - 2, h - c);
      ctx.lineTo(w - c, h - 2);
      ctx.lineTo(c, h - 2);
      ctx.lineTo(2, h - c);
      ctx.lineTo(2, c);
      ctx.closePath();
      ctx.fillStyle = "rgba(4, 16, 20, 0.82)";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 * this.unit;
      ctx.stroke();
    }
    const lines = text.split("\n");
    // Lines with Persian script use Vazirmatn and RTL shaping; code lines stay LTR mono.
    const fontFor = (line: string) =>
      options.rtl && PERSIAN_SCRIPT.test(line)
        ? FONTS.persian
        : MONO_FONT_FAMILY;
    // Shrink to fit the plane, so translated text never overflows the frame.
    let fontSize = options.fontSize
      ? options.fontSize * this.unit
      : canvas.height * 0.42;
    const maxWidth = canvas.width * 0.88;
    for (const line of fitAs.split("\n")) {
      ctx.font = `700 ${fontSize}px ${fontFor(line)}`;
      const width = ctx.measureText(line).width;
      if (width > maxWidth) fontSize *= maxWidth / width;
    }
    ctx.fillStyle = color;
    ctx.textAlign = options.align ?? "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = fontSize * 0.35;
    const lineHeight = fontSize * 1.2;
    const x = ctx.textAlign === "left" ? fontSize * 0.6 : canvas.width / 2;
    lines.forEach((line, i) => {
      ctx.font = `700 ${fontSize}px ${fontFor(line)}`;
      ctx.direction = fontFor(line) === FONTS.persian ? "rtl" : "ltr";
      ctx.fillText(
        line,
        x,
        canvas.height / 2 + (i - (lines.length - 1) / 2) * lineHeight,
      );
    });
    this.texture.needsUpdate = true;
  }

  set opacity(value: number) {
    this.mesh.material.opacity = value;
    this.mesh.visible = value > 0.01;
  }
}

/** Neon colour of a theme token as a Color (helper for vignette materials). */
export const themeColor = (token: keyof typeof THEME) =>
  new Color(THEME[token]);
