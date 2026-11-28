import {
  DepthTexture,
  LessEqualCompare,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  OrthographicCamera,
  Vector3,
  WebGLRenderTarget,
} from "three";
import type { Scene, WebGLRenderer } from "three";

import type { SceneLight } from "./scene-light";

/** One shadow map: the square of ground it covers round a point, and what it draws. */
class ShadowMap {
  private static readonly TO_TEXTURE = new Matrix4().set(
    0.5,
    0,
    0,
    0.5,
    0,
    0.5,
    0,
    0.5,
    0,
    0,
    0.5,
    0.5,
    0,
    0,
    0,
    1,
  );
  private static readonly DEPTH = new MeshBasicMaterial({
    colorWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1.5,
    polygonOffsetUnits: 2,
  });

  readonly target: WebGLRenderTarget;
  readonly centre = new Vector3(Number.NaN, 0, 0);
  private readonly camera: OrthographicCamera;

  constructor(
    size: number,
    private readonly half: number,
    private readonly back: number,
    layer: number,
  ) {
    const depth = new DepthTexture(size, size);
    depth.compareFunction = LessEqualCompare;
    depth.minFilter = LinearFilter;
    depth.magFilter = LinearFilter;
    this.target = new WebGLRenderTarget(size, size, { depthTexture: depth, depthBuffer: true });
    this.camera = new OrthographicCamera(-half, half, half, -half, 1, 2 * back);
    this.camera.layers.set(layer);
  }

  /** Draws what the light sees round `centre`, and writes how a point of the world finds its
   * place in the map into `matrix`. */
  draw(
    renderer: WebGLRenderer,
    scene: Scene,
    centre: Vector3,
    toLight: Vector3,
    matrix: Matrix4,
  ): void {
    const { camera } = this;
    this.centre.copy(centre);
    camera.position.copy(centre).addScaledVector(toLight, this.back);
    camera.up.set(0, 1, 0);
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    matrix
      .copy(ShadowMap.TO_TEXTURE)
      .multiply(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
    const before = scene.overrideMaterial;
    scene.overrideMaterial = ShadowMap.DEPTH;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = before;
  }

  /** Whether a point has gone further from the map's centre than a share of its half-width. */
  left(point: Vector3, share: number): boolean {
    return !(point.distanceTo(this.centre) < this.half * share);
  }
}

/**
 * The shadows the sun casts, or the moon. Two maps: a wide one of the ground, the ice and the
 * ladders round the climber, drawn again only when the light has moved half a degree or the
 * climber has walked out towards its edge, since nothing in it moves; and a small sharp one of
 * the climbers themselves, close round the player, drawn every frame. So a frame pays for a few
 * thousand triangles of shadow, not for the whole glacier's (#311).
 */
export class SunShadows {
  /** The layers of the scene: the ground and what stands on it, the climbers, and the sky. */
  static readonly GROUND = 0;
  static readonly CLIMBERS = 1;
  static readonly SKY = 2;
  /** How long the wide map waits before it's drawn again, in seconds of the picture. */
  private static readonly REST = 0.5;

  private readonly far: ShadowMap;
  private readonly near: ShadowMap;
  private readonly drawnFor = new Vector3();
  private rested = Number.POSITIVE_INFINITY;
  /** How many times the wide map has been drawn: the stories and a measurement read it. */
  redrawn = 0;

  constructor(
    private readonly light: SceneLight,
    size: number,
  ) {
    this.far = new ShadowMap(size, 95, 240, SunShadows.GROUND);
    this.near = new ShadowMap(size / 2, 4, 20, SunShadows.CLIMBERS);
    light.uniforms.uShadowMap.value = this.far.target.depthTexture;
    light.uniforms.uNearShadowMap.value = this.near.target.depthTexture;
  }

  /** A frame's shadows round the player, `seconds` after the last. */
  draw(renderer: WebGLRenderer, scene: Scene, player: Vector3, seconds: number): void {
    const { uniforms } = this.light;
    const toLight = uniforms.uSunDir.value;
    this.rested += seconds;
    const stale = this.light.movedFrom(this.drawnFor) || this.far.left(player, 0.4);
    if (stale && this.rested >= SunShadows.REST) {
      this.far.draw(renderer, scene, player, toLight, uniforms.uShadowMatrix.value);
      this.drawnFor.copy(toLight);
      this.rested = 0;
      this.redrawn += 1;
    }
    this.near.draw(renderer, scene, player, toLight, uniforms.uNearShadowMatrix.value);
  }

  /** The wide map drawn again on the next frame: the ground has changed. */
  redraw(): void {
    this.drawnFor.set(0, 0, 0);
    this.rested = Number.POSITIVE_INFINITY;
  }
}
