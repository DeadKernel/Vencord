// Tiny Chrome DevTools Protocol client for a Discord started with --remote-debugging-port=9222.
//   node personal/tools/cdp.mjs eval "<js expression>"
//   node personal/tools/cdp.mjs shot out.png [width height]
// CDP_PORT=9223 targets our Vesktop instead (see vesktop-dev.ps1).
import { writeFileSync } from "node:fs";

const [cmd, arg, w, h] = process.argv.slice(2);
const port = process.env.CDP_PORT || "9222";
const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = targets.find((t) => t.type === "page" && t.url.includes("discord.com"));
if (!page) throw new Error(`no Discord page target on :${port}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const send = (method, params = {}) =>
	new Promise((resolve, reject) => {
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

if (cmd === "eval") {
	const r = await send("Runtime.evaluate", { expression: arg, awaitPromise: true, returnByValue: true });
	if (r.exceptionDetails) console.error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
	else console.log(typeof r.result.value === "string" ? r.result.value : JSON.stringify(r.result.value, null, 1));
} else if (cmd === "shot") {
	if (w) await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
	const { data } = await send("Page.captureScreenshot", { format: "png" });
	if (w) await send("Emulation.clearDeviceMetricsOverride");
	writeFileSync(arg, Buffer.from(data, "base64"));
	console.log("saved", arg);
}
ws.close();
