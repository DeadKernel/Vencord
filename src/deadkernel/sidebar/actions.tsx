/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Hover actions on a row: what a conversation or voice channel can do besides its click.

import { classes } from "@utils/misc";
import { Channel } from "@vencord/discord-types";

import { callChannel, joinVoice, labelFor, openChannel, openVoiceChat } from "./data";

export interface RowAction { label: string; title: string; run(): void; primary?: boolean; }

/** What a conversation or voice channel can do besides opening: shown on hover or keyboard focus,
 * over the row's right end. Voice: join (the click) and its chat; people: message (the click) and call. */
export function actionsFor(channel?: Channel | null): RowAction[] {
    if (!channel) return [];
    if (channel.type === 2 || channel.type === 13) return [
        { label: "chat", title: `Open ${channel.name}'s chat without joining`, run: () => openVoiceChat(channel) },
        { label: "join", title: `Join ${channel.name}`, run: () => joinVoice(channel), primary: true }
    ];
    if (channel.type === 1 || channel.type === 3) return [
        { label: "call", title: `Call ${labelFor(channel)}`, run: () => callChannel(channel) },
        { label: "message", title: `Message ${labelFor(channel)}`, run: () => openChannel(channel.id), primary: true }
    ];
    return [];
}

export function RowActions({ actions }: { actions: RowAction[]; }) {
    if (!actions.length) return null;
    return (
        <span className="dk-sb-actions">
            {actions.map(a => (
                <button key={a.label} className={classes("dk-sb-action", a.primary && "dk-primary")} title={a.title} data-dk-nav
                    onClick={e => { e.stopPropagation(); a.run(); }}>{a.label}</button>
            ))}
        </span>
    );
}
