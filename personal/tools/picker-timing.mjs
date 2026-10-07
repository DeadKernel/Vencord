// How long the screen-share picker takes to appear, on the real path Discord uses (getDisplayMedia →
// Vesktop's request handler → desktopCapturer → picker), and how long the large preview takes.
// Read-only: it opens the picker and cancels it; nothing is shared.
//   CDP_PORT=9223 node personal/tools/picker-timing.mjs [runs]
const port = process.env.CDP_PORT || "9223";
const runs = +(process.argv[2] ?? 3);
const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = targets.find(t => t.type === "page" && t.url.includes("discord.com"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0;
const js = (expression, userGesture = false) => new Promise((resolve, reject) => {
	const msgId = ++id;
	ws.addEventListener("message", function on(ev) {
		const m = JSON.parse(ev.data); if (m.id !== msgId) return; ws.removeEventListener("message", on);
		const r = m.result;
		r?.exceptionDetails ? reject(new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)) : resolve(r?.result?.value);
	});
	ws.send(JSON.stringify({ id: msgId, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true, userGesture } }));
});

const picker = `[...document.querySelectorAll('[role="dialog"]')].find(d => /Screen Share Picker/i.test(d.textContent))`;
for (let i = 0; i < runs; i++) {
	const r = await js(`(async () => {
		const t0 = performance.now();
		const gdm = navigator.mediaDevices.getDisplayMedia({ video: true }).then(s => { s.getTracks().forEach(t => t.stop()); return "shared?!"; }, e => "cancelled");
		while (!(${picker})) { if (performance.now() - t0 > 20000) return { timeout: true }; await new Promise(r => setTimeout(r, 10)); }
		const shown = performance.now() - t0;
		const d = ${picker};
		const sources = d.querySelectorAll("img").length;
		// paint: wait until the thumbnails have decoded
		await Promise.all([...d.querySelectorAll("img")].map(im => im.decode().catch(() => {})));
		const painted = performance.now() - t0;
		// the large preview the next step asks for (one source, captured with every other at 1080p)
		d.querySelector('[aria-label="Close"], button[class*="close"]')?.click() ?? document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		const outcome = await gdm;
		return { shown: Math.round(shown), painted: Math.round(painted), sources, outcome };
	})()`, true);
	console.log(`run ${i + 1}: picker shown after ${r.shown} ms, thumbnails painted at ${r.painted} ms, ${r.sources} sources, ${r.outcome}`);
	await new Promise(r => setTimeout(r, 1000));
}
// the large preview, timed on its own (Vesktop passes a source id; any screen id works)
const big = await js(`(async () => {
	const ids = ["screen:0:0", "screen:1:0"];
	const t0 = performance.now();
	const url = await VesktopNative.capturer.getLargeThumbnail(ids[0]).catch(() => null);
	return { ms: Math.round(performance.now() - t0), ok: !!url };
})()`);
console.log(`large preview (getLargeThumbnail): ${big.ms} ms, ${big.ok ? "ok" : "no image"}`);
ws.close();
