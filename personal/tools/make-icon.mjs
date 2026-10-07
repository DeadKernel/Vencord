// DeadKernel's app icon: Discord's mark (Simple Icons, CC0) in the HumanLayer accent on its
// background, a dark square with a thin border. Distinct from the real Discord app's blurple icon
// sitting next to it on the taskbar. Drawn by the running client's canvas (CDP), so no image tools.
//   CDP_PORT=9223 node personal/tools/make-icon.mjs [vesktopDir]
// Writes <vesktop>/static/deadkernel/{icon.svg,icon.png,icon.ico}, and the tray icons into the
// DeadKernel profile's userAssets (Vesktop's own "custom tray icon" slot).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const vesktop = resolve(process.argv[2] ?? join(import.meta.dirname, "..", "..", "..", "vesktop"));
const port = process.env.CDP_PORT || "9223";
const BG = "#1b1e28", BORDER = "#303340", ACCENT = "#add7ff", PINK = "#f087bd";
const MARK = "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z";

/** The icon at `size` px: the tile fills it; the mark is 60% wide (72% at 16-24px, where the tile
 * border would only be noise). `dot`: the tray's unread variant. */
const draw = (size, { tile = true, dot = false } = {}) => `
	const s = ${size}, c = document.createElement("canvas"); c.width = c.height = s; const g = c.getContext("2d");
	const small = s <= 24, r = Math.max(1, Math.round(s * 0.12));
	if (${tile}) {
		g.beginPath(); g.roundRect(0, 0, s, s, r); g.fillStyle = "${BG}"; g.fill();
		if (!small) { const w = Math.max(1, Math.round(s / 64)); g.beginPath(); g.roundRect(w / 2, w / 2, s - w, s - w, r); g.lineWidth = w; g.strokeStyle = "${BORDER}"; g.stroke(); }
	}
	const k = (small ? 0.72 : 0.6) * s / 24, off = (s - 24 * k) / 2;
	g.save(); g.translate(off, off + k * 0.6); g.scale(k, k); g.fillStyle = "${ACCENT}"; g.fill(new Path2D(${JSON.stringify(MARK)})); g.restore();
	if (${dot}) { const d = s * 0.3; g.beginPath(); g.arc(s - d / 2, d / 2, d / 2, 0, 7); g.fillStyle = "${PINK}"; g.fill(); g.lineWidth = Math.max(1, s / 16); g.strokeStyle = "${BG}"; g.stroke(); }
	return c.toDataURL("image/png").split(",")[1];`;

const targets = await (await fetch(`http://localhost:${port}/json/list`)).json();
const page = targets.find(t => t.type === "page" && t.url.includes("discord.com"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0;
const png = body => new Promise((resolve, reject) => {
	const msgId = ++id;
	ws.addEventListener("message", function on(ev) {
		const m = JSON.parse(ev.data); if (m.id !== msgId) return; ws.removeEventListener("message", on);
		m.result?.exceptionDetails || m.error ? reject(new Error(JSON.stringify(m.error ?? m.result.exceptionDetails))) : resolve(Buffer.from(m.result.result.value, "base64"));
	});
	ws.send(JSON.stringify({ id: msgId, method: "Runtime.evaluate", params: { expression: `(() => { ${body} })()`, returnByValue: true, awaitPromise: true } }));
});

/** An .ico of PNG entries (Vista+), largest last as Windows prefers it. */
function ico(images) {
	const head = Buffer.alloc(6 + 16 * images.length);
	head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
	let offset = head.length;
	images.forEach(({ size, data }, i) => {
		const e = 6 + 16 * i;
		head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
		head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
		head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
		offset += data.length;
	});
	return Buffer.concat([head, ...images.map(i => i.data)]);
}

const out = join(vesktop, "static", "deadkernel");
mkdirSync(out, { recursive: true });
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const images = [];
for (const size of sizes) images.push({ size, data: await png(draw(size)) });
writeFileSync(join(out, "icon.ico"), ico(images));
writeFileSync(join(out, "icon.png"), images.at(-1).data);
writeFileSync(join(out, "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="1" y="1" width="254" height="254" rx="31" fill="${BG}" stroke="${BORDER}" stroke-width="2"/><g transform="translate(51.2 56.96) scale(6.4)"><path fill="${ACCENT}" d="${MARK}"/></g></svg>\n`);

// the tray: Vesktop takes a custom tray icon from the profile's userAssets (no extension)
const assets = join(process.env.APPDATA, "vesktop-deadkernel", "userAssets");
mkdirSync(assets, { recursive: true });
writeFileSync(join(assets, "tray"), await png(draw(32)));
writeFileSync(join(assets, "trayUnread"), await png(draw(32, { dot: true })));
// the sizes side by side on a dark and a light taskbar, to look at (not shipped)
mkdirSync(join(process.env.USERPROFILE, ".t3", "data", "shots"), { recursive: true });
writeFileSync(join(process.env.USERPROFILE, ".t3", "data", "shots", "icon-preview.png"), await png(`
	const sizes = [16, 24, 32, 48, 256]; const c = document.createElement("canvas"); c.width = 460; c.height = 300; const g = c.getContext("2d");
	g.fillStyle = "#202020"; g.fillRect(0, 0, 460, 150); g.fillStyle = "#f3f3f3"; g.fillRect(0, 150, 460, 150);
	return new Promise(done => { let x = 10; const imgs = ${JSON.stringify(images.filter(i => [16, 24, 32, 48, 128].includes(i.size)).map(i => [i.size, i.data.toString("base64")]))};
		let n = 0; for (const [s, b] of imgs) { const im = new Image(); const at = x; x += s + 16; im.onload = () => { g.drawImage(im, at, 75 - s / 2); g.drawImage(im, at, 225 - s / 2); if (++n === imgs.length) done(c.toDataURL().split(",")[1]); }; im.src = "data:image/png;base64," + b; } });`));
console.log(`wrote ${out}\\icon.{ico,png,svg} (${sizes.join(", ")}) and tray icons in ${assets}`);
ws.close();
