# Design direction

Discord as a quiet, Slack-shaped workspace. The material is HumanLayer's
(`themes/humanlayer/tokens.md`); the discipline is Maeda's laws of simplicity, the same pair
as `agent-review`'s DESIGN-LANGUAGE.md. When something here conflicts with Discord's defaults,
this wins.

## Rules

1. **Reduce.** If it isn't used every week, it's hidden behind a toggle. Promotions, paid
   cosmetics and growth features are always hidden. Nothing is deleted, so every toggle can
   bring it back.
2. **One accent.** Accent `#add7ff` marks where you are (the selected row, links, focus). Pink
   marks what needs you (mentions, unread counts). Teal marks live or positive (voice,
   online). Everything else is neutral. Role colours, name fonts, nameplates and profile
   themes are decoration, so they're off: names are `text-strong`.
3. **One line per row.** Channel, DM and member rows are a single line: no activity line, no
   tag chips, no badges. Unread rows are bold `text-strong`, read rows are `text-2`, muted
   rows are dim.
4. **Nothing moves by itself.** No typing dots, no super-reaction bursts, no animated
   decorations or profile effects. State changes take 80 to 120ms; nothing loops.
5. **No onboarding, no promos, no empty-state art.** No "Shop this look", no Active Now, no
   server guide rows, no "did you know" banners.
6. **Type and shape.** IBM Plex Mono everywhere. Sizes 11 (uppercase tracked labels), 13
   (lists), 14 (messages), 15 and 20 (headings). Weights 400 and 600. Radius 0, 1px
   hairlines, no shadows.
7. **Slack's structure.** The server rail is a narrow workspace switcher of square icons. The
   sidebar is sections of one-line rows. The member list is off. Unreads and mentions live in
   one inbox (milestone 5).

## Where each rule lives

| Layer | What | Where |
|---|---|---|
| Look | colour, type, shape | `HumanLayerTheme` plugin → `themes/humanlayer/HumanLayer.theme.css` |
| What's shown | every hide, one toggle each | `Declutter` plugin → `src/deadkernel/declutter/` |
| Structure | rail, sidebar, rows, motion | `QuietLayout` plugin → `src/deadkernel/quietLayout/` |

All three are on by default and can be switched off independently in Vencord › Plugins.
