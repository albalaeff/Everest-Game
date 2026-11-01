# Production

Where the app runs for real, with its real names: the host, how a release gets there, the pipeline's keys and secrets, backups, logs and monitoring. Whoever changes the host keeps this page true. This is a stub: the shape of PEB#510's pipeline, with the host's own facts to fill in. Until a host exists, `.github/workflows/release-tool.yml` only says so on each release PR and passes, so the release flow works from day one.

## The host

- **Where:** <the provider, the region, the OS, the size>.
- **Access:** <`ssh <user>@<host>`, keys only; the firewall's rules>.
- **The app's public side:** <the domain, the reverse proxy and its TLS, which paths reach the app>.
- **The code:** <the checkout on the host, detached at the live release, with a read-only deploy key to GitHub>.
- **Settings:** <`.env.prod` on the host, never in git; which secrets were generated there and where a copy is kept>. A line in it pins its setting (README → Configuration, PEB#564).
- **The containers:** <the compose file and its services>.

## A release

A release is a PR from a `release/…` branch into `master` (PEB#510). Once its checks pass, CI puts it live on trial; a person tries it, then merges the PR to keep the release or closes it to go back. Nothing is done on the host by hand.

1. **Cut it**, from anywhere, a phone included: open an issue with the label `release` (PEB#517); its title and body don't matter, a one-word issue does. The workflow `release-cut.yml` makes `release/<date>-NN` at `develop`'s tip (`-01`, then `-02` for the day's next; the date is UTC's) and opens its PR into `master`, then comments the PR's link on the issue and closes it: from there the release lives on its PR. One release PR at a time: while one is open, the label is refused with a comment naming it, and the issue closed. Nobody's task: `status` and the agent manager leave an issue labelled `release` out, as a `postponed` one; set the label as the issue is opened, or an agent could take it first. From a laptop with the repo, `uv run python scripts/github.py release` does the same, without the issue.
2. **CI deploys it** once `checks` and `secrets` pass: the job `deploy / release-tool` runs the release tool on the host over SSH and puts its report on the PR. The tool: builds the release's image while the live one runs on; rehearses a release's migrations on a copy of the live database (up, down, up again), and touches nothing if they fail; backs the database up, switches, starts everything; checks every container, the health endpoints, a few minutes of logs; and rolls back by itself when a check fails.
3. **Try it.** The report says what's live, its migrations, and what closing the PR would do.
4. **All good: merge the PR**, with a merge commit, so `master` keeps the task commits. CI runs the tool's `confirm`: the release becomes the stable one. The ruleset "master: deployed" lets the PR be merged only once `deploy / release-tool` passed.
5. **Something off: close the PR** unmerged. CI runs `rollback`: the database goes back as the report said, then the stable release starts again. Fix it on `develop`, then cut a new release.

## Setting up the pipeline

Once, before the first real release PR. CI reaches the host with a key of its own that can run the release tool and nothing else; the host reads the release branches from GitHub with a deploy key that can't write.

1. **CI's key**, on your machine, in a folder outside the repo: `ssh-keygen -t ed25519 -N "" -C "<app> CI" -f ci_key`.
2. **The host's deploy key**, on the host: `ssh-keygen -t ed25519 -N "" -C "<app> host" -f /root/.ssh/deploy_key`; its `.pub` goes on GitHub under the repository's Settings → Deploy keys, with **Allow write access** off. A `Host` entry in `/root/.ssh/config` makes the host's git use it.
3. **The tool** on the host, from `develop`, on the host's own Python: a single file with the standard library only, installed as `/usr/local/bin/<app>-release`, with `deploy SHA`, `confirm SHA`, `rollback SHA` and `status`. Each confirmed release brings its own copy.
4. **CI's key on the host**, for the tool only: a line in `/root/.ssh/authorized_keys` made of `restrict,command="/usr/local/bin/<app>-release" ` and the one line of `ci_key.pub`.
5. **The host's key, for CI to know it:** `echo "<host> $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"` on the host prints the `known_hosts` line.
6. **The secrets**, in the repository's Settings → Secrets and variables → Actions: `PROD_SSH_KEY` (the whole of `ci_key`) and `PROD_KNOWN_HOSTS` (the line of step 5). Then delete the key files: a new key replaces them any time.
7. **The workflow:** replace the stub step in `.github/workflows/release-tool.yml` with the SSH call (`ssh -i ~/.ssh/prod -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes <user>@<host> "$COMMAND $SHA" > report.md`), the keys written from the secrets first, and the report posted on the PR with `gh pr comment --body-file report.md`.
8. **The ruleset**, in Settings → Rules → Rulesets: "master: deployed", on `master`, requiring the status check `deploy / release-tool`. GitHub suggests the check once it has run on the first release PR: add it then, before that PR is merged.
9. **The release label** (PEB#517): a label `release` in the repository's labels, and a person's fine-grained token in the secret `RELEASE_TOKEN` (read and write access to Contents, Issues and Pull requests, for this repository only). A PR opened with Actions' own token starts no CI, so the release would never deploy. A token given an expiry needs a new one in the secret before it runs out.

## Backups

<What's dumped nightly, where, how many are kept; how to check a dump; how to restore.>

## Logs

<Where the containers' logs go, how long they're kept, how to read them.>

## Monitoring

<The health endpoint and what watches it; how to read the errors.>
