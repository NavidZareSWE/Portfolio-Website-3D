"use client";

import { useTranslation } from "react-i18next";
import type { SectionId } from "@/types";

/** Localized title and one-line summary of a portfolio section. */
export function useSectionText() {
  const { t } = useTranslation("ui");
  return (id: SectionId) => ({
    title: t(`sections.${id}.title`),
    summary: t(`sections.${id}.summary`),
  });
}
