/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ContextMenuApi, Menu } from "@webpack/common";
import type { MouseEvent } from "react";

export type ContextItem = { id: string; label: string; action(): void; danger?: boolean; } | false | null | undefined;

/** Our own menu, drawn with Discord's Menu so it looks and behaves like theirs. */
export function renderMenu(items: ContextItem[]) {
    const shown = items.filter(Boolean) as Exclude<ContextItem, false | null | undefined>[];
    return () => (
        <Menu.Menu navId="dk-sidebar" onClose={ContextMenuApi.closeContextMenu} aria-label="Sidebar">
            {shown.map(i => <Menu.MenuItem key={i.id} id={`dk-${i.id}`} label={i.label} action={i.action} color={i.danger ? "danger" : undefined} />)}
        </Menu.Menu>
    );
}

/** Our rows' right-click menu. */
export function openMenu(e: MouseEvent, items: ContextItem[]) {
    if (!items.some(Boolean)) return;
    ContextMenuApi.openContextMenu(e, renderMenu(items));
}
