# Everest: Simulator-Trainer: TODO

Checklist for building the game from [spec.md](spec.md), in the order of its development plan. Tick items as you go (`- [x]`). Each task is also a GitHub issue (its number follows the task's title) and a card on the [project board](https://github.com/users/albalaeff/projects/2), worked on in its own branch and merged into `develop` through a PR, which ticks the task's items here (see docs/conventions.md → Git workflow). Every task ends with the same **Done gate**:

> **Done gate:** tests written first · `uv run ruff check` ✔ · `uv run mypy scripts` ✔ · `uv run pytest` ✔ · the game's lint, type check, Vitest and Playwright ✔ (once Task 8 is in) · works on a PC and on a phone, where it shows on screen · no unwired code · CI green on the PR · PR merged into `develop`

Tasks marked *Iteration 1–3* are planned into the board's first two-week iterations. The rest get theirs after the prototype, once the pace of work is clear (spec.md → Development plan).

---

## 0. Before starting

### Accounts & tools
- [x] Python 3.14 (3.14.7), `uv`, Git
- [x] Node.js 24 and npm 11, for the game's TypeScript project (Task 8)
- [x] bateks: a collaborator on the repository (write, the most a personal repository allows) and an admin of the project board
- [ ] bateks: a token that can write to the repository: `gh auth login`, or a classic token with `repo` and `workflow` (a fine-grained token can't write to another user's repository)
- [ ] Each developer's machine: `uv run python scripts/check_setup.py` shows nothing `[missing]`
- [x] The GitHub CLI signed in with the `project` scope, for the project board
- [x] The backlog: 9 milestones and 89 issues (#8–#96) from spec.md; the project board with Status, Priority, Size, Area and Iteration
- [ ] A real iPhone and a real Android phone for playtests and the release check

### Decisions to confirm (spec.md → Open questions and risks)
- [ ] Which experts review the game, and how to find them ([#8](https://github.com/albalaeff/Everest-Game/issues/8)): before milestone 1 ends
- [ ] On death, does the expedition end, or back to the last camp? ([#32](https://github.com/albalaeff/Everest-Game/issues/32)): before milestone 3 ends
- [ ] How many other expeditions and climbers are on the mountain at once ([#33](https://github.com/albalaeff/Everest-Game/issues/33)): before milestone 3 ends
- [ ] In co-op, who leads the group, a player or an NPC guide? ([#34](https://github.com/albalaeff/Everest-Game/issues/34)): before milestone 3 ends
- [ ] Is the tour chosen freely, or does the player save up for it? ([#49](https://github.com/albalaeff/Everest-Game/issues/49)): before milestone 4 ends
- [ ] A story and a permanent character, or each expedition on its own? ([#50](https://github.com/albalaeff/Everest-Game/issues/50)): before milestone 4 ends
- [ ] Progress across devices, an account or a transfer code? ([#77](https://github.com/albalaeff/Everest-Game/issues/77)): before milestone 6 ends
- [ ] App Store and Google Play through Capacitor, needed, and when? ([#91](https://github.com/albalaeff/Everest-Game/issues/91)): before milestone 8 ends

### Workflow for each task
- [ ] Take `postponed` off its issue (or put `claude:bateks` on it): Claude starts it with a plan comment and an estimate
- [ ] Branch from the latest `develop`: `feature/<issue>-<short-description>`
- [ ] Tests first; run the Done gate locally; commit often
- [ ] Open a PR into `develop` (`Closes #<issue>`) that ticks the task's items here; merge (squash) when CI is green

---

## 1. Knowledge base

### Task 1: Knowledge base: the fact record format, checked in CI ([#9](https://github.com/albalaeff/Everest-Game/issues/9)) · *Iteration 1*
- [x] A record has the claim, a value or a range with its unit, the source link, the check date and a status (`expert-reviewed` or `source only`); where sources disagree, each version
- [x] Records are JSON files with a schema; CI fails on a record without a source or a check date
- [x] The simulation's coefficients live in the same data, so an expert can change them without a programmer
- [x] Done gate

### Task 2: Knowledge base: altitude medicine (AMS, HACE, HAPE, acclimatization) ([#10](https://github.com/albalaeff/Everest-Game/issues/10)) · *Iteration 2*
- [ ] Symptoms, progression and treatment (descent, oxygen) of AMS, HACE and HAPE, from the WMS 2024 guidelines and the CDC Yellow Book 2026
- [ ] Acclimatization rules: sleeping altitude, rest days, rotations
- [ ] Medicines described by why doctors use them, never with doses
- [ ] Each fact a record in the format of #9
- [ ] Done gate

### Task 3: Knowledge base: the South route, its altitudes and hazards ([#11](https://github.com/albalaeff/Everest-Game/issues/11)) · *Iteration 2*
- [ ] The route points from Lukla to the summit, with altitudes as ranges across sources
- [ ] Each section's hazards and lessons, as in the spec's route table
- [ ] Today's terrain at the Hillary Step and the pre-2015 rock step, for historical scenarios
- [ ] Done gate

### Task 4: Knowledge base: oxygen, weather, cold, time and crowds ([#12](https://github.com/albalaeff/Everest-Game/issues/12)) · *Iteration 2*
- [ ] Oxygen: bottles, flows, regulators
- [ ] Weather and cold: jet stream, safe summit wind, windows, wind chill
- [ ] Time and crowds: summit times of survivors and of the dead (BMJ 2008), the 2026 crowd records
- [ ] Done gate

### Task 5: Knowledge base: tours, prices and rules ([#13](https://github.com/albalaeff/Everest-Game/issues/13)) · *Iteration 3*
- [ ] The three tour tiers: price ranges, Sherpas per client, oxygen, service
- [ ] Rules: the USD 15,000 spring permit, one Sherpa or guide per two foreign climbers above 8,000 m, the 7,000 m peak recommendation (not law)
- [ ] Prices marked as estimates where they aren't price lists
- [ ] Done gate

### Task 6: Knowledge base: the accident chronicle ([#14](https://github.com/albalaeff/Everest-Game/issues/14)) · *Iteration 3*
- [ ] Every recorded death: 339 to the end of 2025 (Himalayan Database) and spring 2026's 5, with date, place, cause and source
- [ ] The nine accidents in the spec's table in detail: date, weather, crowd, the chain of decisions and conditions, both versions where sources disagree
- [ ] Done gate

### Task 7: Questions for an expert, by area ([#15](https://github.com/albalaeff/Everest-Game/issues/15)) · *Iteration 3*
- [ ] Every “to check with an expert” point of the spec and of the knowledge base, as a list for the guide (technique) and for the doctor (physiology)
- [ ] Exported from the records with status `source only`, so the list stays current
- [ ] Done gate

**Milestone 1:** Facts with sources and check dates, questions for an expert.

---

## 2. Prototype: Icefall

### Task 8: Game project: TypeScript build, tests and CI ([#16](https://github.com/albalaeff/Everest-Game/issues/16)) · *Iteration 1*
- [x] TypeScript with a bundler, Vitest, Playwright with phone emulation, lint and format; their checks run in CI next to the template's
- [x] Every merge into `develop` publishes a preview build that opens on a PC and a phone
- [x] README and docs/conventions.md say how to run and test the game
- [x] Done gate

### Task 9: Simulation core: fixed time step, seeded and deterministic ([#17](https://github.com/albalaeff/Everest-Game/issues/17)) · *Iteration 1*
- [x] TypeScript with no DOM and no dependencies
- [x] A fixed time step; the same seed and the same actions give the same result, and a test checks it
- [x] It sees game actions only, never keys or touches
- [x] A headless runner plays faster than real time
- [x] Done gate

### Task 10: Input layer: keys, mouse, touch and gamepad as one set of actions ([#18](https://github.com/albalaeff/Everest-Game/issues/18)) · *Iteration 1*
- [x] Every action of the spec's controls table, on a PC and on a phone (left thumb: walk and pace; right: cowstails, jumar, oxygen flow; taps on the slope for the ice axe and crampons)
- [x] Buttons at least the size of a fingertip; climbing in landscape
- [x] Pointer Events; a test checks that keys and touches give the same actions
- [x] Done gate

### Task 11: Rendering: the slope in layers with PixiJS ([#19](https://github.com/albalaeff/Everest-Game/issues/19)) · *Iteration 2*
- [ ] PixiJS draws the slope, a few parallax layers, a placeholder climber silhouette and a camera that follows the climber
- [ ] A quality setting for layers and particles
- [ ] 60 fps on an average laptop, 30 on a mid-range phone
- [ ] Done gate

### Task 12: Slope physics: movement, falls and the rope ([#20](https://github.com/albalaeff/Everest-Game/issues/20)) · *Iteration 2*
- [x] The climber moves over the terrain; a slip on steep ground becomes a fall
- [x] A rope with Verlet integration holds a clipped climber
- [x] Part of #17: deterministic and tested headless
- [x] Done gate

### Task 13: Fixed ropes, cowstails, jumar and ladders ([#21](https://github.com/albalaeff/Everest-Game/issues/21)) · *Iteration 3*
- [ ] Two cowstails: at an anchor, the second is clipped before the first comes off; unclipping is possible and dangerous
- [ ] The jumar slides along the rope while held
- [ ] Crossing a ladder over a crevasse
- [ ] Done gate

### Task 14: Body model v1: fatigue, blood oxygen and pace ([#22](https://github.com/albalaeff/Everest-Game/issues/22)) · *Iteration 3*
- [ ] SpO2 from altitude and oxygen flow; fatigue from pace, load, sleep, food and water; the rest step against a faster pace
- [ ] Its coefficients come from the knowledge base (#9)
- [ ] The mountain's time on top of the core's seconds of play: six to eight weeks in 5–7 hours, waiting days skipped, summit day the most detailed (spec.md → Gameplay)
- [ ] The player sees no numbers for their condition
- [ ] Done gate

### Task 15: Oxygen v1: bottles, flow and the pressure gauge ([#23](https://github.com/albalaeff/Everest-Game/issues/23)) · *Iteration 3*
- [ ] Bottles empty at the chosen flow, usually 2–4 L/min, up to 8 on short sections
- [ ] The flow on + / − and on its touch control; the pressure gauge on screen
- [ ] Done gate

### Task 16: Objective hazards: probability by time of day and weather ([#24](https://github.com/albalaeff/Everest-Game/issues/24)) · *Iteration 3*
- [ ] Each hazard has a probability that depends on time of day and weather
- [ ] Seracs, avalanches and crevasses on the Icefall; cornices come with the summit push
- [ ] Done gate

### Task 17: Interface v1: clock, altimeter, pressure gauge and self-check ([#25](https://github.com/albalaeff/Everest-Game/issues/25))
- [ ] Clock, altimeter and bottle pressure gauge, in HTML over the canvas, on PC and phone screens
- [ ] Self-check: symptoms in words, the pulse oximeter, the colour of the fingers
- [ ] Done gate

### Task 18: The Khumbu Icefall: Base Camp to Camp 1 ([#26](https://github.com/albalaeff/Everest-Game/issues/26))
- [ ] Playable from Base Camp to Camp 1, on a PC and on a phone
- [ ] Ladders, fixed ropes, seracs and crevasses; leaving early is safer
- [ ] Done gate

### Task 19: A Cloudflare account for the room server ([#27](https://github.com/albalaeff/Everest-Game/issues/27)) · *Iteration 1*
- [x] The account exists, and its API token is in the repository's Actions secrets
- [x] Its name and where the token lives are written in docs/production.md
- [x] Done gate

### Task 20: Room server v1: a room by code, the simulation on the server ([#28](https://github.com/albalaeff/Everest-Game/issues/28)) · *Iteration 2*
- [ ] Cloudflare Workers and Durable Objects over WebSocket: players send actions, the server runs #17 and sends the state
- [ ] Joining by code or link; the server checks the game's version and asks an old one to reload
- [ ] Runs locally for development and tests; deployed with the account of #27
- [ ] Done gate

### Task 21: Co-op test: a PC browser and a phone browser in one room ([#29](https://github.com/albalaeff/Everest-Game/issues/29))
- [ ] Playwright starts the local room server and two browsers, a desktop one and an emulated phone (screen size, touch)
- [ ] Both climb the Icefall together; the test runs in CI
- [ ] Done gate

### Task 22: The disclaimer and the beta mark ([#30](https://github.com/albalaeff/Everest-Game/issues/30))
- [ ] The disclaimer at the start and in training
- [ ] “Not reviewed by an expert” shown until the review of milestone 8
- [ ] Done gate

### Task 23: Playtest the Icefall prototype ([#31](https://github.com/albalaeff/Everest-Game/issues/31))
- [ ] Played by a few people, on PCs and phones, solo and in one room
- [ ] What they found goes into issues; the milestone's check is answered on this issue
- [ ] Done gate

**Milestone 2:** Walking, fixed ropes, ladders, fatigue and oxygen on one section, played in one room from a PC and a phone. Check: re-clipping and fatigue feel plausible in playtests.

---

## 3. Vertical slice: summit push

### Task 24: Summit push: South Col to the summit and back ([#35](https://github.com/albalaeff/Everest-Game/issues/35))
- [ ] South Col → Balcony → South Summit → Hillary Step (today's snow slope) → summit → descent
- [ ] Summit night: an almost black screen, the headlamp's cone, other groups' lights
- [ ] Solo and as a pair online; the push takes 60–90 minutes
- [ ] Done gate

### Task 25: Turnaround time: set before the push, a red mark on the clock ([#36](https://github.com/albalaeff/Everest-Game/issues/36))
- [ ] Set in camp before the push, shown on the clock as a red mark
- [ ] Turning around counts as a correct decision; a summit after the time, as luck
- [ ] Done gate

### Task 26: Altitude illness: AMS, HACE and HAPE ([#37](https://github.com/albalaeff/Everest-Game/issues/37))
- [ ] From #10: symptoms in words, progression, recovery with descent and oxygen
- [ ] HACE: ataxia makes the controls imprecise, but the game stays playable
- [ ] Seen in others too: the partner, Sherpas and NPC climbers
- [ ] Done gate

### Task 27: Cold: body temperature, frostbite and wind chill ([#38](https://github.com/albalaeff/Everest-Game/issues/38))
- [ ] Body temperature from clothing, wind and effort; wind chill
- [ ] Frostbite of fingers and face, shown in the self-check
- [ ] Done gate

### Task 28: Weather v1: jet stream wind, the summit plume and imperfect forecasts ([#39](https://github.com/albalaeff/Everest-Game/issues/39))
- [ ] Summit wind from the jet stream; up to 48 km/h counts as safe
- [ ] Forecasts with errors
- [ ] The snow plume above the summit follows the wind
- [ ] Done gate

### Task 29: Crowds: other expeditions as agents, queues on the fixed ropes ([#40](https://github.com/albalaeff/Everest-Game/issues/40))
- [ ] Other expeditions as finite-state agents; queues on the fixed ropes and at the Hillary Step; a chain of headlamps shows a coming jam
- [ ] Simulated in detail only near the player; their number per #33
- [ ] Done gate

### Task 30: Sherpas and the guide as NPC agents ([#41](https://github.com/albalaeff/Everest-Game/issues/41))
- [ ] Experience, fatigue and health; they advise, tire and fall ill
- [ ] The guide on the radio, a simple version (the full radio is in milestone 6)
- [ ] Done gate

### Task 31: Oxygen v2: swapping a bottle on the move, failures and caches ([#42](https://github.com/albalaeff/Everest-Game/issues/42))
- [ ] Swapping a bottle on the move
- [ ] Regulator failure: its hiss falls silent; mask icing
- [ ] Caches on the route, and theft from them
- [ ] Done gate

### Task 32: Hypoxia you can see: a narrowing view, muted colours, slower reactions ([#43](https://github.com/albalaeff/Everest-Game/issues/43))
- [ ] The effects follow blood oxygen and HACE, and stay playable on a phone
- [ ] Done gate

### Task 33: Death and turning back: what happens next ([#44](https://github.com/albalaeff/Everest-Game/issues/44))
- [ ] Solo: as decided
- [ ] In the pair: the dead player watches to the end; one who turned back waits in camp (the coordinator role is in milestone 6)
- [ ] Done gate

### Task 34: A pair online for the summit push: shared time, disconnection, rejoining ([#45](https://github.com/albalaeff/Everest-Game/issues/45))
- [ ] On the route, time runs the same for both; each walks at their own pace
- [ ] A player who drops out is taken to the nearest camp by AI and rejoins with the same code
- [ ] Who leads, per #34
- [ ] Done gate

### Task 35: Debrief v1: the timeline of decisions ([#46](https://github.com/albalaeff/Everest-Game/issues/46))
- [ ] After every expedition: the decisions on a timeline, and the last point where it could still have been fixed
- [ ] A summit after the turnaround time is called luck
- [ ] Done gate

### Task 36: Balance runner: thousands of seeded expeditions ([#47](https://github.com/albalaeff/Everest-Game/issues/47))
- [ ] Runs headless with scripted strategies (turn around on time, ignore the turnaround time, low oxygen, ignore symptoms) and reports summit and death rates for each
- [ ] A small sample runs in CI and fails when a dangerous strategy stops being dangerous
- [ ] Done gate

### Task 37: Playtest the summit push ([#48](https://github.com/albalaeff/Everest-Game/issues/48))
- [ ] Played solo and as a pair, on PCs and phones
- [ ] What they found goes into issues; the check is answered on this issue
- [ ] Done gate

**Milestone 3:** South Col → summit → descent, solo and as a pair online. Check: the push takes 60–90 min, and the turnaround decisions are clear.

---

## 4. Whole route

### Task 38: Acclimatization: sleeping altitude and rotations ([#51](https://github.com/albalaeff/Everest-Game/issues/51))
- [ ] The acclimatization level follows sleeping altitude and rest days (#10)
- [ ] Rotations before the summit push; too fast a climb brings symptoms
- [ ] Done gate

### Task 39: The trek: Lukla to Base Camp ([#52](https://github.com/albalaeff/Everest-Game/issues/52))
- [ ] Playable from Lukla to Base Camp (5,364 m), compressed to fit about 45 minutes with the tour and the gear
- [ ] First symptoms if the player climbs too fast
- [ ] Done gate

### Task 40: Base Camp and the camp screen: the strategy layer ([#53](https://github.com/albalaeff/Everest-Game/issues/53))
- [ ] The camp screen, on a PC and in portrait on a phone
- [ ] Planning rotations, checking gear, reading forecasts, calculating oxygen
- [ ] Skipping days; in each camp the phone says how long the next section takes
- [ ] Done gate

### Task 41: Western Cwm: Camp 1 to Camp 2 ([#54](https://github.com/albalaeff/Everest-Game/issues/54))
- [ ] Playable from Camp 1 to Camp 2, with heat and water in the body model
- [ ] Done gate

### Task 42: Lhotse Face: Camp 2 to Camp 3 ([#55](https://github.com/albalaeff/Everest-Game/issues/55))
- [ ] Playable from Camp 2 to Camp 3
- [ ] The ice axe and crampons on steep ice: the mouse on a PC, taps on a phone
- [ ] Done gate

### Task 43: Camp 3 to the South Col: the start of the death zone ([#56](https://github.com/albalaeff/Everest-Game/issues/56))
- [ ] Playable from Camp 3 to Camp 4
- [ ] Sleeping on oxygen; the go or no-go decision before the summit push
- [ ] Done gate

### Task 44: The season: weather windows in May ([#57](https://github.com/albalaeff/Everest-Game/issues/57))
- [ ] A season with windows of 4–7 calm days, different for each seed
- [ ] Paid forecasts in the expensive tours are better than free ones
- [ ] Done gate

### Task 45: Gear: weight, failures and losses ([#58](https://github.com/albalaeff/Everest-Game/issues/58))
- [ ] Crampons, ice axe, jumar, cowstails, boots, mittens, headlamp, batteries: chosen, carried, checked in camp
- [ ] Weight slows the climber; gear fails or gets lost
- [ ] Done gate

### Task 46: Tours and operators: three tiers, a hidden quality ([#59](https://github.com/albalaeff/Everest-Game/issues/59))
- [ ] Budget, fully guided and premium, with the staffing and oxygen of #13
- [ ] Fictional operators with a hidden quality, found out by asking questions
- [ ] How the player pays, per #49
- [ ] Done gate

### Task 47: Saves in camps, export to a file, and a resume point ([#60](https://github.com/albalaeff/Everest-Game/issues/60))
- [ ] Saves in camps only, in IndexedDB, with export to and import from a file
- [ ] A resume point when the game is interrupted; it only continues, so it can't replay a decision
- [ ] Done gate

### Task 48: Install on a phone: PWA, offline single-player, updates ([#61](https://github.com/albalaeff/Everest-Game/issues/61))
- [ ] A web app manifest and a service worker: an icon, full screen, single-player without a network
- [ ] On an iPhone the game offers to install itself and shows how (Share → Add to Home Screen)
- [ ] An installed game updates on its next launch
- [ ] Done gate

### Task 49: Playtest a whole expedition: 5–7 hours ([#62](https://github.com/albalaeff/Everest-Game/issues/62))
- [ ] A full expedition played and timed by stage against the spec's table
- [ ] Done gate

**Milestone 4:** Trek, Base Camp, rotations and tour choice.

---

## 5. Training and real accidents

### Task 50: Training framework: explain, show, do, test under stress ([#63](https://github.com/albalaeff/Everest-Game/issues/63))
- [ ] A module: a short explanation with a source, a live example, the player doing it without hurry, a test under stress (night, wind, a queue, a tired body)
- [ ] Skipping by a short situational test, where the module allows it
- [ ] Done gate

### Task 51: Training module 0: controls and interface ([#64](https://github.com/albalaeff/Everest-Game/issues/64))
- [ ] Walking, re-clipping, checking yourself, managing the camp and the group
- [ ] Done gate

### Task 52: Training module 1: the body at altitude ([#65](https://github.com/albalaeff/Everest-Game/issues/65))
- [ ] The module, with its skip test
- [ ] Done gate

### Task 53: Training module 2: gear and technique ([#66](https://github.com/albalaeff/Everest-Game/issues/66))
- [ ] The module; its ladder lesson draws on the 2012 accident
- [ ] Done gate

### Task 54: Training module 3: oxygen ([#67](https://github.com/albalaeff/Everest-Game/issues/67))
- [ ] The module, with its skip test
- [ ] Done gate

### Task 55: Training module 4: weather ([#68](https://github.com/albalaeff/Everest-Game/issues/68))
- [ ] The module, with its skip test
- [ ] Done gate

### Task 56: Training module 5: decisions ([#69](https://github.com/albalaeff/Everest-Game/issues/69))
- [ ] The module
- [ ] Done gate

### Task 57: “In real life” cards and the printable handbook ([#70](https://github.com/albalaeff/Everest-Game/issues/70))
- [ ] A card for every mechanic, from the knowledge base
- [ ] The cards collected into a personal handbook that prints
- [ ] Done gate

### Task 58: Debrief v2: a real accident with a similar mistake ([#71](https://github.com/albalaeff/Everest-Game/issues/71))
- [ ] After #46's timeline: the real accident closest to the player's mistake
- [ ] Done gate

### Task 59: The chronicle and History cards ([#72](https://github.com/albalaeff/Everest-Game/issues/72))
- [ ] The in-game chronicle from #14
- [ ] Names of the dead appear only in History cards
- [ ] Done gate

### Task 60: Scenario engine: a real date, weather and crowd, a fictional climber ([#73](https://github.com/albalaeff/Everest-Game/issues/73))
- [ ] A scenario sets the date, the weather, the crowd and the terrain (today's or historical) from #14
- [ ] A random expedition: its conditions rolled from the seed, with those set in advance (harsh weather, say) kept, so every expedition is unique
- [ ] Where sources disagree, both versions are shown
- [ ] Done gate

### Task 61: Scenarios 2019, 2023, 2024 and 2026 ([#74](https://github.com/albalaeff/Everest-Game/issues/74))
- [ ] 2026: “I feel bad, but the summit is close”
- [ ] 2024: descending the ridge in a crowd
- [ ] 2023: a season with a budget operator
- [ ] 2019: the traffic jam, wait or turn around
- [ ] Done gate

### Task 62: Scenarios 1996, 2012 and 2015 ([#75](https://github.com/albalaeff/Everest-Game/issues/75))
- [ ] 1996: the historical scenario, with the old rock Hillary Step
- [ ] 2012: ladders, in the training camp
- [ ] 2015: the earthquake at Base Camp
- [ ] Done gate

### Task 63: More scenarios, to 15–20: one for each main cause of death ([#76](https://github.com/albalaeff/Everest-Game/issues/76))
- [ ] Chosen from #14, plus fictional ones where they teach better
- [ ] Every main cause of death covered
- [ ] Done gate

**Milestone 5:** Modules, “In real life” cards, debriefs, 15–20 scenarios.

---

## 6. Co-op and leader role

### Task 64: Rooms for up to four players: code, link, Ready and chat ([#78](https://github.com/albalaeff/Everest-Game/issues/78))
- [ ] A room for up to four, created and shared by a code or a link
- [ ] Days in camp are skipped only when everyone is safe and has pressed Ready
- [ ] Text chat
- [ ] Done gate

### Task 65: Radio: the guide, Base Camp and your group ([#79](https://github.com/albalaeff/Everest-Game/issues/79))
- [ ] Interference, dying batteries, a radio left behind in the tent
- [ ] Ready phrases, because typing on a phone mid-climb is slow
- [ ] Done gate

### Task 66: Leader role: a group of NPC clients ([#80](https://github.com/albalaeff/Everest-Game/issues/80))
- [ ] Clients with their own health, experience and stubbornness
- [ ] Assigning Sherpas and oxygen, choosing the window, setting the turnaround time, deciding who stays off the summit push, rescuing a casualty
- [ ] Done gate

### Task 67: Turned back in co-op: the camp coordinator ([#81](https://github.com/albalaeff/Everest-Game/issues/81))
- [ ] The forecast, contact with Base Camp, calling for help, from camp
- [ ] Done gate

### Task 68: Server saves of co-op expeditions ([#82](https://github.com/albalaeff/Everest-Game/issues/82))
- [ ] Saved in camps on the server; continued with the same group
- [ ] Done gate

### Task 69: Progress across devices ([#83](https://github.com/albalaeff/Everest-Game/issues/83))
- [ ] A single-player expedition moves between devices
- [ ] Done gate

### Task 70: Training module 6: leadership ([#84](https://github.com/albalaeff/Everest-Game/issues/84))
- [ ] The module
- [ ] Done gate

### Task 71: Leader scenarios: 2025 and 2014 ([#85](https://github.com/albalaeff/Everest-Game/issues/85))
- [ ] 2025: a client refuses to descend
- [ ] 2014: how many trips through the Icefall the Sherpas make
- [ ] Done gate

**Milestone 6:** Up to 4 players by code, radio, camp coordinator, NPC Sherpas.

---

## 7. Graphics, sound, languages

### Task 72: The final style: layers, peaks, sky and weather ([#86](https://github.com/albalaeff/Everest-Game/issues/86))
- [ ] 5–7 parallax layers with Lhotse, Nuptse and Pumori
- [ ] The sky by time of day, deeper blue with altitude
- [ ] Particle weather: snow, drifting snow, fog, the summit plume
- [ ] Done gate

### Task 73: The climber: skeletal 2D animation and visible gear ([#87](https://github.com/albalaeff/Everest-Game/issues/87))
- [ ] Skeletal animation; the mask, backpack, cowstails and a bright suit visible
- [ ] Done gate

### Task 74: Sound synthesis: wind, breathing, regulator, crampons, radio ([#88](https://github.com/albalaeff/Everest-Game/issues/88))
- [ ] Wind, breathing that speeds up with altitude, the regulator's hiss, crampons, carabiners, the radio, with the Web Audio API
- [ ] On phones, sound starts with the first touch in the menu
- [ ] Done gate

### Task 75: Russian and English; metres and feet ([#89](https://github.com/albalaeff/Everest-Game/issues/89))
- [ ] Every text in Russian and English, switched in the menu
- [ ] Metres and °C, or feet and °F
- [ ] Done gate

### Task 76: Performance: 60 fps on a laptop, 30 on a mid-range phone, under 20 MB ([#90](https://github.com/albalaeff/Everest-Game/issues/90))
- [ ] Measured on real devices in Chrome, Firefox, Edge and Safari, and on phones in Chrome on Android and Safari on iPhone
- [ ] The quality setting; a lower frame rate in camp to save the battery
- [ ] The download under 20 MB
- [ ] Done gate

**Milestone 7:** Final style, sound synthesis, RU and EN, performance.

---

## 8. Open beta

### Task 77: A release check on a real iPhone and a real Android phone ([#92](https://github.com/albalaeff/Everest-Game/issues/92))
- [ ] A short checklist, in docs/production.md, run before each release
- [ ] Done gate

### Task 78: Expert review: a guide and a doctor check the facts and scenarios ([#93](https://github.com/albalaeff/Everest-Game/issues/93))
- [ ] They review #15, the knowledge base and the scenarios
- [ ] Their corrections go into issues; reviewed records become `expert-reviewed`
- [ ] Done gate

### Task 79: Open beta: published free, marked “not reviewed by an expert” ([#94](https://github.com/albalaeff/Everest-Game/issues/94))
- [ ] Published, with the beta mark of #30
- [ ] A way for players to report problems
- [ ] Done gate

**Milestone 8:** Free release marked “not reviewed by an expert”. Check: a guide and a doctor reviewed the facts and scenarios.

---

## 9. Release 1.0

### Task 80: The expert review's corrections ([#95](https://github.com/albalaeff/Everest-Game/issues/95))
- [ ] Every correction made or answered; the beta mark comes off what was reviewed
- [ ] Done gate

### Task 81: Release 1.0 ([#96](https://github.com/albalaeff/Everest-Game/issues/96))
- [ ] Published; the room server on Cloudflare; the release checked on real phones
- [ ] Done gate

**Milestone 9:** Free on GitHub Pages or itch.io.
