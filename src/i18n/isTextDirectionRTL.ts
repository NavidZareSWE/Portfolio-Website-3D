/** Right-to-left languages (same list as the main portfolio site, base tags). */
const RTL_LOCALES = ["ar", "he", "fa", "yi", "sy"];

export default function isTextDirectionRTL(locale: string): boolean {
  return RTL_LOCALES.includes(locale.toLowerCase().split("-")[0]);
}
