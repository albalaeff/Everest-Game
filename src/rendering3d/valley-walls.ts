import { BufferAttribute, BufferGeometry, GLSL3, Mesh, ShaderMaterial } from "three";
import type { Texture } from "three";

import { FieldNoise } from "./field-noise";
import { GlacierShape } from "./glacier-shape";
import { SceneLight } from "./scene-light";
import { SunShadows } from "./sun-shadows";

/**
 * The walls of the valley the Icefall comes down: Everest's West Shoulder on the left as the
 * climb goes up, Nuptse's wall on the right, and the head of the Western Cwm far ahead under
 * Lhotse. One coarse mesh of rock and hanging snow, ribbed and fluted down the fall line as
 * Himalayan faces are, far enough off to need no detail the eye could walk up to: the rock and
 * the snow on it are told apart at each pixel from how the face lies, with two texture look-ups.
 * Made up, not surveyed: the real peaks' shapes come with their own issue.
 */
export class ValleyWalls {
  /** How far apart the mesh's points are, in metres, and how far it reaches each way. */
  private static readonly STEP = 48;
  private static readonly ACROSS = 4200;
  private static readonly BEHIND = 2200;
  private static readonly AHEAD = 6600;

  readonly mesh: Mesh;
  readonly triangles: number;

  constructor(shape: GlacierShape, light: SceneLight, snow: Texture, stone: Texture, seed: number) {
    const noise = new FieldNoise(seed + 500);
    const { STEP, ACROSS, BEHIND, AHEAD } = ValleyWalls;
    const columns = Math.floor((2 * ACROSS) / STEP) + 1;
    const rows = Math.floor((BEHIND + AHEAD) / STEP) + 1;
    const positions = new Float32Array(rows * columns * 3);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const x = -ACROSS + c * STEP;
        const z = BEHIND - r * STEP;
        positions.set([x, ValleyWalls.height(shape, noise, x, z), z], 3 * (r * columns + c));
      }
    }
    const indices = new Uint32Array((rows - 1) * (columns - 1) * 6);
    let next = 0;
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < columns - 1; c += 1) {
        const a = r * columns + c;
        const b = a + columns;
        indices.set([a, a + 1, b, b, a + 1, b + 1], next);
        next += 6;
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    this.triangles = indices.length / 3;
    this.mesh = new Mesh(
      geometry,
      new ShaderMaterial({
        glslVersion: GLSL3,
        uniforms: { ...light.uniforms, uSnow: { value: snow }, uStone: { value: stone } },
        vertexShader: /* glsl */ `
          out vec3 vPoint; out vec3 vNormal;
          void main() { vPoint = position; vNormal = normal; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform sampler2D uSnow; uniform sampler2D uStone;
          in vec3 vPoint; in vec3 vNormal;
          out highp vec4 fragment;
          ${SceneLight.GLSL}
          void main() {
            vec3 normal = normalize(vNormal);
            vec4 broad = texture(uStone, vPoint.xz * 0.0011);
            vec4 fine = texture(uStone, vec2(vPoint.x + vPoint.z, vPoint.y) * 0.006);
            vec4 drift = texture(uSnow, vPoint.xz * 0.0031);
            vec3 rough = normalize(normal + vec3(fine.r - 0.5, 0.0, fine.g - 0.5) * 0.3 + vec3(broad.r - 0.5, 0.0, broad.g - 0.5) * 0.3);
            float lying = normal.y + (broad.b - 0.5) * 0.36 + (fine.b - 0.5) * 0.22;
            float snow = smoothstep(0.52, 0.62, lying);
            float strata = texture(uStone, vec2(vPoint.x * 0.0004, vPoint.y * 0.004 + broad.b * 0.3)).b;
            vec3 rock = mix(vec3(0.07, 0.065, 0.065), vec3(0.24, 0.20, 0.17), strata * 0.7 + fine.b * 0.3);
            vec3 colour = mix(rock, vec3(0.93, 0.95, 0.97) * (0.9 + 0.1 * drift.b), snow);
            vec3 surface = normalize(mix(rough, normal + (drift.rgb - 0.5).xzy * vec3(0.3, 0.0, 0.3), snow));
            float towards = max(dot(surface, uSunDir), 0.0);
            vec3 ambient = mix(uBounceColor, uSkyColor, surface.y * 0.5 + 0.5);
            vec3 shaded = colour * (ambient + uSunColor * towards);
            fragment = vec4(toScreen(throughAir(shaded, vPoint)), 1.0);
          }
        `,
      }),
    );
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    // The walls throw no shadow of their own onto the map: they're too far for it to reach.
    this.mesh.layers.set(SunShadows.SKY);
  }

  /** How high the ground is at a point of the world past the glacier's edge: the glacier's own
   * ground under the mesh where the glacier is, and the walls rising from its sides. */
  private static height(shape: GlacierShape, noise: FieldNoise, x: number, z: number): number {
    const upValley = -z;
    const edge = GlacierShape.HALF_WIDTH - 25;
    const floor =
      shape.surfaceAt(Math.min(Math.max(upValley, -80), 400)) + Math.max(upValley - 400, 0) * 0.06;
    const peak = (share: number): number =>
      share < 0 ? 0 : share < 1 ? Math.pow(share, 1.5) : Math.max(0, 1 - (share - 1) * 0.8);
    const wanderLeft = 260 * (noise.fractal(z * 0.0007, 3.1, 3, 5) - 0.5);
    const wanderRight = 260 * (noise.fractal(z * 0.0006, 9.7, 3, 9) - 0.5);
    const tallLeft = 1250 * (0.7 + 0.65 * noise.fractal(z / 1300, 1.3, 3, 21));
    const tallRight = 1600 * (0.7 + 0.6 * noise.fractal(z / 1500, 4.4, 3, 33));
    const left = tallLeft * peak((-x - edge + wanderLeft) / 2100);
    const right = tallRight * peak((x - edge + wanderRight) / 2500);
    const head =
      1900 *
      peak((upValley - 3400 + 400 * (noise.fractal(x / 2500, 0.3, 3, 41) - 0.5)) / 2600) *
      (0.75 + 0.5 * noise.fractal(x / 1800, 7.7, 3, 43));
    let height = left + right + head;
    const mass = Math.min(height / 400, 1);
    if (mass > 0) {
      height *= 1 + 0.5 * (noise.ridged(x / 900, z / 900, 5, 50) - 0.45);
      height += mass * 140 * (noise.ridged(x / 260, z / 260, 4, 60) - 0.4);
      // Flutings: fine across the face and long down it.
      const [along, down] = head > left + right ? [x, z] : [z, x];
      const wobble = 60 * (noise.fractal(down / 300, along / 300, 2, 71) - 0.5);
      height += mass * 90 * (noise.ridged((along + wobble) / 150, down / 1100, 3, 73) - 0.35);
    }
    const inside = Math.abs(x) < edge ? 1 : 0;
    return (
      floor +
      Math.max(height, 0) -
      12 * inside +
      Math.max(Math.abs(x) - 170, 0) ** 2 * 0.004 * (1 - inside)
    );
  }
}
