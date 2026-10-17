import { FONTS } from "@/theme/theme";
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
} from "three";

/**
 * One 8×8 glyph atlas shared by every ASCII surface (floor, data blocks,
 * particles). Rendering glyphs from a single texture in shaders means the
 * whole ASCII world costs a handful of draw calls instead of one mesh per
 * character.
 *
 * Layout (row-major, row 0 at the top of the canvas):
 *   0–15  density ramp, light → dense (used to "shade" the floor)
 *   16–63 code glyphs (used for data rain and particles)
 */
export const ATLAS_GRID = 8;
export const ATLAS_RAMP_LENGTH = 16;
export const ATLAS_CODE_START = 16;
export const ATLAS_CODE_LENGTH = 48;

const RAMP = [
  " ",
  ".",
  ",",
  ":",
  ";",
  "-",
  "~",
  "=",
  "+",
  "*",
  "x",
  "#",
  "%",
  "&",
  "@",
  "$",
];
const CODE = "0123456789ABCDEF{}[]()<>/\\|;:=+-*#$%&@!?^~_<>xyz01"
  .split("")
  .slice(0, ATLAS_CODE_LENGTH);

export const MONO_FONT_FAMILY = FONTS.mono;

export function createAsciiAtlas(maxAnisotropy: number): CanvasTexture {
  const cell = 64;
  const size = cell * ATLAS_GRID;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for glyph atlas");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${cell * 0.74}px ${MONO_FONT_FAMILY}`;

  const glyphs = [...RAMP, ...CODE];
  glyphs.forEach((glyph, i) => {
    const col = i % ATLAS_GRID;
    const row = Math.floor(i / ATLAS_GRID);
    ctx.fillText(
      glyph,
      col * cell + cell / 2,
      row * cell + cell / 2 + cell * 0.04,
    );
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;
  return texture;
}

/**
 * GLSL helper: returns atlas UVs for `index` and a local cell coordinate in
 * [0,1]² (y up). The canvas is uploaded with flipY, so canvas row 0 is the
 * top band of the texture.
 */
export const GLSL_ATLAS_UV = /* glsl */ `
vec2 atlasUv(float index, vec2 local) {
  float col = mod(index, ${ATLAS_GRID.toFixed(1)});
  float row = floor(index / ${ATLAS_GRID.toFixed(1)});
  return vec2(col + local.x, ${(ATLAS_GRID - 1).toFixed(1)} - row + local.y) / ${ATLAS_GRID.toFixed(1)};
}
`;

export const GLSL_HASH = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;
