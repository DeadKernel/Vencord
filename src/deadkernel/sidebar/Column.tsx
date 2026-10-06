/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// A server's channel column: what's alive in this server, not every channel it has.
// personal/SCREENS.md "Channel column". Visibility (permissions, opt-in, hidden-muted) is
// Discord's own, read from its channel-list model; we only decide what's quiet.

import { classes } from "@utils/misc";
import { Channel } from "@vencord/discord-types";
import {
    ChannelStore, GuildStore, ReadStateStore, RelationshipStore, SelectedChannelStore, UserStore, useState, useStateFromStores, VoiceStateStore
} from "@webpack/common";
import type { ComponentType, MouseEvent } from "react";

import { track } from "../core/telemetry";
import { actionsFor, RowActions } from "./actions";
import {
    addFavorite, ChannelListStore, getFavorites, guildChannelIds, isFavorite, joinVoice, markRead, openChannel, openThread, removeFavorite, settings,
    snowflakeTime, suppressBroadcasts, toggleCategory, useFavorites
} from "./data";
import { openChannelMenu, openGuildMenu } from "./discordMenus";
import { Icon, IconName, IconSlot } from "./icons";
import { ContextItem } from "./menu";
import { occupants, VoiceMembers } from "./voice";

const DAY = 864e5;
const RECENT_MESSAGE = 30 * DAY;
const RECENT_OPEN = 60 * DAY;

interface CategoryView { id: string; name: string | null; collapsed: boolean; live: string[]; quiet: string[]; }
interface ColumnView { favorites: string[]; voice: string[]; categories: CategoryView[]; quiet: number; ok: boolean; }

const isVoice = (c?: Channel | null) => c?.type === 2 || c?.type === 13;

/** Everything the column shows, as ids. Returned as JSON so React only re-renders on real change. */
function selectColumn(guildId: string): string {
    const view: ColumnView = { favorites: [], voice: [], categories: [], quiet: 0, ok: true };
    try {
        const model = ChannelListStore.getGuildWithoutChangingGuildActionRows(guildId)?.guildChannels;
        const selected = SelectedChannelStore.getChannelId();
        const { opened } = settings.store;
        const now = Date.now();
        const favs = new Set(getFavorites().map(f => f.id));
        const pins: Set<string> = model.favoriteChannelIds ?? new Set();

        const live = (id: string, channel: Channel) => {
            if (id === selected || ReadStateStore.hasUnread(id) || ReadStateStore.getMentionCount(id) > 0) return true;
            if (now - (opened[id] ?? 0) < RECENT_OPEN) return true;
            if (isVoice(channel)) return occupants(id).length > 0;
            return now - snowflakeTime(ReadStateStore.lastMessageId(id) ?? channel.lastMessageId) < RECENT_MESSAGE;
        };

        const categories = [model.noParentCategory, ...model.getSortedNamedCategories()];
        for (const category of categories) {
            const rows = Object.values(category.channels as Record<string, any>)
                .filter(row => row.renderLevel >= 3 && row.record)
                .sort((a, b) => (isVoice(a.record) ? 1 : 0) - (isVoice(b.record) ? 1 : 0) || a.position - b.position);
            const cat: CategoryView = { id: category.id ?? "none", name: category.record?.name ?? null, collapsed: !!category.isCollapsed, live: [], quiet: [] };
            for (const row of rows) {
                const { id } = row.record;
                if (favs.has(id) || pins.has(id)) { view.favorites.push(id); continue; }
                const people = isVoice(row.record) ? occupants(id) : [];
                if (people.some(uid => RelationshipStore.isFriend(uid))) { view.voice.push(id); continue; }
                if (live(id, row.record)) cat.live.push(id);
                else cat.quiet.push(id);
            }
            view.quiet += cat.quiet.length;
            if (cat.live.length || cat.quiet.length) view.categories.push(cat);
        }
        // favorites keep his order; Discord pins follow
        const order = getFavorites().map(f => f.id);
        view.favorites.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
    } catch {
        view.ok = false;
    }
    return JSON.stringify(view);
}

function channelMenu(channel: Channel): ContextItem[] {
    const unread = ReadStateStore.hasUnread(channel.id) || ReadStateStore.getMentionCount(channel.id) > 0;
    return [
        { id: "open", label: isVoice(channel) ? "Open chat" : "Open", action: () => openChannel(channel.id) },
        unread && { id: "read", label: "Mark as read", action: () => markRead([channel.id]) },
        isFavorite(channel.id)
            ? { id: "unfav", label: "Remove from Favorites", action: () => removeFavorite(channel.id) }
            : { id: "fav", label: "Add to Favorites", action: () => addFavorite(channel.id) },
        { id: "copy", label: "Copy link", action: () => navigator.clipboard.writeText(`https://discord.com/channels/${channel.guild_id}/${channel.id}`) }
    ];
}

/** If Discord's server menu can't load: the server actions we have of our own. */
const serverMenu = (guildId: string): ContextItem[] => [
    { id: "read", label: "Mark server as read", action: () => markRead(guildChannelIds(guildId)) },
    { id: "suppress", label: "Stop @everyone and role pings here", action: () => suppressBroadcasts(guildId) }
];

function glyph(channel: Channel): IconName {
    if (channel.isThread?.()) return "thread";
    if (isVoice(channel)) return "voice";
    if (channel.type === 15 || channel.type === 16) return "forum";
    if (channel.type === 5) return "announce";
    return "hash";
}

function ChannelRow({ id, threads = true }: { id: string; threads?: boolean; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(id), [id]);
    const unread = useStateFromStores([ReadStateStore], () => ReadStateStore.hasUnread(id), [id]);
    const mentions = useStateFromStores([ReadStateStore], () => ReadStateStore.getMentionCount(id), [id]);
    const selected = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getChannelId() === id, [id]);
    const people = useStateFromStores([VoiceStateStore], () => occupants(id).join(","), [id]);
    const threadIds = useStateFromStores([ChannelListStore, ReadStateStore], () => {
        if (!threads || !channel) return "";
        const row = ChannelListStore.getGuildWithoutChangingGuildActionRows(channel.guild_id)?.guildChannels?.getChannel?.(id);
        return ((row?.threadIds ?? []) as string[]).filter(t => ReadStateStore.hasUnread(t) || isFavorite(t)).join(",");
    }, [channel, threads]);
    if (!channel) return null;

    const voice = isVoice(channel);
    const users = people ? people.split(",") : [];
    const open = () => channel.isThread?.() ? openThread(channel) : voice ? joinVoice(channel) : openChannel(id);

    return (
        <>
            <div className="dk-sb-rowwrap">
                <button
                    className={classes("dk-sb-row", "dk-col-row", unread && !voice && "dk-unread", selected && "dk-selected", channel.isThread?.() && "dk-thread")}
                    onClick={open}
                    data-dk-id={id}
                    onContextMenu={(e: MouseEvent) => openChannelMenu(e, channel, channelMenu(channel))}
                    title={voice ? `${channel.name} · click to join voice` : channel.name}
                    aria-current={selected ? "page" : undefined}
                    data-dk-nav
                >
                    <IconSlot name={glyph(channel)} />
                    <span className="dk-sb-name">{channel.name}</span>
                    <span className="dk-sb-trail">
                        {voice && users.length > 0 && <span className="dk-sb-meta dk-live">· {users.length}</span>}
                        {mentions > 0 ? <span className="dk-sb-count">@{mentions > 99 ? "99+" : mentions}</span> : null}
                    </span>
                </button>
                {voice && <RowActions actions={actionsFor(channel)} />}
            </div>
            {voice && users.length > 0 && <VoiceMembers channelId={id} />}
            {threadIds && threadIds.split(",").map(t => <ChannelRow key={t} id={t} threads={false} />)}
        </>
    );
}

/** A category shows its live channels, and "+N" after its name unfolds its quiet ones in place.
 * A category with nothing live doesn't show at all until "N quiet channels" at the end unfolds
 * everything (personal/SCREENS.md). Discord's own collapse state applies to the live rows. */
function CategoryBlock({ cat, allQuiet }: { cat: CategoryView; allQuiet: boolean; }) {
    const [quietOpen, setQuietOpen] = useState(false);
    const open = quietOpen || allQuiet;
    const hasLive = cat.live.length > 0;
    if (!hasLive && !allQuiet) return null;
    const toggleQuiet = () => { if (!open) track("quiet_unfold"); setQuietOpen(!open); };
    const showRows = !cat.collapsed || !hasLive;
    const n = cat.quiet.length;
    return (
        <section className="dk-sb-section dk-col-category" data-collapsed={(hasLive && cat.collapsed) || undefined} data-quiet={!hasLive || undefined}>
            {cat.name && (
                <div className="dk-sb-label">
                    <button className="dk-sb-label-toggle" data-dk-nav aria-expanded={hasLive ? !cat.collapsed : true}
                        onClick={() => hasLive && toggleCategory(cat.id, cat.collapsed)}>
                        <span className="dk-sb-caret" aria-hidden><Icon name={hasLive && cat.collapsed ? "chevronRight" : "chevronDown"} size={12} /></span>{cat.name}
                    </button>
                    {hasLive && n > 0 && !allQuiet && (
                        <button className="dk-sb-quiet" onClick={toggleQuiet} data-dk-nav aria-expanded={open}
                            title={open ? "Hide quiet channels" : `${n} quiet channel${n === 1 ? "" : "s"}: show`}>
                            {open ? "−" : `+${n}`}
                        </button>
                    )}
                </div>
            )}
            {showRows && hasLive && <div className="dk-sb-rows">{cat.live.map(id => <ChannelRow key={id} id={id} />)}</div>}
            {open && <div className="dk-sb-rows dk-col-quiet">{cat.quiet.map(id => <ChannelRow key={id} id={id} />)}</div>}
        </section>
    );
}

export function Column({ guildId, selectedChannelId, GuildSidebar, onBack }: {
    guildId: string;
    selectedChannelId?: string | null;
    GuildSidebar: ComponentType<{ guildId: string; selectedChannelId?: string | null; }>;
    onBack(): void;
}) {
    const guild = useStateFromStores([GuildStore], () => GuildStore.getGuild(guildId), [guildId]);
    const { showAll } = settings.use(["showAll", "opened"]);
    // the model reads favourites and the opened log, which aren't Discord stores: recompute on them too
    const favKey = useFavorites().map(f => f.id).join(",");
    const openedKey = Object.keys(settings.store.opened).length;
    const json = useStateFromStores(
        [ChannelListStore, ReadStateStore, SelectedChannelStore, VoiceStateStore, RelationshipStore, UserStore],
        () => selectColumn(guildId), [guildId, favKey, openedKey]
    );
    const view: ColumnView = JSON.parse(json);
    // Discord's full tree: chosen with "> Use Discord's channel list here", or when our model fails
    const all = !!showAll[guildId] || !view.ok;
    const setAll = (v: boolean) => settings.store.showAll = { ...settings.store.showAll, [guildId]: v };
    const [allQuiet, setAllQuiet] = useState(false);

    return (
        <div className="dk-col" key={guildId}>
            <div className="dk-col-header">
                <button className="dk-col-title" title={`${guild?.name ?? ""}: invite, notifications, settings`} data-dk-nav
                    onClick={e => openGuildMenu(e, guildId, serverMenu(guildId))} onContextMenu={e => openGuildMenu(e, guildId, serverMenu(guildId))}>
                    {guild?.name}<span className="dk-col-caret" aria-hidden><Icon name="chevronDown" size={14} /></span>
                </button>
                <button className="dk-col-back" onClick={onBack} title="Close this column (the conversation stays open)" data-dk-nav aria-label="Close"><Icon name="close" size={16} /></button>
            </div>
            {all ? (
                <>
                    {view.ok && <button className="dk-sb-more dk-col-mode" onClick={() => setAll(false)} data-dk-nav>Back to live channels</button>}
                    <div className="dk-sb-guild-tree">
                        <GuildSidebar key={guildId} guildId={guildId} selectedChannelId={selectedChannelId ?? SelectedChannelStore.getChannelId(guildId)} />
                    </div>
                </>
            ) : (
                <div className="dk-sb-scroll dk-col-scroll">
                    {view.favorites.length > 0 && (
                        <section className="dk-sb-section">
                            <div className="dk-sb-label"><span className="dk-sb-label-text">Favorites</span></div>
                            {view.favorites.map(id => <ChannelRow key={id} id={id} />)}
                        </section>
                    )}
                    {view.voice.length > 0 && (
                        <section className="dk-sb-section">
                            <div className="dk-sb-label"><span className="dk-sb-label-text">Friends in voice</span></div>
                            {view.voice.map(id => <ChannelRow key={id} id={id} />)}
                        </section>
                    )}
                    {view.categories.map(cat => <CategoryBlock key={cat.id} cat={cat} allQuiet={allQuiet} />)}
                    {view.quiet > 0 && (
                        <button className="dk-sb-row dk-col-allquiet" onClick={() => { if (!allQuiet) track("quiet_unfold_all"); setAllQuiet(!allQuiet); }}
                            data-dk-nav data-dk-action="all-quiet" aria-expanded={allQuiet}>
                            <IconSlot name={allQuiet ? "chevronDown" : "chevronRight"} />
                            <span className="dk-sb-name">{allQuiet ? "Hide quiet channels" : `${view.quiet} quiet channel${view.quiet === 1 ? "" : "s"}`}</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
