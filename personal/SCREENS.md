# The other screens: spec

Status: v1, 2026-10-06. Built in `src/deadkernel/sidebar/` (column, header, Home, palette) and
`src/deadkernel/quietLayout/` plus the theme (conversation). Follows `SIDEBAR.md`.
Inputs: a prior-art pass (Slack, Linear, Raycast, Superhuman, VS Code, Telegram, Element); a live
technical survey of Discord's client (patch points, stores, class maps); one critique round from
Claude Fable 5.1 on redacted screenshots (Codex was out of quota), and a second Fable round on the
built screens. The decisions below say which input drove them.

The screens he looks at most, in order: the conversation, the channel list inside a server,
Home (nothing open), and Ctrl K. Each one gets the sidebar's rules: one line per row, bold is
the only unread signal, pink means "this needs you", nothing moves by itself, and anything we
replace falls back to Discord's own screen if it breaks.

## 1. Inside a server: the column

Discord's channel list shows every channel the server owns. In a dev community most of them are
noise to him. The column shows the **live** ones: selected, unread, mentioning him, opened by him
in the last 60 days, with friends in voice, or with a message in the last 30 days.

- Categories keep Discord's order. Quiet channels fold into a dim "· N" right after the category
  name, and unfold in place. A category with nothing live is one dim row. *(Fable: "quiet is a
  fold, not a filter".)*
- "Show all N quiet channels" at the end unfolds every category in place, including channels with
  no category, so the counts add up. One mechanism, not two. *(Fable r2: the old row swapped in
  Discord's tree, a second control for the same set.)*
- Discord's full tree is `> Use Discord's channel list here` (remembered per server) and the
  fallback if our model breaks. *(Element sections lesson.)*
- The right edge of a row is for pink (mentions) and teal (voice) only. Rows have no unread dot:
  bold is the signal. The strip, whose icons can't be bold, keeps dots.
- Favorites (his stars plus Discord's own pins) and friends in voice come first.
- Voice rows join on click and list who's there. Threads open beside the chat.
- **Navigation: both stay.** v1 folded the sidebar into a 48px strip that peeked open on hover.
  He found the sidebar disappearing and reappearing under the pointer terrible, so the sidebar is
  always there and the server's column opens beside it: Discord's sidebar widens by 248px and the
  column slides out from behind the sidebar's edge (240ms; the width only animates while opening
  or closing, so the resize handle stays instant). × in the column header closes it; the header's
  "server ›" crumb reopens it. The chat does resize, once, on purpose.
- **Fitting small windows:** with the column open, sidebar plus column take at most 45% of the
  window (sidebar never under 240px, never wider than he dragged it). A thread or search results
  beside the chat drop the sidebar to 240px.
- **Discord's own menus:** the column title (▾) and a right-click on any server row open Discord's
  server menu (invite, notification and privacy settings, leave), with "Mark as read" added.
  Channel rows open Discord's channel menus, where "Add to Favorites" already appears. Without the
  rail these were unreachable. "Add" in Servers is the rail's + (create, or join with an invite).

## 2. The conversation

- **Header:** a small dim "#", the channel name, a ☆ star to favourite it, the topic as one dim
  12px line (it matters in dev servers), buttons on hover, search an icon until used. "server ›"
  shows only after he has backed out of that server, as the way back in; while the column shows
  the server it would say the same thing twice. *(Fable r2.)* *(Fable: the topic carries rules in dev servers, so dim it,
  don't hide it.)*
- **Thread previews:** one dim line, "└ thread name  2 Messages ›". No box, spine or "no recent
  messages" line. The boxed preview was the last Discord-shaped element in the list. *(Fable.)*
- **Mentions:** a 2px pink edge, no wash. With the pink NEW line and the sidebar's counts, that's
  all the pink there is. *(Fable; sidebar principle "pink = needs you".)*
- **Tags:** APP/OFFICIAL become a dim lowercase word.
- **Embeds:** 400px, brand stripe replaced by a grey edge, descriptions clipped to 3 lines.
- **Replies:** one dim 12px line above the message, "↩ name  first line…". No curved spine.
- **Reactions:** 22px hairline chips, count 11px dim, his own in accent; "add reaction" only on
  the message under the pointer.
- **Composer:** a hairline across the whole chat, no box, no inset; emoji is the only button on
  the right. GIFs and stickers are tabs in the emoji picker; gift and apps are gone.
- **Chrome:** the account panel is a bar across the sidebar's bottom, not a floating card; muted
  is a pink glyph, not a red wash. The title bar has no inbox (the sidebar is the inbox; Ctrl I
  still opens Discord's).
- Not done: Fable's thread side-pane header, "threads · N" in the header, the "3 new · Jump"
  hairline bar.

## 3. Home (nothing open)

Discord's Friends page answers "who are my friends" with four tabs and an Active Now column.
Home answers "what are my people doing", in one column at reading width:

1. **In voice** (hidden when empty): one block per call his friends are in. The call's row:
   "♪ channel  server", "live" if anyone is streaming, "N in call · M friends", and a teal text
   **Join**. Under it, everyone in the call, one 28px line each: friends first (clicking one opens
   your DM), then streamers, then the rest, with "live", "cam" and "muted"/"deafened" as dim words.
   Calls he's in come first, then calls in favourited channels or with favourite people.
   In the sidebar, a favourited voice channel lists who's in it the same way, and a favourite
   person already listed there isn't shown twice.
2. **Requests** (hidden when empty): friend requests (pink count; opens Discord's Pending tab in
   place) and message requests (a dim "· N": mostly strangers, so not pink, here or in the sidebar).
3. **Online · N:** friends online, *not* already listed under In voice (one person, one place),
   with their activity ("playing X", custom status). Sorted by when he last talked to them,
   computed once, so nothing reorders under the pointer. *(Slack/Telegram presence lessons.)*
4. **Recent:** DMs from the last 30 days, 10 shown, the rest behind "N more".

Rows are 32px like the sidebar's, and the header links, Join and counts share one right edge (the
720px column's).

"All friends" and "Add friend" open Discord's own page in place with a "← Home" bar. A deep link
to a Friends tab, the setting off, or a crash all render Discord's page.
*(Prior art: Discord retired its Activity feed twice; Home is people, not a feed.)*

## 4. Ctrl K: the palette

Discord's switcher ranks well and reaches users and channels we haven't loaded, but it doesn't
know favorites, its empty state repeats stale role pings, and PROTIP and tutorial arrows show on
every open. The palette keeps **Discord's search and ranking** (`QuickSwitcherStore`) and replaces
the rest, inside the modal Discord opens, so Ctrl K stays Discord's keybind. *(Tech survey §4.5;
Fable §5.)*

- 560px, 64px from the top (Raycast, Linear, Spotlight sit high), square, flat, hairline.
- **Empty:** Recent (his last 5 places from our own log of navigations he made), DMs & mentions
  (grouped by server, as in the sidebar), Favorites. Recent comes first so Ctrl K ↵ goes back to
  where he just was, like Discord's own "previous channel". *(Slack's switcher opens on recents.)*
- **Typing:** Discord's results in our rows. Unprefixed, an exact name goes first and favorites
  ahead of the rest. Discord's prefixes `@ # ! *` still work.
- **`>` actions:** mark mentions read, favourite/unfavourite this channel, Discord's channel list
  here, mute/unmute this server, stop @everyone and role pings here, the same **in all large
  servers**, Home, message requests, Settings. *(Superhuman: a palette that only navigates becomes
  a second-class route; VS Code's `>`.)*
- **Broadcast pings, everywhere at once** *(Fable r2's top fix: eight dev servers that @everyone
  weekly make eight pink chips forever)*. It sets Discord's own "suppress @everyone/@here" and
  "suppress role mentions" on every server over 100 members that doesn't have them yet, in **one**
  request (Discord's local update per server, then its bulk save). Smaller servers are left alone:
  they're mostly friends, where "@everyone voice?" is a real ask. It changes his account's
  settings across servers, so it asks for a second ↵.
- **Keys:** ↑↓, ↵ open, ⇧↵ star/unstar, Esc clears the query and then closes (Raycast). One
  legend line at the bottom teaches them ("↵ run · esc back" in `>` mode).
- With the palette off, Discord's switcher shows without PROTIP or the tutorial arrows.

## Rules that held

- Every patch has a fallback to Discord's own component (setting off, ErrorBoundary fallback).
- Nothing marks anything read except Discord, on his click. Testing only opens read channels.
- Stores are read through selectors that return ids or JSON, so rows re-render only when
  membership or order changes.

## 5. Size and symbols (2026-10-06, after he ran it full screen on a 3440×1440 monitor)

- **The app scales with the window.** QuietLayout zooms the whole app by window height: 100% at
  720px tall or less, rising to 130% from 1300px, in 5% steps, plus an "Overall size" slider
  (80–150%). It uses Electron's own zoom (what Ctrl + does, set from QuietLayout's native.ts). A
  first try with CSS `zoom` on `<html>` put Discord's popouts zoom-times too far right and down (the
  composer's + menu landed mid-chat); real zoom keeps every menu where it belongs.
- **Room rules use real room.** A member list, thread or search results only shrink the sidebar
  when the chat would otherwise drop under ~720px; full screen keeps the width he dragged.
- **Home uses the width:** its sections flow into as many 420px columns as fit, up to three.
- **Symbols, not words:** one line-icon set (`src/deadkernel/sidebar/icons.tsx`, after Lucide)
  replaces the word controls (hover actions chat/join/call/message, mark read, add a server, Home's
  friend links, Join, live/cam/muted) and the Unicode glyphs (# ♪ ⌂ ⌕ ↩ ? ▸ ▾ ×). Every control keeps
  its name as a tooltip and an accessible label. Icons are 18px in a 24px slot (server icons were
  20px, now 24px); action buttons are 28px targets.
- Hover actions take the row's right slot: the count steps aside and the text truncates sooner,
  so the actions sit on the row rather than on a patch over it.

## 6. Palettes, density, and a calmer column (2026-10-06)

- **Palettes** (HumanLayerTheme › Palette): HumanLayer (Poimandres blue-grey, default), Midnight
  (true black for OLED, electric blue), Gruvbox (warm, retro), Nord (cool, quiet contrast), Paper
  (light, warm off-white, ink blue). A palette sets ~15 base tokens; every tint in the theme is
  `color-mix` of those tokens, so nothing is left in the old colours.
- **Density** (HumanLayerTheme › Density): Compact / Default / Comfortable sets row height
  (28/32/36px), the gap between message groups and the chat's line height.
- **The column, again:** categories with nothing live no longer show at all; one "› N quiet
  channels" row at the end unfolds every quiet channel in place under its category. A category
  with live channels says "+N" after its name, in the label's own style.
- Fixes: the member list's activity cards jumped 5px on hover (quiet scrollbars switched between
  the standard and the webkit scrollbar, which differ in width; both states are standard now).
  Vencord's NoTrack threw at startup about one load in five once window scaling changed the
  timing (it ignored the dispatcher Discord passes and used Vencord's, sometimes not resolved yet),
  and then no plugin started; it now uses Discord's.

## 7. Some life: animated images and Now (2026-10-06)

It's a social app; he asked for some pizzazz.

- **Animated avatars and server icons always play** (HumanLayerTheme › Animated avatars, on;
  off under reduced motion). Discord asks for the animated image only when a component passes
  canAnimate, mostly on hover; `humanLayerTheme/animate.ts` wraps the URL helpers (the user
  record's getAvatarURL and IconUtils' avatar and guild-icon helpers) to always ask for it, so
  Discord's chat and member list animate too. Undone when switched off.
- **Now** (a live card per favourited voice channel at the top of the sidebar) was built from his
  mockup and removed the same day: he didn't like it in use. Favourited voice channels are back to
  one row with the people in the call listed under it.

## 8. Drag to reorder servers (2026-10-06)

Servers and folders in the sidebar drag like Discord's rail: the dragged row dims and a 2px accent
line shows where it lands (above or below the row under the pointer). Dropping calls Discord's own
`GuildActionCreators.moveById` (what the rail does), so the order saves to his account and syncs
like any Discord change; dropping on a server inside an open folder moves it into the folder.
Folders themselves move the same way. No folder creation by dropping (yet).

## 9. Triage, living rows, the look from Ctrl K (2026-10-06)

- **Triage without opening.** Hover a row in DMs & mentions: a person or group gets ✓ (mark
  read) and call; a server gets ✓ (mark its mentions read) and a bell (stop @everyone and role
  pings there). Its count steps aside while you hover. Clearing a dev server's noise is one click,
  and nothing is opened, so nothing else gets marked read.
- **Rows say what people are doing.** The right slot of a conversation row reads, in order:
  "typing" (teal, static, never animated), a call or stream, then for a person their activity
  ("playing Valorant", "listening to …", custom status), dim and capped so it never squeezes the
  name. A small pencil marks a conversation with an unsent draft.
- **The look from the keyboard.** Ctrl K › "Palette: Midnight", "Density: Compact" (each with
  "current" on the one in use; palettes show a swatch of their background and accent).
- **The chat's floating bars** ("N new messages", "jump to present", the round jump button) are
  square hairline strips in the panel colour; the new messages bar keeps a 2px pink edge.

## 10. Focus, Ctrl+1–9, banners, smoother switching (2026-10-06)

- **Focus** (Ctrl K › "Focus for an hour" / "Focus until I end it"): only favourites can notify
  him: DMs from favourite people, messages in favourite channels and groups, anything a favourite
  person sends. Everything else still arrives and still counts as unread; it just doesn't pop up
  or ding. Calls and other notifications are untouched. A "Focus · only favourites notify · 42m
  left" row sits under Home while it's on; clicking it ends Focus. It filters Discord's own
  notification call, which carries the sender and channel (`sidebar/focus.ts`). Not Discord's
  Do Not Disturb, which would silence favourites too.
- **Ctrl+1…9** (Cmd on a Mac) opens favourite 1…9 in his order; a voice channel opens its chat,
  Ctrl+Shift joins it. Holding Ctrl for half a second shows the numbers over the favourites' icons.
- **Server banners:** a server with a banner shows it behind its name at the top of the column,
  fading into the column, animated if the banner is.
- **Switching conversations:** the new chat settles in (160ms fade and 4px lift); off under
  reduced motion.

## 11. Title bar and taskbar (2026-10-06)

- **Title bar:** Discord's mark and "Discord" at the left, in the dim text colour (follows the
  palette). The mark is Simple Icons' (CC0), drawn as a CSS mask.
- **Taskbar (Windows):** hovering Discord's taskbar icon shows Mute and Deafen under the preview,
  where media players put play/pause, plus Disconnect while in a call. Icons and tooltips follow
  his state (red when muted or deafened); each click is Discord's own toggle. Electron's
  thumbnail toolbar (`setThumbarButtons`) from the DeadKernel plugin's native.ts; icons are drawn
  from the same line set into 32px PNGs. DeadKernel › Taskbar switches it off; nothing on a Mac.

