import { THEME } from "@/theme/theme";
import { WORLD } from "../../config";
import type { SceneLabels } from "../../labels";
import {
  GRAPH_LABEL_COLUMN,
  GRAPH_LANES,
  blueprintSpots,
  buildGitGraph,
  type GraphCommit,
} from "../districts";
import { FloorLabel, type LabelRun } from "../FloorLabel";
import { Vignette, type VignetteContext } from "../Vignette";

const CELL = WORLD.cellSize;
/** Commit labels: width and height of one label on the floor (metres). */
const COMMIT_LABEL = { width: 6.6, height: 0.36 };

/** The text after a commit's hash, by kind. */
function commitRuns(commit: GraphCommit, labels: SceneLabels): LabelRun[] {
  const hash: LabelRun = { text: commit.hash, color: THEME.green, bold: true };
  const muted = THEME.muted;
  switch (commit.kind) {
    case "head":
      return [hash, { text: "(HEAD -> main)", color: THEME.amber, bold: true }];
    case "root":
      return [hash, { text: labels.world.gitInitial, color: muted }];
    case "merge":
      return [
        hash,
        { text: labels.world.gitMerge, color: muted, size: 0.8 },
        { text: commit.title, color: muted, size: 0.8 },
      ];
    case "work":
    case "edu":
      return [
        hash,
        ...(commit.period
          ? [{ text: commit.period, color: THEME.cyan, bold: true }]
          : []),
        ...(commit.title
          ? [{ text: commit.title, color: THEME.ink, bold: true }]
          : []),
        ...(commit.org ? [{ text: commit.org, color: muted, size: 0.85 }] : []),
      ];
  }
}

/**
 * The readable part of the district floors, as crisp labels lying on the
 * floor: each commit of the Experience git graph (hash, period, role and
 * organisation) with a header and lane legend, and the blueprint's title,
 * room names, title block and north mark.
 */
export class DistrictLabels extends Vignette {
  constructor(ctx: VignetteContext) {
    super(ctx, { right: 0, up: 0 }, "district-labels");
    this.buildGitGraphLabels(ctx.labels);
    this.buildBlueprintLabels(ctx.labels);
  }

  private place(label: FloorLabel, right: number, up: number) {
    label.mesh.position.x = right;
    label.mesh.position.z = -up;
    this.group.add(label.mesh);
  }

  private buildGitGraphLabels(labels: SceneLabels) {
    const graph = buildGitGraph(labels.timeline);
    const x = (graph.lane + GRAPH_LABEL_COLUMN) * CELL;
    for (const row of graph.rows) {
      if (!row.commit) continue;
      const label = new FloorLabel(COMMIT_LABEL.width, COMMIT_LABEL.height, [
        commitRuns(row.commit, labels),
      ]);
      this.place(label, x, (row.cy + 0.5) * CELL);
    }

    // Header and lane legend above the graph.
    const left = graph.lane * CELL - 0.3;
    const top = (graph.top + 0.5) * CELL;
    const header = new FloorLabel(6.5, 0.55, [
      [
        { text: "$ git log --graph", color: THEME.green, bold: true },
        {
          text: labels.sections.experience.title,
          color: THEME.ink,
          bold: true,
        },
      ],
    ]);
    this.place(header, left, top + 1.45);
    // The legend, one lane per line, on the open floor left of the lanes.
    const legend = new FloorLabel(
      5.2,
      1.36,
      [
        [{ text: `| ${labels.world.gitMain}`, color: THEME.cyan }],
        [{ text: `| ${labels.world.gitWork}`, color: THEME.blue }],
        [{ text: `| ${labels.world.gitEdu}`, color: THEME.blue }],
        [{ text: `* ${labels.world.gitCommit}`, color: THEME.green }],
      ],
      { glow: false },
    );
    this.place(legend, left - 5.4, top - 1.6);

    // Lane names right above the lanes.
    for (const [lane, name] of [
      [GRAPH_LANES.main, "main"],
      [GRAPH_LANES.work, "work"],
      [GRAPH_LANES.edu, "edu"],
    ] as const) {
      const tag = new FloorLabel(
        0.9,
        0.32,
        [[{ text: name, color: THEME.muted, size: 0.9 }]],
        {
          align: "center",
          glow: false,
        },
      );
      this.place(tag, (graph.lane + lane + 0.5) * CELL, top);
    }
  }

  private buildBlueprintLabels(labels: SceneLabels) {
    const spots = blueprintSpots();
    const title = new FloorLabel(5.4, 0.42, [
      [
        { text: labels.world.blueprint, color: THEME.ink, bold: true },
        { text: "projects.build()", color: THEME.cyan },
      ],
    ]);
    this.place(title, spots.title.right, spots.title.up);

    const block = new FloorLabel(
      2.0,
      1.1,
      [
        [{ text: labels.world.blueprintPlan, color: THEME.ink, bold: true }],
        [{ text: "1:50", color: THEME.cyan }],
        [{ text: "REV 0x02", color: THEME.muted }],
      ],
      { align: "center", glow: false, plate: false },
    );
    this.place(block, spots.titleBlock.right, spots.titleBlock.up);

    const rooms = [labels.world.blueprintRoomA, labels.world.blueprintRoomB];
    for (const room of spots.rooms) {
      const label = new FloorLabel(
        2.4,
        0.36,
        [[{ text: rooms[room.index], color: THEME.cyan, size: 0.9 }]],
        { align: "center", glow: false, plate: false },
      );
      this.place(label, room.at.right, room.at.up);
    }

    const north = new FloorLabel(
      0.4,
      0.3,
      [[{ text: "N", color: THEME.green, bold: true }]],
      { align: "center", plate: false },
    );
    this.place(north, spots.north.right, spots.north.up);
  }

  protected animate() {}
}
