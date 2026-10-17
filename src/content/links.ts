/**
 * Contact channels and link rules. Text lives in the locale files; these are
 * the language-independent targets (from the main site and the résumé).
 */
export const CONTACT = {
  email: "NavidZareSWE@gmail.com",
  github: "https://github.com/NavidZareSWE",
  // The résumé's LinkedIn address (the older site used /in/NavidZareSWE/).
  linkedin: "https://www.linkedin.com/in/navid-z-5b654b355/",
  telegram: "https://t.me/NavidZareSWE",
  map: "https://maps.app.goo.gl/Bg3W7M6TkNXr1SPEA",
} as const;

/**
 * Sites that are offline (the company stopped covering their servers).
 * Links to them are shown as plain text with an "offline" note, never as
 * working links.
 */
const OFFLINE_HOSTS = ["arput.com", "arputmarket.com"];

export function isOfflineUrl(href: string | undefined): boolean {
  if (!href) return false;
  try {
    const host = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
    return OFFLINE_HOSTS.includes(host);
  } catch {
    return false;
  }
}

/** Cloudinary delivery URL → a small, auto-format thumbnail of the same image. */
export function cloudinaryThumb(
  url: string,
  width = 480,
  height = 300,
): string {
  return url.includes("/image/upload/")
    ? url.replace(
        "/image/upload/",
        `/image/upload/c_fill,w_${width},h_${height},q_auto,f_auto/`,
      )
    : url;
}
