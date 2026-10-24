import type { SectionId } from "@/types";

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
  };
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
  },
};
