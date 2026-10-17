import type { SectionId } from "@/types";

/**
 * Structure of the portfolio sections (order, index, terminal code and the
 * ASCII art drawn on each card). Everything a visitor reads — titles,
 * summaries and the section content — comes from the i18next namespaces in
 * /locales/<lng>/ (see src/i18n), so it is available in English and Persian.
 */

export interface SectionMeta {
  id: SectionId;
  /** Two-digit index shown on the card and overlay header. */
  index: string;
  /** Short terminal-style code rendered on the card (decorative, not translated). */
  code: string;
  /** ASCII artwork drawn on the holographic card (monospace, ≤ 16 cols). */
  ascii: readonly string[];
}

export const SECTION_META: readonly SectionMeta[] = [
  {
    id: "about",
    index: "01",
    code: "WHOAMI",
    ascii: [
      "+------------+",
      "| $ whoami   |",
      "| > navid    |",
      "| > zare     |",
      "| $ _        |",
      "+------------+",
    ],
  },
  {
    id: "projects",
    index: "02",
    code: "LS ./WORK",
    ascii: [
      "./projects    ",
      "|-- arput     ",
      "|-- forever   ",
      "|-- quickblog ",
      "`-- [+5]      ",
    ],
  },
  {
    id: "skills",
    index: "03",
    code: "MODULES",
    ascii: [
      ".--. .--. .--.",
      "|{}| |<>| |[]|",
      "'--' '--' '--'",
      ".--. .--. .--.",
      "|()| |#!| |$_|",
      "'--' '--' '--'",
    ],
  },
  {
    id: "experience",
    index: "04",
    code: "GIT LOG",
    ascii: [
      "o-- 2024 site ",
      "|             ",
      "o-- 2024 ar   ",
      "|             ",
      "o-- 2024 admin",
    ],
  },
  {
    id: "contact",
    index: "05",
    code: "PING",
    ascii: [
      ".------------.",
      "|\\          /|",
      "| \\   @    / |",
      "|  '------'  |",
      "'------------'",
    ],
  },
];

/** Decorative terminal address shown on the card and the section panel. */
export function sectionHexCode(meta: SectionMeta): string {
  return `0x${(parseInt(meta.index, 10) * 4096 + 0x2a).toString(16).toUpperCase()}`;
}

export const SECTION_META_BY_ID = Object.fromEntries(
  SECTION_META.map((meta) => [meta.id, meta]),
) as Record<SectionId, SectionMeta>;
