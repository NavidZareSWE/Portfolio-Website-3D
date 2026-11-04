import { FONTS } from "@/theme/theme";
import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import { MONO_FONT_FAMILY } from "../effects/AsciiAtlas";
import { CRISP_LAYER } from "../render/CrispComposite";
import { drawLegibleText, roundedRect } from "./canvasText";
import { FACE_CAMERA_PITCH, PERSIAN_SCRIPT } from "./Vignette";

/** One coloured piece of a label line. */
export interface LabelRun {
  text: string;
  color: string;
  /** Font size relative to the line (default 1). */
  size?: number;
  bold?: boolean;
}

/**
 * Canvas pixels per metre. The label is stretched by FORESHORTENING along
 * its height, so this is about 160 px per metre on screen-facing axes: sharp
 * from the follow camera and with a section open.
 */
const PIXELS_PER_METRE = 300;
/**
 * Seen from the fixed camera, a flat plane is foreshortened by the sine of
 * the camera's pitch; the label is stretched by the inverse along its
 * height so the text reads with normal proportions.
 */
const FORESHORTENING = 1 / Math.sin(Math.abs(FACE_CAMERA_PITCH));

/**
 * Readable text lying on the floor (commit labels, the blueprint's title):
 * a canvas texture on a flat plane in the full-resolution text layer. The
 * label's left edge sits at its position; `width` and `height` are the
 * footprint before the foreshortening stretch, in metres.
 */
export class FloorLabel {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;

  constructor(
    width: number,
    height: number,
    lines: readonly LabelRun[][],
    options: {
      align?: "left" | "center";
      glow?: boolean;
      /** A dark rounded plate behind each line, so text reads over the glyph floor. */
      plate?: boolean;
    } = {},
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * PIXELS_PER_METRE);
    canvas.height = Math.round(height * PIXELS_PER_METRE);
    const ctx = canvas.getContext("2d")!;
    ctx.textBaseline = "middle";
    const lineHeight = canvas.height / Math.max(1, lines.length);

    lines.forEach((runs, i) => {
      const y = (i + 0.5) * lineHeight;
      const fonts = runs.map((run) => {
        const size = Math.round(lineHeight * 0.66 * (run.size ?? 1));
        const family = PERSIAN_SCRIPT.test(run.text)
          ? FONTS.persian
          : MONO_FONT_FAMILY;
        return `${run.bold ? 700 : 500} ${size}px ${family}`;
      });
      const gap = lineHeight * 0.45;
      const widths = runs.map((run, k) => {
        ctx.font = fonts[k];
        return ctx.measureText(run.text).width;
      });
      const total = widths.reduce((a, b) => a + b, 0) + gap * (runs.length - 1);
      // Shrink a line that does not fit, so translated text never overflows.
      const fit = Math.min(1, (canvas.width * 0.9) / Math.max(1, total));
      const pad = lineHeight * 0.22;
      let x =
        options.align === "center" ? (canvas.width - total * fit) / 2 : pad + 2;
      if (options.plate !== false) {
        ctx.fillStyle = "rgba(2, 9, 13, 0.72)";
        roundedRect(
          ctx,
          x - pad,
          y - lineHeight * 0.46,
          total * fit + pad * 2,
          lineHeight * 0.92,
          lineHeight * 0.2,
        );
        ctx.fill();
      }
      runs.forEach((run, k) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(fit, fit);
        ctx.font = fonts[k];
        ctx.direction = PERSIAN_SCRIPT.test(run.text) ? "rtl" : "ltr";
        ctx.textAlign = "left";
        drawLegibleText(ctx, run.text, 0, 0, {
          color: run.color,
          glow: options.glow === false ? 0 : lineHeight * 0.14,
          outline: lineHeight * 0.08,
        });
        ctx.restore();
        x += (widths[k] + gap) * fit;
      });
    });

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    const geometry = new PlaneGeometry(width, height);
    // Pivot on the left edge (or the centre) of the label.
    if (options.align !== "center") geometry.translate(width / 2, 0, 0);
    this.mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.scale.y = FORESHORTENING;
    this.mesh.position.y = 0.02;
    this.mesh.renderOrder = 10;
    this.mesh.layers.set(CRISP_LAYER);
  }
}
