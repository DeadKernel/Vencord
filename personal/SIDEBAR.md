# The sidebar: spec

Status: v1, 2026-10-06. Replaces Discord's server rail and channel list with one sidebar.
Inputs: `DESIGN.md`; Codex (gpt-6-astra) critique round 1; prior-art passes on Slack, Linear,
Arc, Superhuman, Telegram, Element, Zulip, Discord 2023–2026 and third-party clients; a live
technical survey of Discord's client. The decisions below cite which input drove them.

## What it's for

One glance answers three questions, in this order:
1. **Does anything need me?** A DM, or a mention under Discord's own rules.
2. **Where are my people?** Who's talking to me, who's in voice.
3. **Where's everything else?** My servers, their activity at a glance, one click to their channels.

## Principles (each one learned from someone's mistake)

1. **No second notification system.** Every bold, count and "needs you" comes from Discord's read
   state, and only Discord marks things read (by you opening them). Two inboxes that clear
   differently is the worst outcome. *(Codex #1; Slack Activity 1.0 "pogo-sticking"; Element
   "Unreads is empty but there are notifications".)*
2. **Keep the servers visible.** Slack hid its workspace switcher behind one icon in 2023 and had
   to restore it within six weeks: people need to see *which* place has something. Servers stay a
   visible list, not a directory. *(Slack walkback; Codex's "All servers ›" rejected for this.)*
3. **Familiar nouns, no new model to learn.** Arc's Spaces were used by about 5% of daily users.
   Sections are named Direct, Favorites, Messages, Servers. *(Arc "novelty tax".)*
4. **Sections, not filters.** Element replaced sections with filters in 2025 and restored sections
   in 2026. *(Element room list.)*
5. **Presence beside people, not in a feed.** There's no "Now" section: friends in voice show on
   their own rows, and a server with people in voice shows it on its row. Telegram's Stories
   strip and Discord's ICYMI feed both drew backlash or were retired. *(Codex; Telegram; Discord
   ICYMI retired 2026-04.)*
6. **Quieter than the content.** The sidebar is dimmer than the chat: fewer icons, smaller,
   no coloured icon backgrounds, fewer separators. *(Linear 2024 and 2026 redesigns.)*
7. **Stable where you organise, recent where you don't.** Favorites never reorder themselves;
   Messages sort by latest activity; servers keep your order. Nothing reorders under the
   pointer. *(Codex sort table; Arc pinned vs today.)*
8. **Breakage falls back to stock Discord.** *(Third-party clients: Ripcord rotted; BetterFolders'
   regex fails today.)*

## Layout

```
┌─ sidebar (Discord's resize handle, 264–432 px; default 300) ──┐
│ ⌕ Jump to…                                  Ctrl K           │  opens Discord's quick switcher
│                                                               │
│ DIRECT                                                    3   │  only when non-empty
│   ▪ kai                                                   2   │  unread DM
│   mastra / #help                                          @1  │  mention
│                                                               │
│ FAVORITES                                                     │  manual, stable
│   ▪ squad                              voice · 3              │  group DM in a call
│   ▪ maya                               ●                      │
│   bun / #help                                                 │  bold when unread
│                                                               │
│ MESSAGES                                         Friends  ⟶   │
│   ▪ jordan                                                    │  recent first, one line
│   ▪ riot                               in voice               │
│   Show 14 quiet conversations                                 │  >30 days, not unread
│                                                               │
│ SERVERS                                                       │  your rail order + folders
│   ▫ mastra                                                @2  │  bold = unread, pink = mentions
│   ▫ squad                              voice · 2              │  people in voice
│   ▸ dev (folder)                                              │
│   + 6 muted                                                   │  muted collapse (Zulip)
├───────────────────────────────────────────────────────────────┤
│ [Discord's call panel, restyled] [account panel, slim]       │  untouched in step 1
└───────────────────────────────────────────────────────────────┘
```

Drilled into a server (click its row):

```
│ ⌕ Jump to…                                  Ctrl K           │
│ ▪kai 2  ▪maya  · 1 mention                                    │  "needs you" strip stays (Codex #2)
│ ← mastra                                                  ⋯   │  back to the top level; ⋯ = server menu
│ [Discord's own channel tree for mastra: categories, threads,  │
│  voice members, onboarding, Channels & Roles, everything]     │
```

## Behaviour

**Direct.** Lists unread DMs and group DMs (`PrivateChannelReadStateStore`), plus channels with
a mention count (`ReadStateStore.getMentionChannelIds()`). Discord's mention rules decide what
counts, so per-server "suppress @everyone" settings are respected. One row per conversation,
oldest first, so you work through it top-down. Rows leave only when Discord marks them read.
The section is hidden when empty. Discord's own Inbox (title bar) remains for history.

**Favorites.** Anything can be added with right-click › Add to Favorites: a person, a group DM, a
channel or a thread. Our own Favorites lists show their own Remove option. Manual order, with
Move up and Move down in the menu and drag later. Stored in plugin settings keyed by user id, so
they travel with Vencord backups and cloud sync. Rows show the server name for channels
("bun / #help"); six identical `#general` rows are a failure.

**Messages.** DMs and group DMs in Discord's sort order (latest activity). It shows conversations
from the last 30 days, anything unread, and the open one. The rest sit behind "Show N quiet
conversations". Message requests show as one row when there are any. "Friends ⟶" opens the
Friends page.

**Servers.** Your rail order and folders (`SortedGuildStore`); folders are collapsible.
- Signals: bold if unread, ignoring muted channels; a pink count for mentions; teal
  "voice · N" when people are in voice.
- Muted servers sit behind "+ N muted" unless they have a mention.
- Click: drill in, and open the server's last channel, exactly like clicking a server icon today.
- Drilled in: Discord's real `GuildSidebar` renders below a "← name" header. The "needs you" strip
  above it keeps DMs and mentions visible while you work in a server.
- Back: "← name", or Alt+←. Going back returns the sidebar to the top level without changing the
  open conversation.
- Navigating into a server any other way (Ctrl+K, a link) drills in automatically; opening a DM
  returns to the top level.

**Presence.** People rows show a status square (online teal, idle yellow, DnD pink, offline none)
and, when it applies, one muted word: `in voice`, `streaming`, `voice · N` (group call). Playing
a game is not shown on rows: it isn't an invitation. Nothing pulses or reorders.

**Pointer and keyboard.**
- Click opens. Right-click opens Discord's real menu for that thing, plus Add to / Remove from
  Favorites. Rows are focusable buttons: ↑/↓ move, Enter opens. Focus never opens or marks read.
- Ctrl+K is Discord's switcher. Alt+↑/↓ (Discord's own) still walks channels. Alt+Shift+↑/↓
  still jumps unreads.
- Esc: our surfaces never take Esc away from Discord.

## Visual spec (HumanLayer tokens; 13px IBM Plex Mono)

| Element | Spec |
|---|---|
| Sidebar | bg `#252836`, right hairline `#303340`, width from Discord's handle |
| Section label | 11 px, 600, uppercase, .05em, `#6b7394`, 28 px tall (16 px top padding), 12 px side |
| Row | 28 px tall, 0 10 px padding, 8 px icon gap, 13/20 px text |
| Row text | read `#8990b3`, unread `#e4f0fb` 600, muted `#6b7394` (not opacity) |
| Selected | `#add7ff` text, 15% accent wash, 2 px accent left edge |
| Hover | `rgb(166 172 205 / .06)`, 80 ms |
| Focus | 2 px `#add7ff` outline, inset, distinct from selected |
| Count | pink `#d0679d` square, text `#1b1e28`, 11 px 600, min 16 px, 0 4 px; `@` prefix for mentions in channels |
| Avatar | people 20 px square; group DMs 20 px square icon; status 6 px square bottom-right with 2 px sidebar-colour ring |
| Server icon | 16 px square, greyscale 40% until hover, selected or mentioned |
| Presence word | 11 px `#6b7394`; voice in teal `#5de4c7` |
| Section gap | 12 px |
| Disclosure | 120 ms, no fade on lists, reduced motion respected |

Empty states are one muted line, never art:
- Direct is hidden when empty.
- Favorites: "Right-click anything › Add to Favorites".

## Build steps

1. **Shell (this step).** The patch, top level (Direct, Favorites, Messages, Servers), drill-in
   with Discord's GuildSidebar, the "needs you" strip, Ctrl+K row, right-click Favorites, live
   toggle, fallback.
2. **Craft pass.** Keyboard roving focus, drag reorder, folder memory, Discord's real row context
   menus everywhere, thread rows in Favorites showing parent unread.
3. **Call bar and threads.** Replace the RTC panel with a two-line call bar; threads open beside
   the chat (Discord's Split View) by default.

## Open questions for round 2
- Is the "needs you" strip enough to keep people visible while drilled in, or should Favorites
  stay above the server tree too?
- Should Direct be oldest-first (a queue) or newest-first (a feed)?
- Should Direct include channels where only `@everyone`/`@here` pinged you, if the server doesn't
  suppress them? (v1: follows Discord.)
