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
  world: { calling: string; underConstruction: string; build: string };
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
  },
};
