import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
} from "three";
import type { Vector3 } from "three";

import { FieldNoise } from "./field-noise";
import type { SceneLight } from "./scene-light";
import { SunShadows } from "./sun-shadows";

/**
 * The sky: a dome round the eye, nearly indigo overhead as it is in thin air, paler to the
 * horizon, with the sun's disc and its glow, the dawn along the horizon, and the stars at night.
 * It moves with the eye, so it's never nearer; its colours are the scene light's.
 */
export class SkyDome {
  private static readonly RADIUS = 9000;
  private static readonly STARS = 1600;

  readonly group = new Group();
  private readonly stars: PointsMaterial;
  private readonly dome: ShaderMaterial;
  private readonly disc = { value: 0 };

  constructor(private readonly light: SceneLight) {
    this.dome = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uZenith: { value: light.zenith },
        uHorizon: { value: light.horizon },
        uGlow: { value: light.sunGlow },
        uSunAt: { value: light.sunAt },
        uDisc: this.disc,
        uExposure: light.uniforms.uExposure,
      },
      vertexShader: /* glsl */ `
        varying vec3 vWay;
        void main() { vWay = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSunAt;
        uniform float uDisc; uniform float uExposure;
        varying vec3 vWay;
        void main() {
          vec3 way = normalize(vWay);
          float up = max(way.y, 0.0);
          vec3 colour = mix(uHorizon, uZenith, pow(up, 0.42));
          float toSun = max(dot(way, uSunAt), 0.0);
          float low = pow(max(1.0 - abs(way.y) * 2.6, 0.0), 2.0);
          colour += uGlow * (pow(toSun, 6.0) * 0.6 + low * pow(toSun, 1.5) * 0.7);
          colour += uDisc * (vec3(1.0, 0.86, 0.66) * pow(toSun, 90.0) * 0.5
                           + vec3(1.0, 0.92, 0.8) * pow(toSun, 700.0) * 2.5
                           + vec3(1.0, 0.97, 0.92) * smoothstep(0.99986, 0.99995, toSun) * 40.0);
          colour = mix(colour, uHorizon * 0.7, smoothstep(0.0, -0.25, way.y));
          vec3 x = colour * uExposure;
          vec3 mapped = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
          gl_FragColor = vec4(pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
        }
      `,
    });
    const dome = new Mesh(new SphereGeometry(SkyDome.RADIUS, 32, 16), this.dome);
    dome.renderOrder = -2;
    dome.frustumCulled = false;
    dome.layers.set(SunShadows.SKY);
    this.stars = new PointsMaterial({
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      vertexColors: true,
    });
    const stars = new Points(SkyDome.starField(), this.stars);
    stars.renderOrder = -1;
    stars.frustumCulled = false;
    stars.layers.set(SunShadows.SKY);
    this.group.add(dome, stars);
  }

  /** A frame's sky, round the eye. */
  place(eye: Vector3): void {
    this.group.position.copy(eye);
    this.disc.value = this.light.disc;
    this.stars.opacity = this.light.stars;
    this.stars.visible = this.light.stars > 0.01;
  }

  /** The stars: scattered evenly over the upper sky, a few bright and most faint, each the
   * colour of a star. */
  private static starField(): BufferGeometry {
    const noise = new FieldNoise(1953);
    const positions = new Float32Array(SkyDome.STARS * 3);
    const colours = new Float32Array(SkyDome.STARS * 3);
    for (let star = 0; star < SkyDome.STARS; star += 1) {
      const height = noise.corner(star, 0) * 1.05 - 0.05;
      const round = noise.corner(star, 1) * 2 * Math.PI;
      const flat = Math.sqrt(Math.max(1 - height * height, 0));
      const radius = SkyDome.RADIUS * 0.9;
      positions.set(
        [flat * Math.cos(round) * radius, height * radius, flat * Math.sin(round) * radius],
        3 * star,
      );
      const bright = Math.pow(noise.corner(star, 2), 5) * 0.9 + 0.12;
      const warm = noise.corner(star, 3);
      colours.set(
        [bright * (0.85 + 0.15 * warm), bright * 0.9, bright * (1 - 0.2 * warm)],
        3 * star,
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colours, 3));
    return geometry;
  }
}
