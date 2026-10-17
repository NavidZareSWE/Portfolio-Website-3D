"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSectionText } from "@/i18n/useSectionText";
import { SECTION_META } from "@/content/sections";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectGameError,
  selectGameStatus,
  selectLoadProgress,
  selectLoadStep,
} from "@/store/selectors";
import { sectionOpened } from "@/store/slices/portfolioSlice";
import HoloFrame, {
  GlyphRule,
  HoloTrack,
  holoButtonClass,
} from "./holo/HoloFrame";
import styles from "./LoadingScreen.module.css";

/**
 * Server-rendered boot screen. Progress reflects real initialisation
 * milestones reported by the scene, and the screen only fades once the
 * first frame has been rendered. On failure it becomes a fallback that
 * still gives access to the portfolio sections.
 */
export default function LoadingScreen() {
  const status = useAppSelector(selectGameStatus);
  const step = useAppSelector(selectLoadStep);
  const progress = useAppSelector(selectLoadProgress);
  const error = useAppSelector(selectGameError);
  const dispatch = useAppDispatch();
  const [removed, setRemoved] = useState(false);
  const { t } = useTranslation("ui");
  const sectionText = useSectionText();

  if (removed) return null;

  const isReady = status === "ready";

  return (
    <div
      className={`${styles.screen} ${isReady ? styles.hidden : ""}`}
      onTransitionEnd={(event) => {
        if (isReady && event.target === event.currentTarget) setRemoved(true);
      }}
      aria-hidden={isReady}
      role={status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <HoloFrame index="BOOT" code="NZSWE.SYS" className={styles.panel}>
        <div className={styles.brandRow}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed */}
          <img
            className={styles.logo}
            src="/logo/nzswe-logo.svg"
            alt=""
            width={40}
            height={42}
          />
          <p className={styles.brand}>{t("loading.brand")}</p>
        </div>
        <GlyphRule />

        {status === "error" ? (
          <>
            <p className={styles.errorTitle}>{t("loading.errorTitle")}</p>
            <p className={styles.errorText}>
              {error === "webgl"
                ? t("loading.webgl")
                : error === "stopped"
                  ? t("loading.stopped")
                  : t("loading.startFailed")}{" "}
              {t("loading.errorText")}
            </p>
            <ul className={styles.fallbackList}>
              {SECTION_META.map((meta) => (
                <li key={meta.id}>
                  <button
                    type="button"
                    className={holoButtonClass()}
                    onClick={() => dispatch(sectionOpened(meta.id))}
                  >
                    {meta.index} {sectionText(meta.id).title}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className={styles.step}>
              <span aria-hidden="true">&gt; </span>
              {t(`loading.steps.${step}`, { defaultValue: step })}
              <span className={styles.caret} aria-hidden="true">
                _
              </span>
            </p>
            <HoloTrack value={progress} />
            <p className={styles.percent} aria-hidden="true">
              {Math.round(progress * 100)}% :: {t("loading.init")}
            </p>
          </>
        )}
      </HoloFrame>
    </div>
  );
}
