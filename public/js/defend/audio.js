// ─────────────────────────────────────────────────────────────────────────────
// DEFEND · gun sounds, synthesised with WebAudio (no files).
//   const a = new DefendAudio(audio);    // audio = render/audio.js createAudio() (CAB) or null
//   a.event(ev, snap, listener?)         EV.SHOT · RELOAD · COP_SHOT · COP_HIT · COP_DISABLED (one-shots)
//   a.play(name, { gain, pan, delay, lowpass })   'revolver'|'shotgun'|'rifle'|'casing'|'reload'|'shell'|
//                                        'bolt'|'pump'|'dry'|'copfire'|'ricochet'|'tyre'|'steam'|'thunk'
//   a.unlock()                           call from a user gesture (only needed without CAB's audio)
// With CAB's audio (audio.registerSfx / sfx / context): the sounds register there and play through its
// bus (mute + volume + the flashbang muffle apply). Without it: an own AudioContext, created lazily on
// the first pointerdown / keydown.
// Sounds: revolver crack (sharp transient + 2 kHz body), shotgun boom (low thump + wide noise),
// rifle crack + a late echo slap, brass clink on the roof, reload clicks, distant muffled cop fire
// (lowpassed, panned toward the cop), ricochet whine off the RV, tyre "pssht", radiator hiss.
// ─────────────────────────────────────────────────────────────────────────────
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function noiseBuffer(ctx, seconds = 2) {
  const n = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  return b;
}

// each synth: (ctx, out, o) → duration (s); o = { t0, noise, rate, gain }
function burst(ctx, out, noise, t0, { dur = 0.2, f = 2000, q = 0.8, type = 'bandpass', gain = 1, attack = 0.002, curve = 3, rate = 1 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noise; src.playbackRate.value = rate;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.setTargetAtTime(0, t0 + attack, dur / curve);
  src.connect(flt); flt.connect(g); g.connect(out);
  src.start(t0, Math.random() * 1.2); src.stop(t0 + dur * 2 + 0.05);
}
function tone(ctx, out, t0, { f0 = 120, f1 = 40, dur = 0.25, gain = 1, type = 'sine' } = {}) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
}
function click(ctx, out, noise, t0, f = 3500, gain = 0.5, dur = 0.025) { burst(ctx, out, noise, t0, { dur, f, q: 2.5, gain, attack: 0.001, curve: 4 }); }

export const SYNTH = {
  revolver(ctx, out, o) {
    const t = o.t0, n = o.noise;
    burst(ctx, out, n, t, { dur: 0.05, f: 4200, q: 0.6, gain: 1.4, type: 'highpass', curve: 5 });
    burst(ctx, out, n, t, { dur: 0.22, f: 1800, q: 0.9, gain: 1.0 });
    tone(ctx, out, t, { f0: 160, f1: 55, dur: 0.16, gain: 0.7 });
    burst(ctx, out, n, t + 0.09, { dur: 0.5, f: 900, q: 0.5, gain: 0.18, type: 'lowpass', curve: 2 });   // room tail
    return 0.8;
  },
  shotgun(ctx, out, o) {
    const t = o.t0, n = o.noise;
    burst(ctx, out, n, t, { dur: 0.06, f: 3000, q: 0.5, gain: 1.2, type: 'highpass', curve: 4 });
    burst(ctx, out, n, t, { dur: 0.45, f: 700, q: 0.4, gain: 1.4, type: 'lowpass', curve: 2.5 });
    tone(ctx, out, t, { f0: 95, f1: 32, dur: 0.38, gain: 1.1 });
    burst(ctx, out, n, t + 0.14, { dur: 0.9, f: 500, q: 0.4, gain: 0.25, type: 'lowpass', curve: 2 });
    return 1.3;
  },
  rifle(ctx, out, o) {
    const t = o.t0, n = o.noise;
    burst(ctx, out, n, t, { dur: 0.035, f: 5200, q: 0.5, gain: 1.6, type: 'highpass', curve: 6 });   // supersonic crack
    burst(ctx, out, n, t + 0.004, { dur: 0.28, f: 1200, q: 0.6, gain: 1.0 });
    tone(ctx, out, t, { f0: 130, f1: 40, dur: 0.22, gain: 0.8 });
    // echo slap off the buildings / the canyon
    burst(ctx, out, n, t + 0.32, { dur: 0.6, f: 800, q: 0.5, gain: 0.32, type: 'bandpass', curve: 2 });
    burst(ctx, out, n, t + 0.62, { dur: 0.7, f: 600, q: 0.5, gain: 0.14, type: 'bandpass', curve: 2 });
    return 1.6;
  },
  casing(ctx, out, o) {
    const t = o.t0, base = 3200 * (o.rate || 1);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * (0.07 + i * 0.03);
      const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = base * (1 + i * 0.13);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.28 / (i + 1), tt); g.gain.exponentialRampToValueAtTime(0.0008, tt + 0.08);
      osc.connect(g); g.connect(out); osc.start(tt); osc.stop(tt + 0.1);
    }
    return 0.4;
  },
  reload(ctx, out, o) {   // cylinder out, rounds in, snap shut
    const t = o.t0, n = o.noise;
    click(ctx, out, n, t, 2600, 0.5); click(ctx, out, n, t + 0.35, 4200, 0.35); click(ctx, out, n, t + 0.55, 4000, 0.3);
    click(ctx, out, n, t + 0.75, 3800, 0.3); click(ctx, out, n, t + (o.seconds || 2) - 0.15, 2200, 0.6, 0.04);
    return (o.seconds || 2) + 0.2;
  },
  shell(ctx, out, o) { click(ctx, out, o.noise, o.t0, 1800, 0.5, 0.05); click(ctx, out, o.noise, o.t0 + 0.08, 3200, 0.3); return 0.3; },
  pump(ctx, out, o) { const t = o.t0, n = o.noise; burst(ctx, out, n, t, { dur: 0.08, f: 1500, q: 1.5, gain: 0.55 }); burst(ctx, out, n, t + 0.16, { dur: 0.07, f: 1900, q: 1.5, gain: 0.6 }); return 0.4; },
  bolt(ctx, out, o) { const t = o.t0, n = o.noise; click(ctx, out, n, t, 2400, 0.4); burst(ctx, out, n, t + 0.1, { dur: 0.09, f: 2800, q: 1.2, gain: 0.35 }); click(ctx, out, n, t + 0.3, 2600, 0.45); return 0.5; },
  dry(ctx, out, o) { click(ctx, out, o.noise, o.t0, 2800, 0.45, 0.02); return 0.2; },
  copfire(ctx, out, o) {   // distant, muffled (the caller adds a lowpass + pan)
    const t = o.t0, n = o.noise;
    burst(ctx, out, n, t, { dur: 0.12, f: 1400, q: 0.7, gain: 0.9 });
    tone(ctx, out, t, { f0: 140, f1: 60, dur: 0.12, gain: 0.45 });
    burst(ctx, out, n, t + 0.18, { dur: 0.5, f: 500, q: 0.5, gain: 0.18, type: 'lowpass', curve: 2 });
    return 0.9;
  },
  ricochet(ctx, out, o) {
    const t = o.t0, n = o.noise;
    burst(ctx, out, n, t, { dur: 0.04, f: 5000, q: 1, gain: 0.8, type: 'highpass' });
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const f0 = 2600 + Math.random() * 1400;
    osc.frequency.setValueAtTime(f0, t + 0.01); osc.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0008, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
    osc.connect(g); g.connect(out); osc.start(t); osc.stop(t + 0.45);
    return 0.5;
  },
  thunk(ctx, out, o) { tone(ctx, out, o.t0, { f0: 420, f1: 160, dur: 0.06, gain: 0.35, type: 'triangle' }); burst(ctx, out, o.noise, o.t0, { dur: 0.05, f: 2400, q: 1, gain: 0.3 }); return 0.2; },
  tyre(ctx, out, o) { burst(ctx, out, o.noise, o.t0, { dur: 0.06, f: 900, q: 0.5, gain: 1.0, type: 'lowpass' }); burst(ctx, out, o.noise, o.t0 + 0.02, { dur: 1.2, f: 5000, q: 0.4, gain: 0.45, type: 'highpass', curve: 2 }); return 1.5; },
  steam(ctx, out, o) { burst(ctx, out, o.noise, o.t0, { dur: 2.2, f: 6000, q: 0.3, gain: 0.35, type: 'highpass', attack: 0.15, curve: 1.6 }); return 2.6; },
};

export class DefendAudio {
  constructor(audio = null) {
    this.audio = audio;
    this.ctx = null; this.out = null; this.noise = null;
    this.muted = false;
    this.registered = false;
    if (audio && typeof audio.registerSfx === 'function') {
      for (const [name, fn] of Object.entries(SYNTH)) audio.registerSfx('defend_' + name, (ctx, out, o) => fn(ctx, out, o));
      this.registered = true;
    } else if (typeof window !== 'undefined') {
      this._unlock = () => this.unlock();
      window.addEventListener('pointerdown', this._unlock, { once: true, capture: true });
      window.addEventListener('keydown', this._unlock, { once: true, capture: true });
    }
  }

  unlock() {
    if (this.registered) { try { this.audio.unlock?.(); } catch (e) { /* */ } return; }
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.out = this.ctx.createGain(); this.out.gain.value = 0.7; this.out.connect(this.ctx.destination);
      this.noise = noiseBuffer(this.ctx, 2);
    } catch (e) { this.ctx = null; }
  }

  setMuted(on) { this.muted = !!on; if (this.out) this.out.gain.value = on ? 0 : 0.7; }

  play(name, o = {}) {
    if (this.muted) return false;
    if (this.registered) { try { return !!this.audio.sfx('defend_' + name, o); } catch (e) { return false; } }
    const ctx = this.ctx, fn = SYNTH[name];
    if (!ctx || !fn || ctx.state !== 'running') return false;
    try {
      const g = ctx.createGain(); g.gain.value = clamp(o.gain ?? 1, 0, 4);
      let tail = g;
      if (o.lowpass) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lowpass; tail.connect(lp); tail = lp; }
      if (o.pan && ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = clamp(o.pan, -1, 1); tail.connect(pn); tail = pn; }
      tail.connect(this.out);
      const dur = fn(ctx, g, { ...o, t0: ctx.currentTime + Math.max(0, o.delay || 0), noise: this.noise });
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* */ } }, ((dur || 2) + (o.delay || 0) + 0.3) * 1000);
      return true;
    } catch (e) { return false; }
  }

  /** listener: { x, z, yaw } (the camera / the RV) for distance + pan. */
  event(ev, snap, listener = null) {
    if (!ev || !ev.type) return;
    const L = listener || (snap && snap.rv) || { x: 0, z: 0, yaw: 0 };
    const place = (x, z) => {
      if (!Number.isFinite(x)) return { gain: 1, pan: 0, dist: 0 };
      const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
      const yaw = L.yaw || 0, right = -(dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(1, d);   // +X is left in the RV frame
      return { gain: clamp(12 / Math.max(12, d), 0.12, 1), pan: clamp(right * 0.8, -0.8, 0.8), dist: d };
    };
    switch (ev.type) {
      case 'shot': {
        const p = place(ev.x, ev.z);
        this.play(ev.gun, { gain: p.gain * (ev.gun === 'shotgun' ? 1.0 : 0.9), pan: p.pan * 0.3 });
        if (ev.gun === 'shotgun') this.play('pump', { gain: 0.6 * p.gain, delay: 0.22 });
        if (ev.gun === 'rifle') this.play('bolt', { gain: 0.6 * p.gain, delay: 0.3 });
        if (ev.gun !== 'revolver') this.play('casing', { gain: 0.5 * p.gain, delay: ev.gun === 'rifle' ? 0.95 : 0.7, rate: ev.gun === 'shotgun' ? 0.55 : 1 });
        break;
      }
      case 'reload':
        if (ev.gun === 'shotgun') { const n = Math.max(1, Math.round((ev.seconds || 0.55) / 0.55)); for (let i = 0; i < n; i++) this.play('shell', { gain: 0.7, delay: i * 0.55 + 0.4 }); }
        else if (ev.gun === 'rifle') this.play('bolt', { gain: 0.7, delay: 0.3 }), this.play('thunk', { gain: 0.6, delay: 1.3 }), this.play('bolt', { gain: 0.7, delay: (ev.seconds || 2.6) - 0.5 });
        else this.play('reload', { gain: 0.8, seconds: ev.seconds || 2 });
        break;
      case 'copShot': {
        const p = place(ev.x, ev.z);
        this.play('copfire', { gain: 0.75 * p.gain, pan: p.pan, lowpass: 1800 - Math.min(1200, p.dist * 18) });
        if (ev.hit) this.play('ricochet', { gain: 0.55, pan: p.pan * 0.4, delay: 0.04 });
        break;
      }
      case 'copDisabled': {
        const p = place(ev.x, ev.z);
        if (ev.how === 'tyre') this.play('tyre', { gain: 0.6 * p.gain, pan: p.pan });
        else if (ev.how === 'radiator') this.play('steam', { gain: 0.6 * p.gain, pan: p.pan });
        break;
      }
      case 'copHit': {
        const p = place(ev.x, ev.z);
        if (ev.part !== 'tyre' && ev.part !== 'glass') this.play('thunk', { gain: 0.35 * p.gain, pan: p.pan, delay: Math.min(0.25, p.dist / 340) });
        break;
      }
      default: break;
    }
  }

  destroy() {
    if (this._unlock && typeof window !== 'undefined') { window.removeEventListener('pointerdown', this._unlock, { capture: true }); window.removeEventListener('keydown', this._unlock, { capture: true }); }
    if (this.ctx) { try { this.ctx.close(); } catch (e) { /* */ } }
    this.ctx = null;
  }
}
