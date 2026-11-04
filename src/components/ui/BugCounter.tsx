"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppSelector } from "@/store/hooks";
import { selectBugsFixed } from "@/store/selectors";
import styles from "./Hud.module.css";

/** HUD chip under the brand: how many bugs the visitor has squashed. Pulses on each new one. */
export default function BugCounter() {
  const { t } = useTranslation("ui");
  const count = useAppSelector(selectBugsFixed);
  const [pulse, setPulse] = useState(false);
  const previous = useRef(count);

  useEffect(() => {
    if (count === previous.current) return;
    previous.current = count;
    setPulse(true);
    const timer = setTimeout(() => setPulse(false), 600);
    return () => clearTimeout(timer);
  }, [count]);

  return (
    <p
      className={`${styles.bugs} ${pulse ? styles.bugsPulse : ""}`}
      aria-label={t("hud.bugsLabel", { count })}
      role="status"
    >
      <span className={styles.bugIcon} aria-hidden="true">
        ж
      </span>
      <span className={styles.bugText} aria-hidden="true">
        {t("hud.bugs")}
      </span>
      <span className={styles.bugCount} aria-hidden="true" dir="ltr">
        {String(count).padStart(2, "0")}
      </span>
    </p>
  );
}
