# The other screens: spec

Status: v1, 2026-10-06. Built in `src/deadkernel/sidebar/` (column, header, Home, palette) and
`src/deadkernel/quietLayout/` plus the theme (conversation). Follows `SIDEBAR.md`.
Inputs: a prior-art pass (Slack, Linear, Raycast, Superhuman, VS Code, Telegram, Element); a live
technical survey of Discord's client (patch points, stores, class maps); one critique round from
Claude Fable 5.1 on redacted screenshots (Codex was out of quota). The decisions below say which
input drove them.

The screens he looks at most, in order: the conversation, the channel list inside a server,
Home (nothing open), and Ctrl K. Each one gets the sidebar's rules: one line per row, bold is
the only unread signal, pink means "this needs you", nothing moves by itself, and anything we
replace falls back to Discord's own screen if it breaks.

## 1. Inside a server: the column

Discord's channel list shows every channel the server owns. In a dev community most of them are
noise to him. The column shows the **live** ones: selected, unread, mentioning him, opened by him
in the last 60 days, with friends in voice, or with a message in the last 30 days.

- Categories keep Discord's order. Quiet channels fold into a dim "· N" after the category name,
  and unfold in place. A category with nothing live is one dim row. *(Fable: "quiet is a fold,
  not a filter".)*
- "Show N quiet channels" at the end switches that server to Discord's full tree, remembered per
  server. Discord's tree is the escape hatch, not a mode to learn. *(Element sections lesson.)*
- Favorites (his stars plus Discord's own pins) and friends in voice come first.
- Voice rows join on click and list who's there. Threads open beside the chat.
- **Navigation:** the top-level sidebar folds into a 48px strip (unread DMs, favourite people,
  servers) and the column slides in. Resting on the strip peeks the full sidebar (300 ms dwell,
  Esc closes). He asked for "a finder-like column"; this is that, without shrinking the chat.
  *(Arc/Finder column; the chat pane never resizes, motion §6 of the critique.)*

## 2. The conversation

- **Header:** "server ›" before the channel name (click: that server's column), a ☆ star to
  favourite the channel, the topic as one dim 12px line (it matters in dev servers), buttons on
  hover, search an icon until used. *(Fable: the topic carries rules in dev servers, so dim it,
  don't hide it.)*
- **Thread previews:** one dim line, "└ thread name  2 Messages ›". No box, spine or "no recent
  messages" line. The boxed preview was the last Discord-shaped element in the list. *(Fable.)*
- **Mentions:** a 2px pink edge, no wash. With the pink NEW line and the sidebar's counts, that's
  all the pink there is. *(Fable; sidebar principle "pink = needs you".)*
- **Tags:** APP/OFFICIAL become a dim lowercase word.
- **Embeds:** 400px, brand stripe replaced by a grey edge, descriptions clipped to 3 lines.
- **Composer:** a flat line; emoji is the only button on the right. GIFs and stickers are tabs in
  the emoji picker; gift and apps are gone.
- Not done: Fable's thread side-pane header, 20px reaction chips, the "3 new · Jump" hairline bar.

## 3. Home (nothing open)

Discord's Friends page answers "who are my friends" with four tabs and an Active Now column.
Home answers "what are my people doing", in one column at reading width:

1. **In voice** (hidden when empty): one row per call his friends are in: avatars, names,
   "♪ channel · server", and **Join** at the right. The row opens the channel; only Join joins.
2. **Requests** (hidden when empty): friend requests (opens Discord's Pending tab in place) and
   message requests.
3. **Online · N:** friends online, *not* already listed under In voice (one person, one place),
   with their activity ("playing X", custom status). Sorted by when he last talked to them,
   computed once, so nothing reorders under the pointer. *(Slack/Telegram presence lessons.)*
4. **Recent:** DMs from the last 30 days, 10 shown, the rest behind "N more".

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
- **`>` actions:** mark mentions read, favourite/unfavourite this channel, show every/only live
  channels here, stop @everyone and role pings here, Home, message requests. *(Superhuman: a
  palette that only navigates becomes a second-class route; VS Code's `>`.)*
- **Keys:** ↑↓, ↵ open, ⇧↵ star/unstar, Esc clears the query and then closes (Raycast). One
  legend line at the bottom teaches them.
- With the palette off, Discord's switcher shows without PROTIP or the tutorial arrows.

## Rules that held

- Every patch has a fallback to Discord's own component (setting off, ErrorBoundary fallback).
- Nothing marks anything read except Discord, on his click. Testing only opens read channels.
- Stores are read through selectors that return ids or JSON, so rows re-render only when
  membership or order changes.
