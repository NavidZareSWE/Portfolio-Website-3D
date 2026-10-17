import { PerspectiveCamera, Vector3 } from "three";
import {
  OVERLAY_PANEL_WIDTH_PX,
  OVERLAY_SHEET_MAX_FRACTION,
  OVERLAY_SHEET_MAX_PX,
  OVERLAY_SIDE_PANEL_MIN_VIEWPORT_PX,
} from "@/config/layout";
import { CAMERA } from "../config";
import { CAMERA_DIRECTION, SCREEN_RIGHT, damp } from "../utils/math";

/** Camera's screen-up axis in world space (right × forward). */
const CAMERA_UP = new Vector3()
  .crossVectors(SCREEN_RIGHT, CAMERA_DIRECTION.clone().negate())
  .normalize();

/**
 * Elevated three-quarter follow camera with a fixed viewing direction.
 *
 * The target eases toward the player (plus a small velocity look-ahead);
 * the camera sits at `target + direction × distance` and looks at the
 * target, so it can never spin or lose the player. Opening a section
 * blends the target toward the card and pulls the camera in; closing
 * blends back with the same damping, so the move is reversible.
 */
export class CameraController {
  readonly camera: PerspectiveCamera;

  private readonly target = new Vector3();
  private readonly desired = new Vector3();
  private readonly focusTarget = new Vector3();
  private focusPoint: Vector3 | null = null;
  private focusBlend = 0;
  private distance: number = CAMERA.distance;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private reducedMotion = false;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(
      CAMERA.fov,
      aspect,
      CAMERA.near,
      CAMERA.far,
    );
  }

  /** Places the camera immediately (no easing), e.g. on start-up. */
  snapTo(player: Vector3) {
    this.target.copy(player);
    this.target.y += CAMERA.targetHeight;
    this.applyTransform();
  }

  setFocus(point: Vector3 | null) {
    this.focusPoint = point;
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
  }

  resize(width: number, height: number) {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, player: Vector3, velocity: Vector3) {
    // Follow target with a small look-ahead in the direction of travel.
    this.desired.set(
      player.x + velocity.x * CAMERA.lookAhead,
      player.y * 0.6 + CAMERA.targetHeight,
      player.z + velocity.z * CAMERA.lookAhead,
    );

    const focusGoal = this.focusPoint ? 1 : 0;
    const focusRate = this.reducedMotion ? 30 : CAMERA.focusRate;
    this.focusBlend = damp(this.focusBlend, focusGoal, focusRate, dt);
    if (Math.abs(this.focusBlend - focusGoal) < 1e-4)
      this.focusBlend = focusGoal;

    const baseDistance = this.baseDistance();
    if (this.focusPoint) {
      // Shift the framing so the card sits in the area the panel leaves visible:
      // left of the side panel, or above the bottom sheet on narrow screens.
      const sectionDistance = CAMERA.sectionDistance * this.portraitFactor();
      const halfHeight =
        sectionDistance * Math.tan((CAMERA.fov * Math.PI) / 360);
      const halfWidth = halfHeight * this.camera.aspect;
      this.focusTarget.copy(this.focusPoint);
      if (this.viewportWidth >= OVERLAY_SIDE_PANEL_MIN_VIEWPORT_PX) {
        const panelFraction = OVERLAY_PANEL_WIDTH_PX / this.viewportWidth;
        this.focusTarget.addScaledVector(
          SCREEN_RIGHT,
          halfWidth * panelFraction,
        );
      } else {
        const sheetFraction = Math.min(
          OVERLAY_SHEET_MAX_FRACTION,
          OVERLAY_SHEET_MAX_PX / this.viewportHeight,
        );
        this.focusTarget.addScaledVector(
          CAMERA_UP,
          -halfHeight * sheetFraction,
        );
      }
      this.desired.lerp(this.focusTarget, this.focusBlend);
    }

    const goalDistance =
      baseDistance +
      (CAMERA.sectionDistance * this.portraitFactor() - baseDistance) *
        this.focusBlend;
    this.distance = damp(this.distance, goalDistance, 6, dt);

    const followRate = this.reducedMotion ? 12 : CAMERA.followRate;
    const k = 1 - Math.exp(-followRate * dt);
    this.target.lerp(this.desired, k);
    this.applyTransform();
  }

  private portraitFactor(): number {
    const aspect = this.camera.aspect;
    return aspect < 1 ? 1 + (1 - aspect) * CAMERA.portraitBoost : 1;
  }

  private baseDistance(): number {
    return CAMERA.distance * this.portraitFactor();
  }

  private applyTransform() {
    this.camera.position
      .copy(this.target)
      .addScaledVector(CAMERA_DIRECTION, this.distance);
    this.camera.lookAt(this.target);
  }
}
