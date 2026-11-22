# Production

Where the game runs for real: the hosting, how a change gets there, its secrets. Whoever changes the hosting keeps this page true. The game is published free as a static site on GitHub Pages, with a small room server on Cloudflare Workers and Durable Objects for co-op ([../spec.md](../spec.md) → Technical architecture): every merge into `main` goes live (GitHub flow, #300).

## The hosting

- **The game:** GitHub Pages of this repository, https://albalaeff.github.io/Everest-Game/: The game, below.
- **The room server:** the Worker `everest-room`, at https://everest-room.alexalbalaeff.workers.dev, on the Cloudflare account **Everest Cloudflare (albalaeff)**, albalaeff's, on the free plan with no card ([conventions/room-server.md](conventions/room-server.md)). Each room is a Durable Object of the class `RoomObject`, stored in SQLite, the only kind the free plan runs. The job that publishes the game deploys it (The game, below); its address is the build's `VITE_ROOM_SERVER`.
  - **Rooms are never deleted:** a paused room waits with its climbers where they were. A room saved by a build the current one can't go on with is kept as well, and its players are told so.
  - **The free plan's daily limits** are 100,000 requests and 13,000 GB·s of Durable Objects. A room in play counts 128 MB for every second anyone's in it, so the day holds about 28 hours of rooms in play. Writes are limited too, to 100,000 rows: a room writes a few every ten seconds of play. albalaeff watches them, on the dashboard: Workers & Pages → `everest-room` → Metrics.
- **Secrets:** in the repository's Actions secrets, nothing in git. `CLOUDFLARE_API_TOKEN` is the token `everest-room-server-deploy` (Workers Scripts · Edit, no expiry), and `CLOUDFLARE_ACCOUNT_ID` the account's ID. Nobody can read them back: to change the token, albalaeff edits its rights on Cloudflare, or makes a new one and pastes it over the secret.

## The game

Every merge into `main` is published to https://albalaeff.github.io/Everest-Game/, to open on a PC or a phone; the page's last line names the commit. The job `preview` in `ci.yml` does it once `checks` and `secrets` pass. It deploys the room server first, `wrangler deploy` with the Cloudflare secrets and the commit as `GAME_VERSION`, then publishes the page, built with the same commit, with GitHub Pages' own actions. Between the two, a page still open on the old build is asked to reload, and says the game is being updated until the new page is published. Actions → CI → Run workflow on `main` publishes `main` again. A merge that breaks the game is undone with a PR that reverts it.

Pages is turned on once, by the repository's owner: Settings → Pages → Source: *GitHub Actions*; its environment, `github-pages`, takes deploys from `main` only (Settings → Environments). Each publish replaces the whole site.

## A release elsewhere, later

When the game goes to itch.io too, a release can be a tag on `main`, which a workflow builds and uploads with butler, beside the room server's Worker of its own; nothing builds one yet. `main` stays the only long-lived branch (#300).

## Monitoring

<What watches the site and the room server, and where their errors are read.>
