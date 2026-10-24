import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  Vector4,
} from "three";
import { sectionHexCode, type SectionMeta } from "@/content/sections";
import { FONTS, THEME } from "@/theme/theme";
import { drawLogo } from "../character/logo";
import { createRandom } from "../utils/math";

/**
 * Card faces follow the card-1 reference: everything structural (frame,
 * panels, artwork, bars, logo) is first drawn as a grey-scale "art" layer
 * and then converted to ASCII by sampling luminance per character cell, so
 * the card is literally made of glyphs. Small labels are drawn crisp on
 * top for legibility, as in the reference.
 */

export const CARD_FACE_W = 768;
export const CARD_FACE_H = 1120;
/** Corner cut of the octagonal frame, as a fraction of width (shared with geometry). */
export const CARD_CUT_FRACTION = 0.09;

const CELL_W = 8;
const CELL_H = 12;
const RAMP = " .:-=+*o0#%@";
const PAD = 34;

/** Resolution and ASCII density of a face (see quality/TextureDetail.ts). */
export interface CardFaceDetail {
  /** Canvas pixels per layout pixel (the layout is 768 x 1120). */
  scale: number;
  /** ASCII cell size relative to the 8 x 12 px base (smaller = more characters). */
  cell: number;
}

export const DEFAULT_FACE_DETAIL: CardFaceDetail = { scale: 1, cell: 1 };

export interface CardFaceResult {
  texture: CanvasTexture;
  footerRect: Vector4;
  progressRect: Vector4;
}

/** Luminance image (0..1) used as the main artwork; About uses the real model render. */
export interface PortraitImage {
  width: number;
  height: number;
  /** Row-major, top row first. */
  luminance: Float32Array;
}

function octagonPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cut: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

/* -------------------------------------------------------------------------- */
/* Artwork per section (grey-scale shading → ASCII density)                    */
/* -------------------------------------------------------------------------- */

type ArtPainter = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) => void;

const ART: Record<string, ArtPainter> = {
  projects: (ctx, x, y, w, h) => {
    // Three stacked isometric panels (windows/repos).
    for (let i = 0; i < 3; i++) {
      const cx = x + w * 0.5;
      const cy = y + h * (0.32 + i * 0.2);
      const pw = w * 0.36;
      const ph = h * 0.11;
      const g = ctx.createLinearGradient(cx - pw, cy, cx + pw, cy);
      g.addColorStop(0, `rgba(255,255,255,${0.35 + i * 0.15})`);
      g.addColorStop(1, `rgba(255,255,255,${0.1 + i * 0.1})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy - ph);
      ctx.lineTo(cx + pw, cy);
      ctx.lineTo(cx, cy + ph);
      ctx.lineTo(cx - pw, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  },
  skills: (ctx, x, y, w, h) => {
    // A processor die with pins: radial shading and a bright core.
    const cx = x + w / 2;
    const cy = y + h / 2;
    const s = Math.min(w, h) * 0.5;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = -3; i <= 3; i++) {
      const o = (i * s) / 8;
      ctx.fillRect(cx + o - 6, cy - s * 0.78, 12, s * 0.2);
      ctx.fillRect(cx + o - 6, cy + s * 0.58, 12, s * 0.2);
      ctx.fillRect(cx - s * 0.78, cy + o - 6, s * 0.2, 12);
      ctx.fillRect(cx + s * 0.58, cy + o - 6, s * 0.2, 12);
    }
    const g = ctx.createRadialGradient(cx, cy, s * 0.05, cx, cy, s * 0.6);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0.18)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - s * 0.58, cy - s * 0.58, s * 1.16, s * 1.16);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 10;
    ctx.strokeRect(cx - s * 0.3, cy - s * 0.3, s * 0.6, s * 0.6);
  },
  experience: (ctx, x, y, w, h) => {
    // Ascending steps along a timeline.
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const bw = (w * 0.7) / steps;
      const bh = h * (0.15 + i * 0.13);
      const bx = x + w * 0.15 + i * bw;
      const by = y + h * 0.85 - bh;
      const g = ctx.createLinearGradient(bx, by, bx, by + bh);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(1, "rgba(255,255,255,0.15)");
      ctx.fillStyle = g;
      ctx.fillRect(bx + 6, by, bw - 12, bh);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y + h * 0.9);
    ctx.lineTo(x + w * 0.9, y + h * 0.9);
    ctx.stroke();
  },
  contact: (ctx, x, y, w, h) => {
    // A transmitter mast radiating signal arcs.
    const cx = x + w / 2;
    const base = y + h * 0.88;
    const top = y + h * 0.42;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.14, base);
    ctx.lineTo(cx, top);
    ctx.lineTo(cx + w * 0.14, base);
    ctx.stroke();
    for (let i = 1; i <= 4; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${1 - i * 0.18})`;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, top, i * w * 0.09, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(cx, top, 0, cx, top, w * 0.08);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - w * 0.1, top - w * 0.1, w * 0.2, w * 0.2);
  },
  about: (ctx, x, y, w, h) => {
    // Fallback hooded silhouette (used only if the model render is unavailable).
    const cx = x + w / 2;
    const g = ctx.createRadialGradient(
      cx,
      y + h * 0.35,
      w * 0.05,
      cx,
      y + h * 0.4,
      w * 0.4,
    );
    g.addColorStop(0, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0.2)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, y + h * 0.38, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(cx, y + h * 0.4, w * 0.19, h * 0.21, 0, 0, Math.PI * 2);
    ctx.fill();
  },
};

function drawPortrait(
  ctx: CanvasRenderingContext2D,
  portrait: PortraitImage,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const image = ctx.createImageData(portrait.width, portrait.height);
  for (let i = 0; i < portrait.luminance.length; i++) {
    const v = Math.round(Math.min(1, portrait.luminance[i]) * 255);
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  const tmp = document.createElement("canvas");
  tmp.width = portrait.width;
  tmp.height = portrait.height;
  tmp.getContext("2d")!.putImageData(image, 0, 0);
  const scale = Math.min(w / portrait.width, h / portrait.height);
  const dw = portrait.width * scale;
  const dh = portrait.height * scale;
  ctx.drawImage(tmp, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/* -------------------------------------------------------------------------- */
/* Face composition                                                            */
/* -------------------------------------------------------------------------- */

/** Translated text for one card (see three/labels.ts). */
export interface CardText {
  rtl: boolean;
  title: string;
  summary: string;
  tagline: string[];
  prompt: string;
  nameLine: string;
  classLine: string;
  status: string;
}

export function createCardFace(
  meta: SectionMeta,
  text: CardText,
  logoSvg: string | null,
  portrait: PortraitImage | null,
  maxAnisotropy: number,
  detail: CardFaceDetail = DEFAULT_FACE_DETAIL,
): CardFaceResult {
  // Everything below is laid out in 768 x 1120 layout pixels; both canvases
  // are scaled by S, so lines and text are drawn at the full canvas resolution.
  // shadowBlur ignores the transform, so blur radii are multiplied by S.
  const W = CARD_FACE_W;
  const H = CARD_FACE_H;
  const S = detail.scale;
  const PW = Math.round(W * S);
  const PH = Math.round(H * S);
  const cellW = CELL_W * detail.cell;
  const cellH = CELL_H * detail.cell;
  const cut = Math.round(W * CARD_CUT_FRACTION);
  const random = createRandom(parseInt(meta.index, 10) * 7919);
  const hex = sectionHexCode(meta);

  // ---------------- art layer (grey-scale) ----------------
  const art = document.createElement("canvas");
  art.width = PW;
  art.height = PH;
  const a = art.getContext("2d", { willReadFrequently: true })!;
  a.scale(PW / W, PH / H);
  a.fillStyle = "#000";
  a.fillRect(0, 0, W, H);

  // Background glyph texture: faint everywhere inside the frame.
  a.save();
  octagonPath(a, 0, 0, W, H, cut);
  a.clip();
  a.fillStyle = "rgba(255,255,255,0.07)";
  a.fillRect(0, 0, W, H);
  a.restore();

  // Double frame with tabs (as on the reference).
  a.strokeStyle = "#fff";
  a.lineWidth = 9;
  octagonPath(a, 10, 10, W - 20, H - 20, cut - 4);
  a.stroke();
  a.lineWidth = 3;
  a.strokeStyle = "rgba(255,255,255,0.7)";
  octagonPath(a, 30, 30, W - 60, H - 60, cut - 14);
  a.stroke();
  a.fillStyle = "#fff";
  a.fillRect(W * 0.62, 6, W * 0.22, 14);
  a.fillRect(6, H * 0.4, 14, H * 0.12);
  a.fillRect(W - 20, H * 0.55, 14, H * 0.14);

  // Stat bars.
  const statsTop = 214;
  for (let i = 0; i < 4; i++) {
    const value = 0.45 + random() * 0.5;
    a.fillStyle = "rgba(255,255,255,0.25)";
    a.fillRect(190, statsTop + i * 34, 300, 16);
    a.fillStyle = "rgba(255,255,255,0.95)";
    a.fillRect(190, statsTop + i * 34, 300 * value, 16);
  }

  // Logo, top right.
  if (logoSvg) drawLogo(a, logoSvg, W - 150, 150, 120, "#fff");

  // Main artwork panel.
  const artX = PAD + 30;
  const artY = 370;
  const artW = W * 0.62;
  const artH = 400;
  a.strokeStyle = "rgba(255,255,255,0.55)";
  a.lineWidth = 3;
  a.strokeRect(artX - 8, artY - 8, artW + 16, artH + 16);
  if (meta.id === "about" && portrait) {
    drawPortrait(a, portrait, artX, artY, artW, artH);
  } else {
    (ART[meta.id] ?? ART.about)(a, artX, artY, artW, artH);
  }

  // Lower panels.
  const lowerY = 810;
  a.strokeStyle = "rgba(255,255,255,0.75)";
  a.lineWidth = 3;
  octagonPath(a, PAD + 18, lowerY, W * 0.44, 150, 18);
  a.stroke();
  octagonPath(a, W * 0.52, lowerY, W * 0.44 - PAD + 6, 150, 18);
  a.stroke();
  // Mini equaliser in the right panel.
  for (let i = 0; i < 10; i++) {
    const bh = 20 + random() * 90;
    a.fillStyle = "rgba(255,255,255,0.85)";
    a.fillRect(W * 0.76 + i * 14, lowerY + 132 - bh, 8, bh);
  }
  // Divider under the quote.
  a.fillStyle = "rgba(255,255,255,0.5)";
  a.fillRect(PAD + 30, 1010, W - (PAD + 30) * 2, 3);

  // ---------------- convert to ASCII ----------------
  const out = document.createElement("canvas");
  out.width = PW;
  out.height = PH;
  const ctx = out.getContext("2d")!;
  ctx.scale(PW / W, PH / H);

  // Translucent body inside the octagon.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "rgba(6, 26, 52, 0.78)");
  bg.addColorStop(1, "rgba(4, 16, 36, 0.82)");
  octagonPath(ctx, 0, 0, W, H, cut);
  ctx.fillStyle = bg;
  ctx.fill();

  // One glyph per cell, its density picked from the art's luminance. The
  // glyphs are rasterised once and copied into a pixel buffer (a fillText
  // per cell is far slower once cells are small and the canvas is large),
  // then the buffer is drawn over the body in one call.
  const pixels = a.getImageData(0, 0, PW, PH).data;
  const glyphs = rasteriseGlyphs(cellW * S, cellH * S, detail.cell * S);
  const ascii = new ImageData(PW, PH);
  const buffer = ascii.data;
  // About 4 x 6 luminance samples per cell, whatever the scale.
  const stepX = Math.max(1, Math.floor((cellW * S) / 4));
  const stepY = Math.max(1, Math.floor((cellH * S) / 6));
  for (let cy = 0; cy < H; cy += cellH) {
    for (let cx = 0; cx < W; cx += cellW) {
      let sum = 0;
      let n = 0;
      const y0 = Math.round(cy * S);
      const x0 = Math.round(cx * S);
      const y1 = Math.min(PH, Math.round((cy + cellH) * S));
      const x1 = Math.min(PW, Math.round((cx + cellW) * S));
      for (let yy = y0; yy < y1; yy += stepY) {
        for (let xx = x0; xx < x1; xx += stepX) {
          sum += pixels[(yy * PW + xx) * 4];
          n++;
        }
      }
      if (n === 0) continue;
      const lum = sum / n / 255;
      if (lum < 0.04) continue;
      const level = Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length));
      const alpha = Math.min(1, 0.25 + lum * 1.1);
      const [r, g, b] = lum > 0.6 ? [150, 245, 255] : [70, 190, 255];
      // Glyph centred on the cell centre.
      const centreX = Math.round((cx + cellW / 2) * S);
      const centreY = Math.round((cy + cellH / 2) * S);
      stampGlyph(
        buffer,
        PW,
        PH,
        glyphs,
        level,
        centreX,
        centreY,
        r,
        g,
        b,
        alpha,
      );
    }
  }
  const asciiCanvas = document.createElement("canvas");
  asciiCanvas.width = PW;
  asciiCanvas.height = PH;
  asciiCanvas.getContext("2d")!.putImageData(ascii, 0, 0);
  ctx.drawImage(asciiCanvas, 0, 0, W, H);

  // Thin crisp edge so the silhouette stays sharp at a distance.
  ctx.save();
  ctx.shadowColor = "rgba(95, 240, 255, 0.9)";
  ctx.shadowBlur = 14 * S;
  ctx.strokeStyle = THEME.cyan;
  ctx.lineWidth = 3;
  octagonPath(ctx, 6, 6, W - 12, H - 12, cut);
  ctx.stroke();
  ctx.restore();

  // ---------------- crisp text layer ----------------
  const glow = (blur: number) => {
    ctx.shadowColor = "rgba(95, 240, 255, 0.85)";
    ctx.shadowBlur = blur * S;
  };
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Translated strings use Vazirmatn and right-to-left shaping in Persian;
  // the decorative terminal labels stay in the monospace face.
  const TF = text.rtl ? FONTS.persian : FONTS.mono;
  const translated = (draw: () => void) => {
    ctx.save();
    ctx.direction = text.rtl ? "rtl" : "ltr";
    draw();
    ctx.restore();
  };
  const fitted = (
    value: string,
    weight: number,
    maxSize: number,
    maxWidth: number,
    family = TF,
  ) => {
    let size = maxSize;
    while (size > 12) {
      ctx.font = `${weight} ${size}px ${family}`;
      if (ctx.measureText(value).width <= maxWidth) break;
      size -= 1;
    }
  };
  const title = text.rtl ? text.title : text.title.toUpperCase();

  ctx.save();
  glow(18);
  ctx.fillStyle = "#e6fdff";
  translated(() => {
    ctx.shadowColor = "rgba(95, 240, 255, 0.85)";
    ctx.shadowBlur = 18 * S;
    ctx.font = `800 ${fitText(ctx, title, W * 0.6, text.rtl ? 72 : 84, TF)}px ${TF}`;
    ctx.fillText(title, PAD + 36, 128);
  });
  ctx.restore();

  ctx.save();
  glow(6);
  ctx.fillStyle = "rgba(160, 235, 255, 0.95)";
  ctx.font = `600 24px ${FONTS.mono}`;
  ctx.fillText(`SECTOR-${meta.index} // ${meta.code}`, PAD + 36, 172);

  const labels = ["SIG", "SYNC", "LOAD", "LINK"];
  ctx.font = `600 22px ${FONTS.mono}`;
  labels.forEach((label, i) =>
    ctx.fillText(`${label}`, PAD + 36, statsTop + 16 + i * 34),
  );

  ctx.textAlign = "center";
  ctx.font = `700 22px ${FONTS.mono}`;
  ctx.fillText("NZSWE", W - 150, 240);
  ctx.font = `500 18px ${FONTS.mono}`;
  ctx.fillText("PORTFOLIO.SYS", W - 150, 266);

  // Right column beside the artwork: the section's tagline.
  const columnWidth = W - PAD - 30 - (artX + artW + 16);
  translated(() => {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(160, 235, 255, 0.95)";
    text.tagline.slice(0, 6).forEach((line, i) => {
      fitted(line, 600, 22, columnWidth);
      // In RTL, "right" alignment still anchors the line's right edge at x.
      ctx.fillText(line, W - PAD - 30, artY + 180 + i * 32);
    });
  });

  // Lower-left info block.
  ctx.textAlign = "left";
  ctx.font = `700 24px ${FONTS.mono}`;
  ctx.fillText(`ID: ${hex}`, PAD + 42, lowerY + 40);
  const infoWidth = W * 0.44 - 50;
  translated(() => {
    ctx.fillStyle = "rgba(160, 235, 255, 0.95)";
    ctx.textAlign = text.rtl ? "right" : "left";
    const x = text.rtl ? PAD + 18 + W * 0.44 - 24 : PAD + 42;
    [text.nameLine, text.classLine, text.status].forEach((line, i) => {
      fitted(line, 500, 20, infoWidth);
      ctx.fillText(line, x, lowerY + 74 + i * 26);
    });
  });
  // Lower-right actions.
  ctx.font = `600 19px ${FONTS.mono}`;
  ["// OPEN", "// READ", "// INDEX", "// EXIT"].forEach((line, i) =>
    ctx.fillText(line, W * 0.55, lowerY + 36 + i * 28),
  );

  // Quote line: the section's one-line summary.
  translated(() => {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(160, 235, 255, 0.95)";
    const quote = text.rtl
      ? `«${text.summary}»`
      : `"${text.summary.toUpperCase()}"`;
    fitted(quote, 500, 21, W - (PAD + 40) * 2);
    ctx.fillText(quote, W / 2, 994);
  });
  ctx.restore();

  // Footer prompt and progress track.
  const footerY = 1050;
  ctx.save();
  glow(10);
  ctx.fillStyle = "#c9f8ff";
  translated(() => {
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(95, 240, 255, 0.85)";
    ctx.shadowBlur = 10 * S;
    fitted(text.prompt, 800, 26, W - (PAD + 40) * 2);
    ctx.fillText(text.prompt, W / 2, footerY);
  });
  ctx.restore();
  const trackX = W * 0.2;
  const trackW = W * 0.6;
  const trackY = footerY + 16;
  ctx.strokeStyle = "rgba(95, 240, 255, 0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(trackX, trackY, trackW, 12);

  const texture = new CanvasTexture(out);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;

  const toUv = (x: number, y: number, w: number, h: number) =>
    new Vector4(x / W, 1 - (y + h) / H, w / W, h / H);
  return {
    texture,
    footerRect: toUv(PAD, footerY - 32, W - PAD * 2, 44),
    progressRect: toUv(trackX + 2, trackY + 2, trackW - 4, 8),
  };
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  family: string,
) {
  let size = start;
  while (size > 30) {
    ctx.font = `800 ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

/** Coverage masks (0..255) of the RAMP glyphs at one cell size, centred in a box. */
interface GlyphMasks {
  width: number;
  height: number;
  masks: Uint8Array[];
}

function rasteriseGlyphs(
  cellWidth: number,
  cellHeight: number,
  baselineShift: number,
): GlyphMasks {
  const width = Math.ceil(cellWidth) + 4;
  const height = Math.ceil(cellHeight) + 4;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.font = `700 ${cellHeight - cellHeight / CELL_H}px ${FONTS.mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  const masks = [...RAMP].map((char) => {
    ctx.clearRect(0, 0, width, height);
    // A space would leave the cell empty; the lowest level is a dot instead.
    ctx.fillText(
      char === " " ? "." : char,
      width / 2,
      height / 2 + baselineShift,
    );
    const data = ctx.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];
    return mask;
  });
  return { width, height, masks };
}

/** Draws one glyph mask into an RGBA buffer (source-over, straight alpha). */
function stampGlyph(
  buffer: Uint8ClampedArray,
  bufferWidth: number,
  bufferHeight: number,
  glyphs: GlyphMasks,
  level: number,
  centreX: number,
  centreY: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
) {
  const mask = glyphs.masks[level];
  const left = centreX - (glyphs.width >> 1);
  const top = centreY - (glyphs.height >> 1);
  for (let y = 0; y < glyphs.height; y++) {
    const by = top + y;
    if (by < 0 || by >= bufferHeight) continue;
    for (let x = 0; x < glyphs.width; x++) {
      const coverage = mask[y * glyphs.width + x];
      if (coverage === 0) continue;
      const bx = left + x;
      if (bx < 0 || bx >= bufferWidth) continue;
      const i = (by * bufferWidth + bx) * 4;
      const sa = (coverage / 255) * alpha;
      const da = buffer[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      const keep = (da * (1 - sa)) / oa;
      const take = sa / oa;
      buffer[i] = r * take + buffer[i] * keep;
      buffer[i + 1] = g * take + buffer[i + 1] * keep;
      buffer[i + 2] = b * take + buffer[i + 2] * keep;
      buffer[i + 3] = oa * 255;
    }
  }
}
