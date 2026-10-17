import type { Config } from "next-i18n-router/dist/types";

/** Same setup as the main portfolio site: English and Persian, Persian by default. */
const i18nConfig = {
  locales: ["en", "fa"],
  defaultLocale: "fa",
} satisfies Config;

export type Locale = (typeof i18nConfig.locales)[number];

export function isLocale(value: string): value is Locale {
  return (i18nConfig.locales as readonly string[]).includes(value);
}

export default i18nConfig;
