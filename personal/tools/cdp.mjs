// Tiny Chrome DevTools Protocol client for a Discord started with --remote-debugging-port=9222.
//   node personal/tools/cdp.mjs eval "<js expression>"
//   node personal/tools/cdp.mjs shot out.png [width height]
//   node personal/tools/cdp.mjs clip out.png "<css selector>" [padding]
//   node personal/tools/cdp.mjs hover|click|rclick x y     node personal/tools/cdp.mjs key Escape
//   node personal/tools/cdp.mjs css theme.css   (hot-swap a theme without rebuilding)
// CDP_PORT=9223 targets our Vesktop instead (see vesktop-dev.ps1).
import { readFileSync, writeFileSync } from "node:fs";

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
} else if (cmd === "css") {
	// node cdp.mjs css file.css: hot-swap a theme file into the running app (until the next reload)
	const css = readFileSync(arg, "utf8");
	const header = css.match(/@name\s+(.+)/)?.[1]?.trim();
	const r = await send("Runtime.evaluate", {
		expression: `(() => {
			const css = ${JSON.stringify(css)};
			let el = [...document.querySelectorAll("style")].find((s) => s.textContent.includes(${JSON.stringify(`@name ${header}`)}));
			if (!el) { el = document.createElement("style"); document.head.append(el); }
			el.textContent = css;
			return "ok";
		})()`,
		returnByValue: true,
	});
	console.log("css", r.result.value);
} else if (cmd === "hover" || cmd === "click" || cmd === "rclick") {
	// node cdp.mjs hover|click|rclick x y: a real mouse event, for opening tooltips, menus, popouts
	const at = { x: +arg, y: +w };
	await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at });
	if (cmd !== "hover") {
		const button = cmd === "click" ? "left" : "right";
		await send("Input.dispatchMouseEvent", { type: "mousePressed", button, clickCount: 1, ...at });
		await send("Input.dispatchMouseEvent", { type: "mouseReleased", button, clickCount: 1, ...at });
	}
	console.log(cmd, at.x, at.y);
} else if (cmd === "key") {
	// node cdp.mjs key Escape
	for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: arg, code: arg, windowsVirtualKeyCode: arg === "Escape" ? 27 : 0 });
	console.log("key", arg);
} else if (cmd === "clip") {
	// node cdp.mjs clip out.png "<css selector>" [padding]: the element's box at 2x
	const pad = +(h ?? 8);
	const r = await send("Runtime.evaluate", {
		// first match that is fully on screen
		expression: `JSON.stringify([...document.querySelectorAll(${JSON.stringify(w)})].map((e) => e.getBoundingClientRect())
			.find((b) => b.width && b.top >= 0 && b.bottom <= innerHeight))`,
		returnByValue: true,
	});
	if (!r.result.value) throw new Error(`no element matches ${w}`);
	const b = JSON.parse(r.result.value);
	const clip = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: b.height + 2 * pad, scale: 2 };
	const { data } = await send("Page.captureScreenshot", { format: "png", clip });
	writeFileSync(arg, Buffer.from(data, "base64"));
	console.log("saved", arg);
}
ws.close();
