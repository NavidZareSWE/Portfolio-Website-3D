import type { RootState } from "./store";

export const selectGameStatus = (state: RootState) => state.game.status;
export const selectLoadStep = (state: RootState) => state.game.loadStep;
export const selectLoadProgress = (state: RootState) => state.game.loadProgress;
export const selectGameError = (state: RootState) => state.game.error;

export const selectActiveSection = (state: RootState) =>
  state.portfolio.activeSection;
export const selectIsOverlayOpen = (state: RootState) =>
  state.portfolio.activeSection !== null;

export const selectNearbyCard = (state: RootState) =>
  state.interaction.nearbyCardId;
export const selectIsCharging = (state: RootState) =>
  state.interaction.isCharging;

/** The contextual prompt is shown only while exploring next to a card. */
export const selectPromptCard = (state: RootState) =>
  state.game.status === "ready" && state.portfolio.activeSection === null
    ? state.interaction.nearbyCardId
    : null;

/**
 * The single explicit application mode, derived from the slices:
 * loading → playing ⇄ interacting (next to a card) → section-open;
 * paused overrides while the tab is hidden; error is the WebGL fallback.
 */
export type AppMode =
  | "loading"
  | "playing"
  | "interacting"
  | "section-open"
  | "paused"
  | "error";

export const selectAppMode = (state: RootState): AppMode => {
  if (state.game.status === "loading") return "loading";
  if (state.game.status === "error") return "error";
  if (state.game.paused) return "paused";
  if (state.portfolio.activeSection !== null) return "section-open";
  if (state.interaction.nearbyCardId !== null) return "interacting";
  return "playing";
};
