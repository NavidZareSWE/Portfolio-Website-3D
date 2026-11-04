/**
 * Where the world's newer elements stand, in screen-aligned layout units
 * (right, up), the same frame as CARD_LAYOUT (cards/CardRegistry.ts).
 * Shared by the floor decals, the props and the gameplay systems, so a move
 * here keeps the floor pattern, the mesh and the collider together.
 */

export interface LayoutPoint {
  right: number;
  up: number;
}

export interface LayoutRect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** Section districts painted into the floor (world/districts.ts). */
export const DISTRICT_LAYOUT = {
  /** Git graph beside Experience: main lane x, rows from `top` down to `bottom`. */
  gitGraph: { right: -18.2, top: 1.0, bottom: -11.5 },
  /** The plan sheet in front of the Projects build site. */
  blueprint: { left: 3.4, right: 13.0, bottom: 10.0, top: 13.6 },
  rug: { left: -16.8, right: -13.6, bottom: 5.6, top: 8.0 },
  /** Potted glyph plants around the rug (CozyCorner.ts). */
  plants: [
    { right: -17.3, up: 9.0, scale: 1.15 },
    { right: -14.2, up: 9.4, scale: 0.9 },
    { right: -12.9, up: 5.2, scale: 1.0 },
  ],
  /** Kept clear of every district: the card emitters (centre, radius). */
  cardClearance: 3.5,
} as const;

/** Beyond the firewall: server stacks, antenna masts and the billboard. */
export const HORIZON_LAYOUT = {
  /** Giant scrolling terminal, tilted back toward the camera past the top edge. */
  billboard: { right: 0, up: 47.2, width: 15, height: 5.2, tilt: 0.55 },
  /** Rows of server racks (count racks side by side, centred on the point). */
  serverRows: [
    { right: -48, up: 7.8, count: 5 },
    { right: 48.8, up: 2.6, count: 6 },
    { right: -27.3, up: 41, count: 4 },
    { right: 28.6, up: 39.7, count: 5 },
  ],
  masts: [
    { right: -45.5, up: 19.5, height: 8.5 },
    { right: 43.5, up: 23.4, height: 9.5 },
    { right: -16.3, up: 46.8, height: 7.5 },
    { right: 47.5, up: -13, height: 8 },
    { right: 16.9, up: 47.5, height: 6.5 },
  ],
} as const;

/** Radius kept free of skyline towers around each horizon element. */
export const HORIZON_CLEARANCE = 2.6;

/** Things to play with near the middle of the map. */
export const PLAY_LAYOUT = {
  /** The walk-up terminal (TerminalStation.ts). */
  terminal: { right: 4.6, up: 1.6 },
  /** Pushable glyph cubes. */
  cubes: [
    { right: -5.5, up: -1.5 },
    { right: -4.2, up: 3.4 },
    { right: 6.8, up: -8.3 },
    { right: 15, up: -4.2 },
    { right: -12.4, up: 17.6 },
  ],
  cubeSize: 0.7,
  /** Bugs roam around these nests (radius in metres). */
  bugNests: [
    { right: 4, up: -11.5, radius: 5 },
    { right: -5, up: 7, radius: 4.5 },
    { right: 10, up: 2, radius: 4 },
    { right: -1, up: -21, radius: 5 },
    { right: 25, up: 19, radius: 3.5 },
  ],
  bugCount: 9,
} as const;

/** Right of Skills: the package warehouse and the climbable tech-stack tower. */
export const SKILLS_EXTRAS = {
  warehouse: {
    /** Jumpable crates in a row in front of the shelves (left edge to right edge). */
    crates: { left: 30.8, right: 38.2, up: 8.4, size: 0.8 },
    /** Two low shelf units, back to front, with an aisle for the forklift. */
    shelves: [
      { left: 30.6, right: 38.2, up: 13.4 },
      { left: 30.6, right: 38.2, up: 10.6 },
    ],
    aisle: { left: 31.2, right: 37.6, up: 12.0 },
  },
  /** Tiers from the widest (bottom) to the narrowest (top). */
  tower: { right: 35.5, up: 2.6, sizes: [4.8, 3.6, 2.4, 1.4], tier: 0.8 },
} as const;

/** Right of Contact: the social portals and the arcade cabinet. */
export const CONTACT_EXTRAS = {
  portals: [
    { id: "github", right: 27.5, up: -19.6 },
    { id: "linkedin", right: 30.4, up: -19.6 },
    { id: "telegram", right: 33.3, up: -19.6 },
    { id: "email", right: 36.2, up: -19.6 },
  ],
  arcade: { right: 33, up: -10.6 },
} as const;
