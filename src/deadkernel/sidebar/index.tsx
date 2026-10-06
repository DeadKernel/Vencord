/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { Channel, Guild, User } from "@vencord/discord-types";
import { ChannelStore, Menu, ReadStateStore } from "@webpack/common";
import type { ComponentType, ReactNode } from "react";

import { trackError } from "../core/telemetry";
import { addFavorite, applyAttr, guildChannelIds, isFavorite, markRead, removeFavorite, settings } from "./data";
import { fromFavourite, startFocusFilter, stopFocusFilter } from "./focus";
import { Breadcrumb, Toolbar } from "./Header";
import { Home } from "./Home";
import { startFavoriteKeys, stopFavoriteKeys } from "./keys";
import { Palette } from "./Palette";
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
    fallback: ({ wrappedProps }) => <>{wrappedProps.original()}</>,
    onError: ({ error }) => trackError("Sidebar", error)
});

// Home, or Discord's Friends page (setting off, a deep link to a Friends tab, or a crash).
const HomeArea = ErrorBoundary.wrap((props: { Original: ComponentType<any>; initialSection?: string; }) => {
    const { enabled, home } = settings.use(["enabled", "home"]);
    const { Original, ...rest } = props;
    return enabled && home ? <Home {...props} /> : <Original {...rest} />;
}, {
    fallback: ({ wrappedProps: { Original, ...rest } }) => <Original {...rest} />,
    onError: ({ error }) => trackError("Home", error)
});

// Ctrl K: our palette in Discord's modal, or Discord's switcher (setting off, or a crash).
const PaletteArea = ErrorBoundary.wrap((props: { Original: ComponentType<any>; transitionState: any; onClose(): void; }) => {
    const { enabled, palette } = settings.use(["enabled", "palette"]);
    const { Original, ...rest } = props;
    return enabled && palette ? <Palette {...props} /> : <Original {...rest} />;
}, {
    fallback: ({ wrappedProps: { Original, ...rest } }) => <Original {...rest} />,
    onError: ({ error }) => trackError("Palette", error)
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

// Discord's server menu has no "Mark as read" (only the rail icon's menu does, and the rail is gone)
const guildHeaderMenu: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild) return;
    const ids = guildChannelIds(guild.id);
    if (!ids.some(id => ReadStateStore.hasUnread(id) || ReadStateStore.getMentionCount(id) > 0)) return;
    children.unshift(<Menu.MenuItem id="dk-mark-read" label="Mark as read" action={() => markRead(ids)} />, <Menu.MenuSeparator />);
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

    patches: [
        // Home: our page instead of Discord's Friends tabs when nothing is open (personal/SCREENS.md)
        {
            find: '"confirm-age"',
            replacement: {
                match: /(\i\.\i\.isInitialized\(\)\)\?)\(0,(\i)\.jsx\)\((\i),\{\.\.\.(\i)\}\)/,
                replace: "$1(0,$2.jsx)($self.HomeArea,{...$4,Original:$3})"
            }
        },
        // Ctrl K: the palette, inside the modal Discord opens for its switcher (personal/SCREENS.md)
        {
            find: '"QUICK_SWITCHER_MODAL_KEY"',
            replacement: {
                match: /(\(0,\i\.openModal\)\((\i)=>\(0,(\i)\.jsx\)\()(\i)(,\{\.\.\.\2\}\))/,
                replace: "$1$self.PaletteArea,{...$2,Original:$4})"
            }
        },
        // Conversation header: a favourite star in front of Discord's buttons (personal/SCREENS.md)
        {
            find: "Missing channel in Channel.renderHeaderToolbar",
            replacement: {
                match: /toolbar:this\.renderHeaderToolbar\(\)/,
                replace: "toolbar:$self.Toolbar(this.renderHeaderToolbar(),this.props.channel)"
            }
        },
        // ...and "server ›" before the channel name, in the slot Discord uses for its icon-only crumb
        {
            find: "Missing channel in Channel.renderHeaderToolbar",
            replacement: {
                match: /(\i)&&\(0,(\i)\.jsx\)\((\i\.\i),\{channel:(\i),guild:(\i),caretPosition:"right"\}\)/,
                replace: "(0,$2.jsx)($self.Breadcrumb,{channel:$4,guild:$5,discordShows:$1,Original:$3})"
            }
        },
        {
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
        }
    ],

    contextMenus: {
        "channel-context": channelMenu,
        "thread-context": channelMenu,
        "gdm-context": channelMenu,
        "user-context": userMenu,
        "guild-header-popout": guildHeaderMenu
    },

    RailGate,
    ChannelArea,
    Toolbar,
    Breadcrumb,
    HomeArea,
    PaletteArea,
    /** Focus's rule, for the actions test */
    focusAllows: fromFavourite,

    start() {
        applyAttr();
        startFocusFilter();
        startFavoriteKeys();
    },
    stop() {
        stopFocusFilter();
        stopFavoriteKeys();
        delete document.documentElement.dataset.dkSidebar;
    }
});
