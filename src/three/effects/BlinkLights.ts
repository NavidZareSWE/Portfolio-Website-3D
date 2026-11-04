import { THEME } from "@/theme/theme";
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
} from "three";
import { GLYPH_FOG } from "../config";

export interface BlinkLight {
  position: Vector3;
  /** Uniform scale of the light's geometry. */
  scale?: number;
  /** Y rotation (for flat LEDs on a rack face). */
  yaw?: number;
  color: ColorRepresentation;
  /** Blinks per second (0 = always on). */
  rate: number;
  /** 0..1 offset into the blink cycle. */
  phase: number;
}

const vertexShader = /* glsl */ `
attribute vec3 aColor;
attribute vec2 aBlink;
uniform float uTime;
uniform float uMotion;
varying vec3 vColor;
varying float vOn;
varying float vDepth;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  float on = aBlink.y > 0.0 ? step(0.5, fract(uTime * uMotion * aBlink.y + aBlink.x)) : 1.0;
  vOn = mix(0.15, 1.0, on);
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vColor;
varying float vOn;
varying float vDepth;
void main() {
  vec3 color = mix(vColor * vOn, uFog, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Many small blinking lights (mast beacons, rack LEDs) in one instanced
 * draw call; the blinking runs entirely in the vertex shader.
 */
export class BlinkLights {
  readonly mesh: InstancedMesh<BufferGeometry, ShaderMaterial>;

  constructor(geometry: BufferGeometry, lights: readonly BlinkLight[]) {
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uFog: { value: new Color(THEME.bg) },
        uFogNear: { value: GLYPH_FOG.near },
        uFogFar: { value: GLYPH_FOG.far },
      },
    });
    this.mesh = new InstancedMesh(geometry, material, lights.length);
    const colors = new Float32Array(lights.length * 3);
    const blink = new Float32Array(lights.length * 2);
    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const scale = new Vector3();
    const color = new Color();
    lights.forEach((light, i) => {
      rotation.setFromAxisAngle(up, light.yaw ?? 0);
      scale.setScalar(light.scale ?? 1);
      matrix.compose(light.position, rotation, scale);
      this.mesh.setMatrixAt(i, matrix);
      color.set(light.color);
      colors.set([color.r, color.g, color.b], i * 3);
      blink.set([light.phase, light.rate], i * 2);
    });
    geometry.setAttribute("aColor", new InstancedBufferAttribute(colors, 3));
    geometry.setAttribute("aBlink", new InstancedBufferAttribute(blink, 2));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  update(time: number) {
    this.mesh.material.uniforms.uTime.value = time;
  }

  setMotion(motion: number) {
    this.mesh.material.uniforms.uMotion.value = motion;
  }
}
