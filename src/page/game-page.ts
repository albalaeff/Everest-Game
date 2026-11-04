import type { Build } from "../build";
import { KnowledgeBase } from "../content/knowledge-base";
import type { KnowledgeFile } from "../content/knowledge-base";
import { Mountain } from "../content/mountain";
import type { ExpeditionRules } from "../content/mountain";
import { StandInRoute } from "../content/stand-in-route";
import { ControlsPage } from "../input/controls-page";
import type { ControlTexts } from "../input/controls-page";
import { PageElements } from "../input/page-elements";
import type { ActionSink } from "../input/player-action";
import { ReceivedActions } from "../input/received-actions";
import {
  Camera,
  FpsReadout,
  QualityButton,
  QualityChoice,
  SlopeScene,
  ZoomChoice,
  ZoomControl,
} from "../rendering";
import type { RenderingTexts } from "../rendering";
import type { RoomCode } from "../room/room-code";
import { IndexedDbStore } from "../saves";
import type { ExpeditionStore } from "../saves";
import type { ClimberId, ExpeditionSave, Scenario } from "../simulation";
import { ActionQueue, EverySink, ZoomSink } from "./action-queue";
import { BrowserSockets } from "./browser-sockets";
import { GameLoop } from "./game-loop";
import type { Played } from "./game-loop";
import { PlayerToken } from "./player-token";
import { ReloadOnce } from "./reload-once";
import { RoomClient } from "./room-client";
import { RoomLink } from "./room-link";
import { RoomNotice } from "./room-notice";
import { RoomPlay } from "./room-play";
import { RoomServer } from "./room-server";
import type { RoomTexts } from "./room-texts";
import { SoloGame } from "./solo-game";
import { StartMenu } from "./start-menu";

export interface PageTexts {
  readonly controls: ControlTexts;
  readonly rendering: RenderingTexts;
  readonly room: RoomTexts;
}

/** What the page's stories read that the DOM doesn't show, on `window.everest`. */
export interface PageHooks {
  /** A pixel of the canvas, once the scene draws. */
  pixelAt(x: number, y: number): readonly number[];
  /** Where a climber of the expedition is: metres along and up the slope. */
  climberAt(climber: ClimberId): readonly number[];
}

/** A climb as the page plays it: alone or in a room, it's the same from here. */
interface Climb {
  readonly scenario: Scenario;
  /** The player's climber, whom the camera follows and the controls move. */
  readonly player: ClimberId;
  /** What takes the steps, each frame. */
  readonly played: Played;
  /** Where the player's actions go. */
  readonly sink: ActionSink;
}

/**
 * The page: the start's choice, then the climb, alone or in a room, on the mountain and its
 * rules, run in real time by the game loop, drawn by the scene through the camera, and played
 * through the controls. A link with a room in it skips the choice. Alone, the climb is saved on
 * the device as it goes; in a room, the room keeps it (#28). Without WebGL the page says so and
 * runs the expedition with no picture, so the controls still work.
 */
export class GamePage {
  private readonly elements: PageElements;
  private readonly mountain: Mountain;

  constructor(
    private readonly window: Window,
    private readonly texts: PageTexts,
    facts: readonly KnowledgeFile[],
    private readonly build: Build,
  ) {
    this.elements = new PageElements(window.document);
    this.mountain = new Mountain(new KnowledgeBase(facts));
  }

  async open(): Promise<void> {
    const { window } = this;
    const linked = new RoomLink(window.location.href).code;
    if (linked !== null) {
      this.together(linked);
      return;
    }
    const store = new IndexedDbStore(window.indexedDB);
    const saved = await store.load();
    new StartMenu(window.document, this.texts.room).show(saved !== null, (choice) => {
      if (choice.kind === "alone") {
        this.alone(store, choice.fresh ? null : saved);
      } else {
        this.together(choice.kind === "join" ? choice.code : null);
      }
    });
  }

  /** The climb alone: the one `saved` on the device, or a new one, which replaces it at once. */
  private alone(store: ExpeditionStore, saved: ExpeditionSave | null): void {
    const rules = this.mountain.rules();
    const expedition = SoloGame.resumeOrStart(saved, rules.all, () =>
      this.mountain.scenario(this.newSeed()),
    );
    const queue = new ActionQueue();
    const player = StandInRoute.PLAYER;
    const game = new SoloGame(expedition, queue, store, player);
    game.save();
    this.saveWhenHidden(game);
    void this.play({ scenario: expedition.scenario, player, played: game, sink: queue }, rules);
  }

  /** A room: the one with `code`, or a new one when it's null. The climb is drawn once the room
   * welcomes the player, with their climber. */
  private together(code: RoomCode | null): void {
    const { window } = this;
    const notice = new RoomNotice(window, this.texts.room);
    const reloads = new ReloadOnce(this.tabStorage(), () => {
      window.location.reload();
    });
    const rules = this.mountain.rules();
    const play = new RoomPlay(window, notice, reloads, code, (welcome) => {
      const { scenario } = welcome.save;
      void this.play({ scenario, player: welcome.climber, played: client, sink: client }, rules);
    });
    const client = new RoomClient(
      RoomServer.from(import.meta.env.VITE_ROOM_SERVER, window.location.hostname),
      code,
      { type: "hello", token: this.token().text, version: this.build.version },
      rules.all,
      new BrowserSockets(window),
      play,
    );
    notice.connecting();
    client.join();
  }

  /** Draws the climb, and hands the player the controls. */
  private async play(climb: Climb, rules: ExpeditionRules): Promise<void> {
    const { window, texts } = this;
    const { physics } = rules;
    const { scenario, player } = climb;
    const zoomChoice = new ZoomChoice(this.storage());
    const camera = new Camera(
      {
        get climber() {
          return physics.climber(player);
        },
      },
      window.innerWidth,
      window.innerHeight,
      zoomChoice.chosen,
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
      rules.hazards,
      scenario.climbers,
      player,
      choice.chosen,
      scenario.seed,
    );
    const received = new ReceivedActions(this.elements.find("#received"));
    const zoom = new ZoomControl(
      zoomChoice,
      camera,
      this.elements.find("#controls .view output"),
      texts.rendering.metres,
    );
    const sink = new EverySink([climb.sink, new ZoomSink(zoom), received]);
    new ControlsPage(window, texts.controls, player, camera, sink);
    const loop = new GameLoop(climb.played, scene);
    const button = new QualityButton(choice, texts.rendering, (quality) => {
      scene.setQuality(quality, window.devicePixelRatio);
    });
    button.appendTo(this.elements.find("header"));
    const fps = new FpsReadout(this.elements.find("#fps"), texts.rendering.fps);
    this.expose({
      pixelAt: (x, y) => scene.pixelAt(x, y),
      climberAt: (climber) => {
        const { x, y } = physics.climber(climber);
        return [x, y];
      },
    });
    if (await scene.open(window)) {
      scene.eachFrame((seconds, now) => {
        loop.frame(seconds);
        fps.frame(now);
      });
    } else {
      host.textContent = texts.rendering["no-webgl"];
      this.runWithoutPicture(loop);
    }
  }

  /** Saves the climb alone as the tab goes to the background or the page closes: a phone may end
   * it there without another word. */
  private saveWhenHidden(game: SoloGame): void {
    const { window } = this;
    window.document.addEventListener("visibilitychange", () => {
      if (window.document.visibilityState === "hidden") {
        game.save();
      }
    });
    window.addEventListener("pagehide", () => {
      game.save();
    });
  }

  /** A new seed for a new expedition, so no two are alike (docs/conventions/simulation-core.md). */
  private newSeed(): number {
    const [seed] = this.window.crypto.getRandomValues(new Uint32Array(1));
    return seed ?? 0;
  }

  /** Who this browser is to a room, kept on the device. */
  private token(): PlayerToken {
    const { crypto } = this.window;
    return PlayerToken.kept(this.storage(), () =>
      PlayerToken.fromBytes(crypto.getRandomValues(new Uint8Array(PlayerToken.BYTES))),
    );
  }

  /** The device's storage, or none where the browser refuses it. */
  private storage(): Storage | null {
    try {
      return this.window.localStorage;
    } catch {
      return null;
    }
  }

  /** The tab's storage, or none where the browser refuses it. */
  private tabStorage(): Storage | null {
    try {
      return this.window.sessionStorage;
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
