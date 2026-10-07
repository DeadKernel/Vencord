/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// How long a voice channel's call has been going, as Discord's own timer shows it ("12:04",
// "1:02:45"). Discord keeps each server voice channel's start time in VoiceChannelStartTimeStore,
// filled when it asks the gateway for a server's channel info (it does on opening a server; we do
// the same, once per server, for servers holding a favourite voice channel or a friend's call).
// Looked up directly, not with lazy finders (they give up after five misses at startup).

import { filters, find } from "@webpack";
import { useEffect, useState, useStateFromStores } from "@webpack/common";

let startStore: any = null;
let requestChannelInfo: ((guildId: string) => void) | null = null;

export function voiceStartStore() {
    startStore ??= find(filters.byStoreName("VoiceChannelStartTimeStore"), { isIndirect: true });
    return startStore;
}

/** When the call in this server voice channel started (ms), if Discord knows. */
export function callStart(channel: any): number | undefined {
    try {
        return voiceStartStore()?.getStartTime(channel) ?? undefined;
    } catch {
        return undefined;
    }
}

/** Discord's own request for a server's voice start times (and statuses), once per server. */
export function requestStartTimes(guildIds: Iterable<string>) {
    const store = voiceStartStore();
    requestChannelInfo ??= find(filters.byCode('"voice_start_time"'), { isIndirect: true });
    if (!store || typeof requestChannelInfo !== "function") return;
    for (const id of new Set(guildIds)) if (id && !store.hasRequestedStartTimes(id)) requestChannelInfo(id);
}

let socketHolder: { getSocket(): any; } | null = null;
const lastAsked = new Map<string, number>();

/** A call is going but Discord hasn't told us when it started (it was empty when we asked, and no
 * update came): ask the gateway again, as Discord's request does, at most once a minute a server. */
export function refreshStartTime(guildId: string | undefined) {
    if (!guildId || Date.now() - (lastAsked.get(guildId) ?? 0) < 60_000) return;
    lastAsked.set(guildId, Date.now());
    socketHolder ??= find(filters.byProps("getSocket"), { isIndirect: true });
    socketHolder?.getSocket()?.requestChannelInfo?.(guildId, ["status", "voice_start_time"]);
}

/** When this server voice channel's call started; asks again if it's occupied and we don't know. */
export function useCallStart(channel: any, occupied: boolean): number | undefined {
    const since = useStateFromStores(voiceStartStore() ? [voiceStartStore()] : [], () => channel ? callStart(channel) : undefined, [channel]);
    useEffect(() => { if (occupied && !since && channel?.guild_id) refreshStartTime(channel.guild_id); }, [occupied, since, channel]);
    return since;
}

export function elapsed(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

// one ticker for every timer on screen
const ticks = new Set<() => void>();
let interval: number | undefined;

function useEverySecond() {
    const [, set] = useState(0);
    useEffect(() => {
        const tick = () => set(n => n + 1);
        ticks.add(tick);
        interval ??= window.setInterval(() => ticks.forEach(t => t()), 1000);
        return () => {
            ticks.delete(tick);
            if (!ticks.size) { clearInterval(interval); interval = undefined; }
        };
    }, []);
}

export function CallTimer({ since, className, title }: { since: number; className?: string; title?: string; }) {
    useEverySecond();
    return <span className={className} title={title} data-dk-timer>{elapsed(Date.now() - since)}</span>;
}
