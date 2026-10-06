/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// DeadKernel's link home: updates through GitHub releases, announcements, and opt-in telemetry.
// personal/RELEASING.md. Everything here is read-only towards Discord: it never touches the
// account, and its only network calls are in native.ts.

import { showNotification } from "@api/Notifications";
import { Settings as VencordSettings } from "@api/Settings";
import { relaunch } from "@utils/native";
import definePlugin, { PluginNative } from "@utils/types";
import { changes, checkForUpdates, update } from "@utils/updater";
import { Alerts } from "@webpack/common";

import { settings } from "./settings";
import { startTaskbar, stopTaskbar, taskbarClick } from "./taskbar";
import { canSend, startTelemetry, stopTelemetry } from "./telemetry";

const Native = VencordNative.pluginHelpers.DeadKernel as PluginNative<typeof import("./native")>;

const NOTICE_EVERY = 3 * 60 * 60_000;
const UPDATE_EVERY = 3 * 60 * 60_000;

interface Notice { id: string; title: string; body: string; url?: string; until?: string; }

const timers: number[] = [];

/** Asked once, ten seconds in, and only by builds that can actually send. */
function askConsent() {
    if (settings.store.askedConsent || !canSend()) return;
    Alerts.show({
        title: "Help shape DeadKernel?",
        body: "Share anonymous usage with Aditya: which DeadKernel features you use, your DeadKernel settings, and any errors. "
            + "Never names, IDs, servers, channels or messages. Settings > Vencord > Plugins > DeadKernel shows exactly what's sent, "
            + "and turns it off.",
        confirmText: "Share",
        cancelText: "Don't share",
        onConfirm: () => { settings.store.telemetry = true; settings.store.askedConsent = true; },
        onCancel: () => { settings.store.askedConsent = true; }
    });
}

/** notices.json on the dk-notices branch: each notice shows once, until its date. */
async function checkNotices() {
    if (!settings.store.notices) return;
    const text = await Native.fetchNotices().catch(() => null);
    if (!text) return;
    let notices: Notice[] = [];
    try { notices = JSON.parse(text).notices ?? []; } catch { return; }
    const seen = new Set(settings.store.seenNotices);
    const today = new Date().toISOString().slice(0, 10);
    const fresh = notices.filter(n => n?.id && !seen.has(n.id) && (!n.until || n.until >= today)).slice(0, 2);
    for (const n of fresh) {
        showNotification({
            title: n.title,
            body: n.body,
            permanent: true,
            onClick: n.url ? () => VencordNative.native.openExternal(n.url!) : undefined
        });
        seen.add(n.id);
    }
    if (fresh.length) settings.store.seenNotices = [...seen].slice(-100);
}

/** Vencord checks for an update when Discord starts; this catches releases during long sessions. */
async function checkUpdate() {
    if (IS_UPDATER_DISABLED) return;
    try {
        if (!await checkForUpdates()) return;
        const what = changes?.[0]?.message ?? "A new build is ready";
        if (VencordSettings.autoUpdate) {
            await update();
            showNotification({ title: "DeadKernel updated", body: `${what}. Click to restart.`, permanent: true, onClick: relaunch });
        } else {
            showNotification({ title: "A DeadKernel update is available", body: `${what}. Settings > Vencord > Updater.`, permanent: true });
        }
    } catch { /* offline or rate-limited: try next time */ }
}

export default definePlugin({
    name: "DeadKernel",
    description: "Updates from DeadKernel's GitHub releases, announcements about new builds, Windows taskbar mute/deafen buttons, and opt-in anonymous usage telemetry.",
    authors: [{ name: "Aditya Padwal", id: 0n }],
    enabledByDefault: true,
    settings,

    /** called by the main process when a taskbar button is clicked (native.ts) */
    taskbarClick,

    start() {
        startTelemetry();
        if (settings.store.taskbar) startTaskbar();
        timers.push(
            window.setTimeout(askConsent, 10_000),
            window.setTimeout(checkNotices, 30_000),
            window.setInterval(checkNotices, NOTICE_EVERY),
            window.setInterval(checkUpdate, UPDATE_EVERY)
        );
    },

    stop() {
        stopTelemetry();
        stopTaskbar();
        timers.forEach(t => { clearTimeout(t); clearInterval(t); });
        timers.length = 0;
    }
});
