"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSectionText } from "@/i18n/useSectionText";
import { SECTION_META_BY_ID } from "@/content/sections";
import { useExperience } from "@/components/experience/ExperienceContext";
import { useAppSelector } from "@/store/hooks";
import { selectIsCharging, selectPromptCard } from "@/store/selectors";
import HoloFrame, { HoloTrack } from "./holo/HoloFrame";
import styles from "./InteractionPrompt.module.css";

/**
 * Contextual prompt, styled as the footer of the hologram it refers to:
 * `[ HOLD SPACE TO ACCESS ]` above the same progress track the card shows.
 * Visibility and title come from Redux (discrete state); the fill is
 * written straight to the DOM from the simulation's progress stream, so
 * holding Space never re-renders React.
 */
export default function InteractionPrompt({
  touchMode,
}: {
  touchMode: boolean;
}) {
  const cardId = useAppSelector(selectPromptCard);
  const charging = useAppSelector(selectIsCharging);
  const experience = useExperience();
  const { t } = useTranslation("ui");
  const sectionText = useSectionText();
  const fillRef = useRef<HTMLSpanElement>(null);
  // Keep the last card's labels while the prompt fades out.
  const [shownId, setShownId] = useState(cardId);
  if (cardId !== null && cardId !== shownId) setShownId(cardId);

  useEffect(() => {
    if (!experience) return;
    return experience.events.on("chargeProgress", (progress) => {
      if (fillRef.current)
        fillRef.current.style.transform = `scaleX(${progress.toFixed(3)})`;
    });
  }, [experience]);

  const meta = shownId ? SECTION_META_BY_ID[shownId] : null;
  const title = meta ? sectionText(meta.id).title : "";
  const visible = cardId !== null;

  return (
    <div className={styles.wrap} aria-live="polite">
      <HoloFrame
        compact
        index={meta?.index}
        code={meta ? title.toUpperCase() : undefined}
        className={`${styles.prompt} ${visible ? styles.visible : ""} ${charging ? styles.charging : ""}`}
        aria-hidden={!visible}
      >
        <p className={styles.line}>
          <span className={styles.key}>
            {touchMode ? t("prompt.holdTouch") : t("prompt.hold")}
          </span>
          <span className={styles.text}>
            {visible && meta ? <strong>{title}</strong> : null}
          </span>
        </p>
        <HoloTrack fillRef={fillRef} />
      </HoloFrame>
    </div>
  );
}
