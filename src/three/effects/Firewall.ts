import { THEME } from "@/theme/theme";
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Texture,
} from "three";
import { PLAYER, REDUCED_MOTION_SPEED, WORLD } from "../config";
import type { SceneLabels } from "../labels";
import { CAMERA_DIRECTION, SCREEN_ALIGNED_YAW, damp } from "../utils/math";
import { TextPlane } from "../world/Vignette";
import {
  ATLAS_CODE_LENGTH,
  ATLAS_CODE_START,
  GLSL_ATLAS_UV,
  GLSL_HASH,
} from "./AsciiAtlas";

const RADIUS = WORLD.playRadius + 0.2;
const HEIGHT = 2.4;
/** Glyph cell size on the wall (metres). */
const CELL = 0.22;
/** The player counts as touching the wall within this distance of the limit. */
const TOUCH_MARGIN = 0.06;
/**
 * Only an arc of the wall around the player is drawn (the glow fades out
 * within ~8 m anyway): this half-width in metres, along the wall.
 */
const ARC_HALF_WIDTH = 11;
/** The wall is not drawn while the player is farther than this from the edge. */
const SHOW_DISTANCE = 9;

const vertexShader = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/*
 * A curtain of code glyphs around the play area. It only shows near the
 * player (so the world edge stays clean from afar), thins out where it
 * stands between the player and the camera, and flares red around the
 * point the player pushes against.
 */
const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uMotion;
uniform vec3 uPlayer;
/** Contact point (x, z) and strength 0..1. */
uniform vec3 uHit;
uniform vec2 uToCamera;
uniform vec3 uCyan;
uniform vec3 uAlert;
uniform float uRadius;
uniform float uHeight;
varying vec3 vWorld;

${GLSL_HASH}
${GLSL_ATLAS_UV}

void main() {
  float t = uTime * uMotion;
  // Columns are anchored to the world angle, so they stay put as the arc follows the player.
  vec2 q = vec2(atan(vWorld.z, vWorld.x) * uRadius, vWorld.y) / ${CELL.toFixed(2)};
  vec2 cell = floor(q);
  float column = hash12(vec2(cell.x, 4.1));
  float speed = 2.0 + column * 3.0;
  float stream = pow(fract((cell.y + t * speed) / (6.0 + column * 10.0) + column * 7.0), 4.0);
  float index = ${ATLAS_CODE_START.toFixed(1)} + floor(hash12(cell + floor(t * 3.0)) * ${ATLAS_CODE_LENGTH.toFixed(1)});
  float glyph = textureGrad(uAtlas, atlasUv(index, fract(q)), dFdx(q) / 8.0, dFdy(q) / 8.0).r;

  float d = distance(vWorld.xz, uPlayer.xz);
  float near = exp(-d * d / 30.0);
  float topFade = 1.0 - smoothstep(uHeight * 0.45, uHeight, vWorld.y);
  float base = (1.0 - smoothstep(0.0, 0.9, vWorld.y)) * 0.2;

  float hitD = distance(vWorld.xz, uHit.xy);
  float hit = uHit.z * exp(-hitD * hitD / 2.5);
  float strobe = 0.7 + 0.3 * step(0.5, fract(t * 9.0));

  float level = ((stream * 0.6 + 0.12) * glyph * topFade + base) * near;
  level += hit * (glyph * 0.9 + 0.2) * topFade * strobe;
  // A flicker shared by the whole wall, like a failing projector.
  level *= 0.85 + 0.15 * step(0.3, hash12(vec2(floor(t * 11.0), 2.0)));

  // Thin out where the wall stands between the player and the camera.
  float front = dot(vWorld.xz - uPlayer.xz, uToCamera);
  level *= 1.0 - 0.7 * smoothstep(0.0, 2.0, front);

  vec3 color = mix(uCyan, uAlert, min(1.0, hit * 1.6)) * level;
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

/** The flickering FIREWALL at the edge of the play area. */
export class Firewall {
  readonly group = new Group();
  private readonly material: ShaderMaterial;
  private readonly wall: Mesh;
  private readonly label: TextPlane;
  private readonly labelHolder = new Group();
  private readonly hit = new Vector3();
  private strength = 0;
  private lastTime = 0;

  constructor(atlas: Texture, labels: SceneLabels) {
    this.group.name = "firewall";
    const arc = (ARC_HALF_WIDTH * 2) / RADIUS;
    const geometry = new CylinderGeometry(
      RADIUS,
      RADIUS,
      HEIGHT,
      48,
      1,
      true,
      -arc / 2,
      arc,
    );
    geometry.translate(0, HEIGHT / 2, 0);
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uAtlas: { value: atlas },
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uPlayer: { value: new Vector3() },
        uHit: { value: this.hit },
        uToCamera: {
          value: new Vector2(
            CAMERA_DIRECTION.x,
            CAMERA_DIRECTION.z,
          ).normalize(),
        },
        uCyan: { value: new Color(THEME.cyan) },
        uAlert: { value: new Color(THEME.alert) },
        uRadius: { value: RADIUS },
        uHeight: { value: HEIGHT },
      },
    });
    const wall = new Mesh(geometry, this.material);
    this.wall = wall;
    wall.name = "firewall-wall";
    wall.renderOrder = 12;
    this.group.add(wall);

    this.label = new TextPlane({
      width: 3.2,
      height: 0.8,
      color: THEME.alert,
      frame: true,
      rtl: labels.rtl,
    });
    this.label.setText(
      `${labels.world.firewall}\n${labels.world.accessDenied}`,
    );
    this.label.opacity = 0;
    this.label.mesh.renderOrder = 13;
    this.labelHolder.rotation.y = SCREEN_ALIGNED_YAW;
    this.labelHolder.add(this.label.mesh);
    this.group.add(this.labelHolder);
  }

  /** True while the player is pressed against the edge of the play area. */
  static touching(player: Vector3): boolean {
    const limit = WORLD.playRadius - PLAYER.radius - TOUCH_MARGIN;
    return player.x * player.x + player.z * player.z >= limit * limit;
  }

  update(time: number, player: Vector3) {
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = time;
    (uniforms.uPlayer.value as Vector3).copy(player);

    // Draw only the arc facing the player, and only near the edge.
    const distance = Math.hypot(player.x, player.z);
    this.wall.visible = distance > WORLD.playRadius - SHOW_DISTANCE;
    // CylinderGeometry's angle 0 points along +Z; rotate it to the player.
    this.wall.rotation.y = Math.atan2(player.x, player.z);

    const touching = Firewall.touching(player);
    if (touching) {
      const length = Math.hypot(player.x, player.z) || 1;
      const x = (player.x / length) * RADIUS;
      const z = (player.z / length) * RADIUS;
      this.hit.x = x;
      this.hit.y = z;
      this.labelHolder.position.set(x, 2.5, z);
    }
    this.strength = damp(
      this.strength,
      touching ? 1 : 0,
      touching ? 10 : 2.5,
      dt,
    );
    this.hit.z = this.strength;
    this.label.opacity = Math.min(1, this.strength * 1.4);
  }

  setReducedMotion(reduced: boolean) {
    this.material.uniforms.uMotion.value = reduced ? REDUCED_MOTION_SPEED : 1;
  }
}
