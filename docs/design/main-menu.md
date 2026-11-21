# Main menu design

The animated main menu was designed on a Design canvas on claude.ai (Alex's: https://claude.ai/artifact/7ZJSZMYy3rh9BycwxGeNLF, artboard `Main.dc.html`, 16 Nov 2026) and approved as it stands. It is built in the game: issue #248, pull request #249 (https://github.com/albalaeff/Everest-Game/pull/249), merged into `develop` on 17 Nov.

## What it shows

- Everest, Lhotse and Nuptse before dawn, seen from above Kala Patthar, with the South Col route from Base Camp to the summit drawn as the fixed rope's orange line.
- The game's real start options, in the game's button style: Alone, Start over, Together: a new room, Room code + Join.

## How the picture is built

- An elevation to true scale: 0.17 px per metre both across and up, in a 1600 × 900 scene (drawn from x = -280 to 1880 for ultrawide screens). Height on screen is altitude; the summit is at (860, 160).
- Places are projected along bearing 105° (looking east-south-east). Metres to the right of the summit: Base Camp 21, Camp 1 1,243, Camp 2 1,451, Camp 3 2,067, South Col 1,492, Balcony 714, South Summit 269, Hillary Step 150, Lhotse 2,620, Nuptse 3,235, West Shoulder -200, Lho La -1,198, Changtse -3,655.
- Light: the sun rises left of the view in May, so the glow, the rim light and the first light on the summit are on the left; the plume blows left on a south-westerly.
- Type: Jost, which has Cyrillic.

## What moves

- Once, on load: the route draws from Base Camp to the summit in 7 s, each camp's mark and name appearing as the line reaches it; the night turns to dawn over about 45 s.
- Always: headlamps climbing the summit ridge and the Icefall, tents flickering, the plume, stars, mist, falling snow, prayer flags, a glint running up the rope.
- With reduced motion set, nothing moves and the finished dawn picture shows.

## In the game (PR #249)

- The picture is drawn in code as SVG by `src/page/menu/` (`Elevation`, `Ridgeline`, `Skylines`, `Massifs`, `Face`, `MenuMountains`, `RouteMap`, `MenuSky`, `MenuLights`, `MenuFlags`, `MenuPicture`); `StartMenu` shows it behind the same choices. Words: `content/menu.json`, EN and RU. Styles: the block "The main menu (#248)" in `src/style.css`.
- The altitudes are the game's own, read from the knowledge base as the altimeter reads them: Base Camp 5,340 m, Camp 1 5,883 m, Camp 2 6,377 m, Camp 3 7,285 m, South Col 7,968 m, Balcony 8,391 m, South Summit 8,720 m, Hillary Step 8,790 m, summit 8,849 m. The canvas still shows the design's round figures.
- Left out of the design: the EN/RU switch (waits for issue #89), the 8,000 m "death zone" line (the knowledge base has no record for it) and the "Beta" line (the disclaimer already says it).
- Changed copy: under Together it says "Friends join with the room's code"; under Alone, "You and Pemba, your Sherpa", Pemba's name read from the Sherpa's texts.
- New dependency: `@fontsource-variable/jost`, bundled, nothing fetched from another site.
