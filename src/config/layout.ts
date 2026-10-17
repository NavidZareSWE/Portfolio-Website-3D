/**
 * Layout values shared between React (CSS custom properties) and the camera
 * controller, so the camera can frame the active card beside the overlay
 * panel instead of underneath it.
 */
export const OVERLAY_PANEL_WIDTH_PX = 520;

/** Below this viewport width the overlay becomes a full-width bottom sheet. */
export const OVERLAY_SIDE_PANEL_MIN_VIEWPORT_PX = 900;

/** Bottom-sheet height cap on narrow viewports: min(fraction × viewport height, px). */
export const OVERLAY_SHEET_MAX_FRACTION = 0.62;
export const OVERLAY_SHEET_MAX_PX = 640;

/** Focus returns to this element when an overlay closes. */
export const STAGE_ID = "world-stage";
