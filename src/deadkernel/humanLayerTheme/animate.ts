/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Animated avatars and server icons always play, not only while hovered: Discord asks for the
// animated image only when a component passes canAnimate, which most do on hover. These wrap the
// URL helpers every avatar and icon goes through (Discord's and ours) to always ask for it. Off
// under prefers-reduced-motion. Undone on stop.

import { FluxDispatcher, IconUtils, UserStore } from "@webpack/common";

const undo: (() => void)[] = [];

function wrap<T extends object>(obj: T, key: string, fix: (args: any[]) => any[]) {
    const target = obj as any;
    const orig = target[key];
    if (typeof orig !== "function") return;
    target[key] = function (this: unknown, ...args: any[]) { return orig.apply(this, fix(args)); };
    undo.push(() => { target[key] = orig; });
}

/** set argument i to true (canAnimate passed positionally) */
const at = (i: number) => (a: any[]) => { const c = [...a]; while (c.length <= i) c.push(undefined); c[i] = true; return c; };
/** set canAnimate in an options object */
const opt = (a: any[]) => [{ ...a[0], canAnimate: true }, ...a.slice(1)];

let userClassDone = false;

function wrapUserClass() {
    if (userClassDone) return;
    const user = UserStore.getCurrentUser() ?? Object.values(UserStore.getUsers?.() ?? {})[0];
    if (!user) return;
    // User#getAvatarURL(guildId, size, canAnimate)
    wrap(Object.getPrototypeOf(user), "getAvatarURL", at(2));
    userClassDone = true;
}

export function startAnimatedImages() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    wrap(IconUtils, "getUserAvatarURL", at(1)); // (user, canAnimate, size)
    wrap(IconUtils, "getUserAvatarSource", at(1)); // (user, canAnimate, size)
    wrap(IconUtils, "getGuildMemberAvatarURL", at(1)); // (member, canAnimate)
    wrap(IconUtils, "getGuildMemberAvatarSource", at(2)); // (member, user, canAnimate)
    wrap(IconUtils, "getGuildMemberAvatarURLSimple", opt); // ({ ..., canAnimate })
    wrap(IconUtils, "getGuildIconURL", opt); // ({ id, icon, size, canAnimate })
    wrapUserClass();
    // right after a reload the user records may not exist yet
    if (!userClassDone) FluxDispatcher.subscribe("CONNECTION_OPEN", wrapUserClass);
}

export function stopAnimatedImages() {
    FluxDispatcher.unsubscribe("CONNECTION_OPEN", wrapUserClass);
    undo.splice(0).forEach(f => f());
    userClassDone = false;
}
