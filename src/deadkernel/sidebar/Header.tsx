/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The conversation header: "server ›" before the name, and a favourite star among the buttons.
// personal/SCREENS.md "Conversation view". Both render inside Discord's own header, so they must
// never throw (the toolbar function returns Discord's items untouched on any error).

import ErrorBoundary from "@components/ErrorBoundary";
import { Channel, Guild } from "@vencord/discord-types";
import type { ComponentType, ReactNode } from "react";

import { addFavorite, drillIn, isFavorite, openGuild, removeFavorite, settings } from "./data";

function Star({ channel }: { channel: Channel; }) {
    settings.use(["favorites"]);
    const fav = isFavorite(channel.id);
    return (
        <button
            className="dk-star" data-on={fav || undefined}
            aria-pressed={fav}
            aria-label={fav ? "Remove from Favorites" : "Add to Favorites"}
            title={fav ? "Remove from Favorites" : "Add to Favorites"}
            onClick={() => fav ? removeFavorite(channel.id) : addFavorite(channel.id)}
        >
            {fav ? "★" : "☆"}
        </button>
    );
}

/** Discord's header toolbar items, with our star in front. */
export function Toolbar(items: ReactNode, channel?: Channel) {
    try {
        if (!settings.store.enabled || !channel || !Array.isArray(items)) return items;
        return [<ErrorBoundary noop key="dk-star"><Star channel={channel} /></ErrorBoundary>, ...items];
    } catch {
        return items;
    }
}

/** "server ›" before the channel name. Click: open that server's column. */
export const Breadcrumb = ErrorBoundary.wrap(({ channel, guild, discordShows, Original }: {
    channel: Channel; guild?: Guild | null; discordShows: boolean; Original: ComponentType<any>;
}) => {
    const { enabled } = settings.use(["enabled"]);
    if (enabled && guild) {
        return (
            <button className="dk-crumb" title={`${guild.name}: show its channels`} onClick={() => { drillIn(); openGuild(guild.id); }}>
                <span className="dk-crumb-name">{guild.name}</span><span className="dk-crumb-sep" aria-hidden>›</span>
            </button>
        );
    }
    return discordShows ? <Original channel={channel} guild={guild} caretPosition="right" /> : null;
}, { noop: true });
