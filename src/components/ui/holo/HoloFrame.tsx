import type { HTMLAttributes, ReactNode, Ref } from "react";
import styles from "./Holo.module.css";

interface HoloFrameProps extends HTMLAttributes<HTMLDivElement> {
  /** Two-digit index or short label shown as `// index` (top-left). */
  index?: string;
  /** Terminal-style code shown top-right, e.g. `0x302A`. */
  code?: string;
  /** Adds the card's scanline texture. */
  scanlines?: boolean;
  /** Tighter padding and smaller brackets for chips and prompts. */
  compact?: boolean;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/**
 * The holographic card frame, as HTML: glass panel, hairline cyan rule,
 * corner brackets, optional `// 0X` header and scanlines. Every interface
 * surface uses it so the UI reads as part of the same projected system
 * as the in-world cards.
 */
export default function HoloFrame({
  index,
  code,
  scanlines = true,
  compact = false,
  className,
  children,
  ref,
  ...rest
}: HoloFrameProps) {
  return (
    <div
      ref={ref}
      className={`${styles.frame} ${compact ? styles.compact : ""} ${scanlines ? styles.scanlines : ""} ${className ?? ""}`}
      {...rest}
    >
      <span className={`${styles.bracket} ${styles.tl}`} aria-hidden="true" />
      <span className={`${styles.bracket} ${styles.tr}`} aria-hidden="true" />
      <span className={`${styles.bracket} ${styles.bl}`} aria-hidden="true" />
      <span className={`${styles.bracket} ${styles.br}`} aria-hidden="true" />
      {(index || code) && (
        <div className={styles.header} aria-hidden="true">
          <span>{index ? `// ${index}` : ""}</span>
          <span className={styles.code}>{code}</span>
        </div>
      )}
      {children}
    </div>
  );
}

/** Row of `=` glyphs used as a divider, matching the card texture. */
export function GlyphRule({ className }: { className?: string }) {
  return (
    <div className={`${styles.rule} ${className ?? ""}`} aria-hidden="true">
      {"=".repeat(96)}
    </div>
  );
}

/**
 * The card's hold/progress track. `fillRef` lets callers stream progress
 * straight into the DOM (transform) without React renders.
 */
export function HoloTrack({
  value,
  fillRef,
  className,
}: {
  value?: number;
  fillRef?: Ref<HTMLSpanElement>;
  className?: string;
}) {
  return (
    <span className={`${styles.track} ${className ?? ""}`} aria-hidden="true">
      <span
        ref={fillRef}
        className={styles.fill}
        style={
          value === undefined ? undefined : { transform: `scaleX(${value})` }
        }
      />
    </span>
  );
}

/** Bracketed mono button: `[ LABEL ]` styling used for HUD and panel actions. */
export function holoButtonClass(extra?: string) {
  return `${styles.button} ${extra ?? ""}`;
}
