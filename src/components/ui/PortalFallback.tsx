"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PORTAL_LINKS } from "@/content/links";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectPortalFallback } from "@/store/selectors";
import { portalFallbackDismissed } from "@/store/slices/worldSlice";
import HoloFrame, { holoButtonClass } from "./holo/HoloFrame";
import styles from "./PortalFallback.module.css";

/** How long the fallback link stays up (ms). */
const AUTO_DISMISS = 9000;

/**
 * Shown when the browser blocked the new tab a social portal tried to open:
 * the same link as a real anchor, which a click always opens.
 */
export default function PortalFallback() {
  const portal = useAppSelector(selectPortalFallback);
  const dispatch = useAppDispatch();
  const { t } = useTranslation("ui");

  useEffect(() => {
    if (!portal) return;
    const timer = setTimeout(
      () => dispatch(portalFallbackDismissed()),
      AUTO_DISMISS,
    );
    return () => clearTimeout(timer);
  }, [portal, dispatch]);

  if (!portal) return null;
  const name = t(`stations.${portal}`);
  return (
    <div className={styles.wrap} role="status">
      <HoloFrame
        compact
        index="LINK"
        code={name.toUpperCase()}
        className={styles.toast}
      >
        <p className={styles.text}>{t("portal.blocked", { name })}</p>
        <div className={styles.actions}>
          <a
            className={holoButtonClass()}
            href={PORTAL_LINKS[portal]}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => dispatch(portalFallbackDismissed())}
          >
            {t("portal.open", { name })}
          </a>
          <button
            type="button"
            className={holoButtonClass()}
            onClick={() => dispatch(portalFallbackDismissed())}
          >
            {t("portal.dismiss")}
          </button>
        </div>
      </HoloFrame>
    </div>
  );
}
