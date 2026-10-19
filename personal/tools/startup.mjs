// How long a reload takes to become usable: Discord's shell, our sidebar, the first messages.
// Reloads the page (a reload drops voice: it refuses while you're in a call).
//   CDP_PORT=9223 node personal/tools/startup.mjs [runs=3]
const runs = Number(process.argv[2] ?? 3);
const port = process.env.CDP_PORT || "9223";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
	for (let i = 0; i < 60; i++) {
		try {
			const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
			const page = targets.find(t => t.type === "page" && t.url.includes("discord.com"));
			if (page) {
				const ws = new WebSocket(page.webSocketDebuggerUrl);
				await new Promise((r, j) => { ws.addEventListener("open", r, { once: true }); ws.addEventListener("error", j, { once: true }); });
				let id = 0;
				const send = (method, params = {}) => new Promise(res => { const m = ++id; ws.addEventListener("message", function on(e) { const d = JSON.parse(e.data); if (d.id !== m) return; ws.removeEventListener("message", on); res(d.result); }); ws.send(JSON.stringify({ id: m, method, params })); });
				return { ws, send };
			}
		} catch { }
		await sleep(500);
	}
	throw new Error("no page");
}

// runs in the page before anything else: note when each thing first appears
const probe = `(() => {
	const t = window.__dkStartup = {};
	const mark = (k, ok) => { if (!t[k] && ok()) t[k] = Math.round(performance.now()); };
	const check = () => {
		mark("shell", () => document.querySelector('[class*="sidebar_"], [class*="guilds_"]'));
		mark("sidebar", () => document.querySelector("nav.dk-sb .dk-sb-row"));
		mark("messages", () => document.querySelector('[data-list-id="chat-messages"] li[id^="chat-messages-"]'));
		mark("vencord", () => window.Vencord?.Plugins?.plugins?.Sidebar?.started);
		if (!(t.shell && t.sidebar && t.messages && t.vencord)) requestAnimationFrame(check);
	};
	requestAnimationFrame(check);
})()`;

const results = [];
let { ws, send } = await connect();
const inCall = (await send("Runtime.evaluate", { expression: `!!Vencord.Webpack.findStore("VoiceStateStore").getVoiceStateForUser(Vencord.Webpack.Common.UserStore.getCurrentUser().id)`, returnByValue: true })).result.value;
if (inCall) { console.log("in a call: not reloading"); process.exit(1); }
// a read text channel he has opened, so "messages" means something
const path = (await send("Runtime.evaluate", { expression: `(() => { const C = Vencord.Webpack.Common, R = C.ReadStateStore; const c = Object.keys(Vencord.Settings.plugins.Sidebar.opened).map(id => C.ChannelStore.getChannel(id)).find(c => c?.guild_id && c.type === 0 && !R.hasUnread(c.id) && !R.getMentionCount(c.id)); return "/channels/" + c.guild_id + "/" + c.id; })()`, returnByValue: true })).result.value;
await send("Runtime.evaluate", { expression: `Vencord.Webpack.Common.NavigationRouter.transitionTo(${JSON.stringify(path)})` });
await sleep(1500);
for (let i = 0; i < runs; i++) {
	await send("Page.enable");
	const { identifier } = await send("Page.addScriptToEvaluateOnNewDocument", { source: probe });
	await send("Page.reload", { ignoreCache: false });
	ws.close();
	await sleep(1500);
	({ ws, send } = await connect());
	let t = {};
	for (let k = 0; k < 60 && !(t.shell && t.sidebar && t.messages && t.vencord); k++) { await sleep(500); t = (await send("Runtime.evaluate", { expression: "window.__dkStartup ?? {}", returnByValue: true }))?.result?.value ?? {}; }
	await send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => { });
	results.push(t);
	console.log(`run ${i + 1}: shell ${t.shell} ms · Vencord's plugins started ${t.vencord} · sidebar ${t.sidebar} · first messages ${t.messages}`);
	await sleep(3000);
}
const med = k => results.map(r => r[k]).filter(Boolean).sort((a, b) => a - b)[results.length >> 1];
console.log(`median: shell ${med("shell")} · plugins ${med("vencord")} · sidebar ${med("sidebar")} · messages ${med("messages")} ms`);
ws.close();
