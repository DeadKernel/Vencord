# Releasing DeadKernel to friends

Friends install **Accord** (`Accord-Setup.exe`): the Vesktop fork (DeadKernel/Vesktop) packaged
under its own name and icon. Soft branding: "Accord" is only what Windows shows (Start Menu,
taskbar, notification headers, installer); inside it's Discord, and no text in the app names it.
Two layers, each updating itself from its own repo's releases:

- the app shell (Electron, screen share, tray): **DeadKernel/Vesktop** releases `v<version>`,
  via electron-updater. The name and app id live in that repo's `brand.json`.
- the redesign (these plugins in a standalone Vencord build): **DeadKernel/Vencord** releases
  `dk-<date>.<n>`, via Vencord's own updater. Accord downloads it on first run.

**`main` is the shipping branch** in both forks: work happens there, and GitHub only schedules
workflows from it. Each fork's `dk-sync.yml` runs daily: Vencord's merges upstream Vencord's main
(where fixes for Discord's changes land) and Vesktop's merges upstream's latest release. Either
ships only if the merge is clean and the tests pass, else the run fails, GitHub emails, and main
is untouched. **Pull before you push**: the sync may have added a merge commit to main.

App releases: `git tag -a v2026.1007.2 -m "..." && git push origin v2026.1007.2` in the Vesktop
fork (year . month*100+day . n). `dk-app.yml` builds the installer on Windows and publishes it.
The installer isn't code-signed, so Windows SmartScreen warns once (More info > Run anyway).

Four channels, all one-way from us to their clients except telemetry, which is opt-in.

## 1. Releases (updates)

The redesign's files are a standalone Vencord build whose updater watches **DeadKernel/Vencord**'s
latest GitHub release (Vencord's own HTTP updater, `src/main/updater/http.ts`). Accord loads them
from its data folder; friends on the old route (stock Vesktop with **Vencord Location** pointed at
the unzipped DeadKernel folder) get the same files and the same updates.

To ship a build:

```sh
git tag -a dk-2026.10.07 -m "One line on what changed (shown in the release)"
git push <remote> dk-2026.10.07          # via the box, like branches
```

`.github/workflows/dk-release.yml` then builds `pnpm build --standalone` with the commit hash
pinned (`VENCORD_HASH`), and publishes release `dk-2026.10.07` titled `DeadKernel 2026.10.07
<hash>` with the four `vencordDesktop*` files and `DeadKernel.zip` (first install) as the latest
release. The title must end with the hash: that is what clients compare.

What clients do: Vencord checks at startup (on by default: update silently, then "Vencord has
been updated! Click to restart"), and the DeadKernel plugin checks again every 3 hours during long
sessions ("DeadKernel updated: <first commit line>. Click to restart.").

Fork fix: upstream compares against the default branch's HEAD, which on this fork is upstream's
`main`, so no update was ever found. `http.ts` now compares against the latest release's tag.

## 2. Announcements (notices)

`notices.json` on the **dk-notices** branch. Clients fetch it 30 seconds after start and every
3 hours, and show each notice once (as a Vencord notification; click opens `url`).

```json
{ "notices": [
    { "id": "2026-10-07-column", "title": "New: channel column", "body": "Servers now open beside the sidebar.",
      "url": "https://github.com/DeadKernel/Vencord/releases/latest", "until": "2026-10-31" }
] }
```

`id` must be unique and never reused. `until` (optional) stops showing it after that date. Push
to `dk-notices` and every client sees it within 3 hours. Friends can switch notices off in the
DeadKernel plugin.

## 3. Telemetry (opt-in)

Off unless a friend says yes to a one-time prompt (shown only by builds that have a destination).
Sends to PostHog (`src/deadkernel/core/config.ts`: `POSTHOG_KEY`, a public write-only `phc_` key;
empty means nothing is ever sent). Events, every 15 minutes and when the window is hidden:

- `dk_session_start`: build, OS, window width bucket, which DeadKernel plugins and options are on.
- `dk_usage`: counts of features used (`palette_open`, `palette_action:mute`, `server_open`,
  `quiet_unfold`, `favorite_add`, `home_view`, `voice_join`, …) and minutes covered.
- `dk_error`: errors from our components, with Discord ids and user paths stripped.

No names, Discord ids, servers, channels or message content, ever. `distinct_id` is a random
install id (resettable); events are personless (`$process_person_profile: false`). In the
PostHog project, turn on **Discard client IP data**. Friends see exactly what would be sent next,
and what was sent last, in Settings > Vencord > Plugins > DeadKernel.

To turn it on: create the project in a personal PostHog org, put its `phc_` key in `config.ts`,
release.
