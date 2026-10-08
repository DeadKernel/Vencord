/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Voice lab: hear what you sound like on Discord, against what your mic actually delivers, before
// changing anything. Records once (raw, and with Discord's processing, at the same moment), runs it
// through real Opus encoders on this machine (WebRTC loopback, the codec and stack Discord's voice
// uses), and plays the versions back in sync: switching (1-4) keeps your place, so differences are
// heard, not remembered. Also reports the capture chain (rate, channels) and, per version, level,
// noise floor and how high the frequencies reach. Nothing leaves this machine.

import { enableStyle } from "@api/Styles";
import { ChannelStore, MediaEngineStore, Modal, openModal, SelectedChannelStore, useEffect, useRef, useState } from "@webpack/common";

import { settings } from "./settings";
import { track } from "./telemetry";
import style from "./voicelab.css?managed";

const SECONDS = 8;
const RATE = 48000;

interface Variant {
    key: string;
    label: string;
    detail: string;
    pcm: Float32Array[]; // per channel
    stats?: Stats;
    sentKbps?: number;
}

interface Stats { peak: number; noise: number; topHz: number; clipped: number; }

const db = (v: number) => (v <= 0 ? -120 : 20 * Math.log10(v));

/** Peak, noise floor (the quietest tenth of 50ms windows), clipping, and the highest frequency
 * band with real energy (an averaged spectrum: band-limiting shows here). */
function analyse(pcm: Float32Array): Stats {
    let peak = 0, clipped = 0;
    for (const v of pcm) { const a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.999) clipped++; }
    const win = RATE / 20, rms: number[] = [];
    for (let i = 0; i + win <= pcm.length; i += win) {
        let s = 0; for (let j = i; j < i + win; j++) s += pcm[j] * pcm[j];
        rms.push(Math.sqrt(s / win));
    }
    rms.sort((a, b) => a - b);
    const noise = rms.length ? rms[Math.floor(rms.length * 0.1)] : 0;
    // averaged magnitude spectrum, 2048-point DFT on the loudest windows (cheap enough for 8s)
    const N = 2048, bins = new Float64Array(N / 2);
    const loud = [...Array(Math.floor(pcm.length / N)).keys()].map(k => {
        let s = 0; for (let j = k * N; j < (k + 1) * N; j++) s += pcm[j] * pcm[j]; return [k, s] as const;
    }).sort((a, b) => b[1] - a[1]).slice(0, 24);
    for (const [k] of loud) {
        const off = k * N;
        for (let b = 1; b < N / 2; b += 4) { // every 4th bin is plenty for a cutoff estimate
            let re = 0, im = 0;
            for (let n = 0; n < N; n += 2) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N); const a = 2 * Math.PI * b * n / N; re += pcm[off + n] * w * Math.cos(a); im -= pcm[off + n] * w * Math.sin(a); }
            bins[b] += Math.hypot(re, im);
        }
    }
    let max = 0; for (const v of bins) if (v > max) max = v;
    let top = 0;
    for (let b = N / 2 - 1; b > 0; b--) if (bins[b] > max * 0.001) { top = b; break; } // -60 dB from the strongest band
    return { peak: db(peak), noise: db(noise), topHz: Math.round(top * RATE / N), clipped };
}

/** Records a track's samples (all channels) for `seconds`, through the given context. */
function recorder(ctx: AudioContext, stream: MediaStream, channels: number) {
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, channels, channels);
    const chunks: Float32Array[][] = [...Array(channels)].map(() => []);
    node.onaudioprocess = e => { for (let c = 0; c < channels; c++) chunks[c].push(new Float32Array(e.inputBuffer.getChannelData(Math.min(c, e.inputBuffer.numberOfChannels - 1)))); };
    src.connect(node);
    const sink = ctx.createGain(); sink.gain.value = 0; node.connect(sink); sink.connect(ctx.destination);
    return () => {
        node.disconnect(); src.disconnect();
        return chunks.map(list => { const out = new Float32Array(list.reduce((n, c) => n + c.length, 0)); let o = 0; for (const c of list) { out.set(c, o); o += c.length; } return out; });
    };
}

/** A real Opus encode/decode: the track through a local WebRTC connection with these settings. */
async function opusLoop(trackIn: MediaStreamTrack, o: { kbps: number; stereo: boolean; dtx: boolean; }) {
    const a = new RTCPeerConnection(), b = new RTCPeerConnection();
    a.onicecandidate = e => { if (e.candidate) b.addIceCandidate(e.candidate); };
    b.onicecandidate = e => { if (e.candidate) a.addIceCandidate(e.candidate); };
    const sender = a.addTrack(trackIn, new MediaStream([trackIn]));
    const got = new Promise<MediaStreamTrack>(r => { b.ontrack = e => r(e.track); });
    const munge = (sdp: string) => {
        const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
        if (!pt) return sdp;
        const cfg = `minptime=10;useinbandfec=1;usedtx=${o.dtx ? 1 : 0};stereo=${o.stereo ? 1 : 0};sprop-stereo=${o.stereo ? 1 : 0};maxaveragebitrate=${o.kbps * 1000};maxplaybackrate=48000`;
        return sdp.replace(new RegExp(`a=fmtp:${pt} [^\\r\\n]*`), `a=fmtp:${pt} ${cfg}`);
    };
    const offer = await a.createOffer();
    offer.sdp = munge(offer.sdp!);
    await a.setLocalDescription(offer);
    await b.setRemoteDescription(offer);
    const answer = await b.createAnswer();
    answer.sdp = munge(answer.sdp!);
    await b.setLocalDescription(answer);
    await a.setRemoteDescription(answer);
    const p = sender.getParameters();
    p.encodings = [{ ...(p.encodings?.[0] ?? {}), maxBitrate: o.kbps * 1000 }];
    await sender.setParameters(p).catch(() => {});
    const out = await got;
    // Chromium only flows remote audio into Web Audio once it's attached to a media element
    const el = new Audio(); el.muted = true; el.srcObject = new MediaStream([out]); el.play().catch(() => {});
    const sent = async () => {
        const stats = await a.getStats();
        let bytes = 0; stats.forEach((s: any) => { if (s.type === "outbound-rtp" && s.kind === "audio") bytes = s.bytesSent; });
        return bytes;
    };
    return { track: out, sent, close: () => { a.close(); b.close(); el.srcObject = null; } };
}

/** How far `b` lags `a` (in samples), from their loudness envelopes; aligns the encoded versions. */
function lag(a: Float32Array, b: Float32Array) {
    const step = 48, env = (x: Float32Array) => { const e: number[] = []; for (let i = 0; i + step <= Math.min(x.length, RATE * 4); i += step) { let s = 0; for (let j = i; j < i + step; j++) s += Math.abs(x[j]); e.push(s); } return e; };
    const ea = env(a), eb = env(b);
    let best = 0, bestScore = -Infinity;
    for (let d = 0; d < 400 && d < eb.length; d++) {
        let s = 0; for (let i = 0; i + d < eb.length && i < ea.length; i++) s += ea[i] * eb[i + d];
        if (s > bestScore) { bestScore = s; best = d; }
    }
    return best * step;
}

function wav(pcm: Float32Array[]) {
    const ch = pcm.length, len = pcm[0].length, buf = new ArrayBuffer(44 + len * ch * 2), v = new DataView(buf);
    const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF"); v.setUint32(4, 36 + len * ch * 2, true); str(8, "WAVE"); str(12, "fmt "); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE * ch * 2, true);
    v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, len * ch * 2, true);
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, pcm[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Blob([buf], { type: "audio/wav" });
}

/** -60 dB at the left edge, 0 dB (clipping) at the right */
const meterPct = (d: number) => Math.max(0, Math.min(100, (d + 60) / 60 * 100));

function VoiceLab(props: any) {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [deviceId, setDeviceId] = useState<string>(settings.store.labInput || MediaEngineStore.getInputDeviceId?.() || "default");
    const [phase, setPhase] = useState<"idle" | "recording" | "working" | "done" | "error">("idle");
    const [left, setLeft] = useState(SECONDS);
    const [chain, setChain] = useState("");
    const [error, setError] = useState("");
    const [variants, setVariants] = useState<Variant[]>([]);
    const [playing, setPlaying] = useState<string | null>(null);
    const audio = useRef<{ ctx: AudioContext; gains: Map<string, GainNode>; sources: AudioBufferSourceNode[]; } | null>(null);
    const [meter, setMeter] = useState<{ level: number; peak: number; quiet: number; clip: boolean; } | null>(null);
    const meterRef = useRef<{ stop(): void; } | null>(null);

    useEffect(() => { navigator.mediaDevices.enumerateDevices().then(d => setDevices(d.filter(x => x.kind === "audioinput"))); return () => { stop(); stopMeter(); }; }, []);
    useEffect(() => { if (meterRef.current) { stopMeter(); startMeter(); } }, [deviceId]);

    function stopMeter() {
        meterRef.current?.stop();
        meterRef.current = null;
        setMeter(null);
    }

    /** Live input level, unprocessed, for setting the mixer's knobs: the level, the peak of the last
     * three seconds, clipping (held two seconds), and "quiet": the average level of the quietest
     * moments of the last five seconds, the noise floor listeners would hear behind you (a peak
     * alone reads a breath or a chair creak). The mic is open only while this runs. */
    async function startMeter() {
        track("voice_lab_meter");
        const device = deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : {};
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...device, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            const ctx = new AudioContext({ sampleRate: RATE });
            const an = ctx.createAnalyser(); an.fftSize = 2048;
            ctx.createMediaStreamSource(stream).connect(an);
            const buf = new Float32Array(an.fftSize);
            let hold = -120, holdAt = 0, clipAt = -1e9;
            const recent: number[] = [];
            const timer = window.setInterval(() => {
                an.getFloatTimeDomainData(buf);
                let pk = 0, sq = 0; for (const v of buf) { const a = Math.abs(v); if (a > pk) pk = a; sq += v * v; }
                const d = db(pk), now = performance.now();
                recent.push(db(Math.sqrt(sq / buf.length))); if (recent.length > 100) recent.shift();
                const quiet = [...recent].sort((a, b) => a - b)[Math.floor(recent.length * 0.2)];
                if (d >= hold || now - holdAt > 3000) { hold = d; holdAt = now; }
                if (pk >= 0.999) clipAt = now;
                setMeter({ level: d, peak: hold, quiet, clip: now - clipAt < 2000 });
            }, 50);
            meterRef.current = { stop: () => { clearInterval(timer); stream.getTracks().forEach(t => t.stop()); ctx.close(); } };
        } catch (e) {
            setError(String((e as Error)?.message ?? e));
        }
    }

    const voiceChannel = ChannelStore.getChannel(SelectedChannelStore.getVoiceChannelId?.() ?? "");
    const channelKbps = Math.round(((voiceChannel as any)?.bitrate ?? 64000) / 1000);
    const ec = !!MediaEngineStore.getEchoCancellation?.(), ns = !!MediaEngineStore.getNoiseSuppression?.(), agc = !!MediaEngineStore.getAutomaticGainControl?.();
    const krisp = !!(MediaEngineStore as any).getNoiseCancellation?.();
    const processingWords = [ec && "echo cancellation", ns && "noise suppression", agc && "auto gain"].filter(Boolean).join(", ") || "no processing";

    async function record() {
        track("voice_lab_record");
        stop();
        stopMeter();
        setError(""); setVariants([]); setPhase("recording"); setLeft(SECONDS);
        const ctx = new AudioContext({ sampleRate: RATE });
        const loops: Awaited<ReturnType<typeof opusLoop>>[] = [];
        const streams: MediaStream[] = [];
        try {
            const device = deviceId && deviceId !== "default" ? { deviceId: { exact: deviceId } } : {};
            const raw = await navigator.mediaDevices.getUserMedia({ audio: { ...device, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: RATE } } });
            const processed = await navigator.mediaDevices.getUserMedia({ audio: { ...device, echoCancellation: ec, noiseSuppression: ns, autoGainControl: agc } });
            streams.push(raw, processed);
            const s = raw.getAudioTracks()[0].getSettings() as any;
            const ps = processed.getAudioTracks()[0].getSettings() as any;
            const rawChannels = s.channelCount ?? 1;
            setChain(`${raw.getAudioTracks()[0].label || "input"} · ${s.sampleRate ? `${s.sampleRate / 1000} kHz` : "rate unknown"} · ${rawChannels} channel${rawChannels === 1 ? "" : "s"}${s.sampleSize ? ` · ${s.sampleSize}-bit` : ""}${ps.echoCancellation !== ec ? " · (processing couldn't be applied separately)" : ""}`);
            const rawTrack = raw.getAudioTracks()[0], procTrack = processed.getAudioTracks()[0];
            const plan = [
                { key: "now", label: "Discord now", detail: `${processingWords}${krisp ? " (Krisp not included)" : ""} · mono ${channelKbps} kbps · silence skipped`, track: procTrack, kbps: channelKbps, stereo: false, dtx: true },
                { key: "hifi", label: "High fidelity", detail: "no processing · mono 160 kbps", track: rawTrack, kbps: 160, stereo: false, dtx: false },
                { key: "max", label: "Max", detail: `no processing · ${rawChannels > 1 ? "stereo" : "mono"} 510 kbps`, track: rawTrack, kbps: 510, stereo: rawChannels > 1, dtx: false }
            ];
            for (const p of plan) loops.push(await opusLoop(p.track, p));
            const rec = {
                raw: recorder(ctx, raw, Math.min(2, rawChannels)),
                ...Object.fromEntries(plan.map((p, i) => [p.key, recorder(ctx, new MediaStream([loops[i].track]), p.stereo ? 2 : 1)]))
            } as Record<string, () => Float32Array[]>;
            const t0 = await Promise.all(loops.map(l => l.sent()));
            for (let i = SECONDS; i > 0; i--) { setLeft(i); await new Promise(r => setTimeout(r, 1000)); }
            const t1 = await Promise.all(loops.map(l => l.sent()));
            setPhase("working");
            await new Promise(r => setTimeout(r, 300)); // let the encoded audio catch up
            const pcm = Object.fromEntries(Object.entries(rec).map(([k, f]) => [k, f()]));
            const rawPcm = pcm.raw;
            const out: Variant[] = [{ key: "raw", label: "Raw", detail: "your interface, uncompressed", pcm: rawPcm }];
            plan.forEach((p, i) => {
                const d = lag(rawPcm[0], pcm[p.key][0]);
                out.push({ key: p.key, label: p.label, detail: p.detail, pcm: pcm[p.key].map(c => c.subarray(d)), sentKbps: Math.round((t1[i] - t0[i]) * 8 / SECONDS / 1000) });
            });
            const len = Math.min(...out.map(v => v.pcm[0].length));
            for (const v of out) { v.pcm = v.pcm.map(c => c.subarray(0, len)); v.stats = analyse(v.pcm[0]); }
            setVariants(out);
            setPhase("done");
        } catch (e) {
            setError(String((e as Error)?.message ?? e));
            setPhase("error");
        } finally {
            loops.forEach(l => l.close());
            streams.forEach(s => s.getTracks().forEach(t => t.stop()));
            ctx.close();
        }
    }

    function stop() {
        if (!audio.current) return;
        audio.current.sources.forEach(s => { try { s.stop(); } catch { } });
        audio.current.ctx.close();
        audio.current = null;
        setPlaying(null);
    }

    /** All versions play together, muted but one: switching keeps your place in the recording. */
    function play(key: string) {
        if (audio.current) {
            audio.current.gains.forEach((g, k) => { g.gain.value = k === key ? 1 : 0; });
            setPlaying(key);
            return;
        }
        const ctx = new AudioContext({ sampleRate: RATE });
        const gains = new Map<string, GainNode>(), sources: AudioBufferSourceNode[] = [];
        const at = ctx.currentTime + 0.1;
        for (const v of variants) {
            const buf = ctx.createBuffer(2, v.pcm[0].length, RATE);
            buf.copyToChannel(v.pcm[0] as any, 0);
            buf.copyToChannel((v.pcm[1] ?? v.pcm[0]) as any, 1);
            const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
            const g = ctx.createGain(); g.gain.value = v.key === key ? 1 : 0;
            src.connect(g); g.connect(ctx.destination); src.start(at);
            gains.set(v.key, g); sources.push(src);
        }
        audio.current = { ctx, gains, sources };
        setPlaying(key);
    }

    function save() {
        for (const v of variants) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(wav(v.pcm));
            a.download = `voice-lab-${v.key}.wav`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        }
    }

    useEffect(() => {
        if (phase !== "done") return;
        const onKey = (e: KeyboardEvent) => {
            const i = Number(e.key) - 1;
            if (variants[i]) { e.preventDefault(); play(variants[i].key); }
            else if (e.key === " ") { e.preventDefault(); playing ? stop() : play(variants[0].key); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [phase, variants, playing]);

    const raw = variants[0]?.stats;
    // a mono mic on a stereo interface often arrives on one side only: then voice should stay mono
    const rawPcm = variants[0]?.pcm;
    const sideDb = rawPcm?.length === 2 ? (() => {
        const rms = (c: Float32Array) => { let s = 0; for (let i = 0; i < c.length; i += 4) s += c[i] * c[i]; return Math.sqrt(s / (c.length / 4)); };
        return db(rms(rawPcm[0])) - db(rms(rawPcm[1]));
    })() : 0;
    const verdict = raw && [
        Math.abs(sideDb) > 20 ? `Your interface sends the mic on the ${sideDb > 0 ? "left" : "right"} channel only: keep voice mono (High fidelity), not stereo.` : null,
        raw.clipped > 0 ? `Your input clipped ${raw.clipped} times: turn the interface's gain down a little.` : raw.peak < -24 ? "Your input is quiet (peak under -24 dB): more gain at the interface, not in Windows." : "Levels are healthy.",
        raw.topHz >= 15000 ? "Your capture reaches full range: Windows and the interface aren't a bottleneck." : `Your capture stops near ${Math.round(raw.topHz / 1000)} kHz before Discord touches it: check the interface's sample rate in Windows Sound settings.`,
        raw.noise > -60 ? `Noise floor ${Math.round(raw.noise)} dB is high (hiss or room noise).` : `Noise floor ${Math.round(raw.noise)} dB is quiet.`
    ].filter(Boolean) as string[];

    return (
        <Modal {...props} title="Voice lab">
            <div className="dk-lab">
                <p className="dk-lab-dim">Record once, then switch between versions with 1-4 (space plays or stops). Nothing leaves this machine.</p>
                <div className="dk-lab-row">
                    <span className="dk-lab-k">Input</span>
                    <select className="dk-lab-select" value={deviceId} onChange={e => { setDeviceId(e.currentTarget.value); settings.store.labInput = e.currentTarget.value; }} disabled={phase === "recording" || phase === "working"}>
                        {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
                    </select>
                </div>
                <div className="dk-lab-row">
                    <span className="dk-lab-k">Level</span>
                    <button className="dk-lab-btn" data-dk-action="lab-meter" onClick={() => (meter ? stopMeter() : startMeter())} disabled={phase === "recording" || phase === "working"}>
                        {meter ? "Stop meter" : "Live meter"}
                    </button>
                    {meter && <>
                        <div className="dk-lab-meter" data-clip={meter.clip || undefined} title="Aim: your loudest moments in the shaded zone (-12 to -6 dB)">
                            <div className="dk-lab-meter-zone" />
                            <div className="dk-lab-meter-fill" style={{ width: `${meterPct(meter.level)}%` }} />
                            <div className="dk-lab-meter-hold" style={{ left: `${meterPct(meter.peak)}%` }} />
                        </div>
                        <span className="dk-lab-meter-num" data-dk-meter={Math.round(meter.peak)} data-dk-quiet={Math.round(meter.quiet)}
                            title="peak: your loudest moment in the last 3 seconds; quiet: the background behind you (aim for -60 or lower)">
                            {meter.clip ? "CLIP" : `peak ${Math.round(meter.peak)} · quiet ${Math.round(meter.quiet)}`}
                        </span>
                    </>}
                </div>
                {chain && <div className="dk-lab-row"><span className="dk-lab-k">Capture</span><span className="dk-lab-dim">{chain}</span></div>}
                <button className="dk-lab-rec" data-dk-action="lab-record" disabled={phase === "recording" || phase === "working"} onClick={record}>
                    {phase === "recording" ? `Recording · ${left}s · speak normally` : phase === "working" ? "Encoding…" : phase === "done" ? "Record again" : `Record ${SECONDS} seconds`}
                </button>
                {error && <p className="dk-lab-error">{error}</p>}
                {variants.map((v, i) => (
                    <button key={v.key} className="dk-lab-variant" data-dk-variant={v.key} data-on={playing === v.key || undefined} onClick={() => play(v.key)}>
                        <span className="dk-lab-key">{i + 1}</span>
                        <span className="dk-lab-name">{v.label}</span>
                        <span className="dk-lab-dim dk-lab-detail">{v.detail}{v.sentKbps ? ` · sent ${v.sentKbps} kbps` : ""}</span>
                        {v.stats && <span className="dk-lab-dim dk-lab-stats">{`peak ${Math.round(v.stats.peak)} dB · floor ${Math.round(v.stats.noise)} dB · up to ${(v.stats.topHz / 1000).toFixed(1)} kHz`}</span>}
                    </button>
                ))}
                {phase === "done" && (
                    <div className="dk-lab-row">
                        <button className="dk-lab-btn" onClick={() => (playing ? stop() : play(variants[0].key))}>{playing ? "Stop" : "Play"}</button>
                        <button className="dk-lab-btn" onClick={save}>Save WAVs</button>
                    </div>
                )}
                {verdict && <div className="dk-lab-verdict">{verdict.map(v => <p key={v}>{v}</p>)}</div>}
            </div>
        </Modal>
    );
}

export function openVoiceLab() {
    enableStyle(style);
    openModal(props => <VoiceLab {...props} />);
}
