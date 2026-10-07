// WCAG contrast of every palette's text tokens against its surfaces (personal/themes and
// src/deadkernel/theme/palettes.css), and the nearest passing colour (same hue, only lightness
// moved) for any that fail. Offline: reads the CSS files.
//   node personal/tools/palette-contrast.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
const theme = readFileSync(join(here, "../themes/humanlayer/HumanLayer.theme.css"), "utf8");
const palettes = readFileSync(join(here, "../../src/deadkernel/theme/palettes.css"), "utf8");

const tokens = block => Object.fromEntries([...block.matchAll(/--hl-([\w-]+):\s*(#[0-9a-f]{3,6})\b/gi)].map(m => [m[1], m[2].toLowerCase()]));
// the theme's colour tokens: the :root block that defines --hl-bg
const rootAt = theme.lastIndexOf(":root {", theme.indexOf("--hl-bg:"));
const sets = { poimandres: tokens(theme.slice(rootAt, theme.indexOf("}", rootAt))) };
for (const m of palettes.matchAll(/data-dk-palette="(\w+)"\]\s*\{([^}]*)\}/g)) sets[m[1]] = { ...sets.poimandres, ...tokens(m[2]) };

const rgb = h => { h = h.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join(""); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = rgb(c).map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const toHsl = h => { let [r, g, b] = rgb(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6; } return [hh, s, l]; };
const fromHsl = ([h, s, l]) => { const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return "#" + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join(""); };
/** the closest colour of the same hue and saturation that reaches `need` on every surface */
function nearest(fg, surfaces, need) {
	const [h, s, l] = toHsl(fg);
	const dark = lum(surfaces[0]) < 0.2;
	for (let i = 0; i <= 100; i++) {
		const c = fromHsl([h, s, Math.min(1, Math.max(0, l + (dark ? 1 : -1) * i / 200))]);
		if (surfaces.every(bg => ratio(c, bg) >= need)) return c;
	}
	return null;
}

// what's read where: text on the page, raised panels and hovered rows; dim text at least on page
// and panels; dark text on accent and pink fills (selected options, badges)
const rules = [
	["text", ["bg", "bg-raised", "bg-hover"]],
	["text-2", ["bg", "bg-raised", "bg-hover"]],
	["text-muted", ["bg", "bg-raised"]],
	["accent", ["bg", "bg-raised"]],
	["pink", ["bg", "bg-raised"]],
	["teal", ["bg", "bg-raised"]],
	["yellow", ["bg", "bg-raised"]],
	["bg", ["accent", "pink", "teal"]]
];
let failing = 0;
for (const [name, t] of Object.entries(sets)) {
	const out = [];
	for (const [fg, surfaces] of rules) {
		if (!t[fg]) continue;
		const ratios = surfaces.filter(s => t[s]).map(s => [s, ratio(t[fg], t[s])]);
		const worst = Math.min(...ratios.map(r => r[1]));
		if (worst >= 4.5) continue;
		failing++;
		const fix = fg === "bg" ? null : nearest(t[fg], surfaces.map(s => t[s]).filter(Boolean), 4.5);
		out.push(`  ${fg.padEnd(10)} ${t[fg]}  ${ratios.map(([s, r]) => `${s} ${r.toFixed(2)}`).join(", ")}${fix ? `  → ${fix}` : ""}`);
	}
	console.log(`${name}: ${out.length ? "\n" + out.join("\n") : "all pass"}`);
}
process.exit(failing ? 1 : 0);
