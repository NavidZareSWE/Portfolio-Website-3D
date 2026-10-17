import {
  CanvasTexture,
  ExtrudeGeometry,
  LinearFilter,
  NoColorSpace,
  type BufferGeometry,
  type Shape,
} from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

export const LOGO_URL = "/logo/nzswe-logo.svg";

/** Fetches the supplied NZSWE SVG source once; shapes and masks derive from it. */
export async function fetchLogoSvg(signal?: AbortSignal): Promise<string> {
  const response = await fetch(LOGO_URL, { signal });
  if (!response.ok) throw new Error(`Logo request failed (${response.status})`);
  return response.text();
}

/** Converts the SVG's filled paths into Three.js shapes (unaltered geometry). */
export function parseLogoShapes(svgText: string): Shape[] {
  const data = new SVGLoader().parse(svgText);
  const shapes: Shape[] = [];
  for (const path of data.paths) shapes.push(...path.toShapes());
  if (shapes.length === 0) throw new Error("Logo SVG contained no shapes");
  return shapes;
}

/**
 * Rasterises the SVG's own path data into a white-on-black mask, used where
 * the logo is written in glyphs (floor, card faces). Aspect ratio preserved.
 */
export function drawLogo(
  ctx: CanvasRenderingContext2D,
  svgText: string,
  x: number,
  y: number,
  height: number,
  color: string,
) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  const [, , vbW, vbH] = (svg?.getAttribute("viewBox") ?? "0 0 100 100")
    .split(/[\s,]+/)
    .map(Number);
  const scale = height / vbH;
  ctx.save();
  ctx.translate(x - (vbW * scale) / 2, y - height / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  doc.querySelectorAll("path").forEach((path) => {
    const d = path.getAttribute("d");
    if (d) ctx.fill(new Path2D(d));
  });
  ctx.restore();
}

export function createLogoMaskTexture(
  svgText: string,
  size = 256,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for logo mask");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  drawLogo(ctx, svgText, size / 2, size / 2, size * 0.96, "#fff");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * Builds a thin extruded emblem `height` units tall, centred on the origin.
 * SVG space is Y-down, so Y is flipped; Z is flipped as well, which keeps
 * the determinant positive (correct winding) and leaves the emblem
 * readable when viewed from +Z.
 */
export function createLogoGeometry(
  shapes: Shape[],
  height: number,
  depth = 0.012,
): BufferGeometry {
  const geometry = new ExtrudeGeometry(shapes, {
    depth: 1,
    bevelEnabled: false,
    // Emblems are 7–13 cm tall (10–25 px on screen): 4 segments per curve
    // are indistinguishable from more and keep the four emblems per figure cheap.
    curveSegments: 4,
  });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const scale = height / (box.max.y - box.min.y);
  geometry.translate(
    -(box.min.x + box.max.x) / 2,
    -(box.min.y + box.max.y) / 2,
    0,
  );
  geometry.scale(scale, -scale, -depth);
  geometry.computeVertexNormals();
  return geometry;
}
