import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/vazirmatn";
import "@fontsource/press-start-2p/400.css";
import "../globals.css";
import Providers from "../providers";
import { THEME, themeCssVariables } from "@/theme/theme";
import isTextDirectionRTL from "@/i18n/isTextDirectionRTL";
import i18nConfig, { isLocale } from "../../../i18nConfig";

// Same truthful one-line summaries as the main portfolio site.
const TITLE: Record<string, string> = {
  en: "Navid Zare — Full-stack developer",
  fa: "نوید زارع — توسعه‌دهنده فول‑استک",
};
const DESCRIPTION: Record<string, string> = {
  en: "Navid Zare — Full-stack developer building React and Next.js applications with a focus on performance, server-side rendering, and SEO.",
  fa: "نوید زارع — توسعه‌دهنده فول‑استک، سازنده‌ی اپلیکیشن‌های React و Next.js با تمرکز بر عملکرد، رندر سمت سرور و SEO.",
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export function generateStaticParams() {
  return i18nConfig.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const lang = isLocale(locale) ? locale : i18nConfig.defaultLocale;
  return {
    metadataBase: siteUrl ? new URL(siteUrl) : undefined,
    title: TITLE[lang],
    description: DESCRIPTION[lang],
    authors: [{ name: "Navid Zare" }],
    alternates: { canonical: `/${lang}`, languages: { en: "/en", fa: "/fa" } },
    openGraph: {
      title: TITLE[lang],
      description: DESCRIPTION[lang],
      siteName: "Navid Zare",
      type: "website",
      locale: lang === "fa" ? "fa_IR" : "en_US",
    },
  };
}

export const viewport: Viewport = {
  themeColor: THEME.bg,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    // Theme tokens are injected once here so CSS modules and the WebGL scene share one palette.
    <html
      lang={locale}
      dir={isTextDirectionRTL(locale) ? "rtl" : "ltr"}
      style={themeCssVariables() as CSSProperties}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
