/**
 * Tunable constants for the simulation. Grouped by system so values can be
 * adjusted without hunting through implementation files.
 * Units are metres and seconds.
 */

export const WORLD = {
  /** Radius the player is clamped to (room for the five card vignettes). */
  playRadius: 33,
  /** Visible ASCII floor radius (fades out before this). */
  floorRadius: 62,
  /** ASCII floor cell size. */
  cellSize: 0.3,
  /** Spawn is the origin of the card layout. */
  spawn: { x: 0, z: 0 },
  /** Recover the player if they ever fall below this height. */
  killY: -12,
} as const;

export const PLAYER = {
  radius: 0.36,
  maxSpeed: 4.6,
  /** Holding Shift multiplies the top speed (same animation, faster stride). */
  sprintMultiplier: 1.6,
  /** Exponential approach rates for horizontal velocity (1/s). */
  acceleration: 13,
  deceleration: 11,
  airControl: 0.45,
  gravity: 32,
  /** Apex ≈ v² / 2g ≈ 1.15 m: high enough to hop onto the low data blocks. */
  jumpVelocity: 8.6,
  /** Grace period after walking off a ledge in which a jump still counts. */
  coyoteTime: 0.1,
  /** A jump pressed slightly before landing is remembered for this long. */
  jumpBuffer: 0.12,
  turnRate: 14,
  /** Ledges lower than this can be stepped onto without jumping. */
  stepHeight: 0.22,
} as const;

/**
 * Camera direction from target to camera. Taken from the default angle of
 * Bruno Simon's 2019 folio (`new Vector3(1.135, -1.45, 1.15)` in its Z-up
 * world) and converted to this Y-up world: (x, z, -y).
 */
export const CAMERA = {
  fov: 38,
  near: 0.5,
  far: 170,
  direction: [1.135, 1.15, 1.45] as const,
  distance: 15.5,
  /** Extra distance factor applied on portrait viewports. */
  portraitBoost: 0.85,
  followRate: 5.5,
  lookAhead: 0.22,
  targetHeight: 0.75,
  /** Section transition framing. */
  sectionDistance: 9.5,
  focusRate: 4.2,
} as const;

export const INTERACTION = {
  /** A card becomes "nearby" inside this radius... */
  enterRadius: 2.7,
  /** ...and stops being nearby only beyond this one (hysteresis). */
  exitRadius: 3.2,
  /** Seconds Space must be held to open a card. */
  holdDuration: 0.65,
  /** How fast an interrupted hold drains back to zero (1/s). */
  drainRate: 3.5,
} as const;

/** Cards are ~2.2x the chibi's height (1.6 m), floating over a ring emitter. */
export const CARD = {
  width: 2.4,
  height: 3.5,
  /** Card thickness (extruded holographic slab). */
  depth: 0.09,
  centerY: 3.15,
  /** Backwards tilt toward the elevated camera (radians). */
  tilt: 0.14,
  /** Emitter disk on the floor (also the solid collider). */
  pedestalRadius: 0.95,
  pedestalHeight: 0.12,
} as const;

export const GLYPH_FOG = {
  near: 32,
  far: 85,
} as const;

/** The scenes beside the cards. */
export const SCENES = {
  /** Glyph figures (and their furniture) are this much bigger than the player. */
  npcScale: 1.5,
} as const;

/** Rendering quality (see quality/Quality.ts). Scales are device pixels per CSS pixel. */
export const RENDER = {
  maxPixelRatio: 2,
  /** First-frame scale on GPUs; it rises toward the device ratio when there is headroom. */
  startScale: 1.5,
  /** Without a GPU every pixel is shaded on the CPU: start low, never above 1. */
  softwareStartScale: 0.75,
  softwareMaxScale: 1,
  softwareMaxAnisotropy: 2,
  minScale: 0.5,
  /** Each adjustment multiplies (or divides) the scale by this. */
  scaleStep: 0.85,
  /** Seconds of frames averaged per decision. */
  adaptWindow: 1,
  /** Below this average frame rate the scale drops. */
  minFps: 48,
  /** Above this the scale may rise. */
  headroomFps: 57,
  /** Seconds between increases (doubles after each increase that had to be undone). */
  settleTime: 4,
  /** While a section is open on a constrained device, the world behind it renders at this rate. */
  readingFps: 30,
} as const;
