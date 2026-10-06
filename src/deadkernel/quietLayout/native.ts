/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The window's real zoom (what Ctrl + does), not CSS zoom: Discord positions popouts from
// getBoundingClientRect, and under CSS zoom on <html> every menu landed zoom-times too far out.

import { IpcMainInvokeEvent } from "electron";

export function setZoom(e: IpcMainInvokeEvent, factor: number) {
    if (Number.isFinite(factor) && factor >= 0.5 && factor <= 3) e.sender.setZoomFactor(factor);
}

export function getZoom(e: IpcMainInvokeEvent): number {
    return e.sender.getZoomFactor();
}
