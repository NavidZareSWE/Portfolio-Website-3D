import {
  DataTexture,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { WORLD } from "../config";
import { glyphIndex } from "./AsciiAtlas";

/**
 * Glyphs painted onto the ASCII floor, one texel per floor cell (the same
 * grid as the floor's field pass, see AsciiFloor.ts). The district patterns
 * (git graph, blueprint, rug) are authored here on the CPU once
 * and sampled by the field shader with a single texel fetch per cell.
 *
 * Texel layout (RGBA8):
 *   R  atlas glyph index + 1 (0 = no glyph)
 *   G  brightness 0..1
 *   B  colour (FLOOR_COLOR)
 *   A  animation (FLOOR_ANIM) + 128 when the cell mutes the default circuit
 */
export const FLOOR_COLOR = {
  teal: 0,
  cyan: 1,
  green: 2,
  blue: 3,
  amber: 4,
} as const;
export type FloorColor = keyof typeof FLOOR_COLOR;

export const FLOOR_ANIM = {
  none: 0,
  /** Pulses travelling diagonally across the cells. */
  pulse: 1,
  /** On/off blinking at a per-cell rate (LEDs, commit dots). */
  blink: 2,
  /** The glyph keeps changing between code characters. */
  shimmer: 3,
  /** Light flowing up the screen (the git graph's lanes). */
  flowUp: 4,
} as const;
export type FloorAnim = keyof typeof FLOOR_ANIM;

const MUTE_FLAG = 128;

export interface GlyphStyle {
  level?: number;
  color?: FloorColor;
  anim?: FloorAnim;
}

/** Offset between floor cell coordinates and texel coordinates (as in AsciiFloor). */
export const FLOOR_FIELD_OFFSET =
  Math.ceil((WORLD.floorRadius + 1) / WORLD.cellSize) + 1;
export const FLOOR_FIELD_SIZE = FLOOR_FIELD_OFFSET * 2;

/** Floor cell under a screen-aligned layout position (right, up) in metres. */
export function cellAt(right: number, up: number): [number, number] {
  return [Math.floor(right / WORLD.cellSize), Math.floor(up / WORLD.cellSize)];
}

export class FloorDecals {
  readonly texture: DataTexture;
  private readonly data: Uint8Array;
  private readonly size = FLOOR_FIELD_SIZE;

  constructor() {
    this.data = new Uint8Array(this.size * this.size * 4);
    this.texture = new DataTexture(
      this.data,
      this.size,
      this.size,
      RGBAFormat,
      UnsignedByteType,
    );
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  private offsetOf(cx: number, cy: number): number {
    const x = cx + FLOOR_FIELD_OFFSET;
    const y = cy + FLOOR_FIELD_OFFSET;
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return -1;
    return (y * this.size + x) * 4;
  }

  /** Paints one character into cell (cx, cy). Characters the atlas lacks are skipped. */
  glyph(cx: number, cy: number, char: string, style: GlyphStyle = {}) {
    const index = glyphIndex(char);
    const o = this.offsetOf(cx, cy);
    if (index < 0 || o < 0) return;
    const d = this.data;
    d[o] = index + 1;
    d[o + 1] = Math.round(Math.min(1, Math.max(0, style.level ?? 0.5)) * 255);
    d[o + 2] = FLOOR_COLOR[style.color ?? "teal"];
    d[o + 3] = FLOOR_ANIM[style.anim ?? "none"] | MUTE_FLAG;
  }

  /** Writes `text` left to right starting at cell (cx, cy). Spaces leave cells untouched. */
  text(cx: number, cy: number, text: string, style: GlyphStyle = {}) {
    [...text].forEach((char, i) => {
      if (char !== " ") this.glyph(cx + i, cy, char, style);
    });
  }

  /** True if the cell already holds a glyph. */
  has(cx: number, cy: number): boolean {
    const o = this.offsetOf(cx, cy);
    return o >= 0 && this.data[o] > 0;
  }

  /** Mutes the default circuit traces in a cell without drawing a glyph. */
  mute(cx: number, cy: number) {
    const o = this.offsetOf(cx, cy);
    if (o >= 0) this.data[o + 3] |= MUTE_FLAG;
  }

  /** Call after all painting is done. */
  commit() {
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}
