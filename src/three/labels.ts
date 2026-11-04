import type { PortalId, SectionId } from "@/types";
import type { WarehousePackage } from "./world/vignettes/PackageWarehouse";

/** One role or degree on the Experience floor's git graph (world/districts.ts). */
export interface TimelineCommit {
  /** Stable source for the commit hash (the entry's title). */
  id: string;
  /** Start year in ASCII digits, or "" if the period has none (used for ordering). */
  year: string;
  /** The entry as shown in the Experience panel: period, title and organisation. */
  period: string;
  title: string;
  org: string;
  /** Education entries sit on a branch beside the work history. */
  education: boolean;
}

/**
 * Translated text drawn inside the WebGL world (card faces and the signs in
 * the scenes). Built by React from the i18next `ui` namespace and handed to
 * the Experience, which has no i18n dependency of its own.
 */
export interface SceneLabels {
  /** Right-to-left text (Persian). */
  rtl: boolean;
  sections: Record<
    SectionId,
    { title: string; summary: string; tagline: string[] }
  >;
  cards: {
    prompt: string;
    nameLabel: string;
    fullName: string;
    classLabel: string;
    role: string;
    status: string;
  };
  world: {
    calling: string;
    underConstruction: string;
    build: string;
    /** Data-flow scene beside Projects (interface → API → database). */
    server: string;
    database: string;
    /** face-recognition-brain scanner arch. */
    scanner: string;
    /** M.Sc. research scene: LLM routing. */
    routing: string;
    routingTradeoff: string;
    smallModel: string;
    largeModel: string;
    /** Scanner arch readout when the player walks through. */
    detected: string;
    /** The firewall at the edge of the world. */
    firewall: string;
    accessDenied: string;
    /** The terminal near spawn. */
    terminal: string;
    /** Floating text when a bug is squashed. */
    bugFixed: string;
    /** Experience floor: git graph legend and commit words. */
    gitInitial: string;
    gitMerge: string;
    gitMain: string;
    gitWork: string;
    gitEdu: string;
    gitCommit: string;
    /** Projects floor: the blueprint sheet. */
    blueprint: string;
    blueprintPlan: string;
    blueprintRoomA: string;
    blueprintRoomB: string;
    /** Right of Skills and Contact: the warehouse, the stack tower, the arcade and the portals. */
    arcade: string;
    warehouse: string;
    packages: Record<WarehousePackage, string>;
    stackSign: string;
    stackDone: string;
    /** Tower tiers, bottom to top. */
    stackTiers: [string, string, string, string];
    portals: Record<PortalId, string>;
  };
  /** Experience entries, newest first (empty if the namespace is missing). */
  timeline: TimelineCommit[];
}

/** English fallback, used by tests and if no labels are supplied. */
export const DEFAULT_LABELS: SceneLabels = {
  rtl: false,
  sections: {
    about: {
      title: "About",
      summary: "Who I am and what I focus on",
      tagline: ["WHOAMI", "///"],
    },
    projects: {
      title: "Projects",
      summary: "Selected projects and case studies",
      tagline: ["BUILDS", "///"],
    },
    skills: {
      title: "Skills",
      summary: "Tools, languages and practices",
      tagline: ["MODULES", "///"],
    },
    experience: {
      title: "Experience",
      summary: "Roles, responsibilities and education",
      tagline: ["GIT LOG", "///"],
    },
    contact: {
      title: "Contact",
      summary: "Ways to get in touch",
      tagline: ["PING", "///"],
    },
  },
  cards: {
    prompt: "[ HOLD SPACE TO ACCESS ]",
    nameLabel: "NAME",
    fullName: "NAVID ZARE",
    classLabel: "CLASS",
    role: "FULL-STACK DEV",
    status: "STATUS: ONLINE",
  },
  world: {
    calling: "CALLING",
    underConstruction: "UNDER CONSTRUCTION",
    build: "> projects.build()",
    server: "API SERVER\nNode.js · Express",
    database: "DATABASE\nMongoDB · PostgreSQL",
    scanner: "face-recognition-brain\nface detection, in the browser",
    routing: "LLM ROUTING\nM.Sc. research",
    routingTradeoff: "QUALITY · COST · LATENCY",
    smallModel: "SMALL MODEL",
    largeModel: "LARGE MODEL",
    detected: "HACKER DETECTED\n90% ACCURACY",
    firewall: "FIREWALL",
    accessDenied: "ACCESS DENIED",
    terminal: "TERMINAL\n> type help",
    bugFixed: "BUG FIXED",
    gitInitial: "initial commit",
    gitMerge: "merge",
    gitMain: "main: the career line",
    gitWork: "work: one branch per role",
    gitEdu: "edu: education",
    gitCommit: "a commit",
    blueprint: "BLUEPRINT",
    blueprintPlan: "SITE PLAN",
    blueprintRoomA: "STUDIO",
    blueprintRoomB: "SERVER ROOM",
    arcade: "ARCADE",
    warehouse: "PACKAGE WAREHOUSE",
    packages: {
      react: "Builds every screen of this portfolio",
      next: "Routes, static pages and both languages of this site",
      three: "Draws this whole 3D world",
      typescript: "Types across the whole codebase",
      redux: "App state: open section, terminal, bug count",
      i18next: "The English and Persian text",
      express: "Web servers and REST APIs on Node.js",
      mongodb: "Document database",
    },
    stackSign: "TECH STACK\n> climb it",
    stackDone: "FULL STACK ✓",
    stackTiers: [
      "DATABASE · MongoDB · PostgreSQL",
      "API · Node.js · Express",
      "FRONTEND · React · Next.js",
      "BROWSER",
    ],
    portals: {
      github: "GITHUB",
      linkedin: "LINKEDIN",
      telegram: "TELEGRAM",
      email: "EMAIL",
    },
  },
  timeline: [],
};
