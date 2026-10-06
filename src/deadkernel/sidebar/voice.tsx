/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Who's in a call, one line each: friends first, then streamers, then everyone else. Shared by the
// server column, Favorites and Home so a call reads the same everywhere (personal/SCREENS.md).

import { classes } from "@utils/misc";
import { ApplicationStreamingStore, ChannelActionCreators, ChannelStore, RelationshipStore, UserStore, useStateFromStores, VoiceStateStore } from "@webpack/common";

import { openChannel } from "./data";
import { Icon } from "./icons";

export const occupants = (channelId: string) => Object.keys(VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {});

export interface VoiceFlags { live: boolean; video: boolean; muted: boolean; deaf: boolean; }

export function voiceFlags(userId: string): VoiceFlags {
    const vs: any = VoiceStateStore.getVoiceStateForUser(userId);
    return {
        live: !!vs?.selfStream || !!ApplicationStreamingStore.getAnyStreamForUser(userId),
        video: !!vs?.selfVideo,
        muted: !!(vs?.selfMute || vs?.mute),
        deaf: !!(vs?.selfDeaf || vs?.deaf)
    };
}

/** Friends first, then whoever is streaming, then the rest, each in Discord's order. */
export function sortedOccupants(channelId: string): string[] {
    const rank = (uid: string) => (RelationshipStore.isFriend(uid) ? 0 : 2) + (voiceFlags(uid).live ? 0 : 1);
    return occupants(channelId).sort((a, b) => rank(a) - rank(b));
}

export const nameOf = (uid: string) => {
    const u = UserStore.getUser(uid);
    return RelationshipStore.getNickname(uid) || (u as any)?.globalName || u?.username || "Someone";
};

export function openDm(uid: string) {
    const dm = ChannelStore.getDMFromUserId(uid);
    if (dm) openChannel(dm);
    else ChannelActionCreators.openPrivateChannel(uid);
}

/** Streaming, camera, muted or deafened, as Discord's own call UI shows them: small icons, live in teal. */
export function Flags({ uid }: { uid: string; }) {
    const f: VoiceFlags = JSON.parse(useStateFromStores([VoiceStateStore, ApplicationStreamingStore], () => JSON.stringify(voiceFlags(uid)), [uid]));
    return (
        <>
            {f.live && <span className="dk-vc-live" title="Streaming"><Icon name="screen" size={16} title="Streaming" /></span>}
            {f.video && <span className="dk-vc-flag" title="Camera on"><Icon name="camera" size={16} title="Camera on" /></span>}
            {(f.deaf || f.muted) && <span className="dk-vc-flag dk-vc-off" title={f.deaf ? "Deafened" : "Muted"}>
                <Icon name={f.deaf ? "deafened" : "micOff"} size={16} title={f.deaf ? "Deafened" : "Muted"} />
            </span>}
        </>
    );
}

function Member({ uid, className }: { uid: string; className: string; }) {
    const user = useStateFromStores([UserStore], () => UserStore.getUser(uid), [uid]);
    const friend = RelationshipStore.isFriend(uid);
    if (!user) return null;
    const name = nameOf(uid);
    const body = (
        <>
            <span className="dk-sb-icon dk-sb-small"><img src={user.getAvatarURL(undefined, 40)} alt="" draggable={false} /></span>
            <span className={classes("dk-sb-name", friend && "dk-vc-friend")}>{name}</span>
            <span className="dk-sb-trail"><Flags uid={uid} /></span>
        </>
    );
    // friends open your DM with them; strangers in a community's voice channel aren't a click target
    return friend
        ? <button className={classes("dk-sb-row", className)} title={`Message ${name}`} onClick={() => openDm(uid)} data-dk-nav>{body}</button>
        : <div className={classes("dk-sb-row", className)} title={name}>{body}</div>;
}

/** The people in a call, indented under its row. Long calls show the first `max` and a count. */
export function VoiceMembers({ channelId, max = 8, className = "dk-col-member" }: { channelId: string; max?: number; className?: string; }) {
    const ids = useStateFromStores([VoiceStateStore, RelationshipStore, ApplicationStreamingStore],
        () => sortedOccupants(channelId).join(","), [channelId]);
    if (!ids) return null;
    const all = ids.split(",");
    return (
        <>
            {all.slice(0, max).map(uid => <Member key={uid} uid={uid} className={className} />)}
            {all.length > max && <div className={classes("dk-sb-row", className, "dk-vc-more")}>+{all.length - max} more</div>}
        </>
    );
}
