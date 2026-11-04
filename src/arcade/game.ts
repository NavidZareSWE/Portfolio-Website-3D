import { FONTS, THEME } from "@/theme/theme";
import { LEVELS, LEVEL_ROWS, type LevelData } from "./levels";

/**
 * ROOT RUN: a small side-scrolling platformer played on the arcade cabinet.
 *
 * You are the hacker. Your phone's battery is your health: five bars that
 * drain one by one, a battery pickup adds a bar, and a bug's bite or a fall costs a
 * chunk. Hacking a block (jumping into it from below) releases a root
 * patch: picking it up gives ROOT ACCESS, which absorbs the next bite.
 * Squash bugs by landing on them. Each level ends at the council's cave,
 * where the hacker takes the empty seat at the table.
 *
 * Units are tiles; y grows downward. Everything is drawn on a 2D canvas.
 */

export interface ArcadeInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Edges since the last update. */
  jumpPressed: boolean;
  confirmPressed: boolean;
}

/** Translated text drawn by the game. */
export interface ArcadeText {
  rtl: boolean;
  title: string;
  tagline: string;
  controls: string;
  start: string;
  level: string;
  levelNames: Record<LevelData["key"], string>;
  phone: string;
  root: string;
  died: string;
  retry: string;
  clear: string;
  clearSub: string;
  next: string;
  victory: string;
  victorySub: string;
  again: string;
}

type Phase =
  | "title"
  | "intro"
  | "playing"
  | "entering"
  | "seated"
  | "dead"
  | "victory";

const PHYS = {
  gravity: 40,
  jump: 19,
  /** Releasing jump while rising cuts the rest of the climb. */
  jumpCut: 0.45,
  run: 7,
  accel: 38,
  airAccel: 22,
  friction: 30,
  maxFall: 22,
  coyote: 0.09,
  buffer: 0.11,
};

const PLAYER_SIZE = { w: 0.72, h: 1.0 };
const BUG_SIZE = { w: 0.8, h: 0.56 };

const BATTERY = {
  /** Bars when full. */
  bars: 5,
  /** Seconds for one bar to drain away. */
  drainPerBar: 9,
  invulnerable: 1.4,
};

/**
 * Bar colour by how many bars are left (1 … 5), after the battery indicator
 * design by Rafał (codepen.io/Incorr3ct/pen/poBKwzY, MIT licence),
 * recoloured to the site's palette.
 */
const BAR_COLORS = [
  THEME.alert,
  "#ff8a3d",
  THEME.amber,
  "#a8f04a",
  THEME.green,
];

/**
 * The battery icon from that design: a thick rounded border, a cap on top,
 * and `max` bars stacked inside that fill from the bottom. (x, y) is the
 * top-left of the body; the cap sits above it. `fade` (0..1) dims the top
 * lit bar, so the bar that is draining can be seen going.
 */
export function drawBattery(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  lit: number,
  max: number,
  color: string,
  fade = 1,
) {
  const height = width / 0.55;
  const gap = width / 15;
  const radius = width / 22.5;
  const rounded = (
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    r: number,
  ) => {
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
    ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
    ctx.arcTo(rx, ry + rh, rx, ry, r);
    ctx.arcTo(rx, ry, rx + rw, ry, r);
    ctx.closePath();
  };
  ctx.fillStyle = color;
  // Cap: half the width, a third as tall, centred over the top.
  const capW = width / 2;
  rounded(x + (width - capW) / 2, y - width / 6, capW, capW / 3, radius);
  ctx.fill();
  // Border.
  ctx.lineWidth = gap;
  ctx.strokeStyle = color;
  rounded(x + gap / 2, y + gap / 2, width - gap, height - gap, radius);
  ctx.stroke();
  // Bars inside the border and its padding, filled from the bottom.
  const inner = gap * 2;
  const barH = (height - inner * 2 - gap * (max - 1)) / max;
  for (let i = 0; i < max; i++) {
    const fromBottom = max - 1 - i;
    if (fromBottom >= lit) continue;
    ctx.globalAlpha = fromBottom === lit - 1 ? Math.max(0.25, fade) : 1;
    ctx.fillRect(
      x + inner,
      y + inner + i * (barH + gap),
      width - inner * 2,
      barH,
    );
  }
  ctx.globalAlpha = 1;
}

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  grounded: boolean;
}

interface Bug extends Body {
  dir: number;
  alive: boolean;
  squashed: number;
}

interface Item {
  kind: "charge" | "patch";
  x: number;
  y: number;
  taken: boolean;
  /** Patches rise out of the block they came from. */
  rise: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const SOLID = new Set(["#", "=", "?", "x"]);

/** Deterministic noise for decoration (same tiles look the same every frame). */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class RootRun {
  private phase: Phase = "title";
  private levelIndex = 0;
  private tiles: string[][] = [];
  private width = 0;
  private player: Body = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ...PLAYER_SIZE,
    grounded: false,
  };
  private facing = 1;
  private bugs: Bug[] = [];
  private items: Item[] = [];
  private sparks: Spark[] = [];
  /** Charge in bars (0 … BATTERY.bars); the bar on top drains continuously. */
  private battery: number = BATTERY.bars;
  private rooted = false;
  private invulnerable = 0;
  private coyote = 0;
  private buffer = 0;
  private wasJumpHeld = false;
  private lastSafe = { x: 0, y: 0 };
  private caveX = 0;
  private seatX = 0;
  private camera = 0;
  private phaseTime = 0;
  private time = 0;
  private bugsFixed = 0;

  constructor(private readonly text: ArcadeText) {}

  /* ------------------------------------------------------------- set-up */

  private load(index: number) {
    const level = LEVELS[index];
    this.levelIndex = index;
    this.tiles = level.map.map((row) => row.split(""));
    this.width = this.tiles[0].length;
    this.bugs = [];
    this.items = [];
    this.sparks = [];
    for (let y = 0; y < LEVEL_ROWS; y++) {
      for (let x = 0; x < this.width; x++) {
        const ch = this.tiles[y][x];
        if (ch === "P") {
          this.player = {
            x: x + 0.14,
            y: y + 1 - PLAYER_SIZE.h,
            vx: 0,
            vy: 0,
            ...PLAYER_SIZE,
            grounded: false,
          };
          this.lastSafe = { x: this.player.x, y: this.player.y };
        } else if (ch === "e") {
          this.bugs.push({
            x: x + 0.1,
            y: y + 1 - BUG_SIZE.h,
            vx: 0,
            vy: 0,
            ...BUG_SIZE,
            grounded: false,
            dir: -1,
            alive: true,
            squashed: 0,
          });
        } else if (ch === "o") {
          this.items.push({
            kind: "charge",
            x: x + 0.5,
            y: y + 0.5,
            taken: false,
            rise: 0,
          });
        } else if (ch === "C") {
          this.caveX = x;
          this.seatX = x + 4.3;
        }
        if (ch !== "#" && ch !== "=" && ch !== "?") this.tiles[y][x] = ".";
      }
    }
    this.battery = BATTERY.bars;
    this.rooted = false;
    this.invulnerable = 0;
    this.facing = 1;
    this.camera = 0;
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /* ------------------------------------------------------------- update */

  update(dt: number, input: ArcadeInput) {
    this.time += dt;
    this.phaseTime += dt;
    this.updateSparks(dt);

    switch (this.phase) {
      case "title":
        if (input.confirmPressed || input.jumpPressed) {
          this.bugsFixed = 0;
          this.load(0);
          this.setPhase("intro");
        }
        return;
      case "intro":
        if (
          this.phaseTime > 1.6 ||
          (this.phaseTime > 0.3 && input.confirmPressed)
        )
          this.setPhase("playing");
        this.followCamera(1);
        return;
      case "dead":
        if (
          this.phaseTime > 0.6 &&
          (input.confirmPressed || input.jumpPressed)
        ) {
          this.load(this.levelIndex);
          this.setPhase("intro");
        }
        return;
      case "seated":
        if (
          this.phaseTime > 0.8 &&
          (input.confirmPressed || input.jumpPressed)
        ) {
          if (this.levelIndex + 1 < LEVELS.length) {
            this.load(this.levelIndex + 1);
            this.setPhase("intro");
          } else {
            this.setPhase("victory");
          }
        }
        return;
      case "victory":
        if (this.phaseTime > 1 && (input.confirmPressed || input.jumpPressed))
          this.setPhase("title");
        return;
      case "entering":
        this.walkToSeat(dt);
        this.followCamera(dt * 4);
        return;
      case "playing":
        this.play(dt, input);
        this.followCamera(dt * 6);
    }
  }

  private play(dt: number, input: ArcadeInput) {
    const p = this.player;

    // Battery drains all the time.
    this.battery -= dt / BATTERY.drainPerBar;
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    // Horizontal movement.
    const want = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (want !== 0) this.facing = want;
    const accel = p.grounded ? PHYS.accel : PHYS.airAccel;
    if (want !== 0) {
      p.vx += want * accel * dt;
      p.vx = Math.max(-PHYS.run, Math.min(PHYS.run, p.vx));
    } else if (p.grounded) {
      const slow = PHYS.friction * dt;
      p.vx = Math.abs(p.vx) <= slow ? 0 : p.vx - Math.sign(p.vx) * slow;
    }

    // Jumping: coyote time and a short input buffer, variable height.
    this.coyote = p.grounded ? PHYS.coyote : this.coyote - dt;
    this.buffer = input.jumpPressed ? PHYS.buffer : this.buffer - dt;
    if (this.buffer > 0 && this.coyote > 0) {
      p.vy = -PHYS.jump;
      p.grounded = false;
      this.coyote = 0;
      this.buffer = 0;
    }
    if (this.wasJumpHeld && !input.jump && p.vy < 0) p.vy *= PHYS.jumpCut;
    this.wasJumpHeld = input.jump;

    p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.gravity * dt);
    this.moveBody(p, dt, (tx, ty) => this.hack(tx, ty));
    if (p.x < 0) {
      p.x = 0;
      p.vx = 0;
    }

    // Remember where it was safe to stand (for falls).
    if (p.grounded) {
      const left = Math.floor(p.x);
      const right = Math.floor(p.x + p.w);
      const below = Math.floor(p.y + p.h + 0.05);
      if (this.isSolid(left, below) && this.isSolid(right, below))
        this.lastSafe = { x: p.x, y: p.y };
    }

    // Fell into a pit.
    if (p.y > LEVEL_ROWS + 1) {
      this.loseBar();
      p.x = this.lastSafe.x;
      p.y = this.lastSafe.y - 0.2;
      p.vx = 0;
      p.vy = 0;
      this.invulnerable = BATTERY.invulnerable;
    }

    this.updateBugs(dt);
    this.updateItems(dt);

    if (this.battery <= 0) {
      this.battery = 0;
      this.burst(p.x + p.w / 2, p.y + p.h / 2, THEME.alert, 22);
      this.setPhase("dead");
      return;
    }
    this.battery = Math.min(BATTERY.bars, this.battery);

    // Reached the council's cave.
    if (p.x > this.caveX + 1.2) {
      p.vx = 0;
      this.setPhase("entering");
    }
  }

  private walkToSeat(dt: number) {
    const p = this.player;
    this.facing = 1;
    if (p.x < this.seatX) {
      p.x = Math.min(this.seatX, p.x + 3 * dt);
    } else if (this.phaseTime > 0.2) {
      this.burst(p.x + 0.4, p.y + 0.4, THEME.green, 16);
      this.setPhase("seated");
    }
  }

  /** Axis-separated tile collision. `onBump` is called for a tile hit from below. */
  private moveBody(
    b: Body,
    dt: number,
    onBump?: (tx: number, ty: number) => void,
  ) {
    b.x += b.vx * dt;
    if (this.overlapsSolid(b)) {
      if (b.vx > 0) b.x = Math.floor(b.x + b.w) - b.w - 0.001;
      else if (b.vx < 0) b.x = Math.floor(b.x) + 1 + 0.001;
      b.vx = 0;
    }
    b.y += b.vy * dt;
    b.grounded = false;
    if (this.overlapsSolid(b)) {
      if (b.vy > 0) {
        b.y = Math.floor(b.y + b.h) - b.h - 0.001;
        b.grounded = true;
      } else if (b.vy < 0) {
        const ty = Math.floor(b.y);
        b.y = ty + 1 + 0.001;
        if (onBump) {
          const center = Math.floor(b.x + b.w / 2);
          onBump(center, ty);
        }
      }
      b.vy = 0;
    }
  }

  private isSolid(tx: number, ty: number): boolean {
    if (tx < 0) return true;
    if (ty < 0 || ty >= LEVEL_ROWS || tx >= this.width) return false;
    return SOLID.has(this.tiles[ty][tx]);
  }

  private overlapsSolid(b: Body): boolean {
    const x0 = Math.floor(b.x);
    const x1 = Math.floor(b.x + b.w);
    const y0 = Math.floor(b.y);
    const y1 = Math.floor(b.y + b.h);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) if (this.isSolid(x, y)) return true;
    }
    return false;
  }

  /** Jumping into a hack block from below releases a root patch. */
  private hack(tx: number, ty: number) {
    if (this.tiles[ty]?.[tx] !== "?") return;
    this.tiles[ty][tx] = "x";
    this.items.push({
      kind: "patch",
      x: tx + 0.5,
      y: ty + 0.5,
      taken: false,
      rise: 1,
    });
    this.burst(tx + 0.5, ty + 1, THEME.amber, 10);
  }

  private updateBugs(dt: number) {
    const p = this.player;
    for (const bug of this.bugs) {
      if (!bug.alive) {
        bug.squashed += dt;
        continue;
      }
      // Walk, turn at walls and at ledges (these bugs are easy).
      bug.vx = bug.dir * 1.8;
      bug.vy = Math.min(PHYS.maxFall, bug.vy + PHYS.gravity * dt);
      const before = bug.x;
      this.moveBody(bug, dt);
      if (bug.x === before || bug.vx === 0) bug.dir *= -1;
      if (bug.grounded) {
        const front =
          bug.dir > 0
            ? Math.floor(bug.x + bug.w + 0.05)
            : Math.floor(bug.x - 0.05);
        if (!this.isSolid(front, Math.floor(bug.y + bug.h + 0.1)))
          bug.dir *= -1;
      }
      if (bug.y > LEVEL_ROWS + 1) bug.alive = false;

      // Touching the player.
      if (!this.overlaps(p, bug)) continue;
      const stomp = p.vy > 0 && p.y + p.h - bug.y < 0.5;
      if (stomp) {
        bug.alive = false;
        p.vy = -11;
        this.bugsFixed++;
        this.burst(bug.x + bug.w / 2, bug.y + bug.h / 2, THEME.alert, 12);
      } else if (this.invulnerable <= 0) {
        if (this.rooted) this.rooted = false;
        else this.loseBar();
        this.invulnerable = BATTERY.invulnerable;
        p.vx = (p.x < bug.x ? -1 : 1) * 6;
        p.vy = -7;
      }
    }
  }

  private updateItems(dt: number) {
    const p = this.player;
    for (const item of this.items) {
      if (item.taken) continue;
      if (item.rise > 0) {
        const d = Math.min(item.rise, dt * 2.5);
        item.y -= d;
        item.rise -= d;
      }
      const dx = p.x + p.w / 2 - item.x;
      const dy = p.y + p.h / 2 - item.y;
      if (Math.abs(dx) < 0.7 && Math.abs(dy) < 0.8) {
        item.taken = true;
        if (item.kind === "charge") {
          this.addBar();
          this.burst(item.x, item.y, THEME.green, 8);
        } else {
          this.addBar();
          this.rooted = true;
          this.burst(item.x, item.y, THEME.amber, 14);
        }
      }
    }
  }

  /** Bars shown: the one that is draining still counts until it is empty. */
  private get bars(): number {
    return Math.max(0, Math.min(BATTERY.bars, Math.ceil(this.battery - 1e-6)));
  }

  /** A battery pickup adds one full bar (the draining one is topped up too). */
  private addBar() {
    this.battery = Math.min(BATTERY.bars, this.bars + 1);
  }

  /** A bite or a fall takes one bar. */
  private loseBar() {
    this.battery = Math.max(0, this.bars - 1);
  }

  private overlaps(a: Body, b: Body) {
    return (
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    );
  }

  private burst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + hash(i, this.time) * 0.6;
      const speed = 2 + hash(this.time, i) * 4;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 0.5 + hash(i, i) * 0.4,
        color,
      });
    }
  }

  private updateSparks(dt: number) {
    for (const s of this.sparks) {
      s.life -= dt;
      s.vy += 14 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  private viewWidth = 24;

  private followCamera(rate: number) {
    const target = this.player.x + this.player.w / 2 - this.viewWidth * 0.4;
    const max = Math.max(0, this.width - this.viewWidth);
    const goal = Math.min(max, Math.max(0, target));
    this.camera += (goal - this.camera) * Math.min(1, rate);
  }

  /* ------------------------------------------------------------- render */

  render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const tile = height / LEVEL_ROWS;
    this.tilePx = tile;
    this.viewWidth = width / tile;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    this.drawBackground(ctx, width, height, tile);

    if (this.phase !== "title" && this.tiles.length > 0) {
      ctx.save();
      ctx.translate(-this.camera * tile, 0);
      ctx.scale(tile, tile);
      this.drawTiles(ctx);
      this.drawCave(ctx);
      this.drawItems(ctx);
      this.drawBugs(ctx);
      if (this.phase !== "dead") this.drawPlayer(ctx);
      this.drawSparks(ctx);
      ctx.restore();
      this.drawHud(ctx, width, tile);
    }
    this.drawScreens(ctx, width, height, tile);
    ctx.restore();
  }

  private font(size: number, weight = 700) {
    return `${weight} ${Math.round(size)}px ${FONTS.mono}`;
  }

  /** Pixels per tile in the current frame. */
  private tilePx = 1;

  /**
   * Text inside the tile-scaled world. Fonts are drawn in screen pixels (tiny
   * fractional font sizes under a scale transform round to nothing).
   */
  private worldText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    size: number,
    weight = 700,
  ) {
    const px = this.tilePx;
    ctx.save();
    ctx.scale(1 / px, 1 / px);
    ctx.font = this.font(size * px, weight);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x * px, y * px);
    ctx.restore();
  }

  private drawBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    tile: number,
  ) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#03070d");
    gradient.addColorStop(1, "#061a1f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    // Far skyline and slow glyph columns (parallax).
    const far = this.camera * tile * 0.25;
    ctx.fillStyle = "rgba(27, 143, 136, 0.12)";
    for (let i = -1; i < width / (tile * 1.6) + 2; i++) {
      const col = i + Math.floor(far / (tile * 1.6));
      const h = (2 + hash(col, 3) * 5) * tile;
      ctx.fillRect(
        col * tile * 1.6 - far,
        height - tile * 2 - h,
        tile * 1.3,
        h,
      );
    }
    ctx.font = this.font(tile * 0.45, 500);
    ctx.fillStyle = "rgba(95, 240, 255, 0.07)";
    const mid = this.camera * tile * 0.5;
    for (let i = 0; i < width / tile + 2; i++) {
      const col = i + Math.floor(mid / tile);
      const fall = (this.time * (0.6 + hash(col, 1)) + hash(col, 2) * 20) % 16;
      for (let k = 0; k < 4; k++) {
        const ch = hash(col, k + Math.floor(fall)) > 0.5 ? "1" : "0";
        ctx.fillText(ch, col * tile - mid, (fall - k) * tile);
      }
    }
  }

  private drawTiles(ctx: CanvasRenderingContext2D) {
    const x0 = Math.max(0, Math.floor(this.camera) - 1);
    const x1 = Math.min(
      this.width - 1,
      Math.ceil(this.camera + this.viewWidth) + 1,
    );
    for (let y = 0; y < LEVEL_ROWS; y++) {
      for (let x = x0; x <= x1; x++) {
        const ch = this.tiles[y][x];
        if (ch === "#") {
          const top = !this.isSolid(x, y - 1);
          ctx.fillStyle = top ? "#0e3f3c" : "#082826";
          ctx.fillRect(x, y, 1, 1);
          ctx.fillStyle = "rgba(63, 224, 207, 0.35)";
          this.worldText(
            ctx,
            hash(x, y) > 0.5 ? "1" : "0",
            x + 0.5,
            y + 0.55,
            0.42,
            600,
          );
          if (top) {
            ctx.fillStyle = THEME.teal;
            ctx.fillRect(x, y, 1, 0.08);
          }
        } else if (ch === "=") {
          ctx.fillStyle = "#0a2f3a";
          ctx.fillRect(x, y, 1, 0.55);
          ctx.fillStyle = THEME.cyan;
          ctx.fillRect(x, y, 1, 0.07);
          ctx.fillRect(x, y + 0.48, 1, 0.04);
        } else if (ch === "?" || ch === "x") {
          const fresh = ch === "?";
          const pulse = fresh ? 0.75 + 0.25 * Math.sin(this.time * 5 + x) : 1;
          ctx.fillStyle = fresh ? `rgba(255, 181, 71, ${pulse})` : "#2a3a3d";
          ctx.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
          ctx.fillStyle = fresh ? "#2a1600" : "#56676a";
          this.worldText(ctx, fresh ? "</>" : "x", x + 0.5, y + 0.52, 0.4, 800);
        }
      }
    }
  }

  private drawCave(ctx: CanvasRenderingContext2D) {
    const x = this.caveX;
    const ground = LEVEL_ROWS - 2;
    // Rock arch.
    ctx.fillStyle = "#0b1b22";
    ctx.beginPath();
    ctx.moveTo(x - 0.5, ground);
    ctx.quadraticCurveTo(x + 3.5, ground - 7.5, x + 8, ground);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(63, 224, 207, 0.6)";
    ctx.lineWidth = 0.08;
    ctx.stroke();
    // Inside: a glow from the table's screens.
    ctx.fillStyle = "rgba(61, 255, 122, 0.08)";
    ctx.fillRect(x + 1.5, ground - 3.4, 5, 3.4);
    // Table and screens.
    ctx.fillStyle = "#2a3d44";
    ctx.fillRect(x + 1.8, ground - 1.0, 4.6, 0.18);
    ctx.fillRect(x + 2.0, ground - 0.82, 0.12, 0.82);
    ctx.fillRect(x + 6.1, ground - 0.82, 0.12, 0.82);
    for (const sx of [2.3, 3.6, 4.9]) {
      ctx.fillStyle = THEME.green;
      ctx.fillRect(x + sx, ground - 1.5, 0.6, 0.45);
    }
    // The council: hooded members with white masks, and the empty seat.
    const member = (mx: number, sitting: boolean) => {
      ctx.fillStyle = "#151b2b";
      ctx.beginPath();
      ctx.arc(mx, ground - 1.7, 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(mx - 0.32, ground - 1.4, 0.64, sitting ? 0.6 : 1.4);
      ctx.fillStyle = "#e9f1f2";
      ctx.beginPath();
      ctx.ellipse(mx, ground - 1.68, 0.17, 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#151b2b";
      ctx.fillRect(mx - 0.1, ground - 1.75, 0.07, 0.04);
      ctx.fillRect(mx + 0.03, ground - 1.75, 0.07, 0.04);
    };
    member(x + 2.6, true);
    member(x + 3.5, true);
    member(x + 5.4, true);
    // Seat waiting at x + 4.3 (drawn as a stool).
    ctx.fillStyle = "#3a4d55";
    ctx.fillRect(this.seatX - 0.25, ground - 0.55, 0.5, 0.1);
    ctx.fillRect(this.seatX - 0.05, ground - 0.45, 0.1, 0.45);
  }

  private drawItems(ctx: CanvasRenderingContext2D) {
    for (const item of this.items) {
      if (item.taken) continue;
      const bob = Math.sin(this.time * 4 + item.x) * 0.08;
      const x = item.x;
      const y = item.y + bob;
      if (item.kind === "charge") {
        // A battery with one lit bar: picking it up adds that bar.
        drawBattery(ctx, x - 0.2, y - 0.34, 0.4, 1, 1, THEME.green);
      } else {
        // The root patch: a glowing chip.
        ctx.shadowColor = THEME.amber;
        ctx.shadowBlur = 0.4;
        ctx.fillStyle = THEME.amber;
        ctx.fillRect(x - 0.3, y - 0.3, 0.6, 0.6);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#2a1600";
        this.worldText(ctx, "su", x, y + 0.02, 0.28, 800);
        ctx.fillStyle = THEME.amber;
        for (let k = -1; k <= 1; k++) {
          ctx.fillRect(x - 0.42, y + k * 0.16 - 0.03, 0.1, 0.06);
          ctx.fillRect(x + 0.32, y + k * 0.16 - 0.03, 0.1, 0.06);
        }
      }
    }
  }

  private drawBugs(ctx: CanvasRenderingContext2D) {
    for (const bug of this.bugs) {
      if (!bug.alive && bug.squashed > 0.6) continue;
      const cx = bug.x + bug.w / 2;
      const flat = !bug.alive;
      const bodyH = flat ? 0.12 : 0.26;
      const cy = bug.y + bug.h - bodyH - 0.12;
      ctx.globalAlpha = flat ? 1 - bug.squashed / 0.6 : 1;
      ctx.strokeStyle = "#7a0f1b";
      ctx.lineWidth = 0.05;
      if (!flat) {
        const step = Math.sin(this.time * 18 + bug.x * 3) * 0.08;
        for (const k of [-0.22, 0, 0.22]) {
          ctx.beginPath();
          ctx.moveTo(cx + k, cy + 0.1);
          ctx.lineTo(cx + k - 0.1 + step, bug.y + bug.h);
          ctx.moveTo(cx + k, cy + 0.1);
          ctx.lineTo(cx + k + 0.1 - step, bug.y + bug.h);
          ctx.stroke();
        }
      }
      ctx.fillStyle = THEME.alert;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 0.1, 0.38, bodyH, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!flat) {
        ctx.fillStyle = "#fff";
        const eye = bug.dir > 0 ? 0.2 : -0.2;
        ctx.fillRect(cx + eye - 0.06, cy - 0.02, 0.07, 0.07);
        ctx.fillRect(cx + eye + 0.04, cy - 0.02, 0.07, 0.07);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    const blink = this.invulnerable > 0 && Math.floor(this.time * 14) % 2 === 0;
    if (blink) return;
    const cx = p.x + p.w / 2;
    const seated = this.phase === "seated";
    const bottom = p.y + p.h - (seated ? 0.35 : 0);
    if (this.rooted) {
      ctx.strokeStyle = "rgba(61, 255, 122, 0.8)";
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.ellipse(cx, bottom - 0.5, 0.55, 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Legs and sneakers.
    const running =
      p.grounded && Math.abs(p.vx) > 0.5 && this.phase === "playing";
    const stride = running ? Math.sin(this.time * 16) * 0.12 : 0;
    ctx.fillStyle = "#1a2030";
    ctx.fillRect(cx - 0.22 + stride, bottom - 0.32, 0.16, 0.28);
    ctx.fillRect(cx + 0.06 - stride, bottom - 0.32, 0.16, 0.28);
    ctx.fillStyle = "#e9fdff";
    ctx.fillRect(cx - 0.26 + stride, bottom - 0.08, 0.22, 0.08);
    ctx.fillRect(cx + 0.04 - stride, bottom - 0.08, 0.22, 0.08);
    // Hoodie body with the green logo.
    ctx.fillStyle = "#222a3e";
    ctx.fillRect(cx - 0.3, bottom - 0.72, 0.6, 0.44);
    ctx.fillStyle = THEME.green;
    ctx.fillRect(cx - 0.06 + this.facing * 0.05, bottom - 0.6, 0.12, 0.12);
    // Hood, with the face in shadow and two eyes on the facing side.
    ctx.fillStyle = "#1b2236";
    ctx.beginPath();
    ctx.arc(cx, bottom - 0.84, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#070a12";
    ctx.beginPath();
    ctx.arc(cx + this.facing * 0.08, bottom - 0.82, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = THEME.cyan;
    ctx.fillRect(cx + this.facing * 0.06 - 0.07, bottom - 0.86, 0.05, 0.05);
    ctx.fillRect(cx + this.facing * 0.06 + 0.04, bottom - 0.86, 0.05, 0.05);
  }

  private drawSparks(ctx: CanvasRenderingContext2D) {
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.min(1, s.life * 2);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 0.05, s.y - 0.05, 0.1, 0.1);
    }
    ctx.globalAlpha = 1;
  }

  private drawHud(ctx: CanvasRenderingContext2D, width: number, tile: number) {
    const pad = tile * 0.4;
    // The phone: its battery is your health, one bar per pickup.
    const bars = this.bars;
    const color = BAR_COLORS[Math.max(0, bars - 1)];
    const bw = tile * 0.82;
    const bh = bw / 0.55;
    ctx.fillStyle = "rgba(4, 12, 18, 0.85)";
    ctx.fillRect(pad, pad, bw + tile * 4.6, bh + tile * 0.55);
    const low = bars <= 1 && Math.floor(this.time * 4) % 2 === 0;
    const draining = this.battery - Math.floor(this.battery - 1e-6);
    drawBattery(
      ctx,
      pad + tile * 0.28,
      pad + tile * 0.35,
      bw,
      low ? 0 : bars,
      BATTERY.bars,
      color,
      draining,
    );
    const pw = bw + tile * 0.3;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = THEME.muted;
    ctx.font = this.font(tile * 0.34, 600);
    ctx.fillText(this.text.phone, pad + pw + tile * 0.4, pad + tile * 0.5);
    ctx.fillStyle = color;
    ctx.font = this.font(tile * 0.62, 800);
    ctx.fillText(
      `${bars}/${BATTERY.bars}`,
      pad + pw + tile * 0.4,
      pad + tile * 1.15,
    );
    if (this.rooted) {
      ctx.fillStyle = THEME.amber;
      ctx.font = this.font(tile * 0.36, 800);
      ctx.fillText(this.text.root, pad + pw + tile * 2.2, pad + tile * 1.15);
    }
    // Level and bugs fixed, top right.
    ctx.textAlign = "right";
    ctx.fillStyle = THEME.cyan;
    ctx.font = this.font(tile * 0.4, 700);
    const name = this.text.levelNames[LEVELS[this.levelIndex].key];
    ctx.fillText(
      `${this.text.level} ${this.levelIndex + 1}/${LEVELS.length} · ${name}`,
      width - pad,
      pad + tile * 0.4,
    );
    ctx.fillStyle = THEME.alert;
    ctx.fillText(`ж ${this.bugsFixed}`, width - pad, pad + tile * 1.0);
  }

  private drawScreens(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    tile: number,
  ) {
    const center = (
      lines: { text: string; size: number; color: string }[],
      dim = 0.6,
    ) => {
      ctx.fillStyle = `rgba(2, 6, 10, ${dim})`;
      ctx.fillRect(0, 0, width, height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.direction = this.text.rtl ? "rtl" : "ltr";
      const total = lines.reduce((n, l) => n + l.size * 1.5, 0);
      let y = height / 2 - (total * tile) / 2;
      for (const line of lines) {
        y += (line.size * 1.5 * tile) / 2;
        ctx.font = this.font(line.size * tile, 800);
        ctx.fillStyle = line.color;
        ctx.shadowColor = line.color;
        ctx.shadowBlur = tile * 0.3;
        const fit = Math.min(
          1,
          (width * 0.9) / Math.max(1, ctx.measureText(line.text).width),
        );
        ctx.save();
        ctx.translate(width / 2, y);
        ctx.scale(fit, fit);
        ctx.fillText(line.text, 0, 0);
        ctx.restore();
        ctx.shadowBlur = 0;
        y += (line.size * 1.5 * tile) / 2;
      }
      ctx.direction = "ltr";
    };
    const blink = Math.floor(this.time * 2) % 2 === 0;
    const t = this.text;
    switch (this.phase) {
      case "title":
        center(
          [
            { text: t.title, size: 1.5, color: THEME.cyan },
            { text: t.tagline, size: 0.42, color: THEME.ink },
            { text: t.controls, size: 0.36, color: THEME.muted },
            { text: blink ? t.start : " ", size: 0.45, color: THEME.amber },
          ],
          0.2,
        );
        break;
      case "intro":
        center(
          [
            {
              text: `${t.level} ${this.levelIndex + 1}`,
              size: 0.5,
              color: THEME.muted,
            },
            {
              text: t.levelNames[LEVELS[this.levelIndex].key],
              size: 1.1,
              color: THEME.green,
            },
          ],
          Math.max(0, 0.7 - this.phaseTime * 0.4),
        );
        break;
      case "dead":
        center([
          { text: t.died, size: 1.1, color: THEME.alert },
          { text: blink ? t.retry : " ", size: 0.42, color: THEME.amber },
        ]);
        break;
      case "seated":
        center(
          [
            { text: t.clear, size: 1.0, color: THEME.green },
            { text: t.clearSub, size: 0.42, color: THEME.ink },
            {
              text: blink
                ? this.levelIndex + 1 < LEVELS.length
                  ? t.next
                  : t.again
                : " ",
              size: 0.42,
              color: THEME.amber,
            },
          ],
          0.45,
        );
        break;
      case "victory":
        center(
          [
            { text: t.victory, size: 0.95, color: THEME.green },
            { text: t.victorySub, size: 0.45, color: THEME.ink },
            { text: `ж ${this.bugsFixed}`, size: 0.5, color: THEME.alert },
            { text: blink ? t.again : " ", size: 0.42, color: THEME.amber },
          ],
          0.55,
        );
        break;
    }
  }
}
