/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Go Live with Sightline from the voice panel, next to Discord's own screen-share button, with a picker
// in Discord's style (personal/SIGHTLINE.md). It goes live into the voice channel's own Sightline room.

import { Paragraph } from "@components/Paragraph";
import type { Channel } from "@vencord/discord-types";
import { Modal, openModal, useEffect, useRef, UserStore, useState } from "@webpack/common";

import { ask, listSources, Native, SightlineSource, useSightline } from "./state";

/** The Sightline room for a voice channel. Hashed, so no channel id leaves the client. */
export async function roomFor(channelId: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sightline-room:${channelId}`));
    return "dk-" + [...new Uint8Array(digest).slice(0, 8)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const shareable = (s: SightlineSource) => s.kind === "display" || s.kind === "window" || s.kind === "file";

/** Thumbnails, one at a time so the first ones show quickly. */
function useThumbs(sources: SightlineSource[]) {
    const [thumbs, setThumbs] = useState<Record<string, string>>({});
    useEffect(() => {
        let stop = false;
        (async () => {
            for (const s of sources) {
                if (stop) return;
                const r = await Native?.call("thumb", { spec: s.spec }).catch(() => null);
                const img = r?.ok ? (r.result as { image?: string; icon?: string; })?.image : undefined;
                if (img && !stop) setThumbs(t => ({ ...t, [s.spec]: img }));
            }
        })();
        return () => void (stop = true);
    }, [sources]);
    return thumbs;
}

function GoLiveModal({ modalProps, channel, sources, live }: { modalProps: any; channel: Channel; sources: SightlineSource[]; live: string | null; }) {
    const [selected, setSelected] = useState<string | undefined>();
    const thumbs = useThumbs(sources);
    const screens = sources.filter(s => s.kind === "display");
    const apps = sources.filter(s => s.kind !== "display");

    async function go() {
        if (!selected) return;
        modalProps.onClose();
        if (live) await ask("switch", { source: selected });
        else await ask("goLive", { source: selected, room: await roomFor(channel.id), discord: UserStore.getCurrentUser()?.id });
    }

    const tile = (s: SightlineSource) => (
        <button
            key={s.spec}
            className="dk-sl-pick-tile"
            data-selected={selected === s.spec || undefined}
            data-current={live === s.spec || undefined}
            onClick={() => setSelected(s.spec)}
            onDoubleClick={() => { setSelected(s.spec); void go(); }}
            title={s.detail ? `${s.label} · ${s.detail}` : s.label}
        >
            {thumbs[s.spec] ? <img src={thumbs[s.spec]} alt="" /> : <div className="dk-sl-pick-pending" />}
            <Paragraph className="dk-sl-pick-name">{s.label}</Paragraph>
        </button>
    );

    return (
        <Modal
            {...modalProps}
            size="lg"
            title={live ? "Change what you're sharing" : "Go Live with Sightline"}
            subtitle={live ? "Your stream keeps going; friends see the new picture in about a second." : `Friends in ${channel.name} can watch, in Accord or any browser.`}
            actions={[
                ...(live ? [{ text: "Stop Streaming", variant: "critical-primary", onClick: () => { modalProps.onClose(); void ask("stop"); } }] : []),
                { text: "Cancel", variant: "secondary", onClick: modalProps.onClose },
                { text: live ? "Switch" : "Go Live", variant: "primary", disabled: !selected || selected === live, onClick: () => void go() }
            ]}
        >
            {screens.length > 0 && <h3 className="dk-sl-pick-heading">Screens</h3>}
            <div className="dk-sl-pick-grid">{screens.map(tile)}</div>
            {apps.length > 0 && <h3 className="dk-sl-pick-heading">Applications</h3>}
            <div className="dk-sl-pick-grid">{apps.map(tile)}</div>
        </Modal>
    );
}

export async function openGoLive(channel: Channel, live: string | null) {
    const sources = (await listSources()).filter(shareable);
    openModal(props => <GoLiveModal modalProps={props} channel={channel} sources={sources} live={live} />);
}

const SightlineMark = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="4" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 18v3M7 11h2l2-3 2 6 2-3h2" />
    </svg>
);

/** The voice panel button. Takes the look of Discord's screen-share button next to it. Hidden while
 * the Sightline app isn't running. */
export function GoLiveButton({ channel }: { channel: Channel; }) {
    const [s, busy] = useSightline();
    const ref = useRef<HTMLButtonElement>(null);
    const [look, setLook] = useState("");
    useEffect(() => {
        const sibling = ref.current?.previousElementSibling as HTMLElement | null;
        const button = sibling?.matches("button") ? sibling : sibling?.querySelector("button");
        if (button) setLook(button.className);
    }, [!!s]);
    if (!s || s.incompatible || !channel) return null;
    const live = s.live?.source ?? null;
    return (
        <button
            ref={ref}
            className={`${look} dk-sl-golive`}
            data-live={live ? true : undefined}
            disabled={busy}
            aria-label={live ? `Live on Sightline: ${s.live?.label}. Change what you're sharing` : "Go Live with Sightline"}
            title={live ? `Live on Sightline · ${s.live?.label}` : "Go Live with Sightline"}
            onClick={() => void openGoLive(channel, live)}
        >
            <SightlineMark />
            {live && <span className="dk-sl-golive-badge">LIVE</span>}
        </button>
    );
}
