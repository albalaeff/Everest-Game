import type { Build } from "../build";
import { GuideAdvice } from "../content/guide-advice";
import { KnowledgeBase } from "../content/knowledge-base";
import type { KnowledgeFile } from "../content/knowledge-base";
import { Mountain } from "../content/mountain";
import type { ExpeditionRules } from "../content/mountain";
import { Section } from "../content/section";
import { SherpaFacts } from "../content/sherpa-facts";
import { ControlsPage } from "../input/controls-page";
import type { ControlTexts } from "../input/controls-page";
import { PageElements } from "../input/page-elements";
import type { ActionSink } from "../input/player-action";
import { ReceivedActions } from "../input/received-actions";
import { AirTemperature } from "../interface/air-temperature";
import { BaseCamp } from "../interface/base-camp";
import { CampNotice } from "../interface/camp-notice";
import { Coach } from "../interface/coach";
import { CoachArrow } from "../interface/coach-arrow";
import type { PointerTextName } from "../interface/coach-arrow";
import { CoachCard } from "../interface/coach-card";
import type { CoachTextName } from "../interface/coach-card";
import type { GearTextName } from "../interface/coach-gear";
import { CoachMark } from "../interface/coach-mark";
import type { MarkTextName } from "../interface/coach-mark";
import type { StepTextName } from "../interface/coach-steps";
import { Debrief } from "../interface/debrief";
import type { DeviceTextName } from "../interface/device-texts";
import { GpsWatch } from "../interface/gps-watch";
import type { DebriefTextName } from "../interface/debrief";
import { SherpaBubble } from "../interface/sherpa-bubble";
import { SherpaVoice } from "../interface/sherpa-voice";
import type { SherpaTextName } from "../interface/sherpa-voice";
import { SunClock } from "../interface/sun-clock";
import type { Texts } from "../interface/texts";
import { WindChill } from "../interface/wind-chill";
import { WindMeter } from "../interface/wind-meter";
import type { ClimberView } from "../physics";
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
import { Expedition } from "../simulation";
import type { ClimberId, ExpeditionSave, HandView, PackOf, Scenario } from "../simulation";
import { ActionQueue, EverySink, ZoomSink } from "./action-queue";
import { BrowserSockets } from "./browser-sockets";
import { CarriedPace } from "./carried-pace";
import { ClimberScreen } from "./climber-screen";
import { DeviceReadings } from "./device-readings";
import { DevicesPanel } from "./devices-panel";
import { GearCheck } from "./gear-check";
import { GodMode } from "./god-mode";
import type { GodHooks } from "./god-mode";
import { GodPanel } from "./god-panel";
import type { GodTextName } from "./god-panel";
import { InventoryPanel } from "./inventory-panel";
import type { PackTextName } from "./pack-list";
import { PackScreen } from "./pack-screen";
import { GameLoop } from "./game-loop";
import type { Played } from "./game-loop";
import { KeptClimber } from "./kept-climber";
import { PlayerToken } from "./player-token";
import { ReloadOnce } from "./reload-once";
import { RoomClient } from "./room-client";
import { RoomLink } from "./room-link";
import { RoomNotice } from "./room-notice";
import { RoomPlay } from "./room-play";
import { RoomServer } from "./room-server";
import { MenuPicture } from "./menu/menu-picture";
import type { MenuTexts } from "./menu/menu-texts";
import type { RoomTexts } from "./room-texts";
import { SoloGame } from "./solo-game";
import { StartMenu } from "./start-menu";
import { ClimbInterface } from "./climb-interface";
import { CoachedClimb } from "./coached-climb";
import { SherpaClimb } from "./sherpa-climb";
import { TentDoorPin } from "./tent/tent-door";
import { TentReadout } from "./tent/tent-readout";
import type { TentTextName } from "./tent/tent-readout";
import { TentScreen } from "./tent/tent-screen";

export interface PageTexts {
  readonly controls: ControlTexts;
  readonly rendering: RenderingTexts;
  readonly room: RoomTexts;
  /** The main menu's words: the game's name, its motto and the route's places. */
  readonly menu: MenuTexts;
  /** The camps' words: each camp's name, each section's line and the arrival's. */
  readonly camps: Texts;
  /** Your climber's words: its questions, their choices and the guide's lines. */
  readonly climber: Texts;
  /** The coach's tips, for a keyboard and for touch (#192), its arrow's words (#233), and a
   * changeover's steps, the gear's lines and the anchor's mark (#247). */
  readonly coach: Texts<
    CoachTextName | PointerTextName | StepTextName | GearTextName | MarkTextName
  >;
  /** The debrief's words, and the death's (#194). */
  readonly debrief: Texts<DebriefTextName>;
  /** The gear check's words (#196). */
  readonly gear: Texts;
  /** The pack's words: the screen at Base Camp and the card on the climb. */
  readonly pack: Texts<PackTextName>;
  /** Pemba's lines (#212). */
  readonly sherpa: Texts<SherpaTextName>;
  /** The devices' words: the radio, the GPS watch, the wind meter and the tracker (#260). */
  readonly devices: Texts<DeviceTextName>;
  /** The god mode's panel (#245). */
  readonly god: Texts<GodTextName>;
  /** The tent's words: its panel, its chores and the button at its door (#258). */
  readonly tent: Texts<TentTextName>;
}

/** What the page's stories read that the DOM doesn't show, on `window.everest`. */
export interface PageHooks {
  /** A pixel of the canvas, once the scene draws. */
  pixelAt(x: number, y: number): readonly number[];
  /** Where a point of the slope, in its metres, is on the screen, in pixels. */
  screenAt(x: number, y: number): readonly number[];
  /** Where a climber of the expedition is: metres along and up the slope. */
  climberAt(climber: ClimberId): readonly number[];
  /** A climber of the expedition as the physics shows them: on a ladder, on a rope, falling. */
  climber(climber: ClimberId): ClimberView;
  /** The device a climber has in the hand, as the rule has it (#271). */
  hand(climber: ClimberId): HandView;
  /** The god mode's places and powers, with `?god` alone (#245). */
  god?: GodHooks;
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
  /** How to set off a new climb after the player's death, alone; none in a room. */
  readonly startOver: (() => void) | null;
  /** The god mode over the climb alone, with `?god` (#245); none otherwise, and in a room. */
  readonly god: GodMode | null;
  /** How to run the climb faster than real time, alone, while the player is rescued (#241); none
   * in a room, which the server paces, and under the god mode, which sets its own speed. */
  readonly faster: ((times: number) => void) | null;
}

/**
 * The page: the start's choice, then the climb, alone or in a room, on the mountain and its
 * rules, run in real time by the game loop, drawn by the scene through the camera, and played
 * through the controls. A link with a room in it skips the choice. Alone, a new climb sets off as
 * the climber the player says they are (#145), and the climb is saved on the device as it goes; in
 * a room, the room keeps it (#28), and its climbers set off as the route has them until Ready
 * (#78). Without WebGL the page says so and runs the expedition with no picture, so the controls
 * still work.
 */
export class GamePage {
  /** The tab's mark that the player chose to start over after a death: the page reloads to a new
   * climb alone, past the start's choice (#194). */
  private static readonly START_OVER = "everest.start-over";

  private readonly elements: PageElements;
  private readonly knowledge: KnowledgeBase;
  private readonly mountain: Mountain;
  private readonly guide: GuideAdvice;

  constructor(
    private readonly window: Window,
    private readonly texts: PageTexts,
    facts: readonly KnowledgeFile[],
    private readonly build: Build,
  ) {
    this.elements = new PageElements(window.document);
    const knowledge = new KnowledgeBase(facts);
    this.knowledge = knowledge;
    this.mountain = new Mountain(knowledge);
    this.guide = new GuideAdvice(knowledge, this.mountain.questionnaire);
  }

  async open(): Promise<void> {
    const { window } = this;
    const linked = new RoomLink(window.location.href).code;
    if (linked !== null) {
      this.together(linked);
      return;
    }
    // The god mode keeps a climb of its own, and never touches the player's (#245).
    const godly = GodMode.asked(window.location.href);
    const store = new IndexedDbStore(
      window.indexedDB,
      godly ? IndexedDbStore.GOD : IndexedDbStore.SLOT,
    );
    const saved = await store.load();
    if (this.tabStorage()?.getItem(GamePage.START_OVER) !== null && this.tabStorage() !== null) {
      this.tabStorage()?.removeItem(GamePage.START_OVER);
      this.alone(store, null, godly);
      return;
    }
    new StartMenu(
      window.document,
      this.texts.room,
      this.texts.menu,
      this.texts.sherpa.say("name"),
      new MenuPicture(window, this.knowledge, this.texts.menu),
    ).show(saved !== null, (choice) => {
      if (choice.kind === "alone") {
        this.alone(store, choice.fresh ? null : saved, godly);
      } else {
        this.together(choice.kind === "join" ? choice.code : null);
      }
    });
  }

  /** The climb alone: the one `saved` on the device, or a new one, which replaces it at once, for
   * the climber the player says they are on Your climber, with the kit they check at Base Camp
   * (#196); `godly`, under the god mode (#245). */
  private alone(store: ExpeditionStore, saved: ExpeditionSave | null, godly: boolean): void {
    const rules = this.mountain.rules();
    const resumed = SoloGame.resume(saved, rules.all);
    if (resumed !== null) {
      this.playAlone(store, resumed, rules, godly);
      return;
    }
    const { questionnaire } = this.mountain;
    const kept = new KeptClimber(this.storage(), questionnaire);
    const screen = new ClimberScreen(this.window, this.texts.climber, questionnaire, this.guide);
    screen.show(kept.answers, (answers) => {
      kept.keep(answers);
      const { route } = this.mountain;
      const packed = this.playersPack();
      const packing = new PackScreen(
        this.window,
        this.texts.pack,
        route.packNumbers,
        packed.items,
        packed.base,
      );
      packing.show((pack) => {
        new GearCheck(this.window, this.texts.gear).show((kit) => {
          const seed = this.newSeed();
          const scenario = this.mountain.scenario(seed, answers, kit, true, pack, true);
          this.playAlone(store, Expedition.start(scenario, rules.all), rules, godly);
        });
      });
    });
  }

  /** The player's pack as the route has it, and what they carry besides. */
  private playersPack(): PackOf {
    const packed = this.mountain.route.packs.find(({ id }) => id === Section.PLAYER);
    if (packed === undefined) {
      throw new RangeError("The route has no pack for the player");
    }
    return packed;
  }

  /** Plays `expedition` alone, saved on the device from the start; `godly`, under the god mode
   * (#245). */
  private playAlone(
    store: ExpeditionStore,
    expedition: Expedition,
    rules: ExpeditionRules,
    godly: boolean,
  ): void {
    const queue = new ActionQueue();
    const player = Section.PLAYER;
    const game = new SoloGame(expedition, queue, store, player);
    game.save();
    this.saveWhenHidden(game);
    const startOver = (): void => {
      this.tabStorage()?.setItem(GamePage.START_OVER, "1");
      this.window.location.reload();
    };
    const { scenario } = expedition;
    const god = godly
      ? new GodMode(
          game,
          rules,
          this.mountain.route,
          player,
          scenario.npcs?.[0] ?? null,
          scenario.seed,
        )
      : null;
    const faster = godly
      ? null
      : (times: number): void => {
          game.faster(times);
        };
    void this.play({ scenario, player, played: game, sink: queue, startOver, god, faster }, rules);
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
      void this.play(
        {
          scenario,
          player: welcome.climber,
          played: client,
          sink: client,
          startOver: null,
          god: null,
          faster: null,
        },
        rules,
      );
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
      {
        physics,
        hazards: rules.hazards,
        clock: rules.clock,
        body: rules.body,
        oxygen: rules.oxygen,
        lamps: rules.lamps,
        camps: this.mountain.route.camps,
        tentSizes: this.mountain.tents.sizes,
        parts: this.mountain.route.parts,
        climbers: scenario.climbers,
        player,
        npcs: scenario.npcs ?? [],
        seed: scenario.seed,
        ropeStretch: this.mountain.ropeStretch,
        jolts: rules.jolts,
        devices: rules.devices,
      },
      choice.chosen,
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
    const { warmth } = this.mountain.hazardSettings();
    const sunClock = new SunClock(warmth);
    /** Whether the scene draws: before it does, and without WebGL, nothing's pinned to it. */
    let drawn = false;
    const climbInterface = new ClimbInterface(
      window,
      rules.clock,
      rules.body,
      rules.oxygen,
      physics,
      player,
      sunClock,
    );
    const inventory = new InventoryPanel(
      window,
      texts.pack,
      rules.packs,
      this.mountain.route.packNumbers,
      sink,
      player,
      this.playersPack().base,
    );
    // The devices on the harness and the wrist (#260): the radio, the GPS watch, the weather
    // meter and the tracker, which read the climb as the rules have it.
    const { route } = this.mountain;
    const devices = new DevicesPanel(
      window,
      texts.devices,
      sink,
      player,
      new DeviceReadings(
        rules,
        player,
        new GpsWatch({
          length: route.length,
          from: route.camps[0]?.to ?? 0,
          to: route.destination.from,
          foot: route.camps[0]?.altitude ?? 0,
          top: route.destination.altitude,
          parts: route.parts,
        }),
        {
          wind: new WindMeter(this.mountain.windSpeeds(), this.mountain.dayWarmth()),
          air: new AirTemperature(this.mountain.airSettings()),
          chill: new WindChill(this.mountain.windChill()),
        },
        sunClock,
      ),
      new BaseCamp(texts.devices),
      {
        profile: route.layout.terrain,
        camp: route.destination.id,
        ground: physics.terrain.length,
        minutes: this.knowledge.number("gear.tracker-interval"),
        sunrise: warmth.from * 3600,
      },
    );
    // The tent's inside (#258): open once the slope has shown the player in through the door, or
    // at once where there's no picture; and the button over the door they stand at.
    const passage = () => (drawn ? scene.passage : "inside");
    const tent = new TentScreen(
      window,
      texts.tent,
      rules,
      new TentReadout(texts.tent, this.mountain.tents.numbers, this.mountain.tents.canister, (id) =>
        texts.camps.say(id),
      ),
      this.mountain.tents.sizes,
      this.mountain.tents.canister,
      sink,
      player,
      passage,
      () => {
        inventory.toggle();
      },
      devices,
    );
    const tentDoor = new TentDoorPin(
      window,
      texts.tent,
      rules.tents,
      player,
      sink,
      (x, y) => (drawn ? scene.screenAt(x, y) : null),
      (camp, index) => scene.tentOver(camp, index),
      passage,
    );
    devices.whenOpened(() => {
      inventory.close();
    });
    inventory.whenOpened(() => {
      devices.close();
    });
    const coached = new CoachedClimb(
      physics,
      rules.hazards,
      rules.lamps,
      player,
      rules.jolts,
      this.mountain.route.base?.to ?? 0,
    );
    const coach = new CoachCard(window.document, texts.coach, new Coach(this.storage()), coached);
    // The tip's arrow on the slope, at the place it's about (#233), and the ring on a changeover's
    // anchor (#247).
    const arrow = new CoachArrow(window, texts.coach, coached, (x, y) => scene.screenAt(x, y));
    const mark = new CoachMark(window, texts.coach, (x, y) => scene.screenAt(x, y));
    // Pemba, the climbers' Sherpa, if the climb has him (#212): his voice in a bubble over him.
    const sherpa = scenario.npcs?.[0] ?? null;
    const voice = new SherpaVoice(
      texts.sherpa,
      new SherpaFacts(this.knowledge).fills,
      scenario.seed,
    );
    const bubble =
      sherpa === null
        ? null
        : new SherpaBubble(
            window,
            voice,
            new SherpaClimb(
              rules.sherpa,
              physics,
              rules.clock,
              this.mountain.route.parts,
              rules.hazards.zones,
              player,
              this.knowledge.number("time.first-light") * 3600,
              () => coach.tip,
            ),
            (x, y) => (drawn ? scene.screenAt(x, y) : null),
          );
    const arrival = new CampNotice(
      window,
      texts.camps,
      rules.clock,
      physics,
      player,
      this.mountain.route,
      new Debrief(texts.debrief, warmth),
      {
        page: (climber) => rules.logbook.page(climber),
        get strikes() {
          return rules.hazards.strikes;
        },
      },
      texts.debrief,
      climb.startOver,
      sherpa === null
        ? null
        : {
            climber: sherpa,
            name: voice.name,
            arrival: () => (physics.climber(sherpa).dead ? null : voice.arrival()),
          },
    );
    const loop = new GameLoop(climb.played, scene);
    const button = new QualityButton(choice, texts.rendering, (quality) => {
      scene.setQuality(quality, window.devicePixelRatio);
    });
    button.appendTo(this.elements.find("header"));
    const fps = new FpsReadout(this.elements.find("#fps"), texts.rendering.fps);
    const { god } = climb;
    const godPanel =
      god === null
        ? null
        : new GodPanel(window, texts.god, god, camera, sherpa === null ? null : voice.name);
    godPanel?.appendTo(this.elements.find("header"));
    const pace = climb.faster === null ? null : new CarriedPace(physics, player, climb.faster);
    const afterFrame = (seconds: number): void => {
      // Before the death is read: an immortal player stands up again (#245).
      god?.update(seconds);
      pace?.update();
      godPanel?.update();
      climbInterface.update();
      inventory.update();
      tent.update(seconds);
      scene.cover(tent.covering);
      tentDoor.update();
      devices.update(seconds);
      arrival.update(seconds);
      coach.update(seconds);
      arrow.update(coach.tip, coach.changeover);
      mark.update(coach.changeover);
      bubble?.update(seconds);
    };
    this.expose({
      pixelAt: (x, y) => scene.pixelAt(x, y),
      screenAt: (x, y) => scene.screenAt(x, y),
      climberAt: (climber) => {
        const { x, y } = physics.climber(climber);
        return [x, y];
      },
      climber: (climber) => physics.climber(climber),
      hand: (climber) => rules.devices.hand(climber),
      ...(god === null ? {} : { god }),
    });
    if (await scene.open(window)) {
      drawn = true;
      scene.eachFrame((seconds, now) => {
        loop.frame(seconds);
        afterFrame(seconds);
        fps.frame(now);
      });
    } else {
      host.textContent = texts.rendering["no-webgl"];
      this.runWithoutPicture(loop, afterFrame);
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
  private runWithoutPicture(loop: GameLoop, afterFrame: (seconds: number) => void): void {
    let last: number | null = null;
    const frame = (now: number): void => {
      const seconds = last === null ? 0 : (now - last) / 1000;
      loop.frame(seconds);
      afterFrame(seconds);
      last = now;
      this.window.requestAnimationFrame(frame);
    };
    this.window.requestAnimationFrame(frame);
  }
}
