/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Discord's own right-click menus for our rows: the server menu (invite, notification settings,
// privacy, leave…) and the channel menus. They live in lazy chunks; we load them the way Discord's
// own list does (personal research, screens-tech §1.4 and §1.6). Vencord's contextMenus patches
// apply, so "Add to Favorites" shows up in them too. If a loader stops matching after a Discord
// update, the caller's own menu opens instead.

import { canonicalizeMatch } from "@utils/patches";
import { Channel } from "@vencord/discord-types";
import { DefaultExtractAndLoadChunksRegex as L, extractAndLoadChunks, findModuleFactory, wreq } from "@webpack";
import { ContextMenuApi, GuildStore } from "@webpack/common";
import type { ComponentType, MouseEvent } from "react";

import { ContextItem, renderMenu } from "./menu";

type Loader = { find: string; pre: string; };

const CHANNEL_LIST = "resetTextChannelPopoutTimers";
const MENUS = {
    text: { find: CHANNEL_LIST, pre: String.raw`isModeratorReportChannel\(\)\).{0,500}?\.getGuild\(\i\.getGuildId\(\)\);null!=\i&&\(0,\i\.\i\)\(\i,async\(\)=>\{let\{default:\i\}=await ` },
    voice: { find: CHANNEL_LIST, pre: String.raw`routeDirectlyToChannel:\i\|\|\i,locked:\i,transitionExtras:.{0,120}?handleContextMenu=.{0,200}?await ` },
    thread: { find: CHANNEL_LIST, pre: String.raw`\.preload\(\i\.guild_id,\i\.id\)\},\[\i\.guild_id,\i\.id\]\),\i=\i\.useCallback\(\i=>\{\(0,\i\.\i\)\(\i,\i\)\},\[\i\]\),\i=\i\.useCallback\(\i=>\{let \i=\i\.\i\.getChannel\(\i\.id\);null!=\i&&\(0,\i\.\i\)\(\i,async\(\)=>\{let\{default:\i\}=await ` },
    category: { find: CHANNEL_LIST, pre: String.raw`"null"!==\i\.id\)\{let \i=\i\.\i\.getGuild\(\i\.getGuildId\(\)\);null!=\i&&\(0,\i\.\i\)\(\i,async\(\)=>\{let\{default:\i\}=await ` },
    guild: { find: "renderMenuPopout=async", pre: String.raw`renderMenuPopout=async\(\)=>\{let\{default:\i\}=await ` }
} satisfies Record<string, Loader>;

const cache = new Map<Loader, ComponentType<any> | null>();

/** Loads the menu's chunks and returns its component (the entry module's default export). */
async function load(loader: Loader): Promise<ComponentType<any> | null> {
    if (cache.has(loader)) return cache.get(loader)!;
    let component: ComponentType<any> | null = null;
    try {
        const matcher = canonicalizeMatch(new RegExp(loader.pre + L.source));
        const entry = String(findModuleFactory(loader.find)).match(matcher)?.[2];
        if (entry && await extractAndLoadChunks([loader.find], matcher)) component = wreq(Number(entry) || entry as any)?.default ?? null;
    } catch {
        component = null;
    }
    cache.set(loader, component);
    return component;
}

/** Opens at once (Discord's opener needs the live event); the menu itself loads asynchronously and
 * falls back to ours if Discord's can't be found. */
function open(e: MouseEvent, loader: Loader, props: object, fallback: ContextItem[]) {
    ContextMenuApi.openContextMenuLazy(e as any, async () => {
        const Menu = await load(loader);
        return Menu ? (p: any) => <Menu {...p} {...props} onClose={ContextMenuApi.closeContextMenu} /> : renderMenu(fallback);
    });
}

/** Discord's server menu (the one under the server name), at the pointer. */
export function openGuildMenu(e: MouseEvent, guildId: string, fallback: ContextItem[]) {
    const guild = GuildStore.getGuild(guildId);
    if (guild) open(e, MENUS.guild, { guild }, fallback);
}

/** Discord's channel, voice, thread or category menu, by the channel's type. */
export function openChannelMenu(e: MouseEvent, channel: Channel, fallback: ContextItem[]) {
    const guild = GuildStore.getGuild(channel.guild_id);
    const loader = channel.isThread?.() ? MENUS.thread
        : channel.type === 4 ? MENUS.category
            : channel.type === 2 || channel.type === 13 ? MENUS.voice
                : MENUS.text;
    open(e, loader, { channel, guild }, fallback);
}
