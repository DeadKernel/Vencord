/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Focus: for an hour, or until he ends it, only favourites can notify him: DMs from favourite people,
// messages in favourite channels and groups, and anything a favourite person sends. Everything else
// still arrives and still counts as unread; it just doesn't pop up or ding. Calls ringing him are
// untouched. personal/SCREENS.md "Focus".
//
// It filters Discord's own notification call, which receives the message's sender and channel.

import { findByPropsLazy } from "@webpack";
import { ChannelStore } from "@webpack/common";

import { track } from "../core/telemetry";
import { getFavorites, settings } from "./data";

const Notifications = findByPropsLazy("showNotification", "playNotificationSound");

/** focusUntil: 0 off, -1 until he ends it, otherwise a time */
export const focusOn = (until = settings.store.focusUntil) => until === -1 || until > Date.now();

export function setFocus(minutes: number | "on" | "off") {
    track(minutes === "off" ? "focus_end" : "focus_start");
    settings.store.focusUntil = minutes === "off" ? 0 : minutes === "on" ? -1 : Date.now() + minutes * 60_000;
}

/** "42m left", "1h 5m left", or "on" */
export function focusLeft(until = settings.store.focusUntil) {
    if (until === -1) return "on";
    const m = Math.max(1, Math.round((until - Date.now()) / 60_000));
    if (m < 60) return `${m}m left`;
    return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m / 60}h left`;
}

/** Whether Focus lets this notification through (exported for personal/tools/actions.mjs). */
export function fromFavourite(props: any) {
    if (props?.notif_type !== "MESSAGE_CREATE") return true;
    const favs = getFavorites();
    if (favs.some(f => f.id === props.channel_id)) return true;
    const people = new Set(favs.map(f => ChannelStore.getChannel(f.id)).filter(c => c?.type === 1).map(c => c!.recipients[0]));
    return people.has(props.notif_user_id);
}

let original: ((...args: any[]) => unknown) | null = null;

export function startFocusFilter() {
    if (original) return;
    original = Notifications.showNotification;
    Notifications.showNotification = function (this: unknown, ...args: any[]) {
        if (focusOn() && !fromFavourite(args[3])) {
            track("focus_held");
            return;
        }
        return original!.apply(this, args);
    };
}

export function stopFocusFilter() {
    if (!original) return;
    Notifications.showNotification = original;
    original = null;
}
