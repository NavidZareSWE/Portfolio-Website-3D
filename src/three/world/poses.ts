import { REST, pose, type Pose } from "./GlyphFigure";

/*
 * Shared poses, written as joint targets in figure space (metres; the
 * figure faces +Z, +X is its left, feet at y = 0, hips at y = 0.42).
 *
 * Seated: thighs forward, shins down. Soles then sit 0.09 m above the
 * figure origin, so the figure is lowered by SIT_LIFT and the seat top is
 * at SEAT_HEIGHT (chibi-scale furniture).
 */
export const SIT_LIFT = -0.09;
export const SEAT_HEIGHT = 0.26;
/** Hands rest at this height above the floor when typing seated. */
export const DESK_HEIGHT = 0.42;

type V = [number, number, number];

const seatedLegs = {
  kneeL: [0.15, 0.4, 0.11] as V,
  ankleL: [0.17, 0.3, 0.13] as V,
  kneeR: [-0.15, 0.4, 0.11] as V,
  ankleR: [-0.17, 0.3, 0.13] as V,
};

export const STAND: Pose = pose({});

export const SIT: Pose = pose({ lift: SIT_LIFT, ...seatedLegs });

/** Seated, hands on a keyboard in front of the chest. */
export const SIT_TYPING: Pose = pose({
  lift: SIT_LIFT,
  lean: [0.12, 0, 0],
  head: [0.12, 0, 0],
  ...seatedLegs,
  elbowL: [0.31, 0.57, 0.1],
  wristL: [0.12, 0.54, 0.31],
  elbowR: [-0.31, 0.57, 0.1],
  wristR: [-0.12, 0.54, 0.31],
});

/** Adds fast, slightly irregular finger-tapping to a typing pose. */
export function typing(
  base: Pose,
  time: number,
  seed: number,
  intensity = 1,
): Pose {
  const a = Math.sin(time * 19 + seed) * Math.sin(time * 7.3 + seed * 2);
  const b = Math.sin(time * 17 + seed * 3.1) * Math.sin(time * 5.1 + seed);
  const bob = Math.sin(time * 2.3 + seed) * 0.02;
  return {
    ...base,
    head: [
      base.head[0] + bob * intensity,
      base.head[1] + Math.sin(time * 0.7 + seed) * 0.08,
      base.head[2],
    ],
    wristL: [
      base.wristL[0] + b * 0.012 * intensity,
      base.wristL[1] + Math.max(0, a) * 0.022 * intensity,
      base.wristL[2],
    ],
    wristR: [
      base.wristR[0] + a * 0.012 * intensity,
      base.wristR[1] + Math.max(0, b) * 0.022 * intensity,
      base.wristR[2],
    ],
  };
}

/** Seated on an amp, guitar across the lap: left hand on the neck, right hand strumming. */
export const SIT_GUITAR: Pose = pose({
  lift: SIT_LIFT,
  lean: [0.08, 0.15, 0],
  head: [0.2, 0.35, -0.12],
  ...seatedLegs,
  elbowL: [0.38, 0.58, 0.16],
  wristL: [0.4, 0.63, 0.34],
  elbowR: [-0.33, 0.56, 0.12],
  wristR: [-0.02, 0.48, 0.42],
});

export function strumming(base: Pose, time: number): Pose {
  const strum = Math.sin(time * 9.5);
  const fret = Math.sin(time * 1.3) * 0.03;
  return {
    ...base,
    head: [
      base.head[0] + Math.abs(Math.sin(time * 3.2)) * 0.06,
      base.head[1],
      base.head[2],
    ],
    wristR: [base.wristR[0], base.wristR[1] + strum * 0.045, base.wristR[2]],
    wristL: [
      base.wristL[0] + fret,
      base.wristL[1] + fret * 0.4,
      base.wristL[2],
    ],
    footR: [Math.max(0, Math.sin(time * 6.4)) * -0.25, 0, 0],
  };
}

/** Seated, right leg crossed over the left, right hand holding a phone to the hood. */
export const SIT_PHONE: Pose = pose({
  lift: SIT_LIFT,
  lean: [-0.08, 0, 0.05],
  head: [0.05, -0.15, 0.26],
  kneeL: [0.15, 0.4, 0.11],
  ankleL: [0.17, 0.3, 0.13],
  kneeR: [-0.05, 0.47, 0.1],
  ankleR: [0.1, 0.43, 0.2],
  footR: [0.35, 0.3, 0],
  // Left arm stretched along the backrest.
  elbowL: [0.42, 0.75, -0.08],
  wristL: [0.58, 0.74, -0.16],
  // Right hand up at the side of the (tilted) hood.
  elbowR: [-0.43, 0.8, 0.12],
  wristR: [-0.33, 0.98, 0.12],
});

/** Seated in the crane cab, both hands on the control sticks. */
export const SIT_CONTROLS: Pose = pose({
  lift: SIT_LIFT,
  lean: [0.1, 0, 0],
  ...seatedLegs,
  elbowL: [0.33, 0.56, 0.06],
  wristL: [0.22, 0.47, 0.25],
  elbowR: [-0.33, 0.56, 0.06],
  wristR: [-0.22, 0.47, 0.25],
});

/** Standing, right arm reaching forward to a surface in front of the chest. */
export const STAND_REACH: Pose = pose({
  lean: [0.05, 0, 0],
  elbowR: [-0.33, 0.66, 0.14],
  wristR: [-0.22, 0.78, 0.36],
});

/** Walk cycle on top of a standing pose (hands stay in the pouch). */
export function walking(phase: number): Pose {
  const leg = (offset: number, side: 1 | -1) => {
    const s = Math.sin(phase + offset);
    const lift = Math.max(0, Math.cos(phase + offset));
    const rest =
      side === 1
        ? { knee: REST.kneeL, ankle: REST.ankleL }
        : { knee: REST.kneeR, ankle: REST.ankleR };
    return {
      knee: [
        rest.knee[0],
        rest.knee[1] + lift * 0.02,
        rest.knee[2] + s * 0.07,
      ] as V,
      ankle: [
        rest.ankle[0],
        rest.ankle[1] + lift * 0.05,
        rest.ankle[2] + Math.sin(phase + offset - 0.5) * 0.1,
      ] as V,
    };
  };
  const l = leg(0, 1);
  const r = leg(Math.PI, -1);
  return pose({
    lift: Math.abs(Math.sin(phase)) * 0.02,
    lean: [0.04, Math.sin(phase) * 0.06, 0],
    kneeL: l.knee,
    ankleL: l.ankle,
    kneeR: r.knee,
    ankleR: r.ankle,
  });
}
