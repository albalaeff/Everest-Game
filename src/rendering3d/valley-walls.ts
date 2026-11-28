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
  private static readonly AHEAD = 7400;

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
            // Ribs and flutings: fine along a face and long down it, as avalanches cut them.
            bool sideways = abs(normal.x) > abs(normal.z);
            float along = sideways ? vPoint.z : vPoint.x;
            vec3 acrossFace = sideways ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
            float steep = 1.0 - normal.y;
            vec4 ribs = texture(uSnow, vec2(along * 0.0042 + broad.b * 0.4, vPoint.y * 0.0006));
            vec4 flutes = texture(uSnow, vec2(along * 0.019, vPoint.y * 0.0016 + broad.b));
            float cut = ((ribs.b - 0.5) * 1.6 + (flutes.b - 0.5) * 0.8) * smoothstep(0.15, 0.5, steep);
            vec3 fluted = normalize(normal + acrossFace * ((ribs.r - 0.5) * 2.4 + (flutes.r - 0.5) * 1.5) * smoothstep(0.12, 0.45, steep));
            vec3 rough = normalize(fluted + vec3(fine.r - 0.5, 0.0, fine.g - 0.5) * 0.35 + vec3(broad.r - 0.5, 0.0, broad.g - 0.5) * 0.3);
            float lying = normal.y + (broad.b - 0.5) * 0.36 + (fine.b - 0.5) * 0.2 + cut * 0.22;
            float snow = smoothstep(0.5, 0.6, lying);
            float strata = texture(uStone, vec2(vPoint.x * 0.0004, vPoint.y * 0.004 + broad.b * 0.3)).b;
            vec3 rock = mix(vec3(0.06, 0.056, 0.058), vec3(0.23, 0.19, 0.16), strata * 0.7 + fine.b * 0.3);
            // A band of paler, yellower rock across the faces, as the Himalaya's have.
            rock = mix(rock, vec3(0.34, 0.28, 0.19), 0.6 * smoothstep(0.62, 0.72, strata) * (1.0 - smoothstep(0.78, 0.86, strata)));
            vec3 colour = mix(rock, vec3(0.93, 0.95, 0.97) * (0.88 + 0.12 * drift.b), snow);
            vec3 surface = normalize(mix(rough, fluted + (drift.rgb - 0.5).xzy * vec3(0.25, 0.0, 0.25), snow));
            // A gully holds less of the sky than the rib beside it.
            float open = 1.0 - 0.45 * smoothstep(0.0, -0.5, cut) * smoothstep(0.15, 0.5, steep);
            float towards = max(dot(surface, uSunDir), 0.0);
            vec3 ambient = mix(uBounceColor * 0.6, uSkyColor, surface.y * 0.5 + 0.5) * open;
            vec3 shaded = colour * (ambient + uSunColor * towards * (0.5 + 0.5 * open));
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
   * ground under the mesh where the glacier is; the valley's sides rising from its edges, gently
   * at first and then steeply to their crests a kilometre and more off, so the sky stays wide
   * over the climb; the Cwm opening above the Icefall; and Lhotse's wall across its head. */
  private static height(shape: GlacierShape, noise: FieldNoise, x: number, z: number): number {
    const upValley = -z;
    const floor =
      shape.surfaceAt(Math.min(Math.max(upValley, -80), 400)) + Math.max(upValley - 400, 0) * 0.07;
    const edge = GlacierShape.HALF_WIDTH - 25 + Math.max(upValley - 300, 0) * 0.1;
    const rise = (off: number, width: number): number => {
      const share = Math.max(off, 0) / width;
      return share < 1 ? Math.pow(share, 1.6) : Math.max(1 - (share - 1) * 0.7, 0);
    };
    const wanderLeft = 220 * (noise.fractal(z * 0.0007, 3.1, 3, 5) - 0.5);
    const wanderRight = 220 * (noise.fractal(z * 0.0006, 9.7, 3, 9) - 0.5);
    // A ridge is its summits and the cols between them, a couple of kilometres apart: the West
    // Shoulder climbs towards Everest up the valley; Nuptse's ridge stays high.
    const summits = (at: number, layer: number): number => {
      const peak = noise.ridged(at / 2400, layer, 2, layer);
      return 0.72 + 0.5 * peak;
    };
    const crestLeft = (1150 + 0.2 * Math.max(upValley, 0)) * summits(z, 21);
    const crestRight = 1650 * summits(z + 700, 33);
    const behind = 1 - 0.55 * FieldNoise.smooth(200, -1400, upValley);
    const left = crestLeft * behind * rise(-x - edge + wanderLeft, 1350);
    const right = crestRight * behind * rise(x - edge + wanderRight, 1750);
    const headAt = upValley - 5200 + 500 * (noise.fractal(x / 2500, 0.3, 3, 41) - 0.5);
    const head = 2300 * rise(headAt + 2300, 2300) * summits(x + 1300, 43);
    let height = Math.max(left + right, head);
    const mass = Math.min(height / 300, 1);
    if (mass > 0) {
      // Buttresses and bowls, and a crest that is a knife's edge of rock in some stretches and
      // a smooth one of snow in others. Nothing finer than the mesh can carry: the ribs and
      // the flutings down a face are the shader's.
      height *= 1 + 0.5 * (noise.ridged(x / 900, z / 900, 4, 50) - 0.45);
      const jagged = noise.fractal(x / 1500, z / 1500, 2, 55);
      height += mass * 190 * jagged * jagged * (noise.ridged(x / 380, z / 380, 2, 60) - 0.4);
    }
    const inside = Math.abs(x) < GlacierShape.HALF_WIDTH - 25 ? 1 : 0;
    const apron = Math.max(Math.abs(x) - 170, 0) ** 2 * 0.004 * (1 - inside);
    return floor + Math.max(height, 0) - 12 * inside + Math.min(apron, 60);
  }
}
