import { THEME } from "@/theme/theme";
import {
  AdditiveBlending,
  BackSide,
  Color,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
} from "three";
import { WORLD } from "../config";
import { createRandom } from "../utils/math";
import {
  ATLAS_CODE_LENGTH,
  ATLAS_CODE_START,
  GLSL_ATLAS_UV,
  GLSL_HASH,
} from "./AsciiAtlas";

/** Shared GLSL: one falling glyph stream sampled at (row, column). */
export const GLSL_STREAM = /* glsl */ `
float streamLevel(float row, float rows, float seed, float t, float speed) {
  float span = rows + 18.0;
  float head = rows - mod(t * speed + seed * span, span);
  float k = row - head;                       // rows above the head form the trail
  float trail = (k >= 0.0 && k < 16.0) ? pow(1.0 - k / 16.0, 2.2) : 0.0;
  float headGlow = 1.0 - smoothstep(0.0, 1.0, abs(k));
  return trail * 0.7 + headGlow * 0.6;
}
`;

const columnVertex = /* glsl */ `
attribute vec4 aColumn; // x: height, y: speed (rows/s), z: seed, w: width
varying vec2 vUv;
varying float vRows;
varying float vSeed;
varying float vSpeed;
varying float vFade;
void main() {
  vec3 anchor = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  // Cylindrical billboard: always faces the camera around the vertical axis.
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  vec3 world = anchor + right * position.x * aColumn.w + vec3(0.0, position.y * aColumn.x, 0.0);
  vUv = vec2(position.x + 0.5, position.y);
  vRows = floor(aColumn.x / 0.24);
  vSeed = aColumn.z;
  vSpeed = aColumn.y;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vFade = 1.0 - smoothstep(30.0, 85.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const columnFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uMotion;
uniform vec3 uColor;
uniform vec3 uHead;
varying vec2 vUv;
varying float vRows;
varying float vSeed;
varying float vSpeed;
varying float vFade;
${GLSL_HASH}
${GLSL_ATLAS_UV}
${GLSL_STREAM}
void main() {
  float t = uTime * uMotion;
  float rowF = vUv.y * vRows;
  float row = floor(rowF);
  float level = streamLevel(row, vRows, vSeed, t, vSpeed);
  if (level < 0.01) discard;
  float index = ${ATLAS_CODE_START.toFixed(1)} + floor(hash12(vec2(row, vSeed * 37.0) + floor(t * 2.0 + vSeed)) * ${ATLAS_CODE_LENGTH.toFixed(1)});
  float glyph = texture(uAtlas, atlasUv(index, vec2(vUv.x, fract(rowF)))).r;
  float ends = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
  vec3 color = mix(uColor, uHead, smoothstep(0.75, 1.0, level));
  gl_FragColor = vec4(color * glyph * level * ends * vFade, 1.0);
  #include <colorspace_fragment>
}
`;

const backdropVertex = /* glsl */ `
varying vec2 vUv;
varying float vY;
void main() {
  vUv = uv;
  vY = (modelMatrix * vec4(position, 1.0)).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const backdropFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uMotion;
uniform float uColumns;
uniform float uRows;
uniform vec3 uColor;
varying vec2 vUv;
varying float vY;
${GLSL_HASH}
${GLSL_ATLAS_UV}
${GLSL_STREAM}
void main() {
  float t = uTime * uMotion;
  vec2 q = vec2(vUv.x * uColumns, vUv.y * uRows);
  vec2 cell = floor(q);
  float seed = hash12(vec2(cell.x, 4.2));
  float speed = 3.0 + seed * 7.0;
  float level = streamLevel(cell.y, uRows, seed * 13.0, t, speed) * step(0.35, hash12(vec2(cell.x, 9.1)));
  float index = ${ATLAS_CODE_START.toFixed(1)} + floor(hash12(cell + floor(t * 1.5 + seed * 5.0)) * ${ATLAS_CODE_LENGTH.toFixed(1)});
  float glyph = textureGrad(uAtlas, atlasUv(index, fract(q)), dFdx(q) / 8.0, dFdy(q) / 8.0).r;
  float horizon = smoothstep(-8.0, 2.0, vY) * (1.0 - smoothstep(20.0, 40.0, vY));
  gl_FragColor = vec4(uColor * glyph * (0.06 + level * 0.55) * horizon, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * "Digital rain" (card-2 reference): instanced vertical glyph streams
 * around the world, plus a distant cylindrical backdrop of dimmer
 * streams. Two draw calls; all motion is computed in shaders.
 */
export class AsciiRain {
  readonly group = new Group();
  private readonly columnMaterial: ShaderMaterial;
  private readonly backdropMaterial: ShaderMaterial;

  constructor(atlas: Texture, seed = 11) {
    const random = createRandom(seed);
    const placements: { x: number; z: number; h: number }[] = [];
    // Streams stay outside the walkable area: seen from the elevated camera,
    // columns inside it read as smeared bars across the floor.
    for (let i = 0; i < 160; i++) {
      const a = random() * Math.PI * 2;
      const r = WORLD.playRadius + 2 + random() * 20;
      placements.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        h: 7 + random() * 12,
      });
    }

    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    const params = new Float32Array(placements.length * 4);
    this.columnMaterial = new ShaderMaterial({
      vertexShader: columnVertex,
      fragmentShader: columnFragment,
      uniforms: {
        uAtlas: { value: atlas },
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uColor: { value: new Color(THEME.tealMid) },
        uHead: { value: new Color(THEME.teal).multiplyScalar(1.3) },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const columns = new InstancedMesh(
      geometry,
      this.columnMaterial,
      placements.length,
    );
    columns.name = "ascii-rain";
    columns.frustumCulled = false;
    const matrix = new Matrix4();
    placements.forEach((placement, i) => {
      matrix.makeTranslation(placement.x, -0.2, placement.z);
      columns.setMatrixAt(i, matrix);
      params.set([placement.h, 4 + random() * 8, random() * 100, 0.22], i * 4);
    });
    geometry.setAttribute("aColumn", new InstancedBufferAttribute(params, 4));
    columns.instanceMatrix.needsUpdate = true;

    this.backdropMaterial = new ShaderMaterial({
      vertexShader: backdropVertex,
      fragmentShader: backdropFragment,
      uniforms: {
        uAtlas: { value: atlas },
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uColumns: { value: 1040 },
        uRows: { value: 200 },
        uColor: { value: new Color(THEME.tealMid) },
      },
      side: BackSide,
      depthWrite: false,
    });
    const backdrop = new Mesh(
      new CylinderGeometry(78, 78, 80, 128, 1, true),
      this.backdropMaterial,
    );
    backdrop.position.y = 24;
    backdrop.name = "ascii-rain-backdrop";
    // Drawn after the opaque world (floor, towers, scenes): it only shows
    // where nothing else is, so depth testing skips its covered pixels instead
    // of shading the whole screen and then painting over it.
    backdrop.renderOrder = 10;

    this.group.add(backdrop, columns);
  }

  update(time: number) {
    this.columnMaterial.uniforms.uTime.value = time;
    this.backdropMaterial.uniforms.uTime.value = time;
  }

  setReducedMotion(reduced: boolean) {
    const motion = reduced ? 0.1 : 1;
    this.columnMaterial.uniforms.uMotion.value = motion;
    this.backdropMaterial.uniforms.uMotion.value = motion;
  }
}
