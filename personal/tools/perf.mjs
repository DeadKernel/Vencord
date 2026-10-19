// CPU profile of the running app over a window, attributed to Vencord (ours and stock plugins)
// versus Discord. Optional JS runs at the start of the window (a scenario: switch channels...).
//   CDP_PORT=9223 node personal/tools/perf.mjs [seconds=10] [scenario.js]
// Prints total busy time, the split, and the hottest Vencord functions (self time).
import { readFileSync } from "node:fs";

const seconds = Number(process.argv[2] ?? 10);
const scenario = process.argv[3] ? readFileSync(process.argv[3], "utf8") : null;
const port = process.env.CDP_PORT || "9223";
const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = targets.find(t => t.type === "page" && t.url.includes("discord.com"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0;
const send = (method, params = {}) => new Promise(res => { const m = ++id; ws.addEventListener("message", function on(e) { const d = JSON.parse(e.data); if (d.id !== m) return; ws.removeEventListener("message", on); res(d.result ?? d.error); }); ws.send(JSON.stringify({ id: m, method, params })); });

await send("Profiler.enable");
await send("Profiler.setSamplingInterval", { interval: 500 });
await send("Profiler.start");
const t0 = Date.now();
if (scenario) {
	const r = await send("Runtime.evaluate", { expression: `(async () => { ${scenario} })()`, awaitPromise: true, returnByValue: true });
	if (r?.exceptionDetails) console.log("scenario error:", r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
	else if (r?.result?.value !== undefined) console.log("scenario:", JSON.stringify(r.result.value));
}
const left = seconds * 1000 - (Date.now() - t0);
if (left > 0) await new Promise(r => setTimeout(r, left));
const { profile } = await send("Profiler.stop");
ws.close();

// self time per node from samples
const dt = new Map();
for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const kind = n => {
	const u = n.callFrame.url;
	if (/vencord/i.test(u)) return "vencord";
	if (!u) return n.callFrame.functionName === "(idle)" ? "idle" : n.callFrame.functionName === "(program)" ? "program" : n.callFrame.functionName === "(garbage collector)" ? "gc" : "native";
	return "discord";
};
const by = {}, fns = new Map();
for (const [nid, us] of dt) {
	const n = nodes.get(nid), k = kind(n);
	by[k] = (by[k] ?? 0) + us;
	if (k === "vencord") {
		const key = `${n.callFrame.functionName || "(anon)"} @${n.callFrame.lineNumber}`;
		fns.set(key, (fns.get(key) ?? 0) + us);
	}
}
// inclusive time of Vencord frames: Discord work triggered from our code (renders, store reads)
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
let underVencord = 0;
for (const [nid, us] of dt) {
	for (let p = nid; p !== undefined; p = parent.get(p)) if (kind(nodes.get(p)) === "vencord") { underVencord += us; break; }
}
const ms = us => (us / 1000).toFixed(0).padStart(6) + " ms";
const total = seconds * 1000;
console.log(`window ${seconds}s`);
for (const k of ["discord", "vencord", "native", "gc", "program", "idle"]) console.log(`  ${k.padEnd(8)} ${ms(by[k] ?? 0)}`);
console.log(`  busy     ${ms((by.discord ?? 0) + (by.vencord ?? 0) + (by.native ?? 0) + (by.gc ?? 0) + (by.program ?? 0))}  (${(100 * ((by.discord ?? 0) + (by.vencord ?? 0) + (by.native ?? 0) + (by.gc ?? 0)) / 1000 / total).toFixed(1)}% of the window, excl. program)`);
console.log(`  inside a Vencord call (incl. what it calls): ${ms(underVencord)}`);
console.log("hottest Vencord functions (self):");
for (const [k, us] of [...fns].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${ms(us)}  ${k}`);
