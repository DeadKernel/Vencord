/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import definePlugin, { OptionType } from "@utils/types";

// The theme itself lives in personal/ so the same file also works as a BetterDiscord / Vencord theme.
import style from "../../../personal/themes/humanlayer/HumanLayer.theme.css?managed";
import palettes from "./palettes.css?managed";

// Palettes set only the base colour tokens; density sets row height and message spacing. Both are
// data attributes on <html>, which Discord leaves alone (it rewrites the root's class and style).
const settings = definePluginSettings({
    palette: {
        type: OptionType.SELECT,
        description: "Palette",
        options: [
            { label: "HumanLayer: Poimandres blue-grey", value: "humanlayer", default: true },
            { label: "Midnight: true black for OLED, electric blue", value: "midnight" },
            { label: "Gruvbox: warm and retro", value: "gruvbox" },
            { label: "Nord: cool, quiet contrast", value: "nord" },
            { label: "Paper: light, warm off-white, ink blue", value: "paper" }
        ],
        onChange: apply
    },
    density: {
        type: OptionType.SELECT,
        description: "Density: row height and the space between messages",
        options: [
            { label: "Compact", value: "compact" },
            { label: "Default", value: "default", default: true },
            { label: "Comfortable", value: "comfortable" }
        ],
        onChange: apply
    }
});

function apply() {
    const root = document.documentElement;
    if (settings.store.palette && settings.store.palette !== "humanlayer") root.dataset.dkPalette = settings.store.palette;
    else delete root.dataset.dkPalette;
    if (settings.store.density && settings.store.density !== "default") root.dataset.dkDensity = settings.store.density;
    else delete root.dataset.dkDensity;
}

export default definePlugin({
    name: "HumanLayerTheme",
    description: "HumanLayer's design system: Poimandres palette, IBM Plex Mono, square corners, hairline borders.",
    authors: [{ name: "Aditya Padwal", id: 0n }],
    enabledByDefault: true,
    managedStyle: style,
    settings,

    start() {
        enableStyle(palettes);
        apply();
    },
    stop() {
        disableStyle(palettes);
        delete document.documentElement.dataset.dkPalette;
        delete document.documentElement.dataset.dkDensity;
    }
});
