import { shortHash } from "@/content/commitHash";
import { CARD_LAYOUT } from "../cards/CardRegistry";
import { WORLD } from "../config";
import { FloorDecals, cellAt, type GlyphStyle } from "../effects/FloorDecals";
import type { TimelineCommit } from "../labels";
import { DISTRICT_LAYOUT, type LayoutPoint, type LayoutRect } from "./layout";

/**
 * District floors: each section's corner of the world gets its own pattern
 * written into the ASCII floor (see effects/FloorDecals.ts). Positions are
 * screen-aligned layout units (right, up), the same as CARD_LAYOUT. The
 * readable text that goes with them (commit labels, the blueprint's title)
 * is drawn as crisp floor labels by vignettes/DistrictLabels.ts, from the
 * same layout computed here.
 *
 *   Experience  a `git log --graph`: main, one branch per role, an education branch
 *   Projects    a blueprint sheet with the plan of the building being built
 *   About       a woven rug (the plants beside it are props, CozyCorner.ts)
 */

const CELL = WORLD.cellSize;

/** Centre of floor cell (cx, cy) in layout units. */
export const cellCenter = (cx: number, cy: number): LayoutPoint => ({
  right: (cx + 0.5) * CELL,
  up: (cy + 0.5) * CELL,
});

function nearCard(cx: number, cy: number): boolean {
  const p = cellCenter(cx, cy);
  return Object.values(CARD_LAYOUT).some(
    (card) =>
      Math.hypot(p.right - card.right, p.up - card.up) <
      DISTRICT_LAYOUT.cardClearance,
  );
}

/** Cells of a layout rectangle, inclusive. */
function cellRect(rect: LayoutRect) {
  const [x0, y0] = cellAt(rect.left, rect.bottom);
  const [x1, y1] = cellAt(rect.right, rect.top);
  return { x0, y0, x1, y1 };
}

/* -------------------------------------------------------------------------- */
/* Experience: git log --graph                                                */
/* -------------------------------------------------------------------------- */

/** Graph columns (cells right of the main lane). */
export const GRAPH_LANES = { main: 0, work: 2, edu: 4 } as const;
/** Commit labels start this many cells right of the main lane. */
export const GRAPH_LABEL_COLUMN = 6;

export type GraphCommitKind = "head" | "merge" | "work" | "edu" | "root";

export interface GraphCommit {
  kind: GraphCommitKind;
  hash: string;
  period: string;
  title: string;
  org: string;
}

export interface GraphRow {
  /** Floor cell row. */
  cy: number;
  /** Characters by column offset from the main lane. */
  cells: [number, string][];
  commit?: GraphCommit;
}

export interface GitGraph {
  /** Floor cell column of the main lane. */
  lane: number;
  /** Cell row just above the first commit (for the legend). */
  top: number;
  rows: GraphRow[];
}

const FALLBACK_COMMITS: TimelineCommit[] = [
  { id: "role-3", year: "3", education: false, period: "", title: "", org: "" },
  { id: "edu-2", year: "2", education: true, period: "", title: "", org: "" },
  { id: "role-2", year: "2", education: false, period: "", title: "", org: "" },
  { id: "edu-1", year: "1", education: true, period: "", title: "", org: "" },
  { id: "role-1", year: "1", education: false, period: "", title: "", org: "" },
];

/**
 * Lays the résumé out the way `git log --graph` would draw it, newest first:
 *
 *   *        HEAD -> main
 *   |\
 *   | \      the education branch runs down the right-hand lane
 *   *  |     merge: role C into main
 *   |\ |
 *   | *|     role C (its own branch off main)
 *   |/ |
 *   |  *     degree
 *   | /      the education branch forks off main here
 *   *        initial commit
 *
 * Each role is a short branch that forks from main and merges back; the
 * degrees sit on one long-running branch. Spacer rows spread the graph over
 * the rows available in DISTRICT_LAYOUT.gitGraph.
 */
export function buildGitGraph(timeline: readonly TimelineCommit[]): GitGraph {
  const entries = timeline.length > 0 ? timeline : FALLBACK_COMMITS;
  const sorted = entries
    .map((commit, order) => ({ commit, order }))
    .sort((a, b) => {
      const ya = Number(a.commit.year) || 0;
      const yb = Number(b.commit.year) || 0;
      return yb - ya || a.order - b.order;
    })
    .map(({ commit }) => commit);

  const { main, work, edu } = GRAPH_LANES;
  type Row = { cells: [number, string][]; commit?: GraphCommit };
  /** Each block is followed by spacer rows on the lanes still open after it. */
  const blocks: { rows: Row[]; open: number[] }[] = [];
  const commitOf = (c: TimelineCommit, kind: GraphCommitKind): GraphCommit => ({
    kind,
    hash: shortHash(c.id),
    period: c.period,
    title: c.title,
    org: c.org,
  });

  let remainingEdu = sorted.filter((c) => c.education).length;
  let eduOpen = false;
  const eduLane = (): [number, string][] => (eduOpen ? [[edu, "|"]] : []);

  const head: Row[] = [
    {
      cells: [[main, "*"]],
      commit: {
        kind: "head",
        hash: shortHash("HEAD"),
        period: "",
        title: "",
        org: "",
      },
    },
  ];
  if (remainingEdu > 0) {
    // The education branch merges into HEAD: a diagonal out to its lane.
    head.push({
      cells: [
        [main, "|"],
        [1, "\\"],
      ],
    });
    head.push({
      cells: [
        [main, "|"],
        [2, "\\"],
      ],
    });
    head.push({
      cells: [
        [main, "|"],
        [3, "\\"],
      ],
    });
    eduOpen = true;
  }
  blocks.push({ rows: head, open: eduOpen ? [main, edu] : [main] });

  for (const entry of sorted) {
    const block: Row[] = [];
    if (!entry.education) {
      block.push({
        cells: [[main, "*"], ...eduLane()],
        commit: {
          kind: "merge",
          hash: shortHash(`merge:${entry.id}`),
          period: "",
          title: entry.title,
          org: "",
        },
      });
      block.push({ cells: [[main, "|"], [1, "\\"], ...eduLane()] });
      block.push({
        cells: [[main, "|"], [work, "*"], ...eduLane()],
        commit: commitOf(entry, "work"),
      });
      block.push({ cells: [[main, "|"], [1, "/"], ...eduLane()] });
    } else {
      block.push({
        cells: [
          [main, "|"],
          [edu, "*"],
        ],
        commit: commitOf(entry, "edu"),
      });
      remainingEdu--;
      if (remainingEdu === 0) {
        // The education branch forks off main below its oldest commit.
        block.push({
          cells: [
            [main, "|"],
            [3, "/"],
          ],
        });
        block.push({
          cells: [
            [main, "|"],
            [2, "/"],
          ],
        });
        block.push({
          cells: [
            [main, "|"],
            [1, "/"],
          ],
        });
        eduOpen = false;
      }
    }
    blocks.push({ rows: block, open: eduOpen ? [main, edu] : [main] });
  }
  blocks.push({
    rows: [
      {
        cells: [[main, "*"]],
        commit: {
          kind: "root",
          hash: "000000",
          period: "",
          title: "",
          org: "",
        },
      },
    ],
    open: [],
  });

  const layout = DISTRICT_LAYOUT.gitGraph;
  const [lane, top] = cellAt(layout.right, layout.top);
  const [, bottom] = cellAt(layout.right, layout.bottom);
  const used = blocks.reduce((n, b) => n + b.rows.length, 0);
  const gaps = Math.max(1, blocks.length - 1);
  const gap = Math.max(
    1,
    Math.min(3, Math.floor((top - bottom + 1 - used) / gaps)),
  );

  const rows: GraphRow[] = [];
  let cy = top;
  blocks.forEach((block) => {
    for (const row of block.rows) rows.push({ cy: cy--, ...row });
    // Spacer rows: every lane still open continues straight down.
    if (block.open.length === 0) return;
    for (let g = 0; g < gap; g++)
      rows.push({
        cy: cy--,
        cells: block.open.map((col): [number, string] => [col, "|"]),
      });
  });
  return { lane, top: top + 1, rows };
}

function paintGitGraph(decals: FloorDecals, graph: GitGraph) {
  const lane: GlyphStyle = { level: 0.9, color: "cyan", anim: "flowUp" };
  const branch: GlyphStyle = { level: 0.85, color: "blue" };
  const commit: GlyphStyle = { level: 1, color: "green" };
  for (const row of graph.rows) {
    for (const [col, char] of row.cells) {
      const style =
        char === "*" ? commit : col === GRAPH_LANES.main ? lane : branch;
      decals.glyph(graph.lane + col, row.cy, char, style);
    }
  }
  // Quiet the circuit under the graph and its labels so they read cleanly.
  const first = graph.rows[0]?.cy ?? graph.top;
  const last = graph.rows[graph.rows.length - 1]?.cy ?? graph.top;
  for (let cy = last - 1; cy <= first + 3; cy++) {
    for (let cx = graph.lane - 2; cx <= graph.lane + 26; cx++) {
      if (!nearCard(cx, cy)) decals.mute(cx, cy);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Projects: blueprint sheet                                                  */
/* -------------------------------------------------------------------------- */

/** Where the blueprint's readable labels go (layout units), for DistrictLabels. */
export interface BlueprintSpots {
  title: LayoutPoint;
  titleBlock: LayoutPoint;
  rooms: { at: LayoutPoint; index: number }[];
  north: LayoutPoint;
  width: number;
}

function blueprintCells() {
  const s = cellRect(DISTRICT_LAYOUT.blueprint);
  // The building plan: a box with an inner wall, inside the sheet's margins.
  const plan = { x0: s.x0 + 3, x1: s.x0 + 20, y0: s.y0 + 3, y1: s.y1 - 3 };
  const wall = Math.round((plan.x0 + plan.x1) / 2) + 1;
  const block = { x0: s.x1 - 9, x1: s.x1 - 2, y0: s.y0 + 2, y1: s.y0 + 6 };
  return { s, plan, wall, block };
}

export function blueprintSpots(): BlueprintSpots {
  const { s, plan, wall, block } = blueprintCells();
  const at = (cx: number, cy: number) => cellCenter(cx, cy);
  return {
    title: at(s.x0 + 2, s.y1 - 1),
    titleBlock: at((block.x0 + block.x1) / 2, (block.y0 + block.y1) / 2),
    rooms: [
      { at: at((plan.x0 + wall) / 2, (plan.y0 + plan.y1) / 2), index: 0 },
      { at: at((wall + plan.x1) / 2, (plan.y0 + plan.y1) / 2), index: 1 },
    ],
    north: at(block.x0 + 3, s.y1 - 3),
    width: (s.x1 - s.x0 + 1) * CELL,
  };
}

function paintBlueprint(decals: FloorDecals) {
  const { s, plan, wall, block } = blueprintCells();
  const paper: GlyphStyle = { level: 0.18, color: "blue" };
  const grid: GlyphStyle = { level: 0.36, color: "blue" };
  const margin: GlyphStyle = { level: 0.6, color: "blue" };
  const frame: GlyphStyle = { level: 0.95, color: "cyan" };
  const walls: GlyphStyle = { level: 1, color: "cyan" };
  const window: GlyphStyle = { level: 0.8, color: "teal" };
  const dimension: GlyphStyle = { level: 0.75, color: "cyan" };
  const figure: GlyphStyle = { level: 1, color: "green" };

  // The sheet: dotted blue paper, a grid every four cells, a double frame.
  for (let cy = s.y0 - 1; cy <= s.y1 + 1; cy++) {
    for (let cx = s.x0 - 1; cx <= s.x1 + 1; cx++) decals.mute(cx, cy);
  }
  for (let cy = s.y0; cy <= s.y1; cy++) {
    for (let cx = s.x0; cx <= s.x1; cx++) {
      const ex = cx === s.x0 || cx === s.x1;
      const ey = cy === s.y0 || cy === s.y1;
      const ix = cx === s.x0 + 1 || cx === s.x1 - 1;
      const iy = cy === s.y0 + 1 || cy === s.y1 - 1;
      if (ex && ey) decals.glyph(cx, cy, "+", frame);
      else if (ey) decals.glyph(cx, cy, "=", frame);
      else if (ex) decals.glyph(cx, cy, "|", frame);
      else if (ix || iy)
        decals.glyph(cx, cy, ix && iy ? "+" : ix ? ":" : "-", margin);
      else if ((cx - s.x0) % 4 === 0 && (cy - s.y0) % 4 === 0)
        decals.glyph(cx, cy, "+", grid);
      else decals.glyph(cx, cy, ".", paper);
    }
  }
  // Folded top-right corner.
  decals.glyph(s.x1, s.y1, "/", frame);
  decals.glyph(s.x1 - 1, s.y1, "/", frame);

  // The plan: outer walls (#), an inner wall with a doorway, an entrance with
  // its door swing, and windows (=) along the top wall.
  for (let cx = plan.x0; cx <= plan.x1; cx++) {
    decals.glyph(cx, plan.y1, "#", walls);
    decals.glyph(cx, plan.y0, "#", walls);
  }
  for (let cy = plan.y0; cy <= plan.y1; cy++) {
    decals.glyph(plan.x0, cy, "#", walls);
    decals.glyph(plan.x1, cy, "#", walls);
  }
  const midY = Math.round((plan.y0 + plan.y1) / 2);
  for (let cy = plan.y0 + 1; cy < plan.y1; cy++) {
    if (cy !== midY) decals.glyph(wall, cy, "#", walls);
  }
  for (const cx of [plan.x0 + 3, plan.x0 + 4, plan.x1 - 4, plan.x1 - 3]) {
    decals.glyph(cx, plan.y1, "=", window);
  }
  const door = plan.x0 + 2;
  decals.glyph(door + 1, plan.y0, ".", paper);
  decals.glyph(door + 2, plan.y0, ".", paper);
  decals.glyph(door + 1, plan.y0 + 1, "/", dimension);

  // Dimension lines: the width under the plan, the depth beside it.
  const dimY = plan.y0 - 2;
  for (let cx = plan.x0; cx <= plan.x1; cx++)
    decals.glyph(cx, dimY, "-", dimension);
  decals.glyph(plan.x0, dimY, "|", dimension);
  decals.glyph(plan.x0 + 1, dimY, "<", dimension);
  decals.glyph(plan.x1 - 1, dimY, ">", dimension);
  decals.glyph(plan.x1, dimY, "|", dimension);
  const width = ((plan.x1 - plan.x0 + 1) * CELL * 10).toFixed(1);
  const midX = Math.round((plan.x0 + plan.x1) / 2 - width.length / 2);
  decals.text(midX - 1, dimY, ` ${width} `.replace(/ /g, "."), paper);
  decals.text(midX, dimY, width, figure);

  const dimX = plan.x1 + 2;
  for (let cy = plan.y0; cy <= plan.y1; cy++)
    decals.glyph(dimX, cy, "|", dimension);
  decals.glyph(dimX, plan.y1, "^", dimension);
  decals.glyph(dimX, plan.y0, "+", dimension);
  const depth = ((plan.y1 - plan.y0 + 1) * CELL * 10).toFixed(1);
  decals.text(dimX + 1, midY, depth, figure);

  // Title block (its text is a floor label).
  for (let cx = block.x0; cx <= block.x1; cx++) {
    decals.glyph(cx, block.y0, "-", frame);
    decals.glyph(cx, block.y1, "-", frame);
  }
  for (let cy = block.y0; cy <= block.y1; cy++) {
    decals.glyph(block.x0, cy, "|", frame);
    decals.glyph(block.x1, cy, "|", frame);
  }
  for (const [cx, cy] of [
    [block.x0, block.y0],
    [block.x1, block.y0],
    [block.x0, block.y1],
    [block.x1, block.y1],
  ])
    decals.glyph(cx, cy, "+", frame);
  for (let cy = block.y0 + 1; cy < block.y1; cy++) {
    for (let cx = block.x0 + 1; cx < block.x1; cx++)
      decals.glyph(cx, cy, " ", paper);
  }
  // North arrow.
  const north = blueprintSpots().north;
  const [nx, ny] = cellAt(north.right, north.up);
  decals.glyph(nx, ny - 1, "^", figure);
  decals.glyph(nx, ny - 2, "|", figure);
}

/* -------------------------------------------------------------------------- */
/* About: rug                                                                 */
/* -------------------------------------------------------------------------- */

function paintRug(decals: FloorDecals) {
  const r = cellRect(DISTRICT_LAYOUT.rug);
  const cx0 = (r.x0 + r.x1) / 2;
  const cy0 = (r.y0 + r.y1) / 2;
  const border: GlyphStyle = { level: 0.55, color: "amber" };
  const fringe: GlyphStyle = { level: 0.3, color: "amber" };
  const weave = [
    { char: "%", level: 0.62 },
    { char: ".", level: 0.22 },
    { char: "x", level: 0.4 },
    { char: ".", level: 0.22 },
  ];
  for (let cy = r.y0 - 1; cy <= r.y1 + 1; cy++) {
    for (let cx = r.x0 - 1; cx <= r.x1 + 1; cx++) decals.mute(cx, cy);
  }
  for (let cy = r.y0; cy <= r.y1; cy++) {
    // Fringe on the short ends.
    decals.glyph(r.x0 - 1, cy, "~", fringe);
    decals.glyph(r.x1 + 1, cy, "~", fringe);
    for (let cx = r.x0; cx <= r.x1; cx++) {
      const edge = cx === r.x0 || cx === r.x1 || cy === r.y0 || cy === r.y1;
      if (edge) {
        decals.glyph(cx, cy, "=", border);
        continue;
      }
      const u = Math.abs(cx - cx0);
      const v = Math.abs(cy - cy0);
      if (u < 0.6 && v < 0.6) {
        decals.glyph(cx, cy, "@", { level: 0.95, color: "amber" });
        continue;
      }
      const ring = Math.round(u * 0.7 + v) % weave.length;
      const w = weave[ring];
      decals.glyph(cx, cy, w.char, { level: w.level, color: "amber" });
    }
  }
}

/* -------------------------------------------------------------------------- */

/** Paints every district into `decals` (once, at world build). */
export function paintDistricts(decals: FloorDecals, graph: GitGraph) {
  paintRug(decals);
  paintGitGraph(decals, graph);
  paintBlueprint(decals);
  decals.commit();
}
