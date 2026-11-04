"use client";

import { useTranslation } from "react-i18next";
import { useAppSelector } from "@/store/hooks";
import {
  selectGameStatus,
  selectIsOverlayOpen,
  selectIsModalOpen,
} from "@/store/selectors";
import BugCounter from "./BugCounter";
import LanguageSwitch from "./LanguageSwitch";
import ModelDetailMenu from "./ModelDetailMenu";
import SectionIndex from "./SectionIndex";
import styles from "./Hud.module.css";

/** Minimal exploration HUD: brand mark and bug counter (top-left); language, model detail and section index (top-right). */
export default function Hud() {
  const { t } = useTranslation("ui");
  const status = useAppSelector(selectGameStatus);
  const overlayOpen = useAppSelector(selectIsOverlayOpen);
  const modalOpen = useAppSelector(selectIsModalOpen);
  const visible = status === "ready" && !overlayOpen && !modalOpen;

  return (
    <header className={`${styles.hud} ${visible ? "" : styles.dimmed}`}>
      <div className={styles.left}>
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
        {status === "ready" && <BugCounter />}
      </div>
      <div className={styles.actions}>
        <LanguageSwitch disabled={status === "loading"} />
        {status === "ready" && <ModelDetailMenu disabled={!visible} />}
        {status !== "error" && <SectionIndex disabled={!visible} />}
      </div>
    </header>
  );
}
