import type { Vector2 } from "three";
import type { ControlKey } from "@/types";
import { EventEmitter } from "../utils/EventEmitter";

/** Physical key codes (layout-independent `KeyboardEvent.code`) → logical controls. */
const KEY_MAP: Record<string, ControlKey> = {
  KeyW: "KeyW",
  ArrowUp: "KeyW",
  KeyA: "KeyA",
  ArrowLeft: "KeyA",
  KeyS: "KeyS",
  ArrowDown: "KeyS",
  KeyD: "KeyD",
  ArrowRight: "KeyD",
  Space: "Space",
};

const CONTROLS: readonly ControlKey[] = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
];

/**
 * On-screen ways to hold the action: the touch action button, the
 * interaction prompt, and the card itself (pressed with a mouse or a finger).
 */
export type VirtualActionSource = "button" | "prompt" | "card";

/** Sprint modifier. Not a gameplay key: it is never prevented (Shift+Tab must keep working). */
const SPRINT_CODES = new Set(["ShiftLeft", "ShiftRight"]);

/** Keyboard events aimed at these elements belong to the UI, not the game. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target.closest(
      'input, textarea, select, button, a[href], [role="dialog"], [data-ui-captures-keys]',
    ) !== null
  );
}

export interface InputEvents {
  /** A logical control changed between pressed and released. */
  change: { key: ControlKey; pressed: boolean };
  /** Shift (sprint) changed between held and released. */
  sprint: { pressed: boolean };
}

/**
 * Tracks keyboard (and optional virtual touch) input.
 *
 * - Held state is derived from the set of physical keys currently down, so
 *   W and ArrowUp can overlap without releasing each other.
 * - Press *edges* are recorded only on non-repeat keydowns and are consumed
 *   by the simulation, which keeps key-repeat from re-triggering actions.
 * - `reset()` moves every held key into a "suppressed" set. A suppressed key
 *   is ignored (including its auto-repeat) until it is physically released.
 *   This is what prevents a Space held while opening/closing a section from
 *   turning into a jump afterwards.
 */
export class InputManager {
  readonly events = new EventEmitter<InputEvents>();

  private physicalDown = new Set<string>();
  private suppressed = new Set<string>();
  private pressEdges = new Set<ControlKey>();
  private controlState = new Map<ControlKey, boolean>(
    CONTROLS.map((c) => [c, false]),
  );

  private sprintDown = new Set<string>();
  private virtualMoveX = 0;
  private virtualMoveY = 0;
  /** On-screen controls holding the action down (button, prompt, card). */
  private readonly virtualAction = new Set<VirtualActionSource>();

  private target: Window | null = null;

  attach(target: Window) {
    if (this.target) return;
    this.target = target;
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  detach() {
    if (!this.target) return;
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.target = null;
    this.events.clear();
  }

  isDown(control: ControlKey): boolean {
    return this.controlState.get(control) ?? false;
  }

  /** Shift is held (move faster). */
  isSprinting(): boolean {
    return this.sprintDown.size > 0;
  }

  /** Returns true once per physical press of `control`. */
  consumePress(control: ControlKey): boolean {
    const had = this.pressEdges.has(control);
    this.pressEdges.delete(control);
    return had;
  }

  /**
   * Writes the movement intent into `out` as screen-relative axes:
   * x = right (+) / left (−), y = up the screen (+) / down (−).
   * Magnitude is clamped to 1 so diagonals are not faster.
   */
  getMoveVector(out: Vector2): Vector2 {
    const x =
      (this.isDown("KeyD") ? 1 : 0) -
      (this.isDown("KeyA") ? 1 : 0) +
      this.virtualMoveX;
    const y =
      (this.isDown("KeyW") ? 1 : 0) -
      (this.isDown("KeyS") ? 1 : 0) +
      this.virtualMoveY;
    out.set(x, y);
    const lengthSq = out.lengthSq();
    if (lengthSq > 1) out.multiplyScalar(1 / Math.sqrt(lengthSq));
    return out;
  }

  /** Clears edges and suppresses everything currently held until it is released. */
  reset() {
    this.physicalDown.forEach((code) => this.suppressed.add(code));
    this.physicalDown.clear();
    this.setSprint(() => this.sprintDown.clear());
    this.pressEdges.clear();
    this.virtualMoveX = 0;
    this.virtualMoveY = 0;
    this.virtualAction.clear();
    this.refreshControls();
  }

  /** Forget everything, including suppression (used when the page loses focus). */
  clearAll() {
    this.physicalDown.clear();
    this.setSprint(() => this.sprintDown.clear());
    this.suppressed.clear();
    this.pressEdges.clear();
    this.virtualMoveX = 0;
    this.virtualMoveY = 0;
    this.virtualAction.clear();
    this.refreshControls();
  }

  /* ---------------------------- virtual (touch) ---------------------------- */

  setVirtualMove(x: number, y: number) {
    this.virtualMoveX = x;
    this.virtualMoveY = y;
  }

  /**
   * Holds or releases the action (Space) from an on-screen control. Each
   * control is tracked separately, so releasing one never cancels a hold
   * that another control (or the Space key) still has.
   */
  setVirtualAction(pressed: boolean, source: VirtualActionSource = "button") {
    const wasHeld = this.virtualAction.size > 0;
    if (pressed) this.virtualAction.add(source);
    else this.virtualAction.delete(source);
    if (pressed && !wasHeld) this.pressEdges.add("Space");
    this.refreshControls();
  }

  /* -------------------------------- handlers ------------------------------- */

  private onKeyDown = (event: KeyboardEvent) => {
    if (SPRINT_CODES.has(event.code)) {
      if (!isInteractiveTarget(event.target))
        this.setSprint(() => this.sprintDown.add(event.code));
      return;
    }
    const control = KEY_MAP[event.code];
    if (!control) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isInteractiveTarget(event.target)) return;

    // Gameplay owns these keys: stop Space/arrows from scrolling or clicking.
    event.preventDefault();

    if (this.suppressed.has(event.code)) return;
    if (!this.physicalDown.has(event.code)) {
      this.physicalDown.add(event.code);
      if (!event.repeat) this.pressEdges.add(control);
      this.refreshControls();
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (SPRINT_CODES.has(event.code)) {
      this.setSprint(() => this.sprintDown.delete(event.code));
      return;
    }
    const control = KEY_MAP[event.code];
    if (!control) return;
    this.suppressed.delete(event.code);
    if (this.physicalDown.delete(event.code)) this.refreshControls();
  };

  private onBlur = () => this.clearAll();

  private onVisibilityChange = () => {
    if (document.visibilityState === "hidden") this.clearAll();
  };

  /** Applies a change to the held Shift keys and reports when sprinting starts or stops. */
  private setSprint(change: () => void) {
    const before = this.isSprinting();
    change();
    const after = this.isSprinting();
    if (before !== after) this.events.emit("sprint", { pressed: after });
  }

  private refreshControls() {
    for (const control of CONTROLS) {
      let pressed = control === "Space" && this.virtualAction.size > 0;
      if (!pressed) {
        for (const code of this.physicalDown) {
          if (KEY_MAP[code] === control) {
            pressed = true;
            break;
          }
        }
      }
      if (this.controlState.get(control) !== pressed) {
        this.controlState.set(control, pressed);
        this.events.emit("change", { key: control, pressed });
      }
    }
  }
}
