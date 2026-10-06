# Design direction

Discord as a quiet, Slack-shaped workspace. The material is HumanLayer's
(`themes/humanlayer/tokens.md`); the discipline is Maeda's laws of simplicity, the same pair
as `agent-review`'s DESIGN-LANGUAGE.md. When something here conflicts with Discord's defaults,
this wins.

## Who it's for

Two modes, one client:

- **Friends:** DMs, a friends' server, voice. People matter here, so DMs keep avatars, and
  unread DMs stay in colour in the rail. Presence and "in voice" stay visible.
- **Developer communities, for work:** big servers full of strangers, help channels, threads,
  links. Text matters here, so server chat is names and text only, at a reading width,
  with no thread or join notices, and embeds kept small.

## Rules

1. **Reduce.** If it isn't used every week, it's hidden behind a toggle. Promotions, paid
   cosmetics and growth features are always hidden. Nothing is deleted, so every toggle can
   bring it back.
2. **Colour means "needs you."** Servers in the rail are grey until hovered or selected. A
   pink dot is the only mention signal, with no counts or unread pips. Accent `#add7ff`
   marks where you are. Role colours, name fonts, nameplates and profile themes are off.
3. **One line per row.** Channel, DM and member rows are one line. Unread is bold; muted is
   dim. The DM list shows recent conversations (the last 30 days, or unread), without bots.
4. **Chrome appears on intent.** The title bar is empty. The channel header is the name; its
   buttons show when you hover it. Row and category buttons show on hover. Timestamps show
   on hover. The composer is a flat line whose buttons brighten when you use it. Scrollbars
   show while hovering.
5. **Text first in servers.** No avatars or connector lines; lines wrap at about 100
   characters. Embeds and media are capped; thread previews are one line.
6. **Nothing moves by itself.** No typing dots, super-reaction bursts, animated decorations
   or stream previews in the channel list.
7. **Type and shape.** IBM Plex Mono everywhere. Sizes 11 (uppercase tracked labels), 13
   (lists), 14 (messages), 15 and 20 (headings). Weights 400 and 600. Radius 0, 1px
   hairlines, no shadows.

## Where each rule lives

| Layer | What | Where |
|---|---|---|
| Look | colour, type, shape | `HumanLayerTheme` plugin → `themes/humanlayer/HumanLayer.theme.css` |
| What's shown | every hide, one toggle each | `Declutter` plugin → `src/deadkernel/declutter/` |
| Structure | rail, header, rows, chat, composer, motion | `QuietLayout` plugin → `src/deadkernel/quietLayout/` |

All three are on by default and each switches off separately in Vencord › Plugins; every
QuietLayout rule above has its own switch too.

## Next, if this still isn't quiet enough

- Hide the server rail entirely and reveal it from the left edge, with Ctrl+K for switching.
- A single Slack-style unread view at the top of the sidebar (milestone 5).
- "Focus" per server: show only the channels you've starred, and the rest on demand.
