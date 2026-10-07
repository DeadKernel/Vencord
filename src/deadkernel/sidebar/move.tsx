/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Drag people between voice channels, as Discord's own channel list allows (our column replaces it).
// Discord's rules, unchanged: someone can be picked up from a channel where you have Move Members;
// a channel takes them where you have Move Members and Connect, unless it's a video call that's
// already full; the move is Discord's own (GuildActionCreators.setChannel).

import { findByPropsLazy } from "@webpack";
import { GuildStore, PermissionsBits, PermissionStore, useState, VoiceStateStore } from "@webpack/common";
import type { DragEvent } from "react";

import { track } from "../core/telemetry";

const GuildActions = findByPropsLazy("setChannel", "setServerMute");

let dragging: { userId: string; guildId: string; } | null = null;

const can = (perm: bigint, channel: any) => {
    try {
        return !!channel?.guild_id && PermissionStore.can(perm, channel);
    } catch {
        return false;
    }
};

/** Discord's: "Move Members" where they are now. */
export const canMoveFrom = (channel: any) => can(PermissionsBits.MOVE_MEMBERS, channel);

/** Discord's: Move Members and Connect there, and not a full video call. */
export function canMoveInto(channel: any, userId: string) {
    if (!can(PermissionsBits.MOVE_MEMBERS, channel) || !can(PermissionsBits.CONNECT, channel)) return false;
    if (VoiceStateStore.getVoiceStateForUser(userId)?.channelId === channel.id) return false;
    const max = (GuildStore.getGuild(channel.guild_id) as any)?.maxVideoChannelUsers ?? -1;
    const count = Object.keys(VoiceStateStore.getVoiceStatesForChannel(channel.id) ?? {}).length;
    return !(max > 0 && (VoiceStateStore as any).hasVideo?.(channel.id) && count >= max + 1);
}

/** On a person under a call: draggable when you may move them. */
export function personDragProps(userId: string, channel: any) {
    if (!canMoveFrom(channel)) return {};
    return {
        draggable: true,
        "data-dk-movable": true,
        onDragStart: (e: DragEvent) => {
            e.stopPropagation(); // not the favourite row around it
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/x-dk-voice-user", userId);
            dragging = { userId, guildId: channel.guild_id };
            document.documentElement.dataset.dkMoving = "";
        },
        onDragEnd: (e: DragEvent) => {
            e.stopPropagation();
            dragging = null;
            delete document.documentElement.dataset.dkMoving;
        }
    };
}

/** On a voice channel's row: takes a dragged person when Discord would, and says so while over it. */
export function useVoiceDrop(channel: any) {
    const [over, setOver] = useState(false);
    const accepts = () => !!dragging && !!channel && dragging.guildId === channel.guild_id && canMoveInto(channel, dragging.userId);
    return {
        "data-dk-voice-drop": over || undefined,
        onDragOver: (e: DragEvent) => {
            if (!accepts()) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            if (!over) setOver(true);
        },
        onDragLeave: (e: DragEvent) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(false);
        },
        onDrop: (e: DragEvent) => {
            setOver(false);
            if (!accepts()) return;
            e.preventDefault();
            e.stopPropagation();
            track("voice_move");
            GuildActions.setChannel(channel.guild_id, dragging!.userId, channel.id);
            dragging = null;
            delete document.documentElement.dataset.dkMoving;
        }
    };
}
