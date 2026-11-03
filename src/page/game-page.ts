import { ControlsPage } from "../input/controls-page";
import type { ControlTexts } from "../input/controls-page";
import { PageElements } from "../input/page-elements";
import { ReceivedActions } from "../input/received-actions";
import { SlopePhysics } from "../physics";
import { Camera, FpsReadout, QualityButton, QualityChoice, SlopeScene } from "../rendering";
import type { RenderingTexts } from "../rendering";
import { Expedition, MountainClock } from "../simulation";
import { ActionQueue, EverySink } from "./action-queue";
import { GameLoop } from "./game-loop";
import { KnowledgeBase } from "./knowledge-base";
import type { KnowledgeFile } from "./knowledge-base";
import { StandInRoute } from "./stand-in-route";

export interface PageTexts {
  readonly controls: ControlTexts;
  readonly rendering: RenderingTexts;
}

/** What the page's stories read that the DOM doesn't show, on `window.everest`. */
export interface PageHooks {
  pixelAt(x: number, y: number): readonly number[];
}

/**
 * The page: a new expedition on the stand-in section, run in real time by the game loop, drawn by
 * the scene through the camera, and played through the controls, with the rules' numbers from
 * the knowledge base. Without WebGL it says so and runs the expedition with no picture, so the
 * controls still work.
 */
export class GamePage {
  /** The record the mountain's clock runs at: how many times faster than play. */
  private static readonly COMPRESSION = "time.compression";

  private readonly elements: PageElements;
  private readonly knowledge: KnowledgeBase;

  constructor(
    private readonly window: Window,
    private readonly texts: PageTexts,
    facts: readonly KnowledgeFile[],
  ) {
    this.elements = new PageElements(window.document);
    this.knowledge = new KnowledgeBase(facts);
  }

  async open(): Promise<void> {
    const { window, texts } = this;
    const route = new StandInRoute();
    const clock = new MountainClock(this.knowledge.number(GamePage.COMPRESSION));
    const physics = new SlopePhysics(route.settings);
    const scenario = route.scenario(this.newSeed());
    const expedition = Expedition.start(scenario, [clock, physics]);
    const player = StandInRoute.PLAYER;
    const camera = new Camera(
      {
        get climber() {
          return physics.climber(player);
        },
      },
      window.innerWidth,
      window.innerHeight,
    );
    const choice = new QualityChoice(
      this.storage(),
      window.matchMedia("(pointer: coarse)").matches,
    );
    const host = this.elements.find("#slope");
    const scene = new SlopeScene(
      host,
      camera,
      physics,
      scenario.climbers,
      player,
      choice.quality,
      scenario.seed,
    );
    const queue = new ActionQueue();
    const received = new ReceivedActions(this.elements.find("#received"));
    new ControlsPage(window, texts.controls, camera, new EverySink([queue, received]));
    const loop = new GameLoop(expedition, queue, scene);
    const button = new QualityButton(choice, texts.rendering, (quality) => {
      scene.setQuality(quality, window.devicePixelRatio);
    });
    button.appendTo(this.elements.find("header"));
    const fps = new FpsReadout(this.elements.find("#fps"), texts.rendering.fps);
    if (await scene.open(window)) {
      scene.eachFrame((seconds, now) => {
        loop.frame(seconds);
        fps.frame(now);
      });
      this.expose({ pixelAt: (x, y) => scene.pixelAt(x, y) });
    } else {
      host.textContent = texts.rendering["no-webgl"];
      this.runWithoutPicture(loop);
    }
  }

  /** A new seed for a new expedition, so no two are alike (docs/conventions/simulation-core.md). */
  private newSeed(): number {
    const [seed] = this.window.crypto.getRandomValues(new Uint32Array(1));
    return seed ?? 0;
  }

  /** The device's storage, or none where the browser refuses it. */
  private storage(): Storage | null {
    try {
      return this.window.localStorage;
    } catch {
      return null;
    }
  }

  private expose(hooks: PageHooks): void {
    Object.assign(this.window, { everest: hooks });
  }

  /** The loop on the browser's frames alone, when there's no scene to drive it. */
  private runWithoutPicture(loop: GameLoop): void {
    let last: number | null = null;
    const frame = (now: number): void => {
      loop.frame(last === null ? 0 : (now - last) / 1000);
      last = now;
      this.window.requestAnimationFrame(frame);
    };
    this.window.requestAnimationFrame(frame);
  }
}
