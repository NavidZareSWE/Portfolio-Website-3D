"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSectionText } from "@/i18n/useSectionText";
import { useExperience } from "@/components/experience/ExperienceContext";
import { SECTION_META_BY_ID } from "@/content/sections";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";
import { useAppSelector } from "@/store/hooks";
import {
  selectGameStatus,
  selectIsCharging,
  selectIsOverlayOpen,
  selectPromptCard,
} from "@/store/selectors";
import type { ControlKey } from "@/types";
import { WobbleKey, initialBiteDelay, nextBiteDelay } from "./wobble";
import styles from "./WASDGuide.module.css";

/**
 * Reference geometry ("Jagged wobbly effect.html"): 88-unit keys, 12-unit gap.
 * The bottom row follows a real keyboard: Shift sits under A (left), and
 * Space spans the two columns under S and D. The pad keeps its size.
 */
const UNIT = 88;
const GAP = 12;
const BOTTOM_HEIGHT = 56;
const SPACE_WIDTH = UNIT * 2 + GAP;

/** Keys on the pad: the game controls plus Shift (sprint). */
type GuideKey = ControlKey | "Shift";

/** A key press plays the same bite as the idle schedule, so input is visible. */
const BITE_ON_PRESS = true;

interface KeyDefinition {
  id: GuideKey;
  label: string;
  className: string;
  width: number;
  height: number;
}

const KEYS: readonly KeyDefinition[] = [
  { id: "KeyW", label: "W", className: styles.keyW, width: UNIT, height: UNIT },
  { id: "KeyA", label: "A", className: styles.keyA, width: UNIT, height: UNIT },
  { id: "KeyS", label: "S", className: styles.keyS, width: UNIT, height: UNIT },
  { id: "KeyD", label: "D", className: styles.keyD, width: UNIT, height: UNIT },
  {
    id: "Shift",
    label: "SHIFT",
    className: styles.keyShift,
    width: UNIT,
    height: BOTTOM_HEIGHT,
  },
  {
    id: "Space",
    label: "SPACE",
    className: styles.keySpace,
    width: SPACE_WIDTH,
    height: BOTTOM_HEIGHT,
  },
];

interface KeyNodes {
  root: HTMLDivElement | null;
  shape: SVGPathElement | null;
  shadow: SVGPathElement | null;
}

/**
 * Bottom-right control guide.
 *
 * Animation is a direct port of the supplied reference: every key outline
 * is a polygon of spring points; at random 1.5–3.6 s intervals (staggered
 * per key) one edge or corner is bitten inward, held, and springs back.
 * The hard shadow is the same path offset by (5, 5), so it deforms with
 * the key. Only colours and typography are adapted to the world.
 *
 * Bites are skipped while the tab is hidden, while the guide is hidden and
 * when the user prefers reduced motion. All per-frame work writes straight
 * to the SVG; React does not re-render during the animation.
 */
export default function WASDGuide() {
  const { t, i18n } = useTranslation("ui");
  const sectionText = useSectionText();
  const experience = useExperience();
  const status = useAppSelector(selectGameStatus);
  const overlayOpen = useAppSelector(selectIsOverlayOpen);
  const promptCard = useAppSelector(selectPromptCard);
  const charging = useAppSelector(selectIsCharging);
  const reducedMotion = usePrefersReducedMotion();
  const nodes = useRef<Partial<Record<GuideKey, KeyNodes>>>({});
  const visible = status === "ready" && !overlayOpen;
  const nearMeta = promptCard ? SECTION_META_BY_ID[promptCard] : undefined;

  useEffect(() => {
    if (!visible) return;
    const refs = nodes.current;
    const keys = new Map<GuideKey, WobbleKey>(
      KEYS.map((key) => [key.id, new WobbleKey(key.width, key.height)]),
    );

    const write = (id: GuideKey, key: WobbleKey) => {
      const d = key.toPath();
      refs[id]?.shape?.setAttribute("d", d);
      refs[id]?.shadow?.setAttribute("d", d);
    };
    keys.forEach((key, id) => write(id, key));

    // One shared rAF loop runs only while at least one key is mid-bite.
    let frame = 0;
    const tick = (now: number) => {
      let animating = false;
      keys.forEach((key, id) => {
        if (!key.isBusy) return;
        animating = key.update(now) || animating;
        write(id, key);
      });
      frame = animating ? requestAnimationFrame(tick) : 0;
    };
    const bite = (id: GuideKey) => {
      if (reducedMotion || document.hidden) return;
      const key = keys.get(id);
      if (!key || key.isBusy) return;
      key.trigger(performance.now());
      if (!frame) frame = requestAnimationFrame(tick);
    };

    // Reference scheduling: initial stagger, then schedule() → wait → bite → schedule().
    const timers = new Set<number>();
    const later = (seconds: number, run: () => void) => {
      const handle = window.setTimeout(() => {
        timers.delete(handle);
        run();
      }, seconds * 1000);
      timers.add(handle);
    };
    const schedule = (id: GuideKey) =>
      later(nextBiteDelay(), () => {
        bite(id);
        schedule(id);
      });
    KEYS.forEach((key, index) =>
      later(initialBiteDelay(index), () => schedule(key.id)),
    );

    // Pressed state mirrors the game's real input.
    const setPressed = (id: GuideKey, pressed: boolean) => {
      refs[id]?.root?.classList.toggle(styles.active, pressed);
      if (pressed && BITE_ON_PRESS) bite(id);
    };
    const unsubscribers = experience
      ? [
          experience.input.events.on("change", ({ key, pressed }) =>
            setPressed(key, pressed),
          ),
          experience.input.events.on("sprint", ({ pressed }) =>
            setPressed("Shift", pressed),
          ),
        ]
      : [];
    if (experience) {
      KEYS.forEach((key) =>
        setPressed(
          key.id,
          key.id === "Shift"
            ? experience.input.isSprinting()
            : experience.input.isDown(key.id),
        ),
      );
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      timers.forEach((handle) => window.clearTimeout(handle));
      cancelAnimationFrame(frame);
      KEYS.forEach((key) =>
        refs[key.id]?.root?.classList.remove(styles.active),
      );
    };
  }, [experience, visible, reducedMotion]);

  const bind =
    (id: GuideKey, part: keyof KeyNodes) =>
    (el: HTMLDivElement | SVGPathElement | null) => {
      const entry = (nodes.current[id] ??= {
        root: null,
        shape: null,
        shadow: null,
      });
      (entry as Record<keyof KeyNodes, Element | null>)[part] = el;
    };

  return (
    <div
      className={`${styles.guide} ${visible ? styles.visible : ""}`}
      role="img"
      aria-label={t("guide.aria")}
    >
      <div
        className={`${styles.pad} ${nearMeta ? styles.accessReady : ""}`}
        aria-hidden="true"
      >
        {KEYS.map((key) => (
          <div
            key={key.id}
            className={`${styles.key} ${key.className}`}
            ref={bind(key.id, "root")}
          >
            <svg
              viewBox={`0 0 ${key.width} ${key.height}`}
              className={styles.svg}
              focusable="false"
            >
              <path
                className={styles.shadow}
                transform="translate(5,5)"
                ref={bind(key.id, "shadow")}
              />
              <path className={styles.shape} ref={bind(key.id, "shape")} />
            </svg>
            <span className={styles.label}>{key.label}</span>
          </div>
        ))}
      </div>
      <p className={styles.hint} aria-hidden="true" dir={i18n.dir()}>
        {nearMeta ? (
          <>
            <span className={styles.hintAccent}>
              {withScript(
                charging ? t("guide.accessing") : t("guide.holdSpace"),
              )}
            </span>
            <br />
            {withScript(
              t("guide.access", {
                title: sectionText(nearMeta.id).title.toUpperCase(),
              }),
            )}
          </>
        ) : (
          <>
            {withScript(t("guide.move"))}
            <br />
            {withScript(t("guide.jump"))}
            <br />
            {withScript(t("guide.sprint"))}
          </>
        )}
      </p>
    </div>
  );
}

/** Runs of Persian/Arabic script, with the spaces and ZWNJs between words. */
const SCRIPT_RUN =
  /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:[\s\u200C]+[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]+)*/g;

/**
 * The hint uses a 9px pixel font, which has no Persian glyphs; the Persian
 * fallback at that size is far smaller than the Latin key names. Persian runs
 * get their own span (and size) so both scripts read at the same weight.
 */
function withScript(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(SCRIPT_RUN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <span key={start} className={styles.script}>
        {match[0]}
      </span>,
    );
    last = start + match[0].length;
  }
  if (last === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
