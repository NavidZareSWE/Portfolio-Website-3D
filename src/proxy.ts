import type { NextRequest } from "next/server";
import { i18nRouter } from "next-i18n-router";
import i18nConfig from "../i18nConfig";

/**
 * Locale routing (next-i18n-router), as on the main portfolio site:
 * "/" serves the default locale (Persian), "/en" serves English, and the
 * visitor's last choice is remembered in the NEXT_LOCALE cookie.
 * (Next.js 16 renamed the `middleware` file convention to `proxy`.)
 */
export function proxy(request: NextRequest) {
  return i18nRouter(request, i18nConfig);
}

export const config = {
  matcher: ["/((?!api|static|.*\\..*|_next).*)"],
};
