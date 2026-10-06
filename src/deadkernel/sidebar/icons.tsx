/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// One line-icon set for everything DeadKernel draws: 24-unit grid, 2px round strokes in the text
// colour, so icons take the row's state (dim, bold, selected, teal) like text does. Shapes after
// Lucide (https://lucide.dev, ISC).

// functions, not elements: JSX at module load would touch React before Vencord has it
const PATHS = {
    hash: () => <><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></>,
    voice: () => <><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></>,
    forum: () => <><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></>,
    announce: () => <><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
    thread: () => <><path d="m15 10 5 5-5 5" /><path d="M4 4v7a4 4 0 0 0 4 4h12" /></>,
    home: () => <><path d="M3 10 12 3l9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>,
    search: () => <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    back: () => <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
    inbox: () => <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
    check: () => <><path d="M20 6 9 17l-5-5" /></>,
    checks: () => <><path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></>,
    plus: () => <><path d="M12 5v14M5 12h14" /></>,
    close: () => <><path d="M18 6 6 18M6 6l12 12" /></>,
    chat: () => <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
    phone: () => <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></>,
    join: () => <><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" /></>,
    deafened: () => <><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 15.4-6.3M21 12v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" /><path d="m2 2 20 20" /></>,
    micOff: () => <><path d="m2 2 20 20" /><path d="M18.9 13.2A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M12 19v3" /></>,
    camera: () => <><path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></>,
    screen: () => <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    people: () => <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    addPerson: () => <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
    star: () => <><path d="M12 2.5 15 8.7l6.8 1-4.9 4.8 1.2 6.8L12 18.1l-6.1 3.2 1.2-6.8-4.9-4.8 6.8-1z" /></>,
    mute: () => <><path d="M8.7 3A6 6 0 0 1 18 8a21 21 0 0 0 .6 5M17 17H3s3-2 3-9a4.7 4.7 0 0 1 .3-1.7M10.3 21a1.9 1.9 0 0 0 3.4 0" /><path d="m2 2 20 20" /></>,
    at: () => <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9" /></>,
    list: () => <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
    settings: () => <><path d="M20 7h-9M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></>,
    dot: () => <><circle cx="12" cy="12" r="2" /></>,
    pencil: () => <><path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L4 16l-1 5 5-1Z" /><path d="m15 5 4 4" /></>,
    chevronRight: () => <><path d="m9 18 6-6-6-6" /></>,
    chevronDown: () => <><path d="m6 9 6 6 6-6" /></>,
    folder: () => <><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></>,
    folderOpen: () => <><path d="m6 14 1.5-2.9A2 2 0 0 1 9.2 10H20a2 2 0 0 1 1.9 2.5l-1.5 6A2 2 0 0 1 18.5 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v2" /></>
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, filled, title }: { name: IconName; size?: number; filled?: boolean; title?: string; }) {
    return (
        <svg className="dk-icon" width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
            {title && <title>{title}</title>}
            {PATHS[name]()}
        </svg>
    );
}

/** An icon in the 24px slot rows put their avatar in. */
export const IconSlot = ({ name, filled }: { name: IconName; filled?: boolean; }) =>
    <span className="dk-sb-icon dk-sb-glyphicon" aria-hidden><Icon name={name} filled={filled} /></span>;
