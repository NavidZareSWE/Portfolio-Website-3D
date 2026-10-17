"use client";

import { createInstance, type Resource } from "i18next";
import { useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import initTranslations from "./initTranslations";

/**
 * Client side of the main site's i18n setup: one i18next instance per
 * mount, initialised synchronously from the resources the server loaded.
 */
export default function TranslationsProvider({
  children,
  locale,
  namespaces,
  resources,
}: {
  children: ReactNode;
  locale: string;
  namespaces: readonly string[];
  resources: Resource;
}) {
  const [i18n] = useState(() => {
    const instance = createInstance();
    void initTranslations(locale, namespaces, instance, resources);
    return instance;
  });
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
