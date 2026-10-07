// WCAG contrast check of every visible piece of text on screen (or inside a selector), against the
// background it actually sits on (the nearest painted ancestor, layered over the page).
//   CDP_PORT=9223 node personal/tools/contrast.mjs ["css selector"] [--all]
// Fails text under 4.5:1 (3:1 when large: 24px, or 18.66px bold). Disabled controls are listed but
// not failed (WCAG exempts them). Reports each distinct problem once, worst first.
import { auditExpr } from "./contrast-audit.mjs";

const port = process.env.CDP_PORT || "9223";
const args = process.argv.slice(2);
const root = args.find(a => !a.startsWith("--")) ?? "body";
const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = targets.find(t => t.type === "page" && t.url.includes("discord.com"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
const send = (method, params) => new Promise(res => {
	ws.addEventListener("message", function on(e) { const d = JSON.parse(e.data); if (d.id !== 1) return; ws.removeEventListener("message", on); res(d.result); });
	ws.send(JSON.stringify({ id: 1, method, params }));
});

const audit = auditExpr(`document.querySelector(${JSON.stringify(root)})`);

const { result } = await send("Runtime.evaluate", { expression: audit, returnByValue: true });
const rows = result.value ?? [];
const failing = rows.filter(r => r.ratio < r.need && !r.disabled);
const disabled = rows.filter(r => r.ratio < r.need && r.disabled);
for (const r of (args.includes("--all") ? rows : failing)) console.log(`${r.ratio < r.need ? "FAIL" : "ok  "} ${String(r.ratio).padStart(5)}:1 (needs ${r.need})  ${r.fg} on ${r.bg}  "${r.text}"  ${r.where}${r.count > 1 ? `  ×${r.count}` : ""}`);
if (disabled.length) console.log(`\n${disabled.length} low-contrast disabled control(s), exempt: ${disabled.slice(0, 3).map(r => `"${r.text}" ${r.ratio}:1`).join(", ")}`);
console.log(`\n${rows.length} distinct text styles checked in ${root}; ${failing.length} fail`);
ws.close();
process.exit(failing.length ? 1 : 0);
