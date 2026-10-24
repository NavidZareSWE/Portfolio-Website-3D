"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { SECTION_META } from "@/content/sections";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store/hooks";
import { selectActiveSection } from "@/store/selectors";
import {
  gameFailed,
  gameReady,
  loadProgressed,
  pausedChanged,
} from "@/store/slices/gameSlice";
import {
  chargingChanged,
  nearbyCardChanged,
} from "@/store/slices/interactionSlice";
import { sectionOpened } from "@/store/slices/portfolioSlice";
import {
  Experience,
  ExperienceDisposedError,
  WebGLUnavailableError,
} from "@/three/Experience";
import type { SceneLabels } from "@/three/labels";
import { readModelChoice } from "./modelChoiceStorage";
import styles from "./ExperienceClient.module.css";

/** Translated text for the WebGL world, read from the `ui` and `common` namespaces. */
function buildSceneLabels(t: TFunction, rtl: boolean): SceneLabels {
  const caps = (value: string) => (rtl ? value : value.toUpperCase());
  const sections = Object.fromEntries(
    SECTION_META.map(({ id }) => {
      const tagline = t(`cards.tagline.${id}`, {
        ns: "ui",
        returnObjects: true,
      });
      return [
        id,
        {
          title: t(`sections.${id}.title`, { ns: "ui" }),
          summary: t(`sections.${id}.summary`, { ns: "ui" }),
          tagline: Array.isArray(tagline) ? tagline.map(String) : [],
        },
      ];
    }),
  ) as SceneLabels["sections"];
  return {
    rtl,
    sections,
    cards: {
      prompt: t("prompt.hold", { ns: "ui" }),
      nameLabel: t("cards.name", { ns: "ui" }),
      fullName: caps(t("fullName", { ns: "common" })),
      classLabel: t("cards.class", { ns: "ui" }),
      role: t("cards.role", { ns: "ui" }),
      status: t("cards.status", { ns: "ui" }),
    },
    world: {
      calling: t("world.calling", { ns: "ui" }),
      underConstruction: t("world.underConstruction", { ns: "ui" }),
      build: t("world.build", { ns: "ui" }),
      server: t("world.server", { ns: "ui" }),
      database: t("world.database", { ns: "ui" }),
      scanner: t("world.scanner", { ns: "ui" }),
      routing: t("world.routing", { ns: "ui" }),
      routingTradeoff: t("world.routingTradeoff", { ns: "ui" }),
      smallModel: t("world.smallModel", { ns: "ui" }),
      largeModel: t("world.largeModel", { ns: "ui" }),
      detected: t("world.detected", { ns: "ui" }),
    },
  };
}

interface ExperienceClientProps {
  onExperienceChange: (experience: Experience | null) => void;
}

/**
 * Hosts the Three.js canvas. Loaded with `ssr: false`, so everything in
 * this module (and Three.js itself) only ever runs in the browser.
 *
 * Strict Mode mounts effects twice in development; the first instance is
 * fully disposed (loop stopped, listeners removed, GPU resources freed)
 * and any async initialisation it started aborts via `ExperienceDisposedError`.
 */
export default function ExperienceClient({
  onExperienceChange,
}: ExperienceClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const experienceRef = useRef<Experience | null>(null);
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const activeSection = useAppSelector(selectActiveSection);
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  const { t, i18n } = useTranslation(["ui", "common"]);
  const language = i18n.language;
  // The world is rebuilt when the language changes (card faces are baked textures).
  const labels = useMemo(
    () => buildSceneLabels(t, i18n.dir(language) === "rtl"),
    [t, i18n, language],
  );

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
    experienceRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const experience = new Experience(container, {
      reducedMotion: reducedMotionRef.current,
      labels,
      modelChoice: readModelChoice(),
    });

    // Simulation → Redux: only discrete, meaningful changes are dispatched.
    const unsubscribers = [
      experience.events.on("loadProgress", (p) => dispatch(loadProgressed(p))),
      experience.events.on("nearbyChange", (id) =>
        dispatch(nearbyCardChanged(id)),
      ),
      experience.events.on("chargeChange", (charging) =>
        dispatch(chargingChanged(charging)),
      ),
      experience.events.on("activate", (id) => dispatch(sectionOpened(id))),
      experience.events.on("pausedChange", (paused) =>
        dispatch(pausedChanged(paused)),
      ),
    ];

    experience
      .init()
      .then(() => {
        if (cancelled) return;
        experienceRef.current = experience;
        // A section may have been opened from the index while loading.
        experience.setActiveSection(store.getState().portfolio.activeSection);
        onExperienceChange(experience);
        dispatch(gameReady());
      })
      .catch((error: unknown) => {
        if (cancelled || error instanceof ExperienceDisposedError) return;
        console.error("[experience] initialisation failed", error);
        // The UI shows a translated message for each failure kind (ui:loading.*).
        dispatch(
          gameFailed(
            error instanceof WebGLUnavailableError ? "webgl" : "start",
          ),
        );
      });

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (experienceRef.current === experience) {
        experienceRef.current = null;
        onExperienceChange(null);
      }
      experience.dispose();
    };
  }, [dispatch, store, onExperienceChange, labels]);

  // Redux → simulation: mirror the open section (camera focus, input mode).
  useEffect(() => {
    experienceRef.current?.setActiveSection(activeSection);
  }, [activeSection]);

  return (
    <div
      ref={containerRef}
      className={styles.canvasHost}
      data-testid="experience-canvas"
    />
  );
}
