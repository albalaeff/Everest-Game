# The climber's devices

Researched and built on 17–18 Nov 2026: issue #260, pull request #261 (https://github.com/albalaeff/Everest-Game/pull/261), merged into `develop` on 18 Nov; then #275 (issue #271, the same day) made taking a device out seen, in the tent and on the slope. The climber carries a handheld radio, a GPS watch, a pocket weather meter and a satellite tracker, usable on the Icefall from Base Camp to Camp 1. On 18 Nov the wind meter became a weather meter: air temperature, wind chill and frostbite risk, with the winds refitted to measured data (commit f8dbd0d).

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

## How each works in the game

- **One card**: [Devices] or G opens it at the device used last; [Radio] or Q at the radio. Arrows left and right go between devices, up and down through a device's buttons, Esc closes. On a gamepad: the left stick pressed in. It ends above the bottom controls and takes turns with the pack's card.
- **Radio**: five ready phrases (Radio check, Report position, Conditions?, Route ahead?, I need help). Base Camp answers from the game's real state: the position logged with its time, the weather, its weather station's temperature, the hour the sun reaches the ice, a ladder that's down. Hanging in a crevasse: static.
- **GPS watch**: the route's profile with the track, the part of the route, altitude, distance done and left (counted from Base Camp's edge to Camp 1's), metres still to climb, rate of climb, and the arrival at Camp 1 at the pace so far against the sun's hour (06:00). Hanging under the ice it has no fix and keeps the last one on its screen.
- **Weather meter** (tab [Weather] / [Метео]): wind now, its Beaufort name, average and strongest since it was taken out; under it, the air (0.1 °C) and the wind chill (whole degrees); beside it the frostbite risk, red with a triangle from "high". Wind: still night 4 km/h, the sun adds up to 12 by the day's warmest, snow 20, strong wind 45, a gust 70. Air at Base Camp's station by weather: clear −10 to +2 °C, cloud −7 to −2, snow −6 to −3, strong wind −13 to −6; coldest at 06:00, warmest at 13:00; 6.6 °C colder per km higher. It jumps as a gust comes, a moment before the gust arrives, and the wind chill with it.
- **Tracker**: off at the start; tracking sends a point every 10 minutes under the sky; a check-in takes three of the mountain's minutes to leave; SOS needs a press held 3 seconds.

## Decisions and limits

- Every climber has all four devices; they aren't things to pack or leave behind yet.
- The wind's speeds and the air's day are coefficients fitted to the measurements above; the question for an expert on the Icefall's winds is gone. The Icefall itself has no station: Base Camp's and Camp II's bracket it.
- The meter names a wind by the Beaufort scale at the speed in the hand (a simplification: the scale's speeds are for 10 m up); the wind chill uses the 10 m wind, as a Kestrel does.
- The body doesn't feel the cold yet: temperature and wind chill are for reading and training. Frostbite and hypothermia are future work.
- No coordinates on the watch: no sourced coordinates for Camp 1.
- An SOS reaches Base Camp and nobody sets out from there yet; the rescue on the Icefall is the team's own (#241, #263). The radio's guide and group channels and its battery are #79's; the forecast is #39's.
- A climb saved before this change starts again from Base Camp.

## Testing with god mode (`?god`)

1. At the start (about 03:00, clear): [Weather] reads about −10 °C, wind 4 km/h "Calm", wind chill −14 °C, moderate risk.
2. Weather: wind, then go to face: upper-icefall: about 45 km/h, −16 °C, wind chill about −31 °C, high risk in red. Gust: the meter jumps to a gale.
3. Go to ladder: big-crevasse, clip in, step on, Slip: hanging, the radio has no contact, the watch no fix, the tracker no sky.

## CI, for whoever touches it next

The page's stories are sensitive to the runner's speed. On runners a third slower than usual, `e2e/alone.spec.ts:28` fails (its 20 s for ten seconds of play runs out) and `e2e/pack.spec.ts:118` on the iPhone can too; neither is the devices' doing. The branch's build plays as fast as `develop`'s (12.3 s to the first save on both, measured side by side).
