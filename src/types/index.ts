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

/** Logical gameplay controls (physical keys are mapped onto these). */
export type ControlKey = "KeyW" | "KeyA" | "KeyS" | "KeyD" | "Space";

export function isSectionId(value: unknown): value is SectionId {
  return (
    typeof value === "string" &&
    (SECTION_IDS as readonly string[]).includes(value)
  );
}
