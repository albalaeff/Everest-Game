import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
} from "three";
import type { Texture, WebGLRenderer } from "three";

/**
 * Draws the patterns of snow and ice once, into textures, when the level loads. Each is worked
 * out by a shader from noise that repeats exactly at the texture's edges, so it tiles over the
 * glacier with no seam; after that a surface reads its pattern with a look-up, which a laptop's
 * built-in graphics does a hundred times faster than working the noise out at every pixel of
 * every frame (#311). Nothing is loaded: the patterns are code, as all the game's pictures are.
 */
export class TextureBaker {
  /** Noise that repeats every `period` cells, for the shaders that draw the patterns. */
  private static readonly NOISE = /* glsl */ `
    float corner(vec2 cell, float period) {
      cell = mod(cell, period);
      return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
    }
    float lumps(vec2 at, float period) {
      vec2 cell = floor(at); vec2 share = fract(at);
      share = share * share * (3.0 - 2.0 * share);
      return mix(mix(corner(cell, period), corner(cell + vec2(1.0, 0.0), period), share.x),
                 mix(corner(cell + vec2(0.0, 1.0), period), corner(cell + vec2(1.0, 1.0), period), share.x),
                 share.y);
    }
    /** Layers of lumps, the first with periods.x cells across and periods.y up. */
    float fractal(vec2 uv, vec2 periods, int octaves) {
      float sum = 0.0; float strength = 0.5; float total = 0.0;
      for (int octave = 0; octave < octaves; octave++) {
        // Each layer keeps a whole number of cells each way, so it still meets itself.
        vec2 at = uv * periods;
        vec2 cell = floor(at); vec2 share = fract(at);
        share = share * share * (3.0 - 2.0 * share);
        float a = fract(sin(dot(mod(cell, periods) + float(octave) * 7.3, vec2(127.1, 311.7))) * 43758.5453);
        float b = fract(sin(dot(mod(cell + vec2(1.0, 0.0), periods) + float(octave) * 7.3, vec2(127.1, 311.7))) * 43758.5453);
        float c = fract(sin(dot(mod(cell + vec2(0.0, 1.0), periods) + float(octave) * 7.3, vec2(127.1, 311.7))) * 43758.5453);
        float d = fract(sin(dot(mod(cell + vec2(1.0, 1.0), periods) + float(octave) * 7.3, vec2(127.1, 311.7))) * 43758.5453);
        sum += strength * mix(mix(a, b, share.x), mix(c, d, share.x), share.y);
        total += strength; strength *= 0.5; periods *= 2.0;
      }
      return sum / total;
    }
  `;

  /** Snow: its surface's slopes in red and green (wind-packed drifts, sastrugi and grain), the
   * blotches of old and new snow in blue, and the crystals that catch the light in alpha. */
  static readonly SNOW = /* glsl */ `
    float height(vec2 uv) {
      float drifts = fractal(uv, vec2(5.0, 5.0), 4);
      float sastrugi = fractal(uv + drifts * 0.05, vec2(4.0, 22.0), 4);
      float grain = fractal(uv, vec2(96.0, 96.0), 3);
      return drifts * 0.55 + sastrugi * 0.3 + grain * 0.07;
    }
    vec4 pattern(vec2 uv) {
      float step = 1.0 / 1024.0;
      float here = height(uv);
      vec2 slope = vec2(height(uv + vec2(step, 0.0)) - here, height(uv + vec2(0.0, step)) - here) / step;
      float blotch = fractal(uv + 0.31, vec2(3.0, 3.0), 5);
      float crystal = corner(floor(uv * 1024.0), 1024.0);
      return vec4(clamp(0.5 - slope * 0.06, 0.0, 1.0), blotch, crystal);
    }
  `;

  /** Ice: its surface's slopes in red and green, broken into flat facets as fractured ice is,
   * large ones with small chips on them; the year's layers in blue, running across the texture;
   * and the white lines of the fractures between the facets, with bubbles, in alpha. */
  static readonly ICE = /* glsl */ `
    /** The facet a point is in, among \`cells\` each way: its own tilt, and how near its edge. */
    vec3 facet(vec2 uv, float cells) {
      vec2 at = uv * cells; vec2 cell = floor(at); vec2 share = fract(at);
      float nearest = 9.0; float next = 9.0; vec2 own = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 step = vec2(float(i), float(j));
        vec2 other = mod(cell + step, cells);
        vec2 centre = vec2(corner(other, cells), corner(other + 17.3, cells));
        vec2 off = step + centre - share; float distance = dot(off, off);
        if (distance < nearest) { next = nearest; nearest = distance; own = other; }
        else if (distance < next) { next = distance; }
      }
      return vec3(corner(own + 3.1, cells) - 0.5, corner(own + 9.7, cells) - 0.5, sqrt(next) - sqrt(nearest));
    }
    vec4 pattern(vec2 uv) {
      float wander = fractal(uv, vec2(3.0, 3.0), 3);
      vec2 bent = uv + (wander - 0.5) * 0.03;
      vec3 big = facet(bent, 5.0);
      vec3 chip = facet(bent + 0.37, 19.0);
      float fine = fractal(uv, vec2(64.0, 64.0), 2) - 0.5;
      vec2 tilt = big.xy * 0.55 + chip.xy * 0.3 * smoothstep(0.0, 0.25, big.z) + fine * 0.05;
      float layers = fractal(uv + vec2(0.0, wander * 0.08), vec2(2.0, 26.0), 4);
      float fracture = 1.0 - smoothstep(0.0, 0.035, big.z);
      float hairline = (1.0 - smoothstep(0.0, 0.05, chip.z)) * 0.35;
      return vec4(clamp(0.5 + tilt, 0.0, 1.0), layers, max(fracture, hairline));
    }
  `;

  /** Stone: the moraine's rubble under Base Camp, stones of every size lying against one
   * another. Each stone's rounded top in red and green, its own shade in blue, and the dark gaps
   * between the stones in alpha. */
  static readonly STONE = /* glsl */ `
    /** The stone a point is on, among \`cells\` each way: the way to its middle, its own number,
     * and how near its edge. */
    vec4 stoneAt(vec2 uv, float cells) {
      vec2 at = uv * cells; vec2 cell = floor(at); vec2 share = fract(at);
      float nearest = 9.0; float next = 9.0; vec2 own = vec2(0.0); vec2 toMiddle = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 step = vec2(float(i), float(j));
        vec2 other = mod(cell + step, cells);
        vec2 centre = vec2(corner(other, cells), corner(other + 17.3, cells));
        vec2 off = step + centre - share; float distance = dot(off, off);
        if (distance < nearest) { next = nearest; nearest = distance; own = other; toMiddle = off; }
        else if (distance < next) { next = distance; }
      }
      return vec4(toMiddle, corner(own + 3.1, cells), sqrt(next) - sqrt(nearest));
    }
    vec4 pattern(vec2 uv) {
      float wander = fractal(uv, vec2(4.0, 4.0), 3) - 0.5;
      vec4 big = stoneAt(uv + wander * 0.03, 7.0);
      vec4 small = stoneAt(uv + 0.41 + wander * 0.02, 23.0);
      // A big stone here and there, small ones between.
      float isBig = step(0.62, big.z) * smoothstep(0.02, 0.1, big.w);
      vec4 stone = mix(small, big, isBig);
      float gap = 1.0 - smoothstep(0.0, 0.09, stone.w);
      float grit = fractal(uv, vec2(90.0, 90.0), 3);
      // Rounded: the top tips away from the middle, more towards the edge.
      vec2 tilt = -stone.xy * (0.5 + 1.2 * (1.0 - smoothstep(0.0, 0.35, stone.w))) + (grit - 0.5) * 0.25;
      float shade = stone.z * 0.65 + fractal(uv + 0.7, vec2(5.0, 5.0), 3) * 0.25 + grit * 0.1;
      return vec4(clamp(0.5 + tilt * 0.5, 0.0, 1.0), shade, gap);
    }
  `;

  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private readonly renderer: WebGLRenderer) {}

  /** A pattern drawn into a texture `size` pixels square, which repeats. */
  bake(pattern: string, size = 1024): Texture {
    const target = new WebGLRenderTarget(size, size, {
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      depthBuffer: false,
      anisotropy: Math.min(4, this.renderer.capabilities.getMaxAnisotropy()),
    });
    const material = new ShaderMaterial({
      vertexShader:
        "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `varying vec2 vUv;\n${TextureBaker.NOISE}\n${pattern}\nvoid main() { gl_FragColor = pattern(vUv); }`,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), material);
    this.scene.add(quad);
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.scene.remove(quad);
    quad.geometry.dispose();
    material.dispose();
    return target.texture;
  }
}
