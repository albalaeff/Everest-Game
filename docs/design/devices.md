# The climber's devices

Researched and built on 17–18 Nov 2026: issue #260, pull request #261 (https://github.com/albalaeff/Everest-Game/pull/261), merged into `develop` on 18 Nov; then #275 (issue #271, the same day) made taking a device out seen, in the tent and on the slope. The climber carries a handheld radio, a GPS watch, a pocket weather meter and a satellite tracker, usable on the Icefall from Base Camp to Camp 1. On 18 Nov the wind meter became a weather meter: air temperature, wind chill and frostbite risk, with the winds refitted to measured data (commit f8dbd0d). On 22 Nov #284 drew each device as the real one, with its own screen and buttons, worked as the real one's are.

## What real expeditions carry (open sources, read 17 Nov 2026)

| Device | What it's for on Everest | Limits worth teaching | In the game |
|---|---|---|---|
| Handheld VHF radio | Each climber on a commercial team has one; Base Camp talks to the mountain and logs where everyone is | Someone has to be listening; line of sight, so terrain cuts it; about 1.6–8 km in mountains | Yes: the radio |
| Satellite messenger (Garmin inReach and the like) | Two-way texts, position sharing and SOS over Iridium, where no phone works | Needs a clear sky; a point every 10 min by default; battery about 14 days tracking; owners forget to switch it on | Yes: the tracker |
| RECCO reflector | Nepal requires a tracking device for every climber and guide since spring 2024; in practice this passive tag | No battery and no position of its own: a searcher's detector finds it at up to 80 m through air, 20 m through snow | In the knowledge base only |
| GPS watch | Altitude from a barometric altimeter, distance, pace, track | Altitude drifts with the weather; signals bounce off walls; no fix without sky | Yes: the GPS watch |
| Pocket weather meter (Kestrel and the like) | Wind now, average and strongest, temperature to 0.1 °C, wind chill | A guide's tool more than a client's; in the sun its thermometer reads warm | Yes: the weather meter (wind, air, wind chill, frostbite risk) |
| Pulse oximeter | Daily acclimatisation checks | Cold fingers and movement spoil the reading | Already in [Check yourself] |
| Cargo drones | In 2025 carried the Icefall Doctors' ropes and ladders over the Icefall, in winds up to 45 km/h | Not a climber's device | In the knowledge base only |
| Batteries | Everything above | About half the capacity at −18 °C; it comes back when warm | A line on the tracker's card |

Sources: Alan Arnette, "Everest 2024: Nepal's GPS Chip Plan has Major Problems"; The Kathmandu Post, "Tracking chip now mandatory for Everest aspirants"; ExplorersWeb, "Everest's New Rules"; Alpenglow Expeditions and Mountain Professionals (radios); Garmin inReach Mini 2 specifications via retailers; Section Hiker's inReach review; Battery University BU-502; Garmin's altimeter manual; Trailspace and Kestrel (wind meters); Royal Meteorological Society (Beaufort scale); Mark Horrell (drones). Each is a record with its URL in `content/facts/gear.json`, `rules.json`, `weather.json` and `cold.json`.

## The weather data (read 18 Nov 2026)

- **Temperature at Base Camp's weather station (5,315 m):** annual mean −3.1 °C, Camp II (6,464 m) −10.2 °C (Khadka et al., Earth System Science Data 2026, Dec 2019–Nov 2022); spring mean −4.5 °C, April nights about −9 °C and afternoons about 0 °C (Magical Nepal, from the station). Pugh 1953: Base Camp's spring lowest −23 °C; Western Cwm late-May nights down to −10 °C.
- **The day's cycle** (Appalachian State's Everest Weather Portal, hourly): coldest around sunrise, warmest around midday; it warms fast in the morning, cools fast in the late afternoon, then slowly through the night.
- **Lapse rate in spring:** 6.5 °C/km (ESSD, four stations), 6.7 °C/km (Jalawaayu); the game uses 6.6. A clear Base Camp day carried to the summit this way spans the summit's mid-May −29 to −23 °C (Alan Arnette, 2026).
- **Wind:** Camp II's usual wind about 3 m/s, its hourly readings 4–10 m/s, strongest around midday (Jalawaayu, the Portal); up-valley winds by day and weak winds at night in the Khumbu (ACP 2023); jet-stream storms of 70–90 km/h wreck Camp II's tents (ExplorersWeb, The Himalayan Times, Gripped). The Base Camp station reports no wind.
- **Wind chill:** Canada's and the US index since 2001, 13.12 + 0.6215T − 11.37V^0.16 + 0.3965TV^0.16 with V the wind at 10 m (Tourigny, Meteorological Service of Canada; Caltrx); valid at 10 °C or colder and 4.8 km/h or more. A Kestrel multiplies the wind in the hand by 1.5 for it (Kestrel 2500NV specs). Canada's risk bands: moderate from −10, high from −28 (skin freezes in 10–30 min), very high from −40 (5–10), severe from −48 (2–5), extreme from −55 (under 2).

## Drawn as the real ones (#284, read 21 Nov 2026)

Each device is an SVG drawn in code to the millimetres of one real model, with its screen and its buttons where that model has them; the readings are laid over its glass, a button over each of its buttons, named, with a tooltip. Sources: `gear.radio-handheld`, `gear.watch-buttons`, `gear.wind-meter-layout` and `gear.messenger-layout` in `content/facts/gear.json`.

| Device | After | What it has |
|---|---|---|
| Radio | Motorola DP4801e | Black case, antenna on its top; channel and volume knobs, the light and the orange emergency button on its top; push-to-talk on its left; speaker, a grey-green LCD (amber lit), a four-way pad and a keypad on its front. The light is green while it sends. |
| GPS watch | Garmin fēnix 7, 47 mm | Round 33 mm screen, grey to read in the sun, white lit; LIGHT, UP and DOWN on its left, START·STOP and BACK on its right. A page at a time: altitude, the route, the arrival, the time. START pauses the activity: no time, no distance and no track while paused. |
| Weather meter | Kestrel 2500, gold | Impeller at its top, the thermistor's window at its left, a seven-segment screen with one big number, green lit; ◄ ◐ ► under it. ◄ ► step through the wind, its strongest, its average, the air and the wind chill, each screen's name (SPd, dEG, chiLL) flashing first; ◐ lights it for 10 s, held 3 s switches it off, which starts its average afresh. |
| Messenger | Garmin inReach Mini 2, Flame Red | Square 23 mm screen, not a touch screen; ▲ ▼ on its left, OK and back on its right; the SOS under a red cap low on its right, held 3 s while the screen counts down. A menu of rows: tracking, check-in, weather, and the forecast a day at a time. |

- **Held up close:** the device fills the card's height under its tabs, unless that would take more than its share of the card's width; on a phone on its side, the tabs go down the card's left so the device has the whole height. The watch's strap and the meter's and messenger's foot run on past the card's edge, so their screens read: at a PC's 623 px of height, the messenger's text is about 9 px.
- **The screen's light:** a press lights the screen for a few seconds, as a backlight does; unlit, it's as dark as the hour, readable in the headlamp's light.
- **Changed from the plan after the research:** the meter shows one number at a time, as a Kestrel does; the radio's light is green while it sends, as a DP4801e's is; the messenger's buttons are on its sides, with the SOS low on the right, as an inReach Mini 2's are. The meter has no reset button: switching it off and on starts it afresh.
- **The watch's sun:** its field is "Sun on ice", the hour the sun reaches the ice, not a watch's sunrise: the game's danger hour, as the clock at the top of the screen counts it.

## How each works in the game

- **One card**: [Devices] or G opens it at the device used last; [Radio] or Q at the radio. Arrows left and right go between devices, up and down through a device's buttons, Esc closes. On a gamepad: the left stick pressed in. It ends above the bottom controls and takes turns with the pack's card.
- **Radio**: six ready phrases (Radio check, Report position, Conditions?, Forecast?, Route ahead?, I need help). Base Camp answers from the game's real state: the position logged with its time, the weather, its weather station's temperature, the hour the sun reaches the ice, a ladder that's down, and its forecaster's forecast, a day a line with how sure they are (#272). Hanging in a crevasse: static.
- **GPS watch**: four pages, ▲ ▼ between them: altitude with the rate of climb and the metres still to climb; the route's profile with the track, the distance done and left (counted from Base Camp's edge to Camp 1's); the arrival at Camp 1 at the pace so far against the sun's hour (06:00); and the time, the activity's timer and the sun on the ice. The part of the route is on its top line. Hanging under the ice it has no fix and keeps the last one on its screen.
- **Weather meter** (tab [Weather] / [Метео]): on its screen, a number at a time: the wind now, its strongest and its average since it was switched on, the air (0.1 °C) and the wind chill (whole degrees); beside it the wind's Beaufort name and the frostbite risk, red with a triangle from "high". Wind: still night 4 km/h, the sun adds up to 12 by the day's warmest, snow 20, strong wind 45, a gust 70. Air at Base Camp's station by weather: clear −10 to +2 °C, cloud −7 to −2, snow −6 to −3, strong wind −13 to −6; coldest at 06:00, warmest at 13:00; 6.6 °C colder per km higher. It jumps as a gust comes, a moment before the gust arrives, and the wind chill with it.
- **Tracker**: off at the start; tracking sends a point every 10 minutes under the sky; a check-in takes three of the mountain's minutes to leave; SOS needs a press held 3 seconds. Get weather (#272) sends a request the same way, and five minutes of sky later the general model's forecast is a row of its menu, opened on a screen of its own a day at a time, ▲ ▼ between the days: four six-hour parts, a sky's mark, the air and the wind, with no word on how sure it is.

## Decisions and limits

- Every climber has all four devices; they aren't things to pack or leave behind yet.
- The wind's speeds and the air's day are coefficients fitted to the measurements above; the question for an expert on the Icefall's winds is gone. The Icefall itself has no station: Base Camp's and Camp II's bracket it.
- The meter names a wind by the Beaufort scale at the speed in the hand (a simplification: the scale's speeds are for 10 m up); the wind chill uses the 10 m wind, as a Kestrel does.
- The body feels the cold since #272: the meter's air and wind chill are what the climber's body feels where they stand (docs/design/weather.md).
- No coordinates on the watch: no sourced coordinates for Camp 1.
- An SOS reaches Base Camp and nobody sets out from there yet; the rescue on the Icefall is the team's own (#241, #263). The radio's guide and group channels and its battery are #79's; the jet stream's summit wind and the plume in the forecast are #39's.
- A climb saved before this change starts again from Base Camp.

## Testing with god mode (`?god`)

1. At the start (about 03:00, clear): [Weather] reads about −10 °C, wind 4 km/h "Calm", wind chill −14 °C, moderate risk.
2. Weather: wind, then go to face: upper-icefall: about 45 km/h, −16 °C, wind chill about −31 °C, high risk in red. Gust: the meter jumps to a gale.
3. Go to ladder: big-crevasse, clip in, step on, Slip: hanging, the radio has no contact, the watch no fix, the tracker no sky.

## CI, for whoever touches it next

The page's stories are sensitive to the runner's speed. On runners a third slower than usual, `e2e/alone.spec.ts:28` fails (its 20 s for ten seconds of play runs out) and `e2e/pack.spec.ts:118` on the iPhone can too; neither is the devices' doing. The branch's build plays as fast as `develop`'s (12.3 s to the first save on both, measured side by side).
