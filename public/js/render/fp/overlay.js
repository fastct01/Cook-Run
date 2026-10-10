// ─────────────────────────────────────────────────────────────────────────────
// First-person screen overlay (DOM, pointer-events: none), sized to the canvas:
//   • soft vignette (always on in first person)
//   • white-out from snap.fx.flash (flashbang), with a warm afterimage blob
//   • shock: blue edge glow + jagged electric sparks along the screen edges (fx.shock)
// The fog itself lives on the glass (windscreen.js). Inline styles: no CSS dependency.
//   const o = new FpOverlay(hostEl, canvas); o.update(dt, { on, flash, shock, look }); o.destroy();
// ─────────────────────────────────────────────────────────────────────────────
const SW = 320, SH = 180;

export class FpOverlay {
  constructor(host, canvas) {
    this.canvas = canvas;
    this.host = host || canvas.parentElement;
    if (this.host && getComputedStyle(this.host).position === 'static') this.host.style.position = 'relative';
    this.sameBox = !!host && host !== canvas.parentElement;   // a HUD root already covers the canvas
    const o = document.createElement('div');
    o.className = 'fpx';
    o.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2;display:none;';
    o.innerHTML = `
      <div class="fpx-vig" style="position:absolute;inset:0;background:radial-gradient(ellipse 85% 80% at 50% 46%, rgba(12,10,8,0) 58%, rgba(12,10,8,.30) 84%, rgba(8,6,4,.62) 100%)"></div>
      <div class="fpx-shockglow" style="position:absolute;inset:0;opacity:0;box-shadow:inset 0 0 70px 18px rgba(90,160,255,.85), inset 0 0 14px 4px rgba(220,240,255,.9)"></div>
      <canvas class="fpx-sparks" width="${SW}" height="${SH}" style="position:absolute;inset:0;width:100%;height:100%;opacity:0;mix-blend-mode:screen"></canvas>
      <div class="fpx-flash" style="position:absolute;inset:0;opacity:0;background:radial-gradient(circle at 50% 44%, #ffffff 0%, #fffef8 42%, #f6f2e6 100%)"></div>
      <div class="fpx-after" style="position:absolute;left:50%;top:44%;width:34vmin;height:34vmin;margin:-17vmin 0 0 -17vmin;border-radius:50%;opacity:0;
        background:radial-gradient(circle, rgba(120,190,255,.55), rgba(255,170,90,.25) 45%, rgba(255,170,90,0) 70%);mix-blend-mode:multiply;filter:blur(6px)"></div>`;
    if (this.host) { if (this.sameBox) this.host.insertBefore(o, this.host.firstChild); else this.host.appendChild(o); }
    this.el = o;
    this.vig = o.querySelector('.fpx-vig');
    this.flashEl = o.querySelector('.fpx-flash');
    this.after = o.querySelector('.fpx-after');
    this.glow = o.querySelector('.fpx-shockglow');
    this.sparks = o.querySelector('.fpx-sparks');
    this.sctx = this.sparks.getContext('2d');
    this.flash = 0; this.afterK = 0; this.shock = 0; this.t = 0; this.sparkT = 0;
    this._shown = false;
  }

  _layout() {
    if (this.sameBox) return;
    const c = this.canvas, s = this.el.style;
    s.inset = 'auto';
    s.left = c.offsetLeft + 'px'; s.top = c.offsetTop + 'px';
    s.width = c.clientWidth + 'px'; s.height = c.clientHeight + 'px';
  }

  update(dt, { on = true, flash = 0, shock = 0, look = 0 } = {}) {
    this.t += dt;
    if (!on) { if (this._shown) { this.el.style.display = 'none'; this._shown = false; } this.flash = 0; this.shock = 0; return; }
    if (!this._shown) { this.el.style.display = 'block'; this._shown = true; }
    this._layout();
    // flash: instant attack, the sim's value drives the decay; afterimage lingers a bit longer
    const f = Math.max(0, Math.min(1, flash));
    this.flash = f > this.flash ? f : this.flash + (f - this.flash) * Math.min(1, dt * 5);
    if (f > 0.5) this.afterK = Math.max(this.afterK, f);
    this.afterK = Math.max(0, this.afterK - dt * 0.55);
    this.flashEl.style.opacity = Math.min(1, this.flash * 1.15).toFixed(3);
    this.after.style.opacity = (this.flash < 0.6 ? this.afterK * 0.9 : 0).toFixed(3);
    this.vig.style.opacity = (1 - look).toFixed(3);
    // shock
    const s = Math.max(0, Math.min(1, shock));
    this.shock += (s - this.shock) * Math.min(1, dt * (s > this.shock ? 30 : 6));
    const k = this.shock;
    this.glow.style.opacity = (k * (0.55 + 0.45 * Math.abs(Math.sin(this.t * 41)))).toFixed(3);
    this.sparks.style.opacity = k > 0.02 ? '1' : '0';
    if (k > 0.02) {
      this.sparkT -= dt;
      if (this.sparkT <= 0) { this.sparkT = 1 / 24; this._drawSparks(k); }
    }
  }

  _drawSparks(k) {
    const c = this.sctx;
    c.clearRect(0, 0, SW, SH);
    const n = 2 + Math.round(k * 6);
    for (let i = 0; i < n; i++) {
      // start on a random edge, zig-zag inward
      const e = (Math.random() * 4) | 0;
      let x = e === 0 ? 0 : e === 1 ? SW : Math.random() * SW;
      let y = e === 2 ? 0 : e === 3 ? SH : Math.random() * SH;
      const tx = SW / 2 + (Math.random() - 0.5) * SW * 0.5, ty = SH / 2 + (Math.random() - 0.5) * SH * 0.5;
      const len = 0.18 + Math.random() * 0.22 * k;
      const steps = 7;
      c.beginPath(); c.moveTo(x, y);
      for (let sIdx = 0; sIdx < steps; sIdx++) {
        x += (tx - x) * len / steps * 3 + (Math.random() - 0.5) * 18;
        y += (ty - y) * len / steps * 3 + (Math.random() - 0.5) * 18;
        c.lineTo(x, y);
      }
      c.strokeStyle = 'rgba(120,190,255,0.55)'; c.lineWidth = 4; c.stroke();
      c.strokeStyle = 'rgba(235,248,255,0.95)'; c.lineWidth = 1.3; c.stroke();
    }
  }

  destroy() { this.el.remove(); }
}
