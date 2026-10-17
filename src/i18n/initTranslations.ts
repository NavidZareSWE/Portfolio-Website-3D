import { createInstance, type i18n as I18n, type Resource } from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next/initReactI18next";
import i18nConfig from "../../i18nConfig";

/** Every namespace the portfolio uses (files in /locales/<lng>/<ns>.json). */
export const NAMESPACES = [
  "ui",
  "common",
  "home",
  "about",
  "projects",
  "skills",
  "experience",
  "contactus",
] as const;

/**
 * Port of the main site's `initTranslations`: on the server it loads the
 * JSON namespaces through i18next-resources-to-backend; on the client it is
 * handed the server's resources so nothing is fetched twice.
 */
export default async function initTranslations(
  locale: string,
  namespaces: readonly string[] = NAMESPACES,
  instance?: I18n,
  resources?: Resource,
) {
  const i18nInstance = instance ?? createInstance();
  i18nInstance.use(initReactI18next);

  if (!resources) {
    i18nInstance.use(
      resourcesToBackend(
        (language: string, namespace: string) =>
          import(`../../locales/${language}/${namespace}.json`),
      ),
    );
  }

  await i18nInstance.init({
    lng: locale,
    resources,
    fallbackLng: i18nConfig.defaultLocale,
    supportedLngs: [...i18nConfig.locales],
    defaultNS: namespaces[0],
    fallbackNS: namespaces[0],
    ns: [...namespaces],
    preload: resources ? [] : [...i18nConfig.locales],
    // With inline resources the instance is ready synchronously (no flash of keys).
    initAsync: !resources,
    interpolation: { escapeValue: false },
  });

  // A namespace file missing from /locales would otherwise ship raw keys
  // (e.g. "hud.index") instead of text; stop the server render, and so the build.
  if (!resources) {
    const loaded = i18nInstance.services.resourceStore.data;
    const missing = i18nConfig.locales.flatMap((lng) =>
      namespaces.filter((ns) => !loaded[lng]?.[ns]).map((ns) => `locales/${lng}/${ns}.json`),
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing translation files: ${missing.join(", ")}. ` +
          "Add these namespaces to the i18nexus project (or restore the files) and run `i18nexus pull`.",
      );
    }
  }

  return {
    i18n: i18nInstance,
    resources: { [locale]: i18nInstance.services.resourceStore.data[locale] } as Resource,
    t: i18nInstance.t,
  };
}