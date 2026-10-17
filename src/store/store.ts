import { configureStore } from "@reduxjs/toolkit";
import gameReducer from "./slices/gameSlice";
import interactionReducer from "./slices/interactionSlice";
import portfolioReducer from "./slices/portfolioSlice";

/**
 * A new store per request/session (Redux's recommended Next.js App Router
 * pattern), created once inside the client-side provider. No Three.js
 * objects ever enter this store, so the default serializability checks stay on.
 */
export function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      interaction: interactionReducer,
      portfolio: portfolioReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
