"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { useExperience } from "@/components/experience/ExperienceContext";
import { useDismissOnOutsidePointerOrEscape } from "@/hooks/useDismiss";
import { saveModelChoice } from "@/components/experience/modelChoiceStorage";
import type { ModelDetailState } from "@/three/Experience";
import {
  AVAILABLE_TIERS,
  tierInfo,
  type ModelChoice,
  type ModelTier,
} from "@/three/quality/ModelDetail";
import HoloFrame, { GlyphRule, holoButtonClass } from "./holo/HoloFrame";
import styles from "./Hud.module.css";

const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(1);
const thousands = (count: number) => Math.round(count / 1000);

/**
 * Player model detail: Auto (picked from the GPU and connection) or one of
 * the generated tiers. Switching downloads the tier and swaps it in place.
 */
export default function ModelDetailMenu({ disabled }: { disabled: boolean }) {
  const { t, i18n } = useTranslation("ui");
  const experience = useExperience();
  const subscribe = useCallback(
    (onChange: () => void) =>
      experience?.events.on("modelDetail", onChange) ?? (() => {}),
    [experience],
  );
  const detail: ModelDetailState | null = useSyncExternalStore(
    subscribe,
    () => experience?.modelDetail ?? null,
    () => null,
  );
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const isOpen = open && !disabled && detail !== null;

  useDismissOnOutsidePointerOrEscape(rootRef, isOpen, setOpen);

  if (!detail) return null;

  const choose = (choice: ModelChoice) => {
    saveModelChoice(choice);
    void experience?.setModelChoice(choice);
  };
  const tierName = (tier: ModelTier) => t(`detail.tiers.${tier}`);
  const sizeLine = (tier: ModelTier) => {
    const info = tierInfo(tier);
    return info
      ? t("detail.size", {
          triangles: thousands(info.triangles),
          mb: megabytes(info.bytes),
        })
      : "";
  };
  const options: { choice: ModelChoice; title: string; summary: string }[] = [
    {
      choice: "auto",
      title: t("detail.auto"),
      summary: t("detail.autoPicks", { tier: tierName(detail.auto) }),
    },
    ...AVAILABLE_TIERS.map((tier) => ({
      choice: tier,
      title: tierName(tier),
      summary: sizeLine(tier),
    })),
  ];

  return (
    <div className={styles.index} ref={rootRef}>
      <button
        type="button"
        className={holoButtonClass()}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={t("detail.aria", { tier: tierName(detail.tier) })}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {t("detail.button")}
        {detail.loading && (
          <span className={styles.detailBusy} aria-hidden="true" />
        )}
      </button>
      <div
        id={menuId}
        hidden={!isOpen}
        className={styles.menuWrap}
        dir={i18n.dir()}
      >
        <HoloFrame
          index="LOD"
          code={tierName(detail.tier)}
          className={styles.menu}
        >
          <GlyphRule />
          <ul role="radiogroup" aria-label={t("detail.title")}>
            {options.map((option, index) => {
              const selected = detail.choice === option.choice;
              const loading =
                detail.loading !== null &&
                (option.choice === "auto" ? detail.auto : option.choice) ===
                  detail.loading &&
                selected;
              return (
                <li key={option.choice}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`${styles.menuItem} ${selected ? styles.menuItemSelected : ""}`}
                    onClick={() => choose(option.choice)}
                  >
                    <span className={styles.menuIndex}>
                      {selected ? "[x]" : `0${index}`}
                    </span>
                    <span className={styles.menuTitle}>{option.title}</span>
                    <span className={styles.menuSummary}>
                      {loading ? t("detail.loading") : option.summary}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className={styles.detailNote}>{t("detail.note")}</p>
        </HoloFrame>
      </div>
    </div>
  );
}
