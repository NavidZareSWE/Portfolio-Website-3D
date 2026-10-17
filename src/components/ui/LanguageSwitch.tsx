"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslation } from "react-i18next";
import i18nConfig from "../../../i18nConfig";
import { holoButtonClass } from "./holo/HoloFrame";
import styles from "./Hud.module.css";

/**
 * EN ⇄ FA toggle. Navigates to the other locale's route, as on the main
 * site; next-i18n-router (src/proxy.ts) remembers the choice in a cookie.
 * The 3D world restarts in the new language.
 */
export default function LanguageSwitch({ disabled }: { disabled: boolean }) {
  const { t, i18n } = useTranslation("ui");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = i18n.language;
  const target =
    i18nConfig.locales.find((locale) => locale !== current) ??
    i18nConfig.defaultLocale;

  return (
    <button
      type="button"
      className={holoButtonClass(styles.language)}
      lang={target}
      aria-label={t("hud.switchToLabel")}
      disabled={disabled || pending}
      onClick={() => startTransition(() => router.push(`/${target}`))}
    >
      {t("hud.switchTo")}
    </button>
  );
}
