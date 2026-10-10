// ─────────────────────────────────────────────────────────────────────────────
// hazards3d — everything in the van that reacts to the lab / the road:
//   fire at the stove (flame cones + flicker light + black smoke + embers), fumes haze volume,
//   vent fan spin + louvers + smoke sucked out through the fan, curtains open/close,
//   cop-alarm red/blue wash through the windows, extinguisher spray, explosion flash,
//   stash bags, pantry jar levels, hull holes vs RV hp, burner flame while the heat step runs
//   unattended, cook-down stars.
// Particles here live in VAN-LOCAL space (they ride along with the van) — a tiny two-layer
// billboard system using the view's particle atlas (2 draw calls).
// Unity: one LabHazards MonoBehaviour driving ParticleSystems (local simulation space), a Light,
// and the named interior objects.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { particleAtlas, ATLAS } from '../render/textures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

// ── van-local billboard particles ─────────────────────────────────────────────
const PVERT = /* glsl */`
  attribute vec3 iPos; attribute vec4 iCol; attribute vec3 iMisc;
  varying vec4 vCol; varying vec2 vUv;
  void main() {
    vCol = iCol;
    float cell = iMisc.z;
    vec2 cellXY = vec2(mod(cell, 4.0), floor(cell / 4.0));
    vUv = (cellXY + vec2(uv.x, 1.0 - uv.y)) * 0.25; vUv.y = 1.0 - vUv.y;
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    float c = cos(iMisc.y), s = sin(iMisc.y);
    vec2 p = (uv - 0.5) * iMisc.x;
    mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    gl_Position = projectionMatrix * mv;
  }`;
const PFRAG = /* glsl */`
  uniform sampler2D map; varying vec4 vCol; varying vec2 vUv;
  void main() {
    vec4 t = texture2D(map, vUv);
    vec4 c = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
    if (c.a < 0.004) discard;
    gl_FragColor = c;
    #include <colorspace_fragment>
  }`;
class PLayer {
  constructor(cap, additive) {
    this.cap = cap;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 4); this.misc = new Float32Array(cap * 3);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(this.misc, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iMisc', this.aMisc);
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({ vertexShader: PVERT, fragmentShader: PFRAG, uniforms: { map: { value: particleAtlas() } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 13 : 12;
    this.mesh.name = additive ? 'van_particles_add' : 'van_particles';
    this.geo = g; this.mat = m;
    this.alive = []; this.onceList = [];
  }
  spawn(o) {
    if (this.alive.length >= this.cap) this.alive.shift();
    this.alive.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, age: 0, life: o.life || 1, s0: o.size ?? 0.2, s1: o.size1 ?? o.size ?? 0.2,
      r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1, r1: o.r1 ?? o.r ?? 1, g1: o.g1 ?? o.g ?? 1, b1: o.b1 ?? o.b ?? 1, a: o.alpha ?? 1, rot: o.rot ?? Math.random() * 6.28, vr: o.spin ?? 0,
      cell: o.cell ?? 0, drag: o.drag ?? 0, grav: o.gravity ?? 0, floor: o.floor ?? -1e9, fadeIn: o.fadeIn ?? 0.08 });
  }
  once(o) { if (this.onceList.length < 120) this.onceList.push(o); }
  update(dt) {
    let n = 0;
    const P = this.pos, C = this.col, M = this.misc, keep = [];
    for (const q of this.alive) {
      q.age += dt;
      if (q.age >= q.life) continue;
      const k = Math.exp(-q.drag * dt);
      q.vx *= k; q.vy = q.vy * k - q.grav * dt; q.vz *= k;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.floor) { q.y = q.floor; q.vy *= -0.25; q.vx *= 0.5; q.vz *= 0.5; }
      q.rot += q.vr * dt;
      keep.push(q);
      if (n >= this.cap) continue;
      const t = q.age / q.life, fi = q.fadeIn > 0 ? Math.min(1, q.age / q.fadeIn) : 1;
      P[n * 3] = q.x; P[n * 3 + 1] = q.y; P[n * 3 + 2] = q.z;
      C[n * 4] = q.r + (q.r1 - q.r) * t; C[n * 4 + 1] = q.g + (q.g1 - q.g) * t; C[n * 4 + 2] = q.b + (q.b1 - q.b) * t; C[n * 4 + 3] = q.a * fi * (1 - t * t);
      M[n * 3] = q.s0 + (q.s1 - q.s0) * Math.sqrt(t); M[n * 3 + 1] = q.rot; M[n * 3 + 2] = q.cell;
      n++;
    }
    this.alive = keep;
    for (const o of this.onceList) {
      if (n >= this.cap) break;
      P[n * 3] = o.x; P[n * 3 + 1] = o.y; P[n * 3 + 2] = o.z;
      C[n * 4] = o.r ?? 1; C[n * 4 + 1] = o.g ?? 1; C[n * 4 + 2] = o.b ?? 1; C[n * 4 + 3] = o.alpha ?? 1;
      M[n * 3] = o.size ?? 0.2; M[n * 3 + 1] = o.rot ?? 0; M[n * 3 + 2] = o.cell ?? 0;
      n++;
    }
    this.onceList.length = 0;
    this.geo.instanceCount = n;
    if (n) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aMisc.needsUpdate = true; }
    this.mesh.visible = n > 0;
  }
  clear() { this.alive.length = 0; }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}
export class VanParticles {
  constructor(parent, cap = 320) {
    this.normal = new PLayer(cap, false);
    this.add = new PLayer(Math.floor(cap / 2), true);
    parent.add(this.normal.mesh, this.add.mesh);
  }
  spawn(o) { (o.additive ? this.add : this.normal).spawn(o); }
  once(o) { (o.additive ? this.add : this.normal).once(o); }
  update(dt) { this.normal.update(dt); this.add.update(dt); }
  get count() { return this.normal.alive.length + this.add.alive.length; }
  clear() { this.normal.clear(); this.add.clear(); }
  dispose() { this.normal.dispose(); this.add.dispose(); }
}

// ── noise texture for the fumes haze ─────────────────────────────────────────
function hazeTexture() {
  if (typeof document === 'undefined') return null;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const x = r() * S, y = r() * S, rad = 10 + r() * 26;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      gr.addColorStop(0, `rgba(255,255,255,${0.32 + r() * 0.25})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Hazards3D {
  constructor(interior, view, lab, data) {
    this.it = interior; this.view = view; this.lab = lab; this.data = data;
    const P = interior.parts, D = interior.dims;
    this.P = P; this.D = D;
    this.parts = new VanParticles(interior.root, 360);
    this.t = 0;
    // burner centre (van-local)
    const stove = interior.anchors.stove;
    stove.updateMatrix();
    // the pot on VANCOOK's camp stove (presenters/props.js LAYOUT.stove + STOVE.potBase), anchor space
    this.burner = new THREE.Vector3(-0.08, 0.1, -0.345).applyMatrix4(stove.matrix);
    // ── fire: flame cones (InstancedMesh, additive) ──
    const flameGeo = new THREE.ConeGeometry(0.07, 0.34, 6, 1, true).translate(0, 0.17, 0);
    this.flames = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 9);
    this.flames.name = 'fire_flames';
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 6;
    const fc = ['#e8461a', '#f07020', '#f5a030', '#e85818', '#f8c050', '#ee6a1e', '#f29a2e', '#d83c10', '#fbd070'];
    for (let i = 0; i < 9; i++) this.flames.setColorAt(i, new THREE.Color(fc[i]));
    this.flames.count = 0;
    interior.root.add(this.flames);
    this.flameSeeds = Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * Math.PI * 2 + i * 0.7, r: i === 0 ? 0 : 0.05 + (i % 3) * 0.05, ph: i * 1.7, s: 0.7 + (i % 4) * 0.18 }));
    // burner (blue gas ring) while a heat step runs without the presenter
    const burnGeo = new THREE.ConeGeometry(0.018, 0.06, 4, 1, true).translate(0, 0.03, 0);
    this.burn = new THREE.InstancedMesh(burnGeo, new THREE.MeshBasicMaterial({ color: '#5aa8ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 12);
    this.burn.name = 'burner_flame';
    this.burn.frustumCulled = false;
    this.burn.count = 0;
    interior.root.add(this.burn);
    // ── fumes haze: 3 stacked noisy sheets filling the lab ──
    {
      const tex = hazeTexture();
      const geos = [];
      const w = 2 * D.XI - 0.1, l = D.ZP - D.ZRI - 0.1;
      for (const [h, rot] of [[0.35, 0], [0.95, 1.3], [1.55, 2.4]]) {
        const g = new THREE.PlaneGeometry(w, l, 1, 1).rotateX(-Math.PI / 2);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.6 + rot, uv.getY(i) * 4.2 + rot * 0.7);
        g.translate(0, D.FY + h, (D.ZP + D.ZRI) / 2);
        geos.push(g);
      }
      const merged = mergeGeos(geos);
      this.hazeMat = new THREE.MeshBasicMaterial({ color: '#9ed46a', map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      this.haze = new THREE.Mesh(merged, this.hazeMat);
      this.haze.name = 'fumes_haze';
      this.haze.renderOrder = 7;
      this.haze.visible = false;
      interior.root.add(this.haze);
    }
    // ── cop wash: additive quads on every window + light patches on the floor/counters ──
    {
      const geos = [];
      for (const [z0, z1] of D.WINDOWS) {
        geos.push(new THREE.PlaneGeometry(z1 - z0 + 0.1, D.WIN1 - D.WIN0 + 0.1).rotateY(-Math.PI / 2).translate(D.XI - 0.02, (D.WIN0 + D.WIN1) / 2, (z0 + z1) / 2));
        geos.push(new THREE.PlaneGeometry(1.0, z1 - z0 + 0.3).rotateX(-Math.PI / 2).translate(0.25, D.FY + 0.012, (z0 + z1) / 2 - 0.1));
      }
      geos.push(new THREE.PlaneGeometry(1.1, 0.55).translate(0, D.FY + 0.78, D.ZRI + 0.02));
      geos.push(new THREE.PlaneGeometry(1.2, 0.9).rotateX(-Math.PI / 2).translate(0, D.FY + 0.012, D.ZRI + 0.6));
      this.washMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      this.wash = new THREE.Mesh(mergeGeos(geos), this.washMat);
      this.wash.name = 'cop_wash';
      this.wash.renderOrder = 5;
      this.wash.visible = false;
      interior.root.add(this.wash);
    }
    // state
    this.curtK = lab.curtainsClosed ? 1 : 0;
    this.fanW = 0; this.fanA = 0; this.louverK = 0;
    this.fireVis = 0;
    this.flash = 0;
    this.prevUnits = -1;
    this.jarFill = P.jarSlots.map(() => 0);
    this.acc = { smoke: 0, ember: 0, vent: 0, spray: 0, fume: 0 };
    this.explodeUnsub = lab.subscribe ? lab.subscribe((type, d) => {
      if (type === 'explosion') this.explode();
      if (type === 'extinguish' && d && d.how === 'beat') this._beatPuff();
    }) : null;
  }

  /** Van mode on/off: while on, the RV view's vent smoke comes out of our fan instead of the (hidden) roof chimney. */
  setActive(on) {
    if (this.view.rv) this.view.rv.ventOverride = on ? this.P.ventPos.clone() : null;
  }

  /** ctx: { snap, doc (DocController), presenterAt(stationId) → bool, spray: { on, origin: Vector3, dir: Vector3 } , docHead: Vector3 } */
  update(dt, ctx) {
    this.t += dt;
    const lab = this.lab, snap = ctx.snap || {}, P = this.P, D = this.D, parts = this.parts;
    const t = this.t;
    // ── curtains ──
    const closed = !!lab.curtainsClosed;
    this.curtK += ((closed ? 1 : 0) - this.curtK) * (1 - Math.exp(-dt * 5));
    for (const c of P.curtains) {
      const k = c.open + (c.closed - c.open) * this.curtK;
      c.mesh.scale.z = c.sign * k;
      c.mesh.rotation.x = Math.sin(t * 2.3 + c.mesh.id) * 0.015 * (ctx.sway || 0);
    }
    // ── vent fan + louvers + smoke being pulled out ──
    const vent = !!lab.ventOpen;
    this.fanW += ((vent ? 24 : 0) - this.fanW) * (1 - Math.exp(-dt * (vent ? 1.5 : 0.8)));
    this.fanA += this.fanW * dt;
    P.fanBlades.rotation.x = this.fanA;
    this.louverK += ((vent ? 1 : 0) - this.louverK) * (1 - Math.exp(-dt * 6));
    for (const l of P.louvers.children) l.rotation.z = -this.louverK * 1.0;
    const fumes = lab.fumes || 0, fire = this.wreck ? 1 : lab.fire || 0;   // [wreck] the RV blew up: everything burns
    if (vent && (fumes > 0.04 || fire > 0 || lab.cooking)) {
      this.acc.vent += dt * (3 + fumes * 14 + fire * 10);
      while (this.acc.vent > 1) {
        this.acc.vent -= 1;
        // puffs drift from the room toward the fan and out
        const sx = 0.2 + Math.random() * 0.6, sy = D.FY + 1.1 + Math.random() * 0.5, sz = P.ventPos.z + (Math.random() - 0.5) * 1.2;
        const tx = P.ventPos.x - 0.1 - sx, ty = P.ventPos.y - sy, tz = P.ventPos.z - sz;
        const g = fire > 0 ? 0.35 : 0.82;
        parts.spawn({ x: sx, y: sy, z: sz, vx: tx * 1.1, vy: ty * 1.1, vz: tz * 1.1, life: 0.9, size: 0.18, size1: 0.08, r: g * 0.85, g: g * (fire > 0 ? 0.9 : 1.02), b: g * 0.9, alpha: 0.45, cell: ATLAS.PUFF, drag: 0.2, spin: 1 });
      }
    }
    // ── fire ──
    this.fireVis += (fire - this.fireVis) * (1 - Math.exp(-dt * 6));
    const fv = fire > 0 ? Math.max(0.12, this.fireVis) : this.fireVis < 0.02 ? 0 : this.fireVis;
    // VANCOOK's stove presenters draw their own flames around the pot → ours only when none is alive
    const ownFire = !(ctx.presenterAt && ctx.presenterAt('stove'));
    const nFl = fv > 0.01 && ownFire ? Math.min(9, 3 + Math.round(fv * 6)) : 0;
    this.flames.count = nFl;
    for (let i = 0; i < nFl; i++) {
      const s = this.flameSeeds[i];
      const fl = 0.75 + 0.25 * Math.sin(t * 17 + s.ph) * Math.sin(t * 7.3 + s.ph * 2);
      const h = (0.5 + fv * 1.6) * s.s * fl;
      const w = (0.7 + fv * 1.3) * (0.8 + 0.2 * Math.sin(t * 11 + s.ph));
      const r = s.r * (0.6 + fv);
      _p.set(this.burner.x + Math.cos(s.a + t * 0.6) * r * 0.8, this.burner.y + 0.02, this.burner.z + Math.sin(s.a + t * 0.6) * r);
      _e.set(Math.sin(t * 9 + s.ph) * 0.18 + (ctx.lat || 0) * 0.02, 0, Math.cos(t * 8 + s.ph) * 0.18);
      _q.setFromEuler(_e);
      _s.set(w, h, w);
      _m.compose(_p, _q, _s);
      this.flames.setMatrixAt(i, _m);
    }
    if (nFl) this.flames.instanceMatrix.needsUpdate = true;
    if (fv > 0.02) {
      this.acc.smoke += dt * (4 + fv * 16);
      while (this.acc.smoke > 1) {
        this.acc.smoke -= 1;
        const dark = 0.12 + Math.random() * 0.1;
        parts.spawn({ x: this.burner.x + (Math.random() - 0.5) * 0.2, y: this.burner.y + 0.35 + fv * 0.3, z: this.burner.z + (Math.random() - 0.5) * 0.2,
          vx: (vent ? 0.25 : 0) + (Math.random() - 0.5) * 0.25 - (ctx.lat || 0) * 0.02, vy: 0.7 + Math.random() * 0.5, vz: (vent ? (P.ventPos.z - this.burner.z) * 0.25 : 0) + (Math.random() - 0.5) * 0.25,
          life: 1.6 + fv, size: 0.22, size1: 0.9 + fv * 0.6, r: dark, g: dark * 0.95, b: dark * 0.92, alpha: 0.55 + fv * 0.3, cell: ATLAS.PUFF, drag: 0.6, spin: (Math.random() - 0.5) * 1.2 });
      }
      this.acc.ember += dt * (6 + fv * 20);
      while (this.acc.ember > 1) {
        this.acc.ember -= 1;
        parts.spawn({ x: this.burner.x + (Math.random() - 0.5) * 0.25, y: this.burner.y + 0.1, z: this.burner.z + (Math.random() - 0.5) * 0.25,
          vx: (Math.random() - 0.5) * 0.6, vy: 1.2 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.6, life: 0.6 + Math.random() * 0.4, size: 0.05, size1: 0.02, r: 1, g: 0.75, b: 0.3, r1: 1, g1: 0.35, b1: 0.1, cell: ATLAS.SPARK, additive: true, drag: 0.8 });
      }
      if (ownFire) parts.once({ x: this.burner.x, y: this.burner.y + 0.25 + fv * 0.2, z: this.burner.z, size: 0.7 + fv * 1.1, r: 1, g: 0.5, b: 0.18, alpha: 0.35 + 0.15 * Math.sin(t * 21), cell: ATLAS.GLOW, additive: true });
    }
    // [wreck] flames all through the lab
    if (this.wreck) {
      this.acc.wreck = (this.acc.wreck || 0) + dt * 40;
      while (this.acc.wreck > 1) {
        this.acc.wreck -= 1;
        const x = (Math.random() - 0.5) * 2 * (D.XI - 0.15), z = D.ZRI + 0.2 + Math.random() * (D.ZP - D.ZRI - 0.4), y = D.FY + 0.1 + Math.random() * 1.2;
        parts.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: 0.8 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.3, life: 0.5 + Math.random() * 0.4,
          size: 0.35 + Math.random() * 0.3, size1: 0.9, r: 1, g: 0.8, b: 0.4, r1: 0.9, g1: 0.25, b1: 0.05, alpha: 0.9, cell: ATLAS.FLAME, additive: true, drag: 0.6 });
        if (Math.random() < 0.35) parts.spawn({ x, y: y + 0.6, z, vx: (Math.random() - 0.5) * 0.3, vy: 0.6, vz: (Math.random() - 0.5) * 0.3, life: 2, size: 0.4, size1: 1.4, r: 0.08, g: 0.075, b: 0.07, alpha: 0.7, cell: ATLAS.PUFF, drag: 0.5 });
      }
    }
    // unattended heat step → blue burner ring stays lit
    const g = lab.current;
    const burnerOn = lab.cooking && g && g.type === 'heat' && !(ctx.presenterAt && ctx.presenterAt('stove'));
    const nb = burnerOn ? 12 : 0;
    this.burn.count = nb;
    for (let i = 0; i < nb; i++) {
      const a = (i / 12) * Math.PI * 2;
      const h = (0.5 + (g.dial ?? 0.5) * 1.4) * (0.85 + 0.15 * Math.sin(t * 23 + i * 1.9));
      _p.set(this.burner.x + Math.cos(a) * 0.105, this.burner.y + 0.005, this.burner.z + Math.sin(a) * 0.105);
      _q.identity(); _s.set(1, h, 1); _m.compose(_p, _q, _s);
      this.burn.setMatrixAt(i, _m);
    }
    if (nb) this.burn.instanceMatrix.needsUpdate = true;
    // ── fumes haze ──
    const hazeA = clamp(fumes * 0.75 - 0.03, 0, 0.7);
    this.haze.visible = hazeA > 0.01;
    if (this.haze.visible) {
      this.hazeMat.opacity = hazeA;
      this.hazeMat.map.offset.set(t * 0.03, t * 0.017);
      this.haze.position.y = Math.sin(t * 0.7) * 0.04;
      if (fumes > 0.25) {
        this.acc.fume += dt * fumes * 6;
        while (this.acc.fume > 1) {
          this.acc.fume -= 1;
          parts.spawn({ x: (Math.random() - 0.5) * 1.8, y: D.FY + 0.3 + Math.random() * 1.2, z: D.ZRI + 0.3 + Math.random() * (D.ZP - D.ZRI - 0.6), vx: (Math.random() - 0.5) * 0.15, vy: 0.05, vz: (Math.random() - 0.5) * 0.15,
            life: 3, size: 0.5, size1: 1.3, r: 0.6, g: 0.85, b: 0.4, alpha: 0.18 + fumes * 0.2, cell: ATLAS.PUFF, spin: 0.2 });
        }
      }
    }
    // ── cop alarm wash + light ──
    const cop = !!(lab.copAlarm || (snap.alert && snap.alert.copClose));
    const ph = Math.floor(t * 6) % 2;
    this.wash.visible = cop;
    if (cop) {
      this.washMat.color.set(ph ? '#ff2a2a' : '#2a5aff');
      this.washMat.opacity = (lab.copAlarm ? 0.62 : 0.4) * (0.7 + 0.3 * Math.sin(t * 37));
    }
    // ── the one fx light: explosion > fire > cop ──
    const L = P.fxLight;
    this.flash = Math.max(this.flash - dt * 1.6, lab.explodedFlash || 0);
    if (this.flash > 0.02) {
      L.color.set('#ffd2a0'); L.intensity = 18 * this.flash; L.distance = 10;
      L.position.set(this.burner.x - 0.4, this.burner.y + 0.6, this.burner.z);
    } else if (fv > 0.02) {
      const fl = 0.7 + 0.3 * Math.sin(t * 23) * Math.sin(t * 7.1);
      L.color.set('#ff7a2a'); L.intensity = (1.4 + fv * 5) * fl; L.distance = 5.5;
      L.position.set(this.burner.x - 0.35, this.burner.y + 0.5, this.burner.z);
      if (cop && ph && Math.sin(t * 3) > 0.3) { L.color.set('#ff3030'); }
    } else if (cop) {
      L.color.set(ph ? '#ff2020' : '#2050ff'); L.intensity = lab.copAlarm ? 7 : 4; L.distance = 6;
      L.position.set(0.85, D.WIN0 + 0.2, ph ? D.WINDOWS[0][0] + 0.5 : D.WINDOWS[1][0] + 0.5);
    } else L.intensity = 0;
    // warm light gently dims with fumes, flickers on big bumps
    P.warm.intensity = 2.6 * (1 - fumes * 0.25) * (ctx.bumpFlicker ? 0.6 + Math.random() * 0.4 : 1);
    // ── extinguisher spray ──
    const sp = ctx.spray;
    if (sp && sp.on) {
      this.acc.spray += dt * 110;
      while (this.acc.spray > 1) {
        this.acc.spray -= 1;
        const s = 2.2 + Math.random() * 1.6;
        parts.spawn({ x: sp.origin.x, y: sp.origin.y, z: sp.origin.z, vx: sp.dir.x * s + (Math.random() - 0.5) * 0.7, vy: sp.dir.y * s + (Math.random() - 0.3) * 0.5, vz: sp.dir.z * s + (Math.random() - 0.5) * 0.7,
          life: 0.9 + Math.random() * 0.5, size: 0.2, size1: 1.35, r: 0.97, g: 0.98, b: 1.0, alpha: 0.9, cell: ATLAS.PUFF, drag: 1.8, spin: 2 });
      }
    }
    // ── stash bags ──
    const units = Math.max(0, Math.min(P.MAX_BAGS, (snap.inv && snap.inv.units) ?? lab.inv?.units ?? 0));
    if (units !== this.prevUnits) {
      this.prevUnits = units;
      for (let i = 0; i < units; i++) {
        const b = P.bagSlots[i];
        _p.set(b.x, b.y, b.z); _q.setFromAxisAngle(_Y, b.rot); _s.set(1, 1, 1);
        _m.compose(_p, _q, _s); P.bags.setMatrixAt(i, _m);
      }
      P.bags.count = units;
      P.bags.instanceMatrix.needsUpdate = true;
    }
    // ── pantry jars (fill = count, max 4) ──
    const mat = (snap.inv && snap.inv.mat) || lab.inv?.mat || {};
    let jarDirty = false;
    P.jarSlots.forEach((j, i) => {
      const want = Math.min(4, mat[j.id] || 0) / 4;
      const f = this.jarFill[i] + (want - this.jarFill[i]) * (1 - Math.exp(-dt * 4));
      if (Math.abs(f - this.jarFill[i]) > 1e-4 || this._jarInit !== true) {
        this.jarFill[i] = f; jarDirty = true;
        _p.set(j.pos[0], j.pos[1] + 0.012, j.pos[2]); _q.identity(); _s.set(1, Math.max(0.001, f * 0.205), 1);
        _m.compose(_p, _q, _s); P.jars.setMatrixAt(i, _m);
      }
    });
    if (jarDirty) { P.jars.instanceMatrix.needsUpdate = true; this._jarInit = true; }
    // ── hull holes vs RV hp ──
    const hp = snap.rv && snap.rv.hp != null ? snap.rv.hp : 100;
    P.hull.visible = hp < 97;
    for (const h of P.hullHoles) {
      const on = hp < h.at;
      h.hole.visible = on; h.beam.visible = on && !ctx.closeUp;
      if (on) h.beam.material.opacity = 0.22 + 0.08 * Math.sin(t * 2 + h.at);
    }
    // ── cook-down stars ──
    if (lab.cookDown && ctx.docHead) {
      for (let i = 0; i < 3; i++) {
        const a = t * 3.2 + (i * Math.PI * 2) / 3;
        parts.once({ x: ctx.docHead.x + Math.cos(a) * 0.3, y: ctx.docHead.y + 0.32 + Math.sin(t * 5 + i) * 0.04, z: ctx.docHead.z + Math.sin(a) * 0.3, size: 0.3, r: 1, g: 0.88, b: 0.25, alpha: 1, cell: ATLAS.STAR, rot: t * 2 + i, additive: false });
      }
    }
    parts.update(dt);
  }

  _beatPuff() {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.spawn({ x: this.burner.x, y: this.burner.y + 0.2, z: this.burner.z, vx: Math.cos(a) * 0.8, vy: 0.6 + Math.random() * 0.6, vz: Math.sin(a) * 0.8, life: 0.8, size: 0.15, size1: 0.5, r: 0.3, g: 0.29, b: 0.28, alpha: 0.6, cell: ATLAS.PUFF, drag: 2 });
    }
  }

  /** [wreck] the whole RV blew up: big flash + shake now, the lab burns from here on. */
  wreckBlast() {
    if (this.wreck) return;
    this.wreck = true;
    this.explode();
    if (this.view.camRig) this.view.camRig.shake(1.6);
  }

  explode() {
    this.flash = 1;
    const b = this.burner;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, s = 2 + Math.random() * 4;
      this.parts.spawn({ x: b.x, y: b.y + 0.2, z: b.z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s, vz: Math.sin(a) * Math.cos(e) * s, life: 0.5 + Math.random() * 0.4, size: 0.3, size1: 0.08, r: 1, g: 0.85, b: 0.45, r1: 1, g1: 0.35, b1: 0.1, cell: ATLAS.GLOW, additive: true, drag: 2, gravity: 4 });
    }
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 2;
      this.parts.spawn({ x: b.x + (Math.random() - 0.5) * 0.4, y: b.y + 0.3, z: b.z + (Math.random() - 0.5) * 0.4, vx: Math.cos(a) * s, vy: 0.6 + Math.random() * 1.2, vz: Math.sin(a) * s, life: 2.2, size: 0.4, size1: 1.6, r: 0.18, g: 0.16, b: 0.15, alpha: 0.75, cell: ATLAS.PUFF, drag: 1.4, spin: 0.8 });
    }
    if (this.view.camRig) this.view.camRig.shake(1.0);
  }

  dispose() {
    if (this.explodeUnsub) this.explodeUnsub();
    if (this.view.rv) this.view.rv.ventOverride = null;
    this.parts.dispose();
    for (const m of [this.flames, this.burn, this.haze, this.wash]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
  }
}
const _Y = new THREE.Vector3(0, 1, 0);

function mergeGeos(geos) {
  let n = 0; for (const g of geos) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const gi = g.index ? g.toNonIndexed() : g;
    const p = gi.attributes.position, u = gi.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos[(o + i) * 3] = p.getX(i); pos[(o + i) * 3 + 1] = p.getY(i); pos[(o + i) * 3 + 2] = p.getZ(i); if (u) { uv[(o + i) * 2] = u.getX(i); uv[(o + i) * 2 + 1] = u.getY(i); } }
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeVertexNormals();
  return out;
}
