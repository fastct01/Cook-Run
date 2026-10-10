// ─────────────────────────────────────────────────────────────────────────────
// people-cast.js — the human cast of the PEOPLE & ANIMALS expansion pack.
// All characters are ORIGINAL designs and adults. Built on people-human.js (same body,
// proportions and pivots as Rook / Doc / ped). Only police carry a (holstered, minimal)
// sidearm silhouette; the SWAT officer carries a riot shield and nothing else.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Kit, Rig, root, measure } from '../models/kit.js';
import { PAL, mix, shade } from '../palette.js';
import { person, human, bakeRigid, segBox, chain, star, SK, HR, NECK_Y, HIP_Y, SH_Y } from './people-human.js';
import { horseBody, HORSE_SEAT, HORSE_COATS } from './people-animals.js';

const GOLD = '#d2ad55', BRASS = '#c9a03c', SILVER = '#c8c9c4';
const NAVY = '#27334f', NAVY_D = '#1c2438';

// ── shared outfit pieces ────────────────────────────────────────────────────
/** Flannel / plaid checks over the torso (same method as Rook's flannel). */
function plaid(k, d, dark, opts = {}) {
  for (let i = 0; i < 3; i++) k.box(dark, [d.torsoW + 0.006, 0.045, d.torsoD + 0.006], [0, 1.04 + i * 0.12, 0]);
  for (const x of [-0.12, 0.12]) k.box(dark, [0.045, 0.4, d.torsoD + 0.004], [x * d.bw, 1.16, 0]);
  if (opts.collar) k.box(opts.collar, [0.22, 0.05, 0.12], [0, NECK_Y - 0.07, 0.03]);
}
const plaidArm = (dark) => (k) => k.box(dark, [0.114, 0.045, 0.124], [0, -0.14, 0]);
/** Bib overalls: bib, straps, brass buttons, back panel (the legs are `bottom`). */
function overalls(k, d, denim, o = {}) {
  const z = d.torsoD / 2;
  k.box(denim, [0.32 * d.bw, 0.3, 0.025], [0, 1.13, z + 0.006]);
  k.box(shade(denim, 0.82), [0.14, 0.08, 0.01], [0, 1.16, z + 0.02]); // bib pocket
  k.box(denim, [d.torsoW + 0.012, 0.14, d.torsoD + 0.012], [0, 0.98, 0]); // waist band wraps
  for (const s of [1, -1]) {
    k.box(denim, [0.05, 0.36, 0.02], [s * 0.12 * d.bw, 1.27, -z - 0.006], { rot: [0, 0, s * -0.25] });
    k.box(denim, [0.05, 0.12, d.torsoD + 0.02], [s * 0.13 * d.bw, 1.36, 0]);
    k.box(BRASS, [0.03, 0.03, 0.012], [s * 0.12 * d.bw, 1.27, z + 0.02]);
  }
  if (o.stain) k.box(shade(denim, 0.7), [0.09, 0.06, 0.01], [-0.07, 1.04, z + 0.014]);
}
/** Wrap-around vest (box over the torso) with the shirt showing at the front opening. */
function vest(k, d, color, shirt, o = {}) {
  const z = d.torsoD / 2;
  k.box(color, [d.torsoW + 0.016, o.h || 0.44, d.torsoD + 0.016], [0, o.y || 0.95, 0], { base: true });
  if (shirt) k.box(shirt, [o.gap || 0.08, (o.h || 0.44) - 0.04, 0.01], [0, (o.y || 0.95) + 0.02, z + 0.01], { base: true, taper: [1.8, 1] });
}
/** Apron: bib + skirt + neck/waist straps (cheaper than Doc's chamfered one). */
function apron(k, d, color, o = {}) {
  const z = d.torsoD / 2;
  k.box(color, [0.34 * d.bw, 0.32, 0.02], [0, 1.17, z + 0.008]);
  k.box(color, [0.42 * d.bw, 0.48, 0.04], [0, 0.56, z + 0.004], { base: true, taper: [0.93, 1] });
  k.box(color, [d.torsoW + 0.014, 0.05, d.torsoD + 0.016], [0, 0.99, 0]);
  for (const s of [1, -1]) k.box(color, [0.035, 0.14, d.torsoD * 0.6], [s * 0.15 * d.bw, 1.35, 0.03], { rot: [0, 0, s * 0.25] });
  if (o.pocket) k.box(shade(color, 0.8), [0.2, 0.07, 0.01], [0, 1.1, z + 0.022]);
  if (o.stripes) { for (const x of [-0.15, -0.075, 0, 0.075, 0.15]) k.box(o.stripes, [0.03, 0.47, 0.01], [x * d.bw, 0.565, z + 0.027], { base: true }); for (const x of [-0.09, 0.09]) k.box(o.stripes, [0.03, 0.31, 0.008], [x * d.bw, 1.17, z + 0.02]); }
}
/** Police kit: pocket flaps, badge, name tag, epaulettes, shoulder radio, belt gear + holster silhouette. */
function policeKit(k, d, o = {}) {
  const z = d.torsoD / 2;
  for (const x of [-0.1, 0.1]) k.box(shade(o.shirt || NAVY, 0.75), [0.11, 0.035, 0.01], [x * d.bw, 1.27, z + 0.006]);
  star(k, o.badge || GOLD, 0.1 * d.bw, 1.205, z + 0.011, 0.038, 1);
  k.box('#e8e3d4', [0.075, 0.02, 0.008], [-0.1 * d.bw, 1.205, z + 0.008]);
  for (const s of [1, -1]) k.box(shade(o.shirt || NAVY, 0.8), [0.1, 0.02, 0.12], [s * d.torsoW / 2, 1.405, 0]);
  k.box('#18181a', [0.05, 0.075, 0.035], [0.13 * d.bw, 1.34, z + 0.02]);
  const hx = -(0.18 * d.bw + 0.035);
  k.box('#131315', [0.06, 0.15, 0.1], [hx, 0.85, -0.03]); // holster
  k.box('#232327', [0.045, 0.05, 0.075], [hx, 0.945, -0.045]); // grip silhouette
  k.box('#131315', [0.07, 0.06, 0.045], [0.13 * d.bw, 0.9, z + 0.015]); // cuff pouch
  k.box('#131315', [0.05, 0.08, 0.05], [0.2 * d.bw, 0.88, 0.0]); // radio pouch
}
/** Sergeant chevrons on the outer face of an upper arm (extrasArm frame). */
function chevrons(k, s, n = 3, color = GOLD) {
  for (let i = 0; i < n; i++) {
    const y0 = -0.07 - i * 0.032;
    k.side(color, 0.061, [[-0.033, y0], [0, y0 + 0.024], [0.033, y0], [0.033, y0 - 0.013], [0, y0 + 0.011], [-0.033, y0 - 0.013]], { side: s, off: 0.004 });
  }
}
/** Ribbon polygon along a 2D centreline (for painted patches). */
function ribbon(pts, w) {
  const L = [], R = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    let dx = q[0] - o[0], dy = q[1] - o[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const ww = Array.isArray(w) ? w[i] : w;
    L.push([p[0] - dy * ww, p[1] + dx * ww]); R.push([p[0] + dy * ww, p[1] - dx * ww]);
  });
  return [...L, ...R.reverse()];
}
/** Coiled-rattlesnake back patch (original design): oxblood disc, tan coil, raised head, rattle, rockers. */
function rattlerPatch(k, z, y = 1.18) {
  const disc = []; for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; disc.push([Math.cos(a) * 0.112, y + Math.sin(a) * 0.112]); }
  k.front('#5e2620', z, disc, -1, { off: 0.003 });
  const coil = [], ws = [];
  for (let i = 0; i <= 18; i++) { const t = i / 18, a = -1.87 + t * Math.PI * 4.5, r = 0.02 + t * 0.058; coil.push([Math.cos(a) * r, y + Math.sin(a) * r]); ws.push(0.009 + t * 0.006); }
  k.front('#cdb57c', z, ribbon(coil, ws), -1, { off: 0.006 });
  // neck rises from the outer end of the coil to the head at the top
  const e = coil[coil.length - 1];
  k.front('#cdb57c', z, ribbon([[e[0], e[1]], [e[0] + 0.014, y + 0.02], [0.07, y + 0.06], [0.04, y + 0.082]], 0.016), -1, { off: 0.008 });
  k.front('#e2cf98', z, [[0.06, y + 0.07], [0.045, y + 0.112], [-0.02, y + 0.12], [-0.065, y + 0.095], [-0.02, y + 0.068]], -1, { off: 0.01 }); // head
  k.front('#151312', z, [[-0.004, y + 0.094], [0.016, y + 0.094], [0.016, y + 0.106], [-0.004, y + 0.106]], -1, { off: 0.012 }); // eye
  k.front('#d4402e', z, [[-0.062, y + 0.09], [-0.105, y + 0.076], [-0.085, y + 0.091], [-0.105, y + 0.106]], -1, { off: 0.011 }); // forked tongue
  for (let i = 0; i < 3; i++) { const cx = -0.012 - i * 0.016, cy = y + 0.012 + i * 0.016; k.front(i % 2 ? '#d9c79a' : '#efe3c0', z, [[cx - 0.012, cy - 0.004], [cx + 0.004, cy - 0.012], [cx + 0.012, cy + 0.004], [cx - 0.004, cy + 0.012]], -1, { off: 0.011 }); } // rattle
  const arc = (r0, r1, a0, a1) => { const o = [], i = []; for (let n = 0; n <= 8; n++) { const a = a0 + (a1 - a0) * n / 8; o.push([Math.cos(a) * r1, y + Math.sin(a) * r1]); i.push([Math.cos(a) * r0, y + Math.sin(a) * r0]); } return [...o, ...i.reverse()]; };
  k.front('#c99a3a', z, arc(0.125, 0.158, 0.45, Math.PI - 0.45), -1, { off: 0.003 });
  k.front('#c99a3a', z, arc(0.125, 0.152, Math.PI + 0.7, 2 * Math.PI - 0.7), -1, { off: 0.003 });
}
/** Hi-vis vest with two reflective bands. */
function hivis(k, d, color) {
  k.box(color, [d.torsoW + 0.02, 0.44, d.torsoD + 0.02], [0, 0.97, 0], { c: 0.05, base: true });
  for (const y of [1.05, 1.2]) k.box('#d9dcd4', [d.torsoW + 0.03, 0.035, d.torsoD + 0.025], [0, y, 0]);
}
const grime = (color, x, y, z, w = 0.07, h = 0.05) => (k) => k.box(color, [w, h, 0.01], [x, y, z], { noBottom: true });

// ── 1. doc_roof — Doc (identical to `cook`) in roof-defence gear ─────────────
const APRON = '#e07a3f';
export function buildDocRoof() {
  // brass nozzle gripped in the right hand at chest height, aimed forward and a little up
  const spray = new THREE.Vector3(0, 0.18, 1).normalize();
  const grip = new THREE.Vector3(-0.06, 1.16, 0.42);
  const at = (t) => grip.clone().addScaledVector(spray, t).toArray();
  const tip = at(0.36);
  const hose = '#3c4f4c', tube = { round: 4, open: true, extend: 0.05 };
  return person('doc_roof', 0, {
    character: 'Doc',
    skin: SK[0], hair: '#7a6a5a', hairStyle: 'bald', top: '#6b7f8c', topStyle: 'shirt', sleeve: 'long',
    bottom: '#3f4246', shoes: '#2a2a2b', boots: true, gloves: '#d9c24a', gloveCuff: true, build: 1.0, headScale: 1.02,
    arms: { r: { ik: grip.toArray(), pole: [-1, -0.9, -0.3] }, l: { ik: [0.03, 1.1, 0.31], pole: [1, -0.9, -0.3] } },
    legs: { l: { rot: [-0.16, 0, 0.03] }, r: { rot: [0.14, 0, -0.03] } },
    extrasBody: (k, d) => {
      // ── Doc's apron + respirator, exactly as `cook` (skirt bevel dropped: same silhouette, −48 tris) ──
      k.box(APRON, [0.38, 0.34, 0.02], [0, 1.18, d.torsoD / 2 + 0.008]);
      k.box(APRON, [0.44, 0.5, 0.05], [0, 0.6, d.torsoD / 2 - 0.0], { base: true, taper: [0.92, 1] });
      k.box(APRON, [0.42, 0.06, d.torsoD + 0.02], [0, 0.99, 0]);
      for (const s of [1, -1]) k.box(APRON, [0.04, 0.2, d.torsoD + 0.03], [s * 0.16, 1.32, 0], { rot: [0, 0, s * 0.2] });
      k.box(shade(APRON, 0.8), [0.2, 0.08, 0.02], [0, 1.08, d.torsoD / 2 + 0.022]);
      k.box('#cfd4d6', [0.02, 0.1, 0.02], [0.05, 1.1, d.torsoD / 2 + 0.035], { noBottom: true });
      k.box(shade(APRON, 0.75), [0.08, 0.06, 0.01], [-0.12, 0.78, d.torsoD / 2 + 0.03], { noBottom: true });
      k.box('#2f3337', [0.14, 0.1, 0.08], [0, 1.36, d.torsoD / 2 + 0.06]);
      for (const s of [1, -1]) k.cyl('#d06a3a', 0.055, 0.055, 0.06, [s * 0.1, 1.34, d.torsoD / 2 + 0.07], { axis: 'z', seg: 6 });
      k.box('#2f3337', [0.3, 0.02, 0.02], [0, 1.42, d.torsoD / 2 + 0.02]);
      // ── backpack water tank (battered red, steel cap, pump handle) + harness straps ──
      k.cyl('#a8442f', 0.12, 0.12, 0.44, [0, 1.17, -0.255], { seg: 6 });
      k.box('#9aa3a6', [0.13, 0.05, 0.13], [0, 1.41, -0.255]);
      k.box('#2e3235', [0.03, 0.12, 0.03], [0.04, 1.48, -0.255]);
      k.box('#2e3235', [0.13, 0.025, 0.03], [0.04, 1.54, -0.255]);
      for (const s of [1, -1]) k.box('#2e3235', [0.045, 0.03, d.torsoD + 0.13], [s * 0.13, 1.405, -0.05]);
      // ── hose: tank → round the left hip → over the left hand → nozzle collar ──
      chain(k, hose, [[0.06, 0.97, -0.34], [0.26, 0.95, -0.17], [0.3, 1.0, 0.08], [0.15, 1.07, 0.27], [0.02, 1.11, 0.32], at(-0.07)], 0.05, 0.05, tube);
      // ── and the supply hose running behind him, back to the RV's tank ──
      chain(k, hose, [[-0.04, 0.96, -0.36], [-0.1, 0.5, -0.46], [-0.08, 0.03, -0.62], [0.06, 0.03, -0.98]], 0.055, 0.055, tube);
    },
    extrasHead: (k, d) => {
      k.box('#4f8f8a', [d.HW + 0.03, 0.04, d.HD + 0.03], [0, d.hy + 0.115, 0]);
      k.box('#cfd6d0', [0.2, 0.075, 0.05], [0, d.hy + 0.125, d.HD / 2 + 0.025]);
      for (const s of [1, -1]) k.box('#8fc2c8', [0.075, 0.05, 0.01], [s * 0.05, d.hy + 0.125, d.HD / 2 + 0.052]);
      for (const s of [1, -1]) k.box('#4a4038', [0.07, 0.05, 0.01], [s * 0.058, d.hy + 0.025, d.HD / 2 + 0.008]);
      for (const s of [1, -1]) k.box('#b9d0d2', [0.05, 0.032, 0.01], [s * 0.058, d.hy + 0.025, d.HD / 2 + 0.012]);
      for (const s of [1, -1]) k.box('#8a7d70', [0.03, 0.1, 0.16], [s * (d.HW / 2 + 0.005), d.hy + 0.01, -0.04]);
      k.box('#8a7d70', [0.07, 0.06, 0.03], [0, d.hy - d.HH / 2 + 0.04, d.HD / 2 + 0.002]);
    },
  }, (K, rig) => {
    // `nozzle` pivot sits AT the tip; its local +Z is the spray direction (pivot pre-rotated, mesh counter-rotated)
    K.bone = rig.add('nozzle', tip, 'arm_r');
    segBox(K, BRASS, at(-0.08), at(0.24), 0.075, 0.075, { round: 6, w2: 0.05 });
    segBox(K, '#e6be55', at(0.24), tip, 0.05, 0.05, { round: 6, w2: 0.03 });
    segBox(K, '#7d6326', at(-0.08), at(-0.05), 0.09, 0.09); // hose collar
    segBox(K, '#7d6326', [grip.x, grip.y - 0.06, grip.z + 0.06], [grip.x, grip.y - 0.13, grip.z + 0.04], 0.03, 0.03); // lever
    return { nozzle: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), spray) };
  });
}

// ── 2. kestrel — the buyer ───────────────────────────────────────────────────
export function buildKestrel() {
  const SUIT = '#e6e0d1', SHIRT = '#2b2a2e', RING = '#d9b04a';
  const hands = { r: [-0.025, 0.88, 0.3], l: [0.02, 0.95, 0.29] };
  return person('kestrel', 0, {
    character: 'Mr. Kestrel', skin: SK[1], hair: '#bcb6aa', hairStyle: 'short', top: SUIT, topStyle: 'shirt', bottom: SUIT,
    shoes: '#cfc5ad', glasses: '#121214', glassesStyle: 'round', hat: 'wide', hatColor: '#ebe6d8', hatBand: '#1d1c1e',
    build: 1.02, headRot: [0.1, 0, 0], cuff: SHIRT,
    arms: { r: { ik: hands.r, pole: [-1, -0.2, -0.7] }, l: { ik: hands.l, pole: [1, -0.2, -0.7] } },
    legs: { l: { rot: [0, 0, 0.05] }, r: { rot: [0, 0, -0.05] } },
    extrasBody: (k, d) => {
      const z = d.torsoD / 2;
      k.front(SHIRT, z + 0.004, [[-0.1, 1.41], [0.1, 1.41], [0.0, 1.1]], 1); // dark shirt in the V
      for (const s of [1, -1]) k.front(shade(SUIT, 0.88), z + 0.008, [[s * 0.1, 1.41], [s * 0.15, 1.38], [s * 0.04, 1.1], [s * 0.0, 1.1]], 1); // lapels
      k.box(SUIT, [d.torsoW + 0.014, 0.17, d.torsoD + 0.014], [0, 0.85, 0], { base: true }); // jacket skirt over the belt
      k.box(shade(SUIT, 0.86), [0.012, 0.18, 0.01], [0, 0.85, z + 0.009], { base: true });
      for (const y of [1.04, 0.95]) k.box('#3a3836', [0.022, 0.022, 0.01], [0.02, y, z + 0.009]);
      k.box('#4f8f8a', [0.06, 0.04, 0.01], [0.12, 1.29, z + 0.008]); // teal pocket square
      for (const s of [1, -1]) k.box(shade(SUIT, 0.86), [0.1, 0.02, 0.01], [s * 0.13, 0.94, z + 0.012]); // pocket flaps
    },
    extrasLeg: (k) => k.box(mix(SUIT, PAL.dirt, 0.35), [0.136, 0.06, 0.146], [0, -HIP_Y + 0.13, 0]), // dusty cuffs
    held: (k, s, h) => {
      k.box(RING, [0.022, 0.022, 0.02], [h[0] - s * 0.02, h[1] - 0.04, h[2] + 0.06]);
      if (s < 0) {
        k.cyl('#3a2a22', 0.016, 0.016, h[1] - 0.06, [h[0], (h[1] - 0.06) / 2, h[2] + 0.0], { seg: 5 }); // cane
        k.cyl(RING, 0.035, 0.03, 0.05, [h[0], h[1] - 0.06, h[2]], { seg: 6 }); // gold collar under the hands
      }
    },
  });
}

// ── 3. sgt_pratt — Sergeant Dolores Pratt ───────────────────────────────────
export function buildPratt() {
  return person('sgt_pratt', 0, {
    character: 'Sgt. Dolores Pratt', skin: SK[2], hair: '#b5afa4', hairStyle: 'bun', top: NAVY, topStyle: 'shirt', collar: shade(NAVY, 0.85),
    bottom: NAVY_D, shoes: '#18181a', belt: '#111113', hat: 'peaked', hatColor: '#202a44', glasses: '#2a2620', glassesStyle: 'aviator', frame: '#c9a54a',
    build: 1.0, headScale: 0.98,
    arms: { l: { ik: [0.07, 1.1, 0.3], pole: [1, -1, -0.2] }, r: { ik: [-0.03, 1.15, 0.31], pole: [-1, -1, -0.25] } },
    extrasBody: (k, d) => policeKit(k, d, { shirt: NAVY }),
    extrasArm: (k, s) => chevrons(k, s, 3),
    extrasLeg: (k, s) => k.box('#8f97a8', [0.012, 0.66, 0.01], [s * 0.076, -0.5, 0.0]), // trouser stripe
    held: (k, s, h) => {
      if (s > 0) k.at([h[0] - 0.03, h[1] + 0.05, h[2] + 0.02], [-0.85, 0.15, 0], () => { k.box('#2a2a2c', [0.12, 0.016, 0.16]); k.box('#ece4cc', [0.11, 0.014, 0.15], [0, 0.012, 0]); });
      else segBox(k, '#cfd4d6', [h[0] + 0.02, h[1] + 0.03, h[2] + 0.02], [h[0] + 0.07, h[1] + 0.08, h[2] + 0.06], 0.012, 0.012);
    },
  });
}

// ── 4. cop_officer — police on foot (3 builds) ──────────────────────────────
const COPS = [
  { skin: SK[1], hair: HR[0], hairStyle: 'buzz', build: 1.1, sleeve: 'long', hat: 'peaked' },
  { skin: SK[4], hair: HR[5], hairStyle: 'bun', build: 0.94, headScale: 0.97, sleeve: 'short', hat: 'peaked' },
  { skin: SK[3], hair: HR[1], hairStyle: 'short', build: 1.0, sleeve: 'short', moustache: true, glasses: '#1b1c1e', glassesStyle: 'aviator', frame: '#b9bbb8' },
];
export function buildCopOfficer(variant = 0) {
  const c = COPS[((variant % COPS.length) + COPS.length) % COPS.length];
  const shirt = c.sleeve === 'short' ? '#2c3a5a' : NAVY;
  return person('cop_officer', variant, {
    style: ['stocky', 'bun', 'moustache'][((variant % 3) + 3) % 3],
    ...c, top: shirt, topStyle: 'shirt', collar: shade(shirt, 0.85), bottom: NAVY_D, shoes: '#18181a', belt: '#111113', hatColor: '#202a44',
    cuff: c.sleeve === 'long' ? shade(NAVY, 0.8) : undefined,
    extrasBody: (k, d) => policeKit(k, d, { shirt, badge: GOLD }),
    extrasLeg: (k, s) => k.box('#8f97a8', [0.012, 0.66, 0.01], [s * 0.076, -0.5, 0.0]),
  });
}

// ── 5. swat_officer — armoured officer with a riot shield ───────────────────
export function buildSwat() {
  const DARK = '#1f2635', VEST = '#2b3343', PAD = '#262b33';
  const handL = [0.1, 1.02, 0.3];
  return person('swat_officer', 0, {
    style: 'riot shield', skin: SK[2], hair: HR[0], hairStyle: 'buzz', top: DARK, topStyle: 'shirt', bottom: DARK, shoes: '#141416', boots: true,
    gloves: '#141416', gloveCuff: true, hat: 'riot', hatColor: '#232a36', build: 1.12, noBrows: true,
    arms: { l: { ik: handL, pole: [1, -0.6, -0.6] }, r: { ik: [-0.3, 0.86, 0.1], pole: [-1, -0.1, -0.6] } },
    legs: { l: { rot: [-0.18, 0, 0.04] }, r: { rot: [0.16, 0, -0.04] } },
    extrasBody: (k, d) => {
      const z = d.torsoD / 2;
      k.box(VEST, [d.torsoW + 0.06, 0.5, d.torsoD + 0.08], [0, 0.93, 0], { c: 0.04, cv: true, base: true });
      k.box('#c4c8cc', [d.torsoW + 0.065, 0.05, d.torsoD + 0.085], [0, 1.24, 0]); // reflective band (front + back)
      for (const x of [-0.1, 0.1]) k.box(PAD, [0.11, 0.11, 0.05], [x * d.bw, 0.99, z + 0.05]); // pouches
      k.box('#111113', [d.torsoW + 0.07, 0.06, d.torsoD + 0.09], [0, 0.9, 0]); // belt
    },
    extrasArm: (k) => k.box(PAD, [0.13, 0.12, 0.14], [0, -0.04, 0], { taper: [0.85, 0.85] }), // shoulder pads
    extrasFore: (k, s, d) => k.box(PAD, [0.12, 0.1, 0.13], [d.ax, -d.upper - 0.1, 0.0]), // forearm guards
    extrasThigh: (k) => k.box(PAD, [0.15, 0.13, 0.06], [0, -0.38, 0.08]), // knee pads
  }, (K, rig, info) => {
    // riot shield on the left forearm (pivot at the grip)
    const h = info.hands.l;
    K.bone = rig.add('shield', h, 'arm_l');
    K.at([h[0] + 0.02, h[1] - 0.04, h[2] + 0.1], () => {
      K.box('#8fa5b1', [0.56, 1.0, 0.025], [0, 0, 0]);
      K.box('#1d2128', [0.6, 0.04, 0.04], [0, 0.5, 0]); K.box('#1d2128', [0.6, 0.04, 0.04], [0, -0.5, 0]);
      for (const s of [1, -1]) K.box('#1d2128', [0.04, 1.02, 0.04], [s * 0.29, 0, 0]);
      K.box('#e9e8e2', [0.5, 0.08, 0.006], [0, 0.18, 0.016]); // white band (no text)
      K.box('#b8ccd6', [0.05, 0.6, 0.004], [-0.14, 0.05, 0.016], { rot: [0, 0, 0.4] }); // sheen
      K.box('#1d2128', [0.06, 0.12, 0.06], [0, 0.04, -0.04]); // grip block
    });
  });
}

// ── 6. comet_hero — The Midnight Comet (original hero) ──────────────────────
export function buildComet() {
  const SUIT = '#e8e7e1', SILV = '#b7bbc0', TEAL = '#2a8f8b';
  return person('comet_hero', 0, {
    character: 'The Midnight Comet', skin: SK[3], hair: '#2a221c', hairStyle: 'none', top: SUIT, topStyle: 'shirt', bottom: SUIT,
    shoes: '#a3a8ad', boots: true, gloves: SILV, gloveCuff: true, hat: 'comet', noEyes: true, noBrows: true, build: 1.12, headRot: [-0.06, 0, 0],
    arms: { l: { ik: [0.27, 0.99, 0.02], pole: [1, 0.05, -0.35] }, r: { ik: [-0.27, 0.99, 0.02], pole: [-1, 0.05, -0.35] } },
    legs: { l: { rot: [0, 0, 0.11] }, r: { rot: [0, 0, -0.11] } },
    extrasBody: (k, d) => {
      const z = d.torsoD / 2;
      k.box(SILV, [d.torsoW + 0.07, 0.07, d.torsoD * 0.94], [0, 1.37, 0]); // silver yoke
      for (const s of [1, -1]) k.box(SILV, [0.012, 0.42, 0.05], [s * (d.torsoW / 2 + 0.004), 0.98, 0], { base: true }); // side panels
      k.box(SILV, [d.torsoW * 0.9, 0.06, d.torsoD + 0.016], [0, 0.94, 0]); // belt
      k.box(TEAL, [0.07, 0.05, 0.01], [0, 0.94, z + 0.012]); // buckle
      // star-and-tail emblem (original): small gold star with an orange streak trailing down-left
      k.front('#e0702a', z + 0.004, [[0.06, 1.27], [-0.07, 1.1], [-0.12, 1.12], [-0.145, 1.17], [-0.13, 1.22], [0.04, 1.32]], 1);
      k.front('#eeb03a', z + 0.006, [[0.055, 1.282], [-0.06, 1.15], [-0.1, 1.18], [-0.08, 1.22], [0.045, 1.31]], 1);
      star(k, '#f6dc6a', 0.06, 1.3, z + 0.009, 0.055, 1);
      k.box('#e0702a', [0.24, 0.07, 0.22], [0, 1.44, 0]); // scarf wrap at the neck
    },
    extrasArm: (k) => k.box(SILV, [0.12, 0.05, 0.13], [0, -0.06, 0]),
    extrasLeg: (k) => k.box(SILV, [0.16, 0.04, 0.18], [0, -HIP_Y + 0.23, 0]),
  }, (K, rig) => {
    // comet-tail scarf: pivot behind the neck, streams back and down, orange → yellow, forked tip
    K.bone = rig.add('scarf', [0, 1.43, -0.12], 'body');
    const P = [[0, 1.43, -0.12], [0.03, 1.35, -0.24], [0.07, 1.26, -0.35], [0.11, 1.18, -0.47], [0.14, 1.12, -0.6], [0.16, 1.07, -0.72], [0.17, 1.02, -0.83]];
    const cols = ['#d9662a', '#e0702a', '#e6822e', '#ec9a34', '#f0b23c', '#f2c548'];
    chain(K, cols, P, [0.15, 0.17, 0.19, 0.21, 0.23, 0.25], 0.024, { extend: 0.03 });
    segBox(K, '#f4d35a', P[6], [0.25, 0.97, -0.94], 0.11, 0.022, { extend: 0.02 });
    segBox(K, '#f4d35a', P[6], [0.1, 0.95, -0.92], 0.11, 0.022, { extend: 0.02 });
  });
}

// ── 7. clerk — shop staff (6 stores) ─────────────────────────────────────────
const CLERKS = [
  { // 0 Bolt & Barrel hardware clerk: red apron, phone in hand, moustache, pencil behind the ear
    style: 'hardware', skin: SK[1], hair: HR[1], hairStyle: 'short', moustache: true, top: '#8b8577', topStyle: 'shirt', collar: '#7a7468',
    bottom: '#4b4f56', shoes: '#3a2e26', build: 1.04,
    arms: { r: { ik: [-0.09, 1.13, 0.27], pole: [-1, -1, -0.2] } }, headRot: [0.18, 0, 0],
    extrasBody: (k, d) => { apron(k, d, '#a63a2e', { pocket: true }); k.box(PAL.rvMustard, [0.08, 0.08, 0.01], [0, 1.22, d.torsoD / 2 + 0.022], { rot: [0, 0, Math.PI / 4] }); grime('#7a2a22', 0.1, 0.72, d.torsoD / 2 + 0.03)(k); },
    extrasHead: (k, d) => k.box('#e2b93b', [0.012, 0.012, 0.12], [-(d.HW / 2 + 0.03), d.hy + 0.04, 0.0], { rot: [0.3, 0, 0] }),
    held: (k, s, h) => { if (s < 0) k.at([h[0] + 0.02, h[1] + 0.05, h[2] + 0.02], [-0.7, -0.3, 0], () => { k.box('#1c1d20', [0.065, 0.12, 0.014]); k.box('#7fb8b4', [0.052, 0.095, 0.004], [0, 0.004, -0.008]); }); },
  },
  { // 1 market vendor: straw hat, striped apron, crate of tomatoes
    style: 'market vendor', skin: SK[2], hair: HR[0], hairStyle: 'bob', top: '#e2d6bc', topStyle: 'shirt', sleeve: 'short', bottom: '#6a5d4e', shoes: '#5a4232',
    hat: 'straw', hatColor: '#cfb27a', hatBand: '#4f8f8a', build: 0.95, headScale: 0.97,
    arms: { l: { ik: [0.2, 1.0, 0.3], pole: [1, -0.6, -0.4] }, r: { ik: [-0.2, 1.0, 0.3], pole: [-1, -0.6, -0.4] } },
    extrasBody: (k, d) => {
      apron(k, d, '#e6dfcb', { stripes: '#5f7f45' });
      k.at([0, 0.97, 0.33], () => {
        k.box('#b5976f', [0.42, 0.16, 0.28], [0, 0, 0], { noBottom: true });
        for (const [x, z, c] of [[-0.13, -0.05, '#b8463a'], [-0.02, 0.05, '#c4553a'], [0.1, -0.04, '#a63a2e'], [0.13, 0.07, '#6f8c4a']]) k.box(c, [0.08, 0.05, 0.08], [x, 0.09, z]);
      });
    },
  },
  { // 2 harbour chandler: fisherman's sweater, beanie, beard, rope coil, yellow boots
    style: 'harbour chandler', skin: SK[0], hair: '#b9b2a6', hairStyle: 'short', beard: 'full', beardColor: '#bdb6aa', top: '#d9cfb8', topStyle: 'shirt',
    bottom: '#3f4246', shoes: '#c9a03a', boots: true, hat: 'beanie', hatColor: '#2f3d55', build: 1.08,
    extrasBody: (k, d) => {
      for (const x of [-0.11, -0.04, 0.04, 0.11]) k.box('#c4b99f', [0.028, 0.42, 0.01], [x * d.bw, 0.97, d.torsoD / 2 + 0.004], { base: true });
      k.box('#d9cfb8', [0.2, 0.08, 0.2], [0, 1.42, 0], { cv: true, c: 0.04 }); // roll neck
      k.torus('#bfa877', 0.215, 0.026, [0.0, 1.15, 0.0], { rot: [Math.PI / 2, Math.PI / 3, 0], rs: 3, ts: 10 }); // rope coil worn across the chest
    },
    extrasArm: (k) => { for (const y of [-0.08, -0.2]) k.box('#c4b99f', [0.114, 0.02, 0.124], [0, y, 0]); },
  },
  { // 3 gas station attendant: cap, coveralls, rag in the back pocket
    style: 'gas attendant', skin: SK[4], hair: HR[0], hairStyle: 'buzz', top: '#5f7489', topStyle: 'shirt', collar: '#52657a', bottom: '#5f7489',
    shoes: '#2a2a2b', hat: 'cap', hatColor: '#a63a2e', hatFront: '#e9e3d4', belt: '#4d5d6f', stubble: true,
    extrasBody: (k, d) => {
      const z = d.torsoD / 2;
      k.box('#e9e3d4', [0.1, 0.05, 0.01], [0.1, 1.27, z + 0.006]); k.box('#a63a2e', [0.07, 0.012, 0.004], [0.1, 1.27, z + 0.012]); // name patch
      k.box(shade('#5f7489', 0.8), [0.01, 0.42, 0.01], [-0.02, 0.98, z + 0.005], { base: true }); // zip
      k.box('#b8463a', [0.09, 0.2, 0.015], [-0.1, 0.8, -z - 0.03], { rot: [0.15, 0, 0.12] }); // rag
      grime('#3b4756', 0.06, 1.02, z + 0.006, 0.08, 0.06)(k); grime('#3b4756', -0.12, 1.15, z + 0.006, 0.05, 0.04)(k);
    },
    extrasLeg: (k) => k.box('#3b4756', [0.132, 0.1, 0.142], [0, -0.55, 0]),
  },
  { // 4 MegaMart worker: blue vest, name badge, headset
    style: 'MegaMart', skin: SK[2], hair: HR[0], hairStyle: 'pony', top: '#d8d6d0', topStyle: 'shirt', collar: '#c9c7c1', sleeve: 'short', bottom: '#a89a7a',
    shoes: '#2a2a2b', build: 0.95, headScale: 0.97,
    extrasBody: (k, d) => {
      vest(k, d, '#3a62a0', '#d8d6d0', { gap: 0.09 });
      k.box('#efece4', [0.08, 0.04, 0.008], [0.1, 1.24, d.torsoD / 2 + 0.014]); k.box('#c4553a', [0.08, 0.012, 0.004], [0.1, 1.255, d.torsoD / 2 + 0.019]);
      k.box('#2a2a2c', [0.12, 0.06, 0.02], [-0.11, 0.97, d.torsoD / 2 + 0.014]); // scanner on the belt
    },
    extrasHead: (k, d) => {
      k.box('#2a2a2c', [d.HW + 0.03, 0.02, 0.03], [0, d.hy + d.HH / 2 + 0.025, 0.0]);
      for (const s of [1, -1]) k.box('#2a2a2c', [0.02, 0.12, 0.03], [s * (d.HW / 2 + 0.018), d.hy + 0.1, 0]);
      k.box('#2a2a2c', [0.04, 0.06, 0.06], [-(d.HW / 2 + 0.025), d.hy, 0]);
      segBox(k, '#2a2a2c', [-(d.HW / 2 + 0.03), d.hy - 0.01, 0.02], [-0.04, d.hy - 0.08, d.HD / 2 + 0.03], 0.012, 0.012);
    },
  },
  { // 5 junkyard owner: huge beard, overalls, welding goggles on the head, heavy gloves
    style: 'junkyard owner', skin: SK[1], hair: '#6a5a4a', hairStyle: 'bald', beard: 'big', beardColor: '#7a6a58', top: '#7b7368', topStyle: 'shirt',
    bottom: '#4f5f74', shoes: '#3a2a1e', boots: true, gloves: '#8a6a44', gloveCuff: true, build: 1.18,
    extrasBody: (k, d) => { overalls(k, d, '#4f5f74', { stain: true }); grime('#2c2a26', 0.08, 0.86, d.torsoD / 2 + 0.01, 0.09, 0.07)(k); },
    extrasHead: (k, d) => {
      k.box('#2a2624', [d.HW + 0.03, 0.035, d.HD + 0.03], [0, d.hy + 0.12, 0]);
      for (const s of [1, -1]) { k.cyl('#5f6468', 0.048, 0.048, 0.04, [s * 0.055, d.hy + 0.14, d.HD / 2 + 0.03], { axis: 'z', seg: 6 }); k.box('#2f4a3a', [0.06, 0.06, 0.01], [s * 0.055, d.hy + 0.14, d.HD / 2 + 0.051]); }
    },
    extrasLeg: (k) => k.box('#3d4a5a', [0.132, 0.08, 0.142], [0, -0.66, 0]),
  },
];
export function buildClerk(variant = 0) {
  const c = CLERKS[((variant % CLERKS.length) + CLERKS.length) % CLERKS.length];
  return person('clerk', variant, c);
}

// ── 8. farmer ───────────────────────────────────────────────────────────────
const FARMERS = [
  { style: 'man', skin: SK[0], hair: HR[3], hairStyle: 'short', stubble: true, top: '#6a7d4a', check: '#3e4a2c', hatBand: '#7a4a32', build: 1.06,
    held: (k, s, h) => { if (s < 0) { k.cyl('#8f9396', 0.1, 0.085, 0.2, [h[0], h[1] - 0.14, h[2]], { seg: 7, open: true }); k.box('#5f6468', [0.012, 0.012, 0.2], [h[0], h[1] - 0.02, h[2]], { rot: [0, Math.PI / 2, 0] }); } } },
  { style: 'woman', skin: SK[3], hair: HR[0], hairStyle: 'braid', top: '#b05a4a', check: '#6e2c26', hatBand: '#9e3a30', build: 0.95, headScale: 0.97, gloves: '#c9b58a', gloveCuff: true },
];
export function buildFarmer(variant = 0) {
  const f = FARMERS[((variant % FARMERS.length) + FARMERS.length) % FARMERS.length];
  return person('farmer', variant, {
    ...f, topStyle: 'shirt', bottom: '#4a5f80', shoes: '#5a4030', boots: true, hat: 'straw', hatColor: '#d0b47c',
    extrasBody: (k, d) => { plaid(k, d, f.check); overalls(k, d, '#4a5f80', { stain: true }); },
    extrasArm: plaidArm(f.check),
    extrasLeg: (k) => k.box(mix('#4a5f80', PAL.dirt, 0.5), [0.132, 0.1, 0.142], [0, -0.66, 0]),
  });
}

// ── 10. biker — Rattlers MC on foot ─────────────────────────────────────────
const BIKERS = [
  { style: 'big bearded', skin: SK[1], hair: HR[1], hairStyle: 'short', beard: 'full', top: '#6d6a66', sleeve: 'short', hatColor: '#7a2e28', build: 1.14 },
  { style: 'woman', skin: SK[2], hair: HR[0], hairStyle: 'long', top: '#6a2c2a', topStyle: 'tank', sleeve: 'none', hatColor: '#2f4f4c', hatDots: '#9ab7b0', build: 0.94, headScale: 0.97 },
  { style: 'old timer', skin: SK[3], hair: '#bdb6aa', hairStyle: 'bald', beard: 'goatee', beardColor: '#cfc8bc', top: '#3b3a37', topStyle: 'tank', sleeve: 'none', hatColor: '#4f5a3a', build: 1.0, tattoo: true },
];
export function buildBiker(variant = 0) {
  const b = BIKERS[((variant % BIKERS.length) + BIKERS.length) % BIKERS.length];
  const LEATHER = '#262120';
  return person('biker', variant, {
    topStyle: 'shirt', ...b, bottom: '#3d4c66', shoes: '#211d1b', boots: true, belt: '#1a1716', hat: 'bandana', glasses: '#141416', glassesStyle: 'wrap',
    extrasBody: (k, d) => {
      vest(k, d, LEATHER, b.top, { gap: 0.1, h: 0.46 });
      const zb = -(d.torsoD / 2 + 0.009);
      rattlerPatch(k, zb, 1.17);
      segBox(k, SILVER, [-0.19 * d.bw, 0.9, 0.09], [-0.2 * d.bw, 0.8, 0.02], 0.012, 0.012); segBox(k, SILVER, [-0.2 * d.bw, 0.8, 0.02], [-0.19 * d.bw, 0.9, -0.06], 0.012, 0.012); // wallet chain
    },
    extrasArm: b.tattoo ? (k, s) => { if (s < 0) { k.box('#3a4a52', [0.112, 0.03, 0.122], [0, -0.14, 0]); k.box('#3a4a52', [0.112, 0.03, 0.122], [0, -0.2, 0]); } } : undefined,
  });
}

// ── 11. band_member — marching band (tuba, big drum, trumpet) ────────────────
const BAND = [
  { style: 'tuba', skin: SK[2], hair: HR[0], build: 1.1,
    arms: { r: { ik: [-0.04, 1.18, 0.32], pole: [-1, -0.8, -0.3] }, l: { ik: [0.2, 1.08, 0.32], pole: [1, -0.6, -0.4] } } },
  { style: 'big drum', skin: SK[4], hair: HR[5], build: 0.96, headScale: 0.97,
    arms: { r: { ik: [-0.33, 1.08, 0.3], pole: [-1, -0.4, -0.5] }, l: { ik: [0.33, 1.08, 0.3], pole: [1, -0.4, -0.5] } } },
  { style: 'trumpet', skin: SK[0], hair: HR[4], build: 1.0,
    arms: { r: { ik: [-0.02, 1.52, 0.33], pole: [-1, -0.7, -0.3] }, l: { ik: [0.04, 1.5, 0.27], pole: [1, -0.7, -0.3] } } },
];
export function buildBandMember(variant = 0) {
  const b = BAND[((variant % BAND.length) + BAND.length) % BAND.length];
  const RED = '#9e3a30', CREAM = '#e8dcc0';
  const v = ((variant % 3) + 3) % 3;
  return person('band_member', variant, {
    ...b, hairStyle: 'buzz', top: RED, topStyle: 'shirt', bottom: CREAM, shoes: '#18181a', gloves: '#efece4', hat: 'shako', hatColor: '#efe7d4', hatTrim: RED, cuff: CREAM,
    extrasBody: (k, d) => {
      const z = d.torsoD / 2;
      k.box(CREAM, [0.2 * d.bw, 0.42, 0.012], [0, 0.97, z + 0.004], { base: true, taper: [0.75, 1] }); // plastron
      for (const x of [-0.06, 0.06]) k.box(GOLD, [0.02, 0.3, 0.01], [x, 1.03, z + 0.012], { base: true });
      for (const s of [1, -1]) k.box(GOLD, [0.12, 0.035, 0.14], [s * (d.torsoW / 2 + 0.01), 1.41, 0]); // epaulettes
    },
    extrasLeg: (k, s) => k.box(RED, [0.014, 0.74, 0.03], [s * 0.076, -0.46, 0.0]),
  }, (K, rig, info) => {
    K.bone = rig.add('instrument', [0, 1.1, 0.3], 'body');
    if (v === 0) { // tuba: upright body in front, bell up beside the head
      K.cyl(BRASS, 0.1, 0.1, 0.44, [0.12, 1.1, 0.33], { seg: 7 });
      K.lathe(BRASS, [[0.1, 0], [0.14, 0.16], [0.22, 0.27], [0.27, 0.3]], 8, [0.16, 1.32, 0.32], { rot: [0.25, 0, -0.2] });
      K.at([0.16, 1.32, 0.32], [0.25, 0, -0.2], () => { const o = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; o.push([Math.cos(a) * 0.255, Math.sin(a) * 0.255]); } K.top(shade(BRASS, 0.45), 0.27, o, { off: -0.01 }); });
      K.box(BRASS, [0.26, 0.1, 0.1], [0.04, 0.88, 0.33]); // bottom bow
      K.box(BRASS, [0.08, 0.3, 0.08], [-0.04, 1.04, 0.33]);
      K.box('#e0c06a', [0.04, 0.1, 0.1], [-0.04, 1.22, 0.33]); // valve block
    } else if (v === 1) { // big bass drum on a harness, mallets in both hands
      K.cyl(RED, 0.3, 0.3, 0.32, [0, 1.06, 0.36], { axis: 'x', seg: 8 });
      for (const s of [1, -1]) {
        const pts = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push([0.36 + Math.cos(a) * 0.27, 1.06 + Math.sin(a) * 0.27]); }
        K.side(CREAM, 0.16, pts, { side: s, off: 0.004 }); // drum heads
        K.cyl('#f1ece0', 0.305, 0.305, 0.03, [s * 0.15, 1.06, 0.36], { axis: 'x', seg: 8, open: true });
      }
      K.box(CREAM, [0.06, 0.02, 0.36], [0, 1.39, 0.16], { rot: [-0.55, 0, 0] }); // harness
      for (const s of [1, -1]) { const h = info.hands[s > 0 ? 'l' : 'r']; segBox(K, '#d9cfb0', [h[0], h[1], h[2] + 0.02], [s * 0.2, h[1] + 0.02, h[2] + 0.06], 0.02, 0.02); K.box('#f1ece0', [0.06, 0.07, 0.07], [s * 0.19, h[1] + 0.02, h[2] + 0.07]); }
    } else { // trumpet at the mouth
      segBox(K, BRASS, [0, 1.56, 0.16], [0, 1.58, 0.58], 0.03, 0.03, { round: 6 });
      K.lathe(BRASS, [[0.016, 0], [0.03, 0.07], [0.075, 0.13], [0.06, 0.13]], 8, [0, 1.585, 0.56], { axis: 'z' });
      K.box(BRASS, [0.04, 0.06, 0.24], [0, 1.52, 0.37]); // lower tubing
      K.box('#e0c06a', [0.03, 0.07, 0.11], [0, 1.6, 0.34]); // valve block
    }
  });
}

// ── 12. dock_worker / logger / ranger / ghost_town_actor ─────────────────────
const DOCKERS = [
  { style: 'hoodie', skin: SK[3], hair: HR[0], hairStyle: 'short', beard: 'full', top: '#3b4250', topStyle: 'hoodie', hatColor: '#e9e6dd', vest: '#e07a2c', build: 1.1 },
  { style: 'woman', skin: SK[0], hair: HR[2], hairStyle: 'pony', top: '#5a6470', topStyle: 'shirt', hatColor: '#e2b93b', vest: PAL.hivis, build: 0.95, headScale: 0.97 },
];
export function buildDockWorker(variant = 0) {
  const w = DOCKERS[((variant % DOCKERS.length) + DOCKERS.length) % DOCKERS.length];
  return person('dock_worker', variant, {
    ...w, bottom: '#3d4c66', shoes: '#5a4030', boots: true, hat: 'hard', gloves: '#c9b58a', gloveCuff: true,
    extrasBody: (k, d) => { hivis(k, d, w.vest); k.box('#2a2a2c', [0.06, 0.09, 0.03], [0.12 * d.bw, 1.28, d.torsoD / 2 + 0.025]); },
    extrasLeg: (k) => k.box(mix('#3d4c66', PAL.dirt, 0.5), [0.132, 0.08, 0.142], [0, -0.68, 0]),
  });
}
export function buildLogger() {
  const RED = '#9a3530', BLK = '#2a1c1a';
  return person('logger', 0, {
    skin: SK[1], hair: HR[4], hairStyle: 'short', beard: 'full', beardColor: '#7a4026', top: RED, topStyle: 'shirt', bottom: '#3d4c66',
    shoes: '#3a2a1e', boots: true, hat: 'hard', hatColor: '#e0702a', build: 1.16, gloves: '#a07a50',
    extrasBody: (k, d) => {
      plaid(k, d, BLK);
      const z = d.torsoD / 2;
      for (const s of [1, -1]) {
        k.box('#3a2a20', [0.04, 0.46, 0.01], [s * 0.11 * d.bw, 0.96, z + 0.008], { base: true });
        k.box('#3a2a20', [0.04, 0.03, d.torsoD + 0.02], [s * 0.11 * d.bw, 1.4, 0]);
      }
      k.box('#3a2a20', [0.05, 0.46, 0.01], [0, 0.96, -z - 0.008], { base: true }); // single back strap (Y-back)
    },
    extrasArm: plaidArm(BLK),
    extrasHead: (k, d) => { for (const s of [1, -1]) { k.box('#e2b93b', [0.06, 0.1, 0.1], [s * (d.HW / 2 + 0.035), d.hy, -0.01]); } k.box('#2a2a2c', [d.HW + 0.13, 0.025, 0.03], [0, d.hy + d.HH / 2 + 0.035, -0.01]); },
    extrasLeg: (k) => k.box('#5f7290', [0.15, 0.06, 0.16], [0, -0.72, 0]), // rolled cuffs
  });
}
export function buildRanger() {
  const KHAKI = '#b8a882', OLIVE = '#59603f';
  return person('ranger', 0, {
    skin: SK[3], hair: HR[0], hairStyle: 'braid', top: KHAKI, topStyle: 'shirt', collar: shade(KHAKI, 0.88), sleeve: 'short',
    bottom: OLIVE, shoes: '#4a3424', boots: true, belt: '#3a2a1e', hat: 'campaign', hatColor: '#8a7550', hatBand: '#4a3424', build: 0.96, headScale: 0.97,
    extrasBody: (k, d) => {
      const z = d.torsoD / 2;
      for (const x of [-0.1, 0.1]) k.box(shade(KHAKI, 0.8), [0.11, 0.035, 0.01], [x, 1.27, z + 0.006]);
      k.front(GOLD, z + 0.012, [[0.07, 1.24], [0.13, 1.24], [0.13, 1.19], [0.1, 1.16], [0.07, 1.19]], 1); // shield badge
      k.box('#e8e3d4', [0.075, 0.02, 0.008], [-0.1, 1.205, z + 0.008]);
      k.box(BRASS, [0.06, 0.04, 0.01], [0, 0.91, d.torsoD * 0.47 + 0.01]);
      // binoculars on a strap
      for (const x of [-0.035, 0.035]) k.cyl('#2a2a2c', 0.03, 0.03, 0.1, [x, 1.14, z + 0.04], { seg: 6 });
      k.box('#3a2a20', [0.24, 0.02, 0.01], [0, 1.3, z + 0.012], { rot: [0, 0, 0.0] });
    },
    extrasArm: (k, s) => k.side('#4a5a3a', 0.061, [[-0.03, -0.03], [0.03, -0.03], [0.03, -0.09], [0, -0.11], [-0.03, -0.09]], { side: s, off: 0.004 }), // shoulder patch
    extrasLeg: (k) => k.box(mix(OLIVE, PAL.dirt, 0.5), [0.132, 0.08, 0.142], [0, -0.68, 0]),
  });
}
export function buildGhostTownActor() {
  const VEST = '#2b2a2c';
  return person('ghost_town_actor', 0, {
    skin: SK[2], hair: HR[1], hairStyle: 'short', handlebar: '#3a2a1e', top: '#e6e1d4', topStyle: 'shirt', collar: '#e6e1d4',
    bottom: '#6a5a48', shoes: '#3a2a1e', boots: true, belt: '#4a3324', hat: 'cowboy', hatColor: '#2e2925', hatBand: '#8a6a3a', build: 1.06, headRot: [-0.05, 0, 0],
    arms: { l: { ik: [0.19, 0.95, 0.11], pole: [1, 0, -0.5] }, r: { ik: [-0.19, 0.95, 0.11], pole: [-1, 0, -0.5] } },
    legs: { l: { rot: [0, 0, 0.07] }, r: { rot: [0, 0, -0.07] } },
    extrasBody: (k, d) => {
      vest(k, d, VEST, '#e6e1d4', { gap: 0.1, y: 0.97, h: 0.43 });
      const z = d.torsoD / 2;
      star(k, '#d4d6d2', 0.11, 1.24, z + 0.02, 0.045, 1); // tin star
      k.box('#9e3a30', [0.016, 0.16, 0.008], [0, 1.3, z + 0.016]); k.box('#cfa24a', [0.03, 0.03, 0.01], [0, 1.37, z + 0.02]); // string tie
      k.box('#cfa24a', [0.09, 0.07, 0.012], [0, 0.91, d.torsoD * 0.47 + 0.008]); // big buckle
      for (const x of [-0.1, 0.1]) k.box('#6a6a6c', [0.016, 0.016, 0.01], [x, 1.08, z + 0.02]);
    },
    extrasArm: (k) => k.box('#9e3a30', [0.115, 0.03, 0.125], [0, -0.17, 0]), // sleeve garters
    extrasLeg: (k) => k.box(shade('#6a5a48', 0.85), [0.012, 0.6, 0.01], [0.04, -0.5, 0.075]),
  });
}

// ── 9. cowboy_horse — cowboy on horseback for the cattle drive ──────────────
export function buildCowboyHorse(variant = 0) {
  const v = ((variant % 2) + 2) % 2;
  const g = root('cowboy_horse', v, { w: 0.9, h: 2.5, l: 2.4 });
  const K = new Kit(80 + v), rig = new Rig();
  const C = horseBody(K, rig, v, { rider: true });
  const off = [HORSE_SEAT[0], HORSE_SEAT[1] - (HIP_Y - 0.06), HORSE_SEAT[2]];
  const SHIRT = v ? '#7a6a52' : '#5a7090', CHAPS = '#6a4a30';
  human(K, rig, {
    skin: v ? SK[3] : SK[2], hair: HR[1], hairStyle: 'short', moustache: true, top: SHIRT, topStyle: 'shirt', bottom: '#46597a',
    shoes: '#5a3a26', boots: true, gloves: '#a07a50', hat: 'cowboy', hatColor: v ? '#c7b48a' : '#8a6a44', belt: '#4a3324', build: 1.04,
    arms: { l: { ik: [0.08, 1.04, 0.38], pole: [1, -0.6, -0.4] }, r: { ik: [-0.36, 0.98, 0.16], pole: [-1, -0.2, -0.6] } },
    legs: { l: { ik: [0.37, 0.27, 0.12], pole: [0.6, 0, 1] }, r: { ik: [-0.37, 0.27, 0.12], pole: [-0.6, 0, 1] } },
    extrasBody: (k, d) => {
      k.front('#9e3a30', d.torsoD / 2 + 0.006, [[-0.12, 1.4], [0.12, 1.4], [0, 1.26]], 1); // neckerchief
      for (const x of [-0.1, 0.1]) k.box(shade(SHIRT, 0.8), [0.1, 0.03, 0.01], [x, 1.27, d.torsoD / 2 + 0.006]);
      k.box('#cfa24a', [0.07, 0.05, 0.012], [0, 0.91, d.torsoD * 0.47 + 0.01]);
    },
    extrasThigh: (k) => k.box(CHAPS, [0.165, 0.4, 0.185], [0, -0.2, 0], { c: 0.02, cv: true }), // leather chaps
    held: (k, s, h) => {
      if (s < 0) { // coiled lasso in the right hand
        k.torus('#c8b07a', 0.15, 0.014, [h[0] - 0.02, h[1] - 0.1, h[2] + 0.02], { rot: [0, Math.PI / 2, 0], rs: 3, ts: 10 });
        k.torus('#b89f6a', 0.13, 0.014, [h[0] - 0.04, h[1] - 0.12, h[2] + 0.04], { rot: [0.1, Math.PI / 2, 0], rs: 3, ts: 10 });
      }
    },
  }, { names: { body: 'rider', head: 'rider_head' }, offset: off, parent: 'body', legsOnBody: true });
  // stirrups under the rider's boots
  K.bone = rig.i('body');
  for (const s of [1, -1]) { K.box('#4a4743', [0.14, 0.03, 0.13], [s * 0.37, off[1] + 0.225, off[2] + 0.17]); K.box('#6b4128', [0.025, 0.36, 0.17], [s * 0.33, off[1] + 0.45, off[2] + 0.1], { rot: [0, 0, s * 0.12] }); }
  bakeRigid(g, K, rig);
  const m = measure(g);
  g.userData.size = { w: +m.w.toFixed(2), h: +m.h.toFixed(2), l: +m.l.toFixed(2) };
  g.userData.style = C.name;
  g.userData.rig = { seat: HORSE_SEAT };
  return g;
}
void SH_Y; void HORSE_COATS;
