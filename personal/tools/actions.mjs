// Every action in DeadKernel's UI, clicked and checked. CDP_PORT=9223 node personal/tools/actions.mjs
//
// Safe on his real account: for the run, Discord's side-effecting functions are replaced by
// recorders (join voice, call, mark read, notification settings, bulk guild settings, category
// collapse, create server, open DM, navigation where a test says so), so nothing joins, rings,
// marks read or changes a Discord setting. Plugin settings it touches are snapshotted first (also to
// a file), restored at the end, and compared; the file is only deleted when they match.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const port = process.env.CDP_PORT || "9223";
const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = targets.find((t) => t.type === "page" && t.url.includes("discord.com"));
if (!page) throw new Error(`no Discord page on :${port}`);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 0;
const errors = [];
ws.addEventListener("message", (ev) => {
	const m = JSON.parse(ev.data);
	if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
		const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
		if (/ErrorBoundary|could not be cloned|dk-|deadkernel|TypeError/.test(text)) errors.push(text.slice(0, 300));
	}
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
	const msgId = ++id;
	const onMsg = (ev) => {
		const m = JSON.parse(ev.data);
		if (m.id !== msgId) return;
		ws.removeEventListener("message", onMsg);
		m.error ? reject(new Error(m.error.message)) : resolve(m.result);
	};
	ws.addEventListener("message", onMsg);
	ws.send(JSON.stringify({ id: msgId, method, params }));
});
const js = async (body) => {
	const r = await send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
	return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (expr, ms = 2000) => {
	const end = Date.now() + ms;
	while (Date.now() < end) { if (await js(`return !!(${expr})`)) return true; await sleep(60); }
	return false;
};

let failed = 0;
const check = (name, ok, detail = "") => {
	if (!ok) failed++;
	console.log(`${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
};
const rec = () => js(`return window.__dk.rec.splice(0)`);
const recHas = (list, label, pred = () => true) => list.some(([l, ...a]) => l === label && pred(a));

await send("Runtime.enable");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(200);
errors.length = 0;

// ── snapshot his plugin settings (memory and file) ──
const KEYS = ["favorites", "showAll", "closedSections", "openFolders", "opened", "focusUntil"];
const snap = await js(`const p = Vencord.Settings.plugins.Sidebar; return JSON.stringify(Object.fromEntries(${JSON.stringify(KEYS)}.map(k => [k, p[k]])))`);
const snapFile = join(homedir(), ".t3", "data", "actions-test-backup.json");
writeFileSync(snapFile, snap);

// ── recorders ──
await js(`
	const W = Vencord.Webpack, C = W.Common;
	const dk = window.__dk = { rec: [], restore: [], navBlocked: false };
	const simple = v => typeof v === "object" && v ? (v.id ?? JSON.stringify(v).slice(0, 80)) : v;
	const intercept = (obj, key, label, pass = false) => {
		const orig = obj[key];
		obj[key] = function (...a) { dk.rec.push([label, ...a.map(simple)]); if (pass) return orig.apply(this, a); };
		dk.restore.push(() => { obj[key] = orig; });
	};
	intercept(W.findByProps("handleVoiceConnect"), "handleVoiceConnect", "join");
	intercept(W.findByProps("stopRinging", "call"), "call", "call");
	intercept(W.findByProps("updateChatOpen"), "updateChatOpen", "chatOpen");
	intercept(W.findByProps("updateGuildNotificationSettings"), "updateGuildNotificationSettings", "guildNotif");
	intercept(W.findByProps("saveUserGuildSettingsBulk"), "saveUserGuildSettingsBulk", "guildSettingsBulk");
	intercept(W.findByProps("openCreateGuildModal"), "openCreateGuildModal", "createGuild");
	intercept(C.ChannelActionCreators, "openPrivateChannel", "openDmNew");
	intercept(W.findByProps("moveById", "createGuildFolderLocal"), "moveById", "moveServer");
	intercept(W.findByProps("toggleSelfMute", "toggleSelfDeaf"), "toggleSelfMute", "selfMute");
	intercept(W.findByProps("toggleSelfMute", "toggleSelfDeaf"), "toggleSelfDeaf", "selfDeaf");
	intercept(W.findByProps("selectVoiceChannel", "disconnect"), "disconnect", "disconnect");
	const N = C.NavigationRouter;
	for (const k of ["transitionTo", "transitionToGuild"]) {
		const orig = N[k];
		N[k] = (...a) => { dk.rec.push(["nav", String(a[0])]); if (!dk.navBlocked) return orig(...a); };
		dk.restore.push(() => { N[k] = orig; });
	}
	const D = C.FluxDispatcher, od = D.dispatch;
	const BLOCK = ["BULK_ACK", "USER_GUILD_SETTINGS_GUILD_UPDATE", "CATEGORY_COLLAPSE", "CATEGORY_EXPAND", "NOTIFICATION_CREATE"];
	D.dispatch = function (a) {
		if (BLOCK.includes(a?.type)) { dk.rec.push(["dispatch", a.type, a.channels?.length ?? a.id ?? a.guildId]); return Promise.resolve(); }
		return od.call(this, a);
	};
	dk.restore.push(() => { D.dispatch = od; });
`);

const C = "Vencord.Webpack.Common";
const go = async (path) => { await js(`window.__dk.navBlocked = false; ${C}.NavigationRouter.transitionTo(${JSON.stringify(path)})`); await sleep(1200); };
const block = (on) => js(`window.__dk.navBlocked = ${on}`);
const favLabels = () => js(`return [...document.querySelectorAll(".dk-layer-top .dk-sb-section")].find(s => s.textContent.includes("Favorites"))?.innerText ?? ""`);
const stored = () => js(`const me = ${C}.UserStore.getCurrentUser().id; return (Vencord.Settings.plugins.Sidebar.favorites[me] ?? []).map(f => f.id)`);

try {
	// targets: a read guild text channel he opened, its guild's voice channel, a friend DM that's read
	const t = await js(`
		const R = ${C}.ReadStateStore, Ch = ${C}.ChannelStore, G = ${C}.GuildChannelStore;
		const opened = Vencord.Settings.plugins.Sidebar.opened;
		const texts = Object.keys(opened).map(id => Ch.getChannel(id))
			.filter(c => c?.guild_id && c.type === 0 && !R.hasUnread(c.id) && !R.getMentionCount(c.id) && G.getChannels(c.guild_id).VOCAL.length > 0)
			.map(c => [c.id, c.guild_id]);
		// not someone in voice: a favourite person inside a favourite call is shown under the call instead
		const dm = ${C}.PrivateChannelSortStore.getPrivateChannelIds().map(id => Ch.getChannel(id))
			.find(c => c?.type === 1 && !R.hasUnread(c.id) && !${C}.VoiceStateStore.getVoiceStateForUser(c.recipients[0])?.channelId);
		return { texts, dm: dm?.id };`);

	// ── 1. Favourites: add/remove from Discord's channel menu updates at once and is saved ──
	const voiceRowAny = `[...document.querySelectorAll(".dk-col .dk-col-row")].find(r => [2, 13].includes(Vencord.Webpack.Common.ChannelStore.getChannel(r.dataset.dkId)?.type))`;
	for (const [text, guild] of t.texts) {
		await go(`/channels/${guild}/${text}`);
		await until(`document.querySelector(".dk-col")`);
		if (!(await js(`return !!${voiceRowAny}`))) await js(`document.querySelector('.dk-col [data-dk-action="all-quiet"]')?.click()`);
		if (await until(voiceRowAny, 800)) { Object.assign(t, { text, guild }); break; }
	}
	Object.assign(t, await js(`const id = ${voiceRowAny}?.dataset.dkId; return { voice: id, voiceName: ${C}.ChannelStore.getChannel(id)?.name };`));
	check("targets found (read text channel, a voice channel in its column, a read DM)", t.text && t.voice && t.dm, JSON.stringify(t));
	const rowSel = `document.querySelector('.dk-col .dk-col-row[data-dk-id="${t.voice}"]')`;
	const openMenuOn = (sel) => js(`const el = ${sel}; const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: r.left + 40, clientY: r.top + 10 }))`);
	// start from "not a favourite"
	if ((await stored()).includes(t.voice)) await js(`const me = ${C}.UserStore.getCurrentUser().id; const s = Vencord.Settings.plugins.Sidebar; const all = JSON.parse(JSON.stringify(s.favorites)); all[me] = all[me].filter(f => f.id !== ${JSON.stringify(t.voice)}); s.favorites = all;`);
	await sleep(200);
	await openMenuOn(rowSel);
	check("voice row: Discord's channel menu has Add to Favorites", await until(`document.querySelector('[role="menu"] [id$="dk-favorite"]')`, 3000));
	await js(`document.querySelector('[role="menu"] [id$="dk-favorite"]').click()`);
	check("added favourite shows in the sidebar at once", await until(`[...document.querySelectorAll(".dk-layer-top .dk-sb-section")].find(s => s.textContent.includes("Favorites"))?.textContent.includes(${JSON.stringify(t.voiceName)})`, 500));
	check("…and in the column's Favorites", await until(`[...document.querySelectorAll(".dk-col .dk-sb-section")].some(s => s.querySelector(".dk-sb-label-text")?.textContent === "Favorites" && s.textContent.includes(${JSON.stringify(t.voiceName)}))`, 500));
	check("…and it's saved (plain settings, not just memory)", await js(`const me = ${C}.UserStore.getCurrentUser().id; return !!(Vencord.Api.Settings.PlainSettings.plugins.Sidebar.favorites[me] ?? []).some(f => f.id === ${JSON.stringify(t.voice)})`));

	// ── 2. Favourite voice channel: click joins; hover offers chat and join ──
	await rec();
	const favRow = `[...document.querySelectorAll(".dk-layer-top .dk-sb-rowwrap")].find(w => w.textContent.includes(${JSON.stringify(t.voiceName)}))`;
	await block(true);
	await js(`${favRow}.querySelector(".dk-sb-row").click()`);
	let r = await rec();
	check("favourite voice click joins", recHas(r, "join"), JSON.stringify(r));
	check("…and doesn't navigate to Discord's call view", !recHas(r, "nav"), JSON.stringify(r));
	check("favourite voice hover actions: chat, join", (await js(`return [...${favRow}.querySelectorAll(".dk-sb-action")].map(b => b.dataset.dkAction).join(",")`)) === "chat,join");
	await js(`[...${favRow}.querySelectorAll(".dk-sb-action")].find(b => b.dataset.dkAction === "chat").click()`);
	r = await rec();
	check("chat opens the voice chat without joining", recHas(r, "chatOpen") && recHas(r, "nav") && !recHas(r, "join"), JSON.stringify(r));
	await js(`[...${favRow}.querySelectorAll(".dk-sb-action")].find(b => b.dataset.dkAction === "join").click()`);
	check("join joins", recHas(await rec(), "join"));

	// ── 3. Column voice row: click joins; hover actions ──
	await js(`${rowSel}?.click()`);
	check("column voice click joins", recHas(await rec(), "join"));

	// remove again from the menu
	await block(false);
	await openMenuOn(rowSel);
	await until(`document.querySelector('[role="menu"] [id$="dk-unfavorite"]')`, 3000);
	await js(`document.querySelector('[role="menu"] [id$="dk-unfavorite"]').click()`);
	check("removed favourite leaves the sidebar at once", await until(`![...document.querySelectorAll(".dk-layer-top .dk-sb-section")].find(s => s.textContent.includes("Favorites"))?.textContent.includes(${JSON.stringify(t.voiceName)})`, 500));

	// ── 4. Header star on the open text channel ──
	await js(`document.querySelector(".dk-star")?.click()`);
	check("header star shows", await js(`return !!document.querySelector(".dk-star")`));
	check("header star adds at once", await until(`document.querySelector(".dk-star[data-on]")`, 500) && (await stored()).includes(t.text));
	await js(`document.querySelector(".dk-star")?.click()`);
	check("header star removes at once", await until(`!document.querySelector(".dk-star[data-on]")`, 500));

	// ── 5. Favourite person: click messages; hover offers call and message ──
	const hadDm = (await stored()).includes(t.dm);
	if (!hadDm) await js(`const me = ${C}.UserStore.getCurrentUser().id; const s = Vencord.Settings.plugins.Sidebar; const all = JSON.parse(JSON.stringify(s.favorites)); all[me] = [...(all[me] ?? []), { id: ${JSON.stringify(t.dm)}, label: "test" }]; s.favorites = all;`);
	const dmRow = `[...document.querySelectorAll(".dk-layer-top .dk-sb-rowwrap")].find(w => w.querySelector(".dk-sb-row") && ${C}.ChannelStore.getChannel(${JSON.stringify(t.dm)}) && w.textContent.includes(Vencord.Webpack.Common.UserStore.getUser(${C}.ChannelStore.getChannel(${JSON.stringify(t.dm)}).recipients[0])?.globalName ?? "§") || w.textContent.includes(Vencord.Webpack.Common.UserStore.getUser(${C}.ChannelStore.getChannel(${JSON.stringify(t.dm)}).recipients[0])?.username ?? "§"))`;
	await until(dmRow);
	check("favourite person hover actions: call, message", (await js(`return [...(${dmRow}?.querySelectorAll(".dk-sb-action") ?? [])].map(b => b.dataset.dkAction).join(",")`)) === "call,message");
	await block(true);
	await rec();
	await js(`[...${dmRow}.querySelectorAll(".dk-sb-action")].find(b => b.dataset.dkAction === "call").click()`);
	r = await rec();
	check("call rings them (Discord's call, ring on)", recHas(r, "call", a => a[0] === t.dm && a[2] === true), JSON.stringify(r));
	await js(`[...${dmRow}.querySelectorAll(".dk-sb-action")].find(b => b.dataset.dkAction === "message").click()`);
	check("message opens the DM", recHas(await rec(), "nav", a => a[0].endsWith(t.dm)));
	await js(`${dmRow}.querySelector(".dk-sb-row").click()`);
	check("row click opens the DM", recHas(await rec(), "nav", a => a[0].endsWith(t.dm)));
	if (!hadDm) await js(`const me = ${C}.UserStore.getCurrentUser().id; const s = Vencord.Settings.plugins.Sidebar; const all = JSON.parse(JSON.stringify(s.favorites)); all[me] = (all[me] ?? []).filter(f => f.id !== ${JSON.stringify(t.dm)}); s.favorites = all;`);

	// ── 6. Top-level rows and links (navigation recorded, not performed) ──
	await rec();
	await js(`[...document.querySelectorAll(".dk-layer-top .dk-sb-row")].find(r => r.textContent === "Home")?.click()`);
	check("Home row goes Home", recHas(await rec(), "nav", a => a[0] === "/channels/@me"));
	// DMs & mentions only shows while something's unread there
	const directSection = `[...document.querySelectorAll(".dk-layer-top .dk-sb-section")].find(s => /^DMs & mentions/i.test(s.querySelector(".dk-sb-label, .dk-sb-label-toggle")?.textContent ?? ""))`;
	const dmMention = await js(`return !!${directSection}?.querySelector(".dk-sb-row")`);
	if (dmMention) {
		await js(`${directSection}.querySelector(".dk-sb-row").click()`);
		check("DMs & mentions row opens its conversation", recHas(await rec(), "nav", a => a[0].startsWith("/channels/")));
		await js(`document.querySelector('[data-dk-action="mark-read"]')?.click()`);
		r = await rec();
		check("Mark read acks only through Discord's bulk ack", recHas(r, "dispatch", a => a[0] === "BULK_ACK") || !(await js(`return !!document.querySelector('[data-dk-action="mark-read"]')`)), JSON.stringify(r));
	}
	// the row only shows while there are requests
	const requestsRow = `[...document.querySelectorAll(".dk-layer-top .dk-sb-row")].find(r => r.textContent.startsWith("Message requests"))`;
	if (await js(`return !!${requestsRow}`)) {
		await js(`${requestsRow}.click()`);
		check("Message requests row opens message requests", recHas(await rec(), "nav", a => a[0] === "/message-requests"));
	} else {
		check("no Message requests row without requests", !(await js(`return Vencord.Webpack.Common.MessageRequestStore.getMessageRequestsCount?.() > 0`)));
	}
	await js(`document.querySelector('[data-dk-action="add-server"]')?.click()`);
	check("Servers › Add opens Discord's create/join", recHas(await rec(), "createGuild"));
	const serverRow = `[...document.querySelectorAll('.dk-layer-top .dk-sb-section')].find(s => s.querySelector(".dk-sb-label-toggle")?.textContent === "Servers")?.querySelector(".dk-sb-row[data-dk-id]")`;
	await js(`${serverRow}?.click()`);
	check("server row opens the server", recHas(await rec(), "nav", a => a[0].startsWith("/channels/")));
	// triage from DMs & mentions without opening anything (Discord's side effects recorded)
	const triage = `${directSection}?.querySelector(".dk-sb-rowwrap .dk-sb-actions")`;
	if (await js(`return !!${triage}`)) {
		await rec();
		await js(`${triage}.querySelector('[data-dk-action="read"]').click()`);
		r = await rec();
		check("triage ✓ marks read through Discord's bulk ack, without opening", recHas(r, "dispatch", a => a[0] === "BULK_ACK") && !recHas(r, "nav"), JSON.stringify(r));
		const quiet = await js(`return !!${triage}.querySelector('[data-dk-action="quiet"]')`);
		if (quiet) {
			await js(`${triage}.querySelector('[data-dk-action="quiet"]').click()`);
			check("triage bell stops a server's broadcast pings", recHas(await rec(), "guildNotif"));
		}
	}

	// drag a server below the next one (Discord's move is recorded, not performed)
	const dragged = await js(`
		const servers = [...document.querySelectorAll(".dk-layer-top .dk-sb-section")].find(s => s.querySelector(".dk-sb-label-toggle")?.textContent === "Servers");
		const rows = [...servers.querySelectorAll(".dk-sb-drag")].filter(r => r.querySelector("[data-dk-id]"));
		const [a, b] = rows; const tick = () => new Promise(r => setTimeout(r, 50));
		const dt = new DataTransfer();
		a.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt })); await tick();
		const r = b.getBoundingClientRect(), y = r.bottom - 3;
		b.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y })); await tick();
		const line = b.dataset.dkDrop, dim = !!a.dataset.dkDrag;
		b.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
		a.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt })); await tick();
		return { line, dim, a: a.querySelector("[data-dk-id]").dataset.dkId, b: b.querySelector("[data-dk-id]").dataset.dkId, left: !!document.querySelector("[data-dk-drag], [data-dk-drop]") };`);
	check("dragging a server dims it and shows where it lands", dragged.dim && dragged.line === "below", JSON.stringify(dragged));
	r = await rec();
	check("dropping it moves it through Discord's own move", recHas(r, "moveServer", a => a[0] === dragged.a && a[1] === dragged.b && a[2] === true), JSON.stringify(r));
	check("…and leaves nothing dimmed or marked", !dragged.left);
	const older = `[...document.querySelectorAll(".dk-layer-top .dk-sb-more")].find(b => b.textContent.startsWith("Older conversations"))`;
	if (await js(`return !!${older}`)) {
		const before = await js(`return document.querySelectorAll(".dk-layer-top .dk-sb-row").length`);
		await js(`${older}.click()`);
		check("Older conversations unfolds", await until(`document.querySelectorAll(".dk-layer-top .dk-sb-row").length > ${before}`, 800));
		await js(`[...document.querySelectorAll(".dk-layer-top .dk-sb-more")].find(b => b.textContent === "Show fewer")?.click()`);
	}
	// section collapse and expand
	const msgToggle = `[...document.querySelectorAll(".dk-sb-label-toggle")].find(b => b.textContent.includes("Messages"))`;
	await js(`${msgToggle}.click()`);
	check("section label collapses", await until(`${msgToggle}.getAttribute("aria-expanded") === "false"`, 500));
	await js(`${msgToggle}.click()`);
	check("…and expands", await until(`${msgToggle}.getAttribute("aria-expanded") === "true"`, 500));

	// ── 7. Our context menu on a conversation ──
	const convo = `[...document.querySelectorAll(".dk-layer-top .dk-sb-section")].find(s => s.textContent.includes("Favorites"))?.querySelector(".dk-sb-row")`;
	if (await js(`return !!${convo}`)) {
		await openMenuOn(convo);
		check("favourite's menu opens", await until(`document.querySelector('[role="menu"]')`, 1500));
		await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
		await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
		await until(`!document.querySelector('[role="menu"]')`, 1000);
	}

	// ── 7b. Popouts open where they belong (window scaling once put them zoom-times too far out) ──
	const pos = await js(`
		const b = document.querySelector('[aria-label="More message options"]'); if (!b) return null;
		const r = b.getBoundingClientRect(); b.click(); await new Promise(r => setTimeout(r, 700));
		const m = document.querySelector('[role="menu"]')?.getBoundingClientRect();
		return m ? { dx: Math.abs(m.left - r.left), dy: r.top - m.bottom } : { missing: true };`);
	check("the composer's + menu opens at the +", pos && !pos.missing && pos.dx < 24 && pos.dy > -4 && pos.dy < 40, JSON.stringify(pos));
	await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
	await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
	await until(`!document.querySelector('[role="menu"]')`, 1000);
	const at = await js(`
		const row = [...document.querySelectorAll(".dk-layer-top .dk-sb-section .dk-sb-row")][1]; const r = row.getBoundingClientRect();
		row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: r.left + 40, clientY: r.top + 10 }));
		await new Promise(r => setTimeout(r, 700)); const m = document.querySelector('[role="menu"]')?.getBoundingClientRect();
		return m ? { dx: Math.abs(m.left - (r.left + 40)), dy: Math.abs(m.top - (r.top + 10)) } : { missing: true };`);
	check("a right-click menu opens at the pointer", at && !at.missing && at.dx < 24 && at.dy < 24, JSON.stringify(at));
	await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
	await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
	await until(`!document.querySelector('[role="menu"]')`, 1000);

	// ── 8. Column: close, crumb, category, quiet ──
	await block(false);
	await go(`/channels/${t.guild}/${t.text}`);
	await until(`document.querySelector(".dk-col")`);
	await js(`document.querySelector(".dk-col-back").click()`);
	check("× closes the column", await until(`document.querySelector("nav.dk-sb")?.dataset.mode === "top"`, 800));
	await js(`document.querySelector(".dk-crumb")?.click()`);
	check("crumb reopens it", await until(`document.querySelector("nav.dk-sb")?.dataset.mode === "server"`, 800));
	await rec();
	const liveCat = `[...document.querySelectorAll(".dk-col .dk-col-category")].find(c => !c.dataset.quiet && c.querySelector(".dk-sb-label-toggle"))?.querySelector(".dk-sb-label-toggle")`;
	if (await js(`return !!${liveCat}`)) {
		await js(`${liveCat}.click()`);
		check("category caret uses Discord's collapse (recorded, not sent)", recHas(await rec(), "dispatch", a => /CATEGORY_(COLLAPSE|EXPAND)/.test(a[0])));
	}
	const quietBtn = `document.querySelector(".dk-col .dk-sb-quiet")`;
	if (await js(`return !!${quietBtn}`)) {
		const before = await js(`return document.querySelectorAll(".dk-col .dk-sb-row").length`);
		await js(`${quietBtn}.click()`);
		check("· N unfolds that category's quiet channels", await until(`document.querySelectorAll(".dk-col .dk-sb-row").length > ${before}`, 800));
		await js(`${quietBtn}.click()`);
	}

	// ── 9. Palette ›actions (Discord side effects recorded) ──
	const runAction = async (label, twice = false) => {
		await js(`Vencord.Webpack.mapMangledModule('type:"QUICKSWITCHER_SEARCH"', { show: Vencord.Webpack.filters.byCode('"KEYBIND"') }).show("KEYBIND", "")`);
		await until(`document.activeElement?.closest(".dk-pal")`, 2000);
		await send("Input.insertText", { text: ">" + label });
		await until(`[...document.querySelectorAll(".dk-pal-row")].some(r => r.textContent.startsWith(${JSON.stringify(label)}, 1))`, 1000);
		for (let i = 0; i < (twice ? 2 : 1); i++) {
			await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
			await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
			await sleep(150);
		}
		await until(`!document.querySelector(".dk-pal")`, 2000);
		return rec();
	};
	await rec();
	check("› Mute server goes through Discord's notification settings", recHas(await runAction("Mute server"), "guildNotif"));
	check("› Stop pings here sets suppress everyone and roles", recHas(await runAction("Stop @everyone and role pings here"), "guildNotif"));
	r = await runAction("Stop @everyone and role pings in large", true);
	check("› Stop pings in large servers: one bulk save after a second ↵", recHas(r, "guildSettingsBulk") || !(await js(`return true`)), JSON.stringify(r).slice(0, 200));
	check("› Add a server opens Discord's create/join", recHas(await runAction("Add a server"), "createGuild"));
	await block(true);
	check("› Home goes Home", recHas(await runAction("Home"), "nav", a => a[0] === "/channels/@me"));
	// Focus: only favourites notify (Discord's notification call; the popup itself is recorded)
	await block(true);
	await runAction("Focus for an hour");
	check("› Focus for an hour turns Focus on, and the sidebar says so", await until(`document.querySelector('.dk-sb-row[data-dk-id="focus"]')`, 1000));
	const allows = (props) => js(`return Vencord.Plugins.plugins.Sidebar.focusAllows(${JSON.stringify(props)})`);
	check("Focus's filter is on Discord's notification call", await js(`return String(Vencord.Webpack.findByProps("showNotification", "playNotificationSound").showNotification).includes("focus_held")`));
	check("Focus holds a message from someone who isn't a favourite", !(await allows({ notif_type: "MESSAGE_CREATE", notif_user_id: "1", channel_id: "2" })));
	const favId = await js(`const me = ${C}.UserStore.getCurrentUser().id; return (Vencord.Settings.plugins.Sidebar.favorites[me] ?? [])[0]?.id ?? null`);
	if (favId) check("…and lets one in a favourite through", await allows({ notif_type: "MESSAGE_CREATE", notif_user_id: "1", channel_id: favId }));
	check("…and never touches other notifications (calls, friend requests)", await allows({ notif_type: "INCOMING_CALL" }));
	await js(`document.querySelector('.dk-sb-row[data-dk-id="focus"]').click()`);
	check("clicking the Focus row ends it", await until(`!document.querySelector('.dk-sb-row[data-dk-id="focus"]')`, 1000));

	// Drag to reorder favourites: the first lands below the second, then back (settings restored at the end anyway)
	const order = await stored();
	if (order.length >= 2) {
		const dragFav = (from, onto, below) => js(`
			const at = id => document.querySelector('.dk-layer-top .dk-sb-drag:has(> .dk-sb-rowwrap .dk-sb-row[data-dk-id="' + id + '"])');
			const a = at(${JSON.stringify(from)}), b = at(${JSON.stringify(onto)}); if (!a || !b) return false;
			const dt = new DataTransfer(), r = b.getBoundingClientRect(), y = ${below} ? r.bottom - 2 : r.top + 2;
			const fire = (el, type, clientY = 0) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientY }));
			fire(a, "dragstart"); await new Promise(r => setTimeout(r, 50));
			fire(b, "dragover", y); await new Promise(r => setTimeout(r, 50));
			const line = b.getAttribute("data-dk-drop");
			fire(b, "drop", y); fire(a, "dragend");
			return line;`);
		const line = await dragFav(order[0], order[1], true);
		check("dragging a favourite marks where it lands", line === "below", String(line));
		check("…and drops it there, saved", JSON.stringify((await stored()).slice(0, 2)) === JSON.stringify([order[1], order[0]]), JSON.stringify(await stored()));
		await dragFav(order[0], order[1], false);
		check("…and drags back", JSON.stringify(await stored()) === JSON.stringify(order));
		const sv = await js(`return document.querySelector('.dk-layer-top .dk-sb-drag .dk-sb-row[data-dk-id]')?.closest('.dk-sb-drag')?.getAttribute('draggable')`);
		check("server and favourite rows are both draggable", sv === "true");
	}

	// Windows taskbar buttons: Discord accepts them, and each click does Discord's own thing
	if (await js(`return navigator.userAgent.includes("Windows")`)) {
		check("taskbar buttons are accepted by Windows", await js(`const c = document.createElement("canvas"); c.width = c.height = 32; return VencordNative.pluginHelpers.DeadKernel.setTaskbarButtons([{ id: "mute", tooltip: "Mute", icon: c.toDataURL("image/png") }])`));
		await js(`const s = Vencord.Settings.plugins.DeadKernel; s.taskbar = false; s.taskbar = true;`);
		await rec();
		await js(`const k = Vencord.Plugins.plugins.DeadKernel; k.taskbarClick("mute"); k.taskbarClick("deafen"); k.taskbarClick("leave");`);
		const tr = await rec();
		check("taskbar Mute, Deafen, Disconnect do Discord's own toggles", recHas(tr, "selfMute") && recHas(tr, "selfDeaf") && recHas(tr, "disconnect"), JSON.stringify(tr));
	}

	// Ctrl+1 opens favourite 1; holding Ctrl shows the numbers
	if (favId) {
		await rec();
		await js(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", ctrlKey: true, bubbles: true }))`);
		const kr = await rec();
		check("Ctrl+1 opens favourite 1", recHas(kr, "nav") || recHas(kr, "chatOpen"), JSON.stringify(kr));
	}
	await js(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", code: "ControlLeft", ctrlKey: true, bubbles: true }))`);
	check("holding Ctrl shows the favourites' numbers", await until(`"dkCtrl" in document.documentElement.dataset`, 1200));
	await js(`window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", code: "ControlLeft", bubbles: true }))`);
	check("…and letting go hides them", await until(`!("dkCtrl" in document.documentElement.dataset)`, 500));

	await block(false);
	const look = await js(`const t = Vencord.Settings.plugins.Theme; return { palette: t.palette, density: t.density };`);
	await runAction("Palette: Midnight");
	check("› Palette: Midnight switches the palette", await until(`document.documentElement.dataset.dkPalette === "midnight"`, 1000));
	await runAction("Density: Compact");
	check("› Density: Compact switches density", await until(`document.documentElement.dataset.dkDensity === "compact"`, 1000));
	await js(`const t = Vencord.Settings.plugins.Theme; t.palette = ${JSON.stringify(look.palette ?? "poimandres")}; t.density = ${JSON.stringify(look.density ?? "default")};`);
	check("…and his look is back", await js(`const t = Vencord.Settings.plugins.Theme; return (t.palette ?? "poimandres") === ${JSON.stringify(look.palette ?? "poimandres")} && (t.density ?? "default") === ${JSON.stringify(look.density ?? "default")}`));
	await block(false);

	// ── 10. Home, with a call injected into Discord's local voice store (nothing is sent) ──
	await block(false);
	await go("/channels/@me");
	await until(`document.querySelector(".dk-home")`);
	await js(`
		// only friends who aren't in a call: never overwrite someone's real voice state, even locally
		const C = ${C}, friends = C.RelationshipStore.getFriendIDs().filter(u => !C.VoiceStateStore.getVoiceStateForUser(u)?.channelId);
		const vc = C.ChannelStore.getChannel(${JSON.stringify(t.voice)});
		window.__dkVoice = { ids: friends.slice(0, 2), g: vc.guild_id, vc: vc.id };
		C.FluxDispatcher.dispatch({ type: "VOICE_STATE_UPDATES", voiceStates: window.__dkVoice.ids.map((u, i) => ({ userId: u, channelId: vc.id, guildId: vc.guild_id, sessionId: "dk-test-" + u, selfMute: i === 1, selfDeaf: false, selfVideo: false, selfStream: i === 0, mute: false, deaf: false, suppress: false })) });`);
	check("Home lists the call", await until(`document.querySelector('.dk-home-callblock[data-dk-id="${t.voice}"]')`, 1500));
	check("…with who's in it, and who's live or muted", await js(`const b = document.querySelector('.dk-home-callblock[data-dk-id="${t.voice}"]'); return b.querySelectorAll(".dk-home-member").length === 2 && !!b.querySelector(".dk-vc-live") && !!b.querySelector(".dk-vc-off")`));
	await block(true);
	await rec();
	await js(`document.querySelector('.dk-home-callblock[data-dk-id="${t.voice}"] .dk-home-main').click()`);
	r = await rec();
	check("call row opens its chat, doesn't join", recHas(r, "chatOpen") && recHas(r, "nav") && !recHas(r, "join"), JSON.stringify(r));
	await js(`document.querySelector('.dk-home-callblock[data-dk-id="${t.voice}"] .dk-home-join')?.click()`);
	check("Join joins", recHas(await rec(), "join"));
	await js(`document.querySelector('.dk-home-callblock[data-dk-id="${t.voice}"] button.dk-home-member')?.click()`);
	r = await rec();
	check("a friend in the call opens your DM with them", recHas(r, "nav", a => a[0].startsWith("/channels/@me/")) || recHas(r, "openDmNew"), JSON.stringify(r));
	await js(`[...document.querySelectorAll(".dk-home-body section")].find(s => s.querySelector("h2")?.textContent.startsWith("Online"))?.querySelector("button.dk-home-row")?.click()`);
	r = await rec();
	check("an online friend opens your DM", recHas(r, "nav", a => a[0].startsWith("/channels/@me/")) || recHas(r, "openDmNew") || !(await js(`return !![...document.querySelectorAll(".dk-home-body section")].find(s => s.querySelector("h2")?.textContent.startsWith("Online"))?.querySelector("button.dk-home-row")`)), JSON.stringify(r));
	await js(`[...document.querySelectorAll(".dk-home-body section")].find(s => s.querySelector("h2")?.textContent === "Recent")?.querySelector("button.dk-home-row")?.click()`);
	check("a recent conversation opens", recHas(await rec(), "nav", a => a[0].startsWith("/channels/")));
	await js(`[...document.querySelectorAll(".dk-home-row")].find(b => b.textContent.includes("Message requests"))?.click()`);
	r = await rec();
	check("message requests open (if any)", recHas(r, "nav", a => a[0] === "/message-requests") || !(await js(`return [...document.querySelectorAll(".dk-home-row")].some(b => b.textContent.includes("Message requests"))`)));
	await block(false);
	await js(`document.querySelector('[data-dk-action="all-friends"]').click()`);
	check("All friends shows Discord's page in place", await until(`document.querySelector(".dk-home-discord")`, 1500));
	await js(`document.querySelector(".dk-home-back").click()`);
	check("← Home comes back", await until(`document.querySelector(".dk-home")`, 1500));

	// For you: a line opens its message, ✓ marks read through Discord's bulk ack (both recorded, not done)
	await until(`document.querySelector(".dk-home-foryou")`, 4000);
	if (await js(`return !!document.querySelector(".dk-home-digest")`)) {
		await block(true);
		check("For you never repeats a conversation under Recent", await js(`
			const shown = new Set([...document.querySelectorAll(".dk-home-digest[data-dk-id]")].map(r => r.dataset.dkId));
			const recent = [...document.querySelectorAll(".dk-home-body section")].find(s => s.querySelector("h2")?.textContent === "Recent");
			return ![...(recent?.querySelectorAll("button.dk-home-row[data-dk-id]") ?? [])].some(b => shown.has(b.dataset.dkId));`));
		await rec();
		await js(`document.querySelector(".dk-home-digest .dk-home-main").click()`);
		r = await rec();
		check("a For you line opens its conversation or message", recHas(r, "nav", a => a[0].startsWith("/channels/")), JSON.stringify(r));
		await js(`document.querySelector(".dk-home-digest .dk-home-read").click()`);
		r = await rec();
		check("…and ✓ marks it read through Discord's bulk ack, without opening", recHas(r, "dispatch", a => a[0] === "BULK_ACK") && !recHas(r, "nav"), JSON.stringify(r));
		await block(false);
	}
	check("For you's broadcast line counts only unread @everyone/role pings", await js(`
		const b = document.querySelector('[data-dk-action="broadcasts"]'); return !b || /^\\d+ @everyone or role ping/.test(b.textContent.trim())`));

	// ── 11. Palette rows (empty state) ──
	await block(true);
	await js(`Vencord.Webpack.mapMangledModule('type:"QUICKSWITCHER_SEARCH"', { show: Vencord.Webpack.filters.byCode('"KEYBIND"') }).show("KEYBIND", "")`);
	await until(`document.activeElement?.closest(".dk-pal")`, 2000);
	await rec();
	const first = await js(`return document.querySelector(".dk-pal-row.dk-selected")?.id.replace("dk-pal-", "")`);
	const favBefore = await stored();
	await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", modifiers: 8, windowsVirtualKeyCode: 13 });
	await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: 8, windowsVirtualKeyCode: 13 });
	check("⇧↵ stars the selected row at once", await until(`document.querySelector(".dk-pal-row.dk-selected .dk-pal-fav")`, 500) !== favBefore.includes(first) || favBefore.includes(first));
	await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", modifiers: 8, windowsVirtualKeyCode: 13 });
	await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: 8, windowsVirtualKeyCode: 13 });
	await sleep(150);
	check("…and ⇧↵ again puts it back", JSON.stringify(await stored()) === JSON.stringify(favBefore));
	await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
	await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
	r = await rec();
	const firstIsVoice = await js(`const c = ${C}.ChannelStore.getChannel(${JSON.stringify(first)}); return c?.type === 2 || c?.type === 13`);
	check(`↵ on a recent ${firstIsVoice ? "voice channel joins" : "conversation opens it"}`, firstIsVoice ? recHas(r, "join") : recHas(r, "nav"), JSON.stringify(r));
	await until(`!document.querySelector(".dk-pal")`, 2000);
	await block(false);

} finally {
	await js(`if (window.__dkVoice) { const v = window.__dkVoice; ${C}.FluxDispatcher.dispatch({ type: "VOICE_STATE_UPDATES", voiceStates: v.ids.map(u => ({ userId: u, channelId: null, guildId: v.g, sessionId: "dk-test-" + u })) }); delete window.__dkVoice; }`).catch(() => {});
	// ── restore: recorders off, settings back, compare ──
	await js(`window.__dk?.restore.forEach(f => f()); delete window.__dk;`).catch(() => {});
	const plain = JSON.parse(snap);
	await js(`const s = Vencord.Settings.plugins.Sidebar; const b = ${JSON.stringify(plain)}; for (const k of Object.keys(b)) s[k] = JSON.parse(JSON.stringify(b[k]));`);
	const after = await js(`const p = Vencord.Api.Settings.PlainSettings.plugins.Sidebar; return JSON.stringify(Object.fromEntries(${JSON.stringify(KEYS)}.map(k => [k, p[k]])))`);
	const same = JSON.stringify(JSON.parse(after)) === JSON.stringify(plain);
	check("his settings restored exactly", same);
	if (same && existsSync(snapFile)) unlinkSync(snapFile);
	else console.log(`settings backup kept at ${snapFile}`);
}

await sleep(200);
check("no errors from our code", errors.length === 0, errors.join("\n---\n"));
await send("Emulation.setFocusEmulationEnabled", { enabled: false });
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
