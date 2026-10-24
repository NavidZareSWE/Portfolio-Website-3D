import {
  AlwaysDepth,
  BufferGeometry,
  DepthTexture,
  Float32BufferAttribute,
  LinearFilter,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";

/**
 * Layer of the meshes that carry text (card faces, scene signs). The camera
 * renders it together with layer 0 in the single pass, and on its own in
 * the second pass of the composite below. Lights must be on it too: the
 * light count is part of every shader program, so a pass without lights
 * would compile a second program for each material.
 */
export const CRISP_LAYER = 1;

/** Puts the scene's lights on the text layer as well (see above). */
export function shareLightsWithCrispLayer(scene: Scene) {
  scene.traverse((object) => {
    if ((object as { isLight?: boolean }).isLight)
      object.layers.enable(CRISP_LAYER);
  });
}

const blitVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Copies the world (already tone-mapped and sRGB-encoded) and its depth to
// the canvas, so the text pass is still hidden behind nearer objects.
const blitFragment = /* glsl */ `
uniform sampler2D uColor;
uniform sampler2D uDepth;
varying vec2 vUv;
void main() {
  gl_FragColor = texture(uColor, vUv);
  gl_FragDepth = texture(uDepth, vUv).r;
}
`;

/**
 * Keeps text sharp while the adaptive resolution lowers the render scale.
 *
 * The canvas stays at the text's pixel ratio. The world (every layer except
 * `CRISP_LAYER`) is rendered into a smaller target at the adaptive scale,
 * stretched onto the canvas together with its depth, and the text meshes are
 * then rendered at the canvas's full resolution on top, depth-tested
 * against the world.
 *
 * The world pass has to produce exactly what a canvas pass would: tone
 * mapping and the sRGB output conversion are applied per material only when
 * three.js renders to the canvas or to an XR target. The target is therefore
 * flagged as one (`isXRRenderTarget`, read in WebGLRenderer and
 * WebGLPrograms for exactly this, and in WebGLTextures for the format) and
 * stores its bytes unconverted (`RGBA8`), like the canvas.
 */
export class CrispComposite {
  private target: WebGLRenderTarget | null = null;
  private readonly material: ShaderMaterial;
  private readonly quad: Mesh;
  private readonly blitScene = new Scene();
  private readonly blitCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private readonly samples: number) {
    const geometry = new BufferGeometry();
    // One triangle that covers the screen.
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    geometry.setAttribute(
      "uv",
      new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2),
    );
    this.material = new ShaderMaterial({
      vertexShader: blitVertex,
      fragmentShader: blitFragment,
      uniforms: { uColor: { value: null }, uDepth: { value: null } },
      depthTest: true,
      depthFunc: AlwaysDepth,
      depthWrite: true,
      toneMapped: false,
    });
    this.quad = new Mesh(geometry, this.material);
    this.quad.frustumCulled = false;
    this.blitScene.add(this.quad);
  }

  /** Size of the world pass in device pixels. */
  setSize(width: number, height: number) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (!this.target) {
      const depthTexture = new DepthTexture(w, h, UnsignedIntType);
      depthTexture.minFilter = depthTexture.magFilter = NearestFilter;
      const target = new WebGLRenderTarget(w, h, {
        samples: this.samples,
        depthTexture,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        generateMipmaps: false,
      });
      // See the class comment: tone mapping and sRGB output like the canvas,
      // stored as plain RGBA8.
      target.texture.internalFormat = "RGBA8";
      target.texture.colorSpace = "srgb";
      (target as { isXRRenderTarget?: boolean }).isXRRenderTarget = true;
      this.target = target;
      this.material.uniforms.uColor.value = target.texture;
      this.material.uniforms.uDepth.value = depthTexture;
    } else if (this.target.width !== w || this.target.height !== h) {
      this.target.setSize(w, h);
    }
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    const target = this.target;
    if (!target) return;
    const layers = camera.layers.mask;
    const autoClear = renderer.autoClear;

    // 1. The world at the adaptive scale.
    camera.layers.disable(CRISP_LAYER);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);

    // 2. Stretched onto the canvas, with its depth.
    renderer.setRenderTarget(null);
    renderer.render(this.blitScene, this.blitCamera);

    // 3. Text at the canvas resolution. A colour background clears the
    // canvas even without autoClear, so it is detached for this pass.
    const background = scene.background;
    scene.background = null;
    camera.layers.set(CRISP_LAYER);
    renderer.autoClear = false;
    renderer.render(scene, camera);

    scene.background = background;
    renderer.autoClear = autoClear;
    camera.layers.mask = layers;
  }

  /** Releases the world target (the composite is off at full resolution). */
  release() {
    this.target?.depthTexture?.dispose();
    this.target?.dispose();
    this.target = null;
  }

  dispose() {
    this.release();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
