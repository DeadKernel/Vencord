/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Hover actions on a row: what a conversation or voice channel can do besides its click.

import { classes } from "@utils/misc";
import { Channel } from "@vencord/discord-types";

import { callChannel, joinVoice, labelFor, openChannel, openVoiceChat } from "./data";
import { Icon, IconName } from "./icons";

export interface RowAction { label: string; icon: IconName; title: string; run(): void; primary?: boolean; }

/** What a conversation or voice channel can do besides opening: shown on hover or keyboard focus,
 * over the row's right end. Voice: join (the click) and its chat; people: message (the click) and call. */
export function actionsFor(channel?: Channel | null): RowAction[] {
    if (!channel) return [];
    if (channel.type === 2 || channel.type === 13) return [
        { label: "chat", icon: "chat", title: `Open ${channel.name}'s chat without joining`, run: () => openVoiceChat(channel) },
        { label: "join", icon: "join", title: `Join ${channel.name}`, run: () => joinVoice(channel), primary: true }
    ];
    if (channel.type === 1 || channel.type === 3) return [
        { label: "call", icon: "phone", title: `Call ${labelFor(channel)}`, run: () => callChannel(channel) },
        { label: "message", icon: "chat", title: `Message ${labelFor(channel)}`, run: () => openChannel(channel.id), primary: true }
    ];
    return [];
}

export function RowActions({ actions }: { actions: RowAction[]; }) {
    if (!actions.length) return null;
    return (
        <span className="dk-sb-actions">
            {actions.map(a => (
                <button key={a.label} className={classes("dk-sb-action", a.primary && "dk-primary")} title={a.title} aria-label={a.title}
                    data-dk-nav data-dk-action={a.label} onClick={e => { e.stopPropagation(); a.run(); }}><Icon name={a.icon} size={16} /></button>
            ))}
        </span>
    );
}
