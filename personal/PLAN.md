# Aditya's Discord client: plan

Last updated 2026-10-06. One of two independent tracks; the other is Sightline (private
repo `DeadKernel/sightline`, see its `docs/PLAN.md`). Each gets built regardless of how
the other goes.

## Goal

A Discord client Aditya daily-drives on Windows and Mac, cut down to what he actually uses.
What he hates about Discord is bloat: features he never touches, cluttered UI, bad
notifications. His version hides most of it behind toggles and feels closer to Slack.
Design language: HumanLayer's (`personal/themes/humanlayer/tokens.md`).

## The three layers

| Layer | Repo | What changes there |
|---|---|---|
| Discord's web client | none (loaded from discord.com) | nothing directly |
| Vencord: mods inside Discord | `DeadKernel/Vencord` (this repo) | almost everything: hiding things, toggles, layout, notification rules, the theme |
| Vesktop: the desktop app around it | `DeadKernel/Vesktop` | native bits: name/icon, tray, native notifications, loading this Vencord build |

Both forks are public; nothing in them needs hiding. Never commit a Discord token, server
IDs, message logs or any other personal data.

Personal work lives in `personal/` (and our plugins in their own folder) so upstream merges
stay easy. Upstream remotes are set up in both clones (`upstream/main`).

## What exists

- **HumanLayer theme** (`personal/themes/humanlayer/`): written and checked live in
  Discord stable with BetterDiscord on 2026-10-06. Class names came from Discord's live
  JS bundles that day; they rotate, so selectors prefer `[class*="name_"]` with a hash
  fallback. Also covers declutter: Nitro/Shop/Quests in DMs, the gift button, the boost
  bar, Active Now, avatar decorations.
- **`personal/tools/cdp.mjs`**: evaluates JS in, screenshots, clicks and hot-swaps CSS in a
  Discord started with `--remote-debugging-port=9222` (or our Vesktop on 9223 with
  `CDP_PORT=9223`). This is how the theme was verified. From the box: `pc forward 9222` then
  run it against localhost.

## Decisions so far

2026-10-06, milestones 1 to 3:

- **Running next to Discord.** `personal/tools/vesktop-dev.ps1` runs the Vesktop fork from
  source with this repo's `dist/` and its own profile, `%APPDATA%esktop-deadkernel`. Two
  small changes in the Vesktop fork (branch `dk/side-by-side`): `VENCORD_USER_DATA_DIR` also
  moves Electron's userData (an installed Vesktop already uses `%APPDATA%esktop`), and
  `VESKTOP_SIDE_BY_SIDE=1` leaves the `discord://` link handler with the real Discord. Rich
  Presence (arRPC) is off in that profile. CDP on port 9223 (`CDP_PORT=9223` for the tools).
- **Dev builds use `pnpm build --disable-updater`.** Vencord's git updater would otherwise
  `git pull` and rebuild in this checkout by itself. Upstream sync is milestone 8.
- **Our plugins live in `src/deadkernel/`.** `src/userplugins` is gitignored, so the build
  globs this folder too (one line in `scripts/build/common.mjs`).
- **The theme ships as a plugin.** `HumanLayerTheme` is on by default and can be switched off
  in Plugins. The CSS stays in `personal/themes/humanlayer/`, so the same file still works as a
  BetterDiscord or Vencord theme. Fonts still come from Google Fonts. If we want no
  third-party request at startup, bundle IBM Plex Mono later.
- **Theme re-verified in Vesktop.** Added Discord's newer semantic variables, fixed stale
  selectors and widened menus for the monospace font. `personal/tools/selector-check.mjs`
  lists selectors that match nothing on the current page; run it after Discord updates.
- **Screenshots in this repo are redacted.** Use `personal/tools/redact.css` and look at every
  image before committing it.
- **Viewing channels marks them read**, and that syncs to his main Discord. When testing on his
  account, only open channels with no unreads that are on his channel list.
- **Audit:** `personal/AUDIT.md`, waiting for his marks.

## Milestones

1. **Build and run.** Build this Vencord and the Vesktop fork, point Vesktop at our Vencord,
   run it on the Windows PC next to his current Discord.
2. **Theme in.** Ship the HumanLayer theme as the default; re-verify with cdp.mjs.
3. **The audit (with Aditya).** Walk every Discord surface; he marks each keep / hide behind
   a toggle / change. The result becomes `personal/AUDIT.md` and the spec for 4 to 6.
4. **Declutter plugin.** One settings page of toggles, one per thing from the audit.
5. **Slack-like layout.** Sidebar sections, a single unread inbox view, quieter defaults.
6. **Notification rules.** His filters and summaries instead of Discord's.
7. **Builds he can daily-drive.** Windows and macOS, his own update channel (GitHub releases).
8. **Upstream sync.** Automated merge of Vencord/Vesktop upstream with a build check, so
   staying current isn't a chore.

## Moving off BetterDiscord

- The HumanLayer theme carries over as is.
- YABDP4Nitro (a BetterDiscord plugin) won't run. Vencord's FakeNitro is the equivalent, but
  plugins that fake paid features are the riskiest kind; his call.

## Later: meeting Sightline

- A "Go live with Sightline" button and a viewer panel, talking to Sightline's desktop app
  over a localhost API. Sightline's app owns native notifications, hotkeys and the overlay.
- Friends need nothing from this client: a Discord bot posts a Watch link that opens in any
  browser.
- Phone: a companion app talking to an always-on host running Discord's web client with
  this plugin layer. That keeps Discord seeing an ordinary web session. Voice on the phone
  stays in Discord's own app at first.

## Ground rules

- Plugins act on Discord only on a human action, at human pace. No automation, no self-bot
  behaviour. That's what keeps the account safe.
- Test on the Windows PC via `pc` from the box; it isn't always on.
