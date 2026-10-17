import {
  isModelTier,
  type GpuClass,
  type ModelTier,
  type NetworkClass,
} from "./ModelDetail";

/**
 * Development-only overrides, set from the terminal:
 *
 *   npm run dev -- --lod high        force a player model tier
 *   npm run dev -- --gpu software    simulate a GPU class (model choice only)
 *   npm run dev -- --net slow        simulate a connection class
 *
 * `scripts/dev.mjs` turns the flags into NEXT_PUBLIC_DEV_* variables. They
 * are ignored in production builds.
 */
const GPU_CLASSES: readonly GpuClass[] = [
  "software",
  "low",
  "mid",
  "high",
  "unknown",
];
const NETWORK_CLASSES: readonly NetworkClass[] = [
  "slow",
  "limited",
  "good",
  "unknown",
];

const development = process.env.NODE_ENV === "development";
const lod = development ? process.env.NEXT_PUBLIC_DEV_LOD : undefined;
const gpu = development ? process.env.NEXT_PUBLIC_DEV_GPU : undefined;
const net = development ? process.env.NEXT_PUBLIC_DEV_NET : undefined;

export const DEV_OVERRIDES: {
  lod?: ModelTier;
  gpu?: GpuClass;
  net?: NetworkClass;
} = {
  lod: isModelTier(lod) ? lod : undefined,
  gpu: GPU_CLASSES.find((value) => value === gpu),
  net: NETWORK_CLASSES.find((value) => value === net),
};

export const IS_DEVELOPMENT = development;
