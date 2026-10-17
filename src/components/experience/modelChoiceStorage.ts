import { isModelChoice, type ModelChoice } from "@/three/quality/ModelDetail";

const KEY = "nzswe:model-detail";

/** The visitor's model-detail choice, kept in this browser only. Storage may be unavailable. */
export function readModelChoice(): ModelChoice {
  try {
    const value = window.localStorage.getItem(KEY);
    return isModelChoice(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

export function saveModelChoice(choice: ModelChoice) {
  try {
    if (choice === "auto") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
}
