/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Sightline's main-process side. Talks to the Sightline tray app over its control pipe
// (sightline/app/src-tauri/src/bridge.rs): a named pipe on Windows, a Unix socket elsewhere, so no
// web page can reach it. Opens friends' streams in a window of their own, with its own session and
// no access to Discord's.

import { CspPolicies } from "@main/csp";
import { BrowserWindow, IpcMainInvokeEvent, session, shell, WebContents } from "electron";
import { connect, Socket } from "net";
import { homedir } from "os";
import { join } from "path";

// The viewer in a frame inside Discord's page (the call stage, the lobby): frames only. Discord's page
// gets its policy when it loads, so this can't wait for the app to say where its viewer is.
CspPolicies["sightline.padwal.dev"] = ["frame-src"];

const PIPE = process.platform === "win32" ? "\\\\.\\pipe\\sightline" : join(homedir(), ".sightline.sock");
/** bridge.rs PROTOCOL */
const PROTOCOL = 1;
const COMMANDS = new Set(["state", "sources", "thumb", "goLive", "switch", "stop", "clip", "join", "show"]);

type Reply = { ok: true; result: unknown; } | { ok: false; error: string; };

let sock: Socket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
/** The app's last state, null while it isn't running. */
let state: any = null;
let nextId = 1;
const pending = new Map<number, { done(r: Reply): void; timer: ReturnType<typeof setTimeout>; }>();
const pages = new Set<WebContents>();

function push() {
    const js = `Vencord.Plugins.plugins.Sightline?.onState?.(${JSON.stringify(state)})`;
    for (const page of pages) {
        if (page.isDestroyed()) pages.delete(page);
        else page.executeJavaScript(js).catch(() => { });
    }
}

function received(line: string) {
    let msg: any;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg?.event === "state") {
        state = msg.data?.protocol === PROTOCOL ? msg.data : { incompatible: true };
        push();
        return;
    }
    const p = pending.get(msg?.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    p.done(msg.ok ? { ok: true, result: msg.result } : { ok: false, error: String(msg.error || "Sightline couldn't do that") });
}

function open() {
    if (sock || retry || !pages.size) return;
    const s = connect(PIPE);
    sock = s;
    let buf = "";
    s.setEncoding("utf8");
    s.on("data", (chunk: string) => {
        buf += chunk;
        for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
            received(buf.slice(0, i));
            buf = buf.slice(i + 1);
        }
        if (buf.length > 1 << 20) s.destroy();
    });
    // not running is the usual case: say nothing, try again in a few seconds
    s.on("error", () => { });
    s.on("close", () => {
        sock = null;
        for (const p of pending.values()) {
            clearTimeout(p.timer);
            p.done({ ok: false, error: "Sightline closed" });
        }
        pending.clear();
        if (state !== null) {
            state = null;
            push();
        }
        if (pages.size) retry = setTimeout(() => { retry = null; open(); }, 3000);
    });
}

/** Follow Sightline's state from this page (pushed to the plugin's onState). Returns it now. */
export function watch(e: IpcMainInvokeEvent) {
    pages.add(e.sender);
    open();
    return state;
}

export function unwatch(e: IpcMainInvokeEvent) {
    pages.delete(e.sender);
    if (pages.size) return;
    if (retry) clearTimeout(retry);
    retry = null;
    sock?.destroy();
}

export function call(_: IpcMainInvokeEvent, cmd: string, args?: Record<string, unknown>): Promise<Reply> {
    if (!COMMANDS.has(cmd)) return Promise.resolve({ ok: false, error: `Unknown command ${cmd}` });
    if (!sock || state === null) return Promise.resolve({ ok: false, error: "Sightline isn't running" });
    const id = nextId++;
    const line = JSON.stringify({ ...(args && typeof args === "object" ? args : {}), id, cmd }) + "\n";
    return new Promise<Reply>(done => {
        // going live waits for the encoder check and the relay; nothing else takes long
        const timer = setTimeout(() => {
            pending.delete(id);
            done({ ok: false, error: "Sightline didn't answer" });
        }, cmd === "goLive" ? 30_000 : 8_000);
        pending.set(id, { done, timer });
        sock!.write(line);
    });
}

// ── The viewer window ──

let viewer: BrowserWindow | null = null;

/** A Sightline watch link: `<viewer origin>/r/<room>`, on the origin the app says is its viewer
 * (or the last one it said, which the page passes when the app isn't running). */
function watchUrl(raw: string, knownViewer?: string): URL | null {
    try {
        const url = new URL(raw);
        const origins = [state?.viewer, knownViewer].filter(Boolean).map(v => new URL(v).origin);
        if (url.protocol !== "https:" || !origins.includes(url.origin)) return null;
        return /^\/r\/[a-z0-9-]{1,32}\/?$/.test(url.pathname) ? url : null;
    } catch {
        return null;
    }
}

function viewerSession() {
    const s = session.fromPartition("persist:dk-sightline");
    // the viewer needs none of the camera, mic or notifications Discord asks for
    const allowed = new Set(["fullscreen", "pointerLock", "clipboard-sanitized-write"]);
    s.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
    s.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
    return s;
}

export function openViewer(_: IpcMainInvokeEvent, raw: string, knownViewer?: string): boolean {
    const url = watchUrl(raw, knownViewer);
    if (!url) return false;
    if (viewer && !viewer.isDestroyed()) {
        if (viewer.webContents.getURL() !== url.href) viewer.loadURL(url.href);
        if (viewer.isMinimized()) viewer.restore();
        viewer.focus();
        return true;
    }
    const win = new BrowserWindow({
        width: 1280,
        height: 760,
        minWidth: 480,
        minHeight: 300,
        title: "Sightline",
        backgroundColor: "#09090b",
        autoHideMenuBar: true,
        webPreferences: { session: viewerSession(), sandbox: true, contextIsolation: true, nodeIntegration: false }
    });
    viewer = win;
    const { origin } = url;
    const outside = (target: string) => {
        if (/^https?:/.test(target)) shell.openExternal(target);
    };
    win.webContents.setWindowOpenHandler(({ url: target }) => {
        outside(target);
        return { action: "deny" };
    });
    win.webContents.on("will-navigate", (e, target) => {
        if (new URL(target).origin !== origin) {
            e.preventDefault();
            outside(target);
        }
    });
    win.on("closed", () => { if (viewer === win) viewer = null; });
    win.loadURL(url.href);
    return true;
}
