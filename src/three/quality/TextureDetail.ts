import { CARD_FACE_H } from "../cards/cardFace";
import type { ModelTier } from "./ModelDetail";

/**
 * Resolution of the text drawn inside the world (card faces, scene signs),
 * per player-model tier.
 *
 * - `cardScale`: the card face canvas is drawn at this multiple of its
 *   768 x 1120 layout (crisp text, logo and frame lines).
 * - `cardCell`: size of the ASCII cells relative to the 8 x 12 px base; a
 *   smaller cell puts more characters on the face (more detail).
 * - `mipBias`: level-of-detail bias when the face is sampled; negative values
 *   pick a sharper mip level while the card is smaller on screen.
 * - `crispScale`: pixel ratio the cards and scene signs are drawn at when the
 *   adaptive resolution lowers the rest of the world below it (see
 *   `render/CrispComposite.ts`). 0 turns the separate pass off.
 */
export interface TextureDetail {
  cardScale: number;
  cardCell: number;
  mipBias: number;
  crispScale: number;
}

interface TierTextureDetail {
  /** Upper limit of `cardScale` (memory: five faces of 768 x 1120 x scale²). */
  maxCardScale: number;
  cardCell: number;
  mipBias: number;
  crispScale: number;
}

const BY_TIER: Record<ModelTier, TierTextureDetail> = {
  "very-low": { maxCardScale: 1.5, cardCell: 1, mipBias: 0, crispScale: 1 },
  low: { maxCardScale: 2, cardCell: 1, mipBias: -0.25, crispScale: 1.5 },
  medium: { maxCardScale: 2, cardCell: 0.85, mipBias: -0.35, crispScale: 2 },
  high: { maxCardScale: 2.5, cardCell: 0.75, mipBias: -0.5, crispScale: 2 },
  super: { maxCardScale: 2.5, cardCell: 0.65, mipBias: -0.5, crispScale: 2 },
};

/**
 * The open card fills at most about 55% of the viewport height (measured
 * with the follow camera at 16:9 and on a phone in portrait); faces are
 * drawn with 25% more texels than that so they stay sharp when magnified.
 */
const CARD_SCREEN_FRACTION = 0.55;
const CARD_OVERSAMPLE = 1.25;
/** Rounds up to a quarter step, so small viewport changes do not redraw the faces. */
const quarter = (value: number) => Math.ceil(value * 4 - 1e-6) / 4;

/**
 * @param viewportHeight  Stage height in CSS pixels.
 * @param maxPixelRatio   Highest pixel ratio the renderer may use.
 * @param maxTextureSize  `renderer.capabilities.maxTextureSize`.
 * @param software        Software rendering (no GPU): no separate text pass.
 */
export function textureDetail(
  tier: ModelTier,
  viewportHeight: number,
  maxPixelRatio: number,
  maxTextureSize: number,
  software: boolean,
): TextureDetail {
  const t = BY_TIER[tier];
  // Enough texels for the face at its largest on this screen...
  const forScreen =
    (viewportHeight * maxPixelRatio * CARD_SCREEN_FRACTION * CARD_OVERSAMPLE) /
    CARD_FACE_H;
  // ...and for the finer ASCII cells to keep the base 12 px glyph height.
  const forCells = 1 / t.cardCell;
  const byTexture = maxTextureSize / CARD_FACE_H;
  const cardScale = Math.min(
    quarter(Math.min(t.maxCardScale, Math.max(1, forScreen, forCells))),
    Math.floor(byTexture * 4) / 4,
  );
  return {
    cardScale,
    cardCell: t.cardCell,
    mipBias: t.mipBias,
    crispScale: software ? 0 : Math.min(t.crispScale, maxPixelRatio),
  };
}

export function sameCardDetail(a: TextureDetail, b: TextureDetail) {
  return a.cardScale === b.cardScale && a.cardCell === b.cardCell;
}
