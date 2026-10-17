import { Vector2, Vector3 } from "three";
import { PLAYER, WORLD } from "../config";
import type { CollisionSystem } from "../physics/CollisionSystem";
import { SCREEN_FORWARD, SCREEN_RIGHT, dampAngle } from "../utils/math";

export interface ControllerFrameEvents {
  jumped: boolean;
  /** Downward speed at the moment of landing (0 if the body did not land this step). */
  landingImpact: number;
}

/**
 * Kinematic character physics: acceleration-based horizontal movement,
 * gravity, jumping with coyote time and input buffering, collision and
 * ground detection. Holds no Three.js scene objects; the visual rig reads
 * from it every frame.
 */
export class CharacterController {
  readonly position = new Vector3(WORLD.spawn.x, 0, WORLD.spawn.z);
  readonly velocity = new Vector3();
  /** Facing angle around Y; starts facing up the screen (logo toward the camera). */
  yaw = Math.atan2(SCREEN_FORWARD.x, SCREEN_FORWARD.z);
  grounded = true;

  /** Actual horizontal speed after collisions (drives the walk cycle). */
  groundSpeed = 0;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private faceTarget: Vector3 | null = null;

  private readonly desired = new Vector3();
  private readonly previous = new Vector3();
  private readonly events: ControllerFrameEvents = {
    jumped: false,
    landingImpact: 0,
  };

  constructor(private readonly collisions: CollisionSystem) {}

  requestJump() {
    this.jumpBufferTimer = PLAYER.jumpBuffer;
  }

  cancelJumpRequest() {
    this.jumpBufferTimer = 0;
  }

  /** While set, the body turns toward this point when it is not being steered. */
  setFaceTarget(target: Vector3 | null) {
    this.faceTarget = target;
  }

  respawn() {
    this.position.set(WORLD.spawn.x, 0, WORLD.spawn.z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
  }

  /**
   * Advances the simulation by `dt` seconds.
   * @param move screen-relative intent from the input manager (|move| ≤ 1)
   * @param sprint Shift held: top speed × PLAYER.sprintMultiplier
   */
  update(dt: number, move: Vector2, sprint = false): ControllerFrameEvents {
    const events = this.events;
    events.jumped = false;
    events.landingImpact = 0;

    // Desired horizontal velocity in world space.
    this.desired
      .set(0, 0, 0)
      .addScaledVector(SCREEN_RIGHT, move.x)
      .addScaledVector(SCREEN_FORWARD, move.y)
      .multiplyScalar(PLAYER.maxSpeed * (sprint ? PLAYER.sprintMultiplier : 1));

    const steering = move.lengthSq() > 1e-4;
    let rate = steering ? PLAYER.acceleration : PLAYER.deceleration;
    if (!this.grounded) rate *= PLAYER.airControl;
    const k = 1 - Math.exp(-rate * dt);
    this.velocity.x += (this.desired.x - this.velocity.x) * k;
    this.velocity.z += (this.desired.z - this.velocity.z) * k;

    // Jumping (buffered input + coyote time).
    this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    this.coyoteTimer = this.grounded
      ? PLAYER.coyoteTime
      : Math.max(0, this.coyoteTimer - dt);
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.velocity.y = PLAYER.jumpVelocity;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      events.jumped = true;
    }

    if (!this.grounded) this.velocity.y -= PLAYER.gravity * dt;

    // Integrate, then resolve collisions.
    this.previous.copy(this.position);
    this.position.addScaledVector(this.velocity, dt);
    this.collisions.resolve(this.position, PLAYER.radius);

    // Ground detection.
    const ground = this.collisions.groundHeightAt(
      this.position.x,
      this.position.z,
      this.position.y,
    );
    if (this.position.y <= ground && this.velocity.y <= 0) {
      if (!this.grounded) events.landingImpact = -this.velocity.y;
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.grounded && this.position.y > ground + 0.01) {
      // Walked off a ledge.
      this.grounded = false;
    }

    // Recovery if something ever goes wrong with the ground.
    if (this.position.y < WORLD.killY) this.respawn();

    const dx = this.position.x - this.previous.x;
    const dz = this.position.z - this.previous.z;
    this.groundSpeed = dt > 0 ? Math.sqrt(dx * dx + dz * dz) / dt : 0;

    // Facing.
    if (steering) {
      this.yaw = dampAngle(
        this.yaw,
        Math.atan2(this.desired.x, this.desired.z),
        PLAYER.turnRate,
        dt,
      );
    } else if (this.faceTarget) {
      const tx = this.faceTarget.x - this.position.x;
      const tz = this.faceTarget.z - this.position.z;
      if (tx * tx + tz * tz > 0.01) {
        this.yaw = dampAngle(
          this.yaw,
          Math.atan2(tx, tz),
          PLAYER.turnRate * 0.6,
          dt,
        );
      }
    }

    return events;
  }
}
