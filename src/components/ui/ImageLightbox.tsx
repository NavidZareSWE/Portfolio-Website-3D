"use client";

import { useEffect, useId, useRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { A11y, Keyboard, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import { cloudinaryFull } from "@/content/links";

// Swiper's base CSS (e.g. `.swiper-slide { display: block }`) must be
// imported *before* our own module below: imports are injected into the
// page in source order, and our module's `.slide { display: flex }` (for
// centering each image) needs to come after Swiper's defaults in the
// cascade to win, not before.
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

import styles from "./ImageLightbox.module.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface ImageLightboxProps {
  /** Every screenshot for the project (not just the first four shown as tiles). */
  images: string[];
  /** Which image the gallery opens on. */
  initialIndex?: number;
  /** Project title, for the dialog label and per-image alt text. */
  title: string;
  onClose: () => void;
}

/**
 * Full-size, swipeable screenshot viewer — opened from a project's gallery
 * tiles. Same interaction as the main site's lightbox (Swiper: navigation
 * arrows, a fraction counter, keyboard arrows and touch swipe), restyled as
 * a holo-terminal panel and stacked, via a portal, above the section panel
 * it's opened from.
 *
 * It keeps its own focus trap and Escape handling (capture phase, stopped
 * from bubbling) so closing the lightbox never also closes the section
 * panel underneath, which has the same Escape/Tab handling of its own.
 */
export default function ImageLightbox({
  images,
  initialIndex = 0,
  title,
  onClose,
}: ImageLightboxProps) {
  const { t } = useTranslation("ui");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusables.length === 0) return;
      event.stopPropagation();
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || !dialogRef.current.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialogRef.current.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture phase: runs, and is stopped, before the section panel's own
    // (bubble-phase) Escape/Tab handling, so this dialog's own keys don't
    // also reach — and close — the panel behind it.
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.body.style.overflow = "";
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [onClose]);

  const handleOverlayMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  // Rendered through a portal: the section panel it opens from is itself
  // `position: fixed`, and nesting a second fixed overlay inside it is
  // fragile (overflow/stacking-context edge cases), so this mounts straight
  // on <body> instead. This component only ever mounts client-side (it's
  // conditionally rendered from a click handler), so `document` is always
  // available here — no SSR guard needed.
  return createPortal(
    <div className={styles.overlay} onMouseDown={handleOverlayMouseDown}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="visually-hidden">
          {t("lightbox.dialogLabel", { title })}
        </h2>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t("lightbox.close")}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <line
              x1="5"
              y1="5"
              x2="19"
              y2="19"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="19"
              y1="5"
              x2="5"
              y2="19"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <Swiper
          modules={[Navigation, Pagination, Keyboard, A11y]}
          navigation
          pagination={{ clickable: true, type: "fraction" }}
          keyboard={{ enabled: true }}
          initialSlide={initialIndex}
          spaceBetween={0}
          slidesPerView={1}
          loop={images.length > 1}
          grabCursor
          a11y={{
            prevSlideMessage: t("lightbox.prevImage"),
            nextSlideMessage: t("lightbox.nextImage"),
          }}
          className={styles.swiper}
        >
          {images.map((src, n) => (
            <SwiperSlide key={src} className={styles.slide}>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary originals */}
              <img
                src={cloudinaryFull(src)}
                alt={t("lightbox.imageAlt", { n: n + 1, title })}
                loading={n === initialIndex ? "eager" : "lazy"}
                decoding="async"
                className={styles.image}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>,
    document.body,
  );
}
