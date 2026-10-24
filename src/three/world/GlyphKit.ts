import { THEME } from "@/theme/theme";
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  ShaderMaterial,
  Vector2,
  Vector3,
  type ColorRepresentation,
  type Texture,
} from "three";
import { GLYPH_FOG } from "../config";
import {
  ATLAS_CODE_LENGTH,
  ATLAS_CODE_START,
  ATLAS_RAMP_LENGTH,
  GLSL_ATLAS_UV,
  GLSL_HASH,
} from "../effects/AsciiAtlas";
import { GLSL_STREAM } from "../effects/AsciiRain";

/**
 * Every vignette object is drawn in the same glyph language as the floor,
 * blocks and cards: surfaces are grids of characters from the shared atlas.
 * `GlyphKit` owns the shared uniforms (atlas, time, motion, fog) and hands
 * out the handful of material variants the world needs:
 *
 *   solid   — any mesh: lit, triplanar world-space glyph grid (figures, props)
 *   image   — a texture turned into ASCII art per cell (Anonymous mask, canvas)
 *   screen  — falling green code (monitors, laptops)
 *   water   — animated wave glyphs (the pool)
 *   sprites — instanced camera-facing glyph characters (data packets)
 *   orbs    — instanced glowing spheres covered in code glyphs (routing queries)
 *   track   — dashed light strip on the floor that flows along its length
 */

const R = ATLAS_RAMP_LENGTH.toFixed(1);
const CODE_START = ATLAS_CODE_START.toFixed(1);
const CODE_LENGTH = ATLAS_CODE_LENGTH.toFixed(1);

/**
 * Pass-through fade (see world/Fade.ts). `uFade` 1 = fully shown, 0 = gone:
 * glyph cells drop out one by one in random order and the rest dim, so the
 * element dissolves in the same character grid it is drawn with.
 */
export const GLSL_FADE = /* glsl */ `
uniform float uFade;
void fadeCell(vec2 cell) {
  if (uFade < 0.999 && hash12(cell * 0.61 + 17.3) > uFade) discard;
}
float fadeDim() {
  return 0.4 + 0.6 * uFade;
}
`;

const GLSL_COMMON = /* glsl */ `
${GLSL_HASH}
${GLSL_FADE}
${GLSL_ATLAS_UV}
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uMotion;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;

/** Glyph from the density ramp (index 1..15) for a 0..1 level. */
float rampIndex(float level) {
  return clamp(floor(level * (${R} - 1.0)) + 1.0, 1.0, ${R} - 1.0);
}
float glyphAt(float index, vec2 local, vec2 q) {
  return textureGrad(uAtlas, atlasUv(index, local), dFdx(q) / 8.0, dFdy(q) / 8.0).r;
}
vec3 applyFog(vec3 color, float depth) {
  return mix(color, uFog, smoothstep(uFogNear, uFogFar, depth));
}
`;

const solidVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTint;
varying float vDepth;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
#ifdef USE_COLOR
  vTint = color.rgb;
#else
  vTint = vec3(1.0);
#endif
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const solidFragment = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uColor;
uniform vec3 uAccent;
uniform vec3 uBase;
uniform vec3 uLight;
uniform float uCell;
uniform float uBright;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTint;
varying float vDepth;

void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(cameraPosition - vWorld);
  float diffuse = max(dot(n, uLight), 0.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);

  // Vertex colour carries albedo + baked AO; green-dominant tints are accents.
  float albedo = clamp(dot(vTint, vec3(0.299, 0.587, 0.114)) * 3.0, 0.0, 1.0);
  float accent = smoothstep(0.06, 0.18, vTint.g - max(vTint.r, vTint.b));
  // Strong key/shadow split so forms read through the glyph texture.
  float lum = (0.07 + 0.95 * diffuse) * mix(0.6, 1.15, albedo) + 0.22 * rim;

  // Triplanar cell grid in world space, so glyphs stay glued to the surface.
  vec3 a = abs(n);
  vec2 q = a.y > max(a.x, a.z) ? vWorld.xz : (a.x > a.z ? vWorld.zy : vWorld.xy);
  q /= uCell;
  vec2 cell = floor(q);
  fadeCell(cell);
  float jitter = hash12(cell * 1.7 + 3.1);
  float level = clamp(lum + (jitter - 0.5) * 0.12, 0.0, 1.0);
  float index = rampIndex(level);
  // A few cells flicker to code glyphs, like the blocks.
  float flick = step(0.986, hash12(cell + floor(uTime * uMotion * 2.5)));
  index = mix(index, ${CODE_START} + floor(hash12(cell + 7.0) * ${CODE_LENGTH}), flick);
  float glyph = glyphAt(index, fract(q), q);

  vec3 ink = mix(uColor, uAccent, accent);
  vec3 color = uBase * (0.25 + 1.5 * lum) + ink * glyph * (0.25 + level * 1.3) * uBright;
  color += uAccent * accent * 0.18;
  color *= fadeDim();
  gl_FragColor = vec4(applyFog(color, vDepth), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const uvVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/*
 * Image → ASCII: the texture is sampled once at each cell centre, so every
 * cell is one glyph whose density follows the image's luminance and whose
 * colour is the image's colour (exactly how the card portrait is built).
 * `uReveal` wipes the image in left to right (the easel drawing).
 */
const imageFragment = /* glsl */ `
${GLSL_COMMON}
uniform sampler2D uMap;
uniform vec2 uGrid;
uniform vec3 uLight;
uniform vec3 uTint;
uniform vec3 uPaper;
uniform float uReveal;
uniform float uAlphaCut;
uniform float uMaskMode;
uniform float uGlyphContrast;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDepth;

void main() {
  vec4 here = texture2D(uMap, vUv);
  if (here.a < uAlphaCut) discard;
  vec2 q = vUv * uGrid;
  vec2 cell = floor(q);
  fadeCell(cell);
  vec4 tex = texture2D(uMap, (cell + 0.5) / uGrid);
  // Ragged wipe edge: a cell is drawn once the reveal front has passed it.
  float front = uReveal * 1.08 - 0.04 + (hash12(cell) - 0.5) * 0.06;
  float drawn = step((cell.x + 0.5) / uGrid.x, front);
  // Colour images keep their colours; masks (white on black) ink uTint onto uPaper.
  vec3 image = mix(tex.rgb * uTint, mix(uPaper, uTint, tex.r), uMaskMode);
  vec3 rgb = mix(uPaper, image, drawn);
  float l = clamp(dot(rgb, vec3(0.299, 0.587, 0.114)) * 1.15, 0.0, 1.0);
  // Per-cell variation so flat tones read as ASCII art, not a uniform grid.
  float level = clamp(l * (0.78 + 0.22 * hash12(cell * 1.3 + 5.0)), 0.0, 1.0);
  float glyph = glyphAt(rampIndex(level), fract(q), q);

  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float light = 0.72 + 0.4 * max(dot(n, uLight), 0.0);
  // uGlyphContrast 0: image with glyph texture; 1: pure ASCII art (dark between glyphs).
  vec3 color = rgb * (mix(0.22, 0.015, uGlyphContrast) + mix(0.95, 1.25, uGlyphContrast) * glyph) * light * fadeDim();
  gl_FragColor = vec4(applyFog(color, vDepth), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Falling green code on a screen (Matrix-style), one stream per column. */
const screenFragment = /* glsl */ `
${GLSL_COMMON}
${GLSL_STREAM}
uniform vec2 uGrid;
uniform vec3 uColor;
uniform float uSeed;
uniform float uSpeed;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDepth;

void main() {
  float t = uTime * uMotion;
  vec2 q = vUv * uGrid;
  vec2 cell = floor(q);
  fadeCell(cell);
  float seed = hash12(vec2(cell.x, uSeed));
  float speed = uSpeed * (0.6 + seed * 0.9);
  float level = streamLevel(cell.y, uGrid.y, seed * 11.0 + uSeed, t, speed);
  float index = ${CODE_START} + floor(hash12(cell + floor(t * 6.0 + seed * 9.0)) * ${CODE_LENGTH});
  float glyph = glyphAt(index, fract(q), q);
  vec3 color = uColor * (0.05 + glyph * (0.08 + level * 1.25));
  // Thin bezel so the screen reads as a display.
  vec2 edge = min(vUv, 1.0 - vUv);
  color *= smoothstep(0.0, 0.025, min(edge.x, edge.y)) * fadeDim();
  gl_FragColor = vec4(applyFog(color, vDepth), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Pool surface: wave glyphs drifting across, with ripples around a swimmer. */
const waterFragment = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uColor;
uniform vec3 uFoam;
uniform vec2 uSwimmer;
uniform float uCell;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDepth;

// Ramp indices for " - ~ = " style wave glyphs.
float waveIndex(float level) {
  if (level < 0.25) return 1.0;  // .
  if (level < 0.5) return 5.0;   // -
  if (level < 0.75) return 6.0;  // ~
  return 7.0;                    // =
}

void main() {
  float t = uTime * uMotion;
  vec2 q = vWorld.xz / uCell;
  vec2 cell = floor(q);
  fadeCell(cell);
  vec2 p = (cell + 0.5) * uCell;
  float wave = 0.5 + 0.25 * sin(p.x * 2.1 + t * 1.6) + 0.25 * sin(p.y * 1.7 - t * 1.2 + p.x * 0.6);
  float d = distance(p, uSwimmer);
  float ripple = (1.0 - smoothstep(0.2, 1.4, d)) * (0.5 + 0.5 * sin(d * 9.0 - t * 7.0));
  float level = clamp(wave * 0.75 + ripple * 0.6 + (hash12(cell) - 0.5) * 0.2, 0.0, 1.0);
  float glyph = glyphAt(waveIndex(level), fract(q), q);
  vec3 color = (uColor * (0.12 + glyph * (0.35 + level * 0.8)) + uFoam * glyph * ripple * 0.7) * fadeDim();
  gl_FragColor = vec4(applyFog(color, vDepth), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Inverted-hull silhouette: back faces pushed out along the normal. */
/**
 * Instanced glyph sprites: each instance is a camera-facing quad showing one
 * code glyph (per-instance `aGlyph`) in its instance colour, with a soft halo
 * and a thin square frame. Drawn additively, so hidden instances (scale 0) and
 * black pixels cost nothing visible.
 */
const spriteVertex = /* glsl */ `
attribute float aGlyph;
varying vec2 vUv;
varying vec3 vColor;
varying float vGlyph;
varying float vDepth;
void main() {
  vUv = uv;
  vGlyph = aGlyph;
#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#else
  vColor = vec3(1.0);
#endif
  vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const spriteFragment = /* glsl */ `
${GLSL_ATLAS_UV}
uniform sampler2D uAtlas;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying vec3 vColor;
varying float vGlyph;
varying float vDepth;
void main() {
  vec2 c = vUv * 2.0 - 1.0;
  vec2 g = (vUv - 0.17) / 0.66;
  float glyph = 0.0;
  if (all(greaterThan(g, vec2(0.0))) && all(lessThan(g, vec2(1.0)))) {
    glyph = texture(uAtlas, atlasUv(vGlyph, g)).r;
  }
  float box = max(abs(c.x), abs(c.y));
  float frame = smoothstep(0.8, 0.86, box) * (1.0 - smoothstep(0.9, 0.96, box));
  float halo = exp(-dot(c, c) * 2.6) * 0.32;
  vec3 color = vColor * (glyph * 1.7 + halo + frame * 0.55);
  color *= 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

/** Instanced glowing spheres; glyph cells are fixed to each sphere, so they visibly roll. */
const orbVertex = /* glsl */ `
varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vDepth;
void main() {
  vLocal = position;
  vLocalNormal = normal;
#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#else
  vColor = vec3(1.0);
#endif
  mat4 m = modelMatrix * instanceMatrix;
  vec4 world = m * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(m) * normal);
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const orbFragment = /* glsl */ `
${GLSL_COMMON}
uniform float uCell;
varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vDepth;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);
  vec3 a = abs(vLocalNormal);
  vec2 q = (a.y > max(a.x, a.z) ? vLocal.xz : (a.x > a.z ? vLocal.zy : vLocal.xy)) / uCell;
  vec2 cell = floor(q);
  float index = ${CODE_START} + floor(hash12(cell + floor(uTime * uMotion * 3.0)) * ${CODE_LENGTH});
  float glyph = glyphAt(index, fract(q), q);
  vec3 color = vColor * (0.22 + glyph * 1.1 + rim * 0.9);
  gl_FragColor = vec4(applyFog(color, vDepth), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Floor strip: `uv.x` is the distance along the track in metres, `uv.y`
 * runs across it. Dashes flow along the track at `uSpeed` m/s.
 */
const trackFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uMotion;
uniform float uSpeed;
uniform float uIntensity;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vDepth;
void main() {
  float across = 1.0 - smoothstep(0.25, 0.5, abs(vUv.y - 0.5));
  float dash = step(0.55, fract(vUv.x * 2.2 - uTime * uMotion * uSpeed * 2.2));
  float level = across * (0.18 + 0.5 * dash) * uIntensity;
  vec3 color = uColor * level * (1.0 - smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const outlineVertex = /* glsl */ `
uniform float uWidth;
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position + normal * uWidth, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const outlineFragment = /* glsl */ `
${GLSL_HASH}
${GLSL_FADE}
uniform vec3 uColor;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
varying float vDepth;
void main() {
  fadeCell(floor(gl_FragCoord.xy / 5.0));
  gl_FragColor = vec4(mix(uColor * fadeDim(), uFog, smoothstep(uFogNear, uFogFar, vDepth)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface SolidOptions {
  color?: ColorRepresentation;
  accent?: ColorRepresentation;
  /** World-space glyph cell size in metres. */
  cell?: number;
  brightness?: number;
  base?: ColorRepresentation;
  vertexColors?: boolean;
}

export interface ImageOptions {
  map: Texture;
  /** Glyph cells across the texture (columns, rows). */
  grid: [number, number];
  tint?: ColorRepresentation;
  /** Colour shown where the reveal has not reached yet. */
  paper?: ColorRepresentation;
  alphaCut?: number;
  reveal?: number;
  /** Treat the map as a white-on-black mask (ink `tint` onto `paper`). */
  mask?: boolean;
  /** 0 = image with a glyph texture, 1 = pure ASCII art. */
  glyphContrast?: number;
  doubleSided?: boolean;
}

/**
 * Key light for glyph shading: from above and screen-left of the (fixed)
 * camera, so every figure has a lit side and a shadow side on screen.
 */
const KEY_LIGHT = new Vector3(-0.31, 0.78, 0.55).normalize();

export class GlyphKit {
  private readonly shared;

  constructor(atlas: Texture) {
    this.shared = {
      uAtlas: { value: atlas },
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uFog: { value: new Color(THEME.bg) },
      uFogNear: { value: GLYPH_FOG.near },
      uFogFar: { value: GLYPH_FOG.far },
      uLight: { value: KEY_LIGHT },
    };
  }

  update(time: number) {
    this.shared.uTime.value = time;
  }

  setReducedMotion(reduced: boolean) {
    this.shared.uMotion.value = reduced ? 0.15 : 1;
  }

  /** Animation speed factor (0.15 with reduced motion), for motion driven from JS. */
  get motion(): number {
    return this.shared.uMotion.value;
  }

  solid(options: SolidOptions = {}): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: solidVertex,
      fragmentShader: solidFragment,
      vertexColors: options.vertexColors ?? true,
      uniforms: {
        ...this.shared,
        uColor: { value: new Color(options.color ?? THEME.teal) },
        uAccent: { value: new Color(options.accent ?? THEME.green) },
        uBase: { value: new Color(options.base ?? "#04100f") },
        uCell: { value: options.cell ?? 0.075 },
        uBright: { value: options.brightness ?? 1 },
        uFade: { value: 1 },
      },
    });
  }

  outline(color: ColorRepresentation, width = 0.012): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: outlineVertex,
      fragmentShader: outlineFragment,
      side: BackSide,
      uniforms: {
        uColor: { value: new Color(color) },
        uWidth: { value: width },
        uFade: { value: 1 },
        uFog: this.shared.uFog,
        uFogNear: this.shared.uFogNear,
        uFogFar: this.shared.uFogFar,
      },
    });
  }

  image(options: ImageOptions): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: uvVertex,
      fragmentShader: imageFragment,
      side: options.doubleSided ? DoubleSide : FrontSide,
      uniforms: {
        ...this.shared,
        uMap: { value: options.map },
        uGrid: { value: new Vector2(...options.grid) },
        uTint: { value: new Color(options.tint ?? "#ffffff") },
        uPaper: { value: new Color(options.paper ?? "#000000") },
        uReveal: { value: options.reveal ?? 1 },
        uAlphaCut: { value: options.alphaCut ?? 0.5 },
        uMaskMode: { value: options.mask ? 1 : 0 },
        uGlyphContrast: { value: options.glyphContrast ?? 0 },
        uFade: { value: 1 },
      },
    });
  }

  screen(grid: [number, number], seed: number, speed = 9): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: uvVertex,
      fragmentShader: screenFragment,
      uniforms: {
        ...this.shared,
        uGrid: { value: new Vector2(...grid) },
        uColor: { value: new Color(THEME.green) },
        uSeed: { value: seed },
        uSpeed: { value: speed },
        uFade: { value: 1 },
      },
    });
  }

  /** For an InstancedMesh of quads with a per-instance `aGlyph` attribute and instance colours. */
  sprites(): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: spriteVertex,
      fragmentShader: spriteFragment,
      uniforms: {
        uAtlas: this.shared.uAtlas,
        uFog: this.shared.uFog,
        uFogNear: this.shared.uFogNear,
        uFogFar: this.shared.uFogFar,
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
  }

  /** For an InstancedMesh of unit spheres with instance colours. `cell` is in sphere units. */
  orbs(cell = 0.36): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: orbVertex,
      fragmentShader: orbFragment,
      uniforms: {
        ...this.shared,
        uCell: { value: cell },
      },
    });
  }

  /** Flowing dashed strip on the floor (see `buildTrack`). */
  track(color: ColorRepresentation, speed = 1, intensity = 1): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: uvVertex,
      fragmentShader: trackFragment,
      side: DoubleSide,
      uniforms: {
        uColor: { value: new Color(color) },
        uTime: this.shared.uTime,
        uMotion: this.shared.uMotion,
        uSpeed: { value: speed },
        uIntensity: { value: intensity },
        uFog: this.shared.uFog,
        uFogNear: this.shared.uFogNear,
        uFogFar: this.shared.uFogFar,
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
  }

  water(): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: uvVertex,
      fragmentShader: waterFragment,
      uniforms: {
        ...this.shared,
        uColor: {
          value: new Color(THEME.blue).lerp(new Color(THEME.cyan), 0.35),
        },
        uFoam: { value: new Color(THEME.ink) },
        uSwimmer: { value: new Vector2(9999, 9999) },
        uCell: { value: 0.11 },
        uFade: { value: 1 },
      },
    });
  }
}
