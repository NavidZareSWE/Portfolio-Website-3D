import { THEME } from "@/theme/theme";
import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Texture,
} from "three";
import { GLYPH_FOG } from "../config";
import {
  ATLAS_CODE_LENGTH,
  ATLAS_CODE_START,
  GLSL_ATLAS_UV,
  GLSL_HASH,
} from "./AsciiAtlas";

export interface BlockSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  yaw: number;
}

const vertexShader = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vSeed;
varying float vFogDepth;

void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 world = m * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(m) * normal);
  vLocal = position;
  vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  vec4 mv = viewMatrix * world;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/*
 * Data blocks built from glyphs (card-2 reference): every face is a dense
 * grid of code glyphs sampled from the shared atlas; tops glow brightest,
 * sides fall off toward the ground and carry slow code rain. Everything is
 * computed per fragment, so all blocks share one instanced draw call.
 */
const fragmentShader = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uMotion;
uniform vec3 uFace;
uniform vec3 uEdge;
uniform vec3 uGlyph;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vSeed;
varying float vFogDepth;

${GLSL_HASH}
${GLSL_ATLAS_UV}

void main() {
  vec3 n = normalize(vNormal);
  float t = uTime * uMotion;

  // Every face is a dense glyph grid (card-2 reference): tops are bright
  // glyph mats, sides darker with a vertical falloff and slow code rain.
  vec2 q;
  float faceLevel;
  float rain = 0.0;
  if (n.y > 0.5) {
    q = vWorld.xz / 0.13;
    faceLevel = 0.62;
  } else if (n.y < -0.5) {
    q = vWorld.xz / 0.13;
    faceLevel = 0.0;
  } else {
    vec2 tangent = normalize(vec2(-n.z, n.x));
    q = vec2(dot(vWorld.xz, tangent), vWorld.y) / 0.15;
    faceLevel = mix(0.07, 0.3, smoothstep(0.0, 1.0, vLocal.y));
    float column = hash12(vec2(floor(q.x), vSeed * 91.0));
    float trail = fract((floor(q.y) + t * (1.0 + column * 2.5) + vSeed * 40.0) / (8.0 + column * 14.0));
    rain = pow(1.0 - trail, 6.0) * step(0.55, column);
  }
  vec2 cell = floor(q);
  vec2 local = fract(q);

  float density = hash12(cell + vSeed * 13.0);
  float filled = step(0.22, density);
  float glyphIndex = ${ATLAS_CODE_START.toFixed(1)} +
    floor(hash12(cell + floor(t * (0.3 + density * 1.2)) + vSeed) * ${ATLAS_CODE_LENGTH.toFixed(1)});
  float glyph = textureGrad(uAtlas, atlasUv(glyphIndex, local), dFdx(q) / 8.0, dFdy(q) / 8.0).r;

  float level = faceLevel * (0.55 + 0.45 * density) * filled + rain * 0.6;
  vec3 color = uFace + uGlyph * glyph * level;

  // Crisp edges: outline on top faces, lip along the top of the sides.
  if (n.y > 0.5) {
    vec2 e = 0.5 - abs(vLocal.xz);
    vec2 fw = fwidth(vLocal.xz);
    float line = max(1.0 - smoothstep(0.0, fw.x * 2.0, e.x), 1.0 - smoothstep(0.0, fw.y * 2.0, e.y));
    color += uEdge * line * 0.7;
  } else if (n.y > -0.5) {
    float fwY = fwidth(vLocal.y);
    color += uEdge * (1.0 - smoothstep(0.0, fwY * 2.0, 1.0 - vLocal.y)) * 0.6;
  }

  float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
  color = mix(color, uFog, fog);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** All data blocks (perimeter skyline + walkable obstacles) in one instanced mesh. */
export class AsciiBlocks {
  readonly mesh: InstancedMesh<BoxGeometry, ShaderMaterial>;

  constructor(atlas: Texture, blocks: readonly BlockSpec[]) {
    const geometry = new BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uAtlas: { value: atlas },
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uFace: { value: new Color("#030909") },
        uEdge: { value: new Color(THEME.teal).multiplyScalar(0.55) },
        uGlyph: { value: new Color(THEME.teal) },
        uFog: { value: new Color(THEME.bg) },
        uFogNear: { value: GLYPH_FOG.near },
        uFogFar: { value: GLYPH_FOG.far },
      },
    });

    this.mesh = new InstancedMesh(geometry, material, blocks.length);
    this.mesh.name = "data-blocks";

    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const up = new Vector3(0, 1, 0);
    blocks.forEach((block, i) => {
      position.set(block.x, 0, block.z);
      rotation.setFromAxisAngle(up, block.yaw);
      scale.set(block.width, block.height, block.depth);
      matrix.compose(position, rotation, scale);
      this.mesh.setMatrixAt(i, matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  update(time: number) {
    this.mesh.material.uniforms.uTime.value = time;
  }

  setReducedMotion(reduced: boolean) {
    this.mesh.material.uniforms.uMotion.value = reduced ? 0.12 : 1;
  }
}
