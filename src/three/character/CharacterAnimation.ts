import { PLAYER } from "../config";
import { clamp, damp } from "../utils/math";
import type { CharacterRig } from "./Character";

export interface AnimationInput {
  dt: number;
  time: number;
  /** Actual horizontal speed after collisions. */
  groundSpeed: number;
  grounded: boolean;
  verticalVelocity: number;
  jumped: boolean;
  landingImpact: number;
  /** True while Space is being held to open a card. */
  charging: boolean;
}

/** Distance covered by one full stride cycle (left + right step). */
const STRIDE_LENGTH = 1.0;

/**
 * Procedural animation. Every state (idle, walk/run, jump, fall, land,
 * reach-toward-card) is a continuous blend weight smoothed over time, so
 * transitions never pop. The walk phase advances with distance travelled,
 * so the legs stop the moment the body stops.
 */
export class CharacterAnimation {
  private phase = 0;
  private moveBlend = 0;
  private airBlend = 0;
  private chargeBlend = 0;
  private lean = 0;
  private squash = 0;
  private squashVelocity = 0;
  private previousSpeed = 0;

  constructor(private rig: CharacterRig) {}

  /** Drives a different model (detail tier swap); motion state carries over. */
  setRig(rig: CharacterRig) {
    this.rig = rig;
  }

  update(input: AnimationInput) {
    const { dt, time, groundSpeed, grounded } = input;
    const rig = this.rig;

    // ---- blend weights ---------------------------------------------------
    const speedRatio = clamp(groundSpeed / PLAYER.maxSpeed, 0, 1);
    this.moveBlend = damp(this.moveBlend, grounded ? speedRatio : 0, 10, dt);
    this.airBlend = damp(
      this.airBlend,
      grounded ? 0 : 1,
      grounded ? 16 : 10,
      dt,
    );
    this.chargeBlend = damp(this.chargeBlend, input.charging ? 1 : 0, 9, dt);

    if (grounded)
      this.phase += (groundSpeed * dt * Math.PI * 2) / STRIDE_LENGTH;

    // Lean into acceleration, settle when cruising.
    const acceleration = dt > 0 ? (groundSpeed - this.previousSpeed) / dt : 0;
    this.previousSpeed = groundSpeed;
    this.lean = damp(
      this.lean,
      this.moveBlend * 0.1 + clamp(acceleration * 0.012, -0.08, 0.12),
      6,
      dt,
    );

    // ---- squash & stretch spring ----------------------------------------
    if (input.jumped) this.squashVelocity -= 2.4;
    if (input.landingImpact > 2) {
      this.squashVelocity += clamp(input.landingImpact / 12, 0, 1.4) * 3.2;
    }
    const stiffness = 260;
    const dampingRatio = 14;
    this.squashVelocity +=
      (-this.squash * stiffness - this.squashVelocity * dampingRatio) * dt;
    this.squash += this.squashVelocity * dt;
    const s = clamp(this.squash, -0.18, 0.22);
    rig.squash.scale.set(1 + s * 0.45, 1 - s, 1 + s * 0.45);

    // ---- walk cycle ------------------------------------------------------
    const swing = Math.sin(this.phase);
    const walk = this.moveBlend;
    const idle = (1 - walk) * (1 - this.airBlend);
    const breathe = Math.sin(time * 2.1);

    const legSwing = swing * 0.62 * walk;
    // Air pose: one leg tucked forward, the other trailing, knees bent.
    const rising = clamp(input.verticalVelocity / PLAYER.jumpVelocity, -1, 1);
    const ground = 1 - this.airBlend;
    rig.leftLeg.rotation.x =
      legSwing * ground + (-0.5 - rising * 0.2) * this.airBlend;
    rig.rightLeg.rotation.x =
      -legSwing * ground + (0.3 + rising * 0.1) * this.airBlend;

    // Knees bend while each foot travels forward through the air.
    const kneeLeft = Math.max(0, Math.sin(this.phase - 0.9)) * 0.85 * walk;
    const kneeRight =
      Math.max(0, Math.sin(this.phase + Math.PI - 0.9)) * 0.85 * walk;
    rig.leftShin.rotation.x = kneeLeft * ground + 0.7 * this.airBlend;
    rig.rightShin.rotation.x = kneeRight * ground + 0.45 * this.airBlend;
    // Feet stay roughly parallel to the ground.
    rig.leftFoot.rotation.x =
      -(rig.leftLeg.rotation.x + rig.leftShin.rotation.x) * 0.75;
    rig.rightFoot.rotation.x =
      -(rig.rightLeg.rotation.x + rig.rightShin.rotation.x) * 0.75;

    rig.leftLeg.position.y =
      rig.legRestY + Math.max(0, -Math.cos(this.phase)) * 0.03 * walk;
    rig.rightLeg.position.y =
      rig.legRestY + Math.max(0, Math.cos(this.phase)) * 0.03 * walk;

    // Arms swing opposite to legs (rest pose: hands toward the pouch), lift when
    // airborne; the right arm reaches out while a card is being opened.
    const armSwing = -swing * 0.55 * walk;
    const armSpread = this.airBlend * 0.55 + idle * breathe * 0.01;
    rig.leftArm.rotation.x = armSwing * ground - this.airBlend * 0.3;
    rig.leftArm.rotation.z = armSpread;
    rig.leftForearm.rotation.x = 0.25 * walk - 0.3 * this.airBlend;
    const rightSwing = -armSwing * ground - this.airBlend * 0.3;
    rig.rightArm.rotation.x =
      rightSwing * (1 - this.chargeBlend) - 1.3 * this.chargeBlend;
    rig.rightArm.rotation.z =
      -armSpread * (1 - this.chargeBlend) - 0.1 * this.chargeBlend;
    rig.rightForearm.rotation.x =
      (0.25 * walk - 0.3 * this.airBlend) * (1 - this.chargeBlend) +
      0.55 * this.chargeBlend;

    // ---- body & head -----------------------------------------------------
    const bob = Math.abs(Math.cos(this.phase)) * 0.035 * walk;
    rig.body.position.y = rig.bodyRestY + bob + idle * breathe * 0.008;
    rig.body.rotation.x =
      this.lean - this.chargeBlend * 0.06 + this.airBlend * rising * 0.08;
    rig.body.rotation.y = swing * 0.07 * walk;
    rig.body.rotation.z = Math.sin(this.phase) * 0.025 * walk;

    // Head counters the torso and idly looks around.
    rig.head.rotation.y =
      -rig.body.rotation.y * 0.7 + idle * Math.sin(time * 0.45) * 0.12;
    rig.head.rotation.x =
      -this.lean * 0.5 +
      idle * Math.sin(time * 0.7) * 0.03 -
      this.chargeBlend * 0.12;
    rig.head.rotation.z = idle * Math.sin(time * 0.33) * 0.04;
  }
}
