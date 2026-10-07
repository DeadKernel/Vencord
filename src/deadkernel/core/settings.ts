/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { startTaskbar, stopTaskbar } from "./taskbar";
import { TelemetryPreview } from "./TelemetryPreview";

export const settings = definePluginSettings({
    telemetry: {
        type: OptionType.BOOLEAN,
        description: "Share anonymous usage with Aditya: which of his changes you use, how you've set them, and errors. Never names, IDs, servers, channels or messages.",
        default: false
    },
    preview: {
        type: OptionType.COMPONENT,
        component: TelemetryPreview
    },
    taskbar: {
        type: OptionType.BOOLEAN,
        description: "Windows: Mute, Deafen (and Disconnect in a call) buttons when you hover Discord's taskbar icon",
        default: true,
        onChange: (on: boolean) => { stopTaskbar(); if (on) startTaskbar(); }
    },
    notices: {
        type: OptionType.BOOLEAN,
        description: "Show announcements about new builds",
        default: true
    },
    /** asked once, on the first start */
    askedConsent: { type: OptionType.CUSTOM, default: false },
    /** random, not tied to the Discord account; reset from the preview */
    installId: { type: OptionType.CUSTOM, default: "" },
    seenNotices: { type: OptionType.CUSTOM, default: [] as string[] }
});
