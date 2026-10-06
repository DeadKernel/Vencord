/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Opt-in, anonymous usage telemetry (personal/RELEASING.md "Telemetry"). What it can contain is
// decided here and nowhere else:
//   - counts of DeadKernel features used (track("palette_open")), never what they were used on;
//   - DeadKernel's own settings (booleans, option names) and a few sizes (window width bucket);
//   - errors from DeadKernel's own components, with long numbers (Discord ids) and user paths removed.
// It is collected in memory either way (the settings page shows it), and only sent when he has
// opted in AND the build has a PostHog key. The id is random per install, not his Discord account.

import { Settings as VencordSettings } from "@api/Settings";
import { PluginNative } from "@utils/types";

import gitHash from "~git-hash";

import { POSTHOG_KEY } from "./config";
import { settings } from "./settings";

const Native = VencordNative.pluginHelpers.DeadKernel as PluginNative<typeof import("./native")>;

const FLUSH_EVERY = 15 * 60_000;

const counts = new Map<string, number>();
const errors: { component: string; message: string; stack: string; }[] = [];
let sinceLastFlush = Date.now();
let sessionSent = false;
let lastSent: unknown[] | null = null;

/** Count one use of a feature. Names are fixed strings from our code, e.g. "palette_action:mute". */
export function track(name: string) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
}

const scrub = (s: string) => s
    .replace(/\d{15,}/g, "<id>")
    .replace(/[A-Za-z]:\\Users\\[^\\]+/g, "~")
    .replace(/\/(?:home|Users)\/[^/]+/g, "~");

/** An error caught by one of our ErrorBoundaries. */
export function trackError(component: string, error: unknown) {
    const e = error as Error | undefined;
    if (errors.length >= 20) return;
    errors.push({
        component,
        message: scrub(String(e?.message ?? e)).slice(0, 300),
        stack: scrub(String(e?.stack ?? "")).split("\n").slice(0, 6).join("\n")
    });
}

export function installId() {
    if (!settings.store.installId) settings.store.installId = crypto.randomUUID();
    return settings.store.installId;
}

function os() {
    const ua = navigator.userAgent;
    return /Windows/.test(ua) ? "windows" : /Mac OS/.test(ua) ? "mac" : /Linux/.test(ua) ? "linux" : "other";
}

const widthBucket = () => {
    const w = window.innerWidth;
    return w < 1280 ? "<1280" : w < 1600 ? "1280-1599" : w < 1920 ? "1600-1919" : "1920+";
};

/** DeadKernel's own settings: plugin on/off, option names, a couple of numbers. */
function setup() {
    const p = VencordSettings.plugins;
    const off = (name: string) => Object.entries(p[name] ?? {}).filter(([k, v]) => k !== "enabled" && v === false).map(([k]) => k);
    const sidebar = p.Sidebar ?? {};
    return {
        sidebar: !!sidebar.enabled,
        quiet_layout: !!p.QuietLayout?.enabled,
        declutter: !!p.Declutter?.enabled,
        theme: !!p.HumanLayerTheme?.enabled,
        sidebar_home: sidebar.home !== false,
        sidebar_palette: sidebar.palette !== false,
        sidebar_collapse_muted: !!sidebar.collapseMuted,
        quiet_layout_off: off("QuietLayout"),
        declutter_changed: Object.keys(p.Declutter?.overrides ?? {}),
        favorites: Object.values(sidebar.favorites ?? {}).reduce((n: number, l: any) => n + (Array.isArray(l) ? l.length : 0), 0)
    };
}

/** What a flush would send right now (also what the settings page shows). */
export function pending(): unknown[] {
    const base = { distinct_id: installId(), timestamp: new Date().toISOString() };
    const common = { $process_person_profile: false, $lib: "deadkernel", build: gitHash, os: os() };
    const batch: any[] = [];
    if (!sessionSent) batch.push({ ...base, event: "dk_session_start", properties: { ...common, window: widthBucket(), ...setup() } });
    if (counts.size) batch.push({
        ...base, event: "dk_usage",
        properties: { ...common, minutes: Math.round((Date.now() - sinceLastFlush) / 60_000), ...Object.fromEntries(counts) }
    });
    for (const e of errors) batch.push({ ...base, event: "dk_error", properties: { ...common, ...e } });
    return batch;
}

export const lastBatch = () => lastSent;
export const canSend = () => !!POSTHOG_KEY;

export async function flush() {
    if (!settings.store.telemetry || !POSTHOG_KEY) return;
    const batch = pending();
    if (!batch.length) return;
    try {
        const status = await Native.sendTelemetry(batch);
        if (status >= 200 && status < 300) {
            lastSent = batch;
            sessionSent = true;
            counts.clear();
            errors.length = 0;
            sinceLastFlush = Date.now();
        }
    } catch { /* offline: keep counting, try next time */ }
}

let timer: number | undefined;
const onHide = () => { if (document.visibilityState === "hidden") flush(); };

export function startTelemetry() {
    timer = window.setInterval(flush, FLUSH_EVERY);
    document.addEventListener("visibilitychange", onHide);
    window.setTimeout(flush, 60_000);
}

export function stopTelemetry() {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onHide);
}
