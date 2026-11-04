"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useSectionText } from "@/i18n/useSectionText";
import { SECTION_META_BY_ID } from "@/content/sections";
import { useExperience } from "@/components/experience/ExperienceContext";
import { useAppSelector } from "@/store/hooks";
import {
  selectIsCharging,
  selectPromptCard,
  selectStationPrompt,
} from "@/store/selectors";
import type { StationId } from "@/types";
import HoloFrame, { HoloTrack } from "./holo/HoloFrame";

/** The `// …` tag shown on the prompt per station. */
const STATION_INDEX: Record<StationId, string> = {
  terminal: "TTY",
  arcade: "ARC",
  github: "LINK",
  linkedin: "LINK",
  telegram: "LINK",
  email: "MAIL",
};
import styles from "./InteractionPrompt.module.css";

/**
 * Contextual prompt, styled as the footer of the hologram it refers to:
 * `[ HOLD SPACE TO ACCESS ]` above the same progress track the card shows.
 * Visibility and title come from Redux (discrete state); the fill is
 * written straight to the DOM from the simulation's progress stream, so
 * holding Space never re-renders React.
 *
 * The prompt itself can be held too (mouse button or finger): it holds the
 * action the same way Space or the touch action button does.
 *
 * At a station (the terminal, the arcade, a social portal) the same prompt
 * and the same hold use it: `[ HOLD SPACE TO ACCESS ] TERMINAL`.
 */
export default function InteractionPrompt({
  touchMode,
}: {
  touchMode: boolean;
}) {
  const cardId = useAppSelector(selectPromptCard);
  const station = useAppSelector(selectStationPrompt);
  const charging = useAppSelector(selectIsCharging);
  const experience = useExperience();
  const { t } = useTranslation("ui");
  const sectionText = useSectionText();
  const fillRef = useRef<HTMLSpanElement>(null);
  // Keep the last card's labels while the prompt fades out.
  const [shownId, setShownId] = useState(cardId);
  if (cardId !== null && cardId !== shownId) setShownId(cardId);
  // …and the last station's, while the prompt fades out after leaving it.
  const [shownStation, setShownStation] = useState(station);
  if (cardId !== null && shownStation !== null) setShownStation(null);
  else if (cardId === null && station !== null && station !== shownStation)
    setShownStation(station);
  const stationShown = shownStation !== null;

  useEffect(() => {
    if (!experience) return;
    return experience.events.on("chargeProgress", (progress) => {
      if (fillRef.current)
        fillRef.current.style.transform = `scaleX(${progress.toFixed(3)})`;
    });
  }, [experience]);

  const meta = shownId && !stationShown ? SECTION_META_BY_ID[shownId] : null;
  const title = meta
    ? sectionText(meta.id).title
    : shownStation
      ? t(`stations.${shownStation}`)
      : "";
  const visible = cardId !== null || station !== null;

  // Leaving the card's range (prompt hidden) ends a hold made on the prompt.
  useEffect(() => {
    if (!visible) experience?.input.setVirtualAction(false, "prompt");
  }, [visible, experience]);
  useEffect(
    () => () => experience?.input.setVirtualAction(false, "prompt"),
    [experience],
  );

  const press = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!visible || !experience) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    experience.input.setVirtualAction(true, "prompt");
  };
  const release = () => experience?.input.setVirtualAction(false, "prompt");

  return (
    <div
      className={`${styles.wrap} ${touchMode ? styles.touch : ""}`}
      aria-live="polite"
    >
      <HoloFrame
        compact
        index={stationShown ? STATION_INDEX[shownStation] : meta?.index}
        code={meta || stationShown ? title.toUpperCase() : undefined}
        className={`${styles.prompt} ${visible ? styles.visible : ""} ${charging ? styles.charging : ""}`}
        aria-hidden={!visible}
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onContextMenu={(event) => event.preventDefault()}
      >
        <p className={styles.line}>
          <span className={`${styles.key} ${touchMode ? styles.keyTouch : ""}`}>
            {touchMode ? t("prompt.holdTouch") : t("prompt.hold")}
          </span>
          <span className={styles.text}>
            {visible && (meta || stationShown) ? (
              <strong>{title}</strong>
            ) : null}
          </span>
        </p>
        <HoloTrack fillRef={fillRef} />
        <p className={styles.hint}>
          {stationShown
            ? touchMode
              ? t("prompt.stationTap")
              : t("prompt.stationClick")
            : touchMode
              ? t("prompt.touchHere")
              : t("prompt.clickHere")}
        </p>
      </HoloFrame>
    </div>
  );
}
