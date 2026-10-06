/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// "Now": a live card for each favourited voice channel that has people in it, at the top of the
// sidebar. Everything on it is live: who's in it (speaking ones ringed), who's streaming or on
// camera, and Join. personal/SCREENS.md "Now".

import { Channel } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { ApplicationStreamingStore, ChannelStore, GuildStore, RelationshipStore, UserStore, useStateFromStores, VoiceStateStore } from "@webpack/common";

import { guildIcon, Square } from "./avatars";
import { joinVoice, openVoiceChat, useFavorites } from "./data";
import { Icon } from "./icons";
import { nameOf, occupants, sortedOccupants, voiceFlags } from "./voice";

const SpeakingStore = findStoreLazy("SpeakingStore");
const MAX_FACES = 7;

const isVoice = (c?: Channel | null) => c?.type === 2 || c?.type === 13;

/** Favourited voice channels with someone in them, in his favourites order. */
export function useLiveFavorites(): string[] {
    const favs = useFavorites();
    const key = favs.map(f => f.id).join(",");
    const live = useStateFromStores([VoiceStateStore, ChannelStore], () =>
        favs.filter(f => isVoice(ChannelStore.getChannel(f.id)) && occupants(f.id).length > 0).map(f => f.id).join(","), [key]);
    return live ? live.split(",") : [];
}

function Face({ uid }: { uid: string; }) {
    const user = useStateFromStores([UserStore], () => UserStore.getUser(uid), [uid]);
    const speaking = useStateFromStores([SpeakingStore], () => !!SpeakingStore.isSpeaking?.(uid), [uid]);
    const name = nameOf(uid);
    return (
        <span className="dk-now-face" data-speaking={speaking || undefined} title={speaking ? `${name} · speaking` : name}>
            {user ? <img src={user.getAvatarURL(undefined, 48)} alt={name} draggable={false} /> : <span className="dk-sb-glyph">{name[0]}</span>}
        </span>
    );
}

/** "kai streaming", "kai and sam streaming", "kai on camera": only what's actually happening. */
function liveLine(ids: string[]) {
    const flags = ids.map(uid => ({ uid, ...voiceFlags(uid) }));
    const names = (list: typeof flags) => {
        const n = list.map(f => nameOf(f.uid));
        return n.length <= 2 ? n.join(" and ") : `${n[0]}, ${n[1]} and ${n.length - 2} more`;
    };
    const streaming = flags.filter(f => f.live);
    if (streaming.length) return { icon: "screen" as const, text: `${names(streaming)} streaming` };
    const cams = flags.filter(f => f.video);
    if (cams.length) return { icon: "camera" as const, text: `${names(cams)} on camera` };
    return null;
}

function LiveCard({ channelId }: { channelId: string; }) {
    const channel = useStateFromStores([ChannelStore], () => ChannelStore.getChannel(channelId), [channelId]);
    const people = useStateFromStores([VoiceStateStore, RelationshipStore, ApplicationStreamingStore],
        () => sortedOccupants(channelId).join(","), [channelId]);
    const status = useStateFromStores([VoiceStateStore, ApplicationStreamingStore],
        () => JSON.stringify(liveLine(occupants(channelId))), [channelId]);
    const mine = useStateFromStores([VoiceStateStore], () => VoiceStateStore.isInChannel(channelId), [channelId]);
    if (!channel) return null;
    const guild = channel.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
    const ids = people ? people.split(",") : [];
    const line: ReturnType<typeof liveLine> = JSON.parse(status);

    return (
        <div className="dk-now-card" data-mine={mine || undefined}>
            <button className="dk-now-main" onClick={() => openVoiceChat(channel)} title={`${channel.name}: open its chat`} data-dk-nav data-dk-id={channelId}>
                <span className="dk-now-head">
                    {guild && <Square src={guildIcon(guild.id)} text={guild.name[0]} size="server" />}
                    <span className="dk-now-name">{channel.name}</span>
                    {guild && <span className="dk-now-where">· {guild.name}</span>}
                </span>
                <span className="dk-now-faces">
                    {ids.slice(0, MAX_FACES).map(uid => <Face key={uid} uid={uid} />)}
                    {ids.length > MAX_FACES && <span className="dk-now-more">+{ids.length - MAX_FACES}</span>}
                </span>
                {line && <span className="dk-now-live"><Icon name={line.icon} size={14} />{line.text}</span>}
            </button>
            {mine
                ? <span className="dk-now-here" title="You're in this call">here</span>
                : <button className="dk-now-join" onClick={() => joinVoice(channel)} data-dk-nav data-dk-action="join" title={`Join ${channel.name}`}>Join</button>}
        </div>
    );
}

export function NowSection() {
    const live = useLiveFavorites();
    if (!live.length) return null;
    return (
        <section className="dk-sb-section dk-now" aria-label="Now">
            <div className="dk-sb-label">
                <span className="dk-sb-label-text"><span className="dk-now-count">{live.length}</span>Now</span>
            </div>
            {live.map(id => <LiveCard key={id} channelId={id} />)}
        </section>
    );
}
