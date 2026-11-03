# Everest: Simulator-Trainer — Game Plan

Nov 1, 2026 · @Alex

## Concept and requirements

A 2D browser game for PC and phone: a simulator-trainer for climbing Everest by the South route. The player completes a full expedition in 5–7 hours and learns the decisions that save lives in real mountains. The main goal is fewer deaths caused by mistakes, lack of professionalism and inexperience.

| Parameter | Decision |
| --- | --- |
| Goal | A real mountaineering trainer: knowledge and decisions from the game apply in real life |
| Gameplay | Everything combined: strategy in camps, active side-view climbing, survival decisions |
| Player role | Client of a commercial expedition, and a leader who manages the whole group |
| Tours | Choice of cheap and expensive tours: expensive ones have more oxygen, more Sherpas, and more experienced ones |
| Difficulty | One level for the whole game: hard and as realistic as possible |
| Training | Full, for everyone; experienced climbers skip the theory but not the training on the game's controls |
| Real accidents | All real accidents, including the most recent, plus fictional scenarios |
| Route | South route, from Nepal |
| Length | One expedition takes 5–7 hours, possibly up to 10 |
| Platform | One game in the browser on PC and on the phone, installable on the phone's home screen like an app; players on phones and PCs play together |
| Graphics | Silhouettes and gradients |
| Language | Russian and English |
| Publishing | Free online |
| Accuracy | Open sources only for now; the author will look for experts later |
| Co-op | 2–4 players online together with NPCs (Sherpas, other climbers); with friends via a room code; chat and in-game radio; a player who drops out helps from camp |

## Realism and accuracy principles

Every number, mechanic and piece of advice in the game is based on an open source. Until an expert has reviewed the content, the game tells the player so honestly.

- **Source priority.** Medicine — the Wilderness Medical Society 2024 guidelines and the CDC Yellow Book 2026. Statistics — the Himalayan Database and Alan Arnette's analyses of it. Science — the BMJ study of mortality on Everest (2008). Accident chronicle — expedition reports, Explorersweb, Outside, The Himalayan Times.
- **Knowledge base kept separate from code.** Every fact is a record with a link, a check date and a status: “expert-reviewed” or “source only”. This makes it easy to hand everything to a guide or a doctor for review later.
- **Disclaimer.** At the start and in training: the game trains knowledge and decisions, but it does not replace mountaineering courses, sessions with an instructor or a doctor's consultation.
- **Medicines without doses.** The game explains why doctors use medicines but gives no dosages: a doctor prescribes those. In the simulation, medicines exist in the first-aid kit as an action, not as instructions.
- **Honest uncertainty.** Where sources disagree (camp altitudes, death counts, tour prices), the game shows a range rather than a single “exact” number.
- **Expert review is a separate step before the public release.** Until then the game is published only as a beta marked “not reviewed by an expert”.

## Route and world

The game covers the whole South route: from the trek to Base Camp (5,364 m) to the summit (8,848.86 m) and back. Camp altitudes differ by 100–200 m between sources, because the tents are pitched a little differently each year. The game uses the middle of the range and can shift camp locations slightly from season to season.

&#91;embedded content: Alpine Ascents, Tidy Himalaya, Imagine Nepal, Hayden Rue, Nepal Nomad, Mountain Project · 8 route points\]

Summit day is the longest and most detailed scene in the game: almost all of it happens above 8,000 m.

| Section | Main hazards | What the game teaches |
| --- | --- | --- |
| Trek from Lukla to Base Camp | First altitude sickness, falls on the trail | Gain altitude slowly, watch for symptoms |
| Base Camp | Avalanches from nearby slopes (2015), illness in camp | Camp life, sleep, food, acclimatization plan |
| Khumbu Icefall (to Camp 1) | Serac collapse, avalanches, crevasses, ladders | Go early in the morning, don't linger, always stay clipped to the fixed ropes |
| Western Cwm (Camp 1 → Camp 2) | Crevasses, daytime heat and dehydration | Departure time, water, pace |
| Lhotse Face (Camp 2 → Camp 3) | Hard, steep ice, falls, queues on the fixed ropes | Fixed-rope work, jumar, crampons, re-clipping at anchors |
| Camp 3 → South Col (Camp 4) | Wind, cold, start of the “death zone” above 8,000 m | Oxygen for climbing and sleeping, the “go or no go” decision |
| Summit push: Balcony → South Summit → Hillary Step → summit | Hypoxia, cerebral edema, queues, cornice collapse (2024), frostbite | Turnaround time, oxygen calculation, honest self-assessment |
| Descent | Exhaustion, cerebral edema, darkness, running out of oxygen | The summit is only halfway |

Two facts shape the level design. The Icefall is the most dangerous section of the modern South route: deaths and injuries happen there every year ([SummitPost](https://summitpost.org/south-col-or-southeast-ridge/165530)). The classic rock Hillary Step collapsed in the 2015 earthquake, and there is now a steep snow slope above the Kangshung Face ([Alan Arnette](https://www.alanarnette.com/2024/05/22/everest-2024-summit-and-more-missing-climbers/)). The game shows today's terrain, and the old one only in historical scenarios (for example, 1996).

## Roles and tours

The player first goes as a client of a commercial expedition, and after the first expedition can lead their own group. Before each expedition they choose a tour. Money buys a safety margin, not the summit: a cheap tour can be completed, but it forgives fewer mistakes.

**Client.** Manages themselves: body, gear, oxygen, pace. A guide and a Sherpa are nearby, but the player decides whether to listen to them, whether to argue, and when to turn around on their own.

**Leader.** Leads a group of several NPC clients, each with their own health, experience and stubbornness. Assigns Sherpas and oxygen, chooses the weather window, sets the turnaround time, decides who stays off the summit push and how to rescue a casualty.

| Tour in the game | Price in 2026, USD | Sherpas per client | Oxygen | Guides and service |
| --- | --- | --- | --- | --- |
| Budget (Sherpa-supported) | 30,000–55,000 | fewest; the rules require at least 1 per 2 clients | from 5 bottles | No international guide; fewer spare tents, less food and fewer communications |
| Fully guided | 65,000–125,000 | 1 or more | about 8 bottles | IFMGA guides, paid weather forecast, satellite communications |
| Premium | 130,000 and up | up to 5 | unlimited | Personal guide, Base Camp doctor, personal cook |

Sources: [Alan Arnette, 2026 prices](https://www.alanarnette.com/blog/?p=48861), [Global Summit Guide](https://globalsummitguide.com/90k-vs-35k-everest-expedition-comparison/). Prices of Nepalese operators are estimates, not price lists.

Real rules the game takes into account:

- A spring permit on the Nepal side costs USD 15,000 since September 2025 (previously 11,000).
- Above 8,000 m, at least one Sherpa or guide is required for every two foreign climbers.
- The requirement to first climb a 7,000-metre peak in Nepal is not yet law. The game can recommend such experience ([Alan Arnette](https://www.alanarnette.com/blog/2026/02/23/everest-2026-rumor-fire-season/)).

The choice of tour is linked to safety statistically, not strictly. According to Arnette, 23 of the 26 clients who died in 2023–2024 were with companies cheaper than the median price. But some budget operators are good, and expensive ones have bad seasons too. So in the game every fictional operator has a hidden quality, and the player learns to check it with questions before buying.

## Simulation systems

The heart of the game is a model of the body at altitude, linked to oxygen, weather, time and crowds. The player does not see exact numbers for their condition: as in real life, they judge by symptoms, the pulse oximeter and what the guide says.

| System | What we model | Key data |
| --- | --- | --- |
| Hypoxia | Blood oxygen (SpO2), pace, clarity of thinking | At the summit about a third of sea-level oxygen is available ([Arnette](https://www.alanarnette.com/blog/?p=16718)) |
| Acclimatization | Acclimatization level by sleeping altitude, “climb high, sleep low” rotations | On the trek above 3,000 m, no more than 500 m of sleeping altitude per day and a rest day every 3–4 days ([CDC](https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/high-altitude-travel-and-altitude-illness.html)); on the mountain most teams do at least three rotations before the summit push ([Arnette](https://www.alanarnette.com/blog/?p=14555)) |
| Altitude illness | Acute mountain sickness, high-altitude cerebral edema (HACE), high-altitude pulmonary edema (HAPE) | HACE requires immediate descent: without it, death can occur within 24 hours of the onset of ataxia (CDC); the main treatment is descent and oxygen ([AAFP, WMS](https://www.aafp.org/afp/2020/0415/p505.html)) |
| Oxygen | Bottles, flow, regulator, mask, swapping a bottle on the move, failures and theft from caches | Usually 2–4 L/min; modern regulators give up to 8 L/min on short sections ([Explorersweb](https://explorersweb.com/2021/04/07/everest-technology-safety-or-something-else/)) |
| Energy | Fatigue, sleep, food, water, walking pace | Profound fatigue and a late summit are early signs associated with subsequent death ([BMJ 2008](https://pmc.ncbi.nlm.nih.gov/articles/PMC2602730)) |
| Cold | Body temperature, frostbite of fingers and face, wind chill, clothing | With wind above 48 km/h the felt temperature drops to roughly −45…−50 °C ([Arnette](https://www.alanarnette.com/2026/05/18/everest-2026-weather-alert-and-more-summits/)) |
| Weather | Jet stream, snowfall, windows in May, forecasts with errors | Summit wind up to 48 km/h is considered safe; a summit push needs 4–7 such days in a row ([Arnette](https://www.alanarnette.com/2018/05/02/everest-2018-inside-the-mind-during-the-last-rotation/)) |
| Time | Clock, daylight, turnaround time | Survivors reached the summit on average at 9:00–9:59, those who died at 13:00–13:59 (BMJ 2008) |
| Crowds | Other expeditions as AI agents, queues on the fixed ropes | 20 May 2026: 274 summits in one day; some climbers took about 12 hours from the South Col to the summit ([Arnette](https://www.alanarnette.com/blog/2026/06/02/everest-2026-season-summary-records-crowds-trash-winds/)) |
| Objective hazards | Seracs, avalanches, crevasses, cornices — with a probability that depends on time of day and weather | They cannot be “beaten”; you can only reduce the time spent under them |
| Gear | Crampons, ice axe, jumar, cowstails, boots, mittens, headlamp, batteries | Weight and failures: a broken crampon or a lost mitten matters as much as oxygen |
| Team | Sherpas and clients with experience, fatigue, health, character | Sherpas also get tired and sick; a client may refuse to descend |

The models are plausible simplifications, not a medical simulator. Their goal is that decisions which are right in reality are right in the game, and dangerous ones are dangerous. Model coefficients live in data, so an expert can adjust them without a programmer.

## Gameplay

The game combines three layers, as on a real expedition: planning in camp, moving on the slope and decisions under pressure. The real six to eight weeks are compressed into 5–7 hours: waiting days are skipped, and summit day is the most detailed part.

The game runs in real time and isn't turn-based: the mountain, the weather and the crowd go on whether or not the player acts, and all players move at once. Every expedition is unique, like a match in an online game: each has its own seed, so its weather, hazards and crowds fall differently; a scenario can generate its conditions at random or set them in advance, harsh weather for instance; and different mistakes lead to different consequences.

&#91;embedded content: loop of one expedition · 10 stages, 1 key decision\]

You can also turn around earlier: symptoms, strong wind or a queue at any stage are a reason to descend. In the debrief such a turnaround counts as a correct decision, not a loss.

**Strategy in camps.** The player plans rotations, watches sleep and food, checks gear, reads forecasts and calculates oxygen. A leader does the same for the whole group.

**Active side-view climbing.** Between camps the player guides the climber along a 2D slope. Every mechanic mirrors a real action: re-clipping from one rope to the next so that you always stay attached, crossing a ladder over a crevasse, ascending on a jumar, the rhythm of steps and breathing, swapping a bottle. The exact technique of each action needs to be checked with an expert.

**Survival decisions.** The game regularly poses choices without an obvious answer: go in a short window or wait for the next one, stand in the queue or turn around, help a stranger or rescue your own people. Consequences often appear not immediately but hours later — as in reality.

| Action | Controls (draft) |
| --- | --- |
| Walk up or down the slope | A / D |
| Pace: rest step or faster | Shift / Ctrl |
| Clip a cowstail onto the next rope | E (first cowstail), R (second) |
| Slide the jumar along the fixed rope | Hold Space |
| Ice axe and crampons on steep ice | Mouse |
| Oxygen flow | + / − |
| Check yourself: symptoms, pulse oximeter, fingers | Tab |
| Radio: guide, Base Camp, your group | Q |

On a phone, every action in the table has a touch control instead of its key (see Phone and PC). No action depends on reaction speed, so a player on a phone is not at a disadvantage in co-op.

| Stage of one expedition | Play time, h |
| --- | --- |
| Preparation: tour, gear, trek to Base Camp | 0.75 |
| First rotation: Icefall, Camp 1 | 1.0 |
| Second and third rotations: Camp 2, Lhotse Face | 1.5 |
| Waiting for a window and climbing to the South Col | 1.0 |
| Summit push and descent | 1.5 |
| Expedition debrief | 0.25 |

About 6 hours in total without training; training adds another 0.5–1 hour. Saving is possible only in camps, so decisions on the route cannot be “replayed”.

## Co-op

2–4 players climb together online, while the Sherpas and the other expeditions around them remain NPCs. In a browser this is realistic and free for small groups. The slow pace of climbing makes the network side easier: there is no need for instant reactions, as in shooters.

**How it works**

- One player creates an expedition and sends friends a code or a link. There is no matchmaking with strangers, so no moderation is needed.
- Phones and PCs play in the same rooms: it is the same game and the same server, and the server checks that every player has the same version of the game (see Phone and PC).
- The room server runs on Cloudflare Durable Objects: one expedition is one object that stores its state and sends updates to the players. Durable Objects have been available on the free Workers plan since April 2025 ([Tech Insider](https://tech-insider.org/cloudflare-durable-objects-multiplayer-game-server-2026/)); the free limit is 100,000 requests per day ([Cloudflare](https://www.cloudflare.com/developer-platform/products/durable-objects/)).
- The server runs the same simulation as the single-player game. Players send their actions, and the server calculates body, weather and time, so the expedition does not break if the room creator closes their tab.
- The fallback option is a direct browser-to-browser connection via WebRTC (PeerJS). It is free too, but players behind some routers need a relay (a TURN server) ([PeerJS](https://peerjs.com/docs)), and the expedition ends when the room creator leaves.
- The game has text chat and a radio; players can talk by voice in Discord or any other service.

| Situation | How it works in co-op |
| --- | --- |
| Time | Days in camp are skipped only when all players are in a safe place and have pressed “Ready”; on the route, time runs the same for everyone |
| Pace | Everyone walks at their own speed; the group stretches out, and someone has to decide whether to wait for the slowest |
| Radio | Communication is imperfect: interference, dying batteries, a radio can be left behind in the tent |
| Roles | One player can be the leader and the others clients; NPC Sherpas are assigned to players |
| Turnaround | The player descends to camp and becomes the coordinator: weather forecast, contact with Base Camp, calling for help |
| Death | The player becomes a spectator until the end of the expedition; the debrief shows which decisions led to it |
| Disconnection | An AI takes the climber without a player to the nearest camp; the player can rejoin with the same code |
| Saves | The server saves the expedition in camps; it can be continued with the same group |

**What co-op adds to training.** The hardest decisions on the mountain are made as a group: turning around while friends keep going, waiting for someone who is falling behind, getting down a person who can no longer walk. In 1996 Rob Hall stayed with his weakened client Doug Hansen and could not descend ([Advnture](https://www.advnture.com/climbing-mountaineering/what-was-the-1996-everest-disaster-the-chain-of-events-that-claimed-eight-lives-and-sparked-never-ending-controversy)). Co-op lets players experience this pressure with real people, and the debrief shows the cost of every choice.

**Development and testing.** The network layer is built in from the first prototype: the simulation is written from the start to run on a server, because adding co-op to a finished single-player game costs far more. A joint expedition can be tested automatically: a local server and several browsers at once via Playwright. Publishing the server will require a free Cloudflare account owned by the project's author.

## Training

Training is built around the decisions that most often cost lives on Everest: a late turnaround, missed symptoms and running short of oxygen. The “Controls” module is mandatory for everyone. An experienced climber can skip the theory by passing a short situational test.

| Module | What the player can do after it | Can it be skipped? |
| --- | --- | --- |
| 0. Controls and interface | Walk, re-clip, check their condition, manage the camp and the group | No |
| 1. The body at altitude | Recognize mountain sickness, cerebral and pulmonary edema in themselves and others; plan acclimatization | Yes, by test |
| 2. Gear and technique | Crampons, ice axe, fixed ropes, jumar, ladders; always stay clipped in | Theory yes, practice no |
| 3. Oxygen | Calculate the supply, choose the flow, swap a bottle, notice a regulator failure | Yes, by test |
| 4. Weather | Read the wind forecast, see the plume above the summit, choose a window | Yes, by test |
| 5. Decisions | Set a turnaround time in advance and stick to it; turn someone else around; help a casualty | No |
| 6. Leadership | Lead a group, assign Sherpas and oxygen, not let the group pressure the decision | No; unlocks with the leader role |

Every module follows the same pattern:

1. Explain briefly, with a source.
2. Show it on a live example in the training camp near the Icefall.
3. Let the player do it themselves, without hurry.
4. Test it under stress: at night, in wind, in a queue, with a tired body.

**Transfer to real life.** Next to every mechanic there is an “In real life” card: what to do, the typical mistake, the source. The cards are collected into a personal handbook that can be printed. The game says plainly that physical skills (walking in crampons, using a jumar) must be trained with an instructor, while the game trains understanding and decisions.

**Debrief after every expedition.** The player sees a timeline of their decisions, the point where everything could still have been fixed, and a real accident with a similar mistake. There is a debrief after a successful expedition too: a summit reached after breaking the turnaround time counts as luck, not skill.

## Real accidents as training scenarios

The in-game chronicle includes every recorded accident: 339 deaths up to the end of 2025 according to the Himalayan Database, plus 5 more in spring 2026. There will be about 15–20 playable scenarios: based on the most instructive accidents, with at least one for each main cause of death.

&#91;embedded content: Himalayan Database via Global Summit Guide · 339 deaths, 1922–2025\]

Decisions about acclimatization, oxygen and turnaround time directly affect the blue bars, so they are the focus of training. The game teaches players to reduce mountain hazards through time and place: when and where not to linger.

| Year | What happened | Main lesson | Scenario in the game |
| --- | --- | --- | --- |
| 2026 | 5 deaths. Two Indian climbers died on 22 May while descending after the summit; reportedly, both were already unwell on the ascent ([Arnette](https://www.alanarnette.com/blog/2026/06/02/everest-2026-season-summary-records-crowds-trash-winds/)) | Recognize illness and turn around before the summit | “I feel bad, but the summit is close” |
| 2025 | 5 deaths. Subrata Ghosh (India) refused to descend below the Hillary Step after the summit ([Outside](https://www.outsideonline.com/outdoor-adventure/everest/mount-everest-four-dead/)) | Exhaustion and a late summit; a Sherpa cannot bring down someone who will not walk | Leader: a client refuses to descend |
| 2024 | On 21 May a cornice near the Hillary Step collapsed under a long queue. Daniel Paterson and Pastenji Sherpa died; several people were held by the fixed rope ([Arnette](https://www.alanarnette.com/blog/?p=45184)) | Always stay clipped in; a crowd on the ridge is a hazard in itself | Descending the ridge in a crowd |
| 2023 | A record 18 deaths. On 12 April a collapse in the Icefall killed three Sherpas; the others died from altitude, exhaustion and cold ([Explorersweb](https://explorersweb.com/everest-final-2023-death-toll-worst-ever/)) | An oxygen plan and safety standards matter more than speed | A season with a budget operator |
| 2019 | 11 deaths. 22–23 May — queues on the ridge in a short window; Cyclone Fani delayed fixing the ropes ([National Geographic](https://education.nationalgeographic.org/resource/traffic-jams-are-just-one-problems-facing-climbers-everest)) | A short window plus crowds means extra hours in the “death zone” | “Traffic jam”: wait or turn around |
| 2015 | On 25 April a magnitude 7.8 earthquake triggered an avalanche from Pumori onto Base Camp; 18 to 24 deaths according to different sources ([National Geographic](https://www.nationalgeographic.com/science/article/150425-everest-earthquake-basecamp-nepal-himalaya-climbing-sherpa)) | What to do in a natural disaster, helping the injured | Earthquake at Base Camp |
| 2014 | On 18 April ice fell into the Khumbu Icefall; 16 Nepali high-altitude workers died ([Alpinist](https://alpinist.com/?p=51174)) | Time in the Icefall is the main risk for Sherpas | Leader: how many trips through the Icefall the Sherpas make |
| 2012 | A Sherpa fell from a ladder into a crevasse without being clipped to the fixed ropes ([Arnette](https://www.alanarnette.com/blog/2023/04/12/everest-2023-first-deaths-of-season/)) | Clip in even on “easy” sections | Training camp: ladders |
| 1996 | On 10–11 May a storm caught people on the descent who had climbed past the turnaround time (14:00); 8 deaths within 24 hours ([Explorersweb](https://explorersweb.com/1996-everest-tragedy-30-years-later/)) | The turnaround time is not up for discussion | Historical scenario with the old Hillary Step |

Almost a third of deaths (98 of 339) happened on the descent after a summit attempt, and hired workers make up about 38% of the dead (130 of 339) ([Global Summit Guide](https://www.globalsummitguide.com/everest-safety-fatality-statistics/), [Arnette](https://www.alanarnette.com/2026/01/26/everest-by-the-numbers-2026-edition/)). That is why the descent and Sherpa safety are separate themes in the game, not background.

Principles of presentation:

- The player plays a fictional climber in a real situation (the same date, weather and crowd), not the role of a real person who died.
- The names of the dead appear only in the “History” card: facts, a source, no dramatization and no images of bodies.
- The debrief looks for the chain of decisions and conditions, not for someone to blame.
- Where sources disagree, both versions are shown.

## Graphics, sound and interface

The style is silhouettes and gradients: the mountain is drawn in layers, and light, sky and weather create the atmosphere. The graphics teach too: the snow plume above the summit shows the wind strength, and a chain of headlamps on the ridge shows a coming traffic jam.

**Graphics**

- 5–7 parallax layers: distant ranges, neighbouring peaks (Lhotse, Nuptse, Pumori), the slope, the foreground.
- The sky changes with the time of day and darkens with altitude: the higher you are, the deeper the blue.
- Particle weather: snow, drifting snow, fog, the snow plume above the summit.
- The climber is a silhouette with skeletal 2D animation; the oxygen mask, backpack, cowstails and a bright suit are visible.
- Summit night: an almost black screen, a cone of light from the headlamp and the lights of other groups.
- Hypoxia can be seen and felt: a narrowing field of view, muted colours, slower reactions. With cerebral edema the controls become imprecise, but the game stays playable.

**Sound** (synthesized in the browser, no licensed recordings)

- Wind whose strength you hear before you see it.
- Breathing that speeds up with altitude; the hiss of the regulator, which falls silent when it fails.
- The crunch of crampons, the clink of carabiners, the radio.

**Interface**

- Only what a climber can know at a glance stays on screen: clock, altimeter, bottle pressure gauge.
- Body condition is on the Tab key: symptoms in words, pulse oximeter readings, the colour of the fingers. There are no hidden “health bars”.
- The player sets the turnaround time before the summit push, and it is shown on the clock as a red mark.
- Russian and English are switched in the menu; units are metres and °C, with an option to switch to feet and °F.

## Phone and PC

The game is one web application for every device: the same build runs in a browser on a PC and on a phone. On a phone it can also be installed on the home screen as a progressive web app (PWA): its own icon, full screen, single-player without a network. Players on phones and PCs meet in the same rooms, because they run the same code against the same server.

| Option | For | Against | Decision |
| --- | --- | --- | --- |
| Browser and PWA | One code base; free; an update reaches every player at once, so a room never mixes versions; no store review | Not in the App Store or Google Play; on an iPhone, installing goes through Share → Add to Home Screen, which the game has to show | Main way |
| A store app wrapping the same web code (Capacitor) | A listing in the stores | USD 99 a year for Apple, USD 25 once for Google Play; every update waits for the stores' review, and players update when they choose, so the server has to accept the previous version for a while | Later, if a listing is needed: the same code, not a second game |
| A separate native app (Swift and Kotlin, or Unity) | The best performance | A second game to write and keep identical to the first, the simulation included | No |

Sources: [Capacitor](https://capacitorjs.com/), [Apple Developer Program](https://developer.apple.com/programs/), [Google Play Console](https://support.google.com/googleplay/android-developer/answer/6112435).

**What changes on a phone**

- **Controls.** An input layer turns keys, the mouse, touch and a gamepad into the same game actions, and the simulation sees only the actions. On a phone the left thumb walks and sets the pace; the right one has the cowstails, the jumar (hold) and the oxygen flow; the ice axe and crampons are taps on the slope. “Check yourself” and the radio are buttons, and the radio has ready phrases, because typing on a phone in the middle of a climb is slow.
- **Screen.** Climbing is in landscape; camp, menus, training cards and the debrief work in portrait too. The HTML interface adapts to the screen, and every button is at least the size of a fingertip.
- **Performance.** Target: 30 frames per second on a mid-range phone, 60 where it can. A quality setting reduces the parallax layers and the particles. In camp, when nothing moves, the frame rate drops to save the battery.
- **Interruptions.** A call, another app or a locked screen pauses the single-player game and keeps a resume point. The resume point only continues the expedition: it is overwritten as the player goes, so it cannot replay a decision, and saves stay in camps only. In co-op, leaving the game is a disconnection: the AI takes the climber to the nearest camp, and the player rejoins with the same code.
- **Saves on an iPhone.** Safari deletes a site's stored data after seven days of Safari use without a visit to the site; a web app installed on the home screen keeps its data ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). So on an iPhone the game offers to install itself, keeps the export to a file, and co-op expeditions are stored on the server.
- **Sound.** Phones start sound only after the player's first touch, so the game starts it with the first button in the menu.
- **Long sessions.** Camps already split the expedition into parts; on a phone, the game says in each camp how long the next section takes.

**Cross-play**

- The server does not know or care which device a player uses: it receives the same actions from all of them.
- The server checks the game's version when a player joins, and asks an old one to reload. An installed PWA updates on its next launch.
- No action depends on reaction speed, and pace comes from the body model, not from how fast a finger moves; the step-and-breathing rhythm has the same tolerance on every device. So a player on a phone is as strong a teammate as one on a PC.
- Tests: Playwright emulates phones (screen size, touch), so the co-op test puts a PC browser and a phone browser in one room. Before each release, the game is checked on a real iPhone and a real Android phone.

## Technical architecture

The game is a static TypeScript website that runs in the browser on a PC and on a phone and is published for free on GitHub Pages or itch.io. For co-op, a small room server on Cloudflare is added. The simulation is separate from the graphics, so it can be tested automatically and thousands of expeditions can be run to check the balance.

| Module | Responsibility | Technology |
| --- | --- | --- |
| Simulation core | Body, oxygen, weather, time, hazards; fixed time step, the same result for the same seed | TypeScript, no dependencies |
| Agent AI | Sherpas, clients, other expeditions and queues on the fixed ropes | TypeScript, simple finite-state machines |
| Slope physics | Movement over terrain, falls, ropes and belaying | Our own simple physics, rope using Verlet integration |
| Rendering | Layers, gradients, particles, animation, hypoxia effects | PixiJS (WebGL) |
| Interface | Menus, camp, training cards, debrief; adapts to the screen, PC and phone | HTML and CSS on top of the canvas |
| Input | Keys, mouse, touch and gamepad turned into the same game actions | Pointer Events, our own layer |
| Installing and offline | Install on a phone's home screen, single-player without a network, updates | PWA: web app manifest and service worker |
| Sound | Wind, breathing, footsteps, regulator | Web Audio API |
| Content and knowledge base | Route, scenarios, events, facts with sources, RU/EN texts | JSON files |
| Saves | Progress, settings, expedition history; export to a file | IndexedDB |
| Tests | Physiology models, balance, end-to-end scenarios, screenshots, on PC and phone screens | Vitest, Playwright (with phone emulation) |
| Network and rooms | Room by code, shared simulation on the server, chat, radio, reconnection | Cloudflare Workers and Durable Objects, WebSocket |

Targets: 60 frames per second on an average laptop and 30 on a mid-range phone, a download under 20 MB, works in Chrome, Firefox, Edge and Safari, and on phones in Chrome on Android and Safari on iPhone. All graphics and sound are generated in code, so no licences for third-party assets are needed.

## Development plan

Development goes from the riskiest part to the simplest: first one section and summit day, then the whole route. Every stage ends with a playable version that can be played through and shown.

**Summit push first, then the whole route: the hardest part is tested earliest.** Nine stages, with a check after the second, the third and the eighth; the diagram highlights stage 3 as the milestone.

1. **Knowledge base.** Facts with sources and check dates, questions for an expert.
2. **Prototype: Icefall.** Walking, fixed ropes, ladders, fatigue and oxygen on one section.
   - Check: re-clipping and fatigue feel plausible in playtests.
3. **Vertical slice: summit push.** South Col → summit → descent, solo and as a pair online.
   - Check: the push takes 60–90 min, and the turnaround decisions are clear.
4. **Whole route.** Trek, Base Camp, rotations and tour choice.
5. **Training and real accidents.** Modules, "In real life" cards, debriefs, 15–20 scenarios.
6. **Co-op and leader role.** Up to 4 players by code, radio, camp coordinator, NPC Sherpas.
7. **Graphics, sound, languages.** Final style, sound synthesis, RU and EN, performance.
8. **Open beta.** Free release marked "not reviewed by an expert".
   - Check: a guide and a doctor reviewed the facts and scenarios.
9. **Release 1.0.** Free on GitHub Pages or itch.io.

The phone, like the network layer, is in from the first prototype: the first playable section is played in one room from a PC and a phone. Adding touch controls and a small screen to a finished PC game costs far more.

Timelines are deliberately not given here: it is more honest to estimate them after the prototype, once the pace of work is clear.

## Open questions and risks

Eight questions need to be settled before the prototype starts or during it.

- [ ] Player money: is the tour chosen freely, or does the player have to save up for an expensive tour?
- [ ] Death: does the expedition end at once, or can the player return to the last camp?
- [ ] Is there a story and a permanent character, or does each expedition stand on its own?
- [ ] How many other expeditions and climbers are on the mountain at once (realism versus browser performance)?
- [ ] Which experts are needed: an IFMGA mountain guide for technique and a mountain medicine doctor for physiology?
- [ ] Co-op: who leads the group — one of the players or an NPC guide?
- [ ] Progress across devices: starting an expedition on a PC and going on with it on a phone needs an account or a transfer code. Which one?
- [ ] App Store and Google Play: is a listing through Capacitor needed, and when?

| Risk | Why it is dangerous | What we do |
| --- | --- | --- |
| False confidence in players | Someone decides they are ready for Everest after playing | Disclaimer; focus on decisions rather than physical technique |
| An error in the medical content | Wrong advice can cause harm in reality | Official guidelines only, no medicine doses, beta until a doctor reviews it |
| Conflicting data | Altitudes, prices and death counts differ between sources | Ranges and check dates in the knowledge base |
| Amount of work | 5–10 hours of detailed content is a lot | Vertical slice (summit push) first, everything else after |
| Sensitivity of real tragedies | Relatives of the dead may see the game as disrespectful | A fictional hero in a real situation; facts and sources only |
| Performance with crowds | Hundreds of agents can slow the browser down | Distant groups are simulated in a simplified way, in detail only near the player |
| Disconnections in co-op | A player drops out mid-route, and the expedition breaks for everyone | The simulation runs on the server, the player can rejoin with the same code; an AI takes a climber without a player to the nearest camp |
| The phone as a second-class platform | A weak phone slows down, small buttons make re-clipping fiddly, and phone players fall behind PC players | The phone is in from the first prototype; a quality setting; touch controls checked on real phones; no action depends on reaction speed |

## Sources

Medicine

- [CDC Yellow Book 2026: High-Altitude Travel and Altitude Illness](https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/high-altitude-travel-and-altitude-illness.html)
- [AAFP: Acute Altitude Illness — Updated Guidelines from the Wilderness Medical Society](https://www.aafp.org/afp/2020/0415/p505.html)
- [Firth et al., Mortality on Mount Everest, 1921–2006 (BMJ 2008)](https://pmc.ncbi.nlm.nih.gov/articles/PMC2602730)

Statistics and seasons

- [Alan Arnette: Everest by the Numbers, 2026 Edition](https://www.alanarnette.com/2026/01/26/everest-by-the-numbers-2026-edition/)
- [Alan Arnette: Everest 2026 Season Summary](https://www.alanarnette.com/blog/2026/06/02/everest-2026-season-summary-records-crowds-trash-winds/)
- [Global Summit Guide: Everest safety and fatality statistics](https://www.globalsummitguide.com/everest-safety-fatality-statistics/)
- [Explorersweb: 2023 Everest deaths totaled 18](https://explorersweb.com/everest-final-2023-death-toll-worst-ever/)
- [Explorersweb: The 1996 Everest tragedy, 30 years later](https://explorersweb.com/1996-everest-tragedy-30-years-later/)
- [Outside: Everest 2025 deaths](https://www.outsideonline.com/outdoor-adventure/everest/mount-everest-four-dead/)
- [Alan Arnette: Everest 2024 cornice collapse](https://www.alanarnette.com/blog/?p=45184)
- [Alan Arnette: Everest 2023 first deaths (Khumbu Icefall)](https://www.alanarnette.com/blog/2023/04/12/everest-2023-first-deaths-of-season/)
- [National Geographic: Traffic jams on Everest, 2019](https://education.nationalgeographic.org/resource/traffic-jams-are-just-one-problems-facing-climbers-everest)
- [National Geographic: Everest Base Camp after the 2015 earthquake](https://www.nationalgeographic.com/science/article/150425-everest-earthquake-basecamp-nepal-himalaya-climbing-sherpa)
- [Alpinist: Nepal’s earthquake aftermath (2014 and 2015)](https://alpinist.com/?p=51174)

Route, weather, oxygen

- [Alpine Ascents: Everest itinerary](https://www.alpineascents.com/climbs/mount-everest/itinerary/)
- [SummitPost: South Col / Southeast Ridge](https://summitpost.org/south-col-or-southeast-ridge/165530)
- [Mountain Project: Southeast Ridge of Everest](https://mountainproject.com/route/126778851/southeast-ridge-south-col-of-everest)
- [Alan Arnette: Oxygen on Everest](https://www.alanarnette.com/blog/?p=16718)
- [Explorersweb: Everest technology and oxygen flow](https://explorersweb.com/2021/04/07/everest-technology-safety-or-something-else/)
- [Alan Arnette: Everest 2026 weather alert (jet stream)](https://www.alanarnette.com/2026/05/18/everest-2026-weather-alert-and-more-summits/)
- [Alan Arnette: Inside the mind during the last rotation](https://www.alanarnette.com/2018/05/02/everest-2018-inside-the-mind-during-the-last-rotation/)

Altitudes for the route profile: [Tidy Himalaya](https://tidyhimalaya.com/trip/everest-expedition), [Imagine Nepal](https://imagine-nepal.com/package/mount-everest-expedition), [Hayden Rue](https://haydenrue.com/mountaineering/south-col-of-mount-everest/), [Nepal Nomad](https://nepalnomad.com/everest-expedition), [Olaf Rieck](https://www.olafrieck.de/everest/route-e.htm). Turnaround time in 1996: [EcoWatch](https://www.ecowatch.com/25th-anniversary-everest-disaster-2652940532.html).

Prices and rules

- [Alan Arnette: How Much Does It Cost to Climb Everest? 2026 Edition](https://www.alanarnette.com/blog/?p=48861)
- [Alan Arnette: Everest 2026 rumor fire season (new rules)](https://www.alanarnette.com/blog/2026/02/23/everest-2026-rumor-fire-season/)
- [Global Summit Guide: $90K vs $35K Everest](https://globalsummitguide.com/90k-vs-35k-everest-expedition-comparison/)

Co-op

- [Cloudflare: Durable Objects](https://www.cloudflare.com/developer-platform/products/durable-objects/)
- [Tech Insider: Multiplayer game servers on Cloudflare Durable Objects (2026)](https://tech-insider.org/cloudflare-durable-objects-multiplayer-game-server-2026/)
- [PeerJS: docs](https://peerjs.com/docs)
- [Advnture: The 1996 Everest disaster](https://www.advnture.com/climbing-mountaineering/what-was-the-1996-everest-disaster-the-chain-of-events-that-claimed-eight-lives-and-sparked-never-ending-controversy)

Phone

- [WebKit: Full Third-Party Cookie Blocking and More (the seven-day storage cap)](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- [Capacitor](https://capacitorjs.com/)
- [Apple Developer Program](https://developer.apple.com/programs/)
- [Google Play Console: registration fee](https://support.google.com/googleplay/android-developer/answer/6112435)
