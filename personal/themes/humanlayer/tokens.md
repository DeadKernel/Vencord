# HumanLayer design tokens

Pulled from the live humanlayer.dev stylesheet on 2026-10-06. The site's default
theme is `data-theme="poimandres"`.

| Token            | Value     | Use                                    |
| ---------------- | --------- | -------------------------------------- |
| `--bg-primary`   | `#1b1e28` | page / chat background                 |
| `--code-bg`      | `#252836` | raised surfaces, code, sidebars        |
| `--bg-secondary` | `#303340` | borders, hover fills, top bars         |
| `--bg-tertiary`  | `#3a3d4a` | active fills                           |
| `--text-primary` | `#a6accd` | body + headings                        |
| `--text-secondary` | `#8990b3` | paragraphs                           |
| `--text-muted`   | `#6b7394` | labels, timestamps                     |
| `--accent`       | `#add7ff` | links, primary buttons, selection      |
| `--accent-alt`   | `#5de4c7` | success / secondary accent (teal)      |
| `--warning`      | `#fffac2` |                                        |
| `--error`        | `#d0679d` |                                        |
| `--ansi-magenta` | `#f087bd` |                                        |
| `--ansi-blue`    | `#89ddff` |                                        |

Type: IBM Plex Mono for everything. h1 32px/600/-0.02em, h2 20px/500, body
14.4px/1.7. Buttons and labels are uppercase 14px with `0.05em` tracking.

Shape: `border-radius: 0` everywhere. 1px `#303340` hairline borders, no shadows.
Selected list rows use accent text on `rgb(173 215 255 / .15)` plus a 2px accent
left edge. Tags are 1px outlined boxes in the tag's own color.
