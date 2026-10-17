"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import WASDGuide from "@/components/controls/WASDGuide";
import TouchControls from "@/components/controls/TouchControls";
import Hud from "@/components/ui/Hud";
import InteractionPrompt from "@/components/ui/InteractionPrompt";
import LoadingScreen from "@/components/ui/LoadingScreen";
import PortfolioOverlay from "@/components/ui/PortfolioOverlay";
import { STAGE_ID } from "@/config/layout";
import { useIsTouchOnly } from "@/hooks/useMediaQuery";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectAppMode } from "@/store/selectors";
import { gameFailed } from "@/store/slices/gameSlice";
import type { Experience } from "@/three/Experience";
import { ExperienceContext } from "./ExperienceContext";
import ExperienceErrorBoundary from "./ExperienceErrorBoundary";
import styles from "./ExperienceShell.module.css";

/*
 * Browser-only boundary: Three.js and every WebGL/window access live behind
 * this dynamic import, so the server render contains only the HTML UI
 * (loading screen, HUD shell) and never touches browser APIs.
 */
const ExperienceClient = dynamic(() => import("./ExperienceClient"), {
  ssr: false,
});

/** Composes the 3D stage with the React interface layered above it. */
export default function ExperienceShell() {
  const [experience, setExperience] = useState<Experience | null>(null);
  const isTouchOnly = useIsTouchOnly();
  const { t } = useTranslation("ui");
  const dispatch = useAppDispatch();
  // Explicit app mode, exposed on the stage for styling and automated checks.
  const mode = useAppSelector(selectAppMode);

  const handleSceneError = useCallback(
    (message: string) => {
      console.error("[experience] scene crashed:", message);
      dispatch(gameFailed("stopped"));
    },
    [dispatch],
  );

  return (
    <ExperienceContext.Provider value={experience}>
      <div
        id={STAGE_ID}
        className={styles.stage}
        tabIndex={-1}
        data-mode={mode}
        aria-label={t("page.stage")}
      >
        <ExperienceErrorBoundary onError={handleSceneError}>
          <ExperienceClient onExperienceChange={setExperience} />
        </ExperienceErrorBoundary>
      </div>

      <Hud />
      <InteractionPrompt touchMode={isTouchOnly} />
      {isTouchOnly ? <TouchControls /> : <WASDGuide />}
      <PortfolioOverlay />
      <LoadingScreen />
    </ExperienceContext.Provider>
  );
}
