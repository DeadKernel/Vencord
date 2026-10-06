/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

// The theme itself lives in personal/ so the same file also works as a BetterDiscord / Vencord theme.
import style from "../../../personal/themes/humanlayer/HumanLayer.theme.css?managed";

export default definePlugin({
    name: "HumanLayerTheme",
    description: "HumanLayer's design system: Poimandres palette, IBM Plex Mono, square corners, hairline borders.",
    authors: [{ name: "Aditya Padwal", id: 0n }],
    enabledByDefault: true,
    managedStyle: style
});
