/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addGlobalContextMenuPatch, GlobalContextMenuPatchCallback, removeGlobalContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import definePlugin, { defineDefault, OptionType } from "@utils/types";
import { ChannelStore, MessageStore, ReadStateStore, SelectedChannelStore, UserStore } from "@webpack/common";
import type { ReactElement } from "react";

import style from "./declutter.css?managed";
import { Groups, ItemKey, Items } from "./items";

const defaults = Object.fromEntries(Items.map(i => [i.key, i.hidden])) as Record<ItemKey, boolean>;

// Only the toggles he changed are stored, so a new or changed default in items.ts still reaches him.
const settings = definePluginSettings({
    overrides: {
        type: OptionType.COMPONENT,
        component: ErrorBoundary.wrap(Toggles, { noop: true }),
        default: defineDefault<Partial<Record<ItemKey, boolean>>>({})
    }
});

const isHidden = (key: ItemKey) => settings.store.overrides?.[key] ?? defaults[key];

function Toggles() {
    const { overrides } = settings.use(["overrides"]);
    return (
        <div className="dk-declutter-settings">
            {Groups.map(group => (
                <section key={group.title}>
                    <Heading tag="h5" className="dk-declutter-group">{group.title}</Heading>
                    {Items.filter(i => i.group === group.id).map(item => (
                        <FormSwitch
                            key={item.key}
                            title={`Hide ${item.title}`}
                            description={item.note}
                            value={overrides?.[item.key] ?? defaults[item.key]}
                            onChange={v => {
                                const next = { ...settings.store.overrides };
                                if (v === defaults[item.key]) delete next[item.key];
                                else next[item.key] = v;
                                settings.store.overrides = next;
                                applyHidden();
                            }}
                        />
                    ))}
                </section>
            ))}
        </div>
    );
}

// An attribute, not classes: Discord rewrites <html>'s className wholesale on focus/theme changes.
function applyHidden() {
    document.documentElement.dataset.dkHide = Items.filter(i => isHidden(i.key)).map(i => i.key).join(" ");
}

function clearHidden() {
    delete document.documentElement.dataset.dkHide;
}

// Menu entries are removed by id (`${navId}-${id}` is the DOM id Discord gives them), so keyboard
// navigation and separators stay correct, which display:none would not give us.
function hiddenMenuIds() {
    return Items.filter(i => i.menu && isHidden(i.key)).flatMap(i => i.menu!);
}

function prune(navId: string, children: Array<ReactElement<any> | null>, patterns: RegExp[]) {
    for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (!child?.props) continue;
        const id = child.props.id && `${navId}-${child.props.id}`;
        if (id && patterns.some(p => p.test(id))) {
            children.splice(i, 1);
            continue;
        }
        const inner = child.props.children;
        if (Array.isArray(inner) && !child.props.id) {
            prune(navId, inner, patterns);
            if (inner.every(c => c == null || c === false)) children.splice(i, 1);
        }
    }
}

const menuPatch: GlobalContextMenuPatchCallback = (navId, children) => {
    const patterns = hiddenMenuIds();
    if (patterns.length) prune(navId, children, patterns);
};

// CSS can't see message types or who a DM is with, so rows get tagged and the stylesheet hides
// by tag. Message rows: data-dk-msg = noise (joins, boosts, purchase notices) | notice (thread
// created, pinned). DM rows: data-dk-dm = "bot stale" tokens, recomputed whenever the list changes.
const MessageKinds: Record<number, string> = {
    6: "notice", 18: "notice",
    7: "noise", 8: "noise", 9: "noise", 10: "noise", 11: "noise", 22: "noise", 25: "noise", 26: "noise", 44: "noise"
};
const STALE_MS = 30 * 24 * 60 * 60 * 1000;
const DISCORD_EPOCH = 1420070400000n;
let observer: MutationObserver | null = null;
let dmTagQueued = false;

function tagMessage(li: Element) {
    const m = /^chat-messages-(\d+)-(\d+)$/.exec(li.id);
    if (!m) return;
    const kind = MessageKinds[MessageStore.getMessage(m[1], m[2])?.type];
    if (kind) li.setAttribute("data-dk-msg", kind);
}

function tagMessages(root: ParentNode) {
    root.querySelectorAll?.('li[id^="chat-messages-"]:not([data-dk-msg])').forEach(tagMessage);
}

function tagDms() {
    dmTagQueued = false;
    const selected = SelectedChannelStore.getChannelId();
    for (const a of document.querySelectorAll<HTMLAnchorElement>('[class*="privateChannels_"] a[href^="/channels/@me/"]')) {
        const row = a.closest("li") ?? a;
        const id = a.getAttribute("href")!.split("/")[3];
        const channel = ChannelStore.getChannel(id);
        if (!channel) continue;
        const tags: string[] = [];
        if (channel.type === 1 && UserStore.getUser(channel.recipients?.[0])?.bot) tags.push("bot");
        const last = ReadStateStore.lastMessageId(id) ?? channel.lastMessageId;
        const lastAt = last ? Number((BigInt(last) >> 22n) + DISCORD_EPOCH) : 0;
        if (id !== selected && !ReadStateStore.hasUnread(id) && Date.now() - lastAt > STALE_MS) tags.push("stale");
        const value = tags.join(" ");
        if (row.getAttribute("data-dk-dm") !== value) row.setAttribute("data-dk-dm", value);
    }
}

function queueDmTags() {
    if (dmTagQueued) return;
    dmTagQueued = true;
    requestAnimationFrame(tagDms);
}

export default definePlugin({
    name: "Declutter",
    description: "Hides the parts of Discord you don't use: promos, paid cosmetics, growth features. One toggle each.",
    authors: [{ name: "DeadKernel", id: 0n }],
    enabledByDefault: true,
    settings,
    managedStyle: style,

    start() {
        applyHidden();
        addGlobalContextMenuPatch(menuPatch);
        tagMessages(document);
        queueDmTags();
        observer = new MutationObserver(records => {
            for (const r of records) {
                if ((r.target as Element).closest?.('[class*="privateChannels_"]')) queueDmTags();
                for (const n of r.addedNodes) {
                    if (!(n instanceof Element)) continue;
                    if (n.matches('li[id^="chat-messages-"]')) tagMessage(n);
                    else if (n.firstElementChild) tagMessages(n);
                    if (n.matches('[class*="privateChannels_"], [class*="privateChannels_"] *') || n.querySelector?.('[class*="privateChannels_"]')) queueDmTags();
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    },

    stop() {
        clearHidden();
        removeGlobalContextMenuPatch(menuPatch);
        observer?.disconnect();
        observer = null;
        document.querySelectorAll("[data-dk-msg]").forEach(e => e.removeAttribute("data-dk-msg"));
        document.querySelectorAll("[data-dk-dm]").forEach(e => e.removeAttribute("data-dk-dm"));
    }
});
