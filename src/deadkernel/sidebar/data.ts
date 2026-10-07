/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Everything the sidebar reads comes from Discord's own stores, and the only things it writes are
// its own favorites and folder state. Discord alone decides what is read (personal/SIDEBAR.md).

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { Channel } from "@vencord/discord-types";
import { filters, findByPropsLazy, findStoreLazy, mapMangledModuleLazy } from "@webpack";
import {
    ActiveJoinedThreadsStore, ApplicationStreamingStore, ChannelStore, DraftStore, DraftType, FluxDispatcher, GuildChannelStore, GuildMemberCountStore, GuildReadStateStore,
    GuildStore,
    MessageRequestStore, NavigationRouter,
    PresenceStore, PrivateChannelSortStore, ReadStateStore, RelationshipStore, SelectedChannelStore, TypingStore, UserGuildSettingsStore,
UserStore, useStateFromStores, VoiceStateStore
} from "@webpack/common";

import { track } from "../core/telemetry";

export interface Favorite {
    id: string;
    /** shown when the channel isn't loaded (archived thread, left server) */
    label: string;
}

export const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Use the new sidebar (switches live; off shows Discord's server rail and channel list)",
        default: true,
        onChange: applyAttr
    },
    quietDays: {
        type: OptionType.NUMBER,
        description: "Messages: conversations without a message for this many days move under \"Older conversations\"",
        default: 30
    },
    collapseMuted: {
        type: OptionType.BOOLEAN,
        description: "Servers: tuck muted servers (without mentions) behind one row",
        default: false
    },
    favorites: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, Favorite[]>
    },
    openFolders: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, boolean>
    },
    closedSections: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, boolean>
    },
    home: {
        type: OptionType.BOOLEAN,
        description: "Home: who's in voice, who's around and recent conversations, instead of Discord's Friends tabs",
        default: true
    },
    palette: {
        type: OptionType.BOOLEAN,
        description: "Ctrl K: a quieter switcher that knows your favorites and where you've been, with > for actions",
        default: true
    },
    /** channelId → when he last opened it (written only on navigation he does) */
    opened: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, number>
    },
    /** Focus: 0 off, -1 until he ends it, otherwise when it ends (focus.ts) */
    focusUntil: {
        type: OptionType.CUSTOM,
        default: 0
    },
    /** guildId → show every channel (Discord's own tree) instead of only the live ones */
    showAll: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, boolean>
    }
});

export function applyAttr() {
    if (settings.store.enabled) document.documentElement.dataset.dkSidebar = "";
    else delete document.documentElement.dataset.dkSidebar;
}

export const PrivateChannelReadStateStore = findStoreLazy("PrivateChannelReadStateStore");
export const SortedGuildStoreTyped = findStoreLazy("SortedGuildStore") as {
    getGuildFolders(): { folderId?: number | string; folderName?: string; folderColor?: number; guildIds: string[]; }[];
};

// "QUICKSWITCHER_OPENED" is in three modules; this find is unique (personal research, screens-tech §4.3).
// The palette keeps Discord's search and ranking and only replaces the look (personal/SCREENS.md).
export const QuickSwitcher = mapMangledModuleLazy('type:"QUICKSWITCHER_SEARCH"', {
    show: filters.byCode('"KEYBIND"'),
    hide: filters.byCode("QUICKSWITCHER_CLOSED"),
    search: filters.byCode('"QUICKSWITCHER_SEARCH"'),
    /** (result, isTextChannelMode): what Enter does in Discord's switcher */
    go: filters.byCode("navigationReplace:!0")
});
export const QuickSwitcherStore = findStoreLazy("QuickSwitcherStore");

export function openQuickSwitcher() {
    try {
        QuickSwitcher.show("SIDEBAR", "");
    } catch {
        FluxDispatcher.dispatch({ type: "QUICKSWITCHER_SHOW", query: "", queryMode: null });
    }
}

// ── Where you are ────────────────────────────────────────────────────────────
// "drilled" = the sidebar shows a server (Discord's rail + that server's channel tree). Going
// back to "All servers" keeps the open conversation; the next server you open drills in again.

let backedOutOf: string | null = null;
let lastPlace: { guildId: string; channelId: string; } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const navState = {
    subscribe(l: () => void) { listeners.add(l); return () => void listeners.delete(l); },
    backedOutOf: () => backedOutOf
};

export function backOut(guildId: string) {
    track("column_close");
    backedOutOf = guildId;
    emit();
}

/** Any click that opens a server drills back in, even if the route doesn't change. */
export function drillIn() {
    if (backedOutOf === null) return;
    backedOutOf = null;
    emit();
}

/** Called on every route change. "Backed out" only lasts until you go somewhere else. */
export function noteRoute(guildId: string | null | undefined, channelId: string | null | undefined) {
    let changed = false;
    const moved = lastPlace?.guildId !== guildId || lastPlace?.channelId !== channelId;
    if (backedOutOf && moved) { backedOutOf = null; changed = true; }
    if (guildId && channelId && (lastPlace?.guildId !== guildId || lastPlace.channelId !== channelId)) {
        lastPlace = { guildId, channelId };
        changed = true;
    }
    if (channelId) noteOpened(channelId);
    if (changed) emit();
}

// ── Favorites ────────────────────────────────────────────────────────────────

const me = () => UserStore.getCurrentUser()?.id ?? "unknown";

export function getFavorites(): Favorite[] {
    return settings.store.favorites[me()] ?? [];
}

function setFavorites(list: Favorite[]) {
    // Plain copies only. settings.store hands out proxies; a proxy inside a new value can't be
    // cloned for saving, which threw before any listener ran: no re-render, nothing saved.
    const all: Record<string, Favorite[]> = JSON.parse(JSON.stringify(settings.plain.favorites ?? {}));
    all[me()] = list.map(f => ({ id: f.id, label: f.label }));
    settings.store.favorites = all;
}

export const isFavorite = (id: string) => getFavorites().some(f => f.id === id);

/** Re-renders when the favourites change, and once Discord knows who's logged in: favourites are
 * kept per account, and right after a reload the sidebar can render before the current user is set. */
export function useFavorites(): Favorite[] {
    settings.use(["favorites"]);
    useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    return getFavorites();
}

export function addFavorite(id: string) {
    track("favorite_add");
    if (isFavorite(id)) return;
    setFavorites([...getFavorites(), { id, label: labelFor(ChannelStore.getChannel(id)) }]);
}

export function removeFavorite(id: string) {
    track("favorite_remove");
    setFavorites(getFavorites().filter(f => f.id !== id));
}

/** Drag to reorder favourites: `id` lands just above or below `targetId`. The order is also Ctrl 1-9's. */
export function dropFavorite(id: string, targetId: string, below: boolean) {
    if (id === targetId) return;
    const list = getFavorites().filter(f => f.id !== id);
    const moved = getFavorites().find(f => f.id === id);
    const at = list.findIndex(f => f.id === targetId);
    if (!moved || at < 0) return;
    track("favorite_move");
    list.splice(below ? at + 1 : at, 0, moved);
    setFavorites(list);
}

/** Right-click › Move up / Move down */
export function moveFavorite(id: string, by: -1 | 1) {
    const list = getFavorites();
    const neighbour = list[list.findIndex(f => f.id === id) + by];
    if (neighbour) dropFavorite(id, neighbour.id, by === 1);
}

// ── Names ────────────────────────────────────────────────────────────────────

export function dmName(channel: Channel) {
    if (channel.type === 1) {
        const user = UserStore.getUser(channel.recipients[0]);
        return RelationshipStore.getNickname(channel.recipients[0]) || (user as any)?.globalName || user?.username || "Unknown";
    }
    if (channel.name) return channel.name;
    return channel.recipients.map(id => {
        const u = UserStore.getUser(id);
        return RelationshipStore.getNickname(id) || (u as any)?.globalName || u?.username;
    }).filter(Boolean).join(", ") || "Group";
}

export function labelFor(channel?: Channel | null): string {
    if (!channel) return "Unavailable";
    if (channel.type === 1 || channel.type === 3) return dmName(channel);
    return channel.name;
}

// ── Time and order ───────────────────────────────────────────────────────────

const DISCORD_EPOCH = 1420070400000n;
export const snowflakeTime = (id?: string | null) => id ? Number((BigInt(id) >> 22n) + DISCORD_EPOCH) : 0;
const compareSnowflake = (a?: string | null, b?: string | null) => {
    const x = a ? BigInt(a) : 0n, y = b ? BigInt(b) : 0n;
    return x < y ? -1 : x > y ? 1 : 0;
};

export const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// ── Selectors (each returns ids so React only re-renders when membership or order changes) ──

const newestFirst = (a: string, b: string) => compareSnowflake(ReadStateStore.lastMessageId(b), ReadStateStore.lastMessageId(a));

/** Unread DMs and group DMs first (people), then channels with a mention (Discord's own rules); newest first in each. */
export function selectDirect(): string[] {
    const dms = (PrivateChannelReadStateStore.getUnreadPrivateChannelIds?.() ?? [] as string[])
        .filter((id: string) => ChannelStore.getChannel(id) && !MessageRequestStore.isMessageRequest(id))
        .sort(newestFirst);
    const dmSet = new Set(dms);
    const mentions = (ReadStateStore.getMentionChannelIds?.() ?? [] as string[])
        .filter((id: string) => !dmSet.has(id) && ReadStateStore.getMentionCount(id) > 0 && ChannelStore.getChannel(id))
        .sort(newestFirst);
    return [...dms, ...mentions];
}

/** Channel mentions only (never DMs): what "Mark mentions read" clears. */
export const selectMentionChannels = () => selectDirect().filter(id => {
    const c = ChannelStore.getChannel(id);
    return c && c.type !== 1 && c.type !== 3;
});

// ── Marking read: only ever from an explicit click, through Discord's own bulk ack ──

export function markRead(channelIds: string[]) {
    const channels = channelIds
        .filter(id => ReadStateStore.hasUnread(id) || ReadStateStore.getMentionCount(id) > 0)
        .map(id => ({ channelId: id, messageId: ReadStateStore.lastMessageId(id), readStateType: 0 }));
    if (channels.length) FluxDispatcher.dispatch({ type: "BULK_ACK", context: "APP", channels });
}

export function guildChannelIds(guildId: string): string[] {
    const all = GuildChannelStore.getChannels(guildId);
    const threads = Object.values(ActiveJoinedThreadsStore.getActiveJoinedThreadsForGuild(guildId) ?? {})
        .flatMap(byParent => Object.keys(byParent as object));
    return [...all.SELECTABLE, ...all.VOCAL].map((c: { channel: { id: string; }; }) => c.channel.id).concat(threads);
}

function isBotDm(channel: Channel) {
    return channel.type === 1 && !!UserStore.getUser(channel.recipients[0])?.bot;
}

/** DMs in Discord's order (latest first), split into recent and older. */
export function selectMessages(): { recent: string[]; quiet: string[]; } {
    const cutoff = Date.now() - settings.store.quietDays * 864e5;
    const selected = SelectedChannelStore.getChannelId();
    const recent: string[] = [], quiet: string[] = [];
    for (const id of PrivateChannelSortStore.getPrivateChannelIds()) {
        const channel = ChannelStore.getChannel(id);
        if (!channel) continue;
        const unread = ReadStateStore.hasUnread(id);
        const last = snowflakeTime(ReadStateStore.lastMessageId(id) ?? channel.lastMessageId);
        if (unread || id === selected || (last > cutoff && !isBotDm(channel))) recent.push(id);
        else quiet.push(id);
    }
    return { recent, quiet };
}

export const selectRequestCount = () => MessageRequestStore.getMessageRequestsCount?.() ?? 0;

// ── Presence ─────────────────────────────────────────────────────────────────

export type Presence = "online" | "idle" | "dnd" | "offline" | "streaming";

export function userPresence(userId: string): Presence {
    if (ApplicationStreamingStore.getAnyStreamForUser(userId)) return "streaming";
    return (PresenceStore.getStatus(userId) ?? "offline") as Presence;
}

/** "in voice", "streaming", or "voice · N" for a group call; nothing for playing a game. */
export function presenceWord(channel: Channel): { text: string; live: boolean; } | null {
    const inCall = Object.keys(VoiceStateStore.getVoiceStatesForChannel(channel.id) ?? {}).length;
    if (inCall) return { text: channel.type === 3 ? `voice · ${inCall}` : channel.type === 1 ? "in call" : `${inCall} in call`, live: true };
    if (channel.type !== 1) return null;
    const uid = channel.recipients[0];
    if (ApplicationStreamingStore.getAnyStreamForUser(uid)) return { text: "streaming", live: true };
    if (VoiceStateStore.getVoiceStateForUser(uid)?.channelId) return { text: "in voice", live: true };
    return null;
}

/** What someone's doing, in words: "playing Valorant", "listening to …", or their custom status. */
export function activityOf(uid: string): string | null {
    if (ApplicationStreamingStore.getAnyStreamForUser(uid)) return "streaming";
    const acts = PresenceStore.getActivities(uid) ?? [];
    const game = acts.find((a: any) => a.type === 0 || a.type === 5);
    if (game) return `playing ${game.name}`;
    const listening = acts.find((a: any) => a.type === 2);
    if (listening) return `listening to ${listening.details ?? listening.name}`;
    const custom = acts.find((a: any) => a.type === 4 && a.state);
    return custom?.state ?? null;
}

/** The dim words at a conversation row's right: someone typing to you first, then calls and
 * streams, then (people only) what they're doing. Static text, never animated. */
export function rowMeta(channel: Channel): { text: string; live: boolean; } | null {
    if (channel.type === 1 || channel.type === 3) {
        const me = UserStore.getCurrentUser()?.id;
        const typing = Object.keys(TypingStore.getTypingUsers(channel.id) ?? {}).filter(u => u !== me);
        if (typing.length) return { text: "typing", live: true };
    }
    const presence = presenceWord(channel);
    if (presence) return presence;
    if (channel.type !== 1) return null;
    const activity = activityOf(channel.recipients[0]);
    return activity ? { text: activity, live: false } : null;
}

/** An unsent message he left in this conversation. */
export const hasDraft = (channelId: string) => !!DraftStore.getDraft(channelId, DraftType.ChannelMessage)?.trim();

/** Friends in voice in a server. Strangers in a big community's voice channels aren't news. */
export function guildVoiceFriends(guildId: string): number {
    const states = VoiceStateStore.getVoiceStates(guildId) ?? {};
    let n = 0;
    for (const uid in states) if (RelationshipStore.isFriend(uid)) n++;
    return n;
}

export interface GuildSignal { unread: boolean; mentions: number; muted: boolean; voice: number; }

export function guildSignal(guildId: string): GuildSignal {
    return {
        unread: GuildReadStateStore.hasUnread(guildId),
        mentions: GuildReadStateStore.getMentionCount(guildId),
        muted: UserGuildSettingsStore.isMuted(guildId),
        voice: guildVoiceFriends(guildId)
    };
}

// ── Navigation (only ever called from a click) ───────────────────────────────

export function openChannel(id: string) {
    const channel = ChannelStore.getChannel(id);
    if (!channel) return;
    // a voice channel's route alone is Discord's full-screen call view; open its chat, as Discord's
    // own "Open Chat" does (joining is always a separate, explicit action)
    if (channel.type === 2 || channel.type === 13) RtcActions.updateChatOpen(id, true);
    const guildId = channel.getGuildId?.() ?? (channel as any).guild_id;
    NavigationRouter.transitionTo(guildId ? `/channels/${guildId}/${id}` : `/channels/@me/${id}`);
}

export function openGuild(guildId: string) {
    track("server_open");
    drillIn();
    const last = SelectedChannelStore.getChannelId(guildId);
    if (last) NavigationRouter.transitionTo(`/channels/${guildId}/${last}`);
    else NavigationRouter.transitionToGuild(guildId);
}

const GuildMoveActions = findByPropsLazy("moveById", "createGuildFolderLocal");

/** Drag to reorder servers: Discord's own move (what its rail does on drop), which also saves the
 * order to his account. `targetId` is a server or folder id; inside an open folder, into it. */
export function moveServer(sourceId: string, targetId: string, below: boolean) {
    if (sourceId === targetId) return;
    track("server_move");
    GuildMoveActions.moveById(sourceId, targetId, below, false);
}

const GuildCreateActions = findByPropsLazy("openCreateGuildModal");
/** Discord's "Add a Server" (create, or join with an invite): the rail's + button, which is gone */
export function openAddServer() {
    track("add_server");
    GuildCreateActions.openCreateGuildModal({ location: "Guild List" });
}

export const openFriends = () => NavigationRouter.transitionTo("/channels/@me");
export const openRequests = () => NavigationRouter.transitionTo("/message-requests");

// ── "Opened by me": the one signal that separates the channels he uses from the ones he doesn't ──

const OPENED_KEEP = 500;

export function noteOpened(channelId: string) {
    const { opened } = settings.store;
    if (opened[channelId] && Date.now() - opened[channelId] < 60_000) return;
    const next = { ...opened, [channelId]: Date.now() };
    const ids = Object.keys(next);
    if (ids.length > OPENED_KEEP) {
        ids.sort((a, b) => next[a] - next[b]).slice(0, ids.length - OPENED_KEEP).forEach(id => delete next[id]);
    }
    settings.store.opened = next;
}

// ── DMs & mentions, grouped: one row per person, one row per server ──

export type DirectItem = { kind: "dm"; id: string; } | { kind: "server"; guildId: string; channelIds: string[]; mentions: number; };

export function selectDirectGrouped(): string {
    const items: DirectItem[] = [];
    const ids = selectDirect();
    const byGuild = new Map<string, string[]>();
    for (const id of ids) {
        const c = ChannelStore.getChannel(id);
        if (!c) continue;
        if (c.type === 1 || c.type === 3) { items.push({ kind: "dm", id }); continue; }
        const g = c.guild_id;
        if (!byGuild.has(g)) {
            byGuild.set(g, []);
            items.push({ kind: "server", guildId: g, channelIds: byGuild.get(g)!, mentions: 0 });
        }
        byGuild.get(g)!.push(id);
    }
    for (const item of items)
        if (item.kind === "server") item.mentions = item.channelIds.reduce((n, id) => n + ReadStateStore.getMentionCount(id), 0);
    return JSON.stringify(items);
}

// ── Discord's own actions (each only ever called from a click) ──

const NotificationActions = findByPropsLazy("updateGuildNotificationSettings");

/** Discord's per-server "Suppress @everyone and @here" + "Suppress all role @mentions". */
export function suppressBroadcasts(guildId: string) {
    track("suppress_pings");
    NotificationActions.updateGuildNotificationSettings(guildId, { suppress_everyone: true, suppress_roles: true });
}

const GuildSettingsSave = findByPropsLazy("saveUserGuildSettingsBulk");
const BROADCAST_MIN_MEMBERS = 100;

/** Communities (over 100 members) that still let @everyone and role pings through. Smaller
 * servers are mostly friends, where "@everyone voice?" is a real ask, so they're left alone. */
export function broadcastServers(): string[] {
    return Object.keys(GuildStore.getGuilds()).filter(id =>
        (GuildMemberCountStore.getMemberCount(id) ?? 0) > BROADCAST_MIN_MEMBERS
        && !(UserGuildSettingsStore.isSuppressEveryoneEnabled(id) && UserGuildSettingsStore.isSuppressRolesEnabled(id)));
}

/** The same setting as suppressBroadcasts, for many servers in one request: Discord's local update
 * per server, then one bulk save (what its own per-server call does, once instead of N times). */
export function suppressBroadcastsIn(guildIds: string[]) {
    track("suppress_pings_all");
    const change = { suppress_everyone: true, suppress_roles: true };
    for (const guildId of guildIds) FluxDispatcher.dispatch({ type: "USER_GUILD_SETTINGS_GUILD_UPDATE", guildId, settings: change });
    GuildSettingsSave.saveUserGuildSettingsBulk(Object.fromEntries(guildIds.map(id => [id, change])));
}

export function toggleMute(guildId: string) {
    track("mute_toggle");
    NotificationActions.updateGuildNotificationSettings(guildId, { muted: !UserGuildSettingsStore.isMuted(guildId) });
}

export const VoiceActions = findByPropsLazy("handleVoiceConnect");

export function joinVoice(channel: Channel) {
    track("voice_join");
    VoiceActions.handleVoiceConnect({
        channel,
        connected: VoiceStateStore.isInChannel(channel.id),
        needSubscriptionToAccess: false,
        locked: false
    });
}

const CallActions = findByPropsLazy("stopRinging", "call");
const RtcActions = findByPropsLazy("updateChatOpen");

/** Discord's call button in a DM or group: start the call and ring them. */
export function callChannel(channel: Channel) {
    track("dm_call");
    CallActions.call(channel.id, false, true, channel.type === 1 ? channel.recipients[0] : undefined);
}

/** A voice channel's text chat, the way Discord's "Open Chat" does it, without joining. */
export function openVoiceChat(channel: Channel) {
    track("voice_chat");
    openChannel(channel.id);
}

const ThreadActions = mapMangledModuleLazy("all threads must have parents", {
    openThread: filters.byCode("hideThreadCallUI")
});

/** Threads open beside the chat (Discord's split view), or full page if that's off. */
export function openThread(thread: Channel) {
    try {
        ThreadActions.openThread(thread, false);
    } catch {
        openChannel(thread.id);
    }
}

const CategoryActions = mapMangledModuleLazy('type:"CATEGORY_COLLAPSE_ALL"', {
    collapse: filters.byCode('"CATEGORY_COLLAPSE"'),
    expand: filters.byCode('"CATEGORY_EXPAND"')
});

export const toggleCategory = (id: string, collapsed: boolean) =>
    collapsed ? CategoryActions.expand(id) : CategoryActions.collapse(id);

export const ChannelListStore = findStoreLazy("ChannelListStore");
