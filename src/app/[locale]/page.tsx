import ExperienceShell from "@/components/experience/ExperienceShell";
import initTranslations, { NAMESPACES } from "@/i18n/initTranslations";
import TranslationsProvider from "@/i18n/TranslationsProvider";
import styles from "./page.module.css";

/**
 * Server component. Loads every translation namespace for the locale (the
 * main site's i18next setup), renders the accessible document outline and
 * hands the resources to the client, where the WebGL world is loaded.
 */
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const { t, resources } = await initTranslations(locale, NAMESPACES);

  return (
    <TranslationsProvider
      locale={locale}
      namespaces={NAMESPACES}
      resources={resources}
    >
      <main className={styles.main}>
        <h1 className="visually-hidden">{t("ui:page.heading")}</h1>
        <p className="visually-hidden">{t("ui:page.intro")}</p>
        <ExperienceShell />
        <noscript>
          <p className={styles.noscript}>{t("ui:page.noscript")}</p>
        </noscript>
      </main>
    </TranslationsProvider>
  );
}
