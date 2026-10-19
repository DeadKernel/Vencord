// The hover and focus effects, checked with a real pointer: they're custom properties set on the
// hovered element (see quietLayout.css's note on invalidation sets), so a typo in one silently
// leaves something hidden. CDP_PORT=9223 node personal/tools/hover-check.mjs
// Opens a read channel he has opened before (as smoke.mjs does), and moves the mouse only.
const port = process.env.CDP_PORT || "9223";
const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = targets.find(t => t.type === "page" && t.url.includes("discord.com"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0;
const send = (method, params = {}) => new Promise(res => { const m = ++id; ws.addEventListener("message", function on(e) { const d = JSON.parse(e.data); if (d.id !== m) return; ws.removeEventListener("message", on); res(d.result); }); ws.send(JSON.stringify({ id: m, method, params })); });
const js = async body => { const r = await send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const move = async (x, y) => { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); await sleep(250); };
const centre = sel => js(`const e = ${sel}; if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]`);
const style = (sel, prop) => js(`const e = ${sel}; return e ? getComputedStyle(e).${prop} : null`);
let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`); };

await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await js(`
	const C = Vencord.Webpack.Common, R = C.ReadStateStore, opened = Vencord.Settings.plugins.Sidebar.opened;
	const c = Object.keys(opened).map(id => C.ChannelStore.getChannel(id)).find(c => c?.guild_id && c.type === 0 && !R.hasUnread(c.id) && !R.getMentionCount(c.id) && C.GuildChannelStore.getChannels(c.guild_id).VOCAL.length);
	C.NavigationRouter.transitionTo("/channels/" + c.guild_id + "/" + c.id);`);
await sleep(1800);
const away = [5, 5];
await move(...away);

// the header's buttons appear on hover
const tool = `document.querySelector('section[class*="title_"] [class*="toolbar_"] > :not([class*="search"])')`;
const header = await centre(`document.querySelector('section[class*="title_"]')`);
check("header buttons hidden at rest", (await style(tool, "opacity")) === "0", await style(tool, "opacity"));
await move(...header);
await sleep(200);
check("…and shown while the header is hovered", (await style(tool, "opacity")) === "1", await style(tool, "opacity"));
await move(...away);

// search: an icon until used
const bar = `document.querySelector('section[class*="title_"] [class*="toolbar_"] [class*="searchBar_"]')`;
const px = async sel => Math.round(parseFloat(await style(sel, "width")));
check("search is a 32px icon at rest", (await px(bar)) === 32, await style(bar, "width"));
check("…its text box tucked away", (await style(`${bar}?.querySelector('[class*="editor_"]')`, "position")) === "absolute");
await js(`${bar}?.querySelector('[role="combobox"], [contenteditable="true"]')?.focus()`);
await sleep(300);
check("…and 240px when focused", (await px(bar)) === 240, await style(bar, "width"));
check("…with its text box back", (await style(`${bar}?.querySelector('[class*="editor_"]')`, "position")) !== "absolute");
await js(`document.activeElement?.blur()`);
await sleep(300);

// composer: its buttons dim at rest, full on hover; the box's border is the accent when focused
const btns = `document.querySelector('[class*="channelTextArea_"] [class*="buttons_"]')`;
check("composer buttons dim at rest", (await style(btns, "opacity")) === "0.35", await style(btns, "opacity"));
await move(...await centre(`document.querySelector('[class*="channelTextArea_"]')`));
check("…full while hovered", (await style(btns, "opacity")) === "1", await style(btns, "opacity"));
await move(...away);
const box = `document.querySelector('[class*="channelTextArea_"] > [class*="scrollableContainer_"], [class*="channelTextArea_"] [class*="scrollableContainer_"]')`;
const restBorder = await style(box, "borderTopColor");
await js(`document.querySelector('[class*="channelTextArea_"] [role="textbox"]')?.focus()`);
await sleep(250);
const focusBorder = await style(box, "borderTopColor");
check("the composer's border takes the accent while focused", restBorder && focusBorder && restBorder !== focusBorder, `${restBorder} → ${focusBorder}`);
await js(`document.activeElement?.blur()`);

// a message's timestamp on hover
const msg = `[...document.querySelectorAll('[class*="cozyMessage_"]')].filter(m => m.querySelector("h3 [class*='timestamp_']")).at(-1)`;
const ts = `${msg}?.querySelector("h3 [class*='timestamp_']")`;
if (await js(`return !!(${ts})`)) {
	check("a message's timestamp hidden at rest", (await style(ts, "opacity")) === "0", await style(ts, "opacity"));
	await js(`${msg}.scrollIntoView({ block: "center" })`);
	await sleep(300);
	await move(...await centre(msg));
	await sleep(150);
	check("…shown while it's hovered", (await style(ts, "opacity")) === "1", await style(ts, "opacity"));
	await move(...away);
}
// add reaction: only on the message you're pointing at
const rx = `document.querySelector('[class*="reactions_"] [class*="reactionBtn_"]')`;
if (await js(`return !!(${rx})`)) {
	check("add-reaction hidden at rest", (await style(rx, "opacity")) === "0", await style(rx, "opacity"));
	await js(`${rx}.scrollIntoView({ block: "center" })`);
	await sleep(300);
	await move(...await centre(rx));
	await sleep(150);
	check("…shown on the hovered message", (await style(rx, "opacity")) === "1", await style(rx, "opacity"));
	await move(...away);
} else console.log("skip  add reaction: no reactions on screen");

// sidebar row actions: they appear on hover, the row makes room, its trail steps aside
const wrap = `[...document.querySelectorAll('.dk-sb-rowwrap')].find(w => w.querySelector(':scope > .dk-sb-actions') && w.getBoundingClientRect().height > 0)`;
if (await js(`return !!(${wrap})`)) {
	const act = `${wrap}.querySelector('.dk-sb-actions')`, row = `${wrap}.querySelector(':scope > .dk-sb-row')`;
	check("row actions hidden at rest", (await style(act, "opacity")) === "0" && (await style(row, "paddingRight")) === "10px");
	await move(...await centre(row));
	await sleep(150);
	check("…on hover they show and the row makes room", (await style(act, "opacity")) === "1" && (await style(act, "pointerEvents")) === "auto" && (await style(row, "paddingRight")) === "72px",
		`${await style(act, "opacity")} ${await style(act, "pointerEvents")} ${await style(row, "paddingRight")}`);
	check("…and its trail steps aside", (await style(`${row}.querySelector('.dk-sb-trail')`, "visibility")) === "hidden");
	await move(...away);
}
await send("Emulation.setFocusEmulationEnabled", { enabled: false });
ws.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
