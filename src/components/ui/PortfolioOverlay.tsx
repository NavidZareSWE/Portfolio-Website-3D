"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useSectionText } from "@/i18n/useSectionText";
import { SECTION_META_BY_ID, sectionHexCode } from "@/content/sections";
import { OVERLAY_PANEL_WIDTH_PX, STAGE_ID } from "@/config/layout";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectActiveSection } from "@/store/selectors";
import { sectionClosed } from "@/store/slices/portfolioSlice";
import HoloFrame, {
  GlyphRule,
  HoloTrack,
  holoButtonClass,
} from "./holo/HoloFrame";
import SectionContent from "./SectionContent";
import styles from "./PortfolioOverlay.module.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Section panel: the opened hologram, expanded. It repeats the card's
 * anatomy — `// 0X` header and hex address, glyph rule, uppercase glowing
 * title, `> CODE` line, dashed ASCII box, full progress track and the
 * `name.exe` footer — so card and panel read as one object.
 *
 * Accessibility: modal dialog semantics, focus moves to the dialog itself on
 * open, Tab is trapped inside, Escape closes, and focus returns to the
 * stage on close. While animating out, the panel is `inert`.
 *
 * Focus deliberately does NOT go to the close button: the section opens
 * while Space is still held, and a button activates on Space *keyup*, so
 * releasing the key would immediately close the section again.
 */
export default function PortfolioOverlay() {
  const activeSection = useAppSelector(selectActiveSection);
  const dispatch = useAppDispatch();
  const panelRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation("ui");
  const sectionText = useSectionText();

  // Keep rendering the last section during the exit animation.
  const [displayed, setDisplayed] = useState(activeSection);
  if (activeSection !== null && activeSection !== displayed)
    setDisplayed(activeSection);

  const isOpen = activeSection !== null;

  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus({ preventScroll: true });
    panelRef.current?.scrollTo({ top: 0 });

    // The Space that opened the section is usually still held. Its key-repeat
    // events would reach the focused panel and page-scroll it to the end, so
    // repeats are swallowed until that Space is released. A fresh Space press
    // afterwards scrolls the panel as usual.
    let openingSpaceHeld = true;
    const onSpaceRepeat = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable || target?.closest("input, textarea, select");
      if (event.code === "Space" && event.repeat && openingSpaceHeld && !typing)
        event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") openingSpaceHeld = false;
    };
    document.addEventListener("keydown", onSpaceRepeat, { capture: true });
    document.addEventListener("keyup", onKeyUp, { capture: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch(sectionClosed());
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || !panelRef.current.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !panelRef.current.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", onSpaceRepeat, { capture: true });
      document.removeEventListener("keyup", onKeyUp, { capture: true });
      // Hand focus back to the world so keyboard play continues immediately.
      document.getElementById(STAGE_ID)?.focus({ preventScroll: true });
    };
  }, [isOpen, dispatch]);

  if (displayed === null) return null;
  const meta = SECTION_META_BY_ID[displayed];
  const text = sectionText(displayed);
  const titleId = `section-title-${displayed}`;

  return (
    <div
      className={`${styles.root} ${isOpen ? styles.open : styles.closing}`}
      style={
        { "--panel-width": `${OVERLAY_PANEL_WIDTH_PX}px` } as CSSProperties
      }
      inert={!isOpen}
    >
      <div
        className={styles.scrim}
        aria-hidden="true"
        onClick={() => dispatch(sectionClosed())}
      />
      <HoloFrame
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onAnimationEnd={(event) => {
          if (!isOpen && event.target === event.currentTarget)
            setDisplayed(null);
        }}
      >
        {/* Terminal chrome (index, address, Esc, code, ASCII) is always left-to-right. */}
        <header className={styles.header} dir="ltr">
          <span className={styles.index}>{`// ${meta.index}`}</span>
          <span className={styles.hex}>{sectionHexCode(meta)}</span>
          <button
            type="button"
            className={holoButtonClass(styles.close)}
            onClick={() => dispatch(sectionClosed())}
            aria-label={t("overlay.close", { title: text.title })}
          >
            {t("overlay.esc")}
          </button>
        </header>
        <GlyphRule />

        <h2 id={titleId} className={styles.title}>
          {text.title}
        </h2>
        <p className={styles.code} dir="ltr">
          &gt; {meta.code}
        </p>
        <p className={styles.summary}>{text.summary}</p>

        <pre className={styles.ascii} aria-hidden="true" dir="ltr">
          {meta.ascii.join("\n")}
        </pre>

        <SectionContent id={displayed} />

        <footer className={styles.footer}>
          <HoloTrack value={1} />
          <p>{t("overlay.footer", { file: meta.id })}</p>
        </footer>
      </HoloFrame>
    </div>
  );
}
