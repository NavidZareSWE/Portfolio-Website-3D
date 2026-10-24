import type { Group, Mesh, Raycaster } from "three";
import { SECTION_META } from "@/content/sections";
import type { SectionId } from "@/types";
import { CARD } from "../config";
import type { CollisionSystem } from "../physics/CollisionSystem";
import { screenToWorld } from "../utils/math";
import type { SceneLabels } from "../labels";
import type { CardFaceDetail, CardText, PortraitImage } from "./cardFace";
import { HolographicCard, createSharedCardResources } from "./HolographicCard";

/**
 * Card placement in screen-aligned layout units (right, up the screen),
 * relative to the spawn point. Each card has room beside it for its scene
 * (see world/createVignettes.ts); cards are far apart, so interaction zones
 * (exit radius 3.2 m) can never overlap.
 */
export const CARD_LAYOUT: Record<SectionId, { right: number; up: number }> = {
  about: { right: -16, up: 5 },
  projects: { right: 0, up: 16 },
  skills: { right: 16, up: 5 },
  experience: { right: -15, up: -12 },
  contact: { right: 15, up: -12 },
};

export interface CardFaceAssets {
  logoSvg: string | null;
  /** Luminance render of the character, shown in ASCII on the About card. */
  portrait: PortraitImage | null;
  maxAnisotropy: number;
  /** Translated card text. */
  labels: SceneLabels;
  /** Face resolution and ASCII density (quality/TextureDetail.ts). */
  detail: CardFaceDetail;
  mipBias: number;
}

function cardText(labels: SceneLabels, id: SectionId): CardText {
  const section = labels.sections[id];
  const { cards } = labels;
  return {
    rtl: labels.rtl,
    title: section.title,
    summary: section.summary,
    tagline: section.tagline,
    prompt: cards.prompt,
    nameLine: `${cards.nameLabel}: ${cards.fullName}`,
    classLine: `${cards.classLabel}: ${cards.role}`,
    status: cards.status,
  };
}

export class CardRegistry {
  readonly cards: HolographicCard[];
  private readonly byId = new Map<SectionId, HolographicCard>();
  private readonly faces: Mesh[];
  private pending: {
    detail: CardFaceDetail;
    mipBias: number;
    next: number;
  } | null = null;

  constructor(
    parent: Group,
    collisions: CollisionSystem,
    assets: CardFaceAssets,
  ) {
    // Shared geometries/materials live in the scene graph and are released by disposeObject().
    const shared = createSharedCardResources();
    this.cards = SECTION_META.map((meta) => {
      const layout = CARD_LAYOUT[meta.id];
      const card = new HolographicCard(
        meta,
        screenToWorld(layout.right, layout.up),
        shared,
        {
          logoSvg: assets.logoSvg,
          portrait: assets.portrait,
          maxAnisotropy: assets.maxAnisotropy,
          text: cardText(assets.labels, meta.id),
        },
        assets.detail,
        assets.mipBias,
      );
      parent.add(card.group);
      this.byId.set(meta.id, card);
      // Emitter + projected card form one solid column the player walks around.
      collisions.add({
        kind: "circle",
        x: card.anchor.x,
        z: card.anchor.z,
        radius: CARD.pedestalRadius,
        top: Infinity,
      });
      return card;
    });
    this.faces = this.cards.map((card) => card.faceMesh);
  }

  get(id: SectionId): HolographicCard | undefined {
    return this.byId.get(id);
  }

  /**
   * Redraws every face at a new resolution or ASCII density. One face is
   * redrawn per frame (`updatePending`), so a change never stalls a frame
   * for all five.
   */
  setDetail(detail: CardFaceDetail, mipBias: number) {
    this.pending = { detail, mipBias, next: 0 };
  }

  /** Called once per frame: redraws the next face waiting for a detail change. */
  updatePending() {
    const pending = this.pending;
    if (!pending) return;
    this.cards[pending.next].setDetail(pending.detail, pending.mipBias);
    pending.next++;
    if (pending.next >= this.cards.length) this.pending = null;
  }

  /** The card whose face the ray hits first, if any. */
  pick(raycaster: Raycaster): SectionId | null {
    const hit = raycaster.intersectObjects(this.faces, false)[0];
    return (hit?.object.userData.cardId as SectionId | undefined) ?? null;
  }
}
