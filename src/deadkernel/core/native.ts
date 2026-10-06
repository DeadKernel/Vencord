/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// DeadKernel's main-process side: its only two network calls (Discord's page CSP doesn't allow these
// hosts; the URLs are fixed here, not passed in, so nothing in the page can point them elsewhere),
// and the Windows taskbar buttons.

import { BrowserWindow, IpcMainInvokeEvent, nativeImage } from "electron";

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

/** Windows' thumbnail toolbar (the buttons under the taskbar preview, like a media player's):
 * Mute, Deafen, Disconnect. A click calls back into the page by button id. Empty list clears it. */
export function setTaskbarButtons(e: IpcMainInvokeEvent, buttons: { id: string; tooltip: string; icon: string; }[]): boolean {
    if (process.platform !== "win32") return false;
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || !Array.isArray(buttons)) return false;
    const page = e.sender;
    return win.setThumbarButtons(buttons.filter(b => /^[a-z]+$/.test(b.id) && b.icon.startsWith("data:image/png")).map(b => ({
        tooltip: String(b.tooltip).slice(0, 60),
        icon: nativeImage.createFromDataURL(b.icon),
        click: () => {
            if (!page.isDestroyed()) page.executeJavaScript(`Vencord.Plugins.plugins.DeadKernel?.taskbarClick?.("${b.id}")`);
        }
    })));
}

