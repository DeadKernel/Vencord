/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The only two network calls DeadKernel makes, from Electron's main process (Discord's page CSP
// doesn't allow these hosts). The URLs are fixed here, not passed in, so nothing in the page can
// point them elsewhere.

import { IpcMainInvokeEvent } from "electron";

import { NOTICES_URL, POSTHOG_HOST, POSTHOG_KEY } from "./config";

/** PostHog's batch endpoint. `batch` is built and shown to him in the renderer (telemetry.ts). */
export async function sendTelemetry(_: IpcMainInvokeEvent, batch: unknown[]): Promise<number> {
    if (!POSTHOG_KEY || !Array.isArray(batch) || !batch.length) return 0;
    const res = await fetch(`${POSTHOG_HOST}/batch/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: POSTHOG_KEY, batch })
    });
    return res.status;
}

/** notices.json from the dk-notices branch, or null. */
export async function fetchNotices(_: IpcMainInvokeEvent): Promise<string | null> {
    try {
        const res = await fetch(`${NOTICES_URL}?t=${Date.now()}`);
        return res.ok ? await res.text() : null;
    } catch {
        return null;
    }
}
