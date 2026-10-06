/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Ctrl+1…9 (Cmd on a Mac) opens favourite 1…9 in his order: a conversation or channel opens, a
// voice channel opens its chat; with Shift a voice channel joins. Holding Ctrl for half a second
// shows the numbers on the favourites (a quick Ctrl+K or Ctrl+C never flashes them).

import { ChannelStore } from "@webpack/common";

import { track } from "../core/telemetry";
import { getFavorites, joinVoice, openChannel, openVoiceChat } from "./data";

const HINT_AFTER = 500;
let hintTimer = 0;

const showHints = () => { document.documentElement.dataset.dkCtrl = ""; };
const hideHints = () => {
    clearTimeout(hintTimer);
    delete document.documentElement.dataset.dkCtrl;
};

function onKeyDown(e: KeyboardEvent) {
    if ((e.key === "Control" || e.key === "Meta") && !e.repeat) {
        clearTimeout(hintTimer);
        hintTimer = window.setTimeout(showHints, HINT_AFTER);
        return;
    }
    hideHints();
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const n = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (!n) return;
    const fav = getFavorites()[Number(n) - 1];
    const channel = fav && ChannelStore.getChannel(fav.id);
    if (!channel) return;
    e.preventDefault();
    e.stopPropagation();
    track("favorite_key");
    const voice = channel.type === 2 || channel.type === 13;
    if (voice) e.shiftKey ? joinVoice(channel) : openVoiceChat(channel);
    else openChannel(channel.id);
}

const onKeyUp = (e: KeyboardEvent) => { if (e.key === "Control" || e.key === "Meta") hideHints(); };

export function startFavoriteKeys() {
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", hideHints);
}

export function stopFavoriteKeys() {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", hideHints);
    hideHints();
}
