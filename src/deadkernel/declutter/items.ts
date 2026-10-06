/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// One row per toggle. `hidden` is the default; the CSS for each key lives in declutter.css
// under `.dk-hide-<key>`. `menu` lists menu-entry DOM ids (`${navId}-${itemId}`) to remove.
// personal/AUDIT.md has the reasoning for each default.

export const Groups = [
    { id: "promo", title: "Promotions and paid features" },
    { id: "rail", title: "Server rail and title bar" },
    { id: "server", title: "Servers" },
    { id: "home", title: "Home and DMs" },
    { id: "chat", title: "Messages and composer" },
    { id: "people", title: "Profiles" },
    { id: "settings", title: "Settings" },
] as const;

export interface Item {
    key: string;
    group: (typeof Groups)[number]["id"];
    title: string;
    note?: string;
    hidden: boolean;
    menu?: RegExp[];
}

const ItemList = [
    // Promotions and paid features
    { key: "nitroShopQuests", group: "promo", title: "Nitro, Shop and Quests", note: "The three rows at the top of the DM list", hidden: true },
    { key: "gift", group: "promo", title: "the gift button", note: "In the DM composer", hidden: true },
    { key: "boosts", group: "promo", title: "server boosts", note: "Boost goal bar, Server Boosts row, the boost entry in the server menu, the tier footer on server hover cards", hidden: true, menu: [/^guild-header-popout-premium-subscribe$/] },
    { key: "apps", group: "promo", title: "apps and activities", note: "The composer's Apps button, Use Apps, App Directory, and every Apps › submenu", hidden: true, menu: [/^channel-attach-SLASH_COMMAND$/, /^message-apps$/, /^user-context-apps$/, /^guild-header-popout-application-directory$/] },
    { key: "activeNow", group: "promo", title: "Active Now", note: "The right-hand column on the Friends page", hidden: true },
    { key: "superReactions", group: "promo", title: "super reaction effects", note: "Glow and burst animations; the reaction and its count stay", hidden: true },
    { key: "cosmetics", group: "promo", title: "profile cosmetics", note: "Avatar decorations, profile effects, nameplates, display-name fonts", hidden: true },
    { key: "serverTags", group: "promo", title: "server tags", note: "The little tag chips next to names, and the Server Tag menu entry", hidden: true, menu: [/^guild-header-popout-.*tag/i] },
    { key: "quests", group: "promo", title: "quest badges", note: "Quest icons on activity lines", hidden: true },

    // Server rail and title bar
    { key: "addServer", group: "rail", title: "Add a Server", hidden: true },
    { key: "discover", group: "rail", title: "Discover", hidden: true },
    { key: "downloadApps", group: "rail", title: "Download Apps", hidden: true },
    { key: "help", group: "rail", title: "the Help button", note: "Top right, links to support.discord.com", hidden: true },

    // Servers
    { key: "banner", group: "server", title: "server banners", note: "The image above the channel list", hidden: true },
    { key: "invite", group: "server", title: "invite buttons", note: "Next to the server name and on the selected channel; Invite stays in the menus", hidden: true },
    { key: "guide", group: "server", title: "Channels & Roles", note: "The onboarding / server guide row", hidden: true },
    { key: "events", group: "server", title: "the Events row", hidden: true },
    { key: "linkedRoles", group: "server", title: "Linked Roles", note: "In the server menu", hidden: true, menu: [/^guild-header-popout-.*linked-roles/] },

    // Home and DMs
    { key: "botDms", group: "home", title: "DMs with bots", note: "MEE6, Carl-bot and friends. They still open from search", hidden: true },
    { key: "staleDms", group: "home", title: "quiet DMs", note: "No messages for 30 days, not unread, not open. Search still finds them", hidden: true },
    { key: "blockedNotice", group: "home", title: "the blocked accounts notice", note: "\"Looking for accounts you've blocked or ignored?\" on the Friends page", hidden: true },
    { key: "addToDm", group: "home", title: "Add to DM", note: "The DM header button that turns a DM into a group", hidden: true },

    // Messages and composer
    { key: "quickReactions", group: "chat", title: "quick reactions", note: "The three recent emoji in the hover bar and the right-click menu", hidden: true, menu: [/^message-quickreact-/] },
    { key: "forward", group: "chat", title: "Forward", note: "Hover bar and right-click menu", hidden: true, menu: [/^message-forward$/] },
    { key: "tts", group: "chat", title: "Speak Message", hidden: true, menu: [/^message-tts$/] },
    { key: "stickers", group: "chat", title: "the sticker button", hidden: true },
    { key: "polls", group: "chat", title: "Create Poll", note: "In the composer's + menu", hidden: true, menu: [/^channel-attach-poll$/] },
    { key: "systemNoise", group: "chat", title: "join and boost messages", note: "\"X joined\", boosts, subscription purchases", hidden: true },
    { key: "threadNotices", group: "chat", title: "thread and pin notices", note: "\"X started a thread\", \"X pinned a message\". Threads and pins stay one click away", hidden: true },

    // Profiles
    { key: "profileThemes", group: "people", title: "profile banners and theme colours", note: "Popouts use the theme's colours instead", hidden: true },
    { key: "badges", group: "people", title: "profile badges", hidden: true },
    { key: "statusReactions", group: "people", title: "react / reply to status", hidden: true },
    { key: "oldUsername", group: "people", title: "\"Originally known as\"", hidden: true },
    { key: "inviteUser", group: "people", title: "Invite to Server", note: "In the user right-click menu", hidden: true, menu: [/^user-context-invite-to-server$/] },

    // Settings
    { key: "billingSettings", group: "settings", title: "billing settings", note: "Nitro, Server Boost, Subscriptions, Gift Inventory, Billing", hidden: true },
    { key: "familyCenter", group: "settings", title: "Family Center", hidden: true },
    { key: "patchHelper", group: "settings", title: "Patch Helper", note: "A Vencord developer tool", hidden: true },
] as const satisfies readonly Item[];

export type ItemKey = (typeof ItemList)[number]["key"];
export const Items: readonly (Item & { key: ItemKey; })[] = ItemList;
