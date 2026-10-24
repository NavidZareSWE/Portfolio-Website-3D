import { THEME } from "@/theme/theme";
import {
  Camera,
  CircleGeometry,
  Color,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import { INTERACTION, WORLD } from "../config";
import { SCREEN_FORWARD, SCREEN_RIGHT } from "../utils/math";
import {
  ATLAS_CODE_LENGTH,
  ATLAS_CODE_START,
  ATLAS_RAMP_LENGTH,
  GLSL_ATLAS_UV,
  GLSL_HASH,
} from "./AsciiAtlas";

export const MAX_FLOOR_CARDS = 5;
/** Footprints kept for the floor's step ripples (a ring buffer). */
const MAX_STEPS = 16;

/** Corners of the view in normalised device coordinates. */
const FIT_CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;
const FIT_ORIGIN = new Vector3();
const FIT_POINT = new Vector3();

/** Added to the stored glyph index for trace cells (indices are < 64). */
const GLYPH_FLAG = 64;

const vertexShader = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/*
 * The floor is drawn entirely from glyphs on a screen-aligned grid (so the
 * characters read upright from the fixed camera). Each cell picks a glyph
 * from a scalar "signal" field:
 *   - faint dust everywhere (sparse light glyphs),
 *   - circuit traces on a Manhattan lattice with pulses running along them,
 *   - concentric emitter rings and light pools around each card (cyan),
 *   - the NZSWE logo near spawn, written in neon-green glyphs,
 *   - a soft glow and blob shadow under the player,
 *   - footprints: each step brightens the glyphs under it and sends out a
 *     ring that fades (sprinting leaves a longer-lived trail).
 *
 * Everything except the glyph shape, the play-area edge and the blob shadow
 * is constant across a cell, and a cell covers hundreds of screen pixels. So
 * the field is evaluated once per cell per frame into a small texture (one
 * texel per cell, the "field pass"), and the floor pass only looks it up.
 * This keeps the per-pixel cost low, which is what decides the frame rate on
 * machines without a GPU.
 */

/** Field pass: one fragment per cell. Output (RGBA8): signal, cyan weight, logo, glyph index + trace flag. */
const fieldVertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fieldFragmentShader = /* glsl */ `
uniform sampler2D uLogo;
uniform float uTime;
uniform float uMotion;
uniform float uCell;
uniform float uFloorRadius;
uniform float uRingRadius;
uniform float uOffset;
uniform vec2 uRight;
uniform vec2 uForward;
uniform vec2 uLogoCenter;
uniform vec2 uLogoSize;
uniform vec3 uPlayer;
uniform vec3 uCardPos[${MAX_FLOOR_CARDS}];
uniform float uCardFocus[${MAX_FLOOR_CARDS}];
/** Footprints: (x, z, time placed, lifetime in s); lifetime 0 = unused. */
uniform vec4 uSteps[${MAX_STEPS}];
/** Real (not motion-scaled) time, for footprint ages. */
uniform float uClock;

${GLSL_HASH}

void main() {
  vec2 cell = floor(gl_FragCoord.xy) - uOffset;
  vec2 centerScreen = (cell + 0.5) * uCell;
  vec2 cw = centerScreen.x * uRight + centerScreen.y * uForward;
  if (length(cw) > uFloorRadius + 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float t = uTime * uMotion;

  // --- circuit traces -----------------------------------------------------
  vec2 macro = floor(cell / 6.0);
  vec2 inMacro = cell - macro * 6.0;
  float row = step(abs(inMacro.y - 3.0), 0.1);
  float col = step(abs(inMacro.x - 3.0), 0.1);
  float hOn = step(0.5, hash12(macro + vec2(3.1, 7.7)));
  float vOn = step(0.56, hash12(macro + vec2(9.4, 1.3)));
  float trace = max(row * hOn, col * vOn);
  float node = row * col * step(0.55, hash12(macro + 5.3)) * max(hOn, vOn);
  float pulse = pow(fract(dot(cell, vec2(0.031, 0.027)) - t * 0.22 + hash12(macro) * 7.0), 14.0);

  float signal = 0.03 + valueNoise(cw * 0.3) * 0.05;
  signal += trace * (0.2 + pulse * 0.55) + node * 0.4;

  // --- card emitters: light pools, concentric rings, interaction ring -----
  float cyanWeight = 0.0;
  for (int i = 0; i < ${MAX_FLOOR_CARDS}; i++) {
    float d = distance(cw, uCardPos[i].xz);
    // Beyond 4.5 m every term below is < 0.001 (the pool is exp(-7)).
    if (d > 4.5) continue;
    float focus = uCardFocus[i];
    float pool = exp(-d * d * 0.35) * (0.4 + 0.35 * focus);
    float waves = (1.0 - smoothstep(0.0, 0.16, abs(fract(d * 1.3 - t * 0.5) - 0.5) - 0.32))
      * (1.0 - smoothstep(1.2, 2.4, d)) * step(1.0, d);
    float boundary = (1.0 - smoothstep(0.0, 0.2, abs(d - uRingRadius)))
      * step(0.4, fract(atan(cw.y - uCardPos[i].z, cw.x - uCardPos[i].x) * 3.8197 + t * 0.12));
    float c = pool + waves * (0.25 + 0.35 * focus) + boundary * (0.18 + 0.5 * focus);
    signal += c;
    cyanWeight = max(cyanWeight, min(1.0, c * 2.0));
  }

  // --- player glow ----------------------------------------------------------
  float dp = distance(cw, uPlayer.xz);
  signal += exp(-dp * dp * 0.5) * 0.22;

  // --- footprints: a bright print and an expanding, fading ring --------------
  float stepGlow = 0.0;
  for (int i = 0; i < ${MAX_STEPS}; i++) {
    vec4 fp = uSteps[i];
    float age = uClock - fp.z;
    if (fp.w <= 0.0 || age < 0.0 || age > fp.w) continue;
    float d = distance(cw, fp.xy);
    if (d > 2.4) continue;
    float life = 1.0 - age / fp.w;
    float print = exp(-d * d * 10.0) * life;
    float radius = 0.15 + age * 1.3;
    float ring = (1.0 - smoothstep(0.05, 0.22, abs(d - radius))) * life * life * 0.7
      * step(0.5, uMotion) * (1.0 - smoothstep(1.5, 2.2, radius));
    stepGlow += print + ring;
  }
  stepGlow = min(stepGlow, 1.0);
  signal += stepGlow * 0.8;
  cyanWeight = max(cyanWeight, min(1.0, stepGlow * 1.8));
  signal = clamp(signal, 0.0, 1.0);

  // --- logo written in green glyphs ------------------------------------------
  vec2 logoUv = (centerScreen - uLogoCenter) / uLogoSize + 0.5;
  float logo = 0.0;
  if (all(greaterThan(logoUv, vec2(0.0))) && all(lessThan(logoUv, vec2(1.0)))) {
    logo = texture(uLogo, logoUv).r;
  }

  // --- glyph selection --------------------------------------------------------
  float flicker = floor(t * (0.6 + hash12(cell) * 1.2));
  float codeGlyph = ${ATLAS_CODE_START.toFixed(1)} + floor(hash12(cell + flicker) * ${ATLAS_CODE_LENGTH.toFixed(1)});
  float rampGlyph = clamp(floor(signal * ${(ATLAS_RAMP_LENGTH - 1).toFixed(1)} + 0.4), 0.0, ${(ATLAS_RAMP_LENGTH - 1).toFixed(1)});
  float isCode = max(max(max(trace, node), step(0.5, logo)), step(0.3, stepGlow));
  float index = mix(rampGlyph, codeGlyph, isCode);

  gl_FragColor = vec4(signal, cyanWeight, logo, (index + ${GLYPH_FLAG.toFixed(1)} * trace) / 255.0);
}
`;

/** Floor pass: per pixel, only the glyph shape, colour, play-area edge and blob shadow. */
const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform sampler2D uField;
uniform float uCell;
uniform float uOffset;
uniform float uFieldSize;
uniform float uPlayRadius;
uniform float uFloorRadius;
uniform vec2 uRight;
uniform vec2 uForward;
uniform vec3 uPlayer;
uniform vec3 uBase;
uniform vec3 uDeep;
uniform vec3 uTealMid;
uniform vec3 uTeal;
uniform vec3 uCyan;
uniform vec3 uGreen;
uniform vec3 uBackground;
varying vec3 vWorld;

${GLSL_ATLAS_UV}

void main() {
  vec2 xz = vWorld.xz;
  vec2 screen = vec2(dot(xz, uRight), dot(xz, uForward));
  vec2 p = screen / uCell;
  vec2 cell = floor(p);
  vec2 local = fract(p);

  // |cell centre| (the screen basis is orthonormal, so this equals the world distance).
  float r = length((cell + 0.5) * uCell);
  float inside = 1.0 - smoothstep(uPlayRadius - 0.3, uPlayRadius + 0.5, r);
  float outerFade = 1.0 - smoothstep(uPlayRadius + 4.0, uFloorRadius, r);

  ivec2 texel = clamp(ivec2(cell + uOffset), ivec2(0), ivec2(int(uFieldSize) - 1));
  vec4 field = texelFetch(uField, texel, 0);
  float signal = field.r;
  float cyanWeight = field.g;
  float logo = field.b;
  float packed = floor(field.a * 255.0 + 0.5);
  float trace = step(${GLYPH_FLAG.toFixed(1)}, packed);
  float index = packed - ${GLYPH_FLAG.toFixed(1)} * trace;

  vec2 grad = vec2(1.0 / 8.0);
  float glyph = textureGrad(uAtlas, atlasUv(index, local), dFdx(p) * grad, dFdy(p) * grad).r;

  // --- colour -------------------------------------------------------------------
  vec3 tealColor = mix(uDeep, uTealMid, smoothstep(0.05, 0.3, signal));
  tealColor = mix(tealColor, uTeal, smoothstep(0.35, 0.8, signal));
  vec3 glyphColor = mix(tealColor, uCyan, cyanWeight);
  float intensity = 0.35 + signal * 1.3;
  glyphColor = mix(glyphColor, uGreen, logo);
  intensity = mix(intensity, 1.25, logo);

  vec3 color = uBase + glyphColor * glyph * intensity * inside;
  // Beyond the playable disc the circuit continues, dimmer.
  color += uDeep * glyph * (0.25 + trace) * 0.6 * (1.0 - inside) * outerFade;

  // Boundary line of the play area.
  float edge = 1.0 - smoothstep(0.0, 0.1, abs(length(xz) - uPlayRadius - 0.2));
  color += uTealMid * edge * 0.7;

  // Soft blob shadow under the player, shrinking and fading with height.
  float h = max(uPlayer.y, 0.0);
  float sd = distance(xz, uPlayer.xz);
  float shadow = (1.0 - smoothstep(0.1, 0.55 + h * 0.15, sd)) * (0.85 - min(h * 0.25, 0.6));
  color *= 1.0 - shadow;

  color = mix(uBackground, color, outerFade);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface FloorLogo {
  texture: Texture;
  /** Centre in screen-aligned layout units (right, up). */
  center: { right: number; up: number };
  /** Size in metres (width, height). */
  size: { width: number; height: number };
}

export class AsciiFloor {
  readonly mesh: Mesh<CircleGeometry, ShaderMaterial>;
  private readonly cardPositions: Vector3[];
  private readonly cardFocus: number[];
  private readonly field: WebGLRenderTarget;
  private readonly fieldScene = new Scene();
  private readonly fieldCamera = new Camera();
  private readonly fieldMaterial: ShaderMaterial;
  private readonly fieldOffset: number;
  private readonly fieldSize: number;
  private readonly steps = Array.from(
    { length: MAX_STEPS },
    () => new Vector4(0, 0, 0, 0),
  );
  private nextStep = 0;

  constructor(atlas: Texture, logo: FloorLogo) {
    this.cardPositions = Array.from(
      { length: MAX_FLOOR_CARDS },
      () => new Vector3(1e4, 0, 1e4),
    );
    this.cardFocus = new Array(MAX_FLOOR_CARDS).fill(0);

    // One texel per floor cell, covering the whole floor disc.
    const offset = Math.ceil((WORLD.floorRadius + 1) / WORLD.cellSize) + 1;
    const size = offset * 2;
    this.field = new WebGLRenderTarget(size, size, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });

    const shared = {
      uCell: { value: WORLD.cellSize },
      uOffset: { value: offset },
      uFloorRadius: { value: WORLD.floorRadius },
      uRight: { value: new Vector2(SCREEN_RIGHT.x, SCREEN_RIGHT.z) },
      uForward: { value: new Vector2(SCREEN_FORWARD.x, SCREEN_FORWARD.z) },
      uPlayer: { value: new Vector3() },
    };

    this.fieldMaterial = new ShaderMaterial({
      vertexShader: fieldVertexShader,
      fragmentShader: fieldFragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        ...shared,
        uLogo: { value: logo.texture },
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uRingRadius: { value: INTERACTION.enterRadius },
        uLogoCenter: { value: new Vector2(logo.center.right, logo.center.up) },
        uLogoSize: { value: new Vector2(logo.size.width, logo.size.height) },
        uCardPos: { value: this.cardPositions },
        uCardFocus: { value: this.cardFocus },
        uSteps: { value: this.steps },
        uClock: { value: 0 },
      },
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.fieldMaterial);
    quad.frustumCulled = false;
    this.fieldScene.add(quad);

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        ...shared,
        uAtlas: { value: atlas },
        uField: { value: this.field.texture },
        uFieldSize: { value: size },
        uPlayRadius: { value: WORLD.playRadius },
        uBase: { value: new Color("#020507") },
        uDeep: { value: new Color(THEME.tealDeep) },
        uTealMid: { value: new Color(THEME.tealMid) },
        uTeal: { value: new Color(THEME.teal) },
        uCyan: { value: new Color(THEME.cyan) },
        uGreen: { value: new Color(THEME.green) },
        uBackground: { value: new Color(THEME.bg) },
      },
    });

    const geometry = new CircleGeometry(WORLD.floorRadius, 128);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = "ascii-floor";
    // Drawn after the other opaque objects (props, towers, figures, player):
    // floor pixels they cover fail the depth test before the glyph shader runs.
    this.mesh.renderOrder = 9;
    this.fieldOffset = offset;
    this.fieldSize = size;
  }

  setCardPosition(index: number, position: Vector3) {
    this.cardPositions[index]?.copy(position);
  }

  /**
   * Leaves a footprint at (x, z) that fades over `life` seconds. `time` is
   * the same clock passed to `update`.
   */
  addStep(x: number, z: number, time: number, life: number) {
    this.steps[this.nextStep].set(x, z, time, life);
    this.nextStep = (this.nextStep + 1) % MAX_STEPS;
  }

  update(time: number, player: Vector3, focus: readonly number[]) {
    this.fieldMaterial.uniforms.uTime.value = time;
    this.fieldMaterial.uniforms.uClock.value = time;
    (this.mesh.material.uniforms.uPlayer.value as Vector3).copy(player);
    for (let i = 0; i < MAX_FLOOR_CARDS; i++) this.cardFocus[i] = focus[i] ?? 0;
  }

  /**
   * Evaluates the per-cell field for this frame. Call once before rendering
   * the scene with `camera`. Only the cells under the camera's view of the
   * ground are evaluated; the rest of the field is not sampled this frame.
   */
  renderField(renderer: WebGLRenderer, camera: Camera) {
    this.fitFieldToView(camera);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.field);
    renderer.render(this.fieldScene, this.fieldCamera);
    renderer.setRenderTarget(previous);
  }

  /** Scissor the field pass to the bounding rectangle of the visible ground (in cells). */
  private fitFieldToView(camera: Camera) {
    camera.updateMatrixWorld();
    const origin = camera.getWorldPosition(FIT_ORIGIN);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const include = (x: number, z: number) => {
      const right = x * SCREEN_RIGHT.x + z * SCREEN_RIGHT.z;
      const up = x * SCREEN_FORWARD.x + z * SCREEN_FORWARD.z;
      minX = Math.min(minX, right);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, up);
      maxY = Math.max(maxY, up);
    };
    for (const [nx, ny] of FIT_CORNERS) {
      const direction = FIT_POINT.set(nx, ny, 1)
        .unproject(camera)
        .sub(origin)
        .normalize();
      // Rays that miss the ground (above the horizon) reach the floor's rim.
      const t = direction.y < -1e-4 ? -origin.y / direction.y : Infinity;
      const reach = Math.min(t, (WORLD.floorRadius + 1) * 3);
      include(origin.x + direction.x * reach, origin.z + direction.z * reach);
    }
    const cell = WORLD.cellSize;
    const clamp = (value: number) =>
      Math.min(this.fieldSize, Math.max(0, value));
    const x0 = clamp(Math.floor(minX / cell) + this.fieldOffset - 2);
    const y0 = clamp(Math.floor(minY / cell) + this.fieldOffset - 2);
    const x1 = clamp(Math.ceil(maxX / cell) + this.fieldOffset + 2);
    const y1 = clamp(Math.ceil(maxY / cell) + this.fieldOffset + 2);
    this.field.scissor.set(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    this.field.scissorTest = true;
  }

  setReducedMotion(reduced: boolean) {
    this.fieldMaterial.uniforms.uMotion.value = reduced ? 0.15 : 1;
  }

  /** The field pass lives outside the scene graph, so it is released here. */
  dispose() {
    this.field.dispose();
    this.fieldMaterial.dispose();
    this.fieldScene.traverse((node) => (node as Mesh).geometry?.dispose());
  }
}
