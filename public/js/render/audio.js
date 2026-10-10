// ─────────────────────────────────────────────────────────────────────────────
// Synthesized audio (WebAudio only, no files) — the old RV and the world around it.
//   const audio = createAudio();         // safe to call any time; context created lazily
//   audio.unlock()                       // call from a user gesture (also auto-hooks the first
//                                        // pointerdown/keydown on window)
//   audio.update(snap, dt)               // engine, road, wind, sirens, proximity loops (WorldView calls it)
//   audio.event(ev, snap?)               // one-shots from Snapshot.events (WorldView calls it)
//   audio.setDriveState({ rpm, gear, throttle, load?, running? })   // from FirstPersonDriver's gearbox
//   audio.horn(on)                       // two-tone air horn (hold)
//   audio.indicator(on|null)             // force the turn-signal tick (null = automatic near stops)
//   audio.setMuted(bool); audio.muted    // M key: audio.setMuted(!audio.muted)
//   audio.setVolume(0..1); audio.play(name, ...args); audio.inspect(); audio.destroy()
//
// Engine: a carbureted big-block V8 behind a 3-speed automatic. One PeriodicWave oscillator per
// bank at the engine-CYCLE frequency (rpm/120) whose harmonics encode 8 uneven firing pulses per
// cycle (cross-plane burble: ~43 Hz firing at a 650 rpm idle, with 5.4/10.8/21.7 Hz lope under it),
// through a waveshaper (drive rises with throttle) and a lowpass that opens with rpm/throttle,
// an exhaust resonance, intake roar (band noise ∝ throttle·rpm), torque-converter whine, overrun
// burble pops on lift-off, gear-change clunks (the gearbox drops the rpm), starter crank → catch.
// If nobody calls setDriveState (the cook's client), the same Gearbox runs here from the snapshot.
// Body/road: tyre roar + wind ∝ speed, gravel crunch off-road, rattles/creaks + lab glassware
// clinks on bumps, brake squeal at low speed. World: sirens (car hi-lo, motorbike yelp), heli,
// crossing/drawbridge bells, steam hiss & water gush by proximity, tornado roar, parade crowd +
// marching drums, car-wash brushes, gentle cattle moos, flashbang bang + ringing + 1 s muffle,
// foam splat, hose spray, firecracker crackle, nitro backfires.
// CPU: one shared noise buffer, ~45 native nodes, everything idle sits at gain 0.
// ─────────────────────────────────────────────────────────────────────────────
import { EV, KIND_ID } from '../shared/protocol.js';
import { Gearbox, IDLE_RPM } from './fp/gearbox.js';

const K = KIND_ID;
const CAR_SIREN = new Set([K.cop, K.cop_suv, K.interceptor, K.rhino_truck].filter((v) => v != null));
const MOTO = K.moto_cop;
const HELI = K.heli;
const GATE = K.crossing_gate;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const QUIET = new Set(['idle', 'done', 'down', 'waiting', 'inactive', 'end', 'ended', 'over', 'finished', 'closed']);

// ── engine waveform: one 4-stroke cycle of a cross-plane V8 (8 uneven pulses) ─
function engineWave(ctx, { harmonics = 96, seed = 1 } = {}) {
  const N = 2048;
  const x = new Float32Array(N);
  // firing order L R L L R L R R (cross-plane): bank imbalance + slightly uneven spacing
  const bank = [1, 0, 1, 1, 0, 1, 0, 0];
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < 8; k++) {
    const p0 = k / 8 + (rnd() - 0.5) * 0.022 + (bank[k] ? 0.006 : -0.004);
    const amp = (bank[k] ? 1.0 : 0.8) * (0.9 + rnd() * 0.2);
    for (let i = 0; i < N; i++) {
      let t = i / N - p0; if (t < 0) t += 1;
      // exhaust pulse: sharp rise, damped ring-down
      const env = Math.exp(-t / 0.024) - Math.exp(-t / 0.004);
      x[i] += amp * env * (1 + 0.45 * Math.sin(2 * Math.PI * t * 22));
    }
  }
  // low "lope" — one bank breathing differently per revolution
  for (let i = 0; i < N; i++) x[i] += 0.18 * Math.sin(2 * Math.PI * i / N * 2 + 0.7) + 0.1 * Math.sin(2 * Math.PI * i / N + 1.9);
  let mean = 0; for (let i = 0; i < N; i++) mean += x[i]; mean /= N;
  const real = new Float32Array(harmonics + 1), imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) { const ph = 2 * Math.PI * n * i / N; const v = x[i] - mean; a += v * Math.cos(ph); b += v * Math.sin(ph); }
    const roll = 1 / (1 + Math.pow(n / 60, 2));            // gentle top-end roll-off
    real[n] = (a * 2 / N) * roll; imag[n] = (b * 2 / N) * roll;
  }
  return ctx.createPeriodicWave(real, imag);
}

function makeNoise(ctx, seconds = 2) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
// sparse clicks → gravel crunch when looped at a speed-dependent rate
function makeGravel(ctx, seconds = 1.5) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0), sr = ctx.sampleRate;
  const n = Math.floor(seconds * 260);
  for (let k = 0; k < n; k++) {
    const at = Math.floor(Math.random() * d.length), amp = 0.3 + Math.random() * 0.7, len = Math.floor(sr * (0.002 + Math.random() * 0.006));
    for (let i = 0; i < len && at + i < d.length; i++) d[at + i] += amp * (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.35));
  }
  return b;
}
function softClip(drive = 2.2) { const n = 512, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); } return c; }

/**
 * The engine chain (also used by the offline test). out: AudioNode. Returns setters.
 *   eng.set({ rpm, throttle, load, running }, t, tc)
 */
export function buildEngine(ctx, out, noiseBuf) {
  const g = ctx.createGain(); g.gain.value = 0; g.connect(out);
  const peak = ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 90; peak.Q.value = 1.2; peak.gain.value = 7; peak.connect(g);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.9; lp.connect(peak);
  const ws = ctx.createWaveShaper(); ws.curve = softClip(2.4); ws.oversample = 'none'; ws.connect(lp);
  const pre = ctx.createGain(); pre.gain.value = 0.9; pre.connect(ws);
  const wave = engineWave(ctx, { seed: 7 }), wave2 = engineWave(ctx, { seed: 23 });
  const o1 = ctx.createOscillator(); o1.setPeriodicWave(wave); o1.frequency.value = IDLE_RPM / 120;
  const o2 = ctx.createOscillator(); o2.setPeriodicWave(wave2); o2.frequency.value = IDLE_RPM / 120 * 1.004;
  const g1 = ctx.createGain(); g1.gain.value = 0.55; o1.connect(g1); g1.connect(pre);
  const g2 = ctx.createGain(); g2.gain.value = 0.4; o2.connect(g2); g2.connect(pre);
  // crank-rate sub thump (chest rumble)
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = IDLE_RPM / 60 * 2;
  const subG = ctx.createGain(); subG.gain.value = 0.0; sub.connect(subG); subG.connect(g);
  // intake roar: band noise
  const inG = ctx.createGain(); inG.gain.value = 0; inG.connect(out);
  const inF = ctx.createBiquadFilter(); inF.type = 'bandpass'; inF.frequency.value = 500; inF.Q.value = 0.8; inF.connect(inG);
  const inN = ctx.createBufferSource(); inN.buffer = noiseBuf; inN.loop = true; inN.connect(inF);
  // torque-converter / pump whine
  const wh = ctx.createOscillator(); wh.type = 'triangle'; wh.frequency.value = 140;
  const whF = ctx.createBiquadFilter(); whF.type = 'bandpass'; whF.frequency.value = 140; whF.Q.value = 6;
  const whG = ctx.createGain(); whG.gain.value = 0; wh.connect(whF); whF.connect(whG); whG.connect(out);
  for (const o of [o1, o2, sub, wh]) o.start();
  inN.start();
  const nodes = { g, lp, peak, pre, o1, o2, sub, subG, inG, inF, wh, whF, whG };
  function set({ rpm = IDLE_RPM, throttle = 0, load = 0, running = true, level = 1 }, t = ctx.currentTime, tc = 0.05) {
    const r = Math.max(30, rpm);
    const fc = r / 120;
    const thr = clamp(throttle, 0, 1);
    nodes.o1.frequency.setTargetAtTime(fc, t, tc * 0.6);
    nodes.o2.frequency.setTargetAtTime(fc * 1.004, t, tc * 0.6);
    nodes.sub.frequency.setTargetAtTime(r / 60, t, tc);
    const on = running ? 1 : clamp(rpm / 400, 0, 1) * 0.6;
    const rn = clamp(r / 5000, 0, 1.2);
    nodes.lp.frequency.setTargetAtTime(260 + rn * 1500 + thr * 900 + thr * rn * 900, t, tc);
    nodes.peak.frequency.setTargetAtTime(clamp(fc * 8 * 2.1, 70, 900), t, tc);
    nodes.pre.gain.setTargetAtTime(0.7 + thr * 1.6 + rn * 0.4, t, tc);
    nodes.g.gain.setTargetAtTime(level * on * (0.17 + rn * 0.07 + thr * 0.07), t, tc * 1.5);
    nodes.subG.gain.setTargetAtTime(level * on * (0.06 + thr * 0.05) * (1 - clamp(rn, 0, 1) * 0.6), t, tc);
    nodes.inF.frequency.setTargetAtTime(320 + r * 0.32, t, tc);
    nodes.inG.gain.setTargetAtTime(level * on * thr * (0.012 + rn * 0.075), t, tc);
    const pump = r / 60 * 13;
    nodes.wh.frequency.setTargetAtTime(pump, t, tc); nodes.whF.frequency.setTargetAtTime(pump, t, tc);
    nodes.whG.gain.setTargetAtTime(level * on * (0.006 + load * 0.016), t, tc);
  }
  return { nodes, set };
}

/** Offline proof (tests): render the engine at a given state; returns { rms, peak, f0 } (f0 = dominant pitch, Hz). */
export async function renderEngineOffline({ rpm = IDLE_RPM, throttle = 0, seconds = 1.0, sampleRate = 22050 } = {}) {
  const OAC = typeof window !== 'undefined' ? (window.OfflineAudioContext || window.webkitOfflineAudioContext) : null;
  if (!OAC) throw new Error('no OfflineAudioContext');
  const ctx = new OAC(1, Math.floor(sampleRate * seconds), sampleRate);
  const noise = makeNoise(ctx, 1);
  const eng = buildEngine(ctx, ctx.destination, noise);
  eng.set({ rpm, throttle, load: throttle, running: true }, 0, 0.001);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  const from = Math.floor(d.length * 0.3);
  let s = 0, pk = 0;
  for (let i = from; i < d.length; i++) { s += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); }
  const rms = Math.sqrt(s / (d.length - from));
  // perceived pitch: normalized autocorrelation — skip the initial lobe, then take the best peak (12–420 Hz)
  const lo = Math.floor(sampleRate / 420), hi = Math.floor(sampleRate / 12), M = Math.min(8192, d.length - from - hi);
  const r = new Float32Array(hi + 1);
  let r0 = 0; for (let i = 0; i < M; i++) r0 += d[from + i] * d[from + i];
  for (let lag = 1; lag <= hi; lag++) { let c = 0; for (let i = 0; i < M; i++) c += d[from + i] * d[from + i + lag]; r[lag] = c / (r0 || 1); }
  let start = 1; while (start < hi && r[start] > 0.25) start++;
  let bestLag = 0, best = -1;
  for (let lag = Math.max(lo, start); lag < hi; lag++) if (r[lag] > best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) { best = r[lag]; bestLag = lag; }
  // prefer the shortest lag that is nearly as good (avoid octave-down picks)
  for (let lag = Math.max(lo, start); lag < bestLag; lag++) if (r[lag] > best * 0.86 && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) { bestLag = lag; break; }
  return { rms, peak: pk, f0: bestLag ? sampleRate / bestLag : 0, firingHz: rpm / 15, cycleHz: rpm / 120 };
}

export function createAudio({ volume = 0.8, route = null } = {}) {
  const structures = route && Array.isArray(route.structures) ? route.structures : null;
  let ctx = null, master = null, comp = null, bus = null, muffle = null, noiseBuf = null, gravelBuf = null;
  let muted = false, vol = volume, destroyed = false;
  let L = null;                   // continuous loops
  let lastStars = 0;
  let sirenPhase = 0;
  let snapRef = null;
  const gb = new Gearbox();
  let drive = null, driveAt = -1e9, nowS = 0;
  let prevGear = 1, prevThr = 0, burbleT = 0, burbleNext = 0, prevEngine = null, catchT = 0, crank = false;
  let prevBump = 0, rattleCd = 0, prevSpeed = 0, decel = 0;
  let indicatorForce = null, indT = 0, indOn = false;
  let mooT = 3, drumNext = 0, drumBeat = 0, brassOn = false;
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

  function ensure() {
    if (ctx || destroyed || !AC) return ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return null; }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : vol;
    muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 18000; muffle.Q.value = 0.5;
    bus = ctx.createGain(); bus.gain.value = 1;
    bus.connect(muffle); muffle.connect(master); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = makeNoise(ctx, 2);
    gravelBuf = makeGravel(ctx, 1.5);
    try { buildLoops(); } catch (e) { console.warn('[audio] build failed', e); }
    return ctx;
  }
  const unlock = () => {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };
  if (typeof window !== 'undefined') {
    const once = () => { unlock(); if (ctx && ctx.state === 'running') { window.removeEventListener('pointerdown', once, true); window.removeEventListener('keydown', once, true); window.removeEventListener('touchstart', once, true); } };
    window.addEventListener('pointerdown', once, true);
    window.addEventListener('keydown', once, true);
    window.addEventListener('touchstart', once, true);
  }

  // ── node helpers ───────────────────────────────────────────────────────────
  let sharedNoise = null;
  function noiseSrc() {                                   // one shared looping noise source for all loops
    if (!sharedNoise) { sharedNoise = ctx.createBufferSource(); sharedNoise.buffer = noiseBuf; sharedNoise.loop = true; sharedNoise.start(); }
    return sharedNoise;
  }
  function gainNode(v = 0, dest = bus) { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
  function filt(type, f, q = 1, dest) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (dest) b.connect(dest); return b; }
  function osc(type, f, dest) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (dest) o.connect(dest); o.start(); return o; }
  function lfo(f, depth, param, type = 'sine') { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return { o, g }; }
  const set = (p, v, tc = 0.06) => p.setTargetAtTime(v, ctx.currentTime, tc);
  // noise → filter chain → gain(0) → bus
  function noiseLoop(type, f, q, extra = null) {
    const g = gainNode(0);
    const fl = filt(type, f, q, g);
    if (extra) { const f2 = filt(extra.type, extra.f, extra.q ?? 0.7); f2.connect(fl); noiseSrc().connect(f2); } else noiseSrc().connect(fl);
    return { g, f: fl };
  }

  function buildLoops() {
    L = {};
    L.eng = buildEngine(ctx, bus, noiseBuf);
    // starter motor: buzzing saw, loaded by compression strokes
    const stG = gainNode(0);
    const stF = filt('bandpass', 520, 1.4, stG);
    const stAm = ctx.createGain(); stAm.gain.value = 0.55; stAm.connect(stF);
    osc('sawtooth', 148, stAm); osc('square', 74, stAm);
    lfo(5.6, 0.45, stAm.gain, 'triangle');
    L.starter = { g: stG };
    // road: tyre roar, wind, gravel, brake squeal
    L.tyre = noiseLoop('lowpass', 380, 0.7);
    L.wind = noiseLoop('bandpass', 500, 0.5);
    const grG = gainNode(0); const grF = filt('bandpass', 1900, 0.9, grG);
    const gr = ctx.createBufferSource(); gr.buffer = gravelBuf; gr.loop = true; gr.connect(grF); gr.start();
    L.gravel = { g: grG, src: gr };
    const brG = gainNode(0); const brF = filt('bandpass', 2900, 9, brG);
    const bro = osc('sine', 2900, brF); lfo(7.3, 28, bro.frequency);
    L.brake = { g: brG };
    // sirens: car hi-lo, motorbike yelp
    const sg = gainNode(0); const sf = filt('bandpass', 1100, 1.4, sg);
    L.siren = { g: sg, o: osc('square', 760, sf), o2: osc('triangle', 760, sf) };
    const mg = gainNode(0); const mf = filt('bandpass', 1300, 1.1, mg);
    const mo = osc('triangle', 1100, mf); const ml = lfo(3.4, 380, mo.frequency, 'sawtooth');
    const mbG = gainNode(0); const mbF = filt('lowpass', 900, 1, mbG); const mbo = osc('sawtooth', 96, mbF);
    L.moto = { g: mg, o: mo, lfo: ml, bike: mbG, bikeO: mbo };
    // heli rotor thump
    const hg = gainNode(0); const hf = filt('lowpass', 260, 1, hg);
    const am = ctx.createGain(); am.gain.value = 0.5; am.connect(hf); noiseSrc().connect(am);
    lfo(11, 0.5, am.gain, 'square');
    L.rotor = { g: hg };
    // bells (crossing / drawbridge)
    const bg = gainNode(0); osc('triangle', 1250, bg); osc('sine', 1870, bg);
    L.bell = { g: bg, t: 0 };
    // horn: two-tone air horn (two trumpets, slightly overdriven)
    const hornG = gainNode(0);
    const hornLp = filt('lowpass', 2400, 0.8, hornG);
    const hornWs = ctx.createWaveShaper(); hornWs.curve = softClip(1.8); hornWs.connect(hornLp);
    const hornPre = ctx.createGain(); hornPre.gain.value = 0.8; hornPre.connect(hornWs);
    const hf1 = filt('bandpass', 620, 1.3, hornPre), hf2 = filt('bandpass', 760, 1.3, hornPre);
    const ho1 = osc('sawtooth', 277, hf1), ho2 = osc('sawtooth', 349, hf2), ho3 = osc('sawtooth', 185, hornPre);
    L.horn = { g: hornG, o: [ho1, ho2, ho3], base: [277, 349, 185], on: false };
    // proximity loops
    L.steam = noiseLoop('highpass', 3600, 0.7);
    L.water = noiseLoop('bandpass', 1050, 0.6);
    const tg = gainNode(0); const tf = filt('lowpass', 210, 0.8, tg); const tb = filt('bandpass', 420, 0.6, tg);
    const tam = ctx.createGain(); tam.gain.value = 0.7; tam.connect(tf); tam.connect(tb); noiseSrc().connect(tam);
    lfo(0.31, 0.3, tam.gain); lfo(1.7, 0.12, tam.gain);
    L.tornado = { g: tg };
    const cg = gainNode(0); const cf = filt('bandpass', 950, 0.6, cg);
    const cam = ctx.createGain(); cam.gain.value = 0.7; cam.connect(cf); noiseSrc().connect(cam);
    lfo(0.43, 0.25, cam.gain); lfo(1.9, 0.12, cam.gain);
    L.crowd = { g: cg };
    const brassG = gainNode(0); const brassF = filt('lowpass', 1300, 1.2, brassG);
    osc('sawtooth', 233, brassF); osc('sawtooth', 294, brassF); osc('sawtooth', 349, brassF);
    L.brass = { g: brassG };
    L.hose = noiseLoop('bandpass', 2300, 0.8);
    const wg = gainNode(0); const wf = filt('bandpass', 1400, 0.7, wg);
    const wam = ctx.createGain(); wam.gain.value = 0.5; wam.connect(wf); noiseSrc().connect(wam);
    lfo(2.3, 0.5, wam.gain, 'triangle');
    L.wash = { g: wg, spray: noiseLoop('highpass', 4500, 0.7) };
  }

  // ── one-shots ─────────────────────────────────────────────────────────────
  function env(g, a, peak, d, t0 = ctx.currentTime) {
    g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function tone(type, f0, f1, dur, peak = 0.4, delay = 0, fl = null, attack = 0.006) {
    const t0 = ctx.currentTime + delay;
    const g = gainNode(0);
    let dest = g;
    if (fl) { const f = ctx.createBiquadFilter(); f.type = fl.type; f.frequency.value = fl.f; f.Q.value = fl.q ?? 1; f.connect(g); dest = f; }
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    o.connect(dest); o.start(t0); o.stop(t0 + attack + dur + 0.05);
    env(g, attack, peak, dur, t0);
    o.onended = () => g.disconnect();
  }
  function burst(dur, f, q, peak, type = 'lowpass', delay = 0, f1 = null) {
    const t0 = ctx.currentTime + delay;
    const g = gainNode(0);
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q; fl.connect(g);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.connect(fl); n.start(t0, Math.random() * 1.5); n.stop(t0 + dur + 0.05);
    env(g, 0.003, peak, dur, t0);
    n.onended = () => g.disconnect();
  }
  function muffleFor(sec, depth = 1) {
    const t = ctx.currentTime, p = muffle.frequency;
    p.cancelScheduledValues(t);
    p.setValueAtTime(Math.max(300, 4000 * (1 - depth) + 320), t);
    p.setValueAtTime(Math.max(300, 4000 * (1 - depth) + 320), t + sec * 0.55);
    p.exponentialRampToValueAtTime(18000, t + sec * 1.6);
  }
  const SFX = {
    bonk() { tone('sine', 520, 140, 0.22, 0.5); tone('square', 900, 300, 0.08, 0.12); burst(0.06, 2500, 1, 0.15, 'bandpass'); },
    crash(p = 1) { burst(0.5 + p * 0.3, 1800, 0.6, 0.55 + p * 0.2, 'lowpass', 0, 200); tone('sawtooth', 120, 40, 0.35, 0.3); burst(0.25, 4000, 2, 0.25, 'bandpass', 0.03); SFX.rattle(1); },
    smash() { burst(0.18, 3200, 1.2, 0.35, 'bandpass'); tone('triangle', 700, 220, 0.12, 0.2); for (let i = 0; i < 4; i++) tone('sine', 2200 + Math.random() * 2400, 1800, 0.08, 0.06, 0.04 + i * 0.035); },
    chime() { [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, f, 0.35, 0.22, i * 0.08)); },
    sting() { tone('sawtooth', 220, 220, 0.18, 0.18, 0, { type: 'lowpass', f: 1400 }); tone('sawtooth', 277, 277, 0.18, 0.16, 0.12, { type: 'lowpass', f: 1400 }); tone('sawtooth', 330, 330, 0.4, 0.18, 0.24, { type: 'lowpass', f: 1600 }); burst(0.3, 6000, 1, 0.08, 'highpass', 0.24); },
    relief() { [523, 659, 784].forEach((f, i) => tone('sine', f, f, 0.4, 0.2, i * 0.1)); },
    whoosh() { burst(0.9, 300, 1.4, 0.4, 'bandpass', 0, 2400); },
    thud(hard) { tone('sine', hard ? 90 : 120, 35, hard ? 0.5 : 0.3, hard ? 0.85 : 0.55); burst(hard ? 0.4 : 0.2, 600, 0.7, hard ? 0.5 : 0.3); SFX.rattle(hard ? 1.2 : 0.8); },
    trainHorn() { const t = [[311, 0, 0.9], [370, 0, 0.9], [311, 1.1, 1.3], [370, 1.1, 1.3]]; for (const [f, d, l] of t) tone('sawtooth', f, f * 0.995, l, 0.13, d, { type: 'lowpass', f: 1200 }); },
    fell() { tone('sine', 900, 120, 1.4, 0.3); },
    gadget(g) {
      if (g === 'smoke') burst(0.6, 1200, 0.6, 0.4, 'lowpass', 0, 300);
      else if (g === 'oil') { burst(0.25, 500, 2, 0.3, 'bandpass'); tone('sine', 300, 120, 0.2, 0.2, 0.05); }
      else if (g === 'nitro') { burst(1.2, 400, 1, 0.45, 'bandpass', 0, 2600); tone('sawtooth', 80, 160, 0.8, 0.22, 0, { type: 'lowpass', f: 900 }); SFX.backfire(3); }
    },
    backfire(n = 1) { for (let i = 0; i < n; i++) { const d = i * (0.09 + Math.random() * 0.07); burst(0.07, 900, 0.8, 0.5, 'lowpass', d, 180); tone('sine', 95, 42, 0.09, 0.45, d); } },
    pop(level = 0.18) { const d = Math.random() * 0.02; burst(0.045, 650 + Math.random() * 400, 0.9, level, 'lowpass', d, 160); tone('sine', 120, 55, 0.05, level * 0.8, d); },
    spotted() { tone('square', 1046, 1046, 0.1, 0.12); tone('square', 1046, 1046, 0.1, 0.12, 0.16); },
    end(won) { (won ? [523, 659, 784, 1046] : [392, 330, 262, 196]).forEach((f, i) => tone(won ? 'triangle' : 'sawtooth', f, f, 0.45, 0.2, i * 0.16, won ? null : { type: 'lowpass', f: 900 })); },
    clunk(dir = 1) {
      tone('sine', dir > 0 ? 78 : 92, 36, 0.14, 0.32);
      burst(0.05, 1100, 1.5, 0.11, 'bandpass', 0.005);
      tone('triangle', 1650, 1500, 0.04, 0.035, 0.012);
    },
    rattle(k = 1) {
      const n = 3 + Math.floor(Math.random() * 3 * k);
      for (let i = 0; i < n; i++) burst(0.014 + Math.random() * 0.012, 2000 + Math.random() * 2600, 6, 0.06 * k, 'bandpass', Math.random() * 0.13);
      if (Math.random() < 0.6) tone('sawtooth', 160 + Math.random() * 40, 230 + Math.random() * 40, 0.18, 0.03 * k, 0.02, { type: 'bandpass', f: 700, q: 10 }, 0.03);
      // lab glassware clinking in the back
      const c = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < c; i++) tone('sine', 2600 + Math.random() * 2600, 2500 + Math.random() * 2400, 0.09 + Math.random() * 0.08, 0.045 * k, 0.03 + Math.random() * 0.11, null, 0.002);
    },
    tick(hi = true) { burst(0.008, 5200, 1, 0.07, 'highpass'); tone('sine', hi ? 2300 : 1900, hi ? 2300 : 1900, 0.018, 0.03, 0, null, 0.001); },
    crankCatch() { burst(0.25, 500, 0.8, 0.35, 'lowpass', 0, 160); tone('sine', 70, 45, 0.25, 0.3); SFX.backfire(1); },
    flashbang(k = 1) {
      burst(0.7, 3500, 0.6, 0.9 * k, 'lowpass', 0, 180);
      tone('sine', 62, 28, 0.5, 0.8 * k);
      burst(0.12, 6000, 0.8, 0.4 * k, 'highpass');
      tone('sine', 3150, 3120, 2.2, 0.05 * k, 0.15, null, 0.04);        // ringing
      muffleFor(1.0, k);
    },
    foam(k = 1) {
      burst(0.28, 1300, 0.9, 0.5 * k, 'lowpass', 0, 260); tone('sine', 230, 70, 0.16, 0.35 * k);
      for (let i = 0; i < 9; i++) burst(0.02, 3500 + Math.random() * 3000, 4, 0.05 * k, 'bandpass', 0.08 + Math.random() * 0.8);   // fizz
    },
    firecracker(k = 1) {
      const n = 10 + Math.floor(Math.random() * 7);
      let d = 0;
      for (let i = 0; i < n; i++) { d += 0.03 + Math.random() * 0.09; burst(0.018, 1400 + Math.random() * 1800, 0.7, (0.2 + Math.random() * 0.25) * k, 'highpass', d); tone('square', 700, 180, 0.02, 0.05 * k, d); }
    },
    splash(k = 1) { burst(0.35, 1800, 0.7, 0.3 * k, 'bandpass', 0, 700); },
    moo(k = 1) {
      const t0 = ctx.currentTime, f = 118 + Math.random() * 20, dur = 1.1 + Math.random() * 0.5;
      const g = gainNode(0); const lp = filt('lowpass', 900, 0.7, g); const bp = filt('bandpass', 420, 2.2); bp.connect(lp);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.92, t0); o.frequency.linearRampToValueAtTime(f, t0 + 0.25); o.frequency.linearRampToValueAtTime(f * 0.82, t0 + dur);
      o.connect(bp); o.start(t0); o.stop(t0 + dur + 0.1);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09 * k, t0 + 0.28); g.gain.setValueAtTime(0.09 * k, t0 + dur - 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.onended = () => g.disconnect();
    },
    kick(k = 1, d = 0) { tone('sine', 72, 44, 0.2, 0.32 * k, d, null, 0.004); },
    snare(k = 1, d = 0) { burst(0.12, 1900, 0.8, 0.2 * k, 'bandpass', d); tone('triangle', 210, 160, 0.06, 0.08 * k, d); },
    ding(k = 1) { tone('triangle', 1250, 1250, 0.5, 0.11 * k, 0, null, 0.002); tone('sine', 1870, 1870, 0.4, 0.07 * k, 0, null, 0.002); },
  };

  function play(name, ...args) {
    if (!ctx || muted || ctx.state !== 'running' || !SFX[name]) return;
    try { SFX[name](...args); } catch (e) { /* ignore */ }
  }

  // ── continuous ─────────────────────────────────────────────────────────────
  function setDriveState(s) {
    if (!s) return;
    drive = { rpm: s.rpm ?? IDLE_RPM, gear: s.gear ?? 1, throttle: s.throttle ?? 0, load: s.load ?? s.throttle ?? 0, running: s.running ?? true };
    driveAt = nowS;
  }

  function update(snap, dt) {
    nowS += dt || 0;
    if (snap) snapRef = snap;
    if (!ctx || !snap || !L || ctx.state !== 'running') return;
    const rv = snap.rv || {};
    const sp = Math.abs(rv.speed || 0);
    const t = ctx.currentTime;
    // ── engine state: FP gearbox if fresh, else our own from the snapshot ──
    const gi = snap.garage?.items;
    const engineState = snap.phase === 'garage' ? (gi?.engine || 'off') : 'on';
    let st;
    if (drive && nowS - driveAt < 0.5) st = drive;
    else {
      gb.update(dt, { speed: rv.speed || 0, airborne: !!rv.airborne, nitro: (rv.nitro || 0) > 0, engine: engineState, throttle: snap.phase === 'countdown' ? 0 : null });
      st = gb.state;
    }
    // starter crank → catch
    crank = engineState === 'cranking';
    if (prevEngine === 'cranking' && engineState === 'on') { catchT = 0.7; play('crankCatch'); }
    if (prevEngine && prevEngine !== engineState && engineState === 'cranking') catchT = 0;
    prevEngine = engineState;
    set(L.starter.g.gain, crank ? 0.16 : 0, crank ? 0.03 : 0.05);
    catchT = Math.max(0, catchT - dt);
    const flare = catchT > 0 ? Math.sin((catchT / 0.7) * Math.PI) * 1100 : 0;
    const running = engineState === 'on' && st.running !== false;
    const rpm = (running ? st.rpm : crank ? 190 : st.rpm) + flare;
    const thr = clamp(st.throttle || 0, 0, 1);
    L.eng.set({ rpm, throttle: thr, load: st.load || 0, running: running || crank, level: running ? 1 : crank ? 0.35 : 0 }, t, 0.04);
    // gear change clunk
    if (running && st.gear !== prevGear && st.gear >= 1 && prevGear >= 1) play('clunk', st.gear - prevGear);
    prevGear = st.gear;
    // overrun burble on lift-off
    if (running && prevThr - thr > 0.35 && rpm > 1700) burbleT = 0.9 + Math.random() * 0.4;
    prevThr = thr;
    if (burbleT > 0) {
      burbleT -= dt; burbleNext -= dt;
      if (burbleNext <= 0 && thr < 0.25) { play('pop', 0.08 + Math.random() * 0.12); burbleNext = 0.05 + Math.random() * 0.13; }
    }
    if ((rv.nitro || 0) > 0 && Math.random() < dt * 2.2) play('pop', 0.25);
    // ── road ──
    const off = rv.onRoad === false || rv.zone === 'dirt' || rv.zone === 'shoulder';
    set(L.tyre.g.gain, Math.min(0.11, sp * 0.0036) * (rv.airborne ? 0 : 1), 0.2);
    set(L.tyre.f.frequency, 260 + sp * 14, 0.2);
    const dust = snap.weather === 'dust' ? 1 : 0;
    set(L.wind.g.gain, Math.min(0.16, sp * 0.0032) + dust * 0.2 + (rv.airborne ? 0.12 : 0), 0.3);
    set(L.wind.f.frequency, 300 + sp * 22 + dust * 300, 0.3);
    set(L.gravel.g.gain, off && !rv.airborne ? Math.min(0.22, sp * 0.02) : 0, 0.12);
    L.gravel.src.playbackRate.setTargetAtTime(0.55 + Math.min(1.6, sp / 18), t, 0.2);
    // bumps → rattles / creaks / glassware
    const bump = (snap.feel && snap.feel.bump) || 0;
    rattleCd -= dt;
    if (rattleCd <= 0 && (bump > prevBump + 0.12 || bump > 0.45) && sp > 2) { play('rattle', clamp(0.5 + bump, 0.5, 1.4)); rattleCd = 0.22 + Math.random() * 0.2; }
    prevBump = bump;
    // brake squeal: hard deceleration at low speed
    const a = dt > 0 ? (sp - prevSpeed) / dt : 0; prevSpeed = sp;
    decel += (Math.max(0, -a) - decel) * Math.min(1, dt * 8);
    set(L.brake.g.gain, decel > 3 && sp > 0.6 && sp < 9 && !rv.airborne ? 0.03 : 0, 0.05);
    // ── entities ──
    const rx = rv.x || 0, rz = rv.z || 0;
    let car = 1e9, moto = 1e9, heli = 1e9, gateDown = false, steam = 1e9, water = 1e9, torn = 1e9, parade = 1e9, cows = 1e9;
    for (const e of snap.ents || []) {
      const dx = e[2] - rx, dz = e[4] - rz;
      const d = Math.hypot(dx, dz);
      const k = e[1];
      if (CAR_SIREN.has(k) && e[7] === 1) { if (d < car) car = d; }
      else if (k === MOTO && e[7] === 1) { if (d < moto) moto = d; }
      else if (k === HELI) { if (d < heli) heli = d; }
      else if (k === GATE) { if (e[7] === 1 && d < 120) gateDown = true; }
      else if (k === K.steam_leak) { if (d < steam) steam = d; }
      else if (k === K.water_main) { if (d < water) water = d; }
      else if (k === K.tornado) { if (d < torn) torn = d; }
      else if (k === K.parade_float || k === K.band_member) { if (d < parade) parade = d; }
      else if (k === K.cow) { if (d < cows) cows = d; }
    }
    sirenPhase += dt;
    if (car < 80) {
      const v = 0.14 * Math.pow(1 - car / 80, 1.2) + 0.02;
      const hi = Math.floor(sirenPhase / 0.55) % 2 === 0;
      set(L.siren.o.frequency, hi ? 960 : 720, 0.02); set(L.siren.o2.frequency, hi ? 960 : 720, 0.02);
      set(L.siren.g.gain, v, 0.05);
    } else set(L.siren.g.gain, 0, 0.15);
    set(L.moto.g.gain, moto < 90 ? 0.1 * Math.pow(1 - moto / 90, 1.1) + 0.015 : 0, 0.08);
    set(L.moto.bike.gain, moto < 70 ? 0.06 * (1 - moto / 70) : 0, 0.1);
    set(L.rotor.g.gain, heli < 150 ? 0.22 * (1 - heli / 150) : 0, 0.2);
    set(L.steam.g.gain, (steam < 45 ? 0.2 * Math.pow(1 - steam / 45, 2) : 0) + clamp(((snap.fx && snap.fx.fog) || 0) - 0.3, 0, 1) * 0.08, 0.15);
    set(L.water.g.gain, water < 50 ? 0.16 * Math.pow(1 - water / 50, 2) : 0, 0.15);
    set(L.tornado.g.gain, torn < 320 ? 0.42 * Math.pow(1 - torn / 320, 1.5) : 0, 0.4);
    const par = parade < 160 ? Math.pow(1 - parade / 160, 1.3) : 0;
    set(L.crowd.g.gain, par * 0.16, 0.4);
    // marching drums (112 bpm) + a brass pad near the parade
    if (par > 0.02) {
      if (drumNext < t) drumNext = t + 0.05;
      while (drumNext < t + 0.12) {
        const delay = Math.max(0, drumNext - t);
        const beat = drumBeat++ % 4;
        if (beat % 2 === 0) play('kick', par, delay); else play('snare', par, delay);
        if (beat === 3) play('snare', par * 0.6, delay + 0.13);
        drumNext += 60 / 112;
      }
      brassOn = true;
      set(L.brass.g.gain, par * 0.035 * (0.6 + 0.4 * Math.abs(Math.sin(sirenPhase * Math.PI * 112 / 60))), 0.05);
    } else if (brassOn) { brassOn = false; set(L.brass.g.gain, 0, 0.3); }
    // cattle
    if (cows < 70) { mooT -= dt; if (mooT <= 0) { play('moo', 1 - cows / 70); mooT = 3.5 + Math.random() * 4.5; } }
    // hose spray (Doc on the roof)
    const roof = snap.stop && snap.stop.roof;
    set(L.hose.g.gain, roof && roof.active && roof.spray ? 0.12 : 0, 0.05);
    // car wash
    const sps = snap.setpieces;
    const washIn = (sps || []).some((s) => s.type === 'car_wash' && !QUIET.has(s.phase) && (s.inside || s.phase === 'washing' || s.phase === 'inside'));
    const washK = washIn ? 1 : nearStructure(rz, 'car_wash', 22) ? (sps ? 0.25 : 0.5) : 0;
    set(L.wash.g.gain, washK * 0.16, 0.25); set(L.wash.spray.g.gain, washK * 0.07, 0.25);
    // bells: crossing gate down nearby, or a rising drawbridge ahead
    const bridgeBell = (snap.setpieces || []).some((s) => s.type === 'drawbridge' && !QUIET.has(s.phase)) && nearStructure(rz, 'drawbridge', 320);
    L.bell.t += dt;
    if (gateDown || bridgeBell) {
      const ph = (L.bell.t * (bridgeBell ? 1.3 : 2.2)) % 1;
      set(L.bell.g.gain, ph < 0.12 ? 0.12 : 0.0, 0.01);
    } else set(L.bell.g.gain, 0, 0.05);
    // indicator: tick-tock while pulling in to a supply stop
    const ns = snap.nearStop;
    const autoInd = snap.phase === 'drive' && ns && ns.dist > -10 && ns.dist < 150 && !(snap.looted || []).includes(ns.id) && !snap.stop;
    const want = indicatorForce != null ? indicatorForce : !!autoInd;
    if (want) { indT += dt; if (indT >= 0.36) { indT -= 0.36; indOn = !indOn; play('tick', indOn); } } else { indT = 0.3; indOn = false; }
    if (snap.heat && typeof snap.heat.stars === 'number') lastStars = snap.heat.stars;
  }

  function nearStructure(z, type, r) {
    const list = structures || STRUCTS;
    for (const s of list) {
      if (s.type !== type) continue;
      const a = s.from ?? s.z, b = s.to ?? s.z;
      if (z > a - r && z < b + r) return true;
    }
    return false;
  }

  function distTo(ev, snap) {
    const rv = (snap || snapRef || {}).rv;
    if (!rv || ev.x == null || ev.z == null) return 0;
    return Math.hypot(ev.x - rv.x, ev.z - rv.z);
  }

  function event(ev, snap) {
    if (!ev || !ctx) return;   // context only exists after unlock() / first user gesture
    switch (ev.type) {
      case EV.PED_HIT: play('bonk'); break;
      case EV.CRASH: play('crash', clamp(ev.power ?? 0.6, 0.2, 1.5)); break;
      case EV.SMASH: play('smash'); break;
      case EV.COP_WRECK: play('crash', 1.2); break;
      case EV.STOP_DONE: play('chime'); break;
      case EV.STARS: if ((ev.stars ?? 0) > lastStars) play('sting'); lastStars = ev.stars ?? lastStars; break;
      case EV.COPS_GAVE_UP: play('relief'); break;
      case EV.JUMP: play('whoosh'); break;
      case EV.LANDED: play('thud', !!ev.hard); break;
      case EV.FELL: play('fell'); break;
      case EV.TRAIN: if (ev.state === 'warn' || ev.state === 'pass') play('trainHorn'); break;
      case EV.GADGET: play('gadget', ev.gadget); break;
      case EV.SPOTTED: play('spotted'); break;
      case EV.END: play('end', !!(ev.result && ev.result.won)); break;
      case EV.CANISTER: {
        const d = distTo(ev, snap);
        const k = ev.hitRv ? 1 : clamp(1 - d / 60, 0.15, 1);
        if (ev.kind === 'foam') play('foam', k); else play('flashbang', k);
        break;
      }
      case EV.ROOF_HIT:
        if (ev.device === 'firecracker') play('firecracker', 0.9);
        else if (ev.device === 'balloon') play('splash', 0.8);
        else if (ev.device === 'hose') play('splash', 0.5);
        else if (ev.device === 'flare') play('whoosh');
        break;
      case EV.SETPIECE:
        if (ev.kind === 'drawbridge' && !QUIET.has(ev.phase)) play('ding');
        break;
      case EV.STOP_PARKED: play('clunk', -1); break;
      case 'horn': horn(true); setTimeout(() => horn(false), 350); break;
      default: break;
    }
  }

  function horn(on) {
    if (!ctx || !L || !L.horn) return;
    on = !!on;
    if (on === L.horn.on) return;
    L.horn.on = on;
    const t = ctx.currentTime, H = L.horn;
    if (on && !muted) {
      // air horn "blat": starts flat, settles on pitch
      H.o.forEach((o, i) => { o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(H.base[i] * 0.93, t); o.frequency.exponentialRampToValueAtTime(H.base[i], t + 0.09); });
      H.g.gain.cancelScheduledValues(t); H.g.gain.setTargetAtTime(0.15, t, 0.02);
    } else { H.g.gain.cancelScheduledValues(t); H.g.gain.setTargetAtTime(0, t, 0.05); }
  }
  function indicator(on) { indicatorForce = on == null ? null : !!on; }

  function setMuted(m) {
    muted = !!m;
    if (master) set(master.gain, muted ? 0 : vol, 0.03);
    if (muted) horn(false);
  }
  function setVolume(v) { vol = clamp(v, 0, 1); if (master && !muted) set(master.gain, vol, 0.05); }
  function destroy() { destroyed = true; if (ctx) { try { ctx.close(); } catch (e) { /* */ } } ctx = null; L = null; }

  /** Current values of the main engine parameters (tests / debug). */
  function inspect() {
    if (!ctx || !L) return { ready: false, state: ctx ? ctx.state : 'none' };
    const n = L.eng.nodes;
    const src = drive && nowS - driveAt < 0.5 ? 'fp' : 'internal';
    return {
      ready: true, state: ctx.state, source: src,
      cycleHz: n.o1.frequency.value, firingHz: n.o1.frequency.value * 8, lowpass: n.lp.frequency.value, drive: n.pre.gain.value,
      engineGain: n.g.gain.value, intake: n.inG.gain.value, whineHz: n.wh.frequency.value, muffle: muffle.frequency.value,
      gear: prevGear, starter: L.starter.g.gain.value,
    };
  }

  return {
    update, event, horn, unlock, setMuted, setVolume, destroy, play, setDriveState, indicator, inspect,
    get muted() { return muted; },
    get context() { return ctx; },
  };
}

// fallback structure list (route.json `structures`) for car-wash / drawbridge proximity
const STRUCTS = [{ type: 'drawbridge', from: 13180, to: 13230 }, { type: 'car_wash', z: 28200 }];
export function setAudioStructures(list) { if (Array.isArray(list)) { STRUCTS.length = 0; STRUCTS.push(...list); } }
