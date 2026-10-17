/**
 * Faithful port of the supplied "Jagged wobbly effect.html".
 *
 * Kept exactly as in the reference:
 *   - the outline points (corners chamfered with 0.4·r, 12-unit edge spacing),
 *   - the eight bite regions and their inward directions,
 *   - bite depth (edges 4.5–9, corners 3.5–7.5), width (edges 2–4 points,
 *     corners 1–2) and jitter (edges ±0.8, corners ±3.5 × jagged),
 *   - the centre-weighted falloff, the extra corner-neighbour pulls and the
 *     topLeft continuity nudge,
 *   - hold 160–280 ms, springs (in: k 200, damping 0.80; out: k 100, 0.87),
 *     dt clamped to 0.032 s, settle when speed < 0.4 after hold + 400 ms,
 *   - one bite at a time per key (`busy`), random 1.5–3.6 s intervals.
 *
 * Generalised only so a wider Space key can use the same construction:
 * for an 88×88 key the generator produces the reference's exact 28 points.
 */

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

export const WOBBLE = {
  stiffnessIn: 200,
  dampingIn: 0.8,
  stiffnessOut: 100,
  dampingOut: 0.87,
  holdMin: 0.16,
  holdMax: 0.28,
  settleSpeed: 0.4,
  settleDelay: 0.4,
  maxDt: 0.032,
  intervalMin: 1.5,
  intervalMax: 3.6,
} as const;

type RegionName =
  | "top"
  | "topRight"
  | "right"
  | "bottomRight"
  | "bottom"
  | "bottomLeft"
  | "left"
  | "topLeft";

const REGION_ORDER: RegionName[] = [
  "top",
  "topRight",
  "right",
  "bottomRight",
  "bottom",
  "bottomLeft",
  "left",
  "topLeft",
];

const DIRECTION: Record<RegionName, [number, number]> = {
  top: [0, 1],
  topRight: [-0.7, 0.7],
  right: [-1, 0],
  bottomRight: [-0.7, -0.7],
  bottom: [0, -1],
  bottomLeft: [0.7, -0.7],
  left: [1, 0],
  topLeft: [0.7, 0.7],
};

class SpringPoint {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  targetX: number;
  targetY: number;

  constructor(
    readonly ox: number,
    readonly oy: number,
  ) {
    this.x = ox;
    this.y = oy;
    this.targetX = ox;
    this.targetY = oy;
  }

  setTarget(tx: number, ty: number) {
    this.targetX = tx;
    this.targetY = ty;
  }

  resetTarget() {
    this.targetX = this.ox;
    this.targetY = this.oy;
  }

  /** Damped spring toward the target (reference integration). */
  step(stiffness: number, damping: number, dt: number) {
    const ax = (this.targetX - this.x) * stiffness;
    const ay = (this.targetY - this.y) * stiffness;
    this.vx = (this.vx + ax * dt) * damping;
    this.vy = (this.vy + ay * dt) * damping;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

/** Builds the outline exactly like the reference's `basePoints()`, for any key size. */
function buildOutline(width: number, height: number) {
  const x0 = 10;
  const y0 = 10;
  const x1 = width - 10;
  const y1 = height - 10;
  const r = 8;
  const interior = (from: number, to: number) => {
    const values: number[] = [];
    for (let v = from + 12; v < to - r - 1e-6; v += 12) values.push(v);
    return values;
  };
  const xs = interior(x0, x1);
  const ys = interior(y0, y1);

  const points: [number, number][] = [];
  const regions = {} as Record<RegionName, [number, number]>;
  const add = (name: RegionName, list: [number, number][]) => {
    regions[name] = [points.length, points.length + list.length - 1];
    points.push(...list);
  };

  add("top", [
    [x0 + r, y0],
    ...xs.map((x): [number, number] => [x, y0]),
    [x1 - r, y0],
  ]);
  add("topRight", [
    [x1 - r * 0.4, y0 + r * 0.4],
    [x1, y0 + r],
  ]);
  add("right", [...ys.map((y): [number, number] => [x1, y]), [x1, y1 - r]]);
  add("bottomRight", [
    [x1 - r * 0.4, y1 - r * 0.4],
    [x1 - r, y1],
  ]);
  add("bottom", [
    ...[...xs].reverse().map((x): [number, number] => [x, y1]),
    [x0 + r, y1],
  ]);
  add("bottomLeft", [
    [x0 + r * 0.4, y1 - r * 0.4],
    [x0, y1 - r],
  ]);
  add("left", [
    ...[...ys].reverse().map((y): [number, number] => [x0, y]),
    [x0, y0 + r],
  ]);
  add("topLeft", [[x0 + r * 0.4, y0 + r * 0.4]]);
  return { points, regions };
}

export class WobbleKey {
  private readonly points: SpringPoint[];
  private readonly regions: Record<RegionName, [number, number]>;
  private busy = false;
  private phase: "in" | "out" = "in";
  /** performance.now() of the trigger and of the previous frame, in ms (as in the reference). */
  private startTime = 0;
  private lastTime = 0;
  private holdMs = 0;

  constructor(width: number, height: number) {
    const outline = buildOutline(width, height);
    this.points = outline.points.map(([x, y]) => new SpringPoint(x, y));
    this.regions = outline.regions;
  }

  get isBusy() {
    return this.busy;
  }

  /** Push a random edge or corner inward, then let the springs bring it back. */
  trigger(now: number) {
    if (this.busy) return;
    this.busy = true;

    const region = REGION_ORDER[randInt(0, REGION_ORDER.length - 1)];
    const [start, end] = this.regions[region];
    const isCorner =
      region === "topLeft" ||
      region === "topRight" ||
      region === "bottomLeft" ||
      region === "bottomRight";

    // Edges a bit deeper and smoother, corners shallower but jagged.
    const depth = isCorner ? rand(3.5, 7.5) : rand(4.5, 9);
    const width = isCorner ? randInt(1, 2) : randInt(2, 4);
    const available = end - start + 1;
    const biteStart = start + randInt(0, Math.max(0, available - width));
    const [dx, dy] = DIRECTION[region];

    const applyPush = (idx: number, scale = 1, jagged = 0) => {
      const p = this.points[idx];
      const jitter = isCorner ? rand(-3.5, 3.5) * jagged : rand(-0.8, 0.8);
      p.setTarget(
        p.ox + dx * depth * scale + jitter,
        p.oy + dy * depth * scale + jitter,
      );
    };

    for (let i = 0; i < width; i++) {
      const idx = biteStart + i;
      if (idx > end) break;
      // Falloff so the middle of the bite is strongest.
      const t = width === 1 ? 1 : 1 - Math.abs(i - (width - 1) / 2) / width;
      applyPush(idx, 0.65 + t * 0.35, 1);
    }

    // topLeft also nudges the first top-edge point for continuity.
    if (region === "topLeft") applyPush(this.regions.top[0], 0.75, 1);

    // Corners get extra jagged offsets on neighbouring points.
    if (isCorner) {
      const neighbours: Record<string, [number, number]> = {
        topRight: [this.regions.top[1], this.regions.right[0]],
        bottomRight: [this.regions.right[1], this.regions.bottom[0]],
        bottomLeft: [this.regions.bottom[1], this.regions.left[0]],
        topLeft: [this.regions.left[1], this.regions.top[0] + 1],
      };
      for (const idx of neighbours[region]) {
        if (idx >= 0 && idx < this.points.length) applyPush(idx, 0.45, 1.4);
      }
    }

    this.phase = "in";
    this.startTime = now;
    this.lastTime = now;
    this.holdMs = rand(WOBBLE.holdMin, WOBBLE.holdMax) * 1000;
  }

  /**
   * Advances one animation frame (`now` = rAF timestamp). As in the reference,
   * dt is clamped to 32 ms while the hold/settle timers use wall-clock time.
   * Returns true while the key is still animating.
   */
  update(now: number): boolean {
    if (!this.busy) return false;
    const dt = Math.max(
      0,
      Math.min((now - this.lastTime) / 1000, WOBBLE.maxDt),
    );
    this.lastTime = now;
    const elapsed = now - this.startTime;

    if (this.phase === "in" && elapsed > this.holdMs) {
      this.phase = "out";
      this.points.forEach((p) => p.resetTarget());
    }
    const stiffness =
      this.phase === "in" ? WOBBLE.stiffnessIn : WOBBLE.stiffnessOut;
    const damping = this.phase === "in" ? WOBBLE.dampingIn : WOBBLE.dampingOut;

    let maxSpeed = 0;
    for (const p of this.points) {
      p.step(stiffness, damping, dt);
      maxSpeed = Math.max(maxSpeed, Math.abs(p.vx), Math.abs(p.vy));
    }

    // Keep going until everything has settled, then snap exactly to rest.
    if (
      this.phase === "out" &&
      maxSpeed < WOBBLE.settleSpeed &&
      elapsed > this.holdMs + WOBBLE.settleDelay * 1000
    ) {
      for (const p of this.points) {
        p.x = p.ox;
        p.y = p.oy;
        p.vx = 0;
        p.vy = 0;
      }
      this.busy = false;
    }
    return true;
  }

  toPath(): string {
    const pts = this.points;
    let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
    for (let i = 1; i < pts.length; i++)
      d += ` L${pts[i].x.toFixed(2)},${pts[i].y.toFixed(2)}`;
    return `${d} Z`;
  }
}

export function nextBiteDelay(): number {
  return rand(WOBBLE.intervalMin, WOBBLE.intervalMax);
}

/**
 * Initial stagger from the reference: `setTimeout(() => schedule(c), i·500 + rand(400, 1400))`,
 * after which `schedule` waits another `nextBiteDelay()` before the first bite.
 */
export function initialBiteDelay(index: number): number {
  return index * 0.5 + rand(0.4, 1.4);
}
