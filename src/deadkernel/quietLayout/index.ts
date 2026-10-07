/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, PluginNative } from "@utils/types";

import style from "./quietLayout.css?managed";

// Structure, not colour: the theme owns the look, Declutter owns what's hidden. Each option
// toggles a token in data-dk-layout on <html>; quietLayout.css keys off those tokens.
const Options = {
    squareRail: "Square server icons and thin square indicators",
    monoRail: "Server icons in grey until hovered, selected or mentioning you; mention counts become dots; no unread pips",
    bareTitlebar: "Empty title bar: no server name, back/forward arrows or inbox (Ctrl I still opens it)",
    quietHeader: "Channel header: the topic as one dim line, buttons on hover, search as an icon until you use it",
    quietSidebar: "Channel list: bold is the unread signal, muted channels dimmed, no post counts, user limits or stream previews, row and category buttons on hover",
    noDmPanel: "No profile panel beside DMs (click a name for the profile)",
    oneLineRows: "One line per row: no activity or custom-status line in the DM and member lists",
    plainNames: "Names in one colour: no role colours, role icons or new-member sprouts",
    avatarsInDmsOnly: "Avatars only in DMs and group DMs; server chat is names and text",
    smallAvatars: "Smaller square avatars where avatars show",
    hoverTimestamps: "Timestamps appear when you hover a message",
    readingWidth: "Messages wrap at a reading width (about 100 characters) instead of the full window",
    quietMembers: "Member list: small avatars, body-size names, no animated nameplates behind names",
    quietReplies: "Replies as one dim line above the message (↩ name, first line), no curved connector",
    quietReactions: "Reactions as small hairline chips; the add-reaction button only on the message you point at",
    compactEmbeds: "Smaller embeds and media, embed descriptions clipped to three lines, thread previews as one dim line",
    flatComposer: "Composer as a flat line: no box or glow, emoji the only button on the right (GIFs and stickers are tabs in its picker), faint until you use it",
    slimUserPanel: "Account panel as a plain bar across the sidebar bottom: no status line, device carets or red wash when muted",
    quietScrollbars: "Scrollbars show only while you hover",
    stillMotion: "No typing dots or looping effects (animated avatars are Theme's own option)",
} as const;

type Key = keyof typeof Options;

// Off unless switched on. Avatars stay: he wants faces in chat (2026-10-06).
const OffByDefault = new Set<Key>(["avatarsInDmsOnly"]);

const settings = definePluginSettings({
    ...Object.fromEntries(Object.entries(Options).map(([key, description]) => [key, {
        type: OptionType.BOOLEAN,
        description,
        default: !OffByDefault.has(key as Key),
        onChange: apply
    }])) as Record<Key, { type: OptionType.BOOLEAN; description: string; default: boolean; onChange(): void; }>,
    scaleWithWindow: {
        type: OptionType.BOOLEAN,
        description: "Scale everything with the window: 100% when it's 720px tall or less, up to 130% from 1300px (full screen on a 1440p monitor)",
        default: true,
        onChange: applyScale
    },
    extraScale: {
        type: OptionType.SLIDER,
        description: "Overall size (%), on top of window scaling",
        markers: [80, 90, 100, 110, 125, 150],
        default: 100,
        stickToMarkers: true,
        onChange: applyScale
    }
});

function apply() {
    document.documentElement.dataset.dkLayout = (Object.keys(Options) as Key[]).filter(k => settings.store[k]).join(" ");
}

// ── Scale: the whole app zooms with the window's height, in 5% steps, through Electron's own
// zoom (native.ts). CSS zoom on <html> broke Discord's popout placement (menus landed zoom-times
// too far right and down). Heights are logical pixels: innerHeight × the zoom in effect. ──

const Native = VencordNative.pluginHelpers.QuietLayout as PluginNative<typeof import("./native")>;

const SCALE_FROM = 720, SCALE_TO = 1300, SCALE_MAX = 1.3;
let current = 1;

function zoomFor(height: number) {
    const t = Math.min(1, Math.max(0, (height - SCALE_FROM) / (SCALE_TO - SCALE_FROM)));
    return 1 + (SCALE_MAX - 1) * t;
}

async function applyScale() {
    const auto = settings.store.scaleWithWindow ? zoomFor(window.innerHeight * current) : 1;
    const zoom = Math.round(auto * (settings.store.extraScale ?? 100) / 100 * 20) / 20;
    if (zoom === current) return;
    current = zoom;
    await Native.setZoom(zoom);
}

let frame = 0;
const onResize = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(applyScale);
};

export default definePlugin({
    name: "QuietLayout",
    description: "A quiet, Slack-shaped Discord: grey rail, bare header, one-line rows, names and text without avatars in servers, nothing animating.",
    authors: [{ name: "Aditya Padwal", id: 0n }],
    enabledByDefault: true,
    settings,
    managedStyle: style,

    async start() {
        apply();
        current = await Native.getZoom().catch(() => 1);
        await applyScale();
        window.addEventListener("resize", onResize);
    },
    stop() {
        window.removeEventListener("resize", onResize);
        cancelAnimationFrame(frame);
        delete document.documentElement.dataset.dkLayout;
        current = 1;
        Native.setZoom(1);
    }
});
