import {
  MeshBasicMaterial,
  ShaderMaterial,
  type Material,
  type Mesh,
  type Object3D,
} from "three";
import { GLSL_HASH } from "../effects/AsciiAtlas";
import { GLSL_FADE } from "./GlyphKit";

/** Seconds for a full fade out (entering) and back in (leaving). */
const FADE_OUT_TIME = 0.35;
const FADE_IN_TIME = 0.55;

/**
 * Fades one pass-through group (a figure and its furniture) in and out.
 *
 * Vignette materials are shared between scenes, so a group gets its own
 * copies the first time it fades. The copies share every uniform object with
 * the originals (time, atlas, animated reveal values) except `uFade`, which
 * is shared within the group. Copies compile to the same programs as the
 * originals, so fading costs no extra shader compiles and no extra draw calls.
 */
export class Fader {
  private readonly fade = { value: 1 };
  private readonly copies = new Map<Material, Material>();
  private readonly owned = new Set<Material>();
  private value = 1;

  constructor(private readonly object: Object3D) {}

  /** Moves toward hidden (`inside`) or shown, at the fade speed. */
  update(inside: boolean, dt: number) {
    const target = inside ? 0 : 1;
    if (this.value === target) return;
    const step = dt / (inside ? FADE_OUT_TIME : FADE_IN_TIME);
    this.set(
      inside ? Math.max(0, this.value - step) : Math.min(1, this.value + step),
    );
  }

  /** Sets the fade directly (1 = shown, 0 = gone), for fades driven by an animation clock. */
  set(value: number) {
    if (value === this.value) return;
    // Pick up any meshes added since the last fade (e.g. a mask put on mid-scene).
    if (this.value === 1) this.adoptMaterials();
    this.value = value;
    this.fade.value = value;
    // Fully faded: skip the draw calls entirely.
    this.object.visible = value > 0;
  }

  private adoptMaterials() {
    this.object.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => this.copyOf(material))
        : this.copyOf(mesh.material);
    });
  }

  private copyOf(material: Material): Material {
    if (this.owned.has(material)) return material;
    let copy = this.copies.get(material);
    if (!copy) {
      copy = fadeableCopy(material, this.fade);
      this.copies.set(material, copy);
      this.owned.add(copy);
    }
    return copy;
  }
}

function fadeableCopy(material: Material, fade: { value: number }): Material {
  if (material instanceof ShaderMaterial && "uFade" in material.uniforms) {
    const copy = material.clone();
    // clone() deep-copies uniforms; re-link them so shared/animated values stay live.
    copy.uniforms = { ...material.uniforms, uFade: fade };
    return copy;
  }
  if (material instanceof MeshBasicMaterial) {
    const copy = material.clone();
    // Same dissolve as the glyph shaders, in 5 px screen cells.
    copy.onBeforeCompile = (shader) => {
      shader.uniforms.uFade = fade;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "void main() {",
          `${GLSL_HASH}\n${GLSL_FADE}\nvoid main() {\n  fadeCell(floor(gl_FragCoord.xy / 5.0));`,
        )
        .replace(
          "#include <dithering_fragment>",
          "gl_FragColor.rgb *= fadeDim();\n#include <dithering_fragment>",
        );
    };
    copy.customProgramCacheKey = () => "glyph-fade-basic";
    return copy;
  }
  // Anything else keeps its material; the group still disappears when fully faded.
  return material;
}
