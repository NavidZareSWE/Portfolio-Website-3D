"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { A11y, Keyboard, Navigation } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import { cloudinaryFull } from "@/content/links";

// Swiper's base CSS must be imported before the module below so our slide
// layout and custom navigation styling win in the cascade.
import "swiper/css";
import "swiper/css/navigation";

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

const SEGMENT_LINES = [
  { name: "a", x1: 4.5, y1: 3, x2: 12.5, y2: 3 },
  { name: "b", x1: 14, y1: 4.5, x2: 14, y2: 10.5 },
  { name: "c", x1: 14, y1: 16.5, x2: 14, y2: 22.5 },
  { name: "d", x1: 12.5, y1: 24, x2: 4.5, y2: 24 },
  { name: "e", x1: 3, y1: 22.5, x2: 3, y2: 16.5 },
  { name: "f", x1: 3, y1: 10.5, x2: 3, y2: 4.5 },
  { name: "g", x1: 4.5, y1: 13.5, x2: 12.5, y2: 13.5 },
] as const;

const DIGIT_SEGMENTS: Readonly<Record<number, readonly string[]>> = {
  0: ["a", "b", "c", "d", "e", "f"],
  1: ["b", "c"],
  2: ["a", "b", "d", "e", "g"],
  3: ["a", "b", "c", "d", "g"],
  4: ["b", "c", "f", "g"],
  5: ["a", "c", "d", "f", "g"],
  6: ["a", "c", "d", "e", "f", "g"],
  7: ["a", "b", "c"],
  8: ["a", "b", "c", "d", "e", "f", "g"],
  9: ["a", "b", "c", "d", "f", "g"],
};

function SegmentDigit({ value }: { value: number }) {
  const activeSegments = new Set(DIGIT_SEGMENTS[value] ?? DIGIT_SEGMENTS[0]);

  return (
    <svg
      className={styles.segmentDigit}
      viewBox="0 0 17 27"
      aria-hidden="true"
      focusable="false"
    >
      {SEGMENT_LINES.map((segment) => (
        <line
          key={segment.name}
          x1={segment.x1}
          y1={segment.y1}
          x2={segment.x2}
          y2={segment.y2}
          className={
            activeSegments.has(segment.name)
              ? styles.segmentOn
              : styles.segmentOff
          }
        />
      ))}
    </svg>
  );
}

function SegmentNumber({ value }: { value: number }) {
  const digits = String(value).padStart(2, "0");

  return (
    <span className={styles.segmentNumber}>
      {digits.split("").map((digit, index) => (
        <SegmentDigit key={`${index}-${digit}`} value={Number(digit)} />
      ))}
    </span>
  );
}

/**
 * Full-size, swipeable screenshot viewer — opened from a project's gallery
 * tiles. Swiper keeps its navigation, keyboard and touch interactions; the
 * window chrome and segmented counter are a custom part of the site's
 * holo-terminal interface.
 *
 * It mounts through a portal above the section panel and maintains its own
 * focus trap and Escape handling so its key events don't close the panel
 * underneath it.
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
  const onCloseRef = useRef(onClose);
  const closeTimerRef = useRef<number | null>(null);
  const closeStartedRef = useRef(false);
  const maximizedRef = useRef(false);
  const nativeFullscreenRef = useRef(false);

  const safeInitialIndex = Math.max(
    0,
    Math.min(initialIndex, Math.max(images.length - 1, 0)),
  );
  const [activeIndex, setActiveIndex] = useState(safeInitialIndex);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isCleanView, setIsCleanView] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const closeLightbox = useCallback(() => {
    if (closeStartedRef.current) return;
    closeStartedRef.current = true;
    setIsClosing(true);
    const closeDelay = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : 160;
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current();
    }, closeDelay);
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;

    dialogRef.current?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();

        // First Escape leaves browser fullscreen; a second Escape closes the
        // lightbox. CSS-maximized fallback behaves the same way.
        if (document.fullscreenElement === dialogRef.current) {
          void document.exitFullscreen().catch(() => undefined);
          return;
        }
        if (maximizedRef.current) {
          maximizedRef.current = false;
          setIsMaximized(false);
          return;
        }
        closeLightbox();
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

    // Capture phase ensures this viewer consumes Escape/Tab before the
    // section panel underneath it receives the same key event.
    document.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      if (document.fullscreenElement === dialogRef.current) {
        void document.exitFullscreen().catch(() => undefined);
      }
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [closeLightbox]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const wasNativeFullscreen = nativeFullscreenRef.current;
      const isNativeFullscreen =
        document.fullscreenElement === dialogRef.current;
      nativeFullscreenRef.current = isNativeFullscreen;

      if (isNativeFullscreen) {
        maximizedRef.current = true;
        setIsMaximized(true);
      } else if (wasNativeFullscreen) {
        // A browser-driven exit (for example Escape) should also clear the
        // visual fullscreen state. A manual CSS-maximize never fires this
        // branch because it was never using native fullscreen.
        maximizedRef.current = false;
        setIsMaximized(false);
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  const toggleFullscreen = async () => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (document.fullscreenElement === dialog) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }

    if (maximizedRef.current && !nativeFullscreenRef.current) {
      maximizedRef.current = false;
      setIsMaximized(false);
      return;
    }

    if (typeof dialog.requestFullscreen === "function") {
      try {
        await dialog.requestFullscreen();
        nativeFullscreenRef.current = true;
        maximizedRef.current = true;
        setIsMaximized(true);
        return;
      } catch {
        // Fullscreen can be unavailable in embedded contexts. Fall back to a
        // viewport-filling CSS layout so the control still has a useful action.
      }
    }

    maximizedRef.current = true;
    setIsMaximized(true);
  };

  const handleOverlayMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeLightbox();
  };
  const displayedIndex = images.length > 0 ? activeIndex + 1 : 0;

  const overlayClassName = [
    styles.overlay,
    isMaximized ? styles.overlayMaximized : "",
    isClosing ? styles.overlayClosing : "",
  ]
    .filter(Boolean)
    .join(" ");

  const dialogClassName = [
    styles.dialog,
    isMaximized ? styles.maximized : "",
    isCleanView ? styles.cleanView : "",
    isClosing ? styles.closing : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div className={overlayClassName} onMouseDown={handleOverlayMouseDown}>
      <div
        ref={dialogRef}
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className={styles.srOnly}>
          {t("lightbox.dialogLabel", { title })}
        </h2>

        <div className={styles.titlebar}>
          <div
            className={styles.windowControls}
            role="group"
            aria-label="Image viewer controls"
          >
            <button
              type="button"
              className={`${styles.windowControl} ${styles.closeControl}`}
              onClick={closeLightbox}
              aria-label={t("lightbox.close")}
              title={t("lightbox.close")}
              disabled={isClosing}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                <path d="M3 3 9 9M9 3 3 9" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.windowControl} ${styles.maximizeControl}`}
              onClick={() => void toggleFullscreen()}
              aria-label={isMaximized ? "Exit fullscreen" : "Enter fullscreen"}
              title={isMaximized ? "Exit fullscreen" : "Enter fullscreen"}
              aria-pressed={isMaximized}
              disabled={isClosing}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                {isMaximized ? (
                  <path d="M4.5 1.5v3h-3M7.5 10.5v-3h3M1.5 7.5h3v3M10.5 4.5h-3v-3" />
                ) : (
                  <path d="M1.5 4V1.5H4M8 1.5h2.5V4M10.5 8v2.5H8M4 10.5H1.5V8" />
                )}
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.windowControl} ${styles.focusControl}`}
              onClick={() => setIsCleanView((current) => !current)}
              aria-label={
                isCleanView ? "Show inspection HUD" : "Enable clean image view"
              }
              title={
                isCleanView ? "Show inspection HUD" : "Enable clean image view"
              }
              aria-pressed={isCleanView}
              disabled={isClosing}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                {isCleanView ? (
                  <path d="M2 2 10 10M4.1 4.1a2.7 2.7 0 0 0 3.8 3.8M5 2.2A5.4 5.4 0 0 1 11 6a5.5 5.5 0 0 1-1 1.5M2 3.2A5.5 5.5 0 0 0 1 6s1.8 3.8 5 3.8" />
                ) : (
                  <path d="M1 6s1.8-3.8 5-3.8S11 6 11 6 9.2 9.8 6 9.8 1 6 1 6Z M6 4.5A1.5 1.5 0 1 0 6 7.5A1.5 1.5 0 1 0 6 4.5Z" />
                )}
              </svg>
            </button>
          </div>

          <div className={styles.windowHeading}>
            <span className={styles.windowEyebrow}>// IMAGE INSPECTOR</span>
            <span className={styles.windowTitle}>{title}</span>
          </div>

          <div className={styles.connectionStatus} aria-hidden="true">
            <span className={styles.signalDot} />
            <span>FEED ACTIVE</span>
          </div>
        </div>

        <Swiper
          modules={[Navigation, Keyboard, A11y]}
          navigation
          keyboard={{ enabled: true }}
          initialSlide={safeInitialIndex}
          onSlideChange={(swiper: { realIndex: number }) =>
            setActiveIndex(swiper.realIndex)
          }
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
            <SwiperSlide key={`${src}-${n}`} className={styles.slide}>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary originals */}
              <img
                src={cloudinaryFull(src)}
                alt={t("lightbox.imageAlt", { n: n + 1, title })}
                loading={n === safeInitialIndex ? "eager" : "lazy"}
                decoding="async"
                className={styles.image}
              />
            </SwiperSlide>
          ))}
        </Swiper>

        <div className={styles.footer}>
          <span
            className={`${styles.footerMeta} ${styles.footerMetaStart}`}
            aria-hidden="true"
          >
            SOURCE // ORIGINAL
          </span>
          <div
            className={styles.readout}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label={`Image ${displayedIndex} of ${images.length}`}
          >
            <span className={styles.srOnly}>
              Image {displayedIndex} of {images.length}
            </span>
            <span
              className={styles.readoutDigits}
              key={activeIndex}
              aria-hidden="true"
            >
              <SegmentNumber value={activeIndex + 1} />
              <span className={styles.readoutDivider}>/</span>
              <SegmentNumber value={images.length} />
            </span>
          </div>
          <span
            className={`${styles.footerMeta} ${styles.footerMetaEnd}`}
            aria-hidden="true"
          >
            {String(displayedIndex).padStart(2, "0")} // FRAME INDEX
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
