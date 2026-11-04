import type { Vector3 } from "three";
import type { StationId } from "@/types";

/**
 * Something in the world that is used by standing next to it and holding
 * Space (the terminal, the arcade cabinet, the social portals). The
 * Experience tracks which one the player is at and runs the hold; React
 * decides what using it does (see ExperienceClient).
 */
export interface WorldStation {
  id: StationId;
  /** Ground point the player's distance is measured from. */
  anchor: Vector3;
  /** Range in metres (leaving takes 0.4 m more, so the prompt never flickers). */
  radius: number;
  /** True for the terminal and the arcade: a window opens over the world. */
  opensWindow: boolean;
  /** Visual feedback while the player is in range. */
  setNearby(nearby: boolean): void;
  /** Called in the world when the hold completes (before the UI reacts). */
  onActivate?(): void;
}
