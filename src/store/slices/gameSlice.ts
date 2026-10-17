import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LoadStatus } from "@/types";

export interface GameState {
  status: LoadStatus;
  /** Key of the current initialisation step (translated in the UI: ui:loading.steps.<key>). */
  loadStep: string;
  /** 0..1, advanced only at discrete initialisation milestones. */
  loadProgress: number;
  error: string | null;
  /** True while the tab is hidden and the render loop is suspended. */
  paused: boolean;
}

const initialState: GameState = {
  status: "loading",
  loadStep: "boot",
  loadProgress: 0,
  error: null,
  paused: false,
};

const gameSlice = createSlice({
  name: "game",
  initialState,
  reducers: {
    loadProgressed(
      state,
      action: PayloadAction<{ step: string; progress: number }>,
    ) {
      if (state.status !== "loading") return;
      state.loadStep = action.payload.step;
      state.loadProgress = Math.max(
        state.loadProgress,
        Math.min(1, action.payload.progress),
      );
    },
    gameReady(state) {
      state.status = "ready";
      state.loadStep = "ready";
      state.loadProgress = 1;
      state.error = null;
    },
    gameFailed(state, action: PayloadAction<string>) {
      state.status = "error";
      state.error = action.payload;
    },
    pausedChanged(state, action: PayloadAction<boolean>) {
      state.paused = action.payload;
    },
  },
});

export const { loadProgressed, gameReady, gameFailed, pausedChanged } =
  gameSlice.actions;
export default gameSlice.reducer;
