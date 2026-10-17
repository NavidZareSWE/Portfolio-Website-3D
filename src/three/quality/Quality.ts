import { RENDER } from "../config";
import { classifyGpu, type GpuClass } from "./ModelDetail";

/**
 * Rendering quality for the device in hand.
 *
 * The world is fill-bound: almost all of a frame is spent shading pixels
 * (the glyph floor, towers and scenes), while the simulation takes well under
 * a millisecond. So the main lever is the number of pixels rendered, which
 * `AdaptiveResolution` tunes continuously from measured frame times.
 */
export interface QualityProfile {
  /** No GPU: the browser rasterises WebGL on the CPU (SwiftShader, llvmpipe, WARP). */
  software: boolean;
  /** MSAA. Fixed when the context is created; off for software rendering. */
  antialias: boolean;
  /** Highest render scale (device pixels per CSS pixel) the device may reach. */
  maxScale: number;
  /** Scale used for the first frames, before any measurement. */
  startScale: number;
  /**
   * Cap on anisotropic filtering of the glyph textures. On a CPU rasteriser
   * each extra probe is paid per pixel; 2x looks the same as 8x from this
   * camera and halves the floor's sampling cost.
   */
  maxAnisotropy: number;
  /** WebGL renderer string, when the browser exposes it. */
  renderer: string | null;
  /** GPU class guessed from the renderer string (see ModelDetail.classifyGpu). */
  gpu: GpuClass;
}

const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

/**
 * Whether WebGL would run without hardware acceleration, and the renderer
 * string. Uses the standard `failIfMajorPerformanceCaveat` context flag,
 * with the renderer string as a fallback where the browser exposes it.
 */
export function detectGpu(): { software: boolean; renderer: string | null } {
  const probe = (options?: WebGLContextAttributes) => {
    const canvas = document.createElement("canvas");
    return canvas.getContext(
      "webgl2",
      options,
    ) as WebGL2RenderingContext | null;
  };
  const release = (gl: WebGL2RenderingContext | null) =>
    gl?.getExtension("WEBGL_lose_context")?.loseContext();

  const rendererOf = (gl: WebGL2RenderingContext) => {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const value = gl.getParameter(
      info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER,
    );
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  const strict = probe({ failIfMajorPerformanceCaveat: true });
  if (!strict) {
    const loose = probe();
    const renderer = loose ? rendererOf(loose) : null;
    release(loose);
    // A context exists, but only without acceleration.
    if (loose) return { software: true, renderer };
    return { software: false, renderer: null };
  }
  const renderer = rendererOf(strict);
  release(strict);
  return {
    software: renderer !== null && SOFTWARE_RENDERER.test(renderer),
    renderer,
  };
}

export function cappedDevicePixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio);
}

export function detectQualityProfile(): QualityProfile {
  const deviceRatio = cappedDevicePixelRatio();
  const { software, renderer } = detectGpu();
  const gpu = classifyGpu(renderer, software);
  if (software) {
    return {
      software,
      renderer,
      gpu,
      antialias: false,
      maxScale: Math.min(deviceRatio, RENDER.softwareMaxScale),
      startScale: Math.min(deviceRatio, RENDER.softwareStartScale),
      maxAnisotropy: RENDER.softwareMaxAnisotropy,
    };
  }
  return {
    software,
    renderer,
    gpu,
    antialias: true,
    maxScale: deviceRatio,
    startScale: Math.min(deviceRatio, RENDER.startScale),
    maxAnisotropy: 8,
  };
}

/**
 * Dynamic resolution. Once per second the average frame interval is
 * compared with the target: slow frames lower the render scale (two steps
 * when very slow), sustained headroom raises it one step. An increase that
 * has to be undone shortly after blocks further increases for a growing
 * period, so the scale settles instead of oscillating.
 */
export class AdaptiveResolution {
  readonly profile: QualityProfile;
  private scale: number;
  private frames = 0;
  private sum = 0;
  private clock = 0;
  private lastChange = 0;
  private lastIncrease = -Infinity;
  private increaseBlockedUntil = 0;
  private failedIncreases = 0;

  constructor(
    profile: QualityProfile,
    private readonly apply: (scale: number) => void,
  ) {
    this.profile = profile;
    this.scale = profile.startScale;
  }

  get current() {
    return this.scale;
  }

  /** True while the device cannot hold full quality (used to drop costly extras). */
  get constrained() {
    return (
      this.profile.software ||
      this.scale < Math.min(1, this.profile.maxScale) - 1e-3
    );
  }

  /** Feed the wall-clock interval of every rendered frame (seconds). */
  sample(interval: number) {
    // Tab switches, breakpoints and long GC pauses are not representative.
    if (interval <= 0 || interval > 0.25) return;
    this.clock += interval;
    this.frames++;
    this.sum += interval;
    if (this.sum < RENDER.adaptWindow) return;

    const average = this.sum / this.frames;
    this.frames = 0;
    this.sum = 0;

    if (average > 1 / RENDER.minFps) {
      const steps = average > 1 / (RENDER.minFps * 0.6) ? 2 : 1;
      if (this.clock - this.lastIncrease < RENDER.settleTime) {
        // The last increase did not hold: wait longer before the next one.
        this.failedIncreases++;
        this.increaseBlockedUntil =
          this.clock + RENDER.settleTime * 2 ** this.failedIncreases;
      }
      this.set(this.scale * RENDER.scaleStep ** steps);
    } else if (
      average < 1 / RENDER.headroomFps &&
      this.clock >= this.increaseBlockedUntil &&
      this.clock - this.lastChange >= RENDER.settleTime
    ) {
      if (this.set(this.scale / RENDER.scaleStep))
        this.lastIncrease = this.clock;
    }
  }

  private set(next: number): boolean {
    const clamped =
      Math.round(
        Math.min(this.profile.maxScale, Math.max(RENDER.minScale, next)) * 100,
      ) / 100;
    if (clamped === this.scale) return false;
    this.scale = clamped;
    this.lastChange = this.clock;
    this.apply(clamped);
    return true;
  }
}
