# Production

Where the game runs for real: the hosting, how a release gets there, its secrets. Whoever changes the hosting keeps this page true. This is a stub: the game is to be published free as a static site on GitHub Pages or itch.io, with a small room server on Cloudflare Workers and Durable Objects for co-op ([../spec.md](../spec.md) → Technical architecture). Until the first build is published, `.github/workflows/release-tool.yml` only says so on each release PR and passes, so the release flow works from day one.

## The hosting

- **The game:** <GitHub Pages of this repository, or itch.io: the URL, whose account>.
- **The preview:** GitHub Pages of this repository: The preview, below.
- **The room server:** the Worker `everest-room`, at https://everest-room.alexalbalaeff.workers.dev, on the Cloudflare account **Everest Cloudflare (albalaeff)**, albalaeff's, on the free plan with no card ([conventions/room-server.md](conventions/room-server.md)). Each room is a Durable Object of the class `RoomObject`, stored in SQLite, the only kind the free plan runs. The preview's job deploys it (The preview, below); its address is the build's `VITE_ROOM_SERVER`.
  - **Rooms are never deleted:** a paused room waits with its climbers where they were. A room saved by a build the current one can't go on with is kept as well, and its players are told so.
  - **The free plan's daily limits** are 100,000 requests and 13,000 GB·s of Durable Objects. A room in play counts 128 MB for every second anyone's in it, so the day holds about 28 hours of rooms in play. Writes are limited too, to 100,000 rows: a room writes a few every ten seconds of play. albalaeff watches them, on the dashboard: Workers & Pages → `everest-room` → Metrics.
- **Secrets:** in the repository's Actions secrets, nothing in git. `CLOUDFLARE_API_TOKEN` is the token `everest-room-server-deploy` (Workers Scripts · Edit, no expiry), and `CLOUDFLARE_ACCOUNT_ID` the account's ID. Nobody can read them back: to change the token, albalaeff edits its rights on Cloudflare, or makes a new one and pastes it over the secret.

## The preview

Every merge into `develop` is published to https://albalaeff.github.io/Everest-Game/, to open on a PC or a phone; the page's last line names the commit. The job `preview` in `ci.yml` does it once `checks` and `secrets` pass. It deploys the room server first, `wrangler deploy` with the Cloudflare secrets and the commit as `GAME_VERSION`, then publishes the page, built with the same commit, with GitHub Pages' own actions. Between the two, a page still open on the old build is asked to reload, and says the game is being updated until the new page is published. Actions → CI → Run workflow on `develop` publishes `develop` again.

Pages is turned on once, by the repository's owner: Settings → Pages → Source: *GitHub Actions*. Each publish replaces the whole site, so a release published on GitHub Pages too needs a place of its own there, or itch.io.

## A release

A release is a PR from a `release/…` branch into `master` (PEB#510). Once its checks pass, CI puts it live on trial; a person tries it, then merges the PR to keep the release or closes it to go back. Nothing is published by hand.

1. **Cut it**, from anywhere, a phone included: open an issue with the label `release` (PEB#517); its title and body don't matter, a one-word issue does. The workflow `release-cut.yml` makes `release/<date>-NN` at `develop`'s tip (`-01`, then `-02` for the day's next; the date is UTC's) and opens its PR into `master`, then comments the PR's link on the issue and closes it: from there the release lives on its PR. One release PR at a time: while one is open, the label is refused with a comment naming it, and the issue closed. Nobody's task: `status` and the agent manager leave an issue labelled `release` out, as a `postponed` one; set the label as the issue is opened, or an agent could take it first. From a laptop with the repo, `uv run python scripts/github.py release` does the same, without the issue.
2. **CI deploys it** once `checks` and `secrets` pass: the job `deploy / release-tool` builds the release and publishes it on trial (the stub today), and puts its report on the PR.
3. **Try it.** The report says what's live and what closing the PR would do.
4. **All good: merge the PR**, with a merge commit, so `master` keeps the task commits. CI runs `confirm`: the release becomes the stable one. The ruleset "master: deployed" lets the PR be merged only once `deploy / release-tool` passed.
5. **Something off: close the PR** unmerged. CI runs `rollback`: the stable release is published again. Fix it on `develop`, then cut a new release.

## Setting up the pipeline

Once, before the first real release PR:

1. **The workflow:** replace the stub step in `.github/workflows/release-tool.yml` with the build and the publish: the static site to GitHub Pages (or itch.io's butler) from the release branch's build, and the room server with `wrangler deploy`, a Worker of the release's own beside the preview's; `confirm` and `rollback` publish the stable build again. The report goes on the PR as a comment.
2. **The secrets**, in the repository's Settings → Secrets and variables → Actions: the deploy's tokens (Cloudflare's API token, itch.io's), with the least rights that publish.
3. **The ruleset**, in Settings → Rules → Rulesets: "master: deployed", on `master`, requiring the status check `deploy / release-tool`. GitHub suggests the check once it has run on the first release PR: add it then, before that PR is merged.
4. **The release label** (PEB#517): a label `release` in the repository's labels, and a token of the owner's in the secret `RELEASE_TOKEN` (read and write access to Contents, Issues and Pull requests, for this repository only). A PR opened with Actions' own token starts no CI, so the release would never deploy. A token given an expiry needs a new one in the secret before it runs out.

## Monitoring

<What watches the site and the room server, and where their errors are read.>
