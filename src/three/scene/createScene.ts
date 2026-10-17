import { THEME } from "@/theme/theme";
import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PointLight,
  Scene,
} from "three";

export interface SceneLights {
  /** Low cyan light that follows the player, standing in for floor bounce. */
  playerGlow: PointLight;
}

/**
 * Scene, fog and a restrained three-light rig: cool hemisphere fill, a soft
 * key from the camera side and a cyan rim from behind so the dark hoodie
 * keeps a readable silhouette against the dark floor.
 */
export function createScene(): { scene: Scene; lights: SceneLights } {
  const scene = new Scene();
  scene.background = new Color(THEME.bg);
  scene.fog = new Fog(THEME.bg, 42, 95);

  const hemisphere = new HemisphereLight("#7d90bd", "#03050a", 0.75);
  scene.add(hemisphere);

  const key = new DirectionalLight("#e3ecff", 2.6);
  key.position.set(6, 12, 9);
  scene.add(key);

  const rim = new DirectionalLight("#35d8ff", 1.7);
  rim.position.set(-7, 5, -9);
  scene.add(rim);

  const playerGlow = new PointLight("#3fd6ff", 2.2, 3.2, 1.6);
  scene.add(playerGlow);

  return { scene, lights: { playerGlow } };
}
