import { THEME } from "@/theme/theme";
import {
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Texture,
} from "three";
import { GLYPH_FOG, PLAYER, REDUCED_MOTION_SPEED } from "../config";
import {
  ATLAS_CODE_LENGTH,
  ATLAS_CODE_START,
  GLSL_ATLAS_UV,
  GLSL_HASH,
} from "../effects/AsciiAtlas";
import type { Collider, CollisionSystem } from "../physics/CollisionSystem";
import {
  SCREEN_ALIGNED_YAW,
  SCREEN_FORWARD,
  SCREEN_RIGHT,
  damp,
  screenToWorld,
} from "../utils/math";
import { PLAY_LAYOUT } from "../world/layout";

/** Fraction of the player's speed a cube moves at while pushed (they are heavy). */
const PUSH_FACTOR = 0.55;
/** The player must walk into a face at least this fast to move the cube. */
const MIN_PUSH_SPEED = 0.4;
/** How far from a face (beyond touching) still counts as contact. */
const CONTACT_SLACK = 0.06;

const vertexShader = /* glsl */ `
attribute float aPush;
varying vec3 vLocal;
varying vec3 vNormal;
varying float vPush;
varying float vDepth;
varying float vSeed;
void main() {
  vLocal = position;
  vNormal = normal;
  vPush = aPush;
  vSeed = float(gl_InstanceID) * 7.31;
  vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/*
 * Glyphs in the cube's own space (they travel with it when pushed): a 5×5
 * grid of code characters per face, a bright frame, a brighter lid, and a
 * flare while the cube is being pushed.
 */
const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uMotion;
uniform vec3 uFace;
uniform vec3 uGlyph;
uniform vec3 uEdge;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vLocal;
varying vec3 vNormal;
varying float vPush;
varying float vDepth;
varying float vSeed;

${GLSL_HASH}
${GLSL_ATLAS_UV}

void main() {
  vec3 n = abs(vNormal);
  // Face coordinates in 0..1 (the box spans x, z in -0.5..0.5 and y in 0..1).
  vec2 f = n.y > 0.5 ? vLocal.xz + 0.5 : (n.x > 0.5 ? vec2(vLocal.z + 0.5, vLocal.y) : vec2(vLocal.x + 0.5, vLocal.y));
  vec2 q = f * 5.0;
  vec2 cell = floor(q);
  float t = uTime * uMotion;
  float index = ${ATLAS_CODE_START.toFixed(1)} + floor(hash12(cell + vSeed + floor(t * (0.4 + vPush * 6.0)) + vNormal.xy * 3.0) * ${ATLAS_CODE_LENGTH.toFixed(1)});
  float glyph = textureGrad(uAtlas, atlasUv(index, fract(q)), dFdx(q) / 8.0, dFdy(q) / 8.0).r;
  float lid = step(0.5, vNormal.y);
  float level = (0.35 + 0.35 * lid + vPush * 0.6) * glyph;
  vec2 e = min(f, 1.0 - f);
  float frame = 1.0 - smoothstep(0.0, fwidth(min(e.x, e.y)) * 2.5 + 0.02, min(e.x, e.y));
  vec3 color = uFace + uGlyph * level + uEdge * frame * (0.55 + vPush * 0.6);
  color = mix(color, uFog, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface Cube {
  /** Centre in screen-aligned coordinates (right, up). */
  right: number;
  up: number;
  collider: Extract<Collider, { kind: "box" }>;
  push: number;
}

/**
 * Glyph cubes the player can push around by walking into them. Each cube is
 * a box collider that moves along the face's axis; it is resolved against
 * every other collider (and the firewall), so cubes stop at obstacles and
 * against each other. They are low enough to jump onto.
 */
export class PushCubes {
  readonly mesh: InstancedMesh<BoxGeometry, ShaderMaterial>;
  private readonly cubes: Cube[];
  private readonly size = PLAY_LAYOUT.cubeSize;
  private readonly pushAttribute: InstancedBufferAttribute;
  private readonly probe = new Vector3();
  private readonly matrix = new Matrix4();
  private readonly rotation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    SCREEN_ALIGNED_YAW,
  );
  private readonly scale: Vector3;
  private readonly position = new Vector3();

  constructor(
    atlas: Texture,
    private readonly collisions: CollisionSystem,
  ) {
    const half = this.size / 2;
    this.scale = new Vector3(this.size, this.size, this.size);
    this.cubes = PLAY_LAYOUT.cubes.map((spot) => {
      const p = screenToWorld(spot.right, spot.up);
      const collider: Cube["collider"] = {
        kind: "box",
        x: p.x,
        z: p.z,
        halfWidth: half,
        halfDepth: half,
        yaw: SCREEN_ALIGNED_YAW,
        top: this.size,
      };
      collisions.add(collider);
      return { right: spot.right, up: spot.up, collider, push: 0 };
    });

    const geometry = new BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    this.pushAttribute = new InstancedBufferAttribute(
      new Float32Array(this.cubes.length),
      1,
    );
    geometry.setAttribute("aPush", this.pushAttribute);
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uAtlas: { value: atlas },
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uFace: { value: new Color("#031012") },
        uGlyph: { value: new Color(THEME.teal) },
        uEdge: { value: new Color(THEME.cyan) },
        uFog: { value: new Color(THEME.bg) },
        uFogNear: { value: GLYPH_FOG.near },
        uFogFar: { value: GLYPH_FOG.far },
      },
    });
    this.mesh = new InstancedMesh(geometry, material, this.cubes.length);
    this.mesh.name = "push-cubes";
    // Moving instances: the bounds would go stale, so never cull.
    this.mesh.frustumCulled = false;
    this.cubes.forEach((_, i) => this.writeMatrix(i));
  }

  /**
   * Moves the cubes the player is walking into. Call before the character
   * controller's step, so the player is then resolved against the cube's new
   * position and follows it at the cube's (slower) pace.
   */
  push(dt: number, player: Vector3, velocity: Vector3) {
    const half = this.size / 2;
    const reach = half + PLAYER.radius + CONTACT_SLACK;
    const pr = player.x * SCREEN_RIGHT.x + player.z * SCREEN_RIGHT.z;
    const pu = player.x * SCREEN_FORWARD.x + player.z * SCREEN_FORWARD.z;
    const vr = velocity.x * SCREEN_RIGHT.x + velocity.z * SCREEN_RIGHT.z;
    const vu = velocity.x * SCREEN_FORWARD.x + velocity.z * SCREEN_FORWARD.z;

    this.cubes.forEach((cube) => {
      let pushing = false;
      // Standing on (or jumping over) the cube never pushes it.
      if (player.y < cube.collider.top - PLAYER.stepHeight) {
        const dr = cube.right - pr;
        const du = cube.up - pu;
        let moveR = 0;
        let moveU = 0;
        if (
          Math.abs(du) < half &&
          Math.abs(dr) < reach &&
          dr * vr > 0 &&
          Math.abs(vr) > MIN_PUSH_SPEED
        ) {
          moveR = vr * PUSH_FACTOR * dt;
        } else if (
          Math.abs(dr) < half &&
          Math.abs(du) < reach &&
          du * vu > 0 &&
          Math.abs(vu) > MIN_PUSH_SPEED
        ) {
          moveU = vu * PUSH_FACTOR * dt;
        }
        if (moveR !== 0 || moveU !== 0) {
          pushing = true;
          this.moveCube(cube, cube.right + moveR, cube.up + moveU);
        }
      }
      cube.push = damp(cube.push, pushing ? 1 : 0, pushing ? 12 : 3, dt);
    });
  }

  private moveCube(cube: Cube, right: number, up: number) {
    const p = screenToWorld(right, up);
    // Resolve as a circle slightly smaller than the box, against everything else.
    this.probe.set(p.x, 0, p.z);
    this.collisions.resolve(this.probe, this.size * 0.5, cube.collider);
    cube.collider.x = this.probe.x;
    cube.collider.z = this.probe.z;
    cube.right = this.probe.x * SCREEN_RIGHT.x + this.probe.z * SCREEN_RIGHT.z;
    cube.up = this.probe.x * SCREEN_FORWARD.x + this.probe.z * SCREEN_FORWARD.z;
  }

  private writeMatrix(i: number) {
    const cube = this.cubes[i];
    this.position.set(cube.collider.x, 0, cube.collider.z);
    this.matrix.compose(this.position, this.rotation, this.scale);
    this.mesh.setMatrixAt(i, this.matrix);
  }

  update(time: number) {
    this.mesh.material.uniforms.uTime.value = time;
    this.cubes.forEach((cube, i) => {
      this.writeMatrix(i);
      this.pushAttribute.setX(i, cube.push);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.pushAttribute.needsUpdate = true;
  }

  setReducedMotion(reduced: boolean) {
    this.mesh.material.uniforms.uMotion.value = reduced
      ? REDUCED_MOTION_SPEED
      : 1;
  }
}
