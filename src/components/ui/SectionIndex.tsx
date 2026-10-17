"use client";

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SECTION_META } from "@/content/sections";
import { useDismissOnOutsidePointerOrEscape } from "@/hooks/useDismiss";
import { useSectionText } from "@/i18n/useSectionText";
import { useAppDispatch } from "@/store/hooks";
import { sectionOpened } from "@/store/slices/portfolioSlice";
import HoloFrame, { GlyphRule, holoButtonClass } from "./holo/HoloFrame";
import styles from "./Hud.module.css";

/**
 * Keyboard- and screen-reader-accessible shortcut to every section, so the
 * content never depends on navigating the 3D world.
 */
export default function SectionIndex({ disabled }: { disabled: boolean }) {
  const { t, i18n } = useTranslation("ui");
  const sectionText = useSectionText();
  const [open, setOpen] = useState(false);
  const dispatch = useAppDispatch();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const isOpen = open && !disabled;

  useDismissOnOutsidePointerOrEscape(rootRef, isOpen, setOpen);

  return (
    <div className={styles.index} ref={rootRef}>
      <button
        type="button"
        className={holoButtonClass()}
        aria-expanded={isOpen}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {t("hud.index")}
      </button>
      <nav
        id={menuId}
        aria-label={t("hud.indexNav")}
        hidden={!isOpen}
        className={styles.menuWrap}
        dir={i18n.dir()}
      >
        <HoloFrame
          index="IDX"
          code={t("hud.nodes", { count: SECTION_META.length })}
          className={styles.menu}
        >
          <GlyphRule />
          <ul>
            {SECTION_META.map((meta) => (
              <li key={meta.id}>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setOpen(false);
                    dispatch(sectionOpened(meta.id));
                  }}
                >
                  <span className={styles.menuIndex}>{meta.index}</span>
                  <span className={styles.menuTitle}>
                    {sectionText(meta.id).title}
                  </span>
                  <span className={styles.menuSummary}>&gt; {meta.code}</span>
                </button>
              </li>
            ))}
          </ul>
        </HoloFrame>
      </nav>
    </div>
  );
}
