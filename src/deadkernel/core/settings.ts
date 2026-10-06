/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { TelemetryPreview } from "./TelemetryPreview";

export const settings = definePluginSettings({
    telemetry: {
        type: OptionType.BOOLEAN,
        description: "Share anonymous usage with Aditya: which DeadKernel features you use, your DeadKernel settings, and errors. Never names, IDs, servers, channels or messages.",
        default: false
    },
    preview: {
        type: OptionType.COMPONENT,
        component: TelemetryPreview
    },
    notices: {
        type: OptionType.BOOLEAN,
        description: "Show announcements about new DeadKernel builds",
        default: true
    },
    /** asked once, on the first start */
    askedConsent: { type: OptionType.CUSTOM, default: false },
    /** random, not tied to the Discord account; reset from the preview */
    installId: { type: OptionType.CUSTOM, default: "" },
    seenNotices: { type: OptionType.CUSTOM, default: [] as string[] }
});
