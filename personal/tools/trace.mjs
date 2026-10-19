// Rendering cost over a scenario: total style recalculation, layout, paint and script time from a
// Chrome trace. With "nocss", Vencord's styles (ours and plugins') are switched off for the run and
// restored after, to see what our CSS costs.
//   CDP_PORT=9223 node personal/tools/trace.mjs scenario.js [nocss]
import { readFileSync } from "node:fs";

const scenario = readFileSync(process.argv[2], "utf8");
const nocss = process.argv[3] === "nocss";
const port = process.env.CDP_PORT || "9223";
const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = targets.find(t => t.type === "page" && t.url.includes("discord.com"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0;
const events = [];
let done;
ws.addEventListener("message", e => { const d = JSON.parse(e.data); if (d.method === "Tracing.dataCollected") events.push(...d.params.value); if (d.method === "Tracing.tracingComplete") done(); });
const send = (method, params = {}) => new Promise(res => { const m = ++id; ws.addEventListener("message", function on(e) { const d = JSON.parse(e.data); if (d.id !== m) return; ws.removeEventListener("message", on); res(d.result ?? d.error); }); ws.send(JSON.stringify({ id: m, method, params })); });
const js = async body => (await send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true }))?.result?.value;

const STYLES = `[...document.querySelectorAll("vencord-managed-styles style, style[id^=vc-], link[href*=vencord]")]`;
if (nocss) await js(`${STYLES}.forEach(s => s.disabled = true); window.__dkNoCss = true`);
try {
	await send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline", transferMode: "ReportEvents" });
	const r = await js(scenario);
	console.log("scenario:", JSON.stringify(r));
	const finished = new Promise(r => { done = r; });
	await send("Tracing.end");
	await finished;
} finally {
	if (nocss) await js(`${STYLES}.forEach(s => s.disabled = false); delete window.__dkNoCss`);
	ws.close();
}
const main = events.find(e => e.name === "TracingStartedInBrowser")?.args?.data?.frames?.find(f => !f.parent)?.processId;
const sum = {};
for (const e of events) {
	if (e.ph !== "X" || (main && e.pid !== main)) continue;
	const k = { UpdateLayoutTree: "style", RecalculateStyles: "style", Layout: "layout", Paint: "paint", PrePaint: "paint", FunctionCall: "script", EvaluateScript: "script", TimerFire: "script", FireAnimationFrame: "script" }[e.name];
	if (k) sum[k] = (sum[k] ?? 0) + (e.dur ?? 0) / 1000;
}
const longStyle = events.filter(e => e.ph === "X" && (e.name === "UpdateLayoutTree") && e.dur > 16000).length;
console.log(Object.entries(sum).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join("  ·  "), ` · style passes over 16 ms: ${longStyle}`);
