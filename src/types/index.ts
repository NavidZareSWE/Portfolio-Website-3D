/**
 * Shared, serialisable domain types. Nothing in this file may reference
 * Three.js runtime objects, so it can be imported from both the Redux store
 * and the scene modules without creating a dependency between them.
 */

export const SECTION_IDS = [
  "about",
  "projects",
  "skills",
  "experience",
  "contact",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export type LoadStatus = "loading" | "ready" | "error";

/**
 * Things in the world that are used by standing next to them and holding
 * Space (like a card): the terminal, the arcade cabinet and the social portals.
 */
export const STATION_IDS = [
  "terminal",
  "arcade",
  "github",
  "linkedin",
  "telegram",
  "email",
] as const;

export type StationId = (typeof STATION_IDS)[number];

/** The stations that open a link instead of a window. */
export type PortalId = Extract<
  StationId,
  "github" | "linkedin" | "telegram" | "email"
>;

export function isPortalId(id: StationId): id is PortalId {
  return (
    id === "github" || id === "linkedin" || id === "telegram" || id === "email"
  );
}

/** Logical gameplay controls (physical keys are mapped onto these). */
export type ControlKey = "KeyW" | "KeyA" | "KeyS" | "KeyD" | "Space";

export function isSectionId(value: unknown): value is SectionId {
  return (
    typeof value === "string" &&
    (SECTION_IDS as readonly string[]).includes(value)
  );
}
