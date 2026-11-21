# Weather that changes, the forecast and the cold

Built on 21 Nov 2026: issue #272. albalaeff asked on 18 Nov for "changing weather conditions which can lead to serious problems and even deaths", and for the forecast to be checked before going up (that check, and choosing the day to go, are #273's). The weather now turns through the days from the climb's seed, two forecasts tell it ahead and can be wrong, and the cold harms and kills a climber caught out in it.

## What the player sees

- **The sky turns** over 40 minutes of the mountain's time (about 33 s of play): clear, cloud, snow, a strong wind, or a storm, snow in a gale with the far ridges gone and the slope in spindrift. The picture blends the two weathers' looks through a turn; the meter's air and wind turn with it.
- **Pemba says it as it comes**: cloud building, snow (stay on the rope), wind (cover the skin), a storm at once ("We get to a tent, or we go down"), and the sky clearing after.
- **Radio, [Forecast?]**: Base Camp's forecaster, a day a line: "Today: clear, snow by afternoon, cloud by evening, wind up to 20 km/h. We're sure of it."
- **Tracker, [Get weather]**: a request under the sky, five minutes back: the general model's three days in six hours, a sky's mark, the air and the wind, no word on how sure it is, and wrong more often, above all about storms.
- **Check yourself and the tent**: cold, shivering, confused, unconscious, numb fingers, numb face, frostnip, frostbite; never a temperature.
- **The debrief**: frostbite, which stays, and a death from the cold traced to standing in a wind colder than the clothes keep out.

## The data (read 21 Nov 2026)

| What | Source | In the game |
|---|---|---|
| The Khumbu's spring day: precipitation least in the late morning, growing through the afternoon, peaking in the early evening near Base Camp | Perry et al. 2020, One Earth | Clear mornings, cloud by 09–12, snow from 12–15, easing by 19–22 on a bad day |
| 26% of a year's 171 precipitation events at Phortse in March–May; graupel from convective cloud in March–April | Perry et al. 2020 | About four days in ten bad, in spells |
| Forecasts right 90% at five days, 80% at seven, half at ten; precipitation harder than temperature | NOAA NESDIS; Penn State METEO 3 | Base Camp's 95/90/85% for today, tomorrow and the day after; the general model's 85/75/65% |
| Free sites run one model, the GFS; a forecaster weighs six or more, gives a confidence rating, sends one forecast a day; numerical forecasts do poorly at storms' snow; two days ahead can be 500 km off | Arnette 2017; ExplorersWeb 2019; Scientific American 2016 | Base Camp's forecast with its confidence; the general model catches a storm half the time |
| An inReach asks for a forecast by message; it can take several minutes; it needs the sky | Garmin's manual | Five minutes of sky to come back |
| Hypothermia's stages: mild 35–32 °C, moderate 32–28, severe under 28, profound under 24; shivering rewarms 3–4 °C/h if insulated; field rewarming 1–2 °C/h; below 32 °C only outside heat rewarms; exercise prevents hypothermia if food and insulation are enough | WMS 2019 guideline (Dow et al.); AAFP's summary; MSD Manual | Clumsy and slower under 35, stopped under 32, unconscious under 28, dead at 24; shivering warm again out of the cold, a tent from any cold |
| Bare skin freezing times by wind chill | Canada's index (already in the knowledge base, #260) | Frost on the face (3× slower covered) and the fingers (40× in mittens): numb, frostnip, frostbite |

The coefficients no source states, with what they're fitted to, and the questions for an expert, are in `content/facts/weather.json` and `cold.json`: how fast a dressed climber cools at rest (`cold.dressed-cooling`), how much cover slows freezing (`cold.covered-freezing`), how warm a tent is (`cold.tent-warmth`), and the Icefall's spring days (`weather.icefall-spring-days`).

## How it works

- `Weather`, a rule of the core: the days from the seed, by a chance of their own, as Markov spells of good and bad days; each day's parts by the hour; the turn; a held weather for scenarios, the god mode and the stories. The hazards and the jolts read the weather of the hour from it; a storm is their snow and their wind at once.
- `Forecast`: the truth with errors drawn from the seed and the six hours it's issued in, so it says the same within them.
- The body (`Cold`): the core temperature against the wind chill where the climber is, held to −45 °C on the move and −20 °C at rest, 0.02 °C an hour for each degree colder; the tent 8 °C warmer and out of the wind.
- The air, the wind and the wind chill moved from the interface into the core, the chill's power raised with square roots so it gives the same digits everywhere (`Power`).

## Decisions and limits

- The climb's first day is drawn like any other: choosing the day and the hour to set off by the forecast is #273's.
- The stories hold the weather clear (`everest.weather` in the device's storage, `WEATHER` for the room server), so they never meet a storm by chance; a new climb in the game draws it.
- Not yet: Pemba carrying down a climber the cold has stopped, clothing and a lost mitten (#38); the jet stream's summit wind and the plume (#39); the season's windows (#57); frostbite on the toes.

## Testing with god mode (`?god`)

1. [Storm] holds a storm: the sky turns to it, the meter reads about 60 km/h, Pemba says to get to a tent or go down.
2. Stand still in it at Camp 1 for a few minutes of play: Check yourself says cold, then frostnip; in a tent it thaws.
3. [As the seed] lets the weather turn from the seed again; the radio's [Forecast?] and the tracker's [Get weather] tell its days, the tracker's wrong more often.
