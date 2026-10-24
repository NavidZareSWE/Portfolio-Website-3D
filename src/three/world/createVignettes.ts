import { THEME } from "@/theme/theme";
import {
  Color,
  Group,
  MeshBasicMaterial,
  SRGBColorSpace,
  Texture,
  type Shape,
  type Vector3,
} from "three";
import { CARD_LAYOUT } from "../cards/CardRegistry";
import type { SceneLabels } from "../labels";
import type { CollisionSystem } from "../physics/CollisionSystem";
import type { FigureTemplate } from "./GlyphFigure";
import { GlyphKit } from "./GlyphKit";
import {
  createShadowMaterial,
  type Vignette,
  type VignetteContext,
} from "./Vignette";
import { AnonCouncil } from "./vignettes/AnonCouncil";
import { ConstructionSite } from "./vignettes/ConstructionSite";
import { CouchCall } from "./vignettes/CouchCall";
import { DataFlow } from "./vignettes/DataFlow";
import { HackerDesk } from "./vignettes/HackerDesk";
import { Hobbies } from "./vignettes/Hobbies";
import { RoutingFork } from "./vignettes/RoutingFork";
import { ScannerArch } from "./vignettes/ScannerArch";

/** Two-tone glyph-mask sources built from the reference image (scripts/mask/). */
export const MASK_URLS = {
  white: "/textures/anonymous-mask-white.png",
  dark: "/textures/anonymous-mask-dark.png",
} as const;

async function loadTexture(
  url: string,
  signal?: AbortSignal,
): Promise<Texture> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Texture request failed (${response.status}): ${url}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    imageOrientation: "flipY",
  });
  // ImageBitmaps are flipped at decode time (above), so the texture must not flip again.
  const texture = new Texture(bitmap);
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export async function loadMaskTextures(
  signal?: AbortSignal,
): Promise<{ white: Texture; dark: Texture }> {
  const [white, dark] = await Promise.all([
    loadTexture(MASK_URLS.white, signal),
    loadTexture(MASK_URLS.dark, signal),
  ]);
  return { white, dark };
}

/** Offsets (layout units) of each scene from its card. */
const SCENE_OFFSET = {
  // Close enough that card and scene share the frame when standing at the card,
  // far enough that the (1.5x) scenes stay clear of the card's interaction ring.
  projects: { right: 9.5, up: -2 },
  skills: { right: 6, up: 1.2 },
  contact: { right: 6.2, up: 0.8 },
  // The About scenes are laid out around the card itself (see Hobbies).
  about: { right: 0, up: 0 },
  experience: { right: -6.5, up: 0.8 },
} as const;

const near = (
  id: keyof typeof CARD_LAYOUT,
  offset: { right: number; up: number },
) => ({
  right: CARD_LAYOUT[id].right + offset.right,
  up: CARD_LAYOUT[id].up + offset.up,
});

export interface Vignettes {
  group: Group;
  kit: GlyphKit;
  update(time: number, dt: number, player: Vector3): void;
  setReducedMotion(reduced: boolean): void;
}

export function createVignettes(options: {
  labels: SceneLabels;
  atlas: Texture;
  template: FigureTemplate;
  collisions: CollisionSystem;
  logoShapes: Shape[] | null;
  logoMask: Texture;
  maskTextures: { white: Texture; dark: Texture };
}): Vignettes {
  const kit = new GlyphKit(options.atlas);
  const ctx: VignetteContext = {
    kit,
    template: options.template,
    collisions: options.collisions,
    logoShapes: options.logoShapes,
    logoMask: options.logoMask,
    maskTextures: options.maskTextures,
    labels: options.labels,
    materials: {
      // A solid teal tone carries the shading; glyphs add the ASCII texture on top.
      figure: kit.solid({
        color: THEME.cyan,
        cell: 0.07,
        brightness: 1.1,
        base: "#0f4448",
      }),
      figureOutline: kit.outline(THEME.cyan, 0.014),
      prop: kit.solid({
        color: THEME.teal,
        cell: 0.085,
        brightness: 0.95,
        base: "#0b3533",
      }),
      void: new MeshBasicMaterial({ color: 0x000000 }),
      logo: new MeshBasicMaterial({
        color: new Color(THEME.green),
        toneMapped: false,
      }),
      shadow: createShadowMaterial(),
    },
  };

  const scenes: Vignette[] = [
    new ConstructionSite(ctx, near("projects", SCENE_OFFSET.projects)),
    new HackerDesk(ctx, near("skills", SCENE_OFFSET.skills)),
    new CouchCall(ctx, near("contact", SCENE_OFFSET.contact)),
    new Hobbies(ctx, near("about", SCENE_OFFSET.about)),
    new AnonCouncil(ctx, near("experience", SCENE_OFFSET.experience)),
    // Résumé scenes in the open ground: interface → API → database beside
    // Projects, the face-detection arch on the path to it, and the M.Sc.
    // research (LLM routing) beside Experience.
    new DataFlow(ctx),
    new ScannerArch(ctx),
    new RoutingFork(ctx),
  ];

  const group = new Group();
  group.name = "vignettes";
  scenes.forEach((scene) => group.add(scene.group));

  return {
    group,
    kit,
    update(time, dt, player) {
      kit.update(time);
      for (const scene of scenes) scene.update(time, dt, player);
    },
    setReducedMotion(reduced) {
      kit.setReducedMotion(reduced);
    },
  };
}
