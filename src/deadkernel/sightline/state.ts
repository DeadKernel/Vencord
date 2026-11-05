/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType, PluginNative } from "@utils/types";
import { showToast, useEffect, useState } from "@webpack/common";

/** What the Sightline app reports (bridge.rs View). */
export interface SightlineState {
    incompatible?: boolean;
    protocol: number;
    appVersion: string;
    name: string;
    room: string | null;
    link: string | null;
    viewer: string;
    ready: boolean;
    live: { label: string; source: string; startedAt: number; } | null;
}

/** One thing the app can share (Sightline's `Pick`). */
export interface SightlineSource { spec: string; kind: string; label: string; detail: string; }

export const settings = definePluginSettings({
    // the viewer's address, remembered from the app so friends' links still open here while it's closed
    viewer: { type: OptionType.STRING, description: "Sightline's viewer address (set by the app)", default: "", hidden: true }
});

// Absent outside the desktop app (the browser extension, the web), where the plugin does nothing.
export const Native = (VencordNative.pluginHelpers.Sightline ?? null) as PluginNative<typeof import("./native")> | null;

let current: SightlineState | null = null;
let busy = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function setState(s: SightlineState | null) {
    current = s;
    if (s?.viewer && !s.incompatible && settings.store.viewer !== s.viewer) settings.store.viewer = s.viewer;
    emit();
}

/** The app's state (null: not running) and whether a request is on its way. */
export function useSightline(): [SightlineState | null, boolean] {
    const [, tick] = useState(0);
    useEffect(() => {
        const l = () => tick(n => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
    return [current, busy];
}

/** Ask the app for something; a refusal shows as a toast. */
export async function ask(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
    if (!Native) return null;
    busy = true;
    emit();
    try {
        const r = await Native.call(cmd, args);
        if (!r.ok) showToast({ text: r.error, variant: "critical" });
        return r.ok ? r.result : null;
    } finally {
        busy = false;
        emit();
    }
}

/** What the app could share, without the busy state or toasts of `ask` (for menus filled ahead of time). */
export async function listSources(): Promise<SightlineSource[]> {
    const r = await Native?.call("sources").catch(() => null);
    return r?.ok ? r.result as SightlineSource[] : [];
}

export function watchHere(url: string) {
    Native?.openViewer(url, settings.store.viewer || undefined).then(ok => {
        if (!ok) showToast({ text: "That isn't a Sightline link this app knows", variant: "critical" });
    });
}

/** Sightline watch links in some text, on the viewer the app uses. */
export function watchLinks(text: string | undefined): string[] {
    const viewer = (current?.viewer || settings.store.viewer).replace(/\/+$/, "");
    if (!text || !viewer || !text.includes(viewer)) return [];
    const esc = viewer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = text.match(new RegExp(`${esc}/r/[a-z0-9-]{1,32}(?:\\?[^\\s<>)]*)?`, "g")) ?? [];
    return [...new Set(found)];
}
