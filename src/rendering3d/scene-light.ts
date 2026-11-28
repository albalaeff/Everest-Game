import { Color, Matrix4, Vector3 } from "three";
import type { Texture } from "three";

import type { Atmosphere } from "../rendering/atmosphere";

/** A uniform as three.js keeps one. */
interface Uniform<T> {
  value: T;
}

/** What every surface of the picture is lit by, as its shaders read it. */
export interface LightUniforms {
  readonly [name: string]: Uniform<unknown>;
  readonly uSunDir: Uniform<Vector3>;
  readonly uSunColor: Uniform<Color>;
  readonly uSkyColor: Uniform<Color>;
  readonly uBounceColor: Uniform<Color>;
  readonly uFogColor: Uniform<Color>;
  readonly uFogGlow: Uniform<Color>;
  readonly uFogDensity: Uniform<number>;
  readonly uLampPos: Uniform<Vector3>;
  readonly uLampDir: Uniform<Vector3>;
  readonly uLampColor: Uniform<Color>;
  readonly uExposure: Uniform<number>;
  readonly uShadowMap: Uniform<Texture | null>;
  readonly uShadowMatrix: Uniform<Matrix4>;
  readonly uNearShadowMap: Uniform<Texture | null>;
  readonly uNearShadowMatrix: Uniform<Matrix4>;
  readonly uSeconds: Uniform<number>;
}

/**
 * The light of the 3D picture: the sun where the mountain's clock has it, its colour by how high
 * it stands, the sky's light and the snow's own thrown back up, the haze, and the climber's
 * headlamp. One set of numbers every surface's shader reads, so the ground, the ice, the ladders
 * and the people stand in the same light. The hour and the weather come from the 2D picture's
 * `Atmosphere`, so both pictures tell the same time.
 */
export class SceneLight {
  /** How high the sun stands over Everest at noon in May, in radians. */
  private static readonly NOON = (78 * Math.PI) / 180;
  /** The moon: a fixed light high behind the climber's right shoulder, for the night's shadows. */
  private static readonly MOON = new Vector3(0.45, 0.62, 0.64).normalize();

  /** The GLSL every lit surface shares: the uniforms, the shadows, the light and the air. */
  static readonly GLSL = /* glsl */ `
    uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyColor; uniform vec3 uBounceColor;
    uniform vec3 uFogColor; uniform vec3 uFogGlow; uniform float uFogDensity;
    uniform vec3 uLampPos; uniform vec3 uLampDir; uniform vec3 uLampColor;
    uniform float uExposure; uniform float uSeconds;
    uniform highp sampler2DShadow uShadowMap; uniform mat4 uShadowMatrix;
    uniform highp sampler2DShadow uNearShadowMap; uniform mat4 uNearShadowMatrix;

    /** The share of the sun a point gets: 1 in the open, 0 in shadow. */
    float sunlit(vec3 point, vec3 normal) {
      vec3 lifted = point + normal * 0.06;
      vec4 far = uShadowMatrix * vec4(lifted, 1.0);
      vec3 at = far.xyz / far.w;
      float lit = 1.0;
      if (at.x > 0.0 && at.x < 1.0 && at.y > 0.0 && at.y < 1.0 && at.z < 1.0) {
        vec2 texel = 1.0 / vec2(textureSize(uShadowMap, 0));
        at.z -= 0.0003;
        lit = (texture(uShadowMap, at + vec3(-0.6, -0.6, 0.0) * texel.xyx)
             + texture(uShadowMap, at + vec3(0.6, -0.6, 0.0) * texel.xyx)
             + texture(uShadowMap, at + vec3(-0.6, 0.6, 0.0) * texel.xyx)
             + texture(uShadowMap, at + vec3(0.6, 0.6, 0.0) * texel.xyx)) * 0.25;
      }
      vec4 near = uNearShadowMatrix * vec4(lifted, 1.0);
      vec3 by = near.xyz / near.w;
      if (by.x > 0.0 && by.x < 1.0 && by.y > 0.0 && by.y < 1.0 && by.z < 1.0) {
        by.z -= 0.0015;
        lit = min(lit, texture(uNearShadowMap, by));
      }
      return lit;
    }

    /** The headlamp's light on a point: its cone, fading with distance. */
    vec3 lamplight(vec3 point, vec3 normal, out vec3 toLamp) {
      vec3 away = uLampPos - point;
      float distance = length(away);
      toLamp = away / distance;
      float cone = smoothstep(0.80, 0.96, dot(-toLamp, uLampDir));
      float spill = smoothstep(0.2, 0.9, dot(-toLamp, uLampDir)) * 0.06;
      float reach = 1.0 / (1.0 + distance * distance * 0.02);
      return uLampColor * (cone + spill) * reach * max(dot(normal, toLamp), 0.0);
    }

    /** The air between the eye and a point: haze by distance, lit towards the sun. */
    vec3 throughAir(vec3 colour, vec3 point) {
      vec3 ray = point - cameraPosition;
      float distance = length(ray);
      float haze = 1.0 - exp(-distance * uFogDensity);
      float towardSun = pow(max(dot(ray / distance, uSunDir), 0.0), 12.0);
      return mix(colour, uFogColor + uFogGlow * towardSun, haze);
    }

    /** A lit colour as the screen shows it: the camera's exposure, a film's shoulder, sRGB. */
    vec3 toScreen(vec3 colour) {
      vec3 x = colour * uExposure;
      vec3 mapped = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
      return pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.2));
    }
  `;

  readonly uniforms: LightUniforms = {
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Color(1, 1, 1) },
    uSkyColor: { value: new Color(0.3, 0.4, 0.6) },
    uBounceColor: { value: new Color(0.2, 0.2, 0.25) },
    uFogColor: { value: new Color(0.5, 0.6, 0.8) },
    uFogGlow: { value: new Color(0, 0, 0) },
    uFogDensity: { value: 0.0015 },
    uLampPos: { value: new Vector3() },
    uLampDir: { value: new Vector3(0, 0, -1) },
    uLampColor: { value: new Color(0, 0, 0) },
    uExposure: { value: 1 },
    uShadowMap: { value: null },
    uShadowMatrix: { value: new Matrix4() },
    uNearShadowMap: { value: null },
    uNearShadowMatrix: { value: new Matrix4() },
    uSeconds: { value: 0 },
  };

  /** The sky's colours, for the dome: overhead, at the horizon, and round the sun. */
  readonly zenith = new Color();
  readonly horizon = new Color();
  readonly sunGlow = new Color();
  /** How bright the stars are and the sun's disc, 0 to 1. */
  stars = 0;
  disc = 0;
  /** Where the sun itself is, whichever light casts the shadows. */
  readonly sunAt = new Vector3(0, 1, 0);

  /** The light at an hour: `timeOfDay` in seconds since midnight, through the 2D picture's
   * atmosphere for how much daylight there is and what the weather does to it. */
  set(timeOfDay: number, atmosphere: Atmosphere, lampLit: boolean, seconds: number): void {
    const { light, look } = atmosphere;
    const { uniforms } = this;
    const hours = (((timeOfDay / 3600) % 24) + 24) % 24;
    const height = light.sun * SceneLight.NOON;
    const turn = ((hours - 6) / 12) * Math.PI;
    this.sunAt
      .set(Math.sin(turn) * Math.cos(height), Math.sin(height), -Math.cos(turn) * Math.cos(height))
      .normalize();
    const up = Math.max(Math.sin(height), 0);
    const day = SceneLight.smooth(-0.02, 0.2, light.sun);
    const night = 1 - SceneLight.smooth(-0.14, -0.01, light.sun);
    const overcast = Math.min(look.overcast + 0.6 * look.fog + 0.5 * look.veil, 1);
    const open = 1 - 0.88 * overcast;
    // Low, the sun's light has crossed more air: warmer and weaker.
    const low = 1 - SceneLight.smooth(0.02, 0.45, up);
    const sunStrength = 2.3 * day * open * (1 - 0.55 * low);
    if (night > 0.02 && day < 0.02) {
      uniforms.uSunDir.value.copy(SceneLight.MOON);
      uniforms.uSunColor.value.setRGB(0.32, 0.42, 0.62).multiplyScalar(0.11 * night * open);
    } else {
      uniforms.uSunDir.value.copy(this.sunAt);
      uniforms.uSunColor.value
        .setRGB(1, 0.96 - 0.38 * low, 0.9 - 0.62 * low)
        .multiplyScalar(sunStrength);
    }
    const grey = 0.55 * overcast;
    this.zenith
      .setRGB(0.05 + 0.12 * grey, 0.13 + 0.14 * grey, 0.42 - 0.08 * grey)
      .multiplyScalar(0.02 + 0.98 * light.daylight);
    this.horizon
      .setRGB(0.36 + 0.2 * grey, 0.55 + 0.08 * grey, 0.86 - 0.14 * grey)
      .multiplyScalar(0.012 + 0.99 * light.daylight);
    this.sunGlow.setRGB(1, 0.5, 0.22).multiplyScalar(light.glow * open * 0.9);
    this.horizon.r += 0.35 * light.glow * open;
    this.horizon.g += 0.12 * light.glow * open;
    this.stars = light.stars * (1 - overcast);
    this.disc = day * open;
    const sky = 0.02 + 0.98 * light.daylight;
    uniforms.uSkyColor.value
      .setRGB(0.3 + 0.3 * grey, 0.44 + 0.2 * grey, 0.74 - 0.05 * grey)
      .multiplyScalar(0.62 * sky + 0.012 * night);
    uniforms.uBounceColor.value
      .setRGB(0.5, 0.52, 0.56)
      .multiplyScalar(0.42 * sky * (0.35 + 0.65 * open * Math.sqrt(up)) + 0.004 * night);
    const haze = 0.00007 + 0.004 * look.haze + 0.03 * look.fog + 0.012 * look.mist;
    uniforms.uFogDensity.value = haze;
    uniforms.uFogColor.value
      .setRGB(0.42 + 0.25 * grey, 0.56 + 0.14 * grey, 0.8 - 0.06 * grey)
      .multiplyScalar(0.01 + 0.9 * light.daylight);
    uniforms.uFogGlow.value.setRGB(1, 0.62, 0.34).multiplyScalar(0.5 * light.glow * open);
    const lamp = lampLit ? light.lamps : 0;
    uniforms.uLampColor.value.setRGB(1, 0.93, 0.8).multiplyScalar(2.6 * lamp);
    uniforms.uExposure.value = 0.6 + 1.9 * night + 0.5 * (1 - day) * (1 - night);
    uniforms.uSeconds.value = seconds;
  }

  /** Whether the light that casts the shadows has moved since `before`, enough to draw them
   * again: half a degree. */
  movedFrom(before: Vector3): boolean {
    return this.uniforms.uSunDir.value.dot(before) < 0.99996;
  }

  private static smooth(from: number, to: number, value: number): number {
    const share = Math.min(Math.max((value - from) / (to - from), 0), 1);
    return share * share * (3 - 2 * share);
  }
}
