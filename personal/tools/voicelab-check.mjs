// Runs the voice lab end to end without a microphone: getUserMedia is swapped for a synthetic
// source (440 Hz + 12 kHz tones and a little noise) for the duration, then restored. Checks every
// version is produced, the encoders send near their target bitrates, the analysis sees the 12 kHz
// tone, and versions line up. CDP_PORT=9223 node personal/tools/voicelab-check.mjs
const port = process.env.CDP_PORT || "9223";
const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = targets.find(t => t.type === "page" && t.url.includes("discord.com"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0;
const send = (method, params = {}) => new Promise(res => { const m = ++id; ws.addEventListener("message", function on(e) { const d = JSON.parse(e.data); if (d.id !== m) return; ws.removeEventListener("message", on); res(d.result); }); ws.send(JSON.stringify({ id: m, method, params })); });
const js = async body => { const r = await send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`); };

await send("Emulation.setFocusEmulationEnabled", { enabled: true });
try {
	await js(`
		const md = navigator.mediaDevices;
		window.__dkRealGUM = md.getUserMedia.bind(md);
		md.getUserMedia = async () => {
			const ctx = new AudioContext({ sampleRate: 48000 }); (window.__dkFakeCtx ??= []).push(ctx);
			const dest = ctx.createMediaStreamDestination(); dest.channelCount = 1;
			for (const [f, g] of [[440, 0.3], [12000, 0.05]]) { const o = ctx.createOscillator(); o.frequency.value = f; const gn = ctx.createGain(); gn.gain.value = g; o.connect(gn).connect(dest); o.start(); }
			const n = ctx.createBufferSource(), b = ctx.createBuffer(1, 48000, 48000), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.003;
			n.buffer = b; n.loop = true; n.connect(dest); n.start();
			return dest.stream;
		};
		Vencord.Plugins.plugins.Sidebar && 1;`);
	// open the lab from Ctrl K's action (the real entry point): ">" then the action's name, Enter
	await js(`Vencord.Webpack.mapMangledModule('type:"QUICKSWITCHER_SEARCH"', { show: Vencord.Webpack.filters.byCode('"KEYBIND"') }).show("KEYBIND", "")`);
	for (let i = 0; i < 20 && !(await js(`return !!document.activeElement?.closest(".dk-pal")`)); i++) await sleep(100);
	await send("Input.insertText", { text: ">Voice lab" });
	await sleep(400);
	check("Ctrl K › > lists Voice lab", await js(`return [...document.querySelectorAll(".dk-pal-row")].some(r => r.textContent.includes("Voice lab"))`));
	for (const type of ["rawKeyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
	check("it opens the lab", await (async () => { for (let i = 0; i < 30; i++) { if (await js(`return !!document.querySelector(".dk-lab")`)) return true; await sleep(100); } return false; })());
	await js(`document.querySelector('[data-dk-action="lab-record"]').click()`);
	let done = false;
	for (let i = 0; i < 40 && !done; i++) { await sleep(500); done = await js(`return document.querySelectorAll("[data-dk-variant]").length >= 4 || !!document.querySelector(".dk-lab-error")`); }
	const result = await js(`return { error: document.querySelector(".dk-lab-error")?.textContent ?? null, capture: [...document.querySelectorAll(".dk-lab-row")].map(r => r.textContent).join(" | "),
		rows: [...document.querySelectorAll("[data-dk-variant]")].map(b => ({ key: b.dataset.dkVariant, text: b.textContent })) }`);
	check("records and produces all four versions", !result.error && result.rows.length === 4, result.error ?? JSON.stringify(result.rows.map(r => r.key)));
	for (const r of result.rows) console.log(`      ${r.text}`);
	const sent = Object.fromEntries(result.rows.map(r => [r.key, Number(/sent (\d+) kbps/.exec(r.text)?.[1] ?? 0)]));
	const top = Object.fromEntries(result.rows.map(r => [r.key, Number(/up to ([\d.]+) kHz/.exec(r.text)?.[1] ?? 0)]));
	check("High fidelity actually sends far more than Discord-now", sent.hifi > sent.now * 1.5, JSON.stringify(sent));
	check("Max sends more than High fidelity", sent.max >= sent.hifi, JSON.stringify(sent));
	check("the analysis sees the 12 kHz tone in the raw recording", top.raw >= 11.5, JSON.stringify(top));
	// A/B: playing one, then switching, keeps one source playing
	await js(`document.querySelector('[data-dk-variant="hifi"]').click()`);
	await sleep(300);
	await js(`document.querySelector('[data-dk-variant="now"]').click()`);
	check("switching versions marks the one you hear", await js(`return document.querySelector('[data-dk-variant="now"]').hasAttribute("data-on") && !document.querySelector('[data-dk-variant="hifi"]').hasAttribute("data-on")`));
} finally {
	await js(`if (window.__dkRealGUM) { navigator.mediaDevices.getUserMedia = window.__dkRealGUM; delete window.__dkRealGUM; } (window.__dkFakeCtx ?? []).forEach(c => c.close()); delete window.__dkFakeCtx; return 1`).catch(() => {});
	await js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return 1`).catch(() => {});
	const restored = await js(`return navigator.mediaDevices.getUserMedia.toString().includes("native code")`).catch(() => false);
	check("the real microphone is restored", restored);
	await send("Emulation.setFocusEmulationEnabled", { enabled: false });
	ws.close();
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
