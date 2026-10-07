// WCAG contrast audit, shared by contrast.mjs (one screen) and sweep.mjs (every surface it opens).
// auditExpr(rootExpr) is a page-side expression: rootExpr evaluates to the element to check.
// Each distinct text style once: { where, text, fg, bg, ratio, need, disabled, count }, worst first.
export const auditExpr = (rootExpr) => `(() => {
	const parse = c => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
	// color-mix / oklch etc. resolve through a canvas
	const ctx = document.createElement("canvas").getContext("2d");
	const resolve = c => { if (/^rgb/.test(c)) return parse(c); ctx.fillStyle = "#000"; ctx.fillStyle = c; const v = ctx.fillStyle; if (v.startsWith("#")) { const n = parseInt(v.slice(1), 16); return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255, a: 1 }; } return parse(v); };
	const over = (top, under) => { const a = top.a + under.a * (1 - top.a); return a === 0 ? under : { r: (top.r * top.a + under.r * under.a * (1 - top.a)) / a, g: (top.g * top.a + under.g * under.a * (1 - top.a)) / a, b: (top.b * top.a + under.b * under.a * (1 - top.a)) / a, a }; };
	const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const hex = c => "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
	const bgOf = el => {
		const layers = [];
		for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
			const s = getComputedStyle(e);
			const c = resolve(s.backgroundColor);
			if (c && c.a > 0) { layers.push({ ...c, a: c.a * Number(s.opacity) }); if (c.a >= 1 && Number(s.opacity) >= 1) break; }
		}
		let bg = { r: 0, g: 0, b: 0, a: 1 };
		const page = resolve(getComputedStyle(document.body).backgroundColor);
		if (page && page.a > 0) bg = { ...page, a: 1 };
		for (const l of layers.reverse()) bg = over(l, bg);
		return bg;
	};
	const label = e => { const cls = String(e.className?.baseVal ?? e.className).split(/\\s+/).filter(Boolean).map(c => c.replace(/_[0-9a-z]{4,}$/i, "")).slice(0, 2).join("."); return e.tagName.toLowerCase() + (cls ? "." + cls : ""); };
	const out = new Map();
	const scope = (${rootExpr}) ?? document.body;
	const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const text = n.textContent.trim();
		if (!text || !/[\\p{L}\\p{N}]/u.test(text)) continue;
		const el = n.parentElement; if (!el) continue;
		const r = el.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2 || r.bottom < 0 || r.top > innerHeight) continue;
		// screen-reader-only text is never seen (Discord's hiddenVisually: clipped to a pixel)
		if (el.closest('[class*="hiddenVisually"], .sr-only, [class*="ddrArrows"]')) continue;
		const s = getComputedStyle(el);
		if (s.visibility === "hidden" || Number(s.opacity) < 0.05) continue;
		let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
		if (op < 0.05) continue;
		const fg0 = resolve(s.color); if (!fg0) continue;
		const bg = bgOf(el);
		const fg = over({ ...fg0, a: fg0.a * op }, bg);
		const cr = ratio(fg, bg);
		const size = parseFloat(s.fontSize), bold = Number(s.fontWeight) >= 700;
		const large = size >= 24 || (bold && size >= 18.66);
		const need = large ? 3 : 4.5;
		const disabled = !!el.closest("[disabled], [aria-disabled=true]");
		const key = label(el) + "|" + hex(fg) + "|" + hex(bg);
		if (!out.has(key)) out.set(key, { where: label(el.parentElement ?? el) + " > " + label(el), text: text.slice(0, 40), fg: hex(fg), bg: hex(bg), ratio: Math.round(cr * 100) / 100, need, disabled, count: 0 });
		out.get(key).count++;
	}
	return [...out.values()].sort((a, b) => a.ratio / a.need - b.ratio / b.need);
})()`;
