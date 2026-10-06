// Builds this Vencord and zips what a friend needs to try it in their own Vesktop.
//   node personal/tools/pack-friends.mjs [--no-build]
// Output: dist/share/DeadKernel-<date>.zip (dist/ is gitignored). Nothing is uploaded or sent:
// sharing the zip is his call.
//
// Privacy check before zipping: every id in his dev profile's plugin settings (favourites, opened
// channels, servers) must be absent from the bundle, and so must his account name. The build has
// none by design; this proves it for each zip.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = join(repo, "dist");

if (!process.argv.includes("--no-build")) {
	execFileSync("pnpm", ["build", "--disable-updater"], { cwd: repo, stdio: "inherit", shell: true });
}

const files = ["vencordDesktopMain.js", "vencordDesktopPreload.js", "vencordDesktopRenderer.js", "vencordDesktopRenderer.css",
	"vencordDesktopMain.js.LEGAL.txt", "vencordDesktopRenderer.js.LEGAL.txt"];
for (const f of files) if (!existsSync(join(dist, f))) throw new Error(`missing ${f}: build first`);

// ── privacy check ──
const appData = process.env.APPDATA ?? join(homedir(), process.platform === "darwin" ? "Library/Application Support" : ".config");
const profile = join(appData, "vesktop-deadkernel", "settings", "settings.json");
const secrets = new Set();
if (existsSync(profile)) {
	const s = JSON.parse(readFileSync(profile, "utf8"));
	const sb = s.plugins?.Sidebar ?? {};
	for (const [account, favs] of Object.entries(sb.favorites ?? {})) {
		secrets.add(account);
		for (const f of favs) secrets.add(f.id);
	}
	for (const k of ["opened", "showAll", "openFolders"]) for (const id of Object.keys(sb[k] ?? {})) if (/^\d{15,}$/.test(id)) secrets.add(id);
}
for (const extra of (process.env.DK_PRIVATE ?? "SatanClaus").split(",")) if (extra) secrets.add(extra);
const bundle = files.filter(f => /\.(js|css)$/.test(f)).map(f => readFileSync(join(dist, f), "utf8")).join("\n");
const leaks = [...secrets].filter(s => bundle.includes(s));
if (leaks.length) throw new Error(`the bundle contains ${leaks.length} private value(s); not packing`);
console.log(`privacy check: ${secrets.size} private values, none in the bundle`);

// ── zip ──
const stamp = new Date().toISOString().slice(0, 10);
const stage = join(dist, "share", `DeadKernel-${stamp}`);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of files) copyFileSync(join(dist, f), join(stage, f));
// Vesktop writes this next to the Vencord files it downloads (keeps Node treating them as CommonJS)
writeFileSync(join(stage, "package.json"), "{}");
writeFileSync(join(stage, "README.txt"), readFileSync(join(repo, "personal", "FRIENDS.md"), "utf8"));
const zip = `${stage}.zip`;
rmSync(zip, { force: true });
// Windows' own tar (bsdtar) writes zips; Git Bash's GNU tar doesn't
const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
execFileSync(tar, ["-a", "-c", "-f", zip, "-C", join(dist, "share"), `DeadKernel-${stamp}`]);
console.log(`packed ${zip}`);
