// Reports which selectors in a CSS file match nothing on the current Discord page, so stale
// class names show up after a Discord update. Run it on a few pages (DMs, a server channel,
// settings): a selector only matters on pages where its element exists.
//   CDP_PORT=9223 node personal/tools/selector-check.mjs [css file] [--all]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? join(here, "../themes/humanlayer/HumanLayer.theme.css");
const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// Rule selectors (skip at-rules and the variable blocks on :root / .theme-*).
const selectors = new Set();
for (const m of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
	const prelude = m[1].trim();
	if (prelude.startsWith("@")) continue;
	for (const s of prelude.split(/,(?![^(]*\))/)) {
		const sel = s.trim();
		if (sel && !/^(:root|\.theme-|::)/.test(sel)) selectors.add(sel);
	}
}

// Drop dynamic pseudo-classes so hover/focus rules can be checked statically.
const expr = `(() => {
	const out = [];
	for (const raw of ${JSON.stringify([...selectors])}) {
		const sel = raw.replace(/::?(hover|focus-within|focus|active|before|after|selection|-webkit-scrollbar-thumb)\\b/g, "") || "*";
		let n; try { n = document.querySelectorAll(sel).length; } catch { n = -1; }
		out.push([n, raw]);
	}
	return JSON.stringify({ url: location.pathname.replace(/\\d{6,}/g, "<id>"), out });
})()`;

const res = JSON.parse(execFileSync("node", [join(here, "cdp.mjs"), "eval", expr], { encoding: "utf8" }));
console.log(`page: ${res.url}`);
for (const [n, sel] of res.out) {
	if (n === 0 || n === -1 || args.includes("--all")) console.log(`${n === -1 ? "INVALID" : String(n).padStart(4)}  ${sel}`);
}
