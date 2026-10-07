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
- **Audit marked by Claude** from his notes (HumanLayer + Maeda per agent-review's
  DESIGN-LANGUAGE.md, "no pill UI / single-line rows" from Sero feedback, Slack structure),
  at his request. He can change any mark. The direction is written down in `personal/DESIGN.md`.
- **Three plugins, three jobs:** `HumanLayerTheme` (look), `Declutter` (what's shown, 34 toggles,
  milestone 4), `QuietLayout` (structure: square rail, one-line rows, plain names, quiet
  sidebar, small avatars, no motion; the first part of milestone 5). All default on.
- **Gate CSS on `data-*` attributes on `<html>`, never classes:** Discord rewrites
  `<html>`'s className on focus and theme changes.
- **Menu items are removed by id** through a global context-menu patch (`${navId}-${id}` is their
  DOM id), not hidden with CSS, so keyboard navigation and separators stay right.
- **Join/boost system messages:** a MutationObserver tags message rows with
  `data-dk-noise` from MessageStore types, and CSS hides them. CSS can't see message types.
- **FakeNitro: on, his call** (he accepts the account risk). It's set in the dev profile to
  match his YABDP4Nitro use (emoji at 64px, Nitro-quality streams, no stickers). It isn't a
  build default, so a new machine needs it switched on once (or Vencord Cloud sync).
- **Quiet v2, the same day:** he found v1 not radical enough. `DESIGN.md` now splits friends
  (DMs keep avatars and colour) from developer communities (text only, reading width, no
  notices). The rail is grey with pink mention dots. The title bar is empty, header buttons
  appear on hover, the composer is flat, the DM list is recent and has no bots.
- The theme no longer hides anything; Declutter does.
- **The sidebar (milestone 5's core), 2026-10-06.** He asked for a real layout change, designed
  from first principles with research and an argument with OpenAI's best model. Research
  (Slack, Linear, Arc, Superhuman, Telegram, Element, Zulip, Discord 2023–26, third-party
  clients) and two Codex (gpt-6-astra, via `codex exec` on the box) rounds are summarised in
  `personal/SIDEBAR.md`. Built as the `Sidebar` plugin: one webpack patch swaps Discord's rail
  and channel list; Discord's own channel tree is reused inside a server; patch failure or a
  crash falls back to stock Discord; a live toggle switches back.
- **Lesson:** never touch Vencord's `React` (or other `@webpack/common` exports) at module
  load. `React.memo` at top level threw before Vencord started and took every plugin down.
- **The other screens, 2026-10-06** (`personal/SCREENS.md`). He loved the sidebar and asked for
  the same treatment of the screens he uses most. Built: the live-channel column inside a server
  with the folding strip and peek; the conversation header (server crumb, favourite star, dim
  topic); Home instead of the Friends tabs; Ctrl K as our palette on Discord's search; and
  message-list craft (one-line thread previews, pink mention edge, quiet tags, emoji-only
  composer). Critique by Claude Fable 5.1 on his second Claude account while Codex was out of
  quota.
- **Persistent columns and a test loop, 2026-10-06.** He disliked the hover-peek strip, so the
  sidebar and the server column are both always shown. Home's calls list who's in them and who's
  live. Discord's own server and channel menus open from our rows. `personal/tools/smoke.mjs`
  checks 45 things over CDP (safe: only opens read channels, restores settings); run it after
  any Discord update. `personal/tools/pack-friends.mjs` builds a zip for friends (stock Vesktop >
  Developer Options > Vencord Location) after proving none of his ids are in the bundle.
- **Lesson:** an effect must never return a value: `scrollIntoView` returns a Promise in this
  Chromium, React called it as a cleanup, and the sidebar crashed on switching servers.
- **Discord's own surfaces, 2026-10-07.** `personal/tools/sweep.mjs` opens 14 of Discord's own
  surfaces under our changes and checks each one: emoji/GIF pickers, profile and status
  popouts, pins, inbox, shortcuts, image viewer, menus, the screen-share picker with 12 fake
  sources, settings, the Friends page. Each must fit the window, sit clear of the title bar, and
  scroll to its end. It found one real bug: hiding the title bar's Inbox with `display: none`
  left Ctrl I's popout anchored at (0,0), over the title bar. The button is now invisible but
  still laid out. The screen-share picker scrolled fine in every test. The GIF picker isn't
  scrolled (it streams dozens of videos); his PC crashed in a GPU reset during this session,
  probably not ours, but no need to load it.
- **App icon, 2026-10-07.** The dev build runs a bare `electron.exe`, so Windows showed
  Electron's icon, and it borrowed the installed Vesktop's app id. Side by side, the Vesktop fork
  now uses its own icon: Discord's mark in the accent on the theme's dark, unlike the real app's
  blurple. Drawn by `personal/tools/make-icon.mjs`, which also sets the tray icon through
  Vesktop's custom tray slot. Its own app id is `DeadKernel.Discord`, and a Start Menu shortcut
  "Discord (DeadKernel)" runs `vesktop-dev.ps1`. Windows takes notification names and pinned
  buttons from that shortcut. Friends on stock Vesktop keep Vesktop's icon.
- **Next for milestone 5:** a Slack-style unread view in the sidebar, the "Suggested" block,
  subscription-locked channels, Nitro-locked emoji in pickers.

## Milestones

1. **Build and run.** Build this Vencord and the Vesktop fork, point Vesktop at our Vencord,
   run it on the Windows PC next to his current Discord.
2. **Theme in.** Ship the HumanLayer theme as the default; re-verify with cdp.mjs.
3. **The audit.** Done 2026-10-06: `personal/AUDIT.md`, marked by Claude, open to his edits.
4. **Declutter plugin.** Done 2026-10-06: `src/deadkernel/declutter/`, one toggle per audit item.
5. **Slack-like layout.** Started: `src/deadkernel/quietLayout/`. Still to do: the single unread
   inbox view in the sidebar.
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
