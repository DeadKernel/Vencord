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
import { filters, findStoreLazy, mapMangledModuleLazy } from "@webpack";
import {
    ActiveJoinedThreadsStore, ApplicationStreamingStore, ChannelStore, FluxDispatcher, GuildChannelStore, GuildReadStateStore,
    MessageRequestStore, NavigationRouter,
    PresenceStore, PrivateChannelSortStore, ReadStateStore, RelationshipStore, SelectedChannelStore, UserGuildSettingsStore,
    UserStore, VoiceStateStore
} from "@webpack/common";

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

const QuickSwitcher = mapMangledModuleLazy("QUICKSWITCHER_OPENED", {
    show: filters.byCode('"KEYBIND"')
});

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
    backedOutOf: () => backedOutOf,
    lastPlace: () => lastPlace
};

export function backOut(guildId: string) {
    backedOutOf = guildId;
    emit();
}

/** Called on every route change: entering a server clears "backed out" for any other server. */
export function noteRoute(guildId: string | null | undefined, channelId: string | null | undefined) {
    let changed = false;
    if (guildId && backedOutOf && backedOutOf !== guildId) { backedOutOf = null; changed = true; }
    if (guildId && channelId && (lastPlace?.guildId !== guildId || lastPlace.channelId !== channelId)) {
        lastPlace = { guildId, channelId };
        changed = true;
    }
    if (changed) emit();
}

// ── Favorites ────────────────────────────────────────────────────────────────

const me = () => UserStore.getCurrentUser()?.id ?? "unknown";

export function getFavorites(): Favorite[] {
    return settings.store.favorites[me()] ?? [];
}

function setFavorites(list: Favorite[]) {
    settings.store.favorites = { ...settings.store.favorites, [me()]: list };
}

export const isFavorite = (id: string) => getFavorites().some(f => f.id === id);

export function addFavorite(id: string) {
    if (isFavorite(id)) return;
    setFavorites([...getFavorites(), { id, label: labelFor(ChannelStore.getChannel(id)) }]);
}

export function removeFavorite(id: string) {
    setFavorites(getFavorites().filter(f => f.id !== id));
}

export function moveFavorite(id: string, by: -1 | 1) {
    const list = [...getFavorites()];
    const i = list.findIndex(f => f.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setFavorites(list);
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
    if (inCall) return { text: channel.type === 3 ? `voice · ${inCall}` : "in call", live: true };
    if (channel.type !== 1) return null;
    const uid = channel.recipients[0];
    if (ApplicationStreamingStore.getAnyStreamForUser(uid)) return { text: "streaming", live: true };
    if (VoiceStateStore.getVoiceStateForUser(uid)?.channelId) return { text: "in voice", live: true };
    return null;
}

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
    const guildId = channel.getGuildId?.() ?? (channel as any).guild_id;
    NavigationRouter.transitionTo(guildId ? `/channels/${guildId}/${id}` : `/channels/@me/${id}`);
}

export function openGuild(guildId: string) {
    const last = SelectedChannelStore.getChannelId(guildId);
    if (last) NavigationRouter.transitionTo(`/channels/${guildId}/${last}`);
    else NavigationRouter.transitionToGuild(guildId);
}

export const openFriends = () => NavigationRouter.transitionTo("/channels/@me");
export const openRequests = () => NavigationRouter.transitionTo("/message-requests");
