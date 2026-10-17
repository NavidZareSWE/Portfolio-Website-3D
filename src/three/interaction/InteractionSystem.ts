import type { Vector3 } from "three";
import type { SectionId } from "@/types";
import { INTERACTION } from "../config";
import type { HolographicCard } from "../cards/HolographicCard";

export interface InteractionCallbacks {
  onNearbyChange(id: SectionId | null): void;
  onChargeChange(charging: boolean): void;
  onProgress(progress: number): void;
  onActivate(id: SectionId): void;
}

/**
 * Proximity + hold-to-open logic.
 *
 * Proximity uses two radii (enter < exit) so standing on the boundary never
 * flickers the prompt. A card is only ever "nearby" because of the player's
 * distance to its pedestal, never because of camera direction.
 *
 * Space priority is deterministic and decided in `handleActionPress`:
 *   nearby card → start a hold (never jump)
 *   no card      → caller performs a jump
 */
export class InteractionSystem {
  nearbyId: SectionId | null = null;
  chargingId: SectionId | null = null;
  /** Card the current (possibly draining) progress value belongs to. */
  progressId: SectionId | null = null;
  progress = 0;

  constructor(
    private readonly cards: readonly HolographicCard[],
    private readonly callbacks: InteractionCallbacks,
  ) {}

  /** Re-evaluates which card the player is next to. Emits only on change. */
  updateProximity(player: Vector3) {
    let best: HolographicCard | null = null;
    let bestDistSq = Infinity;
    let currentDistSq = Infinity;

    for (const card of this.cards) {
      const dx = player.x - card.anchor.x;
      const dz = player.z - card.anchor.z;
      const distSq = dx * dx + dz * dz;
      if (card.id === this.nearbyId) currentDistSq = distSq;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = card;
      }
    }

    const enterSq = INTERACTION.enterRadius ** 2;
    const exitSq = INTERACTION.exitRadius ** 2;

    let next: SectionId | null = this.nearbyId;
    if (this.nearbyId !== null && currentDistSq > exitSq) next = null;
    if (best && bestDistSq <= enterSq && (next === null || best.id !== next)) {
      // Switch only if the new card is clearly closer than the current one.
      if (next === null || bestDistSq < currentDistSq * 0.8) next = best.id;
    }

    if (next !== this.nearbyId) {
      this.nearbyId = next;
      if (this.chargingId !== null && this.chargingId !== next)
        this.cancelCharge();
      this.callbacks.onNearbyChange(next);
    }
  }

  /**
   * Called on a fresh Space press. Returns true if the press was consumed
   * by an interaction (so the caller must not jump).
   */
  handleActionPress(): boolean {
    if (this.nearbyId === null) return false;
    if (this.chargingId === null) {
      if (this.progressId !== this.nearbyId) this.progress = 0;
      this.chargingId = this.nearbyId;
      this.progressId = this.nearbyId;
      this.callbacks.onChargeChange(true);
    }
    return true;
  }

  /** Advances the hold; `actionHeld` is the live Space state. */
  updateCharge(dt: number, actionHeld: boolean) {
    if (this.chargingId !== null) {
      if (!actionHeld) {
        this.cancelCharge();
      } else {
        this.progress = Math.min(
          1,
          this.progress + dt / INTERACTION.holdDuration,
        );
        this.callbacks.onProgress(this.progress);
        if (this.progress >= 1) {
          const id = this.chargingId;
          this.chargingId = null;
          this.callbacks.onChargeChange(false);
          this.callbacks.onActivate(id);
        }
      }
      return;
    }
    if (this.progress > 0) {
      this.progress = Math.max(0, this.progress - dt * INTERACTION.drainRate);
      if (this.progress === 0) this.progressId = null;
      this.callbacks.onProgress(this.progress);
    }
  }

  cancelCharge() {
    if (this.chargingId === null) return;
    this.chargingId = null;
    this.callbacks.onChargeChange(false);
  }

  /** Clears all interaction state (used when a section opens). */
  reset() {
    this.cancelCharge();
    this.progress = 0;
    this.progressId = null;
    this.callbacks.onProgress(0);
  }

  /** Forces listeners to re-sync after the UI was hidden (section closed). */
  resync(player: Vector3) {
    this.updateProximity(player);
    this.callbacks.onNearbyChange(this.nearbyId);
  }
}
