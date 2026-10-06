/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Windows: Mute, Deafen (and Disconnect while in a call) under the taskbar preview, where media
// players put play/pause. Each button does exactly what Discord's own button does; its icon and
// tooltip follow his current state. personal/SCREENS.md "Taskbar".

import { PluginNative } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { MediaEngineStore, SelectedChannelStore } from "@webpack/common";

const Native = VencordNative.pluginHelpers.DeadKernel as PluginNative<typeof import("./native")>;
const AudioActions = findByPropsLazy("toggleSelfMute", "toggleSelfDeaf");
const VoiceActions = findByPropsLazy("selectVoiceChannel", "disconnect");

// 24-unit line icons (after Lucide, ISC), drawn white, or red when muted or deafened
const ICONS = {
    mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
    micOff: "m2 2 20 20M18.9 13.2A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M12 19v3",
    headphones: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3",
    deafened: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 15.4-6.3M21 12v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3m-19-12 20 20",
    leave: "M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-3.3-2.7m-2.7-3.3A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9M22 2 2 22"
};
type IconName = keyof typeof ICONS;

const WHITE = "#ffffff", RED = "#f23f43";
const cache = new Map<string, Promise<string>>();

/** A 32px PNG of one icon (the taskbar wants bitmaps, not SVG). */
function png(name: IconName, color: string): Promise<string> {
    const key = `${name}:${color}`;
    if (!cache.has(key)) cache.set(key, new Promise((resolve, reject) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 32;
            canvas.getContext("2d")!.drawImage(img, 0, 0, 32, 32);
            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }));
    return cache.get(key)!;
}

let last = "";

async function update() {
    const muted = !!MediaEngineStore.isSelfMute?.(), deaf = !!MediaEngineStore.isSelfDeaf?.();
    const inCall = !!SelectedChannelStore.getVoiceChannelId?.();
    const key = `${muted}${deaf}${inCall}`;
    if (key === last) return;
    last = key;
    const buttons = [
        { id: "mute", tooltip: muted ? "Unmute" : "Mute", icon: await png(muted ? "micOff" : "mic", muted ? RED : WHITE) },
        { id: "deafen", tooltip: deaf ? "Undeafen" : "Deafen", icon: await png(deaf ? "deafened" : "headphones", deaf ? RED : WHITE) },
        ...inCall ? [{ id: "leave", tooltip: "Disconnect", icon: await png("leave", RED) }] : []
    ];
    await Native.setTaskbarButtons(buttons).catch(() => false);
}

/** A taskbar button was clicked (main process → page). */
export function taskbarClick(id: string) {
    if (id === "mute") AudioActions.toggleSelfMute();
    else if (id === "deafen") AudioActions.toggleSelfDeaf();
    else if (id === "leave") VoiceActions.disconnect();
}

const onChange = () => { update(); };

export function startTaskbar() {
    if (!navigator.userAgent.includes("Windows")) return;
    last = "";
    MediaEngineStore.addChangeListener(onChange);
    SelectedChannelStore.addChangeListener(onChange);
    update();
}

export function stopTaskbar() {
    MediaEngineStore.removeChangeListener?.(onChange);
    SelectedChannelStore.removeChangeListener?.(onChange);
    last = "";
    Native.setTaskbarButtons([]).catch(() => false);
}
