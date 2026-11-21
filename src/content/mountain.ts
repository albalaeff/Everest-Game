import { Sherpa } from "../agents";
import type { SherpaSettings } from "../agents";
import { Lamplight, Logbook, SlopePhysics } from "../physics";
import type { Kit } from "../physics";
import {
  AirTemperature,
  Body,
  DayWarmth,
  Devices,
  Forecast,
  Jolts,
  MountainClock,
  ObjectiveHazards,
  OxygenSystem,
  Packs,
  Tents,
  Weather,
  Wind,
  WindChill,
} from "../simulation";
import type {
  ColdNumbers,
  DeviceNumbers,
  Forecaster,
  ForecastNumbers,
  HourRange,
  WeatherNumbers,
  HazardKind,
  HazardWeather,
  HazardOdds,
  HazardSettings,
  JoltKind,
  JoltOdds,
  JoltSettings,
  PackCounts,
  Rule,
  Scenario,
} from "../simulation";
import type { KnowledgeBase } from "./knowledge-base";
import { BodyFacts } from "./body-facts";
import { ClimberFacts } from "./climber-facts";
import { Questionnaire } from "./questionnaire";
import type { ClimberAnswers } from "./questionnaire";
import { Section } from "./section";
import { TentFacts } from "./tent-facts";

/** One expedition's rules, with their numbers: the page draws from the physics and reads the
 * clock, and the expedition runs them all, in this order. */
export interface ExpeditionRules {
  readonly clock: MountainClock;
  /** The weather of the hour, the days ahead, and the sky turning (#272). */
  readonly weather: Weather;
  readonly body: Body;
  readonly oxygen: OxygenSystem;
  readonly hazards: ObjectiveHazards;
  /** The gusts and the ladders' twists, which jolt the climbers off balance (#197). */
  readonly jolts: Jolts;
  readonly physics: SlopePhysics;
  /** The climb's logbook, which the debrief reads (#194). */
  readonly logbook: Logbook;
  /** Whose headlamps are lit, and who's in the dark (#196). */
  readonly lamps: Lamplight;
  /** What each climber carries, and what the camps hold. */
  readonly packs: Packs;
  /** Who's in which tent, their chores, and the camps' gas and meals (#258). */
  readonly tents: Tents;
  /** The climbers' Sherpa, Pemba, who guides them (#212). */
  readonly sherpa: Sherpa;
  /** The radios and the satellite trackers the climbers carry (#260). */
  readonly devices: Devices;
  readonly all: readonly Rule[];
}

/** The wind's speeds in the Icefall, in km/h, as the wind meter reads them (#260), and where its
 * names start on the Beaufort scale. */
export interface WindSpeeds {
  readonly still: number;
  readonly thermal: number;
  readonly snow: number;
  readonly strong: number;
  readonly storm: number;
  readonly gust: number;
  readonly scale: {
    readonly breeze: number;
    readonly fresh: number;
    readonly strong: number;
    readonly gale: number;
  };
}

/** The air's temperatures, as the weather meter's thermometer and Base Camp's station read them
 * (#260): a day's coldest and warmest at the station in each weather, in °C; the hours they come
 * at; the degrees it cools a kilometre higher; and the station's altitude. */
export interface AirSettings {
  readonly days: Readonly<Record<HazardWeather, { readonly min: number; readonly max: number }>>;
  readonly coldest: number;
  readonly warmest: number;
  readonly lapse: number;
  readonly station: number;
}

/** A band of the risk of frostbite: the wind chill it starts at, and the minutes bare skin can
 * freeze in, where a source gives them. */
interface FrostbiteBand {
  readonly from: number;
  readonly freezes: { readonly min: number; readonly max: number } | null;
}

/** The wind chill index's terms and limits, the weather meter's factor for the wind 10 m up, and
 * the bands of the risk of frostbite over low (#260). */
export interface WindChillSettings {
  readonly constant: number;
  readonly air: number;
  readonly wind: number;
  readonly airInWind: number;
  readonly power: number;
  readonly warmest: number;
  readonly calmest: number;
  readonly factor: number;
  readonly risks: Readonly<
    Record<"moderate" | "high" | "very-high" | "severe" | "extreme", FrostbiteBand>
  >;
}

/**
 * The mountain as the game has it today: the route's section, the Khumbu Icefall (#26) unless
 * another is given, and the rules that run on it, handed their numbers from the knowledge base
 * (docs/conventions.md → Data, not literals). The page, the room server and the tests build
 * their expeditions from it, so a room's expedition is the page's, step for step.
 */
export class Mountain {
  /** The record the mountain's clock runs at: how many times faster than play. */
  static readonly COMPRESSION = "time.compression";
  private static readonly SECONDS_AN_HOUR = 60 * 60;
  private static readonly SECONDS_A_MINUTE = 60;
  private static readonly SECONDS_A_DAY = 24 * 60 * 60;

  /** What the player's answers make of their climber. */
  readonly climbers: ClimberFacts;
  /** The tents' numbers, and their sizes for the picture (#258). */
  readonly tents: TentFacts;

  constructor(
    private readonly knowledge: KnowledgeBase,
    readonly route: Section = new Section(knowledge),
    readonly questionnaire: Questionnaire = new Questionnaire(),
  ) {
    this.climbers = new ClimberFacts(knowledge, questionnaire);
    this.tents = new TentFacts(knowledge);
  }

  /** A new expedition's scenario on the route, from its seed, with the player as their `answers`
   * make them (#145), or as the route has them, with what they checked of their `kit` before
   * setting off (#196), or all of it, and the training events the seed stages (#209), unless
   * `training` is off; `alone`, with the player and their Sherpa only, and no seat for a
   * teammate (#212); the `weather` drawn from the seed through the days, or held (#272): the one
   * given, or the route's. */
  scenario(
    seed: number,
    answers?: ClimberAnswers,
    kit?: Kit,
    training = true,
    pack?: PackCounts,
    alone = false,
    weather?: HazardWeather | "drawn",
  ): Scenario {
    const player = answers === undefined ? undefined : this.climbers.climber(answers);
    const scenario = this.route.scenario(
      seed,
      player,
      kit === undefined
        ? undefined
        : { kit, unchecked: this.knowledge.number("body.unchecked-water") },
      training,
      pack,
      alone,
      weather,
    );
    return {
      ...scenario,
      start: {
        ...scenario.start,
        [Logbook.NAME]: Logbook.start(scenario.climbers),
        [Devices.NAME]: Devices.start({ climbers: scenario.climbers }),
      },
    };
  }

  /** Rules for one expedition, fresh: it loads its state into them, and nothing else shares them.
   * The clock runs first, so the hazards read this step's hour, and the hazards and the jolts
   * before the physics, so a climber they knock or upset falls in the same step. */
  rules(): ExpeditionRules {
    const clock = new MountainClock(this.knowledge.number(Mountain.COMPRESSION));
    const physics = new SlopePhysics(this.route.settings);
    const bodyFacts = new BodyFacts(this.knowledge);
    const oxygen = new OxygenSystem(bodyFacts.oxygenNumbers(), clock);
    // The body moves the climbers through the light they see their feet by (#196).
    const lamps = new Lamplight(physics, clock, {
      lasts: this.knowledge.number("technique.dead-lamp-hours") * Mountain.SECONDS_AN_HOUR,
      firstLight: this.knowledge.number("time.first-light") * Mountain.SECONDS_AN_HOUR,
      dark: this.knowledge.number("technique.dark-footing"),
    });
    // The weather right after the clock (#272): the hazards and the jolts read the weather of the
    // hour from it, and the body feels its air and its wind in the same step.
    const weather = new Weather(
      this.weatherNumbers(),
      clock,
      new AirTemperature(this.airSettings()),
      new Wind(this.windSpeeds(), this.dayWarmth()),
    );
    const hazards = new ObjectiveHazards(this.hazardSettings(), clock, physics, weather);
    const jolts = new Jolts(this.joltSettings(), clock, physics, weather);
    const cold = {
      numbers: this.coldNumbers(),
      chill: new WindChill(this.windChill()),
      outdoors: weather,
    };
    const body = new Body(bodyFacts.numbers, clock, lamps, oxygen, cold);
    // The packs first: the body carries this step what they weigh, and the physics climbs on
    // what's on the harness.
    const packs = new Packs(this.route.packNumbers, body, physics, oxygen);
    // The tents after the packs, whose bottles their stove fills, and before the body, which
    // sleeps this step, and the physics, which keeps whoever is inside where they are (#258).
    const tents = new Tents(this.tents.numbers, clock, physics, packs, body, this.route.tents);
    const logbook = new Logbook(
      physics,
      hazards,
      clock,
      this.route.logged,
      this.route.base?.to ?? null,
    );
    // The devices after the physics: a climber who hangs in a crevasse this step has no contact.
    const devices = new Devices(this.deviceNumbers(), clock, physics);
    // The Sherpa acts at the start of each step, from where the last left everyone (#212).
    const sherpa = new Sherpa(this.sherpaSettings(), physics, hazards, clock);
    return {
      clock,
      weather,
      oxygen,
      body,
      hazards,
      jolts,
      physics,
      logbook,
      lamps,
      packs,
      tents,
      sherpa,
      devices,
      all: [
        clock,
        weather,
        packs,
        tents,
        oxygen,
        body,
        hazards,
        jolts,
        physics,
        logbook,
        devices,
        sherpa,
      ],
    };
  }

  /** The weather's numbers (#272), from their records in content/facts/weather.json: the chance
   * a day is bad after a good one and after a bad one (`weather.bad-day-after-good`,
   * `-after-bad`), the shares of good days that are windy and of bad days that are stormy
   * (`weather.windy-days`, `weather.stormy-days`), the hours each part of a day begins between
   * (`weather.<part>-hour`), and the minutes the sky takes to turn (`weather.turn-minutes`). */
  weatherNumbers(): WeatherNumbers {
    const number = (name: string) => this.knowledge.number(`weather.${name}`);
    const hours = (part: string): HourRange => {
      const { min, max } = this.knowledge.range(`weather.${part}-hour`);
      return { min, max };
    };
    return {
      bad: { afterGood: number("bad-day-after-good"), afterBad: number("bad-day-after-bad") },
      windy: number("windy-days"),
      stormy: number("stormy-days"),
      hours: {
        cloud: hours("cloud"),
        snow: hours("snow"),
        clearing: hours("clearing"),
        wind: hours("wind"),
        calm: hours("calm"),
        storm: hours("storm"),
        easing: hours("easing"),
      },
      turn: number("turn-minutes") * Mountain.SECONDS_A_MINUTE,
    };
  }

  /** A forecaster's skill (#272), from the records in content/facts/weather.json: the chance it
   * calls the sky right today, tomorrow and the day after
   * (`weather.<forecaster>-forecast-right-<day>`), the chance it calls a storm a storm
   * (`-forecast-storms`), and how far off its air and its wind are for each day further ahead
   * (`weather.forecast-air-error`, `-wind-error`, the general model's
   * `weather.general-forecast-error-factor` times as far). */
  forecastNumbers(forecaster: Forecaster): ForecastNumbers {
    const number = (name: string) => this.knowledge.number(`weather.${name}`);
    const right = (day: string) => number(`${forecaster}-forecast-right-${day}`);
    const worse = forecaster === "general" ? number("general-forecast-error-factor") : 1;
    return {
      right: [right("today"), right("tomorrow"), right("after")],
      storms: number(`${forecaster}-forecast-storms`),
      air: number("forecast-air-error") * worse,
      wind: number("forecast-wind-error") * worse,
    };
  }

  /** The forecast `forecaster` issues on a climb from `seed`, of the weather `weather` draws. */
  forecast(forecaster: Forecaster, weather: Weather, seed: number): Forecast {
    return new Forecast(forecaster, this.forecastNumbers(forecaster), weather, seed);
  }

  /** The cold's numbers (#272), from their records in content/facts/cold.json: the normal core
   * and hypothermia's stages (`cold.normal-core`, `cold.hypothermia-mild`, `-moderate`,
   * `-severe`, `-profound`), the wind chill a climber holds their heat in at rest and on the move
   * (`cold.holds-resting`, `-moving`), how fast they cool and warm again (`cold.cooling-rate`,
   * `cold.shivering-rewarming`, `cold.safe-rewarming`), a tent's warmth (`cold.tent-warmer`), each
   * part's cover (`cold.cover-face`, `-fingers`), the frost's stages and thaw (`cold.frost-numb`,
   * `-nip`, `-bite`, `cold.thaw-hours`), and how clumsy mild hypothermia leaves them
   * (`cold.clumsy-footing`, `-stride`). */
  coldNumbers(): ColdNumbers {
    const number = (name: string) => this.knowledge.number(`cold.${name}`);
    const top = (name: string) => this.knowledge.range(`cold.${name}`).max;
    return {
      normal: number("normal-core"),
      stages: {
        mild: top("hypothermia-mild"),
        moderate: top("hypothermia-moderate"),
        severe: top("hypothermia-severe"),
        death: top("hypothermia-profound"),
      },
      holds: { resting: number("holds-resting"), moving: number("holds-moving") },
      cooling: number("cooling-rate"),
      rewarming: { shivering: number("shivering-rewarming"), sheltered: number("safe-rewarming") },
      tent: number("tent-warmer"),
      covers: { face: number("cover-face"), fingers: number("cover-fingers") },
      frost: { numb: number("frost-numb"), nip: number("frost-nip"), bite: number("frost-bite") },
      thaw: number("thaw-hours"),
      clumsy: { footing: number("clumsy-footing"), stride: number("clumsy-stride") },
    };
  }

  /** How far a fixed rope gives under a climber's weight, as a share of its loaded length
   * (`gear.fixed-rope-stretch`, #232): the picture draws a loaded rope's give by it. */
  get ropeStretch(): number {
    return this.knowledge.number("gear.fixed-rope-stretch");
  }

  /** The devices' numbers (#260), from their records in content/facts/gear.json, in the
   * mountain's seconds: a tracker's minutes between two points (`gear.tracker-interval`), the
   * days its battery lasts tracking (`gear.tracker-battery`) and the minutes a message takes to
   * leave it (`gear.messenger-delivery-time`). */
  deviceNumbers(): DeviceNumbers {
    return {
      interval: this.knowledge.number("gear.tracker-interval") * Mountain.SECONDS_A_MINUTE,
      life: this.knowledge.number("gear.tracker-battery") * Mountain.SECONDS_A_DAY,
      delivery: this.knowledge.number("gear.messenger-delivery-time") * Mountain.SECONDS_A_MINUTE,
      answer: this.knowledge.number("gear.messenger-weather-answer") * Mountain.SECONDS_A_MINUTE,
    };
  }

  /** The wind's speeds a wind meter reads in the Icefall (#260), from their records in
   * content/facts/weather.json: `weather.icefall-wind-still`, `-thermal`, `-snow` and `-strong`,
   * and `weather.icefall-gust`; and where the names it gives them start, the lowest speed of
   * `weather.beaufort-light-breeze`, `-fresh-breeze`, `-near-gale` and `-gale`. */
  windSpeeds(): WindSpeeds {
    const number = (name: string) => this.knowledge.number(`weather.icefall-${name}`);
    const force = (name: string) => this.knowledge.range(`weather.beaufort-${name}`).min;
    return {
      still: number("wind-still"),
      thermal: number("wind-thermal"),
      snow: number("wind-snow"),
      strong: number("wind-strong"),
      storm: number("wind-storm"),
      gust: number("gust"),
      scale: {
        breeze: force("light-breeze"),
        fresh: force("fresh-breeze"),
        strong: force("near-gale"),
        gale: force("gale"),
      },
    };
  }

  /** The air's temperatures (#260), from their records in content/facts/weather.json: a day's
   * coldest and warmest at Base Camp's weather station in each weather
   * (`weather.icefall-air-<weather>`), the hours they come at (`weather.icefall-coldest-hour`
   * and `-warmest-hour`), the degrees it cools a kilometre higher
   * (`weather.premonsoon-lapse-rate`), and the station's altitude
   * (`weather.base-camp-station-altitude`). */
  airSettings(): AirSettings {
    const day = (weather: HazardWeather) => {
      const { min, max } = this.knowledge.range(`weather.icefall-air-${weather}`);
      return { min, max };
    };
    return {
      days: {
        clear: day("clear"),
        cloud: day("cloud"),
        snow: day("snow"),
        wind: day("wind"),
        storm: day("storm"),
      },
      coldest: this.knowledge.number("weather.icefall-coldest-hour"),
      warmest: this.knowledge.number("weather.icefall-warmest-hour"),
      lapse: this.knowledge.number("weather.premonsoon-lapse-rate"),
      station: this.knowledge.number("weather.base-camp-station-altitude"),
    };
  }

  /** The wind chill a weather meter works out (#260), from the records in
   * content/facts/cold.json and gear.json: the index's terms and limits in °C
   * (`cold.wind-chill-constant`, `-air`, `-wind`, `-air-in-wind`, `-power`, `-warmest` and
   * `-calmest`), the meter's factor for the wind 10 m up (`gear.wind-meter-chill-factor`), and
   * Canada's bands of the risk of frostbite: the warmest chill of each
   * (`cold.wind-chill-<risk>`) and the minutes bare skin can freeze in it
   * (`cold.freeze-time-<risk>`). */
  windChill(): WindChillSettings {
    const term = (name: string) => this.knowledge.number(`cold.wind-chill-${name}`);
    const band = (risk: string, freezes: boolean): FrostbiteBand => {
      const minutes = freezes ? this.knowledge.range(`cold.freeze-time-${risk}`) : null;
      return {
        from: this.knowledge.range(`cold.wind-chill-${risk}`).max,
        freezes: minutes === null ? null : { min: minutes.min, max: minutes.max },
      };
    };
    return {
      constant: term("constant"),
      air: term("air"),
      wind: term("wind"),
      airInWind: term("air-in-wind"),
      power: term("power"),
      warmest: term("warmest"),
      calmest: term("calmest"),
      factor: this.knowledge.number("gear.wind-meter-chill-factor"),
      risks: {
        moderate: band("moderate", false),
        high: band("high", true),
        "very-high": band("very-high", true),
        severe: band("severe", true),
        extreme: band("extreme", true),
      },
    };
  }

  /** The day's warmth on the ice, as the hazards have it: what the thermals blow by (#260). */
  dayWarmth(): DayWarmth {
    const { warmth, sun } = this.hazardSettings();
    return new DayWarmth(warmth, sun);
  }

  /** The Sherpa's numbers, from their records in content/facts/technique.json: how far ahead he
   * leads (`technique.sherpa-lead`), when he waits (`-wait`), how far back he follows (`-behind`),
   * how long he rests with a client he pulled out (`-rest`), how long a client ahead of him stands
   * before he goes past them (`-pass`, #197), and the haul's reach. */
  sherpaSettings(): SherpaSettings {
    const range = (name: string) => this.knowledge.range(`technique.sherpa-${name}`);
    const lead = range("lead");
    const behind = range("behind");
    return {
      lead: { near: lead.min, far: lead.max },
      wait: this.knowledge.number("technique.sherpa-wait"),
      behind: { near: behind.min, far: behind.max },
      rest: this.knowledge.number("technique.sherpa-rest") * 60,
      pass: this.knowledge.number("technique.sherpa-pass"),
      reach: this.knowledge.number("technique.haul-reach"),
      aid: this.knowledge.number("technique.rescue-reach"),
    };
  }

  /** The hazards' numbers, from their records in content/facts/hazards.json: each kind's
   * `hazards.<kind>-rate`, `-warmth`, `-snow`, `-wind`, `-warning`, `-deadly` and
   * `-deadly-clipped`, a serac's `hazards.serac-fall` (#229), and the day's warmth. Only a
   * serac's ice falls from above the route; the others' warning is their whole run. */
  hazardSettings(): HazardSettings {
    const number = (name: string) => this.knowledge.number(`hazards.${name}`);
    const odds = (kind: HazardKind): HazardOdds => ({
      rate: number(`${kind}-rate`),
      warmth: number(`${kind}-warmth`),
      snow: number(`${kind}-snow`),
      wind: number(`${kind}-wind`),
      warning: number(`${kind}-warning`),
      deadly: number(`${kind}-deadly`),
      deadlyClipped: number(`${kind}-deadly-clipped`),
      fall: kind === "serac" ? number("serac-fall") : 0,
    });
    return {
      kinds: {
        serac: odds("serac"),
        avalanche: odds("avalanche"),
        crevasse: odds("crevasse"),
        cornice: odds("cornice"),
      },
      warmth: {
        from: number("warmth-from"),
        peak: number("warmth-peak"),
        until: number("warmth-until"),
      },
      sun: { cloud: number("sun-under-cloud"), snow: number("sun-in-snow") },
      training: { crack: number("training-crack") },
    };
  }

  /** The jolts' numbers (#197), from their records in content/facts/hazards.json: each kind's
   * `hazards.<kind>-rate`, `-warmth`, `-snow`, `-wind`, `-warning` and `-slip`, and the day's
   * warmth, the hazards'. */
  joltSettings(): JoltSettings {
    const number = (name: string) => this.knowledge.number(`hazards.${name}`);
    const odds = (kind: JoltKind): JoltOdds => ({
      rate: number(`${kind}-rate`),
      warmth: number(`${kind}-warmth`),
      snow: number(`${kind}-snow`),
      wind: number(`${kind}-wind`),
      warning: number(`${kind}-warning`),
      slip: number(`${kind}-slip`),
    });
    const { warmth, sun } = this.hazardSettings();
    return { kinds: { gust: odds("gust"), twist: odds("twist") }, warmth, sun };
  }
}
