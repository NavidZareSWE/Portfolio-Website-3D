import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderTarget,
  type Object3D,
  type WebGLRenderer,
} from "three";
import type { PortraitImage } from "../cards/cardFace";

/**
 * Renders the actual character model once, off-screen, and returns its
 * luminance. The About card converts this into ASCII glyphs, mirroring the
 * hooded ASCII portrait on the card reference. The clone shares geometry
 * and materials with the live character, so nothing here needs disposal
 * except the temporary render target.
 */
export function renderCharacterPortrait(
  renderer: WebGLRenderer,
  character: Object3D,
  width = 180,
  height = 220,
): PortraitImage {
  const scene = new Scene();
  scene.background = new Color(0x000000);
  scene.add(new HemisphereLight("#ffffff", "#202020", 1.6));
  const key = new DirectionalLight("#ffffff", 3.2);
  key.position.set(-2, 3, 4);
  const rim = new DirectionalLight("#ffffff", 2.2);
  rim.position.set(3, 2, -3);
  scene.add(key, rim);

  const clone = character.clone(true);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0.35, 0);
  scene.add(clone);

  const camera = new PerspectiveCamera(24, width / height, 0.1, 20);
  camera.position.set(0.35, 1.0, 4.4);
  camera.lookAt(0, 0.82, 0);

  const target = new WebGLRenderTarget(width, height);
  const pixels = new Uint8Array(width * height * 4);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  renderer.setRenderTarget(previous);
  target.dispose();

  // GPU rows are bottom-up: flip, convert to luminance, normalise contrast.
  const luminance = new Float32Array(width * height);
  let max = 1e-3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = ((height - 1 - y) * width + x) * 4;
      const l =
        (0.299 * pixels[src] +
          0.587 * pixels[src + 1] +
          0.114 * pixels[src + 2]) /
        255;
      luminance[y * width + x] = l;
      if (l > max) max = l;
    }
  }
  for (let i = 0; i < luminance.length; i++)
    luminance[i] = Math.pow(luminance[i] / max, 0.65);
  return { width, height, luminance };
}
