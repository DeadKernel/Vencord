# Discord surface audit

Walked live in Vesktop with our Vencord build and the HumanLayer theme on 2026-10-06 (Discord
stable 629779). This is the spec for milestones 4 to 6: the declutter plugin, the Slack-like
layout, and notification rules.

**How to mark:** put a letter in each `[ ]`:

- **K** keep as is
- **H** hide behind a toggle (default off)
- **C** change it (add a few words on how)

`→ H` after an item is my suggestion; ignore it if you disagree. **Hidden today** means the
HumanLayer theme already hides it, so marking K brings it back. **Vencord: X** means an
existing Vencord plugin already does it, so it costs no new code.

Screenshots are cropped and blurred (`personal/tools/redact.css`) because this repo is public.

## 1. Window and title bar (Vesktop)

- [ ] Back / forward arrows (top left) → K
- [ ] Window title: current server or DM name, centred → K
- [ ] Inbox button (top right) → K, see §10
- [ ] Help button (links to support.discord.com). Hidden today → H
- [ ] Tray icon, and close-to-tray (on by default) → K
- [ ] Splash screen while loading → H
- [ ] Unread badge on the taskbar icon → K
- [ ] Start on login → your call
- [ ] Rich Presence for games (arRPC). Off in this profile, because your Discord already does it → K off
- [ ] App name and icon still say "Vesktop" → C (needs a name and an icon, milestone 7)

## 2. Server rail (far left)

- [ ] Home / DMs button, with its unread count → K
- [ ] Unread DMs shown as avatars under Home → K
- [ ] Server icons, rounded squircles (the theme leaves these round) → K, or C to make them square
- [ ] Server folders → K. Vencord: BetterFolders (folder opens as its own column), PlainFolderIcon
- [ ] White unread pip and mention count on server icons → K
- [ ] Speaker / live / event icons on server icons → K. Vencord: ServerListIndicators
- [ ] "NEW" pill at the bottom of the rail (more mentions below) → K
- [ ] Add a Server button → H
- [ ] Discover button → H
- [ ] Download Apps button. Hidden today → H
- [ ] Server hover card: name, who is in voice, boost tier footer → C (drop the boost footer)

## 3. Server: channel list

- [ ] Server banner image at the top → H
- [ ] Server header menu (click the server name):
  - [ ] Server Boost → H
  - [ ] Server Tag (wear this server's tag) → H
  - [ ] Invite to Server → K
  - [ ] App Directory → H
  - [ ] Linked Roles → H
  - [ ] Show All Channels, Hide Muted Channels → K
  - [ ] Notification Settings, Privacy Settings → K
  - [ ] Edit Per-server Profile → K
  - [ ] Leave Server, Copy Server ID → K
- [ ] Invite button next to the server name → H
- [ ] Server boost goal bar and the "Server Boosts" row. Hidden today → H
- [ ] Events row (when a server has events) → K
- [ ] "Channels & Roles" / "Browse Channels" (onboarding) → K
- [ ] "Suggested" channels block → H
- [ ] Channels locked behind server subscriptions ("Join X's Server Subscription", with prices) → H
- [ ] Banner for channels that aren't on your channel list ("Add to channel list") → K
- [ ] "New unreads" bar over the list → K
- [ ] Members listed under voice channels, with their activities → K
- [ ] Channel right-click menu: Mark As Read, Invite to Channel, Pin Channel to Top, Add to
      Channel List, Copy Link, Mute, Notification Settings, Copy Channel ID → K

## 4. Home: DM list and Friends

- [ ] "Find or start a conversation" search box → K
- [ ] Friends row, with pending-request count → K. Vencord: NoPendingCount
- [ ] Message Requests row, with count → K
- [ ] Nitro row. Hidden today → H
- [ ] Shop row. Hidden today → H
- [ ] Quests row. Hidden today → H
- [ ] "+" to create a DM or group → K
- [ ] DM rows: custom status / activity line under the name → K, or C (names only)
- [ ] DM rows: server tag chips next to names → H
- [ ] Friends page tabs: Online, All, Pending, Add Friend → K
- [ ] Friends page "Active Now" column. Hidden today → H
- [ ] Banner "Looking for accounts you've blocked or ignored?" → H
- [ ] Pin DMs to the top → new. Vencord: PinDMs

## 5. Channel header

![DM header buttons](audit/dm-header-buttons.png)

- [ ] Server channels: Threads → K
- [ ] Server channels: Notification Settings (bell) → K
- [ ] Server channels: Pinned Messages → K
- [ ] Server channels: Show Member List → K
- [ ] Channel topic text after the name → K
- [ ] DMs: Start Voice Call / Start Video Call → K
- [ ] DMs: Add to DM (make it a group) → H
- [ ] DMs: user profile side panel (on by default) → H
- [ ] Search box → K

## 6. Composer

![Composer](audit/composer.png)
![Composer + menu](audit/composer-plus-menu.png)

- [ ] "+" menu: Upload a File → K
- [ ] "+" menu: Create Poll → H
- [ ] "+" menu: Use Apps → H
- [ ] Gift button (DMs only). Hidden today → H
- [ ] GIF picker → K
- [ ] Sticker picker → H
- [ ] Emoji picker → K
- [ ] Apps launcher (the four-shape button) → H
- [ ] Slowmode / "you can't send here" notices → K
- [ ] Typing indicator ("X is typing…") → K. Vencord: TypingIndicator, NoTypingAnimation

## 7. Messages

**What's shown on each message**
- [ ] Avatars → K (the theme makes them square)
- [ ] Display-name styles: custom fonts and effects → H
- [ ] Role colours on names → K. Vencord: RoleColorEverywhere
- [ ] Server tags next to names → H
- [ ] Role icons next to names → H
- [ ] APP / BOT tags → K
- [ ] Reply previews → K
- [ ] Link embeds and YouTube previews → K
- [ ] Image / video attachments → K. Vencord: NoMosaic
- [ ] Stickers → K
- [ ] Reactions → K
- [ ] Super reactions, with their burst animations → H. Vencord: SuperReactionTweaks
- [ ] Forwarded messages → K
- [ ] Polls → K
- [ ] Voice messages → K
- [ ] System messages (joins, boosts, pins) → C (keep pins, hide joins and boosts)
- [ ] Avatar decorations. Hidden today → H
- [ ] Date dividers and the "NEW" unread divider → K
- [ ] Highlight on messages that mention you → K

**Hover bar**

![Message hover bar](audit/message-hover-bar.png)

- [ ] Three quick reactions (your most used) → H
- [ ] Add Reaction → K
- [ ] Reply (others' messages) / Edit (yours) → K
- [ ] Forward → H
- [ ] More (…) → K

**Right-click menu**

![Message right-click menu](audit/message-context-menu.png)

- [ ] Quick reaction row → H
- [ ] Add Reaction, Reply, Edit Message, Copy Text, Pin Message, Mark Unread, Copy Message Link → K
- [ ] Forward → H
- [ ] Apps › → H
- [ ] Speak Message (text-to-speech) → H
- [ ] Report Message / Delete Message → K
- [ ] Copy Image, Save Image, Copy Image Link, Open Image Link → K
- [ ] Copy Message ID (from Developer Mode) → K

## 8. Member list and profiles

- [ ] Member list (it starts hidden in this profile) → K
- [ ] Member list groups by role → K
- [ ] Nameplates (image / gradient backgrounds behind member names) → H
- [ ] Activity lines under members ("Playing…", custom status) → K
- [ ] Profile popout: banner and Nitro profile theme colours → H. Vencord: NoProfileThemes
- [ ] Profile popout: profile effects (animated overlays). Hidden today → H
- [ ] Profile popout: badges → H
- [ ] Profile popout: react to / reply to someone's custom status → H
- [ ] Profile popout: mutual friends / servers, member since, roles → K
- [ ] Profile popout: "Originally known as" (old username) → H
- [ ] Profile popout: note field → K
- [ ] Profile popout: "Message @name" box → K
- [ ] Profile popout: Add Friend / More / View Full Profile → K
- [ ] User right-click menu: Profile, Mention, Message, Add Note, Add Friend, Ignore, Block, Roles, Copy User ID → K
- [ ] User right-click menu: Apps ›, Invite to Server › → H

## 9. User panel (bottom left)

![User panel](audit/user-panel.png)

- [ ] Avatar / status menu → K
- [ ] Mute, Deafen → K
- [ ] Input / Output options carets → K
- [ ] Settings cog → K
- [ ] Voice panel while in a call: camera, screen share, activities, soundboard, noise
      suppression, disconnect. **Not checked live** (I didn't join voice) → K, except H for activities and soundboard

## 10. Inbox

- [ ] Unreads tab → K
- [ ] Mentions tab → K
- [ ] Friend request shortcut → K
- [ ] Mark All as Read → K. Vencord: ReadAllNotificationsButton
- [ ] Inbox replaced by a single Slack-style unread view → C (milestone 5)

## 11. Notifications

What Discord offers today (Settings › Notifications):

- [ ] Desktop notifications on/off → K
- [ ] "Notify me when": people you know start streaming in small servers → H
- [ ] "Notify me when": friendship anniversaries → H
- [ ] "Notify me when": friends come online → H
- [ ] "Notify me when": a server has an upcoming event → H
- [ ] "Notify me when": friends update their profile → H
- [ ] "Notify me when": someone reacts to my messages (all / none) → your call
- [ ] Sounds: new message, message in the current channel, incoming ring, mute all → K
- [ ] Unread badge on the app icon → K
- [ ] Emails: communication, social, announcements, tips, recommendations → H (unsubscribe from marketing)
- [ ] Per-server and per-channel mute / notification settings → K
- [ ] "Experimental Unreads" (pick which channels matter most) → try it
- [ ] Your own rules instead (by person, keyword, time of day, digest) → C (milestone 6).
      Vencord: OnePingPerDM, NotificationVolume

## 12. Paid features, promos and games

Collected in one place. Most of these also appear in the sections above.

- [ ] Nitro, Shop and Quests entries in the DM list. Hidden today → H
- [ ] Gift button in the composer. Hidden today → H
- [ ] Settings pages: Nitro, Server Boost, Subscriptions, Gift Inventory, Billing → H
- [ ] Nitro-only emoji and stickers shown (locked) in the pickers → H
- [ ] Super reactions → H
- [ ] Profile cosmetics on other people: decorations, effects, nameplates, name styles, profile themes → H
- [ ] Server boosts: header menu entry, goal bar, boosts row, hover-card footer → H
- [ ] Server subscriptions: locked channels with prices → H
- [ ] Server tags (wearing and showing) → H
- [ ] Apps and Activities: composer Apps button, "Use Apps", App Directory, Apps › menus → H
- [ ] Active Now → H
- [ ] FakeNitro (Vencord's YABDP4Nitro) for using emoji and stickers without paying →
      your call: it's the riskiest kind of plugin for the account

## 13. Settings sections

- [ ] My Account (Account Info, Password & Security, Account Status, Family Center) → K, Family Center H
- [ ] Data & Privacy, Messaging Permissions, Notifications → K
- [ ] Vencord: Vencord, Plugins, Themes, Cloud, Backup & Restore, Patch Helper → K (Patch Helper H)
- [ ] Vesktop → K
- [ ] Nitro, Server Boost, Subscriptions, Gift Inventory, Billing → H
- [ ] Voice & Video, Appearance, Accessibility, System, Language & Time → K
- [ ] Activity Privacy, Connected Apps → K
- [ ] Developer → K
- [ ] Footer: build number, Privacy Policy, Terms, More → H

## Questions for you

1. Anything you use in Discord that isn't on this list?
2. Server icons: keep them round, or square like the rest of the theme?
3. FakeNitro: yes or no?
4. Name and icon for your client (milestone 7)?
