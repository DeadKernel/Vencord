/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Avatars and server icons in the 24px slot every row has (animated ones play: Theme's
// "Animated avatars" wraps the URL helpers these call).

import { Channel } from "@vencord/discord-types";
import { GuildStore, IconUtils, UserStore } from "@webpack/common";

import { labelFor } from "./data";
import { IconSlot } from "./icons";

export function Square({ src, text, presence, size = "person" }: { src?: string | null; text?: string; presence?: string; size?: "person" | "server"; }) {
    return (
        <span className={`dk-sb-icon dk-sb-${size}`}>
            {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : <span className="dk-sb-glyph">{text}</span>}
            {presence && presence !== "offline" && <i className={`dk-sb-status dk-${presence}`} title={presence} />}
        </span>
    );
}

export function avatarSrc(channel: Channel) {
    if (channel.type === 1) return UserStore.getUser(channel.recipients[0])?.getAvatarURL(undefined, 48);
    if (channel.type === 3 && channel.icon) return IconUtils.getChannelIconURL({ id: channel.id, icon: channel.icon, size: 48 } as any);
    return null;
}

export const guildIcon = (guildId: string) => {
    const g = GuildStore.getGuild(guildId);
    return g?.icon ? IconUtils.getGuildIconURL({ id: g.id, icon: g.icon, size: 40 }) : null;
};

export function channelIcon(channel: Channel, presence?: string) {
    if (channel.type === 1 || channel.type === 3)
        return <Square src={avatarSrc(channel)} text={labelFor(channel)[0]} presence={presence} />;
    return <IconSlot name={channel.isThread?.() ? "thread" : channel.type === 2 || channel.type === 13 ? "voice"
        : channel.type === 15 || channel.type === 16 ? "forum" : channel.type === 5 ? "announce" : "hash"} />;
}
