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

export const selectBugsFixed = (state: RootState) => state.world.bugsFixed;
export const selectIsTerminalOpen = (state: RootState) =>
  state.world.terminalOpen;
export const selectIsArcadeOpen = (state: RootState) => state.world.arcadeOpen;
/** A window over the world (terminal or arcade) has the keyboard. */
export const selectIsModalOpen = (state: RootState) =>
  state.world.terminalOpen || state.world.arcadeOpen;
export const selectPortalFallback = (state: RootState) =>
  state.world.portalFallback;

/** The station prompt shows while exploring next to a station (terminal, arcade, portal). */
export const selectStationPrompt = (state: RootState) =>
  state.game.status === "ready" &&
  state.portfolio.activeSection === null &&
  !state.world.terminalOpen &&
  !state.world.arcadeOpen
    ? state.world.nearbyStation
    : null;

/** The contextual prompt is shown only while exploring next to a card. */
export const selectPromptCard = (state: RootState) =>
  state.game.status === "ready" && state.portfolio.activeSection === null
    ? state.interaction.nearbyCardId
    : null;

/**
 * The single explicit application mode, derived from the slices:
 * loading → playing ⇄ interacting (next to a card) → section-open;
 * the terminal window (opened at its kiosk) is terminal-open;
 * paused overrides while the tab is hidden; error is the WebGL fallback.
 */
export type AppMode =
  | "loading"
  | "playing"
  | "interacting"
  | "section-open"
  | "terminal-open"
  | "arcade-open"
  | "paused"
  | "error";

export const selectAppMode = (state: RootState): AppMode => {
  if (state.game.status === "loading") return "loading";
  if (state.game.status === "error") return "error";
  if (state.game.paused) return "paused";
  if (state.portfolio.activeSection !== null) return "section-open";
  if (state.world.terminalOpen) return "terminal-open";
  if (state.world.arcadeOpen) return "arcade-open";
  if (state.interaction.nearbyCardId !== null) return "interacting";
  return "playing";
};
