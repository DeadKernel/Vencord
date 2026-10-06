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
import { MessageStore } from "@webpack/common";
import type { ReactElement } from "react";

import style from "./declutter.css?managed";
import { Groups, ItemKey, Items } from "./items";

const defaults = Object.fromEntries(Items.map(i => [i.key, i.hidden])) as Record<ItemKey, boolean>;

const settings = definePluginSettings({
    hide: {
        type: OptionType.COMPONENT,
        component: ErrorBoundary.wrap(Toggles, { noop: true }),
        default: defineDefault(defaults)
    }
});

const isHidden = (key: ItemKey) => settings.store.hide?.[key] ?? defaults[key];

function Toggles() {
    const { hide } = settings.use(["hide"]);
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
                            value={hide?.[item.key] ?? defaults[item.key]}
                            onChange={v => {
                                settings.store.hide = { ...defaults, ...settings.store.hide, [item.key]: v };
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

// Join, boost and other promo system messages: tag each message row with its type so the
// stylesheet can hide by type (CSS alone can't tell a join from a pin).
const NoiseTypes = new Set([7, 8, 9, 10, 11, 22, 25, 26, 44]);
let observer: MutationObserver | null = null;

function tagMessage(li: Element) {
    const m = /^chat-messages-(\d+)-(\d+)$/.exec(li.id);
    if (!m) return;
    const type = MessageStore.getMessage(m[1], m[2])?.type;
    if (NoiseTypes.has(type)) li.setAttribute("data-dk-noise", "");
}

function tagAll(root: ParentNode) {
    root.querySelectorAll?.('li[id^="chat-messages-"]:not([data-dk-noise])').forEach(tagMessage);
}

export default definePlugin({
    name: "Declutter",
    description: "Hides the parts of Discord you don't use: promos, paid cosmetics, growth features. One toggle each.",
    authors: [{ name: "Aditya Padwal", id: 0n }],
    enabledByDefault: true,
    settings,
    managedStyle: style,

    start() {
        applyHidden();
        addGlobalContextMenuPatch(menuPatch);
        tagAll(document);
        observer = new MutationObserver(records => {
            for (const r of records) for (const n of r.addedNodes) {
                if (!(n instanceof Element)) continue;
                if (n.matches('li[id^="chat-messages-"]')) tagMessage(n);
                else if (n.firstElementChild) tagAll(n);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        clearHidden();
        removeGlobalContextMenuPatch(menuPatch);
        observer?.disconnect();
        observer = null;
        document.querySelectorAll("[data-dk-noise]").forEach(e => e.removeAttribute("data-dk-noise"));
    }
});
