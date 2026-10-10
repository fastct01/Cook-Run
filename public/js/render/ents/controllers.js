// ─────────────────────────────────────────────────────────────────────────────
// Procedural controllers for the expansion entities — the parts of the animation
// that a simple curve in anims.js can't express (sequences, particle emitters,
// recipes). Each controller is `fn(E, rec, dt)`:
//   E    the EntityView (E.P particles, E.time, E.fx comic words, E.track, E.snap)
//   rec  the entity record (x,y,z,yaw,state,stateT,speed,fwd,yawRate,dist,near,inst,…)
// They run after the channel table, so they may override any part. They only pose
// rig parts and emit particles; they never touch the sim.
// Unity: one MonoBehaviour per controller name (ParticleSystem emitters + a small
// state machine for the Rhino throw / canister / cargo drop).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { ATLAS } from '../textures.js';
import { XATLAS } from './atlas.js';
import { eulerQ } from './anims.js';
import { PAINT_COLORS } from './models.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _axis = new THREE.Vector3();
const TAU = Math.PI * 2;
const hashf = (id, k) => { let h = Math.imul((id | 0) ^ (k * 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const R = Math.random;

/** model-space point → world (after inst.outer.updateMatrixWorld) */
export function toWorld(inst, x, y, z, out = _v) { out.set(x, y, z); return inst.root.localToWorld(out); }
/** current world position of a part's rest-pose point (e.g. its pivot) */
export function partWorld(inst, name, local, out = _v) {
  const i = inst.proto.parts[name];
  if (i === undefined) return null;
  inst.rig.partPoint(i, local || inst.proto.pivots[i], out);
  return inst.root.localToWorld(out);
}
function partCentre(inst, name, out = _v) {
  const i = inst.proto.parts[name];
  if (i === undefined || inst.proto.partBox[i].isEmpty()) return null;
  inst.proto.partBox[i].getCenter(_v2);
  inst.rig.partPoint(i, _v2, out);
  return inst.root.localToWorld(out);
}
function bits(v, n, prefix, rec) {
  if (v == null) return;
  for (let i = 0; i < n; i++) {
    const on = Array.isArray(v) ? !!v[i] : typeof v === 'number' ? ((v >> i) & 1) === 1 : true;
    if (!on) (rec.detached || (rec.detached = new Set())).add(prefix + i);
  }
}
const rate = (acc, key, perSec, dt) => { acc[key] = (acc[key] || 0) + perSec * dt; const n = Math.floor(acc[key]); acc[key] -= n; return n; };

export const CONTROLLERS = {
  // ── hazards ────────────────────────────────────────────────────────────────
  steam(E, rec, dt) {
    const inst = rec.inst, rig = inst.rig, pr = inst.proto;
    const plume = pr.userData.plume || {};
    if (!rec.puffs) {
      rec.puffs = [];
      for (let i = 0; i < 14; i++) { const pi = pr.parts['puff_' + i]; if (pi !== undefined) rec.puffs.push({ pi, P: pr.pivots[pi] }); }
      rec.radii = plume.radii && plume.radii.length >= rec.puffs.length ? plume.radii : rec.puffs.map((_, i) => 0.4 + 1.3 * Math.sin(Math.min(1, i / 10) * Math.PI / 2));
    }
    const pf = rec.puffs, n = pf.length;
    if (n < 2) return;
    const t = E.time + rec.phase;
    const gust = 0.6 + 0.4 * Math.sin(t * 0.37);
    for (let i = 0; i < n; i++) {
      const p = ((i / (n - 1) + t * 0.17) % 1 + 1) % 1;
      const k = p * (n - 1); let a = Math.floor(k); if (a > n - 2) a = n - 2;
      const f = k - a;
      const A = pf[a].P, B = pf[a + 1].P;
      const sway = p * p;
      const px = A.x + (B.x - A.x) * f + Math.sin(t * 1.3 + i) * 0.35 * sway * gust;
      const py = A.y + (B.y - A.y) * f;
      const pz = A.z + (B.z - A.z) * f + Math.cos(t * 0.9 + i * 1.7) * 0.25 * sway;
      const r = (rec.radii[a] + (rec.radii[a + 1] - rec.radii[a]) * f) / rec.radii[i] * (1 + 0.35 * sstep(0.7, 1, p));
      const me = pf[i];
      rig.setRotIdx(me.pi, eulerQ(0, t * 0.4 + i, 0));
      rig.setOffsetIdx(me.pi, px - me.P.x, py - me.P.y, pz - me.P.z);
      rig.setScaleIdx(me.pi, r, r * (0.92 + 0.1 * Math.sin(t * 2 + i)), r);
      rig.setAlphaIdx(me.pi, 0.62 * sstep(0, 0.08, p) * (1 - sstep(0.55, 1, p)));
    }
    // the cover jumps now and then (pressure burp)
    const cyc = 6.5 + hashf(rec.id, 9) * 3, u = ((t % cyc) / cyc) * cyc;
    const pop = u < 0.7 ? Math.sin((u / 0.7) * Math.PI) : 0;
    rig.setOffset('cover', 0, pop * 0.32, 0);
    rig.setEuler('cover', -pop * 0.35, 0, pop * 0.12);
    if (!rec.near) return;
    const P = E.P;
    const base = pf[0].P;
    // soft vapour billboards wrapping the whole column (reads as real steam, not balloons):
    // born anywhere along the plume path with the recipe's radius, drifting up and fading
    const nn = rate(rec.acc, 'steam', 22, dt) + (u < dt * 1.5 ? 12 : 0);
    for (let k = 0; k < nn; k++) {
      const p = Math.pow(R(), 1.3), kk = p * (n - 1); let a = Math.floor(kk); if (a > n - 2) a = n - 2;
      const f = kk - a, A = pf[a].P, B = pf[a + 1].P;
      const rad = rec.radii[a] + (rec.radii[a + 1] - rec.radii[a]) * f;
      toWorld(rec.inst, A.x + (B.x - A.x) * f + (R() - 0.5) * rad, A.y + (B.y - A.y) * f, A.z + (B.z - A.z) * f + (R() - 0.5) * rad);
      const g = 0.93 + R() * 0.07, up = u < dt * 1.5 ? 4 : 1.4 + p * 1.2;
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (R() - 0.5) * 0.5 + 0.35 * gust * p, vy: up + R() * 0.6, vz: (R() - 0.5) * 0.5, life: 1.3 + R() * 1.1, size: rad * 2.0, size1: rad * 3.4 + 0.8, r: g, g, b: g, alpha: 0.3 * (1 - p * 0.5), cell: R() < 0.75 ? XATLAS.SOFT : ATLAS.PUFF, drag: 0.6, spin: (R() - 0.5) * 0.6, fadeIn: 0.3 });
    }
    // ground mist creeping out of the hole
    if (rate(rec.acc, 'mist', 2.5, dt)) {
      const a = R() * TAU;
      toWorld(rec.inst, base.x, 0.15, base.z);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: Math.cos(a) * 1.4, vy: 0.15, vz: Math.sin(a) * 1.4, life: 3, size: 1.5, size1: 4.5, r: 0.95, g: 0.96, b: 0.97, alpha: 0.22, cell: XATLAS.SOFT, drag: 0.9, fadeIn: 0.4 });
    }
  },

  waterMain(E, rec, dt) {
    if (!rec.near) return;
    const inst = rec.inst, P = E.P;
    const top = (inst.proto.userData.jet && inst.proto.userData.jet.height) || 5.2;
    const s = 0.975 + 0.125 * Math.sin(TAU * 2.3 * E.time);
    const n = rate(rec.acc, 'spray', 38, dt);
    for (let k = 0; k < n; k++) {
      const a = R() * TAU, sp = 1.5 + R() * 2.5;
      toWorld(inst, (R() - 0.5) * 0.4, top * s * (0.85 + R() * 0.2), (R() - 0.5) * 0.4);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: Math.cos(a) * sp, vy: 1 + R() * 2.5, vz: Math.sin(a) * sp, gravity: 9.8, life: 1.3, size: 0.35, size1: 0.6, r: 0.82, g: 0.92, b: 1, alpha: 0.85, cell: XATLAS.DROP, floor: rec.y + 0.05 });
    }
    if (rate(rec.acc, 'mist', 6, dt)) {
      toWorld(inst, (R() - 0.5), top * s, (R() - 0.5));
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (R() - 0.5) * 2, vy: 0.6, vz: (R() - 0.5) * 2, life: 1.8, size: 1.5, size1: 4, r: 0.9, g: 0.95, b: 1, alpha: 0.3, cell: XATLAS.SOFT, drag: 1 });
    }
    if (rate(rec.acc, 'rip', 4, dt)) {
      const a = R() * TAU, d = 0.8 + R() * 2.2;
      toWorld(inst, Math.cos(a) * d, 0.06, Math.sin(a) * d);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, flat: true, life: 1.1, size: 0.4, size1: 2.4, linearSize: true, r: 0.85, g: 0.95, b: 1, alpha: 0.55, cell: XATLAS.RIPPLE, rot: R() * 6 });
    }
  },

  brokenCar(E, rec, dt) {
    if (!rec.near) return;
    const inst = rec.inst, P = E.P;
    const on = ((E.time * 1.4) % 1) < 0.5;
    if (on) for (const nm of ['hazard_l', 'hazard_r']) {
      const i = inst.proto.parts[nm];
      if (i === undefined) continue;
      // each lamp part has a front and a rear lens: glow both ends
      const b = inst.proto.partBox[i];
      for (const z of [b.max.z, b.min.z]) { toWorld(inst, (b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, z); P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.GLOW, size: 1.5, r: 1, g: 0.62, b: 0.12, alpha: 0.9, additive: true }); }
    }
    if (rate(rec.acc, 'cool', 4, dt)) {
      toWorld(inst, (R() - 0.5) * 0.8, 1.25, 2.2 + R() * 0.4);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (R() - 0.5) * 0.4, vy: 1.3, vz: (R() - 0.5) * 0.4, life: 2.2, size: 0.6, size1: 2.6, r: 0.93, g: 0.94, b: 0.95, alpha: 0.4, cell: XATLAS.SOFT, drag: 0.6 });
    }
  },

  trolley(E, rec) {
    const sp = rec.inst.spin;
    if (rec.speed > 0.3) {
      const k = Math.min(1, rec.speed / 4);
      sp.rotation.set(Math.sin(E.time * 23 + rec.phase) * 0.02 * k, Math.sin(E.time * 3.1 + rec.phase) * 0.12 * k, Math.sin(E.time * 31) * 0.035 * k);
      rec.inst.outer.position.y += Math.abs(Math.sin(E.time * 27)) * 0.025 * k;
    }
  },

  powerLine(E, rec, dt) {
    if (!rec.near) return;
    const inst = rec.inst, P = E.P;
    for (const nm of ['spark', 'spark_1']) {
      const i = inst.proto.parts[nm];
      if (i === undefined) continue;
      const pv = inst.proto.pivots[i];
      toWorld(inst, pv.x, pv.y, pv.z);
      const x = _v.x, y = _v.y, z = _v.z;
      const fl = hashf(Math.floor(E.time * 13), rec.id + i);
      P.once({ x, y: y + 0.15, z, cell: ATLAS.GLOW, size: 1.2 + fl * 2.2, r: 0.7, g: 0.85, b: 1, alpha: 0.85, additive: true });
      if (fl > 0.72) P.once({ x, y: y + 0.2, z, cell: XATLAS.SPARK2, size: 1.6 + fl * 1.5, rot: fl * 6, r: 0.9, g: 0.95, b: 1, alpha: 1, additive: true });
      const n = rate(rec.acc, nm, fl > 0.85 ? 160 : 18, dt);
      for (let k = 0; k < n; k++) {
        const a = R() * TAU, s = 2 + R() * 5;
        P.spawn({ x, y: y + 0.1, z, vx: Math.cos(a) * s, vy: 2 + R() * 4, vz: Math.sin(a) * s, gravity: 14, life: 0.35 + R() * 0.35, size: 0.22, size1: 0.08, r: 1, g: 0.95, b: 0.7, r1: 1, g1: 0.55, b1: 0.15, cell: ATLAS.GLOW, additive: true, floor: rec.y + 0.03 });
      }
    }
  },

  dustDevil(E, rec, dt) {
    if (!rec.near) return;
    const P = E.P, inst = rec.inst;
    const n = rate(rec.acc, 'sand', 26, dt);
    for (let k = 0; k < n; k++) {
      const a = R() * TAU, h = R() * 7, r = 0.6 + h * 0.35 + R() * 0.6;
      toWorld(inst, Math.cos(a) * r, h, Math.sin(a) * r);
      const tang = 5 + R() * 3;
      const c = 0.72 + R() * 0.1;
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: -Math.sin(a) * tang + rec.vx, vy: 1.5 + R() * 1.5, vz: Math.cos(a) * tang + rec.vz, life: 0.9 + R() * 0.6, size: 1.2, size1: 3.2, r: c, g: c * 0.8, b: c * 0.6, alpha: 0.4, cell: R() < 0.5 ? ATLAS.DUST : XATLAS.SOFT, drag: 0.8, spin: 2 });
    }
    // orbiting grit
    for (let i = 0; i < 10; i++) {
      const a = E.time * (2.6 - i * 0.12) + i * 1.9, h = 0.5 + ((i * 0.7 + E.time * 0.4) % 6.5), r = 0.8 + h * 0.32;
      toWorld(inst, Math.cos(a) * r, h, Math.sin(a) * r);
      P.once({ x: _v.x, y: _v.y, z: _v.z, cell: i % 3 ? ATLAS.CHUNK : XATLAS.PLANK, size: 0.3 + (i % 3) * 0.12, rot: a * 3, r: 0.42, g: 0.34, b: 0.26 });
    }
    if (rate(rec.acc, 'kick', 6, dt)) {
      const a = R() * TAU;
      toWorld(inst, Math.cos(a) * 1.5, 0.2, Math.sin(a) * 1.5);
      P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: Math.cos(a) * 3 - Math.sin(a) * 3, vy: 0.4, vz: Math.sin(a) * 3 + Math.cos(a) * 3, life: 1.6, size: 2, size1: 5.5, r: 0.78, g: 0.64, b: 0.48, alpha: 0.32, cell: ATLAS.PUFF, drag: 1.2 });
    }
  },

  flood(E, rec, dt) {
    if (!rec.near) return;
    const s = rec.inst.proto.size;
    const n = rate(rec.acc, 'rip', 7, dt);
    for (let k = 0; k < n; k++) {
      toWorld(rec.inst, (R() - 0.5) * s.w * 0.75, 0.12, (R() - 0.5) * s.l * 0.6);
      E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, flat: true, life: 1.8, size: 0.3, size1: 3 + R() * 2, linearSize: true, r: 0.9, g: 0.95, b: 1, alpha: 0.45, cell: XATLAS.RIPPLE, rot: R() * 6, fadeIn: 0.2 });
    }
    // sparkles on the current
    for (let i = 0; i < 6; i++) {
      const f = ((E.time * 0.25 + i / 6) % 1);
      toWorld(rec.inst, (f - 0.5) * s.w * 0.8, 0.14, Math.sin(i * 2.3) * s.l * 0.25);
      E.P.once({ x: _v.x, y: _v.y, z: _v.z, cell: XATLAS.SPARK2, size: 0.5, rot: i, r: 1, g: 1, b: 1, alpha: 0.5 * Math.sin(f * Math.PI), additive: true });
    }
  },

  foamPatch(E, rec, dt) {
    if (!rec.near || !rate(rec.acc, 'bub', 3, dt)) return;
    toWorld(rec.inst, (R() - 0.5) * 2.4, 0.4, (R() - 0.5) * 2);
    E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vy: 0.5, life: 0.7, size: 0.25, size1: 0.5, r: 1, g: 0.98, b: 0.85, alpha: 0.9, cell: XATLAS.FOAM });
  },

  // ── animals & people ─────────────────────────────────────────────────────
  animal(E, rec) {
    const rig = rec.inst.rig, o = rec.inst.outer;
    const moving = rec.speed > 0.25;
    const t = E.time + rec.phase;
    if (moving) {
      rig.setEuler('head', Math.sin(t * 6) * 0.08, Math.sin(t * 0.7) * 0.15, 0);
      o.position.y += Math.abs(Math.sin(t * (5 + rec.speed * 2.2))) * 0.045;
    } else {
      // graze: head dips down, chews, looks around
      const g = Math.max(0, Math.sin(t * 0.21));
      rig.setEuler('head', 0.65 * g + Math.sin(t * 7) * 0.02 * g, Math.sin(t * 0.33) * 0.4 * (1 - g), 0);
    }
    if (rec.kind !== 'horse' && rec.state === 1 && rec.dist < 40 && E.time - (rec.lastWord || -9) > 4) {
      rec.lastWord = E.time;
      E.word(rec.kind === 'goat' ? 'MEHHH!' : 'BAA!', rec.x, rec.y + 1, rec.z, { fill: '#f1ead8', burst: '#7e9b6e', scale: 0.7 });
    }
  },
  cowboy(E, rec, dt) {
    if (rec.speed > 3 && rec.near && rate(rec.acc, 'dust', 8, dt)) {
      toWorld(rec.inst, (R() - 0.5) * 0.6, 0.1, -0.8 + R() * 1.6);
      E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: -rec.vx * 0.2, vy: 0.6, vz: -rec.vz * 0.2, life: 1.4, size: 0.8, size1: 2.6, r: 0.75, g: 0.65, b: 0.5, alpha: 0.4, cell: ATLAS.PUFF, drag: 1.4 });
    }
  },
  person(E, rec) {
    const o = rec.inst.outer;
    if (rec.speed > 0.3) o.position.y += Math.abs(Math.cos(rec.accGait || E.time * 6)) * 0.04;
    else rec.inst.spin.scale.set(1, 1 + Math.sin(E.time * 1.6 + rec.phase) * 0.006, 1);   // breathing
  },
  band(E, rec, dt) {
    rec.inst.outer.position.y += Math.abs(Math.sin(E.time * TAU * 1.05 + rec.phase * 0)) * 0.035;
    if (rec.near && rate(rec.acc, 'note', 0.6, dt)) {
      toWorld(rec.inst, 0, 1.9, 0.3);
      const c = [[1, 0.85, 0.3], [1, 1, 1], [0.6, 0.9, 1]][rec.id % 3];
      E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (R() - 0.5) * 0.6, vy: 1.1, vz: (R() - 0.5) * 0.6, life: 1.8, size: 0.55, size1: 0.75, r: c[0], g: c[1], b: c[2], alpha: 0.95, cell: XATLAS.NOTE, spin: (R() - 0.5) * 1.5, rot: (R() - 0.5) * 0.6 });
    }
  },

  // ── police ───────────────────────────────────────────────────────────────
  moto(E, rec, dt) {
    // whole bike leans into corners (pivot = contact line on the ground)
    const target = Math.max(-0.55, Math.min(0.55, -rec.yawRate * rec.speed * 0.045));
    rec.lean = (rec.lean || 0) + (target - (rec.lean || 0)) * Math.min(1, dt * 6);
    if (!rec.tumbling) rec.inst.spin.rotation.z = rec.lean;
    // steer the front wheel a touch
    if (rec.inst.rig.has('wheel_f')) { _q.setFromAxisAngle(_axis.set(1, 0, 0), rec.wheelAng || 0); rec.inst.rig.setRotIdx(rec.inst.proto.parts.wheel_f, _q.premultiply(new THREE.Quaternion().setFromAxisAngle(_axis.set(0, 1, 0), Math.max(-0.4, Math.min(0.4, rec.yawRate * 0.25))))); }
  },

  // The Rhino: doors open as a throw approaches, the lobber winds up (+0.3) and
  // releases (−0.5), the canister in his hand hides on release and reappears on the next wind-up.
  // Throws are detected from the sim (a new `flashbang` ent spawning next to the truck → rec.throwAt)
  // and predicted from the cadence (rules.heat.rhino.throwEvery) so the doors open BEFORE the throw.
  rhino(E, rec, dt) {
    const rig = rec.inst.rig;
    const every = E.rhinoEvery;
    const chasing = rec.state >= 1 && rec.state <= 3 || rec.state === 8;
    const now = E.time;
    if (rec.throwAt == null) rec.throwAt = chasing ? now - every * 0.45 : -99;
    if (!chasing) rec.throwAt = Math.min(rec.throwAt, now - 3);
    const since = now - rec.throwAt;
    let toNext = every - since;
    // a predicted throw that never came: count it as a phantom throw; after 2 misses in a row stop
    // predicting and only react to real throws (new flashbang ents, see EntityView._linkFresh)
    if (toNext < -1.2) { rec.missed = (rec.missed || 0) + 1; rec.throwAt = now - 1.3; toNext = every - 1.3; }
    const since2 = now - rec.throwAt;
    const ahead = !E.rv || ((E.rv.x - rec.x) * Math.sin(rec.yaw) + (E.rv.z - rec.z) * Math.cos(rec.yaw)) < 8;   // RV behind the truck
    const predict = (rec.missed || 0) < 2;
    const wantOpen = chasing && ahead && ((since2 < 1.1 && !rec.phantom) || (predict && toNext < 1.5) || rec.justThrew);
    rec.phantom = toNext === every - 1.3 ? true : rec.phantom && since2 < 1.2;
    const fast = rec.justThrew ? 12 : 3.2;
    rec.door = (rec.door || 0) + ((wantOpen ? 1 : 0) - (rec.door || 0)) * Math.min(1, dt * fast);
    if (rec.justThrew && rec.door > 0.95) rec.justThrew = false;
    const d = rec.door;
    rig.setEuler('rear_door_l', 0, -1.75 * d, 0);
    rig.setEuler('rear_door_r', 0, 1.75 * d, 0);
    // lobber: hidden while the doors are shut
    let lob = 0;
    if (since < 0.35) lob = -0.5 * Math.sin((since / 0.35) * Math.PI / 2);           // release
    else if (since < 0.9) lob = -0.5 * (1 - sstep(0.35, 0.9, since));                // back to neutral
    else if (toNext < 0.7) lob = 0.3 * sstep(0.7, 0.15, toNext);                     // wind-up
    rig.setEuler('lobber', lob, 0, 0);
    const show = d > 0.18 ? 1 : 0;
    rig.setScale('lobber', show);
    // canister in hand: visible from the wind-up until the release
    const held = since > 0.3 && (toNext < 1.6 || since > every * 0.5) && chasing;
    rig.setScale('throw_point', held ? 1 : 0);
    // exhaust puffs when chasing
    if (rec.near && chasing && rate(rec.acc, 'exh', 6, dt)) {
      const a = rec.inst.proto.anchors.exhaust || new THREE.Vector3(-0.95, 0.5, -3.02);
      toWorld(rec.inst, a.x, a.y, a.z);
      E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: -Math.sin(rec.yaw) * 2, vy: 0.6, vz: -Math.cos(rec.yaw) * 2, life: 1.2, size: 0.5, size1: 1.8, r: 0.3, g: 0.3, b: 0.3, alpha: 0.35, cell: ATLAS.PUFF, drag: 1 });
    }
  },

  // Police canister: 0 flying (tumble + fuse sparks), 1 armed on the ground (blinking), 2 burst
  canister(E, rec, dt) {
    const rig = rec.inst.rig, P = E.P, foam = (rec.variant | 0) === 1;
    const age = E.time - rec.stateT;
    const ci = rec.inst.proto.parts.can;
    if (rec.state === 2) { if (ci !== undefined) rig.setScaleIdx(ci, 0); if (!rec.burst) E.canisterBurst(rec); return; }
    if (ci !== undefined) rig.setScaleIdx(ci, 1);
    if (rec.state === 0) {
      rec.tumble = (rec.tumble || 0) + dt * 13;
      rig.setEuler('can', rec.tumble, rec.tumble * 0.4, rec.tumble * 0.23);
      if (!rec.near) return;
      toWorld(rec.inst, 0, 0.12, 0);
      P.once({ x: _v.x, y: _v.y + 0.1, z: _v.z, cell: ATLAS.GLOW, size: 0.9, r: 1, g: 0.75, b: 0.3, alpha: 0.9, additive: true });
      const n = rate(rec.acc, 'trail', 70, dt);
      for (let k = 0; k < n; k++) P.spawn({ x: _v.x + (R() - 0.5) * 0.1, y: _v.y + 0.1, z: _v.z + (R() - 0.5) * 0.1, vx: (R() - 0.5) * 2, vy: R() * 1.5, vz: (R() - 0.5) * 2, gravity: 6, life: 0.35 + R() * 0.25, size: 0.18, size1: 0.06, r: 1, g: 0.9, b: 0.5, r1: 1, g1: 0.4, b1: 0.1, cell: ATLAS.GLOW, additive: true });
      if (rate(rec.acc, 'smk', 18, dt)) P.spawn({ x: _v.x, y: _v.y, z: _v.z, vy: 0.4, life: 0.9, size: 0.3, size1: 1.1, r: 0.8, g: 0.8, b: 0.8, alpha: 0.4, cell: XATLAS.SOFT, drag: 1 });
    } else {
      // armed: lying on its side, rocking, blinking faster and faster
      rig.setEuler('can', Math.PI / 2, rec.phase, Math.sin(E.time * 18) * 0.06);
      rig.setOffset('can', 0, -0.04, 0);
      const fuse = foam ? 0.4 : 0.9;
      const hz = 4 + 14 * Math.min(1, age / fuse);
      const on = ((age * hz) % 1) < 0.5;
      toWorld(rec.inst, 0, 0.1, 0);
      if (on) P.once({ x: _v.x, y: _v.y + 0.15, z: _v.z, cell: ATLAS.GLOW, size: 1.6, r: foam ? 1 : 1, g: foam ? 0.95 : 0.2, b: foam ? 0.4 : 0.15, alpha: 1, additive: true });
      if (rec.near && rate(rec.acc, 'fz', 30, dt)) P.spawn({ x: _v.x, y: _v.y + 0.12, z: _v.z, vx: (R() - 0.5) * 1.5, vy: 1 + R() * 2, vz: (R() - 0.5) * 1.5, gravity: 8, life: 0.4, size: 0.15, size1: 0.05, r: 1, g: 0.85, b: 0.45, cell: ATLAS.GLOW, additive: true, floor: rec.y });
    }
  },

  paintSplat(E, rec) {
    const c = PAINT_COLORS[(rec.variant | 0) % 4];
    const col = E.color(c);
    const age = E.time - rec.bornT;
    const fade = rec.state > 0 ? Math.max(0, 1 - (rec.state | 0) / 100) : 1;
    if (rec.y - E.groundY(rec) < 0.6) E.P.once({ x: rec.x, y: rec.y + 0.05, z: rec.z, flat: true, cell: XATLAS.SPLAT, size: 2.6 * Math.min(1, 0.4 + age * 6), rot: rec.phase * 6, r: col.r, g: col.g, b: col.b, alpha: 0.95 * fade });
    else E.P.once({ x: rec.x, y: rec.y, z: rec.z, cell: XATLAS.SPLAT, size: 1.3, rot: rec.phase * 6, r: col.r, g: col.g, b: col.b, alpha: 0.95 * fade });
  },

  // ── set-piece vehicles ───────────────────────────────────────────────────
  comet(E, rec, dt) {
    if (!rec.near) return;
    const inst = rec.inst, P = E.P;
    const piv = inst.proto.parts.booster !== undefined ? inst.proto.pivots[inst.proto.parts.booster] : new THREE.Vector3(0, 0.66, -3.08);
    const boost = rec.state === 0 ? 0.35 : Math.min(1, 0.55 + rec.speed / 30);
    const fl = 0.85 + 0.15 * Math.sin(E.time * 47) * Math.sin(E.time * 13);
    const bx = -Math.sin(rec.yaw), bz = -Math.cos(rec.yaw);
    toWorld(inst, piv.x, piv.y, piv.z - 0.1);
    const x = _v.x, y = _v.y, z = _v.z;
    P.once({ x, y, z, cell: ATLAS.GLOW, size: 2.6 * boost * fl, r: 0.45, g: 1, b: 0.95, alpha: 0.95, additive: true });
    for (let i = 1; i <= 4; i++) P.once({ x: x + bx * i * 0.55 * boost, y, z: z + bz * i * 0.55 * boost, cell: ATLAS.FLAME, size: (1.7 - i * 0.28) * boost * fl, rot: Math.PI / 2 + rec.yaw, r: 1, g: 0.85 - i * 0.12, b: 0.6 - i * 0.12, alpha: 1 - i * 0.18, additive: true });
    const n = rate(rec.acc, 'fl', 50 * boost, dt);
    for (let k = 0; k < n; k++) {
      const s = 7 + R() * 5;
      P.spawn({ x, y: y + (R() - 0.5) * 0.15, z, vx: rec.vx + bx * s + (R() - 0.5), vy: (R() - 0.4) * 0.6, vz: rec.vz + bz * s + (R() - 0.5), life: 0.25 + R() * 0.15, size: 1.1, size1: 0.25, r: 1, g: 0.95, b: 0.75, r1: 0.3, g1: 0.9, b1: 1, alpha: 1, cell: ATLAS.FLAME, additive: true });
    }
    if (rate(rec.acc, 'spk', 25 * boost, dt)) P.spawn({ x, y, z, vx: rec.vx + bx * 4 + (R() - 0.5) * 2, vy: (R() - 0.3) * 2, vz: rec.vz + bz * 4 + (R() - 0.5) * 2, life: 0.6, size: 0.35, size1: 0.1, r: 0.6, g: 1, b: 1, cell: XATLAS.SPARK2, additive: true, spin: 6 });
    for (const nm of ['headlight_l', 'headlight_r']) { const a = inst.proto.anchors[nm]; if (a) { toWorld(inst, a.x, a.y, a.z + 0.1); P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.GLOW, size: 1.5, r: 1, g: 0.95, b: 0.8, alpha: 0.8, additive: true }); } }
  },

  streetcar(E, rec, dt) {
    if (!rec.near) return;
    const pi = rec.inst.proto.parts.pantograph;
    const top = pi !== undefined && !rec.inst.proto.partBox[pi].isEmpty() ? rec.inst.proto.partBox[pi].max.y : 5.0;
    const piv = pi !== undefined ? rec.inst.proto.pivots[pi] : new THREE.Vector3(0, 3.58, -0.7);
    const moving = rec.speed > 1;
    const p = moving ? 1.2 : 0.15;
    if (!rec.arc || E.time > rec.arc.t + rec.arc.len + 0.5) { if (R() < dt * p) rec.arc = { t: E.time, len: 0.1 + R() * 0.25 }; }
    const live = rec.arc && E.time < rec.arc.t + rec.arc.len;
    if (live) {
      toWorld(rec.inst, piv.x, top - 0.05, piv.z);
      E.P.once({ x: _v.x, y: _v.y, z: _v.z, cell: XATLAS.SPARK2, size: 2.2 + R(), rot: R() * 6, r: 0.75, g: 0.9, b: 1, alpha: 1, additive: true });
      E.P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.GLOW, size: 3.5, r: 0.5, g: 0.7, b: 1, alpha: 0.7, additive: true });
      const n = rate(rec.acc, 'sp', 120, dt);
      for (let k = 0; k < n; k++) { const a = R() * TAU, s = 1.5 + R() * 4; E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: Math.cos(a) * s + rec.vx * 0.3, vy: R() * 3, vz: Math.sin(a) * s + rec.vz * 0.3, gravity: 12, life: 0.45, size: 0.2, size1: 0.06, r: 1, g: 0.95, b: 0.8, r1: 1, g1: 0.6, b1: 0.2, cell: ATLAS.GLOW, additive: true }); }
    }
  },

  carrier(E, rec) {
    const sp = E.setpiece('car_carrier', rec);
    const rig = rec.inst.rig;
    // ramp: from the set-piece state when given (`ramp` 0..1 or phase 'ramp*'), else stowed
    let ramp = 0;
    if (sp) ramp = typeof sp.ramp === 'number' ? sp.ramp : /ramp|jump/.test(sp.phase || '') ? 1 : 0;
    rec.ramp = (rec.ramp || 0) + (ramp - (rec.ramp || 0)) * 0.08;
    rig.setEuler('ramp', -2.12 * rec.ramp, 0, 0);
    // cargo listed by the set-piece: sp.cargo bitmask (bit i = cargo_i still on the truck) or [bool × 6]
    bits(sp && sp.cargo, 6, 'cargo_', rec);
    E.applyDetached(rec);
  },

  logging(E, rec) {
    const sp = E.setpiece('log_spill', rec);
    bits(sp && sp.logs, 6, 'log_', rec);
    E.applyDetached(rec);
    if (rec.state >= 1) rec.inst.rig.setScale('chains', 0);           // spilled
    // jackknifed: hazard lights blinking (no lamp parts → glow sprites at the cab corners)
    if (rec.near && ((E.time * 1.4) % 1) < 0.5) {
      const b = rec.inst.bbox;
      for (const sx of [b.min.x + 0.1, b.max.x - 0.1]) { toWorld(rec.inst, sx, 1.1, b.max.z - 0.3); E.P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.GLOW, size: 1.3, r: 1, g: 0.6, b: 0.12, alpha: 0.9, additive: true }); }
    }
  },

  amber(E, rec) {
    if (!rec.near) return;
    const i = rec.inst.proto.parts.light_amber;
    if (i === undefined) return;
    if (((E.time * 1.6) % 1) >= 0.5) return;
    const pts = E.lightPoints(rec.inst, i);
    for (const p of pts) { toWorld(rec.inst, p.x, p.y, p.z); E.P.once({ x: _v.x, y: _v.y, z: _v.z, cell: ATLAS.GLOW, size: 2.4, r: 1, g: 0.6, b: 0.1, alpha: 0.9, additive: true }); }
  },

  combine(E, rec, dt) {
    if (!rec.near) return;
    const s = rec.inst.proto.size;
    const n = rate(rec.acc, 'chaff', 30, dt);
    for (let k = 0; k < n; k++) {
      toWorld(rec.inst, (R() - 0.5) * s.w * 0.9, 1 + R() * 1.2, s.l * 0.42);
      const c = 0.8 + R() * 0.15;
      E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (R() - 0.5) * 3 + rec.vx, vy: 2 + R() * 3, vz: (R() - 0.5) * 3 + rec.vz - Math.cos(rec.yaw) * 2, gravity: 3, drag: 1.2, life: 1.6, size: 0.18, size1: 0.12, r: c, g: c * 0.82, b: c * 0.4, cell: XATLAS.CONFETTI, spin: (R() - 0.5) * 12 });
    }
    if (rate(rec.acc, 'dust', 6, dt)) {
      toWorld(rec.inst, (R() - 0.5) * s.w * 0.6, 0.6, s.l * 0.45);
      E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: rec.vx * 0.5, vy: 0.8, vz: rec.vz * 0.5, life: 2.2, size: 2, size1: 5, r: 0.82, g: 0.74, b: 0.52, alpha: 0.3, cell: ATLAS.PUFF, drag: 1 });
    }
  },

  parade(E, rec, dt) {
    if (!rec.near) return;
    const s = rec.inst.proto.size;
    const n = rate(rec.acc, 'conf', 22, dt);
    const C = [[0.85, 0.26, 0.23], [0.95, 0.8, 0.25], [0.31, 0.56, 0.54], [0.95, 0.95, 0.9], [0.45, 0.6, 0.9], [0.85, 0.45, 0.65]];
    for (let k = 0; k < n; k++) {
      const c = C[(R() * C.length) | 0];
      toWorld(rec.inst, (R() - 0.5) * s.w, s.h * (0.75 + R() * 0.2), (R() - 0.5) * s.l * 0.8);
      E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (R() - 0.5) * 3 + rec.vx * 0.8, vy: 1 + R() * 2, vz: (R() - 0.5) * 3 + rec.vz * 0.8, gravity: 1.6, drag: 1.4, life: 3.2, size: 0.2, size1: 0.2, r: c[0], g: c[1], b: c[2], cell: XATLAS.CONFETTI, spin: (R() - 0.5) * 14, floor: rec.y + 0.02 });
    }
  },

  stagecoach(E, rec, dt) {
    const rig = rec.inst.rig;
    const sp = rec.speed;
    rec.gal = (rec.gal || 0) + dt * (sp > 0.3 ? 2.2 + sp * 0.55 : 0.4) * TAU;
    const amp = Math.min(1, sp / 3);
    for (let h = 0; h < 2; h++) {
      const ph = rec.gal + h * 0.9;
      rig.setOffset('horse_' + h, 0, Math.abs(Math.sin(ph)) * 0.14 * amp, 0);
      rig.setEuler('horse_' + h, Math.sin(ph) * 0.05 * amp, 0, 0);
      const pre = 'horse_' + h + '.';
      // gallop: fronts together, rears together, half a beat apart
      rig.setEuler(pre + 'leg_fl', Math.sin(ph) * 0.75 * amp, 0, 0);
      rig.setEuler(pre + 'leg_fr', Math.sin(ph + 0.4) * 0.75 * amp, 0, 0);
      rig.setEuler(pre + 'leg_rl', Math.sin(ph + Math.PI) * 0.7 * amp, 0, 0);
      rig.setEuler(pre + 'leg_rr', Math.sin(ph + Math.PI + 0.4) * 0.7 * amp, 0, 0);
    }
    rec.inst.spin.rotation.z = Math.sin(E.time * 3.1 + rec.phase) * 0.025 * amp;   // coach sways on its leathers
    if (rec.near && sp > 2 && rate(rec.acc, 'dust', 12, dt)) {
      toWorld(rec.inst, (R() - 0.5) * 1.6, 0.1, 2.6 + (R() - 0.5) * 1.5);
      E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: -rec.vx * 0.15, vy: 0.7, vz: -rec.vz * 0.15, life: 1.8, size: 1, size1: 3.4, r: 0.76, g: 0.64, b: 0.48, alpha: 0.42, cell: ATLAS.PUFF, drag: 1.3 });
    }
  },

  gorilla(E, rec, dt) {
    // 0 tethered: wobble (table). 1 loose: the sim bounces it (y); we tumble it, flail harder.
    // 2 deflated: collapses over ~1.5 s.
    const sp = rec.inst.spin, rig = rec.inst.rig, t = E.time;
    if (rec.state === 2) {
      const k = Math.min(1, (t - rec.stateT) / 1.5), e = k * k * (3 - 2 * k);
      rig.setScale('body', 1 + 0.25 * e, Math.max(0.08, 1 - 0.92 * e), 1 + 0.25 * e);
      rig.setEuler('arm_l', 0.4 * e, 0, (1 - e) * 0.7 - 0.5 * e);
      rig.setEuler('arm_r', 0.4 * e, 0, -(1 - e) * 0.7 + 0.5 * e);
      return;
    }
    if (rec.state === 1 || rec.speed > 1.2) {
      rec.roll = (rec.roll || 0) + Math.max(0.6, rec.speed) * dt / 3.2;
      sp.position.y = 4.5; rec.inst.root.position.y = -4.5;
      sp.rotation.set(rec.roll, 0, Math.sin(t * 2.1) * 0.4);
      rig.setEuler('arm_l', Math.sin(t * 7) * 0.8, 0, 1.0 + Math.sin(t * 5.3) * 0.6);
      rig.setEuler('arm_r', Math.sin(t * 6.1 + 1) * 0.8, 0, -1.0 - Math.sin(t * 4.7) * 0.6);
      if (rec.state !== 1 && rec.y - E.groundY(rec) < 0.3) rec.inst.outer.position.y += Math.abs(Math.sin(t * 2.6 + rec.phase)) * 1.6 * Math.min(1, rec.speed / 6);
    }
  },
  // Rattlers: 0 riding, 1 grabbing (rider reaches toward the RV), 2 crashed (bike on its side), 3 leaving
  chopper(E, rec, dt) {
    CONTROLLERS.moto(E, rec, dt);
    const rig = rec.inst.rig;
    if (rec.state === 1) {
      const side = E.rv ? Math.sign((E.rv.x - rec.x) * Math.cos(rec.yaw) - (E.rv.z - rec.z) * Math.sin(rec.yaw)) || 1 : 1;
      rig.setEuler('rider', -0.25, 0, 0.45 * side + Math.sin(E.time * 9) * 0.05);
    }
    if (rec.state === 2) {
      const k = Math.min(1, (E.time - rec.stateT) / 0.5);
      rec.inst.spin.rotation.z = (hashf(rec.id, 3) < 0.5 ? 1 : -1) * 1.45 * k;
      rec.inst.spin.position.y = 0.25 * k;
      rig.setEuler('rider', 0.6 * k, 0, 0.8 * k);
      if (rec.near && rec.speed > 1.5 && rate(rec.acc, 'scrape', 40, dt)) {
        toWorld(rec.inst, 0, 0.2, 0);
        E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: (R() - 0.5) * 3 - rec.vx * 0.2, vy: 1 + R() * 2, vz: (R() - 0.5) * 3 - rec.vz * 0.2, gravity: 12, life: 0.35, size: 0.2, size1: 0.06, r: 1, g: 0.85, b: 0.5, cell: ATLAS.GLOW, additive: true });
      }
    }
  },

  garbage(E, rec) {
    const stopped = rec.speed < 0.5;
    rec.lift = stopped ? (rec.lift || 0) + 1 / 60 : 0;
    const u = (rec.lift % 7) / 7;
    const k = stopped ? Math.sin(Math.min(1, u * 1.6) * Math.PI) : 0;
    rec.inst.rig.setEuler('lifter', 0, 0, -3.1 * k);
  },

  freight(E, rec, dt) {
    if (!rec.near || rec.speed < 4) return;
    if (rate(rec.acc, 'sq', 10, dt)) {
      const w = rec.inst.proto.wheels[(R() * rec.inst.proto.wheels.length) | 0];
      const pv = rec.inst.proto.pivots[rec.inst.proto.parts[w]];
      toWorld(rec.inst, pv.x, 0.1, pv.z);
      for (let k = 0; k < 4; k++) E.P.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: -rec.vx * 0.3 + (R() - 0.5) * 3, vy: 1 + R() * 2, vz: -rec.vz * 0.3 + (R() - 0.5) * 3, gravity: 12, life: 0.35, size: 0.18, size1: 0.06, r: 1, g: 0.85, b: 0.5, cell: ATLAS.GLOW, additive: true });
    }
  },
};
