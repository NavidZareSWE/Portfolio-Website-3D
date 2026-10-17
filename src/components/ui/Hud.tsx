"use client";

import { useTranslation } from "react-i18next";
import { useAppSelector } from "@/store/hooks";
import { selectGameStatus, selectIsOverlayOpen } from "@/store/selectors";
import LanguageSwitch from "./LanguageSwitch";
import ModelDetailMenu from "./ModelDetailMenu";
import SectionIndex from "./SectionIndex";
import styles from "./Hud.module.css";

/** Minimal exploration HUD: brand mark (top-left); language, model detail and section index (top-right). */
export default function Hud() {
  const { t } = useTranslation("ui");
  const status = useAppSelector(selectGameStatus);
  const overlayOpen = useAppSelector(selectIsOverlayOpen);
  const visible = status === "ready" && !overlayOpen;

  return (
    <header className={`${styles.hud} ${visible ? "" : styles.dimmed}`}>
      <div className={styles.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG brand mark */}
        <img
          src="/logo/nzswe-logo.svg"
          alt=""
          width={26}
          height={28}
          className={styles.logo}
        />
        <span className={styles.wordmark}>
          <span className={styles.name}>NZSWE</span>
          <span className={styles.sub}>{t("hud.tagline")}</span>
        </span>
      </div>
      <div className={styles.actions}>
        <LanguageSwitch disabled={status === "loading"} />
        {status === "ready" && <ModelDetailMenu disabled={!visible} />}
        {status !== "error" && <SectionIndex disabled={!visible} />}
      </div>
    </header>
  );
}
