import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { PortalId, StationId } from "@/types";

export interface WorldState {
  /** Bugs squashed this visit (kept across language switches, which rebuild the world). */
  bugsFixed: number;
  /** The station (terminal, arcade, portal) the player stands at, if no card is nearby. */
  nearbyStation: StationId | null;
  /** The terminal window is open. */
  terminalOpen: boolean;
  /** The ROOT RUN arcade window is open. */
  arcadeOpen: boolean;
  /** A portal whose new tab the browser blocked: a link to click is shown instead. */
  portalFallback: PortalId | null;
}

const initialState: WorldState = {
  bugsFixed: 0,
  nearbyStation: null,
  terminalOpen: false,
  arcadeOpen: false,
  portalFallback: null,
};

const worldSlice = createSlice({
  name: "world",
  initialState,
  reducers: {
    bugsSquashed(state, action: PayloadAction<number>) {
      state.bugsFixed += Math.max(0, action.payload);
    },
    stationNearbyChanged(state, action: PayloadAction<StationId | null>) {
      state.nearbyStation = action.payload;
    },
    terminalOpened(state) {
      state.terminalOpen = true;
    },
    terminalClosed(state) {
      state.terminalOpen = false;
    },
    arcadeOpened(state) {
      state.arcadeOpen = true;
    },
    arcadeClosed(state) {
      state.arcadeOpen = false;
    },
    portalBlocked(state, action: PayloadAction<PortalId>) {
      state.portalFallback = action.payload;
    },
    portalFallbackDismissed(state) {
      state.portalFallback = null;
    },
  },
});

export const {
  bugsSquashed,
  stationNearbyChanged,
  terminalOpened,
  terminalClosed,
  arcadeOpened,
  arcadeClosed,
  portalBlocked,
  portalFallbackDismissed,
} = worldSlice.actions;
export default worldSlice.reducer;
