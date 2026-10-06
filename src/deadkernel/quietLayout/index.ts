/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

import style from "./quietLayout.css?managed";

// Structure, not colour: the theme owns the look, Declutter owns what's hidden. Each option
// toggles a token in data-dk-layout on <html>; quietLayout.css keys off those tokens.
const Options = {
    squareRail: "Square server icons and plain indicators in the server rail",
    plainNames: "Names in one colour: no role colours in chat, replies or the member list",
    oneLineRows: "One line per row: no activity or custom-status line in the DM and member lists",
    quietSidebar: "Quieter channel list: unread is bold only (no side pips), muted channels dimmed",
    smallAvatars: "Smaller square avatars in chat",
    stillMotion: "Nothing moves by itself: no typing dots or looping effects",
} as const;

type Key = keyof typeof Options;

const settings = definePluginSettings(
    Object.fromEntries(Object.entries(Options).map(([key, description]) => [key, {
        type: OptionType.BOOLEAN,
        description,
        default: true,
        onChange: apply
    }])) as Record<Key, { type: OptionType.BOOLEAN; description: string; default: true; onChange(): void; }>
);

function apply() {
    document.documentElement.dataset.dkLayout = (Object.keys(Options) as Key[]).filter(k => settings.store[k]).join(" ");
}

export default definePlugin({
    name: "QuietLayout",
    description: "A quieter, Slack-shaped Discord: square rail, one-line rows, one colour for names, nothing animating.",
    authors: [{ name: "Aditya Padwal", id: 0n }],
    enabledByDefault: true,
    settings,
    managedStyle: style,

    start: apply,
    stop() {
        delete document.documentElement.dataset.dkLayout;
    }
});
