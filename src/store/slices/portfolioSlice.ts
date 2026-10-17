import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SectionId } from "@/types";

export interface PortfolioState {
  /** The open section, or null while exploring. Overlay visibility derives from this. */
  activeSection: SectionId | null;
}

const initialState: PortfolioState = {
  activeSection: null,
};

const portfolioSlice = createSlice({
  name: "portfolio",
  initialState,
  reducers: {
    sectionOpened(state, action: PayloadAction<SectionId>) {
      state.activeSection = action.payload;
    },
    sectionClosed(state) {
      state.activeSection = null;
    },
  },
});

export const { sectionOpened, sectionClosed } = portfolioSlice.actions;
export default portfolioSlice.reducer;
