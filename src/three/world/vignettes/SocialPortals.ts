import { THEME } from "@/theme/theme";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  Vector3,
} from "three";
import type { PortalId } from "@/types";
import { CRISP_LAYER } from "../../render/CrispComposite";
import { damp } from "../../utils/math";
import { CONTACT_EXTRAS } from "../layout";
import { PropKit, TINT } from "../PropKit";
import type { WorldStation } from "../stations";
import { TextPlane, Vignette, type VignetteContext } from "../Vignette";

const PORTAL = { width: 1.6, height: 2.5, post: 0.22 };

/** Icon file (public/icons) and colour per portal. */
const PORTAL_STYLE: Record<PortalId, { icon: string; color: string }> = {
  github: { icon: "/icons/github.svg", color: THEME.ink },
  linkedin: { icon: "/icons/linkedin.svg", color: THEME.blue },
  telegram: { icon: "/icons/telegram.svg", color: THEME.cyan },
  email: { icon: "/icons/envelope-at.svg", color: THEME.amber },
};

const fieldVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** The shimmering field inside an arch: rising bands, brighter while the player is in it. */
const fieldFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uMotion;
uniform float uGlow;
varying vec2 vUv;
void main() {
  float t = uTime * uMotion;
  float bands = 0.5 + 0.5 * sin((vUv.y * 18.0 - t * 2.2) + sin(vUv.x * 9.0 + t) * 0.8);
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float level = (0.08 + 0.1 * bands + uGlow * (0.18 + 0.2 * bands)) * edge;
  gl_FragColor = vec4(uColor * level, 1.0);
  #include <colorspace_fragment>
}
`;

/** A white-on-transparent canvas that the icon is drawn into once it loads. */
function iconTexture(url: string, color: string): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const image = new Image();
  image.onload = () => {
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, size * 0.1, size * 0.1, size * 0.8, size * 0.8);
    // The icons are single-colour: recolour whatever was drawn.
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    texture.needsUpdate = true;
  };
  image.src = url;
  return texture;
}

class Portal implements WorldStation {
  readonly radius = 1.25;
  readonly opensWindow = false;
  glow = 0;
  nearby = false;

  constructor(
    readonly id: PortalId,
    readonly anchor: Vector3,
    readonly field: ShaderMaterial,
    readonly icon: Mesh,
    readonly sign: TextPlane,
  ) {}

  setNearby(nearby: boolean) {
    this.nearby = nearby;
  }
}

/**
 * Contact district: four arches, one per channel (GitHub, LinkedIn,
 * Telegram, email). Stand inside one and hold Space to open that link;
 * React does the opening (ExperienceClient), the world only tracks the hold.
 */
export class SocialPortals extends Vignette {
  readonly portals: Portal[] = [];

  constructor(ctx: VignetteContext) {
    super(ctx, { right: 0, up: 0 }, "social-portals");
    const kit = new PropKit();
    const half = PORTAL.width / 2;

    for (const spot of CONTACT_EXTRAS.portals) {
      const id: PortalId = spot.id;
      const style = PORTAL_STYLE[id];
      const x = spot.right;
      const z = -spot.up;
      // Two posts with plinths and a lintel.
      for (const side of [-1, 1]) {
        kit.box(
          [PORTAL.post + 0.12, 0.14, PORTAL.post + 0.12],
          [x + side * half, 0, z],
          {
            tint: TINT.dark,
          },
        );
        kit.box(
          [PORTAL.post, PORTAL.height, PORTAL.post],
          [x + side * half, 0, z],
          {
            tint: TINT.base,
          },
        );
        this.circleCollider(x + side * half, z, PORTAL.post * 0.75);
      }
      kit.box(
        [PORTAL.width + PORTAL.post + 0.1, 0.24, PORTAL.post + 0.06],
        [x, PORTAL.height, z],
        {
          tint: TINT.light,
        },
      );
      kit.box(
        [PORTAL.width - 0.2, 0.05, 0.05],
        [x, PORTAL.height - 0.08, z + 0.12],
        {
          tint: TINT.accent,
        },
      );

      const field = new ShaderMaterial({
        vertexShader: fieldVertex,
        fragmentShader: fieldFragment,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        uniforms: {
          uColor: { value: new Color(style.color) },
          uTime: { value: 0 },
          uMotion: { value: 1 },
          uGlow: { value: 0 },
        },
      });
      const fieldMesh = new Mesh(
        new PlaneGeometry(PORTAL.width - PORTAL.post, PORTAL.height - 0.05),
        field,
      );
      fieldMesh.position.set(x, PORTAL.height / 2, z);
      fieldMesh.renderOrder = 11;
      this.group.add(fieldMesh);

      const icon = new Mesh(
        new PlaneGeometry(0.62, 0.62),
        new MeshBasicMaterial({
          map: iconTexture(style.icon, style.color),
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      icon.position.set(x, 1.55, z + 0.02);
      icon.layers.set(CRISP_LAYER);
      icon.renderOrder = 12;
      this.group.add(icon);

      const sign = new TextPlane({
        width: 2.1,
        height: 0.48,
        color: style.color,
        rtl: ctx.labels.rtl,
      });
      sign.setText(ctx.labels.world.portals[id]);
      sign.mesh.position.set(x, PORTAL.height + 0.45, z);
      this.group.add(sign.mesh);

      this.portals.push(new Portal(id, this.toWorld(x, z), field, icon, sign));
    }
    this.group.add(kit.build(ctx.materials.prop, "social-portal-arches"));
  }

  protected animate(time: number, dt: number) {
    const motion = this.ctx.kit.motion;
    for (const portal of this.portals) {
      portal.glow = damp(portal.glow, portal.nearby ? 1 : 0, 6, dt);
      const uniforms = portal.field.uniforms;
      uniforms.uTime.value = time;
      uniforms.uMotion.value = motion;
      uniforms.uGlow.value = portal.glow;
      portal.icon.position.y =
        1.55 + Math.sin(time * 1.6 * motion + portal.anchor.x) * 0.05;
      portal.icon.scale.setScalar(1 + portal.glow * 0.15);
      portal.sign.opacity = 0.65 + portal.glow * 0.35;
    }
  }
}
