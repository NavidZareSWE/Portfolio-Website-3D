import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SectionId } from "@/types";
import { sectionOpened } from "./portfolioSlice";

export interface InteractionState {
  /** Closest card whose interaction zone contains the player. */
  nearbyCardId: SectionId | null;
  /** True while Space is being held to open the nearby card. */
  isCharging: boolean;
}

const initialState: InteractionState = {
  nearbyCardId: null,
  isCharging: false,
};

/*
 * Only discrete changes are dispatched here (entering/leaving a zone,
 * starting/cancelling a hold). The continuous hold progress is streamed
 * straight from the simulation to the prompt component, bypassing Redux.
 */
const interactionSlice = createSlice({
  name: "interaction",
  initialState,
  reducers: {
    nearbyCardChanged(state, action: PayloadAction<SectionId | null>) {
      state.nearbyCardId = action.payload;
      if (action.payload === null) state.isCharging = false;
    },
    chargingChanged(state, action: PayloadAction<boolean>) {
      state.isCharging = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(sectionOpened, (state) => {
      state.isCharging = false;
    });
  },
});

export const { nearbyCardChanged, chargingChanged } = interactionSlice.actions;
export default interactionSlice.reducer;
