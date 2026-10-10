// ─────────────────────────────────────────────────────────────────────────────
// Windscreen condensation for the first-person cab: a quad lying exactly in the
// rv_cab_fp windshield plane (RV-local; buildRV: base z 3.32 / y 1.38 → top z 2.72 / y 2.14)
// with a small CanvasTexture: a blurred white fog density field + droplets.
// Fog builds up from snap.fx.fog (steam / burst water main) and is wiped clear wherever the
// cab's real wiper arms sweep (their pivots + angles are sampled in the glass plane), so the
// cleared fans match the blades on screen. Because it sits on the glass it stays put when the
// driver turns his head.
//   const ws = new WindscreenFog(rvFrame);
//   ws.update(dt, { fog, speed, light, wipers: [{ mount, angle, prev }] })
//   ws.density → average fog 0..1 · ws.dispose()
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const X0 = -1.1, X1 = 1.1, Y0 = 1.395, Y1 = 2.115;            // glass opening (RV-local)
const zWS = (y) => 3.32 - (y - 1.38) * (0.6 / 0.76);
const OUT = new THREE.Vector3(0, 0.6, 0.76).normalize();      // glass normal (outward)
const GW = 64, GH = 26;                                       // density grid
const TW = 256, TH = 104;                                     // texture
const ARM_LEN = 0.66;
const _v = new THREE.Vector3();

export class WindscreenFog {
  constructor(frame) {
    this.frame = frame;
    this.d = new Float32Array(GW * GH);
    this.grain = new Float32Array(GW * GH);
    for (let i = 0; i < this.grain.length; i++) {
      const gx = i % GW, gy = (i / GW) | 0;
      this.grain[i] = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(gx * 0.9 + Math.sin(gy * 0.7) * 2.1) * Math.cos(gy * 1.3 + gx * 0.21)) * (0.75 + Math.random() * 0.25);
    }
    this.drops = [];
    this.density = 0;
    this.redraw = 0;
    this.t = 0;
    // canvases
    this.small = document.createElement('canvas'); this.small.width = GW; this.small.height = GH;
    this.sctx = this.small.getContext('2d');
    this.img = this.sctx.createImageData(GW, GH);
    this.big = document.createElement('canvas'); this.big.width = TW; this.big.height = TH;
    this.ctx = this.big.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.big);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.premultiplyAlpha = true;            // filter in premultiplied space: no dark fringes at cleared edges
    // quad in the glass plane, nudged 1 cm outward
    const g = new THREE.BufferGeometry();
    const corner = (x, y) => { const z = zWS(y); return [x + OUT.x * 0.012, y + OUT.y * 0.012, z + OUT.z * 0.012]; };
    // u runs left→right as Rook sees it (Rook's left is +X), v bottom→top
    const P = [...corner(X1, Y0), ...corner(X0, Y0), ...corner(X0, Y1), ...corner(X1, Y1)];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeBoundingSphere();
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, name: 'CR_WindscreenFog' });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'fp_windscreen_fog';
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    frame.add(this.mesh);
  }

  /** RV-local point → grid cell (or -1). */
  _cell(x, y) {
    const u = (X1 - x) / (X1 - X0), v = (Y1 - y) / (Y1 - Y0);          // v: 0 at the top row
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return -1;
    return ((v * GH) | 0) * GW + ((u * GW) | 0);
  }

  _wipe(mount, a0, a1) {
    if (!mount) return 0;
    mount.updateMatrix();
    const span = a1 - a0;
    const n = Math.min(40, Math.ceil(Math.abs(span) / 0.035) + 1);
    let cleared = 0;
    for (let k = 0; k <= n; k++) {
      const a = a0 + span * (k / n);
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let s = 0.07; s <= ARM_LEN; s += 0.022) {
        _v.set(s * ca, s * sa, 0).applyMatrix4(mount.matrix);          // mount is a child of the RV frame
        const c = this._cell(_v.x, _v.y);
        if (c < 0) continue;
        const cx = c % GW, cy = (c / GW) | 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox, yy = cy + oy;
          if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
          const i = yy * GW + xx;
          if (this.d[i] > 0.02) { cleared += this.d[i]; this.d[i] *= ox || oy ? 0.25 : 0.04; }
        }
        // droplets under the blade go too
        if (this.drops.length) {
          const u = (X1 - _v.x) / (X1 - X0) * TW, vv = (Y1 - _v.y) / (Y1 - Y0) * TH;
          this.drops = this.drops.filter((d) => (d.x - u) * (d.x - u) + (d.y - vv) * (d.y - vv) > 64);
        }
      }
    }
    return cleared;
  }

  update(dt, { fog = 0, speed = 0, light = 1, wipers = [] } = {}) {
    this.t += dt;
    const d = this.d;
    const f = Math.max(0, Math.min(1, fog));
    // condense / evaporate
    let sum = 0;
    const grow = f > 0.02 ? dt * (0.55 + f * 1.6) * f : 0;
    const dry = dt * (f > 0.02 ? 0.02 : 0.09 + Math.min(0.12, speed * 0.004));
    for (let i = 0; i < d.length; i++) {
      let v = d[i];
      if (grow > 0) v += grow * this.grain[i] * (Math.min(1, f * 1.15) - v * 0.85);
      v -= dry * (0.6 + 0.4 * this.grain[i]);
      d[i] = v < 0 ? 0 : v > 1 ? 1 : v;
      sum += d[i];
    }
    for (const w of wipers) if (w && w.mount && Math.abs(w.angle - w.prev) > 1e-4) this._wipe(w.mount, w.prev, w.angle);
    this.density = sum / d.length;
    // droplets
    if (f > 0.05 && this.drops.length < 70) {
      const n = f * dt * 34;
      const cnt = Math.min(4, Math.floor(n) + (Math.random() < n % 1 ? 1 : 0));
      for (let k = 0; k < cnt && this.drops.length < 70; k++) {
        this.drops.push({ x: Math.random() * TW, y: Math.random() * TH, r: 1.1 + Math.random() * 2.6, vy: 0 });
      }
    }
    const air = speed > 14 ? -(speed - 14) * 0.9 : 3;            // fast: airflow pushes drops up the glass
    for (const p of this.drops) { p.vy += ((air * (0.5 + p.r * 0.2)) - p.vy) * Math.min(1, dt * 2); p.y += p.vy * dt; }
    if (this.drops.length) this.drops = this.drops.filter((p) => p.y > -4 && p.y < TH + 4);
    if (f < 0.02 && this.density < 0.004) this.drops.length = 0;
    const vis = this.density > 0.003 || this.drops.length > 0;
    this.mesh.visible = vis;
    if (!vis) return;
    this.mat.color.setScalar(Math.max(0.35, Math.min(1, light)));
    // redraw at ~15 Hz
    this.redraw -= dt;
    if (this.redraw > 0) return;
    this.redraw = 1 / 15;
    this._draw();
  }

  _draw() {
    const px = this.img.data, d = this.d;
    for (let i = 0; i < d.length; i++) {
      const a = Math.min(1, d[i] * (0.62 + 0.38 * this.grain[i]) * 1.05);
      const o = i * 4;
      px[o] = 236; px[o + 1] = 240; px[o + 2] = 242; px[o + 3] = (a * 232) | 0;
    }
    this.sctx.putImageData(this.img, 0, 0);
    const c = this.ctx;
    c.clearRect(0, 0, TW, TH);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.small, 0, 0, TW, TH);
    // a second, offset pass softens the cell edges (cheap blur)
    c.globalAlpha = 0.45;
    c.drawImage(this.small, -2, 1.5, TW + 4, TH + 3);
    c.globalAlpha = 1;
    for (const p of this.drops) {
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fillStyle = 'rgba(70,80,86,0.30)'; c.fill();
      c.beginPath(); c.arc(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.45, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill();
    }
    this.tex.needsUpdate = true;
  }

  clear() { this.d.fill(0); this.drops.length = 0; this.density = 0; this.mesh.visible = false; }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
