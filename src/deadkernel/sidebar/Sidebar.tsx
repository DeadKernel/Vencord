/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classes } from "@utils/misc";
import { Channel } from "@vencord/discord-types";
import {
    ApplicationStreamingStore, ChannelStore, ContextMenuApi, GuildReadStateStore, GuildStore, IconUtils, Menu, MessageRequestStore,
    NavigationRouter, PresenceStore, PrivateChannelSortStore, React, ReadStateStore, RelationshipStore, SelectedChannelStore, SelectedGuildStore,
    useEffect, useRef, UserGuildSettingsStore, UserStore, useState, useStateFromStores, VoiceStateStore
} from "@webpack/common";
import type { ComponentType, KeyboardEvent, MouseEvent, ReactNode } from "react";

import {
    addFavorite, backOut, drillIn, getFavorites, guildChannelIds, guildSignal, isFavorite, labelFor, markRead, moveFavorite, navState, noteRoute,
    openChannel, openFriends, openGuild, openQuickSwitcher, openRequests, presenceWord, PrivateChannelReadStateStore, removeFavorite,
    sameList, selectDirect, selectMentionChannels, selectMessages, selectRequestCount, settings, SortedGuildStoreTyped, userPresence
} from "./data";

export interface ChannelAreaProps {
    guildId?: string | null;
    selectedChannelId?: string | null;
    GuildSidebar: ComponentType<{ guildId: string; selectedChannelId?: string | null; }>;
    PrivateChannels: ComponentType<any>;
    original(): ReactNode;
}

const DIRECT_MAX = 5;
const MESSAGES_MAX = 8;

// Stores that change a row's presence word or a server's signal. Functions, because Vencord's
// common stores resolve lazily and must not be read at module load.
const liveStores = () => [PresenceStore, VoiceStateStore, ApplicationStreamingStore];
const guildStores = () => [GuildReadStateStore, UserGuildSettingsStore, RelationshipStore, VoiceStateStore];

/** The server the sidebar is showing, or null for the top level. Shared with the rail gate. */
export function useDrilled(routeGuildId?: string | null) {
    const backedOut = React.useSyncExternalStore(navState.subscribe, navState.backedOutOf);
    return routeGuildId && backedOut !== routeGuildId ? routeGuildId : null;
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Section({ id, label, aside, children }: { id: string; label: string; aside?: ReactNode; children: ReactNode; }) {
    const { closedSections } = settings.use(["closedSections"]);
    const closed = !!closedSections[id];
    const toggle = () => settings.store.closedSections = { ...settings.store.closedSections, [id]: !closed };
    return (
        <section className="dk-sb-section" data-closed={closed || undefined}>
            <div className="dk-sb-label">
                <button className="dk-sb-label-toggle" onClick={toggle} aria-expanded={!closed} data-dk-nav>
                    <span className="dk-sb-caret" aria-hidden>{closed ? "▸" : "▾"}</span>{label}
                </button>
                {aside}
            </div>
            {!closed && children}
        </section>
    );
}

interface RowProps {
    icon?: ReactNode;
    label: string;
    where?: string;
    meta?: { text: string; live: boolean; } | null;
    count?: number;
    mention?: boolean;
    dot?: boolean;
    unread?: boolean;
    muted?: boolean;
    selected?: boolean;
    unavailable?: boolean;
    onClick(): void;
    onContextMenu?(e: MouseEvent): void;
}

function Row(p: RowProps) {
    const full = p.where ? `${p.label} · ${p.where}` : p.label;
    const countText = p.count ? `${p.mention ? "@" : ""}${p.count > 99 ? "99+" : p.count}` : "";
    return (
        <button
            className={classes("dk-sb-row", p.unread && "dk-unread", p.muted && "dk-muted", p.selected && "dk-selected", p.unavailable && "dk-unavailable")}
            title={full}
            aria-label={[full, p.meta?.text, p.count ? `${p.count} ${p.mention ? "mentions" : "unread"}` : p.unread ? "unread" : ""].filter(Boolean).join(", ")}
            aria-current={p.selected ? "page" : undefined}
            onClick={p.onClick}
            onContextMenu={p.onContextMenu}
            data-dk-nav
        >
            {p.icon}
            <span className="dk-sb-name">{p.label}</span>
            {p.where && <span className="dk-sb-where">{p.where}</span>}
            <span className="dk-sb-trail">
                {p.meta && <span className={classes("dk-sb-meta", p.meta.live && "dk-live")}>{p.meta.text}</span>}
                {countText ? <span className="dk-sb-count">{countText}</span> : p.dot ? <span className="dk-sb-dot" /> : null}
            </span>
        </button>
    );
}

function Square({ src, text, presence, size = "person" }: { src?: string | null; text?: string; presence?: string; size?: "person" | "server"; }) {
    return (
        <span className={`dk-sb-icon dk-sb-${size}`}>
            {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : <span className="dk-sb-glyph">{text}</span>}
            {presence && presence !== "offline" && <i className={`dk-sb-status dk-${presence}`} title={presence} />}
        </span>
    );
}

function channelIcon(channel: Channel, presence?: string) {
    if (channel.type === 1) {
        const user = UserStore.getUser(channel.recipients[0]);
        return <Square src={user?.getAvatarURL(undefined, 48)} text={user?.username?.[0]} presence={presence} />;
    }
    if (channel.type === 3) {
        const src = channel.icon ? IconUtils.getChannelIconURL({ id: channel.id, icon: channel.icon, size: 48 } as any) : null;
        return <Square src={src} text={labelFor(channel)[0]} />;
    }
    const glyph = channel.isThread?.() ? "↳" : channel.type === 2 ? "♪" : channel.type === 15 ? "≡" : "#";
    return <span className="dk-sb-icon dk-sb-hash" aria-hidden>{glyph}</span>;
}

function openMenu(e: MouseEvent, items: ReactNode) {
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="dk-sidebar" onClose={ContextMenuApi.closeContextMenu} aria-label="Sidebar">
            {items}
        </Menu.Menu>
    ));
}

function conversationMenu(id: string, inFavorites: boolean) {
    const list = getFavorites();
    const index = list.findIndex(f => f.id === id);
    const unread = ReadStateStore.hasUnread(id) || ReadStateStore.getMentionCount(id) > 0;
    return [
        <Menu.MenuItem key="open" id="dk-open" label="Open" action={() => openChannel(id)} />,
        unread && <Menu.MenuItem key="read" id="dk-read" label="Mark as read" action={() => markRead([id])} />,
        isFavorite(id)
            ? <Menu.MenuItem key="unfav" id="dk-unfav" label="Remove from Favorites" action={() => removeFavorite(id)} />
            : <Menu.MenuItem key="fav" id="dk-fav" label="Add to Favorites" action={() => addFavorite(id)} />,
        inFavorites && index > 0 && <Menu.MenuItem key="up" id="dk-up" label="Move up" action={() => moveFavorite(id, -1)} />,
        inFavorites && index < list.length - 1 && <Menu.MenuItem key="down" id="dk-down" label="Move down" action={() => moveFavorite(id, 1)} />
    ];
}

// ── Rows bound to Discord data ───────────────────────────────────────────────

// Plain functions, not React.memo: Vencord's React resolves after module load, and each row
// subscribes to its own data anyway.
function ConversationRow({ id, fallback, inFavorites }: { id: string; fallback?: string; inFavorites?: boolean; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(id), [id]);
    const unread = useStateFromStores([ReadStateStore], () => ReadStateStore.hasUnread(id), [id]);
    const mentions = useStateFromStores([ReadStateStore], () => ReadStateStore.getMentionCount(id), [id]);
    const selected = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getChannelId() === id, [id]);
    const live = useStateFromStores(liveStores(), () => channel ? JSON.stringify(presenceWord(channel)) : "null", [channel]);
    const presence = useStateFromStores(liveStores(), () => channel?.type === 1 ? userPresence(channel.recipients[0]) : undefined, [channel]);
    const menu = (e: MouseEvent) => openMenu(e, conversationMenu(id, !!inFavorites));

    if (!channel) return <Row label={fallback ?? "Unavailable"} where="not loaded" unavailable onClick={() => openChannel(id)} onContextMenu={menu} />;

    const guild = channel.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
    const isDm = channel.type === 1 || channel.type === 3;

    return (
        <Row
            icon={channelIcon(channel, presence)}
            label={labelFor(channel)}
            where={guild?.name}
            meta={JSON.parse(live)}
            // a count only when Discord has one (DM unreads count as mentions there); otherwise a dot
            count={mentions}
            mention={!isDm}
            dot={unread && !mentions}
            unread={unread}
            selected={selected}
            onClick={() => openChannel(id)}
            onContextMenu={menu}
        />
    );
}

function GuildRow({ guildId }: { guildId: string; }) {
    const guild = useStateFromStores([GuildStore], () => GuildStore.getGuild(guildId), [guildId]);
    const signal = useStateFromStores(guildStores(), () => JSON.stringify(guildSignal(guildId)), [guildId]);
    const selected = useStateFromStores([SelectedGuildStore], () => SelectedGuildStore.getGuildId() === guildId, [guildId]);
    if (!guild) return null;
    const s = JSON.parse(signal);
    const src = guild.icon ? IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, size: 40 }) : null;
    return (
        <Row
            icon={<Square src={src} text={(guild as any).acronym ?? guild.name[0]} size="server" />}
            label={guild.name}
            meta={s.voice ? { text: `${s.voice} ${s.voice === 1 ? "friend" : "friends"} in voice`, live: true } : null}
            count={s.mentions}
            mention
            dot={s.unread && !s.muted && !s.mentions}
            unread={s.unread && !s.muted}
            muted={s.muted && !s.mentions}
            selected={selected}
            onClick={() => openGuild(guildId)}
            onContextMenu={e => openMenu(e, [
                <Menu.MenuItem key="open" id="dk-open" label="Open" action={() => openGuild(guildId)} />,
                (s.unread || s.mentions > 0) && <Menu.MenuItem key="read" id="dk-read" label="Mark server as read" action={() => markRead(guildChannelIds(guildId))} />
            ])}
        />
    );
}

function FolderRow({ folder, open, onToggle }: { folder: { folderName?: string; folderColor?: number; guildIds: string[]; }; open: boolean; onToggle(): void; }) {
    const sig = useStateFromStores([GuildReadStateStore, UserGuildSettingsStore], () => JSON.stringify({
        unread: folder.guildIds.some(id => GuildReadStateStore.hasUnread(id) && !UserGuildSettingsStore.isMuted(id)),
        mentions: folder.guildIds.reduce((n, id) => n + GuildReadStateStore.getMentionCount(id), 0)
    }), [folder]);
    const s = JSON.parse(sig);
    const name = folder.folderName || folder.guildIds.map(id => GuildStore.getGuild(id)?.name).filter(Boolean).slice(0, 2).join(", ");
    const color = folder.folderColor != null ? `#${folder.folderColor.toString(16).padStart(6, "0")}` : undefined;
    return (
        <Row
            icon={<span className="dk-sb-icon dk-sb-server dk-sb-foldericon" style={{ boxShadow: color ? `inset 2px 0 0 ${color}` : undefined }} aria-hidden>{open ? "▾" : "▸"}</span>}
            label={name}
            where={`${folder.guildIds.length}`}
            count={open ? 0 : s.mentions}
            mention
            dot={!open && s.unread && !s.mentions}
            unread={!open && s.unread}
            onClick={onToggle}
        />
    );
}

// ── Sections ─────────────────────────────────────────────────────────────────

function DirectSection() {
    const ids = useStateFromStores([ReadStateStore, PrivateChannelReadStateStore, ChannelStore], selectDirect, [], sameList);
    const [all, setAll] = useState(false);
    if (!ids.length) return null;
    const shown = all ? ids : ids.slice(0, DIRECT_MAX);
    const mentionChannels = selectMentionChannels();
    return (
        <Section id="direct" label="DMs & mentions" aside={mentionChannels.length > 0 && (
            <button className="dk-sb-link" data-dk-nav title="Marks channel mentions read. DMs stay until you open them."
                onClick={() => markRead(mentionChannels)}>Mark mentions read</button>
        )}>
            {shown.map(id => <ConversationRow key={id} id={id} />)}
            {ids.length > DIRECT_MAX && (
                <button className="dk-sb-more" onClick={() => setAll(!all)} data-dk-nav>
                    {all ? "Show fewer" : `${ids.length - DIRECT_MAX} more`}
                </button>
            )}
        </Section>
    );
}

function FavoritesSection() {
    settings.use(["favorites"]); // subscribe; the list itself is per account
    const list = getFavorites();
    return (
        <Section id="favorites" label="Favorites">
            {list.length
                ? list.map(f => <ConversationRow key={f.id} id={f.id} fallback={f.label} inFavorites />)
                : <p className="dk-sb-empty">Right-click any person, group or channel › Add to Favorites</p>}
        </Section>
    );
}

function MessagesSection() {
    const [more, setMore] = useState(false);
    const { recent, quiet } = useStateFromStores(
        [PrivateChannelSortStore, ReadStateStore, SelectedChannelStore, ChannelStore],
        selectMessages, [],
        (a, b) => sameList(a.recent, b.recent) && sameList(a.quiet, b.quiet)
    );
    const requests = useStateFromStores([MessageRequestStore], selectRequestCount);
    settings.use(["favorites"]);
    const fav = new Set(getFavorites().map(f => f.id));
    const recentShown = recent.filter(id => !fav.has(id));
    const quietShown = quiet.filter(id => !fav.has(id));
    const shown = more ? [...recentShown, ...quietShown] : recentShown.slice(0, MESSAGES_MAX);
    const hidden = recentShown.length - Math.min(recentShown.length, MESSAGES_MAX) + quietShown.length;
    return (
        <Section id="messages" label="Messages" aside={<button className="dk-sb-link" onClick={openFriends} data-dk-nav>Friends</button>}>
            {shown.map(id => <ConversationRow key={id} id={id} />)}
            {hidden > 0 && !more && (
                <button className="dk-sb-more" onClick={() => setMore(true)} data-dk-nav>Older conversations · {hidden}</button>
            )}
            {more && <button className="dk-sb-more" onClick={() => setMore(false)} data-dk-nav>Show fewer</button>}
            {requests > 0 && <Row icon={<span className="dk-sb-icon dk-sb-hash" aria-hidden>?</span>} label="Message requests" count={requests} onClick={openRequests} />}
        </Section>
    );
}

function ServersSection() {
    const folders = useStateFromStores([SortedGuildStoreTyped as any], () => SortedGuildStoreTyped.getGuildFolders(), [],
        (a, b) => a.length === b.length && a.every((f, i) => f.folderId === b[i].folderId && sameList(f.guildIds, b[i].guildIds)));
    const { openFolders, collapseMuted } = settings.use(["openFolders", "collapseMuted"]);
    const tucked = useStateFromStores([UserGuildSettingsStore, GuildReadStateStore], () => !collapseMuted ? [] :
        folders.filter(f => !f.folderId).map(f => f.guildIds[0])
            .filter(id => UserGuildSettingsStore.isMuted(id) && !GuildReadStateStore.getMentionCount(id)),
    [folders, collapseMuted], sameList);
    const [showTucked, setShowTucked] = useState(false);
    const tuckedSet = new Set(tucked);

    return (
        <Section id="servers" label="Servers">
            {folders.map(folder => {
                if (!folder.folderId) {
                    const id = folder.guildIds[0];
                    return tuckedSet.has(id) && !showTucked ? null : <GuildRow key={id} guildId={id} />;
                }
                const key = String(folder.folderId);
                const open = !!openFolders[key];
                return (
                    <div key={key} className="dk-sb-folder" data-open={open || undefined}>
                        <FolderRow folder={folder} open={open}
                            onToggle={() => settings.store.openFolders = { ...settings.store.openFolders, [key]: !open }} />
                        {open && folder.guildIds.map(id => <GuildRow key={id} guildId={id} />)}
                    </div>
                );
            })}
            {tucked.length > 0 && (
                <button className="dk-sb-more" onClick={() => setShowTucked(!showTucked)} data-dk-nav>
                    {showTucked ? "Hide muted servers" : `${tucked.length} muted`}
                </button>
            )}
        </Section>
    );
}

function ReturnRow({ routeGuildId }: { routeGuildId?: string | null; }) {
    const place = React.useSyncExternalStore(navState.subscribe, navState.lastPlace);
    const channel = useStateFromStores([ChannelStore], () => place ? ChannelStore.getChannel(place.channelId) : null, [place]);
    if (!place || !channel || routeGuildId === place.guildId) return null;
    const guild = GuildStore.getGuild(place.guildId);
    return (
        <button className="dk-sb-return" data-dk-nav
            onClick={() => { drillIn(); NavigationRouter.transitionTo(`/channels/${place.guildId}/${place.channelId}`); }}
            title={`Return to ${labelFor(channel)}${guild ? ` · ${guild.name}` : ""}`}>
            <span className="dk-sb-icon dk-sb-hash" aria-hidden>↩</span>
            <span className="dk-sb-name">Return to {labelFor(channel)}</span>
            {guild && <span className="dk-sb-where">{guild.name}</span>}
        </button>
    );
}

// ── Keyboard: ↑/↓ walk the rows, Home/End jump; focus never opens or marks anything read ──

function onNavKey(e: KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-dk-nav]")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : i + (e.key === "ArrowDown" ? 1 : -1);
    items[Math.max(0, Math.min(items.length - 1, next))]?.focus();
    e.preventDefault();
}

let savedScroll = 0;

// ── The sidebar ──────────────────────────────────────────────────────────────

export function Sidebar({ guildId: routeGuildId, selectedChannelId, GuildSidebar }: ChannelAreaProps) {
    const drilled = useDrilled(routeGuildId);
    const scroller = useRef<HTMLDivElement>(null);

    useEffect(() => noteRoute(routeGuildId, selectedChannelId), [routeGuildId, selectedChannelId]);
    useEffect(() => {
        if (drilled || !scroller.current) return;
        const el = scroller.current;
        el.scrollTop = savedScroll;
        return () => void (savedScroll = el.scrollTop);
    }, [drilled]);

    const jump = (
        <button className="dk-sb-jump" onClick={openQuickSwitcher} data-dk-nav>
            <span>Jump to…</span><kbd>Ctrl K</kbd>
        </button>
    );

    if (drilled) {
        return (
            <nav className="dk-sb dk-sb-drilled" aria-label="Sidebar" onKeyDown={onNavKey}>
                {jump}
                <button className="dk-sb-back" onClick={() => backOut(drilled)} data-dk-nav title="Back to everything (keeps this conversation open)">
                    <span aria-hidden>←</span> All servers
                </button>
                <div className="dk-sb-guild-tree">
                    <GuildSidebar
                        key={drilled}
                        guildId={drilled}
                        selectedChannelId={drilled === routeGuildId ? selectedChannelId : SelectedChannelStore.getChannelId(drilled)}
                    />
                </div>
            </nav>
        );
    }

    return (
        <nav className="dk-sb" aria-label="Sidebar" onKeyDown={onNavKey}>
            {jump}
            <div className="dk-sb-scroll" ref={scroller}>
                <ReturnRow routeGuildId={routeGuildId} />
                <DirectSection />
                <FavoritesSection />
                <MessagesSection />
                <ServersSection />
            </div>
        </nav>
    );
}
