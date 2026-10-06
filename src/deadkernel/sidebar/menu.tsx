/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ContextMenuApi, Menu } from "@webpack/common";
import type { MouseEvent } from "react";

export type ContextItem = { id: string; label: string; action(): void; danger?: boolean; } | false | null | undefined;

/** Our rows' right-click menu, drawn with Discord's own Menu so it looks and behaves like theirs. */
export function openMenu(e: MouseEvent, items: ContextItem[]) {
    const shown = items.filter(Boolean) as Exclude<ContextItem, false | null | undefined>[];
    if (!shown.length) return;
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="dk-sidebar" onClose={ContextMenuApi.closeContextMenu} aria-label="Sidebar">
            {shown.map(i => <Menu.MenuItem key={i.id} id={`dk-${i.id}`} label={i.label} action={i.action} color={i.danger ? "danger" : undefined} />)}
        </Menu.Menu>
    ));
}
