import { THEME } from "@/theme/theme";
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  Shape,
  Vector3,
} from "three";
import type { SectionMeta } from "@/content/sections";
import type { SectionId } from "@/types";
import { CARD } from "../config";
import { YAW_FACING_CAMERA } from "../utils/math";
import {
  CARD_CUT_FRACTION,
  createCardFace,
  type CardText,
  type PortraitImage,
} from "./cardFace";

/** Octagon (cut corners) centred on the origin, matching the card face texture. */
function octagon(
  width: number,
  height: number,
  cut: number,
  inset = 0,
): Shape | Path {
  const w = width / 2 - inset;
  const h = height / 2 - inset;
  const c = Math.max(0.001, cut - inset * 0.4);
  const shape = new Shape();
  shape.moveTo(-w + c, -h);
  shape.lineTo(w - c, -h);
  shape.lineTo(w, -h + c);
  shape.lineTo(w, h - c);
  shape.lineTo(w - c, h);
  shape.lineTo(-w + c, h);
  shape.lineTo(-w, h - c);
  shape.lineTo(-w, -h + c);
  shape.closePath();
  return shape;
}

/** Geometries/materials identical for every card are created once and shared. */
export interface SharedCardResources {
  face: PlaneGeometry;
  body: ExtrudeGeometry;
  rim: ExtrudeGeometry;
  halo: PlaneGeometry;
  emitter: CylinderGeometry;
  emitterMaterial: MeshStandardMaterial;
  bodyMaterial: MeshStandardMaterial;
  rimMaterial: MeshBasicMaterial;
  ringInner: RingGeometry;
  ringOuter: RingGeometry;
  beam: CylinderGeometry;
}

const BEAM_BOTTOM = CARD.pedestalHeight;
const BEAM_TOP = CARD.centerY - CARD.height / 2 - 0.05;

export function createSharedCardResources(): SharedCardResources {
  const cut = CARD.width * CARD_CUT_FRACTION;
  const bodyShape = octagon(CARD.width, CARD.height, cut, 0.015) as Shape;
  const body = new ExtrudeGeometry(bodyShape, {
    depth: CARD.depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 1,
  });
  body.translate(0, 0, -CARD.depth / 2);

  // Glowing edge band: an octagonal ring extruded through the slab's thickness.
  const rimShape = octagon(CARD.width + 0.02, CARD.height + 0.02, cut) as Shape;
  rimShape.holes.push(
    octagon(CARD.width + 0.02, CARD.height + 0.02, cut, 0.028) as Path,
  );
  const rim = new ExtrudeGeometry(rimShape, {
    depth: CARD.depth + 0.03,
    bevelEnabled: false,
  });
  rim.translate(0, 0, -(CARD.depth + 0.03) / 2);

  const beamHeight = BEAM_TOP - BEAM_BOTTOM;
  const beam = new CylinderGeometry(1.15, 0.62, beamHeight, 40, 1, true);
  beam.translate(0, BEAM_BOTTOM + beamHeight / 2, 0);

  const emitter = new CylinderGeometry(
    CARD.pedestalRadius * 0.97,
    CARD.pedestalRadius,
    CARD.pedestalHeight,
    48,
  );
  emitter.translate(0, CARD.pedestalHeight / 2, 0);

  const ringInner = new RingGeometry(0.42, 0.5, 48);
  ringInner.rotateX(-Math.PI / 2);
  const ringOuter = new RingGeometry(0.74, 0.82, 64);
  ringOuter.rotateX(-Math.PI / 2);

  return {
    face: new PlaneGeometry(CARD.width, CARD.height),
    body,
    rim,
    halo: new PlaneGeometry(CARD.width * 1.5, CARD.height * 1.3),
    emitter,
    emitterMaterial: new MeshStandardMaterial({
      color: "#071016",
      roughness: 0.35,
      metalness: 0.7,
    }),
    bodyMaterial: new MeshStandardMaterial({
      color: "#061424",
      emissive: new Color("#0a3358"),
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.35,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    }),
    rimMaterial: new MeshBasicMaterial({
      color: new Color(THEME.cyan),
      toneMapped: false,
    }),
    ringInner,
    ringOuter,
    beam,
  };
}

const cardVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const cardFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uMotion;
uniform float uFocus;
uniform float uProgress;
uniform float uSeed;
uniform vec3 uAccent;
uniform vec4 uFooterRect;
uniform vec4 uProgressRect;
varying vec2 vUv;

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

float inRect(vec2 uv, vec4 r) {
  vec2 a = step(r.xy, uv);
  vec2 b = step(uv, r.xy + r.zw);
  return a.x * a.y * b.x * b.y;
}

void main() {
  float t = uTime * uMotion;
  vec2 uv = vUv;

  // Restrained glitch: rare horizontal slice offsets.
  float glitchOn = step(0.985, hash11(floor(t * 9.0) + uSeed * 17.0)) * uMotion;
  float slice = floor(uv.y * 36.0);
  uv.x += (hash11(slice + floor(t * 30.0)) - 0.5) * 0.025 * glitchOn * step(0.6, hash11(slice * 3.1 + uSeed));

  vec4 tex = texture(uMap, uv);
  float fringe = 0.0018 + glitchOn * 0.004;
  float red = texture(uMap, uv + vec2(fringe, 0.0)).r;
  float blue = texture(uMap, uv - vec2(fringe, 0.0)).b;
  vec3 color = vec3(mix(tex.r, red, 0.6), tex.g, mix(tex.b, blue, 0.6));

  // The footer prompt is dim until the player is in range.
  float footer = inRect(vUv, uFooterRect);
  color *= mix(1.0, mix(0.35, 1.2, uFocus), footer);

  // Scanlines and a slow sweep band.
  float scan = 0.9 + 0.1 * sin(vUv.y * 520.0 - t * 3.0);
  float sweep = exp(-pow((vUv.y - fract(t * 0.11 + uSeed)) * 18.0, 2.0));
  color = color * scan + uAccent * sweep * 0.25 * tex.a;
  color *= 0.88 + 0.3 * uFocus;

  // Hold-to-open progress fill.
  float bar = inRect(vUv, uProgressRect);
  float filled = step(vUv.x, uProgressRect.x + uProgressRect.z * uProgress);
  color = mix(color, uAccent * 1.6, bar * filled);
  float alpha = max(tex.a, bar * filled);

  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
`;

const haloFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec2 p = abs(vUv - 0.5) * 2.0;
  vec2 inner = vec2(0.66, 0.76);
  vec2 d = max(p - inner, 0.0) / (1.0 - inner);
  float glow = exp(-dot(d, d) * 5.0) * (1.0 - smoothstep(0.5, 1.0, length(d)));
  gl_FragColor = vec4(uColor * glow * uIntensity, 1.0);
  #include <colorspace_fragment>
}
`;

const beamFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  float vertical = pow(1.0 - vUv.y, 1.3) * 0.65 + pow(vUv.y, 5.0) * 0.35;
  float stripes = 0.6 + 0.4 * sin(vUv.y * 46.0 - uTime * 3.0);
  float columns = 0.7 + 0.3 * step(0.5, fract(vUv.x * 48.0));
  gl_FragColor = vec4(uColor * vertical * stripes * columns * uIntensity, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * A thick octagonal holographic card (card-1 reference) projected from a
 * ring emitter on the floor (environment reference). The face texture is
 * built from glyphs at start-up; scanlines, sweep, glitch, focus and hold
 * progress are animated by uniforms only.
 */
export class HolographicCard {
  readonly id: SectionId;
  readonly group = new Group();
  readonly anchor: Vector3;
  readonly focusPoint: Vector3;

  private readonly faceMaterial: ShaderMaterial;
  private readonly haloMaterial: ShaderMaterial;
  private readonly beamMaterial: ShaderMaterial;
  private readonly ringMaterial: MeshBasicMaterial;
  private readonly panel = new Group();
  private readonly seed: number;
  private readonly ringBase = new Color(THEME.blue);
  private readonly ringHot = new Color(THEME.cyan);

  constructor(
    meta: SectionMeta,
    position: { x: number; z: number },
    shared: SharedCardResources,
    face: {
      logoSvg: string | null;
      portrait: PortraitImage | null;
      maxAnisotropy: number;
      text: CardText;
    },
  ) {
    this.id = meta.id;
    this.seed = (parseInt(meta.index, 10) * 0.173) % 1;
    this.anchor = new Vector3(position.x, 0, position.z);
    this.focusPoint = new Vector3(position.x, CARD.centerY, position.z);
    this.group.position.copy(this.anchor);
    this.group.name = `card-${meta.id}`;

    const accent = new Color(THEME.cyan);
    const { texture, footerRect, progressRect } = createCardFace(
      meta,
      face.text,
      face.logoSvg,
      face.portrait,
      face.maxAnisotropy,
    );

    this.faceMaterial = new ShaderMaterial({
      vertexShader: cardVertex,
      fragmentShader: cardFragment,
      uniforms: {
        uMap: { value: texture },
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uFocus: { value: 0 },
        uProgress: { value: 0 },
        uSeed: { value: this.seed },
        uAccent: { value: accent },
        uFooterRect: { value: footerRect },
        uProgressRect: { value: progressRect },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.haloMaterial = new ShaderMaterial({
      vertexShader: cardVertex,
      fragmentShader: haloFragment,
      uniforms: {
        uColor: { value: new Color(THEME.blue) },
        uIntensity: { value: 0.12 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.beamMaterial = new ShaderMaterial({
      vertexShader: cardVertex,
      fragmentShader: beamFragment,
      uniforms: {
        uColor: { value: new Color(THEME.cyan) },
        uTime: { value: 0 },
        uIntensity: { value: 0.08 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    this.ringMaterial = new MeshBasicMaterial({
      color: this.ringBase.clone(),
      toneMapped: false,
    });

    // Emitter disk with two glowing rings.
    const emitter = new Mesh(shared.emitter, shared.emitterMaterial);
    const ringInner = new Mesh(shared.ringInner, this.ringMaterial);
    const ringOuter = new Mesh(shared.ringOuter, this.ringMaterial);
    ringInner.position.y = ringOuter.position.y = CARD.pedestalHeight + 0.003;
    const beam = new Mesh(shared.beam, this.beamMaterial);
    beam.renderOrder = 1;
    this.group.add(emitter, ringInner, ringOuter, beam);

    // The floating card: halo, translucent slab, glowing rim, glyph face.
    this.panel.position.y = CARD.centerY;
    this.panel.rotation.set(-CARD.tilt, YAW_FACING_CAMERA, 0, "YXZ");
    const halo = new Mesh(shared.halo, this.haloMaterial);
    halo.position.z = -CARD.depth;
    halo.renderOrder = 2;
    const body = new Mesh(shared.body, shared.bodyMaterial);
    body.renderOrder = 3;
    const rim = new Mesh(shared.rim, shared.rimMaterial);
    const faceMesh = new Mesh(shared.face, this.faceMaterial);
    faceMesh.position.z = CARD.depth / 2 + 0.014;
    faceMesh.renderOrder = 4;
    this.panel.add(halo, body, rim, faceMesh);
    this.group.add(this.panel);
  }

  /** @param focus 0..1 proximity/selection emphasis, @param progress 0..1 hold progress */
  update(time: number, focus: number, progress: number, motion: number) {
    const bob =
      Math.sin(time * 1.1 * motion + this.seed * 6.28) * 0.07 * motion;
    this.panel.position.y = CARD.centerY + bob;
    this.panel.rotation.y =
      YAW_FACING_CAMERA +
      Math.sin(time * 0.5 * motion + this.seed * 9) * 0.03 * motion;

    const u = this.faceMaterial.uniforms;
    u.uTime.value = time;
    u.uFocus.value = focus;
    u.uProgress.value = progress;
    u.uMotion.value = motion;

    this.haloMaterial.uniforms.uIntensity.value = 0.1 + focus * 0.28;
    this.beamMaterial.uniforms.uTime.value = time * motion;
    this.beamMaterial.uniforms.uIntensity.value = 0.07 + focus * 0.12;
    this.ringMaterial.color.copy(this.ringBase).lerp(this.ringHot, focus);
  }
}
