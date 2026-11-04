"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { SECTION_META } from "@/content/sections";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store/hooks";
import { PORTAL_LINKS } from "@/content/links";
import { selectActiveSection, selectIsModalOpen } from "@/store/selectors";
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
  arcadeOpened,
  bugsSquashed,
  portalBlocked,
  stationNearbyChanged,
  terminalOpened,
} from "@/store/slices/worldSlice";
import { isPortalId, type PortalId } from "@/types";
import {
  Experience,
  ExperienceDisposedError,
  WebGLUnavailableError,
} from "@/three/Experience";
import type { SceneLabels, TimelineCommit } from "@/three/labels";
import { readModelChoice } from "./modelChoiceStorage";
import styles from "./ExperienceClient.module.css";

/**
 * Opens a portal's link. The hold that triggers it started with a key or
 * pointer press, so browsers usually allow the new tab; if one is blocked,
 * the caller shows a link to click instead.
 */
function openPortal(id: PortalId): boolean {
  const url = PORTAL_LINKS[id];
  if (url.startsWith("mailto:")) {
    window.location.href = url;
    return true;
  }
  const tab = window.open(url, "_blank");
  if (!tab) return false;
  tab.opener = null;
  return true;
}

/** Persian and Arabic-Indic digits → ASCII (the floor glyph atlas only draws 0–9). */
function asciiDigits(value: string): string {
  return value
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Experience and education entries from the `experience` namespace, as git commits. */
function buildTimeline(t: TFunction): TimelineCommit[] {
  const read = (key: string, education: boolean): TimelineCommit[] => {
    const items = t(key, { ns: "experience", returnObjects: true });
    if (!Array.isArray(items)) return [];
    return items.flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const { title, period, org } = item as {
        title?: unknown;
        period?: unknown;
        org?: unknown;
      };
      if (typeof title !== "string") return [];
      const periodText = typeof period === "string" ? period : "";
      const year = asciiDigits(periodText).match(/\d{4}/)?.[0] ?? "";
      const orgText = Array.isArray(org) ? org.map(String).join(" · ") : "";
      return [
        { id: title, year, education, period: periodText, title, org: orgText },
      ];
    });
  };
  return [
    ...read("experience.items", false),
    ...read("experience.education", true),
  ];
}

/** Translated text for the WebGL world, read from the `ui`, `common` and `experience` namespaces. */
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
      firewall: t("world.firewall", { ns: "ui" }),
      accessDenied: t("world.accessDenied", { ns: "ui" }),
      terminal: t("world.terminal", { ns: "ui" }),
      bugFixed: t("world.bugFixed", { ns: "ui" }),
      gitInitial: t("world.gitInitial", { ns: "ui" }),
      gitMerge: t("world.gitMerge", { ns: "ui" }),
      gitMain: t("world.gitMain", { ns: "ui" }),
      gitWork: t("world.gitWork", { ns: "ui" }),
      gitEdu: t("world.gitEdu", { ns: "ui" }),
      gitCommit: t("world.gitCommit", { ns: "ui" }),
      blueprint: t("world.blueprint", { ns: "ui" }),
      blueprintPlan: t("world.blueprintPlan", { ns: "ui" }),
      blueprintRoomA: t("world.blueprintRoomA", { ns: "ui" }),
      blueprintRoomB: t("world.blueprintRoomB", { ns: "ui" }),
      arcade: t("world.arcade", { ns: "ui" }),
      warehouse: t("world.warehouse", { ns: "ui" }),
      packages: t("world.packages", {
        ns: "ui",
        returnObjects: true,
      }) as SceneLabels["world"]["packages"],
      stackSign: t("world.stackSign", { ns: "ui" }),
      stackDone: t("world.stackDone", { ns: "ui" }),
      stackTiers: t("world.stackTiers", {
        ns: "ui",
        returnObjects: true,
      }) as SceneLabels["world"]["stackTiers"],
      portals: t("world.portals", {
        ns: "ui",
        returnObjects: true,
      }) as SceneLabels["world"]["portals"],
    },
    timeline: buildTimeline(t),
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
  const modalOpen = useAppSelector(selectIsModalOpen);
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  const { t, i18n } = useTranslation(["ui", "common", "experience"]);
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
      experience.events.on("bugsSquashed", (count) =>
        dispatch(bugsSquashed(count)),
      ),
      experience.events.on("stationNearbyChange", (id) =>
        dispatch(stationNearbyChanged(id)),
      ),
      experience.events.on("stationActivated", (id) => {
        if (id === "terminal") dispatch(terminalOpened());
        else if (id === "arcade") dispatch(arcadeOpened());
        else if (isPortalId(id) && !openPortal(id)) dispatch(portalBlocked(id));
      }),
    ];

    experience
      .init()
      .then(() => {
        if (cancelled) return;
        experienceRef.current = experience;
        // A section may have been opened from the index while loading.
        experience.setActiveSection(store.getState().portfolio.activeSection);
        const world = store.getState().world;
        experience.setModalOpen(world.terminalOpen || world.arcadeOpen);
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

  // …and the terminal or arcade window (gameplay input pauses while it is open).
  useEffect(() => {
    experienceRef.current?.setModalOpen(modalOpen);
  }, [modalOpen]);

  return (
    <div
      ref={containerRef}
      className={styles.canvasHost}
      data-testid="experience-canvas"
    />
  );
}
