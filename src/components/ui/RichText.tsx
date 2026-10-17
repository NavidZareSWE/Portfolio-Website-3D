"use client";

import DOMPurify from "dompurify";
import { useMemo } from "react";
import { isOfflineUrl } from "@/content/links";

let hooksInstalled = false;

/** Links open in a new tab; links to offline sites become plain text. */
function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName !== "A") return;
    const href = node.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href) || isOfflineUrl(href)) {
      node.removeAttribute("href");
      node.setAttribute("data-unlinked", "");
      return;
    }
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  });
}

/**
 * Renders the small HTML snippets used in the locale files (the main site's
 * About copy) after sanitising them with DOMPurify, as the main site does.
 */
export default function RichText({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const clean = useMemo(() => {
    if (typeof window === "undefined") return "";
    installHooks();
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ["strong", "b", "em", "i", "u", "a", "br", "span"],
      ALLOWED_ATTR: ["href", "class", "target", "rel", "data-unlinked"],
    });
  }, [html]);
  return (
    <span className={className} dangerouslySetInnerHTML={{ __html: clean }} />
  );
}
