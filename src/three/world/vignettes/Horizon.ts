import { shortHash } from "@/content/commitHash";
import { THEME } from "@/theme/theme";
import {
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { GLYPH_FOG } from "../../config";
import { BlinkLights, type BlinkLight } from "../../effects/BlinkLights";
import { MONO_FONT_FAMILY } from "../../effects/AsciiAtlas";
import type { SceneLabels } from "../../labels";
import { createRandom } from "../../utils/math";
import { HORIZON_LAYOUT } from "../layout";
import { PropKit, TINT } from "../PropKit";
import { buildMast } from "../structures";
import { Vignette, type VignetteContext } from "../Vignette";

const RACK = { width: 0.95, height: 2.3, depth: 1.0 };
/** Fraction of the billboard taken by the static nameplate (along the bottom). */
const HEADER = 0.2;
/** Log lines visible in the billboard's scrolling area. */
const VISIBLE_LINES = 9;

const billboardVertex = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const billboardFragment = /* glsl */ `
uniform sampler2D uHeader;
uniform sampler2D uLog;
uniform float uTime;
uniform float uMotion;
uniform float uLogSpan;
uniform vec3 uInk;
uniform vec3 uAccent;
uniform vec3 uPanel;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vDepth;
void main() {
  float t = uTime * uMotion;
  vec3 color = uPanel;
  // The camera sees the lower part best, so the nameplate runs along the bottom.
  float split = ${HEADER.toFixed(2)};
  if (vUv.y < split) {
    vec2 uv = vec2(vUv.x, vUv.y / split);
    color += uAccent * texture2D(uHeader, uv).a;
  } else {
    float v = fract(((vUv.y - split) / (1.0 - split)) * uLogSpan - t * 0.035);
    color += uInk * texture2D(uLog, vec2(vUv.x, v)).a * 0.9;
    // Divider above the nameplate.
    color += uAccent * (1.0 - smoothstep(0.0, 0.006, abs(vUv.y - split - 0.004))) * 0.8;
  }
  // Scanlines, a slow roll bar and a frame glow.
  color *= 0.82 + 0.18 * step(0.5, fract(vUv.y * 180.0));
  color += uAccent * 0.06 * (1.0 - smoothstep(0.0, 0.08, abs(fract(vUv.y - t * 0.08) - 0.5)));
  vec2 edge = min(vUv, 1.0 - vUv);
  float frame = 1.0 - smoothstep(0.0, 0.012, min(edge.x * 0.34, edge.y));
  color = mix(color, uAccent, frame * 0.9);
  color = mix(color, uFog, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

/** A canvas holding text as alpha (white on transparent). */
function textCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  return { canvas, ctx };
}

function logLines(labels: SceneLabels): string[] {
  const titles = Object.values(labels.sections).map((s) => s.title);
  const commits = labels.timeline.map(
    (c) => `${shortHash(c.id).toLowerCase()}  ${c.year || "----"}  ${c.id}`,
  );
  return [
    "$ ssh guest@nzswe.dev",
    "welcome to portfolio.sys",
    ...titles.map((title) => `[  OK  ] mounted /${title}`),
    "$ git log --oneline",
    ...(commits.length > 0 ? commits : ["3fa9c2  feat: ship the 3D portfolio"]),
    "$ npm run build",
    "> next build",
    "  compiled successfully",
    "$ ./scan --firewall",
    "  perimeter: SEALED",
    "$ ping visitor",
    "  64 bytes: hello, explorer",
    "$ cat todo.txt",
    "  [x] squash every bug",
    "  [ ] find the terminal",
    "",
  ];
}

/**
 * Beyond the firewall: rows of server racks with blinking LEDs, lattice
 * radio masts with red beacons, and a giant terminal billboard past the
 * top edge, tilted back toward the camera so it reads from the play area.
 */
export class Horizon extends Vignette {
  private readonly lights: BlinkLights;
  private readonly billboard: ShaderMaterial;

  constructor(ctx: VignetteContext) {
    super(ctx, { right: 0, up: 0 }, "horizon");
    const prop = ctx.materials.prop;
    const random = createRandom(7);
    const lights: BlinkLight[] = [];
    const ledColors = [THEME.green, THEME.green, THEME.cyan, THEME.amber];

    // Server racks: local +X is screen-right, −Z is up the screen.
    const racks = new PropKit();
    for (const row of HORIZON_LAYOUT.serverRows) {
      const x0 = row.right - ((row.count - 1) * RACK.width) / 2;
      for (let i = 0; i < row.count; i++) {
        const x = x0 + i * RACK.width;
        const z = -row.up;
        const h = RACK.height * (0.85 + random() * 0.3);
        racks.box([RACK.width - 0.04, h, RACK.depth], [x, 0, z], {
          tint: TINT.dark,
        });
        racks.box(
          [RACK.width - 0.16, h - 0.2, 0.02],
          [x, 0.1, z + RACK.depth / 2],
          {
            tint: TINT.base,
          },
        );
        racks.box([RACK.width, 0.06, RACK.depth + 0.04], [x, h, z], {
          tint: TINT.light,
        });
        // LEDs on the front: two columns, one per rack unit.
        const units = Math.floor((h - 0.3) / 0.16);
        for (let u = 0; u < units; u++) {
          for (const side of [-0.28, -0.18]) {
            if (random() < 0.35) continue;
            lights.push({
              position: new Vector3(
                x + side,
                0.22 + u * 0.16,
                z + RACK.depth / 2 + 0.02,
              ),
              scale: 0.035,
              color: ledColors[Math.floor(random() * ledColors.length)],
              rate: random() < 0.3 ? 0 : 0.4 + random() * 2.6,
              phase: random(),
            });
          }
        }
      }
    }
    this.group.add(racks.build(prop, "horizon-racks"));

    // Masts with a red beacon on top.
    const masts = new PropKit();
    HORIZON_LAYOUT.masts.forEach((mast, i) => {
      const top = buildMast(masts, mast.right, -mast.up, mast.height, 1.3);
      lights.push({
        position: top,
        scale: 0.16,
        color: THEME.alert,
        rate: 0.6,
        phase: i * 0.21,
      });
    });
    this.group.add(masts.build(prop, "horizon-masts"));

    this.lights = new BlinkLights(new SphereGeometry(1, 10, 8), lights);
    this.lights.mesh.name = "horizon-lights";
    this.group.add(this.lights.mesh);

    this.billboard = this.buildBillboard(ctx.labels);
  }

  private buildBillboard(labels: SceneLabels): ShaderMaterial {
    const b = HORIZON_LAYOUT.billboard;
    const stand = new Group();
    stand.position.set(b.right, 0, -b.up);
    this.group.add(stand);

    const legs = new PropKit();
    const baseY = 0.9;
    for (const x of [-b.width * 0.36, b.width * 0.36]) {
      legs.box([0.35, baseY + 0.4, 0.35], [x, 0, 0], { tint: TINT.dark });
      // Strut from the ground behind to the panel's back.
      legs.bar(
        [x, 0, -2.6],
        [
          x,
          baseY + Math.cos(b.tilt) * b.height * 0.6,
          -Math.sin(b.tilt) * b.height * 0.6,
        ],
        0.16,
        { tint: TINT.base },
      );
    }
    legs.box([b.width * 0.8, 0.14, 0.3], [0, baseY - 0.1, 0], {
      tint: TINT.light,
    });
    stand.add(legs.build(this.ctx.materials.prop, "horizon-billboard-stand"));

    // Canvas sizes follow the panel's proportions, so text is not stretched.
    const canvasWidth = 2048;
    const pxPerMetre = canvasWidth / b.width;
    const headerHeight = Math.round(b.height * HEADER * pxPerMetre);
    const header = textCanvas(canvasWidth, headerHeight);
    header.ctx.font = `800 ${Math.round(headerHeight * 0.42)}px ${MONO_FONT_FAMILY}`;
    header.ctx.fillText(labels.cards.fullName, 48, headerHeight * 0.36);
    header.ctx.font = `600 ${Math.round(headerHeight * 0.2)}px ${MONO_FONT_FAMILY}`;
    header.ctx.fillText(
      `// ${labels.cards.role}  ·  ${labels.cards.status}`,
      52,
      headerHeight * 0.78,
    );
    const headerTexture = new CanvasTexture(header.canvas);
    headerTexture.colorSpace = SRGBColorSpace;

    const lines = logLines(labels);
    const lineHeight = Math.round(
      ((b.height * (1 - HEADER)) / VISIBLE_LINES) * pxPerMetre,
    );
    const log = textCanvas(canvasWidth, lines.length * lineHeight);
    log.ctx.font = `500 ${Math.round(lineHeight * 0.58)}px ${MONO_FONT_FAMILY}`;
    lines.forEach((line, i) => {
      log.ctx.fillText(line, 48, (i + 0.5) * lineHeight);
    });
    const logTexture = new CanvasTexture(log.canvas);
    logTexture.colorSpace = SRGBColorSpace;
    logTexture.wrapT = RepeatWrapping;
    logTexture.minFilter = LinearFilter;
    logTexture.generateMipmaps = false;

    const material = new ShaderMaterial({
      vertexShader: billboardVertex,
      fragmentShader: billboardFragment,
      toneMapped: false,
      uniforms: {
        uHeader: { value: headerTexture },
        uLog: { value: logTexture },
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uLogSpan: { value: VISIBLE_LINES / lines.length },
        uInk: { value: new Color(THEME.green) },
        uAccent: { value: new Color(THEME.cyan) },
        uPanel: { value: new Color("#02090c") },
        uFog: { value: new Color(THEME.bg) },
        uFogNear: { value: GLYPH_FOG.near },
        uFogFar: { value: GLYPH_FOG.far },
      },
    });
    const geometry = new PlaneGeometry(b.width, b.height);
    geometry.translate(0, b.height / 2, 0);
    const panel = new Mesh(geometry, material);
    panel.name = "horizon-billboard";
    panel.position.set(0, baseY, 0);
    panel.rotation.x = -b.tilt;
    stand.add(panel);
    return material;
  }

  protected animate(time: number) {
    const motion = this.ctx.kit.motion;
    this.lights.update(time);
    this.lights.setMotion(motion);
    this.billboard.uniforms.uTime.value = time;
    this.billboard.uniforms.uMotion.value = motion;
  }
}
