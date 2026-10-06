/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The settings page shows exactly what telemetry would send next, and what it sent last.

import { useState } from "@webpack/common";

import { settings } from "./settings";
import { canSend, lastBatch, pending } from "./telemetry";

export function TelemetryPreview() {
    const { telemetry } = settings.use(["telemetry"]);
    const [, refresh] = useState(0);
    const status = !canSend()
        ? "This build has no telemetry destination, so nothing is ever sent."
        : telemetry ? "On: sent every 15 minutes, and when the window is hidden." : "Off: nothing is sent.";
    const last = lastBatch();
    return (
        <div className="dk-telemetry">
            <p>{status}</p>
            <details>
                <summary>What would be sent next</summary>
                <pre>{JSON.stringify(pending(), null, 2)}</pre>
            </details>
            {last && (
                <details>
                    <summary>What was sent last</summary>
                    <pre>{JSON.stringify(last, null, 2)}</pre>
                </details>
            )}
            <button onClick={() => { settings.store.installId = crypto.randomUUID(); refresh(n => n + 1); }}>
                New anonymous id
            </button>
        </div>
    );
}
