import { Container, Geometry, GlProgram, Mesh, Shader, UniformGroup } from "pixi.js";
import type { DestroyOptions, Texture } from "pixi.js";

import type { Beam } from "./beam";
import type { GlacierIce, IceStrip } from "./glacier-ice";
import { Palette } from "./palette";

/**
 * The glacier's ice as it's drawn (`GlacierIce`): each strip of it on a mesh that hangs from the
 * surface, in the day's colours for the hour to tint, as the container's tint does; and where a
 * headlamp lights the ground, its light coming down into the ice under it, so the ice there shows
 * its own colours, the turquoise and the blue of its layers, fading as the light goes deeper and
 * further from where the beam falls, as a lamp held to blue ice shows it. Round any lamp its light
 * spills into the ice near it too, whichever way it looks. A small program of the picture's own does
 * it as each strip is drawn, so it costs no pass of its own over the screen.
 */
export class GlacierDrawing extends Container {
  /** The most lamps it lights by: the expedition's climbers in view, at the most. */
  static readonly MOST_LAMPS = 8;
  /** How the lamps' light comes into the ice: down to a third every so many metres under the
   * surface; round a lamp, as brightly as this share of its beam out to so many metres; so much
   * brighter than the light that makes it, where the ice takes it all; and spreading so far either
   * side just under the surface, and more as it goes down. */
  private static readonly INTO = { deep: 1.2, spill: 0.6, spillReach: 3, strong: 1.7, spread: 0.3 };

  private static program: GlProgram | null = null;
  private readonly lamps = new UniformGroup({
    uLamps: {
      value: new Float32Array(GlacierDrawing.MOST_LAMPS * 8),
      type: "vec4<f32>",
      size: GlacierDrawing.MOST_LAMPS * 2,
    },
    uLampCount: { value: 0, type: "f32" },
    uLampColour: { value: new Float32Array(3), type: "vec3<f32>" },
    uInto: { value: new Float32Array(4), type: "vec4<f32>" },
  });
  /** Whether any lamp lit it when it was last lit. */
  private lit = true;

  constructor() {
    super();
    const { INTO } = GlacierDrawing;
    const colour = Palette.channels(Palette.LAMP);
    const { uniforms } = this.lamps;
    (uniforms.uLampColour as Float32Array).set([
      (colour.red / 255) * INTO.strong,
      (colour.green / 255) * INTO.strong,
      (colour.blue / 255) * INTO.strong,
    ]);
    (uniforms.uInto as Float32Array).set([INTO.deep, INTO.spill, INTO.spillReach, INTO.spread]);
  }

  /** A strip of `glacier` hung from its surface, drawn from `texture`, its picture. */
  hang(glacier: GlacierIce, strip: IceStrip, texture: Texture): void {
    const { vertices, uvs, indices } = glacier.hang(strip);
    const geometry = new Geometry({
      attributes: { aPosition: vertices, aUV: uvs },
      indexBuffer: indices,
    });
    const shader = new Shader({
      glProgram: GlacierDrawing.glProgram(),
      resources: {
        uTexture: texture.source,
        glacierLamps: this.lamps,
        glacierBand: new UniformGroup({
          uBand: {
            value: new Float32Array([strip.band.from, strip.band.to, 0, 0]),
            type: "vec4<f32>",
          },
        }),
      },
    });
    this.addChild(new Mesh({ geometry, shader }));
  }

  /** The lamps' light this frame, from `beams`: nothing written while none is lit, nor again. */
  light(beams: readonly Beam[]): void {
    const { MOST_LAMPS } = GlacierDrawing;
    const { uniforms } = this.lamps;
    const shown = beams.filter((beam) => beam.strength > 0).slice(0, MOST_LAMPS);
    if (shown.length === 0 && !this.lit) {
      return;
    }
    const lamps = uniforms.uLamps as Float32Array;
    for (const [index, beam] of shown.entries()) {
      lamps.set(
        [
          beam.from.x,
          beam.from.y,
          Math.cos(beam.direction),
          Math.sin(beam.direction),
          beam.reach,
          beam.spread,
          beam.strength,
          0,
        ],
        index * 8,
      );
    }
    uniforms.uLampCount = shown.length;
    this.lamps.update();
    this.lit = shown.length > 0;
  }

  override destroy(options?: DestroyOptions): void {
    for (const child of this.children) {
      (child as Mesh).shader?.destroy();
    }
    super.destroy(options);
  }

  /** The program each strip is drawn with, made once: the strip's picture in the tint's light,
   * and the lamps' light coming into its ice under the surface where their beams fall. */
  private static glProgram(): GlProgram {
    GlacierDrawing.program ??= GlProgram.from({
      name: "glacier-ice",
      vertex: `
        in vec2 aPosition;
        in vec2 aUV;
        out vec2 vUV;
        out vec2 vPosition;
        out vec4 vColor;
        uniform mat3 uProjectionMatrix;
        uniform mat3 uWorldTransformMatrix;
        uniform vec4 uWorldColorAlpha;
        uniform mat3 uTransformMatrix;
        uniform vec4 uColor;
        void main(void) {
          mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
          gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
          vUV = aUV;
          vPosition = aPosition;
          vColor = uColor * uWorldColorAlpha;
        }
      `,
      fragment: `
        in vec2 vUV;
        in vec2 vPosition;
        in vec4 vColor;
        out vec4 finalColor;
        uniform sampler2D uTexture;
        uniform vec4 uLamps[${GlacierDrawing.MOST_LAMPS * 2}];
        uniform float uLampCount;
        uniform vec3 uLampColour;
        uniform vec4 uInto;
        uniform vec4 uBand;
        void main(void) {
          vec4 ice = texture(uTexture, vUV);
          vec3 colour = ice.rgb * vColor.rgb;
          if (uLampCount > 0.0) {
            float depth = uBand.x + vUV.y * (uBand.y - uBand.x);
            vec2 surface = vec2(vPosition.x, vPosition.y + depth);
            // The light spreads as it goes down: three points of the surface over it, so far apart.
            float spread = uInto.w + 0.45 * depth;
            float light = 0.0;
            for (int index = 0; index < ${GlacierDrawing.MOST_LAMPS}; index++) {
              if (float(index) >= uLampCount) {
                break;
              }
              vec4 lamp = uLamps[index * 2];
              vec4 beam = uLamps[index * 2 + 1];
              float lit = 0.0;
              for (int tap = -1; tap <= 1; tap++) {
                vec2 off = surface + vec2(float(tap) * spread, 0.0) - lamp.xy;
                float along = dot(off, lamp.zw);
                float across = abs(-off.x * lamp.w + off.y * lamp.z);
                float cone = atan(across, max(along, 1e-4)) / beam.y;
                float here = along > 0.0 && along < beam.x && cone < 1.0
                  ? beam.z * (1.0 - along / beam.x) * (1.0 - cone * cone)
                  : 0.0;
                lit += here * (tap == 0 ? 0.5 : 0.25);
              }
              float spilt = beam.z * uInto.y * max(0.0, 1.0 - length(vPosition - lamp.xy) / uInto.z);
              light = max(light, max(lit, spilt));
            }
            colour += ice.rgb * uLampColour * light * exp(-depth / uInto.x);
          }
          finalColor = vec4(colour, ice.a) * vColor.a;
        }
      `,
    });
    return GlacierDrawing.program;
  }
}
