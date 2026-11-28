import { GLSL3, ShaderMaterial } from "three";

import { SceneLight } from "./scene-light";

/**
 * How everything a climber wears, carries and climbs on is drawn: the down suits, the packs, the
 * ladders' aluminium, the ropes. Each point has its own colour, given with the mesh, so a whole
 * figure is a few meshes of one material; the light is the scene's, with its shadows, and a
 * shine of its own, dull for cloth and bright for metal.
 */
export class KitMaterial extends ShaderMaterial {
  private static readonly VERTEX = /* glsl */ `
    in vec3 aColor;
    out vec3 vPoint; out vec3 vNormal; out vec3 vColor;
    void main() {
      vec4 point = vec4(position, 1.0);
      vec3 facing = normal;
      #ifdef USE_INSTANCING
        point = instanceMatrix * point;
        facing = mat3(instanceMatrix) * facing;
      #endif
      point = modelMatrix * point;
      vPoint = point.xyz; vNormal = normalize(mat3(modelMatrix) * facing); vColor = aColor;
      gl_Position = projectionMatrix * viewMatrix * point;
    }
  `;

  private static readonly FRAGMENT = /* glsl */ `
    precision highp float;
    uniform float uShine; uniform float uGloss;
    in vec3 vPoint; in vec3 vNormal; in vec3 vColor;
    out highp vec4 fragment;
    ${SceneLight.GLSL}
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 toEye = normalize(cameraPosition - vPoint);
      float lit = sunlit(vPoint, normal);
      float towards = dot(normal, uSunDir);
      // Cloth lets a little light round its edge: the shaded side is never flat.
      float diffuse = max(towards * 0.9 + 0.1, 0.0) * lit;
      vec3 ambient = mix(uBounceColor * 0.8, uSkyColor, normal.y * 0.5 + 0.5);
      float shine = pow(max(dot(normal, normalize(toEye + uSunDir)), 0.0), uGloss) * uShine * lit;
      float edge = pow(1.0 - max(dot(normal, toEye), 0.0), 3.0);
      vec3 away = uLampPos - vPoint;
      float lampFar = length(away);
      vec3 toLamp = away / lampFar;
      float cone = smoothstep(0.80, 0.96, dot(-toLamp, uLampDir)) + smoothstep(0.2, 0.9, dot(-toLamp, uLampDir)) * 0.07;
      vec3 lamp = uLampColor * cone / (1.0 + lampFar * lampFar * 0.02);
      float lampShine = pow(max(dot(normal, normalize(toEye + toLamp)), 0.0), uGloss) * uShine;
      vec3 shaded = vColor * (ambient + uSunColor * diffuse + lamp * max(dot(normal, toLamp), 0.0))
                  + uSunColor * shine + lamp * lampShine
                  + (uSkyColor + uSunColor * 0.15 * lit) * edge * (0.12 + 0.3 * uShine);
      fragment = vec4(toScreen(throughAir(shaded, vPoint)), 1.0);
    }
  `;

  /** `shine` is how bright the sun's glint is on it, and `gloss` how tight: cloth 0.08 and 12,
   * metal 0.9 and 60. */
  constructor(light: SceneLight, shine: number, gloss: number) {
    super({
      glslVersion: GLSL3,
      uniforms: { ...light.uniforms, uShine: { value: shine }, uGloss: { value: gloss } },
      vertexShader: KitMaterial.VERTEX,
      fragmentShader: KitMaterial.FRAGMENT,
    });
  }
}
