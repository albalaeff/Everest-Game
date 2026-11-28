import { GLSL3, ShaderMaterial } from "three";
import type { Texture } from "three";

import { SceneLight } from "./scene-light";

/** The textures the ground is drawn with, each baked once (`TextureBaker`). */
export interface GroundTextures {
  readonly snow: Texture;
  readonly ice: Texture;
  readonly stone: Texture;
}

/**
 * How the glacier is drawn: snow where the ground lies back and bare ice where it stands up, the
 * ice bluer the deeper into a crevasse it goes, rubble on the moraine. Every pattern is a
 * texture look-up, the snow's drifts and grain and the ice's layers and veins among them, and
 * the light is the scene's (`SceneLight`): the sun or the moon with its shadows, the sky, the
 * snow's own light thrown back, the headlamp, the haze. Written to cost a laptop's built-in
 * graphics a few milliseconds a frame at full screen (#311): a dozen look-ups and no loops.
 */
export class GroundMaterial extends ShaderMaterial {
  private static readonly VERTEX = /* glsl */ `
    in float aDepth; in float aKind; in float aOpen;
    out vec3 vPoint; out vec3 vNormal; out float vDepth; out float vKind; out float vOpen;
    void main() {
      vec4 point = vec4(position, 1.0);
      vNormal = normal;
      #ifdef USE_INSTANCING
        point = instanceMatrix * point;
        vNormal = normalize(transpose(inverse(mat3(instanceMatrix))) * normal);
      #endif
      vPoint = point.xyz; vDepth = aDepth; vKind = aKind; vOpen = aOpen;
      gl_Position = projectionMatrix * viewMatrix * point;
    }
  `;

  private static readonly FRAGMENT = /* glsl */ `
    precision highp float;
    uniform sampler2D uSnow; uniform sampler2D uIce; uniform sampler2D uStone;
    in vec3 vPoint; in vec3 vNormal; in float vDepth; in float vKind; in float vOpen;
    out highp vec4 fragment;
    ${SceneLight.GLSL}
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 toEye = cameraPosition - vPoint;
      float distance = length(toEye);
      toEye /= distance;
      float near = exp(-distance / 30.0);

      // The patterns: the snow's from above, the ice's on whichever side the face looks to.
      vec3 facing = abs(normal);
      vec2 across = facing.x > facing.z ? vPoint.zy : vPoint.xy;
      vec4 grain = texture(uSnow, vPoint.xz * 0.23);
      vec4 drift = texture(uSnow, vPoint.xz * 0.029 + 0.37);
      vec4 chips = texture(uIce, across * 0.31);
      vec4 layers = texture(uIce, across * vec2(0.041, 0.047) + 0.5);

      // Snow lies where the ground lies back, and thins out down a crevasse's wall.
      float lying = normal.y + (drift.b - 0.5) * 0.5 + (layers.b - 0.5) * 0.2;
      float snow = smoothstep(0.42, 0.7, lying) * (1.0 - smoothstep(0.3, 1.8, vDepth));
      snow = max(snow, smoothstep(0.62, 0.8, drift.b + normal.y * 0.3) * (1.0 - smoothstep(0.0, 1.0, vDepth)) * 0.8);
      float bare = clamp(vKind, 0.0, 1.0);
      snow *= 1.0 - 0.85 * bare * smoothstep(0.35, 0.6, grain.b + drift.b * 0.4);
      float stone = clamp(vKind - 1.0, 0.0, 1.0);
      float trodden = clamp(-vKind, 0.0, 1.0);

      vec4 prints = texture(uSnow, vPoint.xz * 1.9 + 0.13);
      vec3 flatTilt = vec3(grain.r - 0.5, 0.0, grain.g - 0.5) * (0.14 + 0.5 * near)
                    + vec3(prints.r - 0.5, 0.0, prints.g - 0.5) * 1.3 * trodden * near
                    + vec3(drift.r - 0.5, 0.0, drift.g - 0.5) * 0.6;
      vec3 snowNormal = normalize(normal + flatTilt);
      vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normal) + vec3(1e-4, 0.0, 0.0));
      vec3 upFace = cross(normal, tangent);
      vec2 tilt = (chips.rg - 0.5) * (0.35 + 0.9 * near) + (layers.rg - 0.5) * 0.8;
      vec3 iceNormal = normalize(normal + tangent * tilt.x + upFace * tilt.y);
      vec3 surface = normalize(mix(iceNormal, snowNormal, snow));

      float deep = smoothstep(0.5, 9.0, vDepth);
      // Old ice weathers white and grainy; where a block has broken off lately it is bare and
      // blue, in patches; its layers show as fainter and darker bands, and its cracks as lines.
      float fresh = smoothstep(0.42, 0.7, drift.b * 0.55 + layers.b * 0.55 + (1.0 - normal.y) * 0.12);
      vec3 ice = mix(vec3(0.84, 0.89, 0.92), vec3(0.52, 0.74, 0.88), fresh * 0.7);
      float band = smoothstep(0.50, 0.56, layers.b) * (1.0 - smoothstep(0.60, 0.68, layers.b));
      ice *= 1.0 - 0.1 * band;
      float crack = max(chips.a * near, layers.a);
      ice = mix(ice, vec3(0.16, 0.42, 0.62), crack * 0.6);
      // Frost and wind-blown snow cling to a face in patches.
      float frost = smoothstep(0.45, 0.75, grain.b * 0.6 + drift.b * 0.5 + chips.b * 0.2 - 0.12) * (1.0 - smoothstep(0.5, 3.0, vDepth));
      ice = mix(ice, vec3(0.92, 0.95, 0.97), frost * 0.55 * (1.0 - crack));
      ice = mix(ice, vec3(0.03, 0.19, 0.38), deep);
      ice = mix(ice, vec3(0.003, 0.028, 0.075), smoothstep(6.0, 24.0, vDepth));
      // New snow is whiter than old, in drifts, and a glacier's snow greyer in wide patches.
      float aged = texture(uSnow, vPoint.xz * 0.0043 + 0.61).b;
      vec3 white = mix(vec3(0.80, 0.85, 0.91), vec3(0.94, 0.96, 0.975), 0.25 + 0.75 * drift.b) * (0.9 + 0.1 * aged)
                 * (1.0 - trodden * (0.05 + 0.1 * prints.b));
      vec3 colour = mix(ice, white, snow);
      if (stone > 0.0) {
        vec4 rubble = texture(uStone, vPoint.xz * 0.55);
        vec4 scree = texture(uStone, vPoint.xz * 0.19 + 0.2);
        float shade = rubble.b * 0.6 + scree.b * 0.4;
        vec3 rock = mix(vec3(0.07, 0.068, 0.07), vec3(0.33, 0.30, 0.27), shade);
        rock = mix(rock, vec3(0.27, 0.19, 0.13), smoothstep(0.75, 0.95, scree.b) * 0.6);
        rock *= 1.0 - 0.75 * max(rubble.a * near, scree.a * 0.8);
        float patches = smoothstep(0.7, 0.84, drift.b + (1.0 - stone) * 0.6);
        float kept = max(patches, 1.0 - stone);
        colour = mix(rock, colour, kept);
        vec3 rockNormal = normalize(normal + vec3(rubble.r - 0.5, 0.0, rubble.g - 0.5) * (0.4 + 2.2 * near)
                                           + vec3(scree.r - 0.5, 0.0, scree.g - 0.5) * 2.0);
        surface = normalize(mix(rockNormal, surface, kept));
        snow *= kept;
      }

      float lit = sunlit(vPoint, normal);
      // The sky a point sees (SkyShare), and less again far down a crevasse.
      float open = vOpen * (1.0 - 0.6 * smoothstep(1.0, 9.0, vDepth)) * (0.8 + 0.2 * drift.b);
      // The snow's own light, thrown back up, reaches under a lip the sky is hidden from.
      vec3 ambient = mix(uBounceColor * (0.3 + 0.7 * open), uSkyColor * open, surface.y * 0.5 + 0.5);
      float towards = dot(surface, uSunDir);
      // Snow passes light on under its surface: the edge of a shadow is soft and a little warm.
      float diffuse = mix(max(towards, 0.0), max(towards * 0.85 + 0.15, 0.0), snow) * lit;

      vec3 half_ = normalize(toEye + uSunDir);
      float gloss = mix(110.0, 16.0, max(snow, stone));
      float sheen = mix(0.9, 0.1, snow) * (1.0 - 0.95 * stone);
      float shine = pow(max(dot(surface, half_), 0.0), gloss) * sheen * lit;
      float crystal = step(0.972, grain.a) * snow * near;
      float glint = crystal * pow(max(dot(surface, half_), 0.0), 5.0) * 3.0 * lit;
      float edge = pow(1.0 - max(dot(surface, toEye), 0.0), 5.0);
      // Ice mirrors what's round it: the sky off a facet that tips up, the lit snow off one
      // that tips down, so each facet of a broken face has its own light.
      vec3 bounced = reflect(-toEye, surface);
      vec3 mirrored = mix(uBounceColor, uSkyColor * 1.5, smoothstep(-0.3, 0.5, bounced.y));

      vec3 toLamp;
      vec3 away = uLampPos - vPoint;
      float lampFar = length(away);
      toLamp = away / lampFar;
      float cone = smoothstep(0.80, 0.96, dot(-toLamp, uLampDir)) + smoothstep(0.2, 0.9, dot(-toLamp, uLampDir)) * 0.07;
      vec3 lamp = uLampColor * cone / (1.0 + lampFar * lampFar * 0.02);
      float lampOn = max(dot(surface, toLamp), 0.0);
      float lampShine = pow(max(dot(surface, normalize(toEye + toLamp)), 0.0), gloss) * sheen * 1.4 + crystal * 0.9;

      vec3 shaded = colour * (ambient + uSunColor * diffuse + lamp * lampOn)
                  + uSunColor * (shine + glint)
                  + lamp * lampShine
                  + mirrored * (0.04 + 0.96 * edge) * sheen * 0.75 * open;
      // Thin ice with the sun behind it glows from inside.
      float through = pow(max(dot(-toEye, uSunDir), 0.0), 3.0) * (1.0 - snow) * (1.0 - deep);
      shaded += vec3(0.07, 0.34, 0.46) * uSunColor * through * 0.1;
      fragment = vec4(toScreen(throughAir(shaded, vPoint)), 1.0);
    }
  `;

  constructor(light: SceneLight, textures: GroundTextures) {
    super({
      glslVersion: GLSL3,
      uniforms: {
        ...light.uniforms,
        uSnow: { value: textures.snow },
        uIce: { value: textures.ice },
        uStone: { value: textures.stone },
      },
      vertexShader: GroundMaterial.VERTEX,
      fragmentShader: GroundMaterial.FRAGMENT,
    });
  }
}
