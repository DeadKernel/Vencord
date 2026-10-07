/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Home's "For you": what's waiting for you, with what was said. The sidebar's DMs & mentions says
// where someone needs you; this says what they said, so you can catch up without opening channels.
// Only things addressed to you: direct mentions, replies to you, unread DMs. @everyone and role
// pings are one dim line. One line per person per place, newest first. Nothing here marks
// anything read except the ✓, and opening a line, which is Discord opening the message.
// personal/SCREENS.md "Home".
//
// Where the text comes from: Discord's own mentions list (what Ctrl I loads, with the inbox's own
// filters), fetched when Home opens and at most every five minutes; and for an unread DM, its
// latest message, read once per new message (the request Discord makes; it doesn't touch
// Discord's message cache, so opening the DM later behaves as usual).

import ErrorBoundary from "@components/ErrorBoundary";
import { Logger } from "@utils/Logger";
import { filters, find } from "@webpack";
import {
    ChannelStore, FluxDispatcher, GuildMemberStore, GuildRoleStore, GuildStore, NavigationRouter, PrivateChannelSortStore, ReadStateStore, RestAPI, useEffect, UserStore, useState, useStateFromStores
} from "@webpack/common";

import { track, trackError } from "../core/telemetry";
import { ago, labelFor, markRead, openChannel, snowflakeTime } from "./data";
import { Icon } from "./icons";
import { nameOf } from "./voice";

// Looked up directly, not with Vencord's lazy finders: right after Discord starts these aren't
// registered yet, and a lazy finder gives up for good after five misses.
let RecentMentionsStore: any = null;
let MentionActions: any = null;

const SHOWN = 8;
const DM_PREVIEWS = 6;
const REFRESH = 5 * 60_000;

interface Item {
    key: string;
    channelId: string;
    guildId: string | null;
    messageId: string;
    authorId: string;
    text: string;
    time: number;
    count: number;
}

// ── Message text as one line: mentions, channels and emoji as words; markdown dropped ──

function snippet(m: any): string {
    let s: string = m?.content ?? "";
    const guildId = ChannelStore.getChannel(m?.channel_id)?.guild_id;
    s = s
        .replace(/<@!?(\d+)>/g, (_, id) => `@${(guildId && GuildMemberStore.getNick(guildId, id)) || nameOf(id)}`)
        .replace(/<@&(\d+)>/g, (_, id) => `@${(guildId && GuildRoleStore.getRole(guildId, id)?.name) || "role"}`)
        .replace(/<#(\d+)>/g, (_, id) => `#${ChannelStore.getChannel(id)?.name ?? "channel"}`)
        .replace(/<a?:(\w+):\d+>/g, ":$1:")
        .replace(/<t:(\d+)(:\w)?>/g, (_, t) => new Date(Number(t) * 1000).toLocaleString())
        .replace(/^>+ ?/gm, "")
        .replace(/[*_~`|]{1,3}/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (s) return s;
    if (m?.attachments?.length) return /image|video/.test(m.attachments[0].content_type ?? m.attachments[0].contentType ?? "") ? "sent an image" : "sent a file";
    if (m?.stickerItems?.length || m?.sticker_items?.length) return "sent a sticker";
    if (m?.embeds?.length) return m.embeds[0].title ?? m.embeds[0].rawTitle ?? "sent a link";
    return "…";
}

const timeOf = (m: any) => {
    const t = m?.timestamp;
    return t ? new Date(typeof t === "object" && "valueOf" in t ? t.valueOf() : t).getTime() : snowflakeTime(m?.id);
};
const unread = (channelId: string, messageId: string) => BigInt(messageId) > BigInt(ReadStateStore.ackMessageId(channelId) ?? 0);

// ── Mentions: Discord's list, loaded when Home opens (the inbox's own request and filters) ──

const logger = new Logger("ForYou");
const RETRY = 10_000;

// Right after Discord starts, Home can mount before the connection is up and the first requests
// fail; a failure clears the throttle and tries again shortly (a few times, then next visit).
let lastFetch = 0;
let mentionRetries = 0;
function refreshMentions() {
    if (Date.now() - lastFetch < REFRESH && RecentMentionsStore.hasLoadedEver && !RecentMentionsStore.mentionsAreStale) return;
    if (RecentMentionsStore.loading) return;
    lastFetch = Date.now();
    MentionActions.fetchRecentMentions({ guildId: null, roles: RecentMentionsStore.roleFilter, everyone: RecentMentionsStore.everyoneFilter });
}

function onMentionsFailed() {
    logger.warn("Loading mentions failed", mentionRetries < 3 ? "; trying again" : "");
    lastFetch = 0;
    if (mentionRetries++ < 3) setTimeout(refreshMentions, RETRY);
}

function onMentionsLoaded() {
    mentionRetries = 0;
}

function selectMentions(): string {
    const me = UserStore.getCurrentUser()?.id;
    const direct: Item[] = [];
    let broadcast = 0;
    const broadcastGuilds = new Set<string>();
    for (const m of RecentMentionsStore.getMentions?.() ?? []) {
        if (!unread(m.channel_id, m.id)) continue;
        const channel = ChannelStore.getChannel(m.channel_id);
        if (!channel) continue;
        const toMe = (m.mentions ?? []).some((u: any) => (u?.id ?? u) === me);
        if (!toMe) {
            broadcast++;
            if (channel.guild_id) broadcastGuilds.add(channel.guild_id);
            continue;
        }
        direct.push({
            key: `${m.channel_id}:${m.author?.id}`, channelId: m.channel_id, guildId: channel.guild_id ?? null,
            messageId: m.id, authorId: m.author?.id, text: snippet(m), time: timeOf(m), count: 1
        });
    }
    return JSON.stringify({ direct, broadcast, guilds: broadcastGuilds.size });
}

// ── Unread DMs: the latest message of each, read once per new message ──

const dmCache = new Map<string, { last: string; item: Item; }>();
const dmListeners = new Set<() => void>();
const dmRetries = new Map<string, number>();

async function loadDm(channelId: string) {
    const last = ReadStateStore.lastMessageId(channelId);
    if (!last || dmCache.get(channelId)?.last === last) return;
    dmCache.set(channelId, { last, item: { key: channelId, channelId, guildId: null, messageId: last, authorId: "", text: "…", time: snowflakeTime(last), count: 0 } });
    try {
        const { body } = await RestAPI.get({ url: `/channels/${channelId}/messages`, query: { limit: 1 } });
        const m = body?.[0];
        if (!m) return;
        dmCache.set(channelId, { last, item: { key: channelId, channelId, guildId: null, messageId: m.id, authorId: m.author?.id, text: snippet(m), time: timeOf(m), count: 0 } });
    } catch (e) {
        logger.warn("Loading a DM's latest message failed", e);
        dmCache.delete(channelId);
        const tries = (dmRetries.get(channelId) ?? 0) + 1;
        dmRetries.set(channelId, tries);
        if (tries <= 3) setTimeout(() => loadDm(channelId), RETRY);
    }
    dmListeners.forEach(l => l());
}

/** The unread DMs For you shows (Home's Recent leaves these out: one conversation, one place). */
export const digestDmIds = (): string[] =>
    PrivateChannelSortStore.getPrivateChannelIds().filter((id: string) => ReadStateStore.hasUnread(id)).slice(0, DM_PREVIEWS);

function useUnreadDms(): Item[] {
    const ids = useStateFromStores([PrivateChannelSortStore, ReadStateStore], () => digestDmIds().join(","));
    const [, bump] = useState(0);
    useEffect(() => {
        const l = () => bump(n => n + 1);
        dmListeners.add(l);
        return () => void dmListeners.delete(l);
    }, []);
    useEffect(() => { if (ids) ids.split(",").forEach(loadDm); }, [ids]);
    return ids ? ids.split(",").map(id => {
        const cached = dmCache.get(id)?.item;
        return cached && { ...cached, count: ReadStateStore.getMentionCount(id) };
    }).filter(Boolean) as Item[] : [];
}

// ── The section ──

function DigestRow({ item }: { item: Item; }) {
    const channel = ChannelStore.getChannel(item.channelId);
    const guild = item.guildId ? GuildStore.getGuild(item.guildId) : null;
    const author = item.authorId ? UserStore.getUser(item.authorId) : null;
    const name = item.authorId ? (item.guildId && GuildMemberStore.getNick(item.guildId, item.authorId)) || nameOf(item.authorId) : labelFor(channel);
    const where = guild ? `#${channel?.name} · ${guild.name}` : channel?.type === 3 ? labelFor(channel) : "";
    const open = () => {
        track(item.guildId ? "digest_open_mention" : "digest_open_dm");
        if (item.guildId) NavigationRouter.transitionTo(`/channels/${item.guildId}/${item.channelId}/${item.messageId}`);
        else openChannel(item.channelId);
    };
    return (
        <div className="dk-home-row dk-home-digest" data-dk-id={item.channelId}>
            <button className="dk-home-main" onClick={open} title={`${name}: ${item.text}`}>
                <span className="dk-sb-icon">{author ? <img src={author.getAvatarURL(undefined, 48)} alt="" draggable={false} /> : <span className="dk-sb-glyph">{name[0]}</span>}</span>
                <span className="dk-home-name">{name}</span>
                <span className="dk-home-said">{item.text}</span>
                {where && <span className="dk-home-dim dk-home-where">{where}</span>}
                <span className="dk-home-dim dk-home-ago">{ago(item.time)}</span>
                {item.count > 1 && <span className="dk-sb-count">{item.count}</span>}
            </button>
            <button className="dk-home-read" data-dk-action="read" title="Mark read" aria-label="Mark read"
                onClick={() => { track("digest_read"); markRead([item.channelId]); }}><Icon name="check" size={18} /></button>
        </div>
    );
}

function openInbox() {
    // Discord's inbox hangs from the title bar's (hidden) Inbox button; Ctrl I does the same
    (document.querySelector('[aria-label="Inbox"]') as HTMLElement | null)?.click();
}

// Right after Discord starts, Home can render before Discord has registered its mentions store;
// touching it then throws (and took all of Home down to Discord's Friends page). Wait for it.
function mentionsReady() {
    RecentMentionsStore ??= find(filters.byStoreName("RecentMentionsStore"), { isIndirect: true });
    MentionActions ??= find(filters.byProps("fetchRecentMentions", "deleteRecentMention"), { isIndirect: true });
    return typeof RecentMentionsStore?.getMentions === "function" && typeof MentionActions?.fetchRecentMentions === "function";
}

function useMentionsReady() {
    const [ready, setReady] = useState(mentionsReady);
    useEffect(() => {
        if (ready) return;
        let tries = 0;
        const t = setInterval(() => {
            if (mentionsReady()) { setReady(true); clearInterval(t); } else if (++tries > 60) clearInterval(t);
        }, 500);
        return () => clearInterval(t);
    }, [ready]);
    return ready;
}

/** A failure in here costs only this section, never Home. */
export const ForYou = ErrorBoundary.wrap(() => useMentionsReady() ? <Digest /> : null, {
    noop: true,
    fallback: () => null,
    onError: ({ error }) => trackError("ForYou", error)
});

function Digest() {
    useEffect(() => {
        FluxDispatcher.subscribe("LOAD_RECENT_MENTIONS_FAILURE", onMentionsFailed);
        FluxDispatcher.subscribe("LOAD_RECENT_MENTIONS_SUCCESS", onMentionsLoaded);
        refreshMentions();
        return () => {
            FluxDispatcher.unsubscribe("LOAD_RECENT_MENTIONS_FAILURE", onMentionsFailed);
            FluxDispatcher.unsubscribe("LOAD_RECENT_MENTIONS_SUCCESS", onMentionsLoaded);
        };
    }, []);
    const { direct, broadcast, guilds }: { direct: Item[]; broadcast: number; guilds: number; } =
        JSON.parse(useStateFromStores([RecentMentionsStore, ReadStateStore, ChannelStore], selectMentions));
    const dms = useUnreadDms();

    // one line per person per place: the newest message, and how many
    const byKey = new Map<string, Item>();
    for (const item of [...direct, ...dms].sort((a, b) => b.time - a.time)) {
        const seen = byKey.get(item.key);
        if (seen) seen.count += 1;
        else byKey.set(item.key, { ...item, count: item.count || 1 });
    }
    const items = [...byKey.values()];
    if (!items.length && !broadcast) return null;
    const hidden = items.length - SHOWN;
    return (
        <section className="dk-home-foryou">
            <h2>For you · {items.length}</h2>
            {items.slice(0, SHOWN).map(item => <DigestRow key={item.key} item={item} />)}
            {hidden > 0 && <button className="dk-sb-more dk-home-more" onClick={openInbox}>{hidden} more in the inbox</button>}
            {broadcast > 0 && (
                <button className="dk-home-row dk-home-main dk-home-broadcast" data-dk-action="broadcasts" onClick={openInbox}
                    title="@everyone and role pings: open the inbox">
                    <Icon name="at" size={16} />
                    <span className="dk-home-dim">{broadcast} @everyone or role {broadcast === 1 ? "ping" : "pings"}{guilds > 1 ? ` in ${guilds} servers` : ""}</span>
                </button>
            )}
        </section>
    );
}
