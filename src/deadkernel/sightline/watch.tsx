/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Watching Sightline in the call, like a Discord stream (personal/SIGHTLINE.md). While we're in a voice
// channel a hidden "lobby" frame of the viewer sits in that channel's Sightline room (presence only, no
// video) and says who's live; the sidebar puts a LIVE pill on them. Watch opens the viewer in a stage
// over the conversation area: its own frame and process, so decoding never slows Discord's page.

import { createRoot, SelectedChannelStore, useEffect, useState, useStateFromStores } from "@webpack/common";
import type { Root } from "react-dom/client";

import { roomFor } from "./golive";
import { settings } from "./state";

type Member = { id: string; name: string; discord?: string; live: boolean; };

const DISCORD_ORIGINS = new Set(["https://discord.com", "https://ptb.discord.com", "https://canary.discord.com"]);

let live = new Map<string, Member>(); // discord id -> member, live ones only
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

let stage: { discord: string; room: string; } | null = null;
const setStage = (s: typeof stage) => { stage = s; emit(); };

function useWatch() {
    const [, tick] = useState(0);
    useEffect(() => {
        const l = () => tick(n => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
}

/** Is this Discord user live on Sightline in our voice channel's room? */
export function useSightlineLive(discordId: string): boolean {
    useWatch();
    return live.has(discordId);
}

export async function watchMember(discordId: string) {
    const channelId = SelectedChannelStore.getVoiceChannelId();
    if (!channelId) return;
    setStage({ discord: discordId, room: await roomFor(channelId) });
}

function viewerUrl(room: string, params: Record<string, string>) {
    const base = settings.store.viewer || "https://sightline.padwal.dev";
    const url = new URL(`${base.replace(/\/+$/, "")}/r/${room}`);
    url.searchParams.set("embed", "1");
    url.searchParams.set("parent", location.origin);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url;
}

/** Messages from our own viewer frames only: their origin, and the shape we expect. */
function onMessage(e: MessageEvent) {
    const base = settings.store.viewer || "https://sightline.padwal.dev";
    if (e.origin !== new URL(base).origin || !DISCORD_ORIGINS.has(location.origin)) return;
    const d = e.data;
    if (d?.type !== "sightline:members" || !Array.isArray(d.members)) return;
    const next = new Map<string, Member>();
    for (const m of d.members as Member[]) if (m?.live && typeof m.discord === "string" && /^\d{1,20}$/.test(m.discord)) next.set(m.discord, m);
    live = next;
    emit();
}

// Tests (personal/tools): a room to listen in without being in a voice channel.
let testRoom: string | null = null;

function Lobby() {
    useWatch();
    const voice = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getVoiceChannelId());
    const channelId = testRoom ? `test:${testRoom}` : voice;
    const [room, setRoom] = useState<string | null>(null);
    useEffect(() => {
        live = new Map();
        emit();
        if (!channelId) return void setRoom(null);
        let stale = false;
        (testRoom ? Promise.resolve(testRoom) : roomFor(channelId)).then(r => !stale && setRoom(r));
        return () => void (stale = true);
    }, [channelId]);
    if (!room) return null;
    return <iframe className="dk-sl-lobby" src={viewerUrl(room, { lobby: "1", name: "Accord" }).href} aria-hidden tabIndex={-1} />;
}

/** Where the conversation area is: right of the sidebar (or Discord's channel list), under the title bar. */
function useStageBox() {
    const [box, setBox] = useState({ left: 0, top: 0 });
    useEffect(() => {
        const measure = () => {
            const side = document.querySelector(".dk-sb") ?? document.querySelector('[class*="sidebar_"]');
            const r = side?.getBoundingClientRect();
            setBox({ left: Math.round(r?.right ?? 0), top: Math.round(r?.top ?? 0) });
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [stage?.room]);
    return box;
}

function Stage() {
    useWatch();
    const voice = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getVoiceChannelId());
    useEffect(() => { if (!voice && !testRoom && stage) setStage(null); }, [voice]);
    const box = useStageBox();
    if (!stage) return null;
    const url = viewerUrl(stage.room, { focus: stage.discord });
    const name = live.get(stage.discord)?.name ?? "Sightline";
    return (
        <section className="dk-sl-stage" style={{ left: box.left, top: box.top }} aria-label={`${name}'s stream`}>
            <header className="dk-sl-stage-bar">
                <span className="dk-sl-stage-live">LIVE</span>
                <span className="dk-sl-stage-name">{name}</span>
                <span className="dk-sl-stage-via">on Sightline</span>
                <button onClick={() => document.querySelector<HTMLIFrameElement>(".dk-sl-stage-frame")?.requestFullscreen()} title="Full screen">Full screen</button>
                <button onClick={() => popOut(stage!.room)} title="Pop out into its own window">Pop out</button>
                <button onClick={() => setStage(null)} title="Back to the call" aria-label="Close the stream">✕</button>
            </header>
            <iframe className="dk-sl-stage-frame" src={url.href} allow="fullscreen; autoplay; clipboard-write" />
        </section>
    );
}

function popOut(room: string) {
    const base = (settings.store.viewer || "https://sightline.padwal.dev").replace(/\/+$/, "");
    void VencordNative.pluginHelpers.Sightline?.openViewer(`${base}/r/${room}`, settings.store.viewer || undefined);
    setStage(null);
}

function Root_() {
    return <><Lobby /><Stage /></>;
}

/** For tests: listen in `room` as if in its voice channel, and open a member's stream there. */
export const test = {
    listen(room: string | null) { testRoom = room; emit(); },
    watch(room: string, discord: string) { setStage({ room, discord }); },
    live: () => [...live.keys()]
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function startWatch() {
    window.addEventListener("message", onMessage);
    host = document.createElement("div");
    host.id = "dk-sightline-watch";
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(<Root_ />);
}

export function stopWatch() {
    window.removeEventListener("message", onMessage);
    root?.unmount();
    host?.remove();
    root = host = null;
    live = new Map();
    stage = null;
    emit();
}
