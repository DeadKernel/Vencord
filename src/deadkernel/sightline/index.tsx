/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Sightline in the client: a row in the sidebar to go live and share the link (Sidebar.tsx,
// SightlineRow), and "Watch here" under any Sightline link in chat, which opens the stream in its
// own window. Sightline's tray app does the streaming; this only talks to it (native.ts). Friends
// need none of it: the link opens in any browser. Nothing here acts on Discord by itself; putting
// the link in the message box leaves sending to him.

import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";

import { GoLiveButton, openGoLive } from "./golive";
import style from "./sightline.css?managed";
import { Native, setState, settings, SightlineState, watchHere, watchLinks } from "./state";
import { startWatch, stopWatch, test as watchTest } from "./watch";

const WatchHere = ErrorBoundary.wrap(function WatchHere({ message }: { message: Message; }) {
    const links = watchLinks(message.content);
    if (!links.length) return null;
    return (
        <div className="dk-sl-watch">
            {links.slice(0, 3).map(link => (
                <button key={link} className="dk-sl-watch-btn" onClick={() => watchHere(link)} title={link}>
                    Watch here
                </button>
            ))}
        </div>
    );
}, { noop: true });

export default definePlugin({
    name: "Sightline",
    description: "Go live with Sightline from the sidebar, and watch friends' Sightline links in a window here. Needs the Sightline app.",
    authors: [{ name: "DeadKernel", id: 0n }],
    enabledByDefault: true,
    settings,
    managedStyle: style,

    patches: [
        // The voice panel's buttons (camera, screen share, activities, soundboard): ours after Discord's
        // screen share. Same module as upstream CallTimer's find, matched once on stable and canary.
        {
            find: '"RTCConnectionMenu"',
            replacement: {
                match: /(\(0,(\i)\.jsx\)\(\i,\{channel:(\i),canGoLive:\i,enableActivities:\i,disabled:[^}]+\}\))/,
                replace: "$1,(0,$2.jsx)($self.GoLiveButton,{channel:$3})"
            }
        }
    ],

    GoLiveButton: ErrorBoundary.wrap(GoLiveButton, { noop: true }),
    /** for tests (personal/tools) */
    openGoLive,
    watchTest,

    renderMessageAccessory: props => <WatchHere message={props.message} />,

    /** native.ts pushes the app's state here */
    onState(s: SightlineState | null) {
        setState(s);
    },

    async start() {
        if (!Native) return;
        startWatch();
        setState(await Native.watch().catch(() => null));
    },

    stop() {
        stopWatch();
        Native?.unwatch();
        setState(null);
    }
});
