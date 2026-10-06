/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Home: what you see with nothing open. People, not a feed (Discord retired both of its feeds).
// personal/SCREENS.md "Home". Discord's Friends page stays one click away and is the fallback.

import { classes } from "@utils/misc";
import { Channel } from "@vencord/discord-types";
import {
    ApplicationStreamingStore, ChannelActionCreators, ChannelStore, GuildStore, MessageRequestStore, NavigationRouter, PresenceStore,
    PrivateChannelSortStore, ReadStateStore, RelationshipStore, useMemo, UserStore, useState, useStateFromStores, VoiceStateStore
} from "@webpack/common";
import type { ComponentType } from "react";

import { joinVoice, labelFor, openChannel, snowflakeTime } from "./data";

const RECENT_MAX = 10;
const RECENT_DAYS = 30;

const nameOf = (uid: string) => {
    const u = UserStore.getUser(uid);
    return RelationshipStore.getNickname(uid) || (u as any)?.globalName || u?.username || "Someone";
};

function ago(ms: number) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    return d < 30 ? `${d}d` : `${Math.round(d / 30)}mo`;
}

function activityOf(uid: string): string | null {
    if (ApplicationStreamingStore.getAnyStreamForUser(uid)) return "streaming";
    const acts = PresenceStore.getActivities(uid) ?? [];
    const game = acts.find((a: any) => a.type === 0 || a.type === 5);
    if (game) return `playing ${game.name}`;
    const listening = acts.find((a: any) => a.type === 2);
    if (listening) return `listening to ${listening.details ?? listening.name}`;
    const custom = acts.find((a: any) => a.type === 4 && a.state);
    return custom?.state ?? null;
}

function Avatar({ uid, size = 24, status }: { uid: string; size?: number; status?: string; }) {
    const u = UserStore.getUser(uid);
    return (
        <span className="dk-sb-icon" style={{ width: size, height: size }}>
            {u ? <img src={u.getAvatarURL(undefined, 48)} alt="" draggable={false} /> : <span className="dk-sb-glyph">?</span>}
            {status && status !== "offline" && <i className={`dk-sb-status dk-${status}`} />}
        </span>
    );
}

const openDm = (uid: string) => {
    const dm = ChannelStore.getDMFromUserId(uid);
    if (dm) openChannel(dm);
    else ChannelActionCreators.openPrivateChannel(uid);
};

// ── In voice: one row per call your friends are in ──────────────────────────

function useCalls() {
    return useStateFromStores([VoiceStateStore, RelationshipStore], () => {
        const calls = new Map<string, string[]>();
        for (const uid of RelationshipStore.getFriendIDs()) {
            const cid = VoiceStateStore.getVoiceStateForUser(uid)?.channelId;
            if (!cid) continue;
            if (!calls.has(cid)) calls.set(cid, []);
            calls.get(cid)!.push(uid);
        }
        return JSON.stringify([...calls].sort((a, b) => b[1].length - a[1].length));
    });
}

function CallRow({ channelId, friends }: { channelId: string; friends: string[]; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(channelId), [channelId]);
    const everyone = useStateFromStores([VoiceStateStore], () => Object.keys(VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {}).length, [channelId]);
    const mine = useStateFromStores([VoiceStateStore], () => VoiceStateStore.isInChannel(channelId), [channelId]);
    if (!channel) return null;
    const guild = channel.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
    const where = guild ? `${channel.name} · ${guild.name}` : labelFor(channel);
    const names = friends.slice(0, 3).map(nameOf).join(", ") + (everyone > 3 ? ` +${everyone - 3}` : "");
    return (
        <div className="dk-home-row dk-home-call">
            <button className="dk-home-main" onClick={() => openChannel(channel.id)} title={`Open ${where}`}>
                <span className="dk-home-stack">{friends.slice(0, 4).map(uid => <Avatar key={uid} uid={uid} size={20} />)}</span>
                <span className="dk-home-name">{names}</span>
                <span className="dk-home-dim">♪ {where}</span>
            </button>
            {mine
                ? <span className="dk-home-here">you're here</span>
                : <button className="dk-home-join" onClick={() => joinVoice(channel as Channel)}>Join</button>}
        </div>
    );
}

// ── Online friends: sorted by when you last talked, once, so nothing moves under you.
// Friends already listed under "In voice" are left out: one person, one place. ──

function useOnline() {
    const order = useMemo(() => {
        const rank = new Map<string, number>();
        PrivateChannelSortStore.getPrivateChannelIds().forEach((id: string, i: number) => {
            const c = ChannelStore.getChannel(id);
            if (c?.type === 1) rank.set(c.recipients[0], i);
        });
        return rank;
    }, []);
    const ids = useStateFromStores([PresenceStore, RelationshipStore, VoiceStateStore], () =>
        RelationshipStore.getFriendIDs().filter((uid: string) =>
            (PresenceStore.getStatus(uid) ?? "offline") !== "offline" && !VoiceStateStore.getVoiceStateForUser(uid)?.channelId).join(","));
    return ids ? ids.split(",").sort((a, b) => (order.get(a) ?? 1e6) - (order.get(b) ?? 1e6)) : [];
}

function FriendRow({ uid }: { uid: string; }) {
    const status = useStateFromStores([PresenceStore], () => PresenceStore.getStatus(uid), [uid]);
    const activity = useStateFromStores([PresenceStore, ApplicationStreamingStore], () => activityOf(uid), [uid]);
    return (
        <button className="dk-home-row dk-home-main" onClick={() => openDm(uid)} title={`Message ${nameOf(uid)}`}>
            <Avatar uid={uid} status={status} />
            <span className="dk-home-name">{nameOf(uid)}</span>
            <span className="dk-home-dim">{activity ?? status}</span>
        </button>
    );
}

// ── Recent conversations ─────────────────────────────────────────────────────

function RecentRow({ id }: { id: string; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(id), [id]);
    const unread = useStateFromStores([ReadStateStore], () => ReadStateStore.hasUnread(id), [id]);
    const last = useStateFromStores([ReadStateStore], () => snowflakeTime(ReadStateStore.lastMessageId(id)), [id]);
    if (!channel) return null;
    const uid = channel.type === 1 ? channel.recipients[0] : null;
    return (
        <button className={classes("dk-home-row dk-home-main", unread && "dk-unread")} onClick={() => openChannel(id)}>
            {uid ? <Avatar uid={uid} status={PresenceStore.getStatus(uid)} /> : <span className="dk-sb-icon"><span className="dk-sb-glyph">{labelFor(channel)[0]}</span></span>}
            <span className="dk-home-name">{labelFor(channel)}</span>
            <span className="dk-home-dim dk-home-time">{last ? ago(last) : ""}</span>
        </button>
    );
}

export function Home({ Original, initialSection, ...rest }: { Original: ComponentType<any>; initialSection?: string; }) {
    const [discord, setDiscord] = useState<string | null>(null);
    const calls: [string, string[]][] = JSON.parse(useCalls());
    const online = useOnline();
    const recent = useStateFromStores([PrivateChannelSortStore, ReadStateStore], () => {
        const cutoff = Date.now() - RECENT_DAYS * 864e5;
        return PrivateChannelSortStore.getPrivateChannelIds().filter((id: string) =>
            ReadStateStore.hasUnread(id) || snowflakeTime(ReadStateStore.lastMessageId(id)) > cutoff).join(",");
    });
    const recentIds = recent ? recent.split(",") : [];
    const [moreRecent, setMoreRecent] = useState(false);
    const pending = useStateFromStores([RelationshipStore], () => RelationshipStore.getPendingCount?.() ?? 0);
    const requests = useStateFromStores([MessageRequestStore], () => MessageRequestStore.getMessageRequestsCount?.() ?? 0);

    if (initialSection) return <Original initialSection={initialSection} {...rest} />;
    if (discord) {
        return (
            <div className="dk-home-discord">
                <button className="dk-home-back" onClick={() => setDiscord(null)}>← Home</button>
                <Original initialSection={discord} {...rest} />
            </div>
        );
    }

    return (
        <main className="dk-home" aria-label="Home">
            <header className="dk-home-header">
                <h1>Home</h1>
                <span className="dk-home-links">
                    <button onClick={() => setDiscord("ALL")}>All friends</button>
                    <button onClick={() => setDiscord("ADD_FRIEND")}>Add friend</button>
                </span>
            </header>
            <div className="dk-home-body">
                {calls.length > 0 && (
                    <section>
                        <h2>In voice</h2>
                        {calls.map(([cid, friends]) => <CallRow key={cid} channelId={cid} friends={friends} />)}
                    </section>
                )}
                {(pending > 0 || requests > 0) && (
                    <section>
                        <h2>Requests</h2>
                        {pending > 0 && <button className="dk-home-row dk-home-main" onClick={() => setDiscord("PENDING")}>
                            <span className="dk-sb-icon dk-sb-hash">+</span><span className="dk-home-name">Friend requests</span><span className="dk-sb-count">{pending}</span>
                        </button>}
                        {requests > 0 && <button className="dk-home-row dk-home-main" onClick={() => NavigationRouter.transitionTo("/message-requests")}>
                            <span className="dk-sb-icon dk-sb-hash">?</span><span className="dk-home-name">Message requests</span><span className="dk-home-dim dk-home-time">· {requests}</span>
                        </button>}
                    </section>
                )}
                <section>
                    <h2>Online · {online.length}</h2>
                    {online.length ? online.map(uid => <FriendRow key={uid} uid={uid} />) : <p className="dk-home-empty">No one's online.</p>}
                </section>
                <section>
                    <h2>Recent</h2>
                    {recentIds.length
                        ? (moreRecent ? recentIds : recentIds.slice(0, RECENT_MAX)).map(id => <RecentRow key={id} id={id} />)
                        : <p className="dk-home-empty">No conversations in the last {RECENT_DAYS} days.</p>}
                    {recentIds.length > RECENT_MAX && (
                        <button className="dk-sb-more dk-home-more" onClick={() => setMoreRecent(!moreRecent)}>
                            {moreRecent ? "Show fewer" : `${recentIds.length - RECENT_MAX} more`}
                        </button>
                    )}
                </section>
            </div>
        </main>
    );
}
