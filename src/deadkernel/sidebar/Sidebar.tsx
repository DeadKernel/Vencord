/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classes } from "@utils/misc";
import { Channel } from "@vencord/discord-types";
import {
    ApplicationStreamingStore, ChannelStore, GuildReadStateStore, GuildStore, IconUtils, MessageRequestStore, NavigationRouter,
    PresenceStore, PrivateChannelSortStore, React, ReadStateStore, RelationshipStore, SelectedChannelStore, SelectedGuildStore,
    useEffect, useRef, UserGuildSettingsStore, UserStore, useState, useStateFromStores, VoiceStateStore
} from "@webpack/common";
import type { ComponentType, KeyboardEvent, MouseEvent, ReactNode } from "react";

import { track } from "../core/telemetry";
import { actionsFor, RowActions } from "./actions";
import { Column } from "./Column";
import {
    addFavorite, backOut, callChannel, DirectItem, drillIn, getFavorites, guildChannelIds, guildSignal, isFavorite, joinVoice, labelFor, markRead, moveFavorite,
navState, noteRoute, openAddServer, openChannel, openFriends, openGuild, openQuickSwitcher, openRequests, openVoiceChat, presenceWord, PrivateChannelReadStateStore,
    removeFavorite, sameList, selectDirectGrouped, selectMentionChannels, selectMessages, selectRequestCount, settings, SortedGuildStoreTyped,
    suppressBroadcasts, useFavorites,
userPresence } from "./data";
import { openGuildMenu } from "./discordMenus";
import { ContextItem, openMenu } from "./menu";
import { occupants, VoiceMembers } from "./voice";

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

/** The server the sidebar is showing, or null for the top level. */
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
            {!closed && <div className="dk-sb-rows">{children}</div>}
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
    /** the channel or server id, for tests (personal/tools/actions.mjs) */
    dataId?: string;
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
            data-dk-id={p.dataId}
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

export function Square({ src, text, presence, size = "person" }: { src?: string | null; text?: string; presence?: string; size?: "person" | "server"; }) {
    return (
        <span className={`dk-sb-icon dk-sb-${size}`}>
            {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : <span className="dk-sb-glyph">{text}</span>}
            {presence && presence !== "offline" && <i className={`dk-sb-status dk-${presence}`} title={presence} />}
        </span>
    );
}

const isVoiceChannel = (c?: Channel | null) => c?.type === 2 || c?.type === 13;

function avatarSrc(channel: Channel) {
    if (channel.type === 1) return UserStore.getUser(channel.recipients[0])?.getAvatarURL(undefined, 48);
    if (channel.type === 3 && channel.icon) return IconUtils.getChannelIconURL({ id: channel.id, icon: channel.icon, size: 48 } as any);
    return null;
}

export const guildIcon = (guildId: string) => {
    const g = GuildStore.getGuild(guildId);
    return g?.icon ? IconUtils.getGuildIconURL({ id: g.id, icon: g.icon, size: 40 }) : null;
};

export function channelIcon(channel: Channel, presence?: string) {
    if (channel.type === 1 || channel.type === 3)
        return <Square src={avatarSrc(channel)} text={labelFor(channel)[0]} presence={presence} />;
    const glyph = channel.isThread?.() ? "↳" : channel.type === 2 ? "♪" : channel.type === 15 ? "≡" : "#";
    return <span className="dk-sb-icon dk-sb-hash" aria-hidden>{glyph}</span>;
}

function conversationMenu(id: string, inFavorites: boolean): ContextItem[] {
    const list = getFavorites();
    const index = list.findIndex(f => f.id === id);
    const unread = ReadStateStore.hasUnread(id) || ReadStateStore.getMentionCount(id) > 0;
    const channel = ChannelStore.getChannel(id);
    const voice = channel?.type === 2 || channel?.type === 13;
    const callable = channel?.type === 1 || channel?.type === 3;
    return [
        voice
            ? { id: "join", label: "Join", action: () => joinVoice(channel!) }
            : { id: "open", label: "Open", action: () => openChannel(id) },
        voice && { id: "chat", label: "Open chat", action: () => openVoiceChat(channel!) },
        callable && { id: "call", label: "Call", action: () => callChannel(channel!) },
        unread && { id: "read", label: "Mark as read", action: () => markRead([id]) },
        isFavorite(id)
            ? { id: "unfav", label: "Remove from Favorites", action: () => removeFavorite(id) }
            : { id: "fav", label: "Add to Favorites", action: () => addFavorite(id) },
        inFavorites && index > 0 && { id: "up", label: "Move up", action: () => moveFavorite(id, -1) },
        inFavorites && index < list.length - 1 && { id: "down", label: "Move down", action: () => moveFavorite(id, 1) }
    ];
}

// ── Rows bound to Discord data (plain functions, not React.memo: Vencord's React resolves after
// module load, and each row subscribes to its own data anyway) ──

function ConversationRow({ id, fallback, inFavorites, onOpen }: { id: string; fallback?: string; inFavorites?: boolean; onOpen?(): void; }) {
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
            count={mentions}
            mention={!isDm}
            dot={unread && !mentions}
            unread={unread}
            selected={selected}
            dataId={id}
            onClick={onOpen ?? (() => openChannel(id))}
            onContextMenu={menu}
        />
    );
}

/** A favourite: voice channels join on click (Discord's own click opens the full-screen call view). */
function FavoriteRow({ id, label }: { id: string; label: string; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(id), [id]);
    const voice = isVoiceChannel(channel);
    return (
        <div className="dk-sb-rowwrap">
            <ConversationRow id={id} fallback={label} inFavorites onOpen={voice && channel ? () => joinVoice(channel) : undefined} />
            <RowActions actions={actionsFor(channel)} />
        </div>
    );
}

/** One row per server in DMs & mentions: "VALORANT · in 2 channels · @37". */
function ServerMentionRow({ guildId, channelIds, mentions }: { guildId: string; channelIds: string[]; mentions: number; }) {
    const guild = useStateFromStores([GuildStore], () => GuildStore.getGuild(guildId), [guildId]);
    if (!guild) return null;
    const where = channelIds.length === 1 ? `#${ChannelStore.getChannel(channelIds[0])?.name ?? ""}` : `in ${channelIds.length} channels`;
    return (
        <Row
            icon={<Square src={guildIcon(guildId)} text={guild.name[0]} size="server" />}
            label={guild.name}
            where={where}
            count={mentions}
            mention
            unread
            onClick={() => openChannel(channelIds[0])}
            onContextMenu={e => openMenu(e, [
                { id: "open", label: channelIds.length === 1 ? "Open" : "Open newest", action: () => openChannel(channelIds[0]) },
                { id: "read", label: "Mark as read", action: () => markRead(channelIds) },
                { id: "suppress", label: "Stop @everyone and role pings here", action: () => suppressBroadcasts(guildId) }
            ])}
        />
    );
}

function GuildRow({ guildId }: { guildId: string; }) {
    const guild = useStateFromStores([GuildStore], () => GuildStore.getGuild(guildId), [guildId]);
    const signal = useStateFromStores(guildStores(), () => JSON.stringify(guildSignal(guildId)), [guildId]);
    const selected = useStateFromStores([SelectedGuildStore], () => SelectedGuildStore.getGuildId() === guildId, [guildId]);
    if (!guild) return null;
    const s = JSON.parse(signal);
    return (
        <Row
            icon={<Square src={guildIcon(guildId)} text={(guild as any).acronym ?? guild.name[0]} size="server" />}
            label={guild.name}
            meta={s.voice ? { text: `${s.voice} ${s.voice === 1 ? "friend" : "friends"} in voice`, live: true } : null}
            count={s.mentions}
            mention
            dot={s.unread && !s.muted && !s.mentions}
            unread={s.unread && !s.muted}
            muted={s.muted && !s.mentions}
            selected={selected}
            onClick={() => openGuild(guildId)}
            onContextMenu={e => openGuildMenu(e, guildId, [
                { id: "open", label: "Open", action: () => openGuild(guildId) },
                (s.unread || s.mentions > 0) && { id: "read", label: "Mark server as read", action: () => markRead(guildChannelIds(guildId)) },
                { id: "suppress", label: "Stop @everyone and role pings here", action: () => suppressBroadcasts(guildId) }
            ])}
        />
    );
}

type Folder = { folderId?: number | string; folderName?: string; folderColor?: number; guildIds: string[]; };

function FolderRow({ folder, open, onToggle }: { folder: Folder; open: boolean; onToggle(): void; }) {
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

const useFolders = () => useStateFromStores([SortedGuildStoreTyped as any], () => SortedGuildStoreTyped.getGuildFolders(), [],
    (a: Folder[], b: Folder[]) => a.length === b.length && a.every((f, i) => f.folderId === b[i].folderId && sameList(f.guildIds, b[i].guildIds)));

// ── Top-level sections ───────────────────────────────────────────────────────

function DirectSection() {
    const json = useStateFromStores([ReadStateStore, PrivateChannelReadStateStore, ChannelStore], selectDirectGrouped, []);
    const [all, setAll] = useState(false);
    const items: DirectItem[] = JSON.parse(json);
    if (!items.length) return null;
    const shown = all ? items : items.slice(0, DIRECT_MAX);
    const hasMentions = items.some(i => i.kind === "server");
    return (
        <Section id="direct" label="DMs & mentions" aside={hasMentions && (
            <button className="dk-sb-link" data-dk-nav title="Mark channel mentions read (DMs stay until you open them)"
                onClick={() => { track("mark_mentions_read"); markRead(selectMentionChannels()); }}>Mark read</button>
        )}>
            {shown.map(item => item.kind === "dm"
                ? <ConversationRow key={item.id} id={item.id} />
                : <ServerMentionRow key={item.guildId} guildId={item.guildId} channelIds={item.channelIds} mentions={item.mentions} />)}
            {items.length > DIRECT_MAX && (
                <button className="dk-sb-more" onClick={() => setAll(!all)} data-dk-nav>
                    {all ? "Show fewer" : `${items.length - DIRECT_MAX} more`}
                </button>
            )}
        </Section>
    );
}

function FavoritesSection() {
    useFavorites();
    const list = getFavorites();
    const key = list.map(f => f.id).join(",");
    // A favourite voice channel lists who's in it; a favourite person already listed there doesn't
    // get a second row until they leave (one person, one place).
    const inCalls = useStateFromStores([VoiceStateStore, ChannelStore], () => list
        .filter(f => isVoiceChannel(ChannelStore.getChannel(f.id)))
        .flatMap(f => occupants(f.id)).sort().join(","), [key]);
    const listed = new Set(inCalls ? inCalls.split(",") : []);
    return (
        <Section id="favorites" label="Favorites">
            {list.length
                ? list.map(f => {
                    const c = ChannelStore.getChannel(f.id);
                    if (c?.type === 1 && listed.has(c.recipients[0])) return null;
                    return (
                        <React.Fragment key={f.id}>
                            <FavoriteRow id={f.id} label={f.label} />
                            {isVoiceChannel(c) && <VoiceMembers channelId={f.id} max={6} />}
                        </React.Fragment>
                    );
                })
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
    useFavorites();
    const fav = new Set(getFavorites().map(f => f.id));
    const recentShown = recent.filter(id => !fav.has(id));
    const quietShown = quiet.filter(id => !fav.has(id));
    const shown = more ? [...recentShown, ...quietShown] : recentShown.slice(0, MESSAGES_MAX);
    const hidden = recentShown.length - Math.min(recentShown.length, MESSAGES_MAX) + quietShown.length;
    return (
        <Section id="messages" label="Messages">
            {shown.map(id => <ConversationRow key={id} id={id} />)}
            {hidden > 0 && !more && <button className="dk-sb-more" onClick={() => setMore(true)} data-dk-nav>Older conversations · {hidden}</button>}
            {more && <button className="dk-sb-more" onClick={() => setMore(false)} data-dk-nav>Show fewer</button>}
            {/* mostly strangers: a dim count, not pink (pink means someone needs you) */}
            {requests > 0 && <Row icon={<span className="dk-sb-icon dk-sb-hash" aria-hidden>?</span>} label="Message requests" meta={{ text: `· ${requests}`, live: false }} onClick={openRequests} />}
        </Section>
    );
}

function ServersSection() {
    const folders = useFolders();
    const { openFolders, collapseMuted } = settings.use(["openFolders", "collapseMuted"]);
    const tucked = useStateFromStores([UserGuildSettingsStore, GuildReadStateStore], () => !collapseMuted ? [] :
        folders.filter(f => !f.folderId).map(f => f.guildIds[0])
            .filter(id => UserGuildSettingsStore.isMuted(id) && !GuildReadStateStore.getMentionCount(id)),
    [folders, collapseMuted], sameList);
    const [showTucked, setShowTucked] = useState(false);
    const tuckedSet = new Set(tucked);

    return (
        <Section id="servers" label="Servers" aside={<button className="dk-sb-link" onClick={openAddServer} data-dk-nav title="Create a server, or join one with an invite">Add</button>}>
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
            onClick={() => { track("return_row"); drillIn(); NavigationRouter.transitionTo(`/channels/${place.guildId}/${place.channelId}`); }}
            title={`Return to ${labelFor(channel)}${guild ? ` · ${guild.name}` : ""}`}>
            <span className="dk-sb-icon dk-sb-hash" aria-hidden>↩</span>
            <span className="dk-sb-name">Return to {labelFor(channel)}</span>
            {guild && <span className="dk-sb-where">{guild.name}</span>}
        </button>
    );
}

/** The way back to Home from anywhere: who's in voice, who's around, recent DMs. */
function HomeRow({ selected }: { selected: boolean; }) {
    return (
        <Row icon={<span className="dk-sb-icon dk-sb-hash" aria-hidden>⌂</span>} label="Home" selected={selected} onClick={() => { track("home_row"); openFriends(); }} />
    );
}

function JumpRow() {
    return (
        <button className="dk-sb-row dk-sb-jump" onClick={openQuickSwitcher} data-dk-nav title="Jump to anything (Ctrl K)">
            <span className="dk-sb-icon dk-sb-hash" aria-hidden>⌕</span>
            <span className="dk-sb-name">Jump to…</span>
            <span className="dk-sb-trail"><kbd>Ctrl K</kbd></span>
        </button>
    );
}

// ── Keyboard: ↑/↓ walk the rows, Home/End jump; focus never opens or marks anything read ──

function onNavKey(e: KeyboardEvent<HTMLElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const layer = (document.activeElement as HTMLElement | null)?.closest(".dk-layer") ?? e.currentTarget;
    const items = [...layer.querySelectorAll<HTMLElement>("[data-dk-nav]")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : i + (e.key === "ArrowDown" ? 1 : -1);
    items[Math.max(0, Math.min(items.length - 1, next))]?.focus();
    e.preventDefault();
}

let savedScroll = 0;

/** Hidden layers stay mounted (for the transitions) but take no focus or clicks. Set as an attribute:
 * React's typing and Discord's React version disagree on the `inert` prop. */
function useInert(ref: React.RefObject<HTMLElement | null>, inert: boolean) {
    useEffect(() => {
        if (inert) ref.current?.setAttribute("inert", "");
        else ref.current?.removeAttribute("inert");
    }, [inert]);
}

// ── The sidebar: everything, always; inside a server its channel column opens beside it.
// personal/SCREENS.md "Inside a server". ──

/** The sidebar widens by the column; only while it opens or closes does the width animate, so
 * dragging Discord's resize handle stays instant. */
function useWidthTransition(drilled: string | null) {
    const first = useRef(true);
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        const root = document.documentElement;
        root.dataset.dkSbAnim = "";
        const t = window.setTimeout(() => { delete root.dataset.dkSbAnim; }, 320);
        return () => { clearTimeout(t); delete root.dataset.dkSbAnim; };
    }, [!!drilled]);
}

export function Sidebar({ guildId: routeGuildId, selectedChannelId, GuildSidebar }: ChannelAreaProps) {
    const drilled = useDrilled(routeGuildId);
    const [columnGuild, setColumnGuild] = useState<string | null>(drilled);
    const scroller = useRef<HTMLDivElement>(null);
    const columnRef = useRef<HTMLDivElement>(null);

    useEffect(() => { noteRoute(routeGuildId, selectedChannelId); }, [routeGuildId, selectedChannelId]);
    // the column keeps its last server while it closes
    useEffect(() => { if (drilled) setColumnGuild(drilled); }, [drilled]);
    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        el.scrollTop = savedScroll;
        return () => void (savedScroll = el.scrollTop);
    }, []);
    useWidthTransition(drilled);
    useInert(columnRef, !drilled);

    return (
        <nav className="dk-sb" aria-label="Sidebar" data-mode={drilled ? "server" : "top"} onKeyDown={onNavKey}>
            <div className="dk-layer dk-layer-top">
                <div className="dk-sb-scroll" ref={scroller}>
                    <JumpRow />
                    <HomeRow selected={!routeGuildId && !selectedChannelId} />
                    <ReturnRow routeGuildId={routeGuildId} />
                    <DirectSection />
                    <FavoritesSection />
                    <MessagesSection />
                    <ServersSection />
                </div>
            </div>
            <div className="dk-layer dk-layer-column" ref={columnRef}>
                {columnGuild && (
                    <Column
                        key={columnGuild}
                        guildId={columnGuild}
                        selectedChannelId={columnGuild === routeGuildId ? selectedChannelId : null}
                        GuildSidebar={GuildSidebar}
                        onBack={() => backOut(columnGuild)}
                    />
                )}
            </div>
        </nav>
    );
}
