/**
 * Text drawn into canvas textures for the 3D world (signs, floor labels,
 * card faces). Readability comes from three layers instead of one blurred
 * fill:
 *
 *   1. a soft glow underneath (the holographic look),
 *   2. a dark outline, so letters separate from the bright glyph world
 *      behind them,
 *   3. the letters themselves, with no blur, on top.
 *
 * Drawing the fill with `shadowBlur` set (as a single pass) blurs the
 * letter edges too; at the sizes the camera sees, that is what made text
 * hard to read.
 */
export interface LegibleTextOptions {
  color: string;
  /** Glow radius in canvas pixels (0 = none). */
  glow?: number;
  /** Outline width in canvas pixels (0 = none). */
  outline?: number;
  /** Outline colour (default: near-black, slightly blue). */
  outlineColor?: string;
}

export const OUTLINE_COLOR = "rgba(1, 7, 11, 0.92)";

/** Draws `text` at (x, y) with the current font, alignment and direction. */
export function drawLegibleText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: LegibleTextOptions,
) {
  const { color, glow = 0, outline = 0 } = options;
  ctx.save();
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  if (outline > 0) {
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = outline;
    ctx.strokeStyle = options.outlineColor ?? OUTLINE_COLOR;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A rounded rectangle path (for the dark plates behind labels). */
export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
