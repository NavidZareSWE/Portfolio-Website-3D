import type { Group } from "three";
import { SECTION_META } from "@/content/sections";
import type { SectionId } from "@/types";
import { CARD } from "../config";
import type { CollisionSystem } from "../physics/CollisionSystem";
import { screenToWorld } from "../utils/math";
import type { SceneLabels } from "../labels";
import type { CardText, PortraitImage } from "./cardFace";
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
          ...assets,
          text: cardText(assets.labels, meta.id),
        },
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
  }

  get(id: SectionId): HolographicCard | undefined {
    return this.byId.get(id);
  }
}
