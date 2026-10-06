/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Ctrl K, inside Discord's own modal. Typing uses Discord's search and ranking (it reaches members
// and channels we haven't loaded); the empty state and ">" actions are ours. personal/SCREENS.md "Palette".

import { classes } from "@utils/misc";
import { ModalRoot as ModalRootUntyped } from "@utils/modal";
import { Channel, Guild, User } from "@vencord/discord-types";
import {
    ChannelStore, GuildStore, ReadStateStore, RelationshipStore, SelectedChannelStore, SettingsRouter, useEffect, useMemo, useRef, UserGuildSettingsStore,
useState, useStateFromStores
} from "@webpack/common";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";

import {
    addFavorite, broadcastServers, DirectItem, getFavorites, isFavorite, labelFor, markRead, openChannel, openFriends, openRequests,
    QuickSwitcher, QuickSwitcherStore, removeFavorite, selectDirectGrouped, selectMentionChannels, settings, suppressBroadcasts,
    suppressBroadcastsIn, toggleMute, userPresence
} from "./data";
import { channelIcon, guildIcon, Square } from "./Sidebar";

const ModalRoot = ModalRootUntyped as ComponentType<any>;

const RECENT_MAX = 5;
const DIRECT_MAX = 8;

interface Entry {
    key: string;
    label: string;
    where?: string;
    icon: ReactNode;
    count?: number;
    mention?: boolean;
    dot?: boolean;
    /** the channel ⇧↵ stars */
    favId?: string;
    /** asks for a second ↵ first, showing this instead of `where` (changes to his Discord settings across servers) */
    confirm?: string;
    run(): void;
}
type Line = Entry | { key: string; header: string; };
const isEntry = (l: Line): l is Entry => !("header" in l);

interface SwitcherResult { type: string; record: any; comparator?: string; }
interface SwitcherProps { query: string; queryMode: string | null; results: SwitcherResult[]; }

const glyph = (g: string) => <span className="dk-sb-icon dk-sb-hash" aria-hidden>{g}</span>;

const userName = (u: User) => RelationshipStore.getNickname(u.id) || (u as any).globalName || u.username;

// ── Entries ──────────────────────────────────────────────────────────────────

function channelEntry(channel: Channel, run = () => openChannel(channel.id)): Entry {
    const isDm = channel.type === 1 || channel.type === 3;
    const mentions = ReadStateStore.getMentionCount(channel.id);
    const unread = ReadStateStore.hasUnread(channel.id);
    return {
        key: channel.id,
        label: labelFor(channel),
        where: channel.guild_id ? GuildStore.getGuild(channel.guild_id)?.name : channel.type === 3 ? "group" : undefined,
        icon: channelIcon(channel, channel.type === 1 ? userPresence(channel.recipients[0]) : undefined),
        count: mentions,
        mention: !isDm,
        dot: unread && !mentions,
        favId: channel.id,
        run
    };
}

function serverMentionEntry({ guildId, channelIds, mentions }: Extract<DirectItem, { kind: "server"; }>): Entry | null {
    const guild = GuildStore.getGuild(guildId);
    if (!guild) return null;
    return {
        key: `g${guildId}`,
        label: guild.name,
        where: channelIds.length === 1 ? `#${ChannelStore.getChannel(channelIds[0])?.name ?? ""}` : `in ${channelIds.length} channels`,
        icon: <Square src={guildIcon(guildId)} text={guild.name[0]} size="server" />,
        count: mentions,
        mention: true,
        run: () => openChannel(channelIds[0])
    };
}

/** One of Discord's results, drawn our way. Enter does exactly what Discord's Enter does. */
function resultEntry(r: SwitcherResult, i: number, mode: string | null): Line | null {
    const go = () => QuickSwitcher.go(r, mode === "TEXT_CHANNEL");
    const key = `${r.type}${r.record?.id ?? i}`;
    switch (r.type) {
        case "HEADER":
            return { key, header: r.record.text };
        case "USER":
        case "DM": {
            const u = r.record as User;
            const dm = ChannelStore.getDMFromUserId(u.id);
            const name = userName(u);
            return {
                key, label: name, where: name !== u.username ? u.username : undefined,
                icon: <Square src={u.getAvatarURL(undefined, 48)} text={name[0]} presence={userPresence(u.id)} />,
                count: dm ? ReadStateStore.getMentionCount(dm) : 0,
                favId: dm ?? undefined, run: go
            };
        }
        case "TEXT_CHANNEL":
        case "VOICE_CHANNEL":
        case "GROUP_DM":
            return { ...channelEntry(r.record as Channel, go), key };
        case "GUILD": {
            const g = r.record as Guild;
            return { key, label: g.name, where: "server", icon: <Square src={guildIcon(g.id)} text={g.name[0]} size="server" />, run: go };
        }
        default:
            return { key, label: String(r.record?.name ?? r.comparator ?? r.type), where: r.type.toLowerCase().replace(/_/g, " "), icon: glyph("·"), run: go };
    }
}

// ── What each state lists ────────────────────────────────────────────────────

/** Nothing typed: where you just were, who's waiting, your favorites. */
function emptyLines(): Line[] {
    const here = SelectedChannelStore.getChannelId();
    const seen = new Set<string>(here ? [here] : []);
    const lines: Line[] = [];
    const section = (header: string, entries: (Entry | null)[]) => {
        const kept = entries.filter((e): e is Entry => !!e && !seen.has(e.key));
        if (!kept.length) return;
        kept.forEach(e => seen.add(e.key));
        lines.push({ key: `h-${header}`, header }, ...kept);
    };

    const { opened } = settings.store;
    section("Recent", Object.keys(opened).sort((a, b) => opened[b] - opened[a])
        .filter(id => id !== here && ChannelStore.getChannel(id)).slice(0, RECENT_MAX)
        .map(id => channelEntry(ChannelStore.getChannel(id))));

    const direct: DirectItem[] = JSON.parse(selectDirectGrouped());
    section("DMs & mentions", direct.slice(0, DIRECT_MAX).map(d => {
        if (d.kind === "server") return serverMentionEntry(d);
        const c = ChannelStore.getChannel(d.id);
        return c ? channelEntry(c) : null;
    }));

    section("Favorites", getFavorites().map(f => {
        const c = ChannelStore.getChannel(f.id);
        return c ? channelEntry(c) : null;
    }));
    return lines;
}

/** ">": the things you'd otherwise right-click for. Each runs only on Enter or click. */
function actionLines(query: string): Line[] {
    const here = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
    const guild = here?.guild_id ? GuildStore.getGuild(here.guild_id) : null;
    const mentions = selectMentionChannels();
    const broadcast = broadcastServers();
    const all: (Entry | false | null | undefined)[] = [
        mentions.length > 0 && {
            key: "a-read", label: "Mark mentions read", where: `${mentions.length} channel${mentions.length === 1 ? "" : "s"}`,
            icon: glyph("✓"), run: () => markRead(mentions)
        },
        here && (isFavorite(here.id)
            ? { key: "a-unfav", label: "Remove from Favorites", where: labelFor(here), icon: glyph("☆"), run: () => removeFavorite(here.id) }
            : { key: "a-fav", label: "Add to Favorites", where: labelFor(here), icon: glyph("★"), run: () => addFavorite(here.id) }),
        guild && {
            key: "a-tree", label: settings.store.showAll[guild.id] ? "Back to live channels" : "Use Discord's channel list here", where: guild.name,
            icon: glyph("≡"), run: () => settings.store.showAll = { ...settings.store.showAll, [guild.id]: !settings.store.showAll[guild.id] }
        },
        guild && {
            key: "a-mute", label: UserGuildSettingsStore.isMuted(guild.id) ? "Unmute server" : "Mute server", where: guild.name,
            icon: glyph("○"), run: () => toggleMute(guild.id)
        },
        guild && {
            key: "a-quiet", label: "Stop @everyone and role pings here", where: guild.name,
            icon: glyph("@"), run: () => suppressBroadcasts(guild.id)
        },
        broadcast.length > 0 && {
            key: "a-quiet-all", label: "Stop @everyone and role pings in large servers",
            where: `${broadcast.length} server${broadcast.length === 1 ? "" : "s"} over 100 members`,
            confirm: `↵ again · ${broadcast.length} server${broadcast.length === 1 ? "" : "s"}`,
            icon: glyph("@"), run: () => suppressBroadcastsIn(broadcast)
        },
        { key: "a-home", label: "Home", icon: glyph("⌂"), run: openFriends },
        { key: "a-req", label: "Message requests", icon: glyph("?"), run: openRequests },
        { key: "a-settings", label: "Settings", icon: glyph("⚙"), run: () => SettingsRouter.openUserSettings() }
    ];
    const q = query.trim().toLowerCase();
    return all.filter((e): e is Entry => !!e && (!q || `${e.label} ${e.where ?? ""}`.toLowerCase().includes(q)));
}

/** Typed: Discord's ranking, except an exact name goes first and favorites ahead of the rest. */
function resultLines(p: SwitcherProps, text: string): Line[] {
    const lines = p.results.map((r, i) => resultEntry(r, i, p.queryMode)).filter((l): l is Line => !!l);
    if (p.queryMode || lines.some(l => !isEntry(l))) return lines;
    const q = text.trim().toLowerCase();
    const rank = (e: Entry) => e.label.toLowerCase() === q ? 0 : e.favId && isFavorite(e.favId) ? 1 : 2;
    return (lines as Entry[]).slice().sort((a, b) => rank(a) - rank(b));
}

// ── The palette ──────────────────────────────────────────────────────────────

function Row({ entry, selected, armed, onHover, onRun }: { entry: Entry; selected: boolean; armed: boolean; onHover(): void; onRun(): void; }) {
    const countText = entry.count ? `${entry.mention ? "@" : ""}${entry.count > 99 ? "99+" : entry.count}` : "";
    const fav = entry.favId && isFavorite(entry.favId);
    return (
        <div
            className={classes("dk-pal-row", selected && "dk-selected", !!(entry.count || entry.dot) && "dk-unread")}
            role="option" aria-selected={selected} id={`dk-pal-${entry.key}`}
            onMouseMove={selected ? undefined : onHover} onClick={onRun}
        >
            {entry.icon}
            <span className="dk-sb-name">{entry.label}</span>
            {armed ? <span className="dk-sb-where dk-pal-confirm">{entry.confirm}</span> : entry.where && <span className="dk-sb-where">{entry.where}</span>}
            <span className="dk-sb-trail">
                {fav && <span className="dk-pal-fav" aria-label="favorite">★</span>}
                {countText ? <span className="dk-sb-count">{countText}</span> : entry.dot ? <span className="dk-sb-dot" /> : null}
            </span>
        </div>
    );
}

export function Palette({ Original, ...modal }: { Original: ComponentType<any>; transitionState: any; onClose(): void; }) {
    // settings.use hands back a fresh proxy each render; the ids are what the list depends on
    settings.use(["favorites"]);
    const favKey = getFavorites().map(f => f.id).join(",");
    const [text, setText] = useState("");
    const switcher: SwitcherProps = useStateFromStores([QuickSwitcherStore], () => QuickSwitcherStore.getProps(), [],
        (a: SwitcherProps, b: SwitcherProps) => a.results === b.results && a.queryMode === b.queryMode);

    const lines = useMemo(
        () => text === "" ? emptyLines() : text.startsWith(">") ? actionLines(text.slice(1)) : resultLines(switcher, text),
        [text, switcher, favKey]
    );
    const selectable = lines.flatMap((l, i) => isEntry(l) ? [i] : []);
    const [sel, setSel] = useState(-1);
    const current = selectable.includes(sel) ? sel : selectable[0] ?? -1;
    const listRef = useRef<HTMLDivElement>(null);

    // a new list starts at its first row
    useEffect(() => setSel(selectable[0] ?? -1), [lines]);
    useEffect(() => {
        listRef.current?.querySelector(".dk-selected")?.scrollIntoView({ block: "nearest" });
    }, [current, lines]);

    const update = (next: string) => {
        setText(next);
        if (!next.startsWith(">")) QuickSwitcher.search(next);
    };
    const [armed, setArmed] = useState<string | null>(null);
    useEffect(() => setArmed(null), [lines, current]);
    const run = (e: Entry) => {
        if (e.confirm && armed !== e.key) return setArmed(e.key);
        e.run();
        modal.onClose();
    };

    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        const at = selectable.indexOf(current);
        const entry = lines[current] as Entry | undefined;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!selectable.length) return;
            const step = e.key === "ArrowDown" ? 1 : -1;
            setSel(selectable[(at + step + selectable.length) % selectable.length]);
        } else if (e.key === "Enter" && entry) {
            e.preventDefault();
            if (!e.shiftKey) return run(entry);
            if (entry.favId) isFavorite(entry.favId) ? removeFavorite(entry.favId) : addFavorite(entry.favId);
        } else if (e.key === "Escape" && text) {
            // Esc clears first, then closes (Raycast)
            e.preventDefault();
            e.stopPropagation();
            update("");
        }
    };

    return (
        <ModalRoot {...modal} className="dk-pal" aria-label="Jump to">
            <div className="dk-pal-input">
                <span className="dk-pal-glyph" aria-hidden>⌕</span>
                <input
                    autoFocus spellCheck={false} value={text} placeholder="Jump to…  (> for actions)"
                    role="combobox" aria-expanded aria-controls="dk-pal-list"
                    aria-activedescendant={lines[current] ? `dk-pal-${lines[current].key}` : undefined}
                    onChange={e => update(e.currentTarget.value)} onKeyDown={onKey}
                />
            </div>
            <div className="dk-pal-list" id="dk-pal-list" role="listbox" ref={listRef}>
                {lines.map((l, i) => isEntry(l)
                    ? <Row key={l.key} entry={l} selected={i === current} armed={armed === l.key} onHover={() => setSel(i)} onRun={() => run(l)} />
                    : <div key={l.key} className="dk-pal-header" role="presentation">{l.header}</div>)}
                {!selectable.length && <p className="dk-pal-empty">{text ? `Nothing matches “${text}”.` : "Nothing waiting. Type to jump anywhere."}</p>}
            </div>
            <footer className="dk-pal-keys" aria-hidden>
                {text.startsWith(">")
                    ? <><span>↵ run</span><span>esc back</span></>
                    : <><span>↵ open</span><span>⇧↵ favorite</span><span>&gt; actions</span><span>esc {text ? "clear" : "close"}</span></>}
            </footer>
        </ModalRoot>
    );
}
