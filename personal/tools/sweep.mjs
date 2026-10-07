// A sweep of Discord's own surfaces under DeadKernel's global changes (window scaling, theme,
// quiet scrollbars, the sidebar's layout). CDP_PORT=9223 node personal/tools/sweep.mjs [outdir]
//
// For each surface: it opens, fits in the window, its popout sits near what opened it, and every
// scroll area inside it reaches its end. A screenshot of each goes to outdir for a look. Read-only:
// it opens things and closes them; it never sends, joins, marks read or changes a setting.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { auditExpr } from "./contrast-audit.mjs";

const port = process.env.CDP_PORT || "9223";
const out = process.argv[2] ?? join(process.env.USERPROFILE ?? ".", ".t3", "data", "shots", "sweep");
mkdirSync(out, { recursive: true });
const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = targets.find((t) => t.type === "page" && t.url.includes("discord.com"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const errors = [];
ws.addEventListener("message", (ev) => {
	const m = JSON.parse(ev.data);
	if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
		const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
		if (!/Failed to load resource|net::ERR|favicon|View Model linked to Artboard/.test(text)) errors.push(text.slice(0, 240));
	}
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
	const msgId = ++id;
	const onMsg = (ev) => { const m = JSON.parse(ev.data); if (m.id !== msgId) return; ws.removeEventListener("message", onMsg); m.error ? reject(new Error(m.error.message)) : resolve(m.result); };
	ws.addEventListener("message", onMsg);
	ws.send(JSON.stringify({ id: msgId, method, params }));
});
const js = async (body) => {
	const r = await send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
	return r.result.value;
};
const innerH = (i) => i.view[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (expr, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await js(`return !!(${expr})`)) return true; await sleep(80); } return false; };
const key = async (k, code, mods = 0, vk = 0) => { for (const type of ["rawKeyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: vk }); };
const esc = async () => { await key("Escape", "Escape", 0, 27); await sleep(250); };
/** A real mouse click at the element's centre (some of Discord's popouts ignore element.click()). */
const press = async (sel) => {
	const p = await js(`const e = ${sel}; if (!e) return null; e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];`);
	if (!p) return;
	await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p[0], y: p[1] });
	for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: p[0], y: p[1], button: "left", clickCount: 1 });
};
const shot = async (name) => { const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(out, `${name}.png`), Buffer.from(data, "base64")); };

let failed = 0;
const results = [];
const check = (name, ok, detail = "") => { if (!ok) failed++; results.push(`${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`); console.log(results.at(-1)); };

/** The surface's box fits the window, and each scroll area in it reaches its last child. */
const inspect = (sel, scroll = true) => js(`
	const el = ${sel}; if (!el) return null;
	const r = el.getBoundingClientRect();
	const fits = r.top >= -2 && r.left >= -2 && r.bottom <= innerHeight + 2 && r.right <= innerWidth + 2;
	const scrollers = [el, ...el.querySelectorAll("*")].filter(e => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 40; });
	const stuck = [];
	for (const s of ${scroll} ? scrollers.slice(0, 6) : []) {
		// lists that load more as they scroll (inbox, emoji) grow: keep going until the end holds still.
		// A list that jumps back towards the top on its own is the bug this looks for.
		const before = s.scrollTop;
		let reached = false, back = false, last = -1;
		for (let n = 0; n < 25 && !reached; n++) {
			s.scrollTop = s.scrollHeight;
			await new Promise(r => setTimeout(r, 160));
			if (s.scrollTop < last - 4) back = true;
			last = s.scrollTop;
			reached = Math.abs(s.scrollTop + s.clientHeight - s.scrollHeight) < 6;
		}
		if (!reached || back) stuck.push(String(s.className).slice(0, 50) + " " + Math.round(s.scrollTop) + "+" + s.clientHeight + "/" + s.scrollHeight + (back ? " jumped back" : ""));
		s.scrollTop = before;
		// let Discord settle: some lists follow others (the emoji picker's categories follow its grid)
		await new Promise(r => setTimeout(r, 700));
	}
	return { fits, box: [r.left, r.top, r.right, r.bottom].map(Math.round), view: [innerWidth, innerHeight], scrollers: scrollers.length, stuck };`);

/** WCAG text contrast inside the surface (contrast-audit.mjs); disabled controls are exempt. */
async function contrast(name, sel) {
	const failing = rows => rows.filter(r => r.ratio < r.need && !r.disabled);
	let rows = await js(`return ${auditExpr(sel)}`);
	let bad = failing(rows);
	// something mid-transition (a button fading in as it enables) reads low for a moment: look again
	if (bad.length) {
		await sleep(800);
		const again = failing(rows = await js(`return ${auditExpr(sel)}`));
		bad = bad.filter(b => again.some(a => a.where === b.where && a.fg === b.fg && a.bg === b.bg));
	}
	check(`${name}: text contrast (${rows.length} styles)`, !bad.length,
		bad.slice(0, 4).map(r => `${r.ratio}:1 ${r.fg} on ${r.bg} "${r.text}" ${r.where}`).join("; "));
}

/** A view that's always there (sidebar, chat...): contrast only. */
async function view(name, sel) {
	try {
		if (!(await until(sel, 3000))) return check(`${name}: present`, false);
		await contrast(name, sel);
	} catch (e) {
		check(`${name}: no errors while testing`, false, String(e).slice(0, 200));
	}
}

async function surface(name, open, sel, close = esc, { scroll = true } = {}) {
	try {
		await open();
		const shown = await until(sel, 4000);
		check(`${name}: opens`, shown);
		if (!shown) { await close(); return; }
		await sleep(1200); // pickers fill in after they open (categories, GIFs)
		const i = await inspect(sel, scroll);
		check(`${name}: fits the window, clear of the title bar`, i.fits && (i.box[1] >= 30 || i.box[3] - i.box[1] > innerH(i) - 8), JSON.stringify(i.box) + " in " + JSON.stringify(i.view));
		if (scroll) check(`${name}: every scroll area reaches its end (${i.scrollers})`, !i.stuck.length, i.stuck.join("; "));
		await contrast(name, sel);
		await shot(name.replace(/\W+/g, "-").toLowerCase());
		await close();
		await sleep(200);
	} catch (e) {
		check(`${name}: no errors while testing`, false, String(e).slice(0, 200));
		await esc();
	}
}

await send("Runtime.enable");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(200);
errors.length = 0;
const C = "Vencord.Webpack.Common";
const go = async (path) => { await js(`${C}.NavigationRouter.transitionTo(${JSON.stringify(path)})`); await sleep(1500); };

// a read channel to stand in (no unread, no mentions), with messages and images if possible
const ch = await js(`
	const R = ${C}.ReadStateStore, Ch = ${C}.ChannelStore;
	const opened = Vencord.Settings.plugins.Sidebar.opened;
	const c = Object.keys(opened).map(id => Ch.getChannel(id)).find(c => c?.guild_id && c.type === 0 && !R.hasUnread(c.id) && !R.getMentionCount(c.id));
	return c ? { id: c.id, guild: c.guild_id } : null;`);
if (!ch) throw new Error("no read channel to test in");
await go(`/channels/${ch.guild}/${ch.id}`);
const layer = `[...document.querySelectorAll('[class*="layerContainer_"] [class*="layer_"] > *, [id^="popout_"]')].filter(e => e.getBoundingClientRect().height > 20).at(-1)`;
const dialog = `[...document.querySelectorAll('[role="dialog"]')].at(-1)`;

// ── composer pickers ──
await surface("Emoji picker", () => js(`document.querySelector('form [aria-label="Add Emoji"]')?.click()`), `document.querySelector('#emoji-picker-tab-panel')?.closest('[class*="positionContainer_"], [id^="popout_"], [class*="layer_"]')`);
await surface("GIF picker", async () => {
	await js(`document.querySelector('form [aria-label="Open GIF picker"]')?.click()`);
// not scrolled: running it to the end streams dozens of videos at once
}, `document.querySelector('#gif-picker-tab-panel')?.closest('[class*="positionContainer_"], [id^="popout_"], [class*="layer_"]')`, esc, { scroll: false });
await surface("Composer + menu", () => js(`document.querySelector('[aria-label="More message options"]')?.click()`), `document.querySelector('[role="menu"]')`);

// ── people ──
await surface("Profile popout", () => press(`[...document.querySelectorAll('[id^="message-username"] > span[role="button"]')].at(-1)`), layer);
await surface("Status menu", () => js(`document.querySelector('[aria-label="Manage profile and status"]')?.click()`), layer);

// ── channel popouts ──
await surface("Pinned messages", () => js(`document.querySelector('[aria-label="Pinned Messages"]')?.click()`), `document.querySelector('[class*="messagesPopout"]')?.closest('[id^="popout_"], [class*="layer_"]') ?? document.querySelector('[class*="messagesPopout"]')`);
await surface("Inbox", async () => { await key("i", "KeyI", 2, 73); }, `document.querySelector('[class*="recentMentionsPopout"], [class*="inbox"]')?.closest('[id^="popout_"], [class*="layer_"]')`);

// ── modals ──
await surface("Keyboard shortcuts", async () => { await key("/", "Slash", 2, 191); }, `[...document.querySelectorAll('[role="dialog"]')].at(-1)`);
await surface("Image viewer", () => js(`[...document.querySelectorAll('[class*="messageListItem"] [class*="imageWrapper_"] img, [class*="messageListItem"] [class*="clickableWrapper_"]')].at(-1)?.click()`), dialog);
await surface("Server menu", () => js(`const t = document.querySelector(".dk-col-title"); const r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + 20, clientY: r.bottom }))`), `document.querySelector('[role="menu"]')`);
await surface("Screen share picker (12 sources)", () => js(`
	const c = document.createElement("canvas"); c.width = 320; c.height = 180; const g = c.getContext("2d"); const screens = [];
	for (let i = 0; i < 12; i++) { g.fillStyle = "hsl(" + i * 30 + " 50% 40%)"; g.fillRect(0, 0, 320, 180); screens.push({ id: "window:" + i, name: "Sweep window " + i, url: c.toDataURL() }); }
	window.__dkSweepPick = window.Vesktop?.Components?.ScreenShare?.openScreenSharePicker(screens, false).catch(() => "closed");`),
`[...document.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes("Sweep window 0"))`,
() => js(`[...document.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes("Sweep window 0"))?.querySelector('[aria-label="Close"], button[class*="close"]')?.click()`));

await surface("Screen share picker: stream settings", async () => {
	await js(`const c = document.createElement("canvas"); c.width = 320; c.height = 180; c.getContext("2d").fillRect(0, 0, 320, 180);
		window.__dkSweepPick = window.Vesktop?.Components?.ScreenShare?.openScreenSharePicker([{ id: "window:1:0", name: "Sweep stream", url: c.toDataURL() }], false).catch(() => "closed");`);
	await until(`[...document.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes("Sweep stream"))?.querySelector('input[type="radio"]')`, 3000);
	await js(`[...document.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes("Sweep stream")).querySelector('input[type="radio"]').click()`);
}, `[...document.querySelectorAll('[role="dialog"]')].find(d => /Stream Settings/i.test(d.textContent))`,
() => js(`[...document.querySelectorAll('[role="dialog"]')].find(d => /Stream Settings/i.test(d.textContent))?.querySelector('[aria-label="Close"], button[class*="close"]')?.click()`));

// ── the main views, as they are ──
await view("Sidebar", `document.querySelector(".dk-sb")`);
await view("Server column", `document.querySelector(".dk-layer-column")`);
await view("Chat", `document.querySelector('main[class*="chatContent"], [class*="chatContent_"]')`);
await view("Header", `document.querySelector('section[class*="title_"]')`);
await surface("Ctrl K palette", async () => { await key("k", "KeyK", 2, 75); }, `document.querySelector(".dk-pal")`);

// ── settings ──
await surface("User settings", () => js(`${C}.SettingsRouter.openUserSettings("my_account_panel")`), `[...document.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes("Vencord Settings"))`);
await surface("Vencord plugins", () => js(`${C}.SettingsRouter.openUserSettings("vencord_plugins_panel")`), `[...document.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes("Vencord Settings"))`);
for (const [label, panel] of [["Appearance settings", "appearance_panel"], ["Voice & Video settings", "voice_and_video_panel"], ["Notifications settings", "notifications_panel"]])
	await surface(label, () => js(`${C}.SettingsRouter.openUserSettings(${JSON.stringify(panel)})`), `[...document.querySelectorAll('[role="dialog"]')].find(d => d.textContent.includes("Vencord Settings"))`);

// ── Discord's own Friends page in place (Home › All friends) ──
await go("/channels/@me");
await view("Home", `document.querySelector(".dk-home")`);
await surface("Friends page", () => js(`document.querySelector('[data-dk-action="all-friends"]')?.click()`), `document.querySelector(".dk-home-discord")`, () => js(`document.querySelector(".dk-home-back")?.click()`));

await sleep(300);
check("no errors from any surface", errors.length === 0, errors.slice(0, 5).join("\n---\n"));
await send("Emulation.setFocusEmulationEnabled", { enabled: false });
console.log(`\nscreenshots in ${out}`);
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
