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
    ApplicationStreamingStore, ChannelStore, GuildStore, MessageRequestStore, NavigationRouter, PresenceStore,
    PrivateChannelSortStore, ReadStateStore, RelationshipStore, SelectedChannelStore, useEffect, useMemo, UserStore, useState, useStateFromStores, VoiceStateStore
} from "@webpack/common";
import type { ComponentType } from "react";

import { track } from "../core/telemetry";
import { activityOf, getFavorites, joinVoice, labelFor, openChannel, openVoiceChat, snowflakeTime } from "./data";
import { Icon, IconSlot } from "./icons";
import { nameOf, occupants, openDm, VoiceMembers } from "./voice";

const RECENT_MAX = 10;
const RECENT_DAYS = 30;

function ago(ms: number) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    return d < 30 ? `${d}d` : `${Math.round(d / 30)}mo`;
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

// ── In voice: one block per call your friends are in. The call's row says where and how many;
// under it, everyone in it, friends first, with who's live or on camera. ──

function useCalls() {
    return useStateFromStores([VoiceStateStore, RelationshipStore, SelectedChannelStore], () => {
        const calls = new Map<string, string[]>();
        for (const uid of RelationshipStore.getFriendIDs()) {
            const cid = VoiceStateStore.getVoiceStateForUser(uid)?.channelId;
            if (!cid) continue;
            if (!calls.has(cid)) calls.set(cid, []);
            calls.get(cid)!.push(uid);
        }
        // yours first, then calls in channels or with people you've favourited, then the biggest
        const fav = new Set(getFavorites().map(f => f.id));
        const favPeople = new Set(getFavorites().map(f => ChannelStore.getChannel(f.id)).filter(c => c?.type === 1).map(c => c!.recipients[0]));
        const score = ([cid, friends]: [string, string[]]) =>
            (VoiceStateStore.isInChannel(cid) ? 1000 : 0) + (fav.has(cid) || friends.some(u => favPeople.has(u)) ? 100 : 0) + friends.length;
        return JSON.stringify([...calls].sort((a, b) => score(b) - score(a)));
    });
}

function CallBlock({ channelId, friends }: { channelId: string; friends: string[]; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(channelId), [channelId]);
    const everyone = useStateFromStores([VoiceStateStore], () => occupants(channelId).length, [channelId]);
    const mine = useStateFromStores([VoiceStateStore], () => VoiceStateStore.isInChannel(channelId), [channelId]);
    if (!channel) return null;
    const guild = channel.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
    const count = `${everyone} in call${friends.length < everyone ? ` · ${friends.length} friend${friends.length === 1 ? "" : "s"}` : ""}`;
    return (
        <div className="dk-home-callblock" data-dk-id={channelId}>
            <div className="dk-home-row dk-home-call">
                <button className="dk-home-main" onClick={() => openVoiceChat(channel as Channel)} title={`Open ${labelFor(channel)}'s chat (Join joins)`}>
                    <IconSlot name="voice" />
                    <span className="dk-home-name">{guild ? channel.name : labelFor(channel)}</span>
                    <span className="dk-home-dim">{guild ? guild.name : "call"}</span>
                    <span className="dk-home-dim dk-home-time">{count}</span>
                </button>
                {mine
                    ? <span className="dk-home-here">you're here</span>
                    : <button className="dk-home-join" data-dk-action="join" title={`Join ${channel.name ?? "the call"}`} aria-label="Join" onClick={() => joinVoice(channel as Channel)}><Icon name="join" size={20} /></button>}
            </div>
            <VoiceMembers channelId={channelId} max={8} className="dk-home-member" />
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

    useEffect(() => { track("home_view"); }, []);
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
                    <button data-dk-action="all-friends" title="All friends" aria-label="All friends" onClick={() => { track("home_all_friends"); setDiscord("ALL"); }}><Icon name="people" size={20} /></button>
                    <button data-dk-action="add-friend" title="Add friend" aria-label="Add friend" onClick={() => { track("home_add_friend"); setDiscord("ADD_FRIEND"); }}><Icon name="addPerson" size={20} /></button>
                </span>
            </header>
            <div className="dk-home-body">
                <div className="dk-home-flow">
                {calls.length > 0 && (
                    <section>
                        <h2>In voice</h2>
                        {calls.map(([cid, friends]) => <CallBlock key={cid} channelId={cid} friends={friends} />)}
                    </section>
                )}
                {(pending > 0 || requests > 0) && (
                    <section>
                        <h2>Requests</h2>
                        {pending > 0 && <button className="dk-home-row dk-home-main" onClick={() => setDiscord("PENDING")}>
                            <IconSlot name="addPerson" /><span className="dk-home-name">Friend requests</span><span className="dk-sb-count">{pending}</span>
                        </button>}
                        {requests > 0 && <button className="dk-home-row dk-home-main" onClick={() => NavigationRouter.transitionTo("/message-requests")}>
                            <IconSlot name="inbox" /><span className="dk-home-name">Message requests</span><span className="dk-home-dim dk-home-time">· {requests}</span>
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
            </div>
        </main>
    );
}
