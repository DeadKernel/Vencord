/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { Channel, User } from "@vencord/discord-types";
import { ChannelStore, Menu } from "@webpack/common";
import type { ReactNode } from "react";

import { addFavorite, applyAttr, isFavorite, removeFavorite, settings } from "./data";
import { ChannelAreaProps, Sidebar } from "./Sidebar";
import style from "./sidebar.css?managed";

// Discord's server rail never shows while the sidebar is on: at the top level the sidebar lists
// servers itself, and inside a server our strip does (personal/SCREENS.md). Live on the setting.
function RailGate({ children }: { children: ReactNode; }) {
    const { enabled } = settings.use(["enabled"]);
    return enabled ? null : <>{children}</>;
}

// Where Discord chooses between a server's channel list and the DM list. On any crash, Discord's
// own list renders instead of an error card (personal/SIDEBAR.md: breakage falls back to stock).
const ChannelArea = ErrorBoundary.wrap((props: ChannelAreaProps) => {
    const { enabled } = settings.use(["enabled"]);
    return enabled ? <Sidebar {...props} /> : <>{props.original()}</>;
}, {
    fallback: ({ wrappedProps }) => <>{wrappedProps.original()}</>
});

function favoriteItem(id?: string) {
    if (!id || !ChannelStore.getChannel(id)) return null;
    return isFavorite(id)
        ? <Menu.MenuItem id="dk-unfavorite" label="Remove from Favorites" action={() => removeFavorite(id)} />
        : <Menu.MenuItem id="dk-favorite" label="Add to Favorites" action={() => addFavorite(id)} />;
}

const channelMenu: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    const item = favoriteItem(channel?.id);
    if (item) children.push(<Menu.MenuSeparator />, item);
};

const userMenu: NavContextMenuPatchCallback = (children, { user, channel }: { user?: User; channel?: Channel; }) => {
    const id = channel?.type === 1 ? channel.id : user && ChannelStore.getDMFromUserId(user.id);
    const item = favoriteItem(id ?? undefined);
    if (item) children.push(<Menu.MenuSeparator />, item);
};

export default definePlugin({
    name: "Sidebar",
    description: "One sidebar instead of the server rail and channel list: what needs you, favorites, messages, and your servers.",
    authors: [{ name: "Aditya Padwal", id: 0n }],
    enabledByDefault: true,
    settings,
    managedStyle: style,

    patches: [{
        find: "APPLICATION_LIBRARY,render:",
        group: true,
        replacement: [
            {
                // the guild rail: a&&(0,y.jsx)(GuildsBar,{className,themeOverride})
                match: /(?<=children:\[)(\i)&&(\(0,(\i)\.jsx\)\(\i\.\i,\{className:\i\.\i,themeOverride:\i\}\))/,
                replace: "$1&&(0,$3.jsx)($self.RailGate,{children:$2})"
            },
            {
                // null!=guildId ? <GuildSidebar/> : <PrivateChannels/>
                match: /null!=(\i)\?\(0,(\i)\.jsx\)\((\i),\{selectedChannelId:(\i),guildId:\1\},\1\):\(0,\2\.jsx\)\((\i),\{\}\)/,
                replace: "(0,$2.jsx)($self.ChannelArea,{guildId:$1,selectedChannelId:$4,GuildSidebar:$3,PrivateChannels:$5,original:()=>$&})"
            }
        ]
    }],

    contextMenus: {
        "channel-context": channelMenu,
        "thread-context": channelMenu,
        "gdm-context": channelMenu,
        "user-context": userMenu
    },

    RailGate,
    ChannelArea,

    start: applyAttr,
    stop() {
        delete document.documentElement.dataset.dkSidebar;
    }
});
