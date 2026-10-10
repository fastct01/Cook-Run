// ─────────────────────────────────────────────────────────────────────────────
// roofScene — the 3D props of the roof defence, in the RV-LOCAL frame (parented to view.rvAnchor):
//   always (lab view): roof_hatch (lid closed/open) on two ceiling beams, a fold-down ladder, and the
//                      pulsing "go up here" highlight (floor ring + bouncing arrow) during a stop
//   roof mode:         a slatted roof-rack deck around the hatch, water_hose reel + water_tank at their
//                      userData.rvMount, Doc as doc_roof (aim yaw/pitch posed on the arms), range rings,
//                      a throw arc preview (dots) + target ring, and the hose water stream (instanced drops)
// The van is a cut-away (no roof): the deck is a see-through rack so the lab stays visible below.
// Unity: a RoofRig prefab under the RV (same names), a LineRenderer for the preview, a ParticleSystem stream.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ROOF_GEOM } from '../../sim/roof.js';

const G = ROOF_GEOM;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
export const DEVICE_COLOR = { firecracker: '#ff8a3a', balloon: '#d9488f', flare: '#e8423a', hose: '#8fd8ff' };
export const DEVICE_RADIUS_KEY = { firecracker: 'firecracker', balloon: 'balloon', flare: 'flare' };

function mat(color, o = {}) { return new THREE.MeshLambertMaterial({ color, ...o }); }
function basic(color, o = {}) { return new THREE.MeshBasicMaterial({ color, ...o }); }

export class RoofScene {
  /**
   * @param {THREE.Object3D} anchor  view.rvAnchor (RV-local frame)
   * @param {Function|null} createModel
   * @param {object} o  { floorY, rules (rules.roof) }
   */
  constructor(anchor, createModel, { floorY = 0.72, rules = {} } = {}) {
    this.anchor = anchor;
    this.FY = floorY;
    this.R = rules;
    this.disposables = [];
    const root = this.root = new THREE.Group();
    root.name = 'roof_defence';
    anchor.add(root);
    const cm = (kind, v = 0) => { try { return createModel ? createModel(kind, v) : null; } catch (e) { return null; } };

    // ── always: hatch + beams + ladder + highlight ───────────────────────────
    const lab = this.lab = new THREE.Group(); lab.name = 'roof_lab_props'; root.add(lab);
    this.hatch = cm('roof_hatch') || this._fallbackHatch();
    this.hatch.position.set(G.hatch.x, G.roofY, G.hatch.z);
    lab.add(this.hatch);
    this.lid = this.hatch.getObjectByName('lid') || new THREE.Object3D();
    this.lid.rotation.x = 0;
    const beamGeo = this._geo(new THREE.BoxGeometry(2.38, 0.07, 0.08));
    const beamMat = this._mat(mat('#8a6a4a'));
    for (const dz of [-0.42, 0.42]) {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.position.set(0, G.roofY - 0.035, G.hatch.z + dz); b.name = 'roof_beam';
      lab.add(b);
    }
    // fold-down ladder: pivot at the hatch's rear edge, unfolds by scale.y (0 folded … 1 down)
    this.ladder = new THREE.Group(); this.ladder.name = 'roof_ladder';
    this.ladder.position.set(G.hatch.x, G.roofY - 0.05, G.hatch.z - 0.24);
    const L = G.roofY - 0.05 - floorY;
    const steel = this._mat(mat('#9aa3a8'));
    const railGeo = this._geo(new THREE.BoxGeometry(0.035, L, 0.035).translate(0, -L / 2, 0));
    for (const s of [-1, 1]) { const r = new THREE.Mesh(railGeo, steel); r.position.x = s * 0.17; this.ladder.add(r); }
    const rungGeo = this._geo(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 6).rotateZ(Math.PI / 2));
    for (let y = -0.28; y > -L + 0.1; y -= 0.29) { const r = new THREE.Mesh(rungGeo, steel); r.position.y = y; this.ladder.add(r); }
    this.ladder.rotation.x = 0.12;      // leans a little toward the rear wall
    this.ladder.scale.y = 0.001; this.ladder.visible = false;
    lab.add(this.ladder);
    // highlight under the hatch (stop prompt)
    this.ring = new THREE.Mesh(this._geo(new THREE.RingGeometry(0.3, 0.4, 32).rotateX(-Math.PI / 2)), this._mat(basic('#7fd6c2', { transparent: true, opacity: 0.9, depthWrite: false })));
    this.ring.position.set(G.hatch.x, floorY + 0.02, G.hatch.z); this.ring.renderOrder = 4; this.ring.visible = false;
    lab.add(this.ring);
    this.arrow = new THREE.Mesh(this._geo(new THREE.ConeGeometry(0.16, 0.3, 4).rotateX(Math.PI)), this._mat(basic('#7fd6c2')));
    this.arrow.visible = false; lab.add(this.arrow);
    this.glow = new THREE.Mesh(this._geo(new THREE.RingGeometry(0.42, 0.56, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4)), this._mat(basic('#7fd6c2', { transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })));
    this.glow.position.set(G.hatch.x, G.roofY + 0.12, G.hatch.z); this.glow.renderOrder = 5; this.glow.visible = false;
    lab.add(this.glow);

    // ── roof mode gear ──────────────────────────────────────────────────────
    const gear = this.gear = new THREE.Group(); gear.name = 'roof_gear'; gear.visible = false; root.add(gear);
    this._buildDeck(gear);
    this.reel = cm('water_hose');
    if (this.reel) {
      this.reel.position.set(...(this.reel.userData.rvMount?.pos || [0.75, G.roofY, -1.9]));
      for (const n of ['nozzle', 'hose_run']) { const o = this.reel.getObjectByName(n); if (o) o.visible = false; }   // Doc holds his own nozzle
      this.reelDrum = this.reel.getObjectByName('reel');
      gear.add(this.reel);
    }
    this.tank = cm('water_tank');
    if (this.tank) {
      this.tank.position.set(...(this.tank.userData.rvMount?.pos || [0.55, G.roofY, -3.1]));
      this.valve = this.tank.getObjectByName('valve');
      gear.add(this.tank);
    }
    // Doc on the roof
    this.doc = cm('doc_roof') || this._fallbackDoc();
    this.doc.name = 'doc_roof';
    this.doc.scale.setScalar(0.92);
    this.doc.rotation.order = 'YXZ';
    this.doc.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.doc.visible = false;
    root.add(this.doc);
    const j = (n) => this.doc.getObjectByName(n) || new THREE.Object3D();
    this.dj = { body: j('body'), head: j('head'), al: j('arm_l'), ar: j('arm_r'), ll: j('leg_l'), lr: j('leg_r'), nozzle: j('nozzle') };
    // the rest direction of the nozzle relative to the model (≈10° up)
    this.restPitch = Math.atan2(0.18, 1);

    // range rings (hose reach + the 25 m lot ring) on the ground, around the nozzle pivot
    const rr = this.R.hose?.range ?? 15;
    this.hoseRing = new THREE.Mesh(this._geo(new THREE.RingGeometry(rr - 0.12, rr + 0.12, 96).rotateX(-Math.PI / 2)), this._mat(basic('#8fd8ff', { transparent: true, opacity: 0.35, depthWrite: false })));
    this.hoseRing.position.set(G.nozzle.x, 0.1, G.nozzle.z); this.hoseRing.renderOrder = 3;
    gear.add(this.hoseRing);
    this.lotRing = this._dashedRing(G.throwMax, '#d9a83a', 0.5);
    gear.add(this.lotRing);

    // throw preview: arc dots + target ring
    this.dots = new THREE.InstancedMesh(this._geo(new THREE.SphereGeometry(0.07, 6, 4)), this._mat(basic('#ffffff', { transparent: true, opacity: 0.85, depthWrite: false })), 22);
    this.dots.frustumCulled = false; this.dots.renderOrder = 6; this.dots.visible = false;
    gear.add(this.dots);
    // target marker: a thin ring of the device's radius (one geometry per radius, constant 0.2 m line) + centre dot
    this.target = new THREE.Group(); this.target.visible = false; this.target.name = 'throw_target';
    this.targetMat = this._mat(basic('#ff8a3a', { transparent: true, opacity: 0.7, depthWrite: false }));
    this.targetRings = new Map();
    this.targetDot = new THREE.Mesh(this._geo(new THREE.CircleGeometry(0.25, 16).rotateX(-Math.PI / 2)), this.targetMat);
    this.targetDot.renderOrder = 6;
    this.target.add(this.targetDot);
    gear.add(this.target);

    // hose stream: instanced drops along a quadratic arc nozzle → end point
    this.dropN = 56;
    this.drops = new THREE.InstancedMesh(this._geo(new THREE.IcosahedronGeometry(0.075, 0)), this._mat(basic('#cdeefe', { transparent: true, opacity: 0.78, depthWrite: false })), this.dropN);
    this.drops.frustumCulled = false; this.drops.renderOrder = 7; this.drops.visible = false;
    root.add(this.drops);
    this.stream = { on: 0, t: 0, a: new THREE.Vector3(), c: new THREE.Vector3(), b: new THREE.Vector3() };
  }

  // ── builders ───────────────────────────────────────────────────────────────
  _geo(g) { this.disposables.push(g); return g; }
  _mat(m) { this.disposables.push(m); return m; }
  _buildDeck(parent) {
    // galvanised slats across the RV, behind the hatch (z −1.5 … −3.95) and a narrow frame
    const x0 = -0.95, x1 = 1.17, z0 = -3.95, z1 = -1.5, y = G.roofY + 0.015;
    const slat = this._geo(new THREE.BoxGeometry(x1 - x0, 0.03, 0.09));
    const n = Math.floor((z1 - z0) / 0.15);
    const im = new THREE.InstancedMesh(slat, this._mat(mat('#9ea4a6')), n);
    for (let i = 0; i < n; i++) { _m.makeTranslation((x0 + x1) / 2, y, z0 + 0.07 + i * 0.15); im.setMatrixAt(i, _m); }
    im.receiveShadow = true; im.castShadow = false; im.name = 'roof_deck';
    parent.add(im);
    const frame = this._geo(new THREE.BoxGeometry(0.06, 0.06, z1 - z0 + 0.06));
    const fm = this._mat(mat('#5d6366'));
    for (const x of [x0, x1]) { const f = new THREE.Mesh(frame, fm); f.position.set(x, y + 0.01, (z0 + z1) / 2); parent.add(f); }
    // a low grab rail on the door side so it reads as a roof rack
    const rail = this._geo(new THREE.BoxGeometry(0.04, 0.04, z1 - z0));
    const r = new THREE.Mesh(rail, fm); r.position.set(x0, y + 0.42, (z0 + z1) / 2); parent.add(r);
    const post = this._geo(new THREE.BoxGeometry(0.04, 0.42, 0.04).translate(0, 0.21, 0));
    for (const z of [z0 + 0.1, (z0 + z1) / 2, z1 - 0.1]) { const p = new THREE.Mesh(post, fm); p.position.set(x0, y, z); parent.add(p); }
  }
  _dashedRing(radius, color, opacity) {
    const segs = 48, pos = [];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = a0 + (Math.PI * 2 / segs) * 0.55;
      let px = Math.sin(a0) * radius, pz = Math.cos(a0) * radius;
      for (let k = 1; k <= 4; k++) {
        const a = a0 + (a1 - a0) * (k / 4), x = Math.sin(a) * radius, z = Math.cos(a) * radius;
        pos.push(px, 0, pz, x, 0, z); px = x; pz = z;
      }
    }
    const g = this._geo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const l = new THREE.LineSegments(g, this._mat(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })));
    l.position.set(0, 0.11, 0); l.renderOrder = 3; l.name = 'lot_ring';
    return l;
  }
  _fallbackHatch() {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.68, 0.1, 0.68).translate(0, 0.05, 0)), this._mat(mat('#e6dcc4')));
    g.add(frame);
    const lid = new THREE.Object3D(); lid.name = 'lid'; lid.position.set(0, 0.104, 0.33);
    const lm = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.66, 0.04, 0.66).translate(0, 0.02, -0.33)), this._mat(mat('#d8d2c2')));
    lid.add(lm); g.add(lid);
    return g;
  }
  _fallbackDoc() {
    const g = new THREE.Group(), m = this._mat(mat('#e07a3f'));
    const body = new THREE.Object3D(); body.name = 'body'; body.position.y = 0.88; g.add(body);
    for (const [n, x, y] of [['head', 0, 0.6], ['arm_l', 0.24, 0.5], ['arm_r', -0.24, 0.5], ['leg_l', 0.1, 0], ['leg_r', -0.1, 0]]) {
      const p = new THREE.Object3D(); p.name = n; p.position.set(x, y, 0); body.add(p);
      const me = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.12, n === 'head' ? 0.28 : 0.6, 0.12)), m); me.position.y = n === 'head' ? 0.16 : -0.3; p.add(me);
    }
    const nz = new THREE.Object3D(); nz.name = 'nozzle'; nz.position.set(0.18, -0.3, 0.45); g.getObjectByName('arm_r').add(nz);
    return g;
  }

  // ── per frame ──────────────────────────────────────────────────────────────
  /** Stop prompt highlight (lab view). */
  setHighlight(on, t) {
    this.ring.visible = this.arrow.visible = this.glow.visible = !!on;
    if (!on) return;
    const pul = 1 + 0.12 * Math.sin(t * 6);
    this.ring.scale.set(pul, 1, pul);
    this.ring.material.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 6));
    this.glow.material.opacity = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(t * 6));
    this.arrow.position.set(G.hatch.x, G.roofY + 0.55 + Math.abs(Math.sin(t * 4)) * 0.2, G.hatch.z);
    this.arrow.rotation.y = t * 2;
  }
  setLid(k) { this.lid.rotation.x = 1.6 * clamp(k, 0, 1); }
  setLadder(k) { k = clamp(k, 0, 1); this.ladder.visible = k > 0.01; this.ladder.scale.y = Math.max(0.001, k); }
  setGear(on) { this.gear.visible = !!on; }

  /** Pose doc_roof standing on the roof: aim yaw/pitch (RV-local), spray bool, throw 0..1 swing, time. */
  poseDoc({ x = G.stance.x, y = G.roofY, z = G.stance.z, yaw, pitch, spray = false, throwK = 0, t = 0, crouch = 0 }) {
    const d = this.doc, J = this.dj;
    d.visible = true;
    d.position.set(x, y, z);
    d.rotation.set(0, yaw, 0);
    const a = clamp(this.restPitch - pitch, -1.0, 1.5);
    const jit = spray ? Math.sin(t * 38) * 0.02 : 0;
    J.ar.rotation.set(a + jit, 0, 0);
    J.al.rotation.set(a + jit, 0, 0);
    if (throwK > 0) {                                  // left arm: wind back, then fling forward
      const s = throwK < 0.35 ? -throwK / 0.35 : -1 + (throwK - 0.35) / 0.65 * 3.2;
      J.al.rotation.set(a - s * 1.1 - 0.4, 0, 0.25);
    }
    J.body.rotation.set(0.06 + crouch * 0.4 + (spray ? 0.05 : 0), 0, 0);
    J.head.rotation.set(-a * 0.35, 0, 0);
    J.ll.rotation.set(-0.12 - crouch * 0.6, 0, 0.04); J.lr.rotation.set(0.14 + crouch * 0.3, 0, -0.04);
    if (this.reelDrum && spray) this.reelDrum.rotation.x += 0.05;
    if (this.valve) this.valve.rotation.z += ((spray ? 1.57 : 0) - this.valve.rotation.z) * 0.15;
  }
  /** Nozzle tip in RV-local space. */
  nozzleLocal(out) {
    const n = this.dj.nozzle;
    n.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(n.matrixWorld);
    return this.anchor.worldToLocal(out);
  }

  /** Throw preview: arc from the hand to `tgt` (RV-local, on the ground), ring radius r. */
  setPreview(on, from, tgt, r, color, t) {
    this.dots.visible = this.target.visible = !!on;
    if (!on) return;
    const n = this.dots.count;
    const dist = Math.hypot(tgt.x - from.x, tgt.z - from.z);
    const h = 1.2 + dist * 0.22;
    for (let i = 0; i < n; i++) {
      const u = ((i + (t * 1.6) % 1) / n);
      _p.set(from.x + (tgt.x - from.x) * u, from.y + (tgt.y - from.y) * u + 4 * h * u * (1 - u), from.z + (tgt.z - from.z) * u);
      const s = 0.6 + 0.6 * u;
      _m.compose(_p, _q.identity(), _s.set(s, s, s));
      this.dots.setMatrixAt(i, _m);
    }
    this.dots.instanceMatrix.needsUpdate = true;
    this.dots.material.color.set(color);
    this.target.position.set(tgt.x, tgt.y + 0.12, tgt.z);
    const key = Math.round(Math.max(0.5, r) * 10);
    let ring = this.targetRings.get(key);
    if (!ring) {
      const R = key / 10;
      ring = new THREE.Mesh(this._geo(new THREE.RingGeometry(R - 0.2, R, 64).rotateX(-Math.PI / 2)), this.targetMat);
      ring.renderOrder = 6; this.targetRings.set(key, ring); this.target.add(ring);
    }
    for (const [k2, m] of this.targetRings) m.visible = k2 === key;
    this.targetMat.color.set(color);
    this.targetMat.opacity = 0.5 + 0.2 * Math.sin(t * 6);
  }

  /** Hose stream: a (nozzle tip), b (end) in RV-local; on = spraying. Returns the drop count drawn. */
  updateStream(dt, on, a, b, t) {
    const S = this.stream;
    S.on = on ? Math.min(1, S.on + dt * 8) : Math.max(0, S.on - dt * 5);
    this.drops.visible = S.on > 0.01;
    if (!this.drops.visible) return 0;
    if (on) { S.a.copy(a); S.b.copy(b); }
    a = S.a; b = S.b;
    const len = a.distanceTo(b);
    S.c.copy(a).add(b).multiplyScalar(0.5); S.c.y += 0.35 + len * 0.12;
    const n = this.dropN;
    for (let i = 0; i < n; i++) {
      const u = (i / n + t * 2.2) % 1;
      const v = 1 - u;
      _p.set(v * v * a.x + 2 * v * u * S.c.x + u * u * b.x, v * v * a.y + 2 * v * u * S.c.y + u * u * b.y, v * v * a.z + 2 * v * u * S.c.z + u * u * b.z);
      const wob = 0.06 * u;
      _p.x += Math.sin(i * 12.9 + t * 21) * wob; _p.y += Math.cos(i * 7.3 + t * 17) * wob; _p.z += Math.sin(i * 3.1 + t * 13) * wob;
      // drops before the head of the stream are hidden while it's starting/stopping
      const vis = on ? (u <= S.on) : (u >= 1 - S.on);
      const s = vis ? (0.75 + 1.6 * u) : 0.0001;
      _m.compose(_p, _q.identity(), _s.set(s, s * (1.2 - 0.4 * u), s));
      this.drops.setMatrixAt(i, _m);
    }
    this.drops.instanceMatrix.needsUpdate = true;
    return n;
  }

  dispose() {
    this.root.removeFromParent();
    for (const d of this.disposables) { try { d.dispose(); } catch (e) { /* ignore */ } }
    this.disposables.length = 0;
  }
}
export { smooth };
void _v;
