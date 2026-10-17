"use client";

import { createContext, useContext } from "react";
import type { Experience } from "@/three/Experience";

/**
 * Exposes the live Experience instance (or null while loading) to UI
 * components that need a direct, non-Redux channel to the simulation:
 * the WASD guide (key states), the prompt (hold progress) and touch
 * controls (virtual input). Only the type is imported here, so this
 * module never pulls Three.js into the server bundle.
 */
export const ExperienceContext = createContext<Experience | null>(null);

export function useExperience(): Experience | null {
  return useContext(ExperienceContext);
}
