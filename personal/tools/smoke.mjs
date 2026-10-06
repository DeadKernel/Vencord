// Smoke test for the DeadKernel plugins, against the running dev Vesktop (CDP_PORT=9223).
//   CDP_PORT=9223 node personal/tools/smoke.mjs
// Walks the screens the way he uses them and checks each step. It only opens channels that are
// already read (so it never marks anything read), never sends, joins or changes Discord settings,
// and puts every plugin setting it touches back. Run it after a Discord update or a big change.

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
		if (/ErrorBoundary|dk-|deadkernel|Sidebar|Palette|Home|Column|TypeError/.test(text)) errors.push(text.slice(0, 400));
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
const js = async (expression) => {
	const r = await send("Runtime.evaluate", { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
	return r.result.value;
};
const key = async (k, modifiers = 0) => {
	const codes = { Escape: 27, Enter: 13, ArrowUp: 38, ArrowDown: 40 };
	for (const type of ["rawKeyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code: k, modifiers, windowsVirtualKeyCode: codes[k] ?? 0 });
};
const type = (text) => send("Input.insertText", { text });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (expr, ms = 3000) => {
	const end = Date.now() + ms;
	while (Date.now() < end) { if (await js(`return !!(${expr})`)) return true; await sleep(100); }
	return false;
};

let failed = 0;
const check = (name, ok, detail = "") => {
	if (!ok) failed++;
	console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail && !ok ? `  (${detail})` : ""}`);
};

await send("Runtime.enable");
// keys only reach a focused page; he may be in another window, so the page is told it has focus
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await sleep(300);
errors.length = 0; // only errors from this run

const C = "Vencord.Webpack.Common";
const go = (path) => js(`${C}.NavigationRouter.transitionTo(${JSON.stringify(path)})`);

// ── 1. Plugins ──
const plugins = await js(`return ["Sidebar","Declutter","QuietLayout","HumanLayerTheme","DeadKernel"].map(n => [n, !!Vencord.Plugins.plugins[n]?.started])`);
for (const [n, on] of plugins) check(`plugin ${n} started`, on);

// ── 2. Home ──
await go("/channels/@me");
check("home renders", await until(`document.querySelector(".dk-home")`));
check("sidebar at top level", await js(`return document.querySelector("nav.dk-sb")?.dataset.mode === "top"`));
check("no server rail", await js(`return !document.querySelector('nav[aria-label="Servers sidebar"]')`));
check("home has Online and Recent", await js(`return ["Online","Recent"].every(h => [...document.querySelectorAll(".dk-home-body h2")].some(e => e.textContent.startsWith(h)))`));

// ── 3. A server: pick a text channel he has opened before that is read ──
const target = await js(`
	const R = ${C}.ReadStateStore, Ch = ${C}.ChannelStore;
	const opened = Vencord.Settings.plugins.Sidebar.opened;
	const id = Object.keys(opened).sort((a, b) => opened[b] - opened[a]).find(id => {
		const c = Ch.getChannel(id);
		return c?.guild_id && c.type === 0 && !R.hasUnread(id) && !R.getMentionCount(id);
	});
	return id ? { id, guild: Ch.getChannel(id).guild_id } : null;`);
check("found a read channel to open", !!target);
if (target) {
	const base = await js(`return parseFloat(getComputedStyle(document.querySelector('[class*="sidebar__"]')).width)`);
	await go(`/channels/${target.guild}/${target.id}`);
	check("column opens", await until(`document.querySelector("nav.dk-sb")?.dataset.mode === "server" && document.querySelector(".dk-col")`));
	check("sidebar widens by the column", await until(`parseFloat(getComputedStyle(document.querySelector('[class*="sidebar__"]')).width) >= Math.min(${base}, 240) + 247`, 3000));
	check("selected channel highlighted in column", await js(`return !!document.querySelector(".dk-col .dk-sb-row.dk-selected")`));
	check("server row selected in sidebar", await js(`return !!document.querySelector(".dk-layer-top .dk-sb-row.dk-selected")`));
	check("no crumb while the column shows the server", await js(`return !document.querySelector(".dk-crumb")`));
	check("favourite star in header", await js(`return !!document.querySelector(".dk-star")`));
	check("no animation flag left", await until(`!("dkSbAnim" in document.documentElement.dataset)`, 1000));

	// close and reopen
	await js(`document.querySelector(".dk-col-back").click()`);
	check("column closes", await until(`document.querySelector("nav.dk-sb")?.dataset.mode === "top"`));
	// the width animates; an occluded window draws no frames, so poll for the end state
	check("sidebar back to its width", await until(`Math.abs(parseFloat(getComputedStyle(document.querySelector('[class*="sidebar__"]')).width) - ${base}) < 2`, 6000));
	check("crumb shows after closing", await until(`document.querySelector(".dk-crumb")`));
	await js(`document.querySelector(".dk-crumb").click()`);
	check("crumb reopens the column", await until(`document.querySelector("nav.dk-sb")?.dataset.mode === "server"`));

	// quiet channels unfold and fold
	const quiet = await js(`return !!document.querySelector(".dk-col .dk-sb-more")`);
	if (quiet) {
		const before = await js(`return document.querySelectorAll(".dk-col .dk-sb-row").length`);
		await js(`[...document.querySelectorAll(".dk-col .dk-sb-more")].pop().click()`);
		await sleep(200);
		const after = await js(`return document.querySelectorAll(".dk-col .dk-sb-row").length`);
		check("show all quiet channels unfolds rows", after > before, `${before} → ${after}`);
		await js(`[...document.querySelectorAll(".dk-col .dk-sb-more")].pop().click()`);
	}

	// right-click menu on a sidebar row
	await js(`document.querySelector(".dk-layer-top .dk-sb-section .dk-sb-row").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 100, clientY: 100 }))`);
	check("context menu opens", await until(`document.querySelector('[id^="dk-sidebar"]')`));
	await key("Escape");
	check("context menu closes", await until(`!document.querySelector('[id^="dk-sidebar"]')`));

	// Discord's own menus from our rows
	await js(`const t = document.querySelector(".dk-col-title"), r = t.getBoundingClientRect(); t.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + 20, clientY: r.bottom }))`);
	check("column title opens Discord's server menu", await until(`document.querySelector('[role="menu"]')?.id?.startsWith("guild-header-popout")`, 4000));
	await key("Escape");
	await until(`!document.querySelector('[role="menu"]')`, 1000);
	await js(`const row = document.querySelector(".dk-col .dk-col-row"), r = row.getBoundingClientRect(); row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: r.left + 40, clientY: r.top + 10 }))`);
	check("channel row opens Discord's channel menu", await until(`document.querySelector('[role="menu"]')?.id?.match(/^(channel|thread)-context/)`, 4000));
	check("…with our Add/Remove Favorites item", await js(`return !!document.querySelector('[role="menu"] [id*="favorite"]')`));
	await key("Escape");
	await until(`!document.querySelector('[role="menu"]')`, 1000);
}

// ── 3b. Add a server: Discord's dialog opens (and is closed untouched) ──
await js(`document.querySelector('[data-dk-action="add-server"]').click()`);
check("Add opens Discord's add-a-server dialog", await until(`document.querySelector('[role="dialog"]')`, 3000));
await until(`document.querySelector('[role="dialog"] [aria-label="Close"]')`, 3000);
await js(`document.querySelector('[role="dialog"] [aria-label="Close"]')?.click()`);
check("dialog closes", await until(`!document.querySelector('[role="dialog"]')`, 3000));

// ── 4. Palette ──
await js(`Vencord.Webpack.mapMangledModule('type:"QUICKSWITCHER_SEARCH"', { show: Vencord.Webpack.filters.byCode('"KEYBIND"') }).show("KEYBIND", "")`);
check("palette opens", await until(`document.querySelector(".dk-pal")`));
check("input focused", await until(`document.activeElement?.closest(".dk-pal")`, 1000));
await sleep(300); // the modal's own open transition
check("empty state lists something", await js(`return document.querySelectorAll(".dk-pal-row").length > 0`));
const rows = await js(`return document.querySelectorAll(".dk-pal-row").length`);
const first = await js(`return document.querySelector(".dk-pal-row.dk-selected")?.id`);
await key("ArrowDown");
check("arrow moves the selection", rows < 2 || await until(`document.querySelector(".dk-pal-row.dk-selected")?.id !== ${JSON.stringify(first)}`, 1000));
await type("a");
check("typing reaches the input", await until(`document.querySelector(".dk-pal input")?.value === "a"`, 1000));
check("typing shows Discord's results", await until(`document.querySelectorAll(".dk-pal-row").length > 0`));
await key("Escape");
check("esc clears the query", await until(`document.querySelector(".dk-pal input")?.value === ""`));
await type(">");
check("> lists actions", await until(`[...document.querySelectorAll(".dk-pal-row")].some(r => r.textContent.includes("Home"))`));
await key("Escape");
await until(`document.querySelector(".dk-pal input")?.value === ""`, 1000);
await key("Escape");
check("esc closes", await until(`!document.querySelector(".dk-pal")`, 3000));
check("switcher store closed", await js(`return !Vencord.Webpack.findStore("QuickSwitcherStore").isOpen()`));

// ── 5. Settings switch live ──
const S = "Vencord.Settings.plugins.Sidebar";
await go("/channels/@me");
await js(`${S}.enabled = false`);
check("sidebar off → Discord's rail and list", await until(`!document.querySelector("nav.dk-sb") && document.querySelector('nav[aria-label="Servers sidebar"]')`));
await js(`${S}.enabled = true`);
check("sidebar on again", await until(`document.querySelector("nav.dk-sb")`));
await js(`${S}.home = false`);
check("home off → Discord's Friends", await until(`!document.querySelector(".dk-home")`));
await js(`${S}.home = true`);
check("home on again", await until(`document.querySelector(".dk-home")`));

// ── 6. Errors ──
await sleep(300);
check("no errors from our code", errors.length === 0, errors.join("\n---\n"));

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
