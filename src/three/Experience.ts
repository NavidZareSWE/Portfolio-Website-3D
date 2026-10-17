import {
  ACESFilmicToneMapping,
  Group,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Object3D,
  type Scene,
  type Shape,
  type Texture,
  type Camera,
} from "three";
import type { SectionId } from "@/types";
import { CameraController } from "./camera/CameraController";
import { CardRegistry } from "./cards/CardRegistry";
import { Character, loadCharacterModel } from "./character/Character";
import { CharacterAnimation } from "./character/CharacterAnimation";
import { CharacterController } from "./character/CharacterController";
import {
  createLogoMaskTexture,
  fetchLogoSvg,
  parseLogoShapes,
} from "./character/logo";
import { renderCharacterPortrait } from "./character/portrait";
import { RENDER } from "./config";
import { DEFAULT_LABELS, type SceneLabels } from "./labels";
import {
  AdaptiveResolution,
  cappedDevicePixelRatio,
  detectQualityProfile,
} from "./quality/Quality";
import {
  AVAILABLE_TIERS,
  classifyNetwork,
  decideTier,
  isTouchDevice,
  readConnection,
  type GpuClass,
  type ModelChoice,
  type ModelTier,
  type NetworkClass,
} from "./quality/ModelDetail";
import { DEV_OVERRIDES, IS_DEVELOPMENT } from "./quality/devOverrides";
import { createAsciiAtlas } from "./effects/AsciiAtlas";
import { FONTS } from "@/theme/theme";
import { InputManager } from "./input/InputManager";
import { InteractionSystem } from "./interaction/InteractionSystem";
import { CollisionSystem } from "./physics/CollisionSystem";
import { createEnvironment, type Environment } from "./scene/createEnvironment";
import { createScene, type SceneLights } from "./scene/createScene";
import { loadGlyphTemplate, type FigureTemplate } from "./world/GlyphFigure";
import {
  createVignettes,
  loadMaskTextures,
  type Vignettes,
} from "./world/createVignettes";
import { disposeObject } from "./utils/disposeResources";
import { EventEmitter } from "./utils/EventEmitter";
import { damp } from "./utils/math";

export interface ExperienceEvents {
  loadProgress: { step: string; progress: number };
  nearbyChange: SectionId | null;
  chargeChange: boolean;
  /** Continuous 0..1 hold progress. High-frequency: never route through Redux. */
  chargeProgress: number;
  activate: SectionId;
  /** The tab was hidden (simulation paused) or shown again. */
  pausedChange: boolean;
  /** Player model detail: choice, shown tier, automatic tier, loading state. */
  modelDetail: ModelDetailState;
}

export interface ModelDetailState {
  /** What the visitor selected: "auto" or a fixed tier. */
  choice: ModelChoice;
  /** The model on screen now. */
  tier: ModelTier;
  /** What "auto" resolves to on this device. */
  auto: ModelTier;
  /** Tier being downloaded for a switch, if any. */
  loading: ModelTier | null;
  /** Where the starting tier came from. */
  source: "auto" | "saved" | "dev";
  gpu: GpuClass;
  network: NetworkClass;
  renderer: string | null;
  reason: string;
}

export interface ExperienceOptions {
  reducedMotion: boolean;
  /** Translated text drawn inside the world (cards, scene signs). */
  labels?: SceneLabels;
  /** The visitor's saved model-detail choice (default "auto"). */
  modelChoice?: ModelChoice;
}

/** Largest simulation step; longer frames are split into sub-steps. */
const MAX_STEP = 1 / 60;
/** Frames longer than this (tab switch, debugger) are clamped. */
const MAX_FRAME = 0.1;

/** The browser could not create a WebGL context (shown to visitors as "WebGL unavailable"). */
export class WebGLUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGLUnavailableError";
  }
}

export class ExperienceDisposedError extends Error {
  constructor() {
    super("Experience was disposed during initialisation");
    this.name = "ExperienceDisposedError";
  }
}

/**
 * Owns the Three.js world: renderer, scene, systems and the single
 * animation loop. React talks to it through a small surface —
 * `events`, `input`, `setActiveSection`, `setReducedMotion`, `dispose` —
 * and never receives per-frame data except via explicit subscriptions.
 */
export class Experience {
  readonly events = new EventEmitter<ExperienceEvents>();
  readonly input = new InputManager();

  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private lights: SceneLights | null = null;
  private cameraController: CameraController | null = null;
  private environment: Environment | null = null;
  private vignettes: Vignettes | null = null;
  private cards: CardRegistry | null = null;
  private character: Character | null = null;
  private controller: CharacterController | null = null;
  private animation: CharacterAnimation | null = null;
  private interaction: InteractionSystem | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private abort = new AbortController();

  private disposed = false;
  private running = false;
  private lastTime = 0;
  private elapsed = 0;
  private activeSection: SectionId | null = null;
  private reducedMotion: boolean;
  private readonly labels: SceneLabels;
  private adaptive: AdaptiveResolution | null = null;
  private readonly initialChoice: ModelChoice;
  private detail: ModelDetailState | null = null;
  private swapAbort: AbortController | null = null;
  private logoShapes: Shape[] | null = null;
  private lastRenderAt = 0;

  private readonly move = new Vector2();
  private readonly zeroMove = new Vector2();
  private readonly cardFocus: number[] = [];

  constructor(
    private readonly container: HTMLElement,
    options: ExperienceOptions,
  ) {
    this.reducedMotion = options.reducedMotion;
    this.labels = options.labels ?? DEFAULT_LABELS;
    this.initialChoice = options.modelChoice ?? "auto";
  }

  /* ------------------------------------------------------------------------ */
  /* Lifecycle                                                                */
  /* ------------------------------------------------------------------------ */

  async init(): Promise<void> {
    this.step("renderer", 0.1);
    const renderer = this.createRenderer();
    this.renderer = renderer;
    this.container.appendChild(renderer.domElement);

    this.step("fonts", 0.25);
    await this.loadFonts();
    this.assertAlive();

    this.step("emblem", 0.35);
    let logoSvg: string | null = null;
    try {
      logoSvg = await fetchLogoSvg(this.abort.signal);
    } catch (error) {
      this.assertAlive();
      // The world still works without the emblem; report and continue.
      console.warn(
        "[experience] Logo unavailable, continuing without it:",
        error,
      );
    }
    this.assertAlive();

    this.step("models", 0.5);
    const signal = this.abort.signal;
    const glyphLoad = loadGlyphTemplate(signal);
    const masksLoad = loadMaskTextures(signal);
    // Connection class: the Network Information API where the browser has it;
    // otherwise the glyph model's download (needed anyway) is the speed sample.
    const connection = readConnection();
    const sample = connection ? null : (await glyphLoad).sample;
    this.assertAlive();
    const profile = this.adaptive?.profile;
    const decision = decideTier(
      DEV_OVERRIDES.gpu ?? profile?.gpu ?? "unknown",
      DEV_OVERRIDES.net ?? classifyNetwork(connection, sample),
      isTouchDevice(),
    );
    const saved =
      this.initialChoice !== "auto" &&
      AVAILABLE_TIERS.includes(this.initialChoice)
        ? this.initialChoice
        : null;
    const tier = DEV_OVERRIDES.lod ?? saved ?? decision.tier;
    this.detail = {
      choice: saved ?? "auto",
      tier,
      auto: decision.tier,
      loading: null,
      source: DEV_OVERRIDES.lod ? "dev" : saved ? "saved" : "auto",
      gpu: decision.gpu,
      network: decision.network,
      renderer: profile?.renderer ?? null,
      reason: decision.reason,
    };
    if (IS_DEVELOPMENT) {
      console.info(
        `[experience] player model: ${tier} (${this.detail.source}); auto would pick ${decision.tier}: ${decision.reason}; renderer: ${profile?.renderer ?? "n/a"}`,
      );
    }
    const [model, glyph, maskTextures] = await Promise.all([
      loadCharacterModel(tier, signal),
      glyphLoad,
      masksLoad,
    ]);
    this.assertAlive();

    this.step("world", 0.65);
    this.buildWorld(renderer, model, logoSvg, {
      template: glyph.template,
      maskTextures,
    });

    this.step("shaders", 0.8);
    const { scene } = this;
    const camera = this.cameraController!.camera;
    this.environment!.prepare(renderer, camera);
    await renderer.compileAsync(scene!, camera);
    this.assertAlive();

    // First frame before reporting ready, so the loading screen never
    // reveals an empty canvas.
    this.resize();
    this.renderFrame();

    this.input.attach(window);
    this.running = true;
    this.lastTime = performance.now();
    this.lastRenderAt = this.lastTime;
    renderer.setAnimationLoop(this.tick);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.step("ready", 1);
    this.emitDetail();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.abort.abort();
    this.swapAbort?.abort();
    this.renderer?.setAnimationLoop(null);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.resizeObserver?.disconnect();
    this.input.detach();
    this.events.clear();
    delete document.documentElement.dataset.quality;
    this.environment?.dispose();
    if (this.scene) disposeObject(this.scene);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.scene = null;
    this.renderer = null;
  }

  /* ------------------------------------------------------------------------ */
  /* Public API used by React                                                 */
  /* ------------------------------------------------------------------------ */

  /** Mirrors Redux `portfolio.activeSection` into the world. Idempotent. */
  setActiveSection(id: SectionId | null) {
    if (id === this.activeSection) return;
    this.activeSection = id;
    const controller = this.controller;
    const interaction = this.interaction;
    // Whatever is held right now (e.g. the Space that opened the card) must be
    // released before it can act again.
    this.input.reset();
    controller?.cancelJumpRequest();
    if (!controller || !interaction || !this.cameraController) return;

    if (id) {
      interaction.reset();
      this.cameraController.setFocus(this.cards?.get(id)?.focusPoint ?? null);
    } else {
      // The player was never moved, so position and facing are preserved as-is.
      this.cameraController.setFocus(null);
      interaction.resync(controller.position);
    }
  }

  /** Current model-detail state (null until the world is loaded). */
  get modelDetail(): ModelDetailState | null {
    return this.detail;
  }

  /**
   * Switches the player model. The new tier is downloaded and swapped in at
   * the same position and pose; the old model is released. A newer request
   * cancels one still downloading.
   */
  async setModelChoice(choice: ModelChoice) {
    if (!this.detail || !this.scene || this.disposed) return;
    const tier = choice === "auto" ? this.detail.auto : choice;
    this.detail = {
      ...this.detail,
      choice,
      source: choice === "auto" ? "auto" : "saved",
    };
    if (tier === this.detail.tier) {
      this.swapAbort?.abort();
      this.detail = { ...this.detail, loading: null };
      this.emitDetail();
      return;
    }
    this.swapAbort?.abort();
    const request = new AbortController();
    this.swapAbort = request;
    this.detail = { ...this.detail, loading: tier };
    this.emitDetail();
    try {
      const model = await loadCharacterModel(tier, request.signal);
      if (
        request.signal.aborted ||
        this.disposed ||
        !this.scene ||
        !this.character
      )
        return;
      const next = new Character(model, this.logoShapes);
      const previous = this.character;
      this.scene.remove(previous.rig.root);
      disposeObject(previous.rig.root);
      this.scene.add(next.rig.root);
      this.character = next;
      this.animation?.setRig(next.rig);
      this.syncCharacterTransform();
      this.detail = { ...this.detail, tier, loading: null };
    } catch (error) {
      if (request.signal.aborted || this.disposed) return;
      console.warn(
        "[experience] Model detail switch failed, keeping the current model:",
        error,
      );
      this.detail = { ...this.detail, loading: null };
    }
    this.emitDetail();
  }

  private emitDetail() {
    if (this.detail) this.events.emit("modelDetail", this.detail);
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    this.environment?.setReducedMotion(reduced);
    this.vignettes?.setReducedMotion(reduced);
    this.cameraController?.setReducedMotion(reduced);
  }

  /* ------------------------------------------------------------------------ */
  /* Construction                                                             */
  /* ------------------------------------------------------------------------ */

  private createRenderer(): WebGLRenderer {
    let renderer: WebGLRenderer;
    try {
      const profile = detectQualityProfile();
      renderer = new WebGLRenderer({
        antialias: profile.antialias,
        powerPreference: "high-performance",
      });
      this.adaptive = new AdaptiveResolution(profile, () => this.resize());
    } catch (error) {
      throw new WebGLUnavailableError(
        `WebGL could not be initialised (${error instanceof Error ? error.message : "unknown error"}).`,
      );
    }
    renderer.setPixelRatio(this.adaptive?.current ?? cappedDevicePixelRatio());
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.addEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
    return renderer;
  }

  private async loadFonts() {
    if (!("fonts" in document)) return;
    try {
      await Promise.all([
        document.fonts.load(`700 48px ${FONTS.mono}`),
        document.fonts.load(`800 48px ${FONTS.mono}`),
        document.fonts.load(`500 20px ${FONTS.mono}`),
        // Persian card text (the sample string selects the Arabic-script subset).
        document.fonts.load(`800 48px ${FONTS.persian}`, "سلام"),
        document.fonts.load(`500 20px ${FONTS.persian}`, "سلام"),
      ]);
    } catch {
      // Fallback fonts are acceptable; textures still render.
    }
  }

  private buildWorld(
    renderer: WebGLRenderer,
    model: Object3D,
    logoSvg: string | null,
    assets: {
      template: FigureTemplate;
      maskTextures: { white: Texture; dark: Texture };
    },
  ) {
    const { scene, lights } = createScene();
    this.scene = scene;
    this.lights = lights;

    const maxAnisotropy = Math.min(
      renderer.capabilities.getMaxAnisotropy(),
      this.adaptive?.profile.maxAnisotropy ?? Infinity,
    );
    const atlas = createAsciiAtlas(maxAnisotropy);
    const logoShapes: Shape[] | null = logoSvg
      ? parseLogoShapes(logoSvg)
      : null;
    this.logoShapes = logoShapes;
    const logoMask = createLogoMaskTexture(
      logoSvg ?? '<svg viewBox="0 0 1 1"></svg>',
    );

    const collisions = new CollisionSystem();

    // Character first: the About card shows it rendered in ASCII.
    this.character = new Character(model, logoShapes);
    scene.add(this.character.rig.root);
    const portrait = renderCharacterPortrait(renderer, this.character.rig.root);

    const cardGroup = new Group();
    cardGroup.name = "cards";
    scene.add(cardGroup);
    this.cards = new CardRegistry(cardGroup, collisions, {
      logoSvg,
      portrait,
      maxAnisotropy,
      labels: this.labels,
    });
    this.cardFocus.length = 0;
    this.cards.cards.forEach(() => this.cardFocus.push(0));

    this.environment = createEnvironment(atlas, logoMask, collisions);
    this.cards.cards.forEach((card, i) =>
      this.environment!.floor.setCardPosition(i, card.anchor),
    );
    scene.add(this.environment.group);

    // Glyph scenes beside each card (figures, props and their colliders).
    this.vignettes = createVignettes({
      labels: this.labels,
      atlas,
      template: assets.template,
      collisions,
      logoShapes,
      logoMask,
      maskTextures: assets.maskTextures,
    });
    scene.add(this.vignettes.group);

    this.controller = new CharacterController(collisions);
    this.animation = new CharacterAnimation(this.character.rig);

    this.interaction = new InteractionSystem(this.cards.cards, {
      onNearbyChange: (id) => this.events.emit("nearbyChange", id),
      onChargeChange: (charging) => this.events.emit("chargeChange", charging),
      onProgress: (progress) => this.events.emit("chargeProgress", progress),
      onActivate: (id) => {
        // Enter section mode immediately so no further gameplay input leaks
        // through before React has dispatched and re-rendered.
        this.setActiveSection(id);
        this.events.emit("activate", id);
      },
    });

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.cameraController = new CameraController(width / Math.max(1, height));
    this.cameraController.snapTo(this.controller.position);

    this.setReducedMotion(this.reducedMotion);
    this.syncCharacterTransform();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  /* ------------------------------------------------------------------------ */
  /* Frame loop                                                               */
  /* ------------------------------------------------------------------------ */

  private tick = (now: number) => {
    if (
      !this.running ||
      !this.renderer ||
      !this.scene ||
      !this.cameraController
    )
      return;

    // Reading a section on a constrained device: the world behind the panel
    // renders at a lower rate, leaving the main thread to the panel (scrolling).
    const adaptive = this.adaptive;
    const reading =
      this.activeSection !== null && adaptive?.constrained === true;
    if (reading && now - this.lastRenderAt < 1000 / RENDER.readingFps - 2)
      return;
    const interval = (now - this.lastRenderAt) / 1000;
    this.lastRenderAt = now;

    const frame = Math.min(
      MAX_FRAME,
      Math.max(0, (now - this.lastTime) / 1000),
    );
    this.lastTime = now;
    this.elapsed += frame;

    const steps = Math.max(1, Math.ceil(frame / MAX_STEP));
    const dt = frame / steps;
    for (let i = 0; i < steps; i++) this.simulate(dt);

    this.updateVisuals(frame);
    this.renderFrame();
    // Throttled frames are slow on purpose; only free-running frames drive the resolution.
    if (!reading) adaptive?.sample(interval);
  };

  /** Fixed-size sub-step of gameplay simulation. */
  private simulate(dt: number) {
    const controller = this.controller!;
    const interaction = this.interaction!;
    const exploring = this.activeSection === null;

    let move = this.zeroMove;
    if (exploring) {
      move = this.input.getMoveVector(this.move);

      // 1. Proximity first, so Space is resolved against the current zone.
      interaction.updateProximity(controller.position);

      // 2. Space: interaction has priority over jumping near a card.
      if (this.input.consumePress("Space")) {
        if (!interaction.handleActionPress()) controller.requestJump();
      }

      // 3. Hold progress uses the live key state (release cancels).
      interaction.updateCharge(dt, this.input.isDown("Space"));
    } else {
      // Section open: drop any stray press edges.
      this.input.consumePress("Space");
    }

    // Activation inside updateCharge may have just opened a section.
    const stillExploring = this.activeSection === null;
    // Turn toward the card being opened while Space is held.
    const chargingCard =
      stillExploring && interaction.chargingId
        ? this.cards!.get(interaction.chargingId)
        : undefined;
    controller.setFaceTarget(chargingCard?.anchor ?? null);

    const events = controller.update(
      dt,
      stillExploring ? move : this.zeroMove,
      stillExploring && this.input.isSprinting(),
    );

    this.animation!.update({
      dt,
      time: this.elapsed,
      groundSpeed: controller.groundSpeed,
      grounded: controller.grounded,
      verticalVelocity: controller.velocity.y,
      jumped: events.jumped,
      landingImpact: events.landingImpact,
      charging: interaction.chargingId !== null,
    });
  }

  private updateVisuals(frame: number) {
    const controller = this.controller!;
    const interaction = this.interaction!;
    const motion = this.reducedMotion ? 0.15 : 1;

    this.syncCharacterTransform();
    this.lights!.playerGlow.position.set(
      controller.position.x,
      controller.position.y + 0.35,
      controller.position.z,
    );

    this.cards!.cards.forEach((card, i) => {
      const focused =
        card.id === this.activeSection ||
        (this.activeSection === null && card.id === interaction.nearbyId);
      this.cardFocus[i] = damp(this.cardFocus[i], focused ? 1 : 0, 6, frame);
      const progress =
        card.id === this.activeSection
          ? 1
          : card.id === interaction.progressId
            ? interaction.progress
            : 0;
      card.update(this.elapsed, this.cardFocus[i], progress, motion);
    });

    this.environment!.update(this.elapsed, controller.position, this.cardFocus);
    this.vignettes!.update(this.elapsed, frame, controller.position);
    this.cameraController!.update(
      frame,
      controller.position,
      controller.velocity,
    );
  }

  private syncCharacterTransform() {
    const root = this.character!.rig.root;
    const controller = this.controller!;
    root.position.copy(controller.position);
    root.rotation.y = controller.yaw;
  }

  /* ------------------------------------------------------------------------ */
  /* Helpers                                                                  */
  /* ------------------------------------------------------------------------ */

  private resize = () => {
    if (!this.renderer || !this.cameraController) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(
      this.adaptive?.current ?? cappedDevicePixelRatio(),
    );
    this.renderer.setSize(width, height, false);
    this.publishQuality();
    this.cameraController.resize(width, height);
  };

  /**
   * Marks the page while the device is constrained (`<html data-quality="low">`),
   * so the UI can drop effects that are expensive without a GPU (backdrop blur).
   */
  private publishQuality() {
    const constrained = this.adaptive?.constrained ?? false;
    document.documentElement.dataset.quality = constrained ? "low" : "high";
  }

  /** Off-screen passes (the floor's per-cell field), then the scene. */
  renderFrame(camera: Camera | undefined = this.cameraController?.camera) {
    if (!this.renderer || !this.scene || !camera) return;
    this.environment?.prepare(this.renderer, camera);
    this.renderer.render(this.scene, camera);
  }

  /** Current render scale (device pixels per CSS pixel). */
  get renderScale() {
    return this.adaptive?.current ?? this.renderer?.getPixelRatio() ?? 1;
  }

  /** Pause the simulation and rendering while the tab is hidden. */
  private onVisibilityChange = () => {
    if (!this.renderer || this.disposed) return;
    const hidden = document.visibilityState === "hidden";
    this.running = !hidden;
    if (hidden) {
      this.renderer.setAnimationLoop(null);
    } else {
      this.lastTime = performance.now();
      this.lastRenderAt = this.lastTime;
      this.renderer.setAnimationLoop(this.tick);
    }
    this.events.emit("pausedChange", hidden);
  };

  private onContextLost = (event: Event) => {
    event.preventDefault();
    console.warn("[experience] WebGL context lost");
  };

  private step(step: string, progress: number) {
    if (!this.disposed) this.events.emit("loadProgress", { step, progress });
  }

  private assertAlive() {
    if (this.disposed) throw new ExperienceDisposedError();
  }
}
