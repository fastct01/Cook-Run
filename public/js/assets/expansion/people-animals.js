// ─────────────────────────────────────────────────────────────────────────────
// people-animals.js — animals for the PEOPLE & ANIMALS expansion pack.
//   horse (3 coats, saddled), goat (cheeky Boer-style), sheep (2), guard_dog (2), + horseBody()
//   for cowboy_horse. Same rig contract as the base cow: `body` pivot (parent of all), legs
//   `leg_fl/leg_fr/leg_rl/leg_rr` pivoted at the shoulder/hip (rotation.x > 0 swings a leg
//   backward), plus `head` (pivot at the neck base: nod with rotation.x, look with rotation.y)
//   and `tail` (pivot at the tail root: wag with rotation.y / rotation.z).
// ─────────────────────────────────────────────────────────────────────────────
import { Kit, Rig, root, measure } from '../models/kit.js';
import { PAL, mix, shade } from '../palette.js';
import { bakeRigid } from './people-human.js';

function finish(g, K, rig, rotate) {
  bakeRigid(g, K, rig, rotate);
  const m = measure(g);
  g.userData.size = { w: +m.w.toFixed(2), h: +m.h.toFixed(2), l: +m.l.toFixed(2) };
  return g;
}

// ── horse ─────────────────────────────────────────────────────────────────
export const HORSE_COATS = [
  { name: 'bay', coat: '#7a4a2e', mane: '#2a211c', lower: '#2c241f', muzzle: '#3a2a22', blanket: '#3f6f6a', stripe: '#d9a83a', socks: [] },
  { name: 'chestnut', coat: '#a35d34', mane: '#d6bd86', lower: '#a35d34', muzzle: '#6b3e26', blanket: '#9e3a30', stripe: '#e8dcc0', socks: ['leg_rl', 'leg_rr', 'leg_fl'], blaze: true },
  { name: 'dapple grey', coat: '#bdb8ae', mane: '#e4e0d6', lower: '#7d7870', muzzle: '#5e5a55', blanket: '#5a6a8a', stripe: '#d9a83a', socks: [], dapple: '#a29d93' },
];
export const HORSE_SEAT = [0, 1.66, 0.06]; // top of the saddle seat (rider pelvis bottom goes here)

/** Horse into an existing Kit/Rig (root bone `body`). opts.saddle (default true), opts.rider (shorter fenders hidden by legs). */
export function horseBody(K, rig, coatIdx = 0, opts = {}) {
  const C = HORSE_COATS[((coatIdx % HORSE_COATS.length) + HORSE_COATS.length) % HORSE_COATS.length];
  const saddle = opts.saddle !== false;
  const LEG_Y = 1.02;
  K.bone = rig.add('body', [0, LEG_Y, 0]);
  // barrel, chest, hindquarters, belly shade
  K.box(C.coat, [0.56, 0.6, 1.3], [0, 1.27, -0.05], { c: 0.14 });
  K.box(C.coat, [0.5, 0.56, 0.32], [0, 1.31, 0.6], { c: 0.12 });
  K.box(C.coat, [0.58, 0.56, 0.5], [0, 1.36, -0.55], { c: 0.15 });
  K.box(shade(C.coat, 0.82), [0.4, 0.04, 0.9], [0, 0.985, -0.05]);
  if (C.dapple) {
    for (const s of [1, -1]) for (const [z, y, r] of [[-0.45, 1.32, 0.07], [-0.25, 1.2, 0.06], [-0.05, 1.36, 0.05], [0.12, 1.24, 0.05], [0.34, 1.32, 0.06], [-0.4, 1.17, 0.04]]) {
      const pts = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pts.push([z + Math.cos(a) * r, y + Math.sin(a) * r * 0.8]); }
      K.side(C.dapple, 0.28, pts, { side: s, off: 0.006 });
    }
  }
  // dust on the lower barrel
  for (const s of [1, -1]) K.side(mix(C.coat, PAL.dirt, 0.4), 0.28, [[-0.55, 1.12], [0.45, 1.12], [0.42, 1.17], [-0.52, 1.18]], { side: s, off: 0.006 });
  if (saddle) {
    // blanket, seat, horn, cantle, fenders + stirrups, cinch
    K.box(C.blanket, [0.6, 0.3, 0.62], [0, 1.47, 0.08], { c: 0.06, cv: true });
    for (const s of [1, -1]) K.box(C.stripe, [0.012, 0.05, 0.6], [s * 0.301, 1.36, 0.08]);
    K.box('#6b4128', [0.4, 0.09, 0.5], [0, 1.6, 0.08], { c: 0.04, cv: true });
    K.box('#5a3520', [0.2, 0.06, 0.34], [0, 1.65, 0.06], { c: 0.03 });
    K.box('#6b4128', [0.32, 0.13, 0.07], [0, 1.69, -0.14], { c: 0.03, cv: true, rot: [-0.25, 0, 0] });
    K.cyl('#5a3520', 0.035, 0.05, 0.12, [0, 1.7, 0.31], { seg: 6 });
    K.cyl('#3a2416', 0.06, 0.06, 0.02, [0, 1.77, 0.31], { seg: 6 });
    if (!opts.rider) for (const s of [1, -1]) {
      K.box('#6b4128', [0.025, 0.36, 0.17], [s * 0.315, 1.38, 0.12]);
      K.box('#4a4743', [0.12, 0.03, 0.1], [s * 0.33, 1.14, 0.12]);
    }
    K.box('#3a2416', [0.6, 0.05, 0.08], [0, 1.0, 0.3], { c: 0.02, cv: true }); // cinch under the belly
  }
  // head + neck (pivot at the neck base)
  K.bone = rig.add('head', [0, 1.45, 0.66], 'body');
  K.box(C.coat, [0.26, 0.66, 0.38], [0, 1.72, 0.84], { c: 0.08, cv: true, rot: [0.55, 0, 0], taper: [0.82, 0.78] });
  K.box(C.mane, [0.09, 0.66, 0.1], [0, 1.78, 0.68], { rot: [0.55, 0, 0], c: 0.03, cv: true });
  K.at([0, 1.95, 1.1], [0.78, 0, 0], () => {
    K.box(C.coat, [0.25, 0.26, 0.44], [0, 0, -0.04], { c: 0.06 });
    K.box(C.muzzle, [0.2, 0.22, 0.18], [0, -0.01, 0.24], { c: 0.05, cv: true });
    if (C.blaze) K.box('#ece6da', [0.07, 0.012, 0.36], [0, 0.131, 0.02]);
    for (const s of [1, -1]) {
      K.box('#151312', [0.02, 0.05, 0.05], [s * 0.126, 0.03, 0.02]); // eye
      K.box('#151312', [0.035, 0.03, 0.02], [s * 0.05, -0.02, 0.334]); // nostril
      K.box('#2a2320', [0.015, 0.03, 0.3], [s * 0.128, -0.05, 0.08]); // bridle cheek strap
      K.box(C.coat, [0.06, 0.13, 0.06], [s * 0.07, 0.17, -0.2], { rot: [-0.65, 0, s * -0.2], taper: [0.5, 0.6] }); // ears
    }
    K.box('#2a2320', [0.26, 0.03, 0.03], [0, 0.05, 0.2]); // noseband
    K.box(C.mane, [0.1, 0.05, 0.12], [0, 0.135, -0.14]); // forelock
  });
  if (saddle) for (const s of [1, -1]) K.box('#2a2320', [0.012, 0.012, 0.62], [s * 0.1, 1.6, 0.66], { rot: [-0.62, 0, 0] }); // reins
  // tail (pivot at the root)
  K.bone = rig.add('tail', [0, 1.52, -0.8], 'body');
  K.box(C.mane, [0.12, 0.26, 0.14], [0, 1.43, -0.86], { rot: [0.5, 0, 0] });
  K.box(C.mane, [0.16, 0.66, 0.12], [0, 1.06, -0.92], { rot: [-0.1, 0, 0], c: 0.03, cv: true, taper: [0.75, 1.0] });
  // legs
  for (const [name, x, z, rear] of [['leg_fl', 0.17, 0.52, 0], ['leg_fr', -0.17, 0.52, 0], ['leg_rl', 0.17, -0.58, 1], ['leg_rr', -0.17, -0.58, 1]]) {
    K.bone = rig.add(name, [x, LEG_Y, z], 'body');
    const low = C.socks.includes(name) ? '#ece6da' : C.lower;
    K.at([x, LEG_Y, z], () => {
      if (rear) {
        K.box(C.coat, [0.17, 0.5, 0.26], [0, -0.18, -0.02], { c: 0.04, cv: true, taper: [0.8, 0.7] });
        K.box(C.coat, [0.11, 0.3, 0.13], [0, -0.5, -0.08], { rot: [-0.25, 0, 0] });
      } else {
        K.box(C.coat, [0.16, 0.5, 0.2], [0, -0.2, 0], { c: 0.04, cv: true, taper: [0.75, 0.75] });
      }
      K.box(low, [0.1, 0.4, 0.11], [0, -0.7, rear ? -0.06 : 0], { c: 0.02, cv: true });
      K.box(low, [0.12, 0.08, 0.13], [0, -0.92, rear ? -0.04 : 0.01]);
      K.box('#2a2624', [0.14, 0.08, 0.16], [0, -0.98, rear ? -0.03 : 0.02]);
    });
  }
  return C;
}

export function buildHorse(variant = 0) {
  const g = root('horse', variant, { w: 0.7, h: 2.1, l: 2.4 });
  const K = new Kit(40 + variant), rig = new Rig();
  const C = horseBody(K, rig, variant);
  g.userData.style = C.name;
  return finish(g, K, rig);
}

// ── goat ────────────────────────────────────────────────────────────────────
export function buildGoat(variant = 0) {
  const g = root('goat', variant, { w: 0.5, h: 1.05, l: 1.2 });
  const K = new Kit(50 + variant), rig = new Rig();
  const white = '#ebe6da', brown = '#8a5234', hoof = '#3a302a', horn = '#b8ab92';
  const LEG_Y = 0.5;
  K.bone = rig.add('body', [0, LEG_Y, 0]);
  K.box(white, [0.34, 0.36, 0.8], [0, 0.68, -0.02], { c: 0.09 });
  K.box(white, [0.3, 0.3, 0.26], [0, 0.7, 0.32], { c: 0.08, cv: true });
  for (const s of [1, -1]) K.side(mix(white, PAL.dirt, 0.45), 0.17, [[-0.32, 0.6], [0.28, 0.6], [0.24, 0.645], [-0.28, 0.66]], { side: s, off: 0.006 });
  K.box(shade(white, 0.8), [0.24, 0.03, 0.5], [0, 0.505, -0.02]);
  // head + neck (Boer-style brown head, white blaze)
  K.bone = rig.add('head', [0, 0.78, 0.36], 'body');
  K.box(brown, [0.17, 0.34, 0.2], [0, 0.92, 0.42], { c: 0.05, cv: true, rot: [0.35, 0, 0] });
  K.at([0, 1.08, 0.55], [0.5, 0, 0], 1.3, () => {
    K.box(brown, [0.19, 0.19, 0.26], [0, 0, 0.0], { c: 0.04 });
    K.box(shade(brown, 0.9), [0.14, 0.14, 0.09], [0, -0.02, 0.15], { c: 0.03, cv: true });
    K.box('#efe9de', [0.06, 0.01, 0.24], [0, 0.098, 0.02]); // blaze
    K.box('#2a201b', [0.05, 0.02, 0.012], [0, -0.01, 0.197]); // nose
    K.box('#d98a8a', [0.04, 0.012, 0.06], [0.035, -0.085, 0.15], { rot: [0.3, 0.5, 0] }); // cheeky tongue
    for (const s of [1, -1]) {
      K.box('#d9c27a', [0.012, 0.04, 0.05], [s * 0.093, 0.04, -0.02]); // amber eye
      K.box('#15120f', [0.016, 0.012, 0.04], [s * 0.094, 0.04, -0.02]); // bar pupil
      K.box(brown, [0.17, 0.04, 0.07], [s * 0.15, 0.0, -0.06], { rot: [0.2, 0, s * -0.55] }); // floppy ears
      K.box(horn, [0.04, 0.16, 0.05], [s * 0.05, 0.14, -0.1], { rot: [-0.7, 0, s * -0.15], taper: [0.5, 0.5] }); // horns
    }
    K.box(shade(white, 0.88), [0.06, 0.14, 0.05], [0, -0.15, 0.06], { rot: [-0.3, 0, 0], taper: [0.5, 0.5] }); // beard
  });
  K.bone = rig.add('tail', [0, 0.84, -0.42], 'body');
  K.box(brown, [0.05, 0.13, 0.05], [0, 0.88, -0.45], { rot: [-0.7, 0, 0], taper: [0.6, 0.6] });
  for (const [name, x, z] of [['leg_fl', 0.1, 0.28], ['leg_fr', -0.1, 0.28], ['leg_rl', 0.1, -0.32], ['leg_rr', -0.1, -0.32]]) {
    K.bone = rig.add(name, [x, LEG_Y, z], 'body');
    K.at([x, LEG_Y, z], () => {
      K.box(white, [0.09, 0.3, 0.11], [0, -0.12, 0], { c: 0.02, cv: true, taper: [0.8, 0.8] });
      K.box(white, [0.06, 0.24, 0.06], [0, -0.36, 0]);
      K.box(hoof, [0.075, 0.06, 0.09], [0, -0.47, 0.01]);
    });
  }
  return finish(g, K, rig);
}

// ── sheep ───────────────────────────────────────────────────────────────────
export function buildSheep(variant = 0) {
  const g = root('sheep', variant, { w: 0.7, h: 0.95, l: 1.2 });
  const K = new Kit(60 + variant), rig = new Rig();
  const v1 = variant % 2 === 1;
  const wool = v1 ? '#d9d3c4' : '#e8e0cc', face = v1 ? '#d6cbbb' : '#2a2624', legC = v1 ? '#cfc4b2' : '#2a2624';
  const LEG_Y = 0.42;
  K.bone = rig.add('body', [0, LEG_Y, 0]);
  K.box(wool, [0.6, 0.5, 0.92], [0, 0.72, -0.02], { c: 0.16 });
  const tufts = [[0.12, 0.98, 0.18, 0.15], [-0.14, 0.97, -0.12, 0.16], [0.1, 0.96, -0.34, 0.13], [-0.1, 0.99, 0.32, 0.12], [0.27, 0.78, 0.0, 0.14], [-0.27, 0.8, 0.12, 0.13], [0.0, 0.72, -0.44, 0.15]];
  tufts.forEach(([x, y, z, r], i) => K.ico(i % 2 ? shade(wool, 0.94) : wool, r, [x, y, z], { jitter: 0.12, seed: 9 + i + variant * 7 }));
  for (const s of [1, -1]) K.side(mix(wool, PAL.dirt, 0.45), 0.3, [[-0.3, 0.64], [0.26, 0.64], [0.22, 0.69], [-0.26, 0.71]], { side: s, off: 0.006 });
  if (v1) K.top('#4f7fa0', 1.12, [[-0.06, -0.2], [0.08, -0.22], [0.1, -0.08], [-0.05, -0.06]], { off: 0.01 }); // farmer's paint mark
  // head
  K.bone = rig.add('head', [0, 0.8, 0.42], 'body');
  K.at([0, 0.86, 0.6], [0.4, 0, 0], () => {
    K.box(face, [0.2, 0.22, 0.3], [0, 0, 0], { c: 0.05 });
    K.box(wool, [0.22, 0.09, 0.14], [0, 0.11, -0.06], { c: 0.03 }); // wool cap
    K.box(v1 ? '#c99a8f' : '#1a1716', [0.08, 0.03, 0.02], [0, -0.03, 0.152]);
    for (const s of [1, -1]) {
      K.box(face, [0.13, 0.05, 0.07], [s * 0.14, 0.03, -0.06], { rot: [0, 0, s * -0.2] });
      K.box(v1 ? '#1d1b1a' : '#d9cfae', [0.012, 0.03, 0.04], [s * 0.102, 0.04, 0.02]);
    }
  });
  K.bone = rig.add('tail', [0, 0.82, -0.5], 'body');
  K.box(wool, [0.1, 0.16, 0.08], [0, 0.74, -0.53], { c: 0.03, cv: true });
  for (const [name, x, z] of [['leg_fl', 0.16, 0.28], ['leg_fr', -0.16, 0.28], ['leg_rl', 0.16, -0.32], ['leg_rr', -0.16, -0.32]]) {
    K.bone = rig.add(name, [x, LEG_Y, z], 'body');
    K.at([x, LEG_Y, z], () => {
      K.box(legC, [0.07, 0.4, 0.07], [0, -0.2, 0]);
      K.box('#1f1c1a', [0.08, 0.05, 0.09], [0, -0.395, 0.01]);
    });
  }
  g.userData.style = v1 ? 'white-faced' : 'black-faced';
  return finish(g, K, rig);
}

// ── guard dog ───────────────────────────────────────────────────────────────
export function buildGuardDog(variant = 0) {
  const g = root('guard_dog', variant, { w: 0.5, h: 0.95, l: 1.15 });
  const K = new Kit(70 + variant), rig = new Rig();
  const v1 = variant % 2 === 1;
  const coat = v1 ? '#3a302a' : '#a87a4a', tan = v1 ? '#b0783f' : '#c79a64', mask = v1 ? '#2a2320' : '#2e2622';
  const LEG_Y = 0.44;
  K.bone = rig.add('body', [0, LEG_Y, 0]);
  K.box(coat, [0.4, 0.38, 0.42], [0, 0.66, 0.2], { c: 0.09 });
  K.box(coat, [0.34, 0.32, 0.56], [0, 0.68, -0.22], { c: 0.08, cv: true });
  K.box(tan, [0.26, 0.2, 0.06], [0, 0.6, 0.41], { c: 0.03 }); // chest blaze
  K.box(shade(coat, 0.85), [0.3, 0.04, 0.4], [0, 0.535, -0.05]);
  for (const s of [1, -1]) K.side(mix(coat, PAL.dirt, 0.4), 0.17, [[-0.42, 0.55], [-0.03, 0.55], [-0.06, 0.6], [-0.4, 0.62]], { side: s, off: 0.006 });
  // collar (plain leather, brass tag — no spikes)
  K.box('#9e3a30', [0.3, 0.06, 0.26], [0, 0.82, 0.37], { c: 0.03, cv: true, rot: [0.35, 0, 0] });
  K.cyl('#d9a83a', 0.03, 0.03, 0.012, [0, 0.74, 0.49], { axis: 'z', seg: 6 });
  // head
  K.bone = rig.add('head', [0, 0.78, 0.36], 'body');
  K.box(coat, [0.22, 0.24, 0.2], [0, 0.86, 0.42], { c: 0.05, cv: true, rot: [0.4, 0, 0] });
  K.at([0, 0.98, 0.52], [0.1, 0, 0], () => {
    K.box(coat, [0.3, 0.26, 0.26], [0, 0, 0], { c: 0.06 });
    K.box(mask, [0.2, 0.13, 0.17], [0, -0.06, 0.2], { c: 0.04 }); // muzzle
    K.box('#141211', [0.08, 0.05, 0.03], [0, -0.01, 0.29]); // nose
    K.box('#d9707a', [0.07, 0.015, 0.1], [0.02, -0.14, 0.22], { rot: [0.9, 0, 0] }); // tongue out (friendly)
    K.box(tan, [0.24, 0.03, 0.04], [0, 0.07, 0.125]); // brow band
    for (const s of [1, -1]) {
      K.box('#151312', [0.035, 0.04, 0.02], [s * 0.065, 0.03, 0.131]);
      K.box('#f2ead8', [0.012, 0.012, 0.01], [s * 0.058, 0.04, 0.142]); // eye glint
      K.box(mask, [0.06, 0.17, 0.12], [s * 0.165, -0.03, -0.02], { rot: [0, 0, s * 0.18] }); // floppy ears
    }
  });
  // tail (up, happy)
  K.bone = rig.add('tail', [0, 0.78, -0.48], 'body');
  K.box(coat, [0.06, 0.3, 0.06], [0, 0.9, -0.55], { rot: [-0.55, 0, 0], taper: [0.6, 0.6] });
  for (const [name, x, z, front] of [['leg_fl', 0.12, 0.24, 1], ['leg_fr', -0.12, 0.24, 1], ['leg_rl', 0.12, -0.36, 0], ['leg_rr', -0.12, -0.36, 0]]) {
    K.bone = rig.add(name, [x, LEG_Y, z], 'body');
    K.at([x, LEG_Y, z], () => {
      K.box(coat, [front ? 0.12 : 0.13, 0.26, front ? 0.13 : 0.17], [0, -0.08, 0], { c: 0.03, cv: true, taper: [0.8, 0.8] });
      K.box(tan, [0.09, 0.2, 0.09], [0, -0.3, 0]);
      K.box(tan, [0.11, 0.05, 0.13], [0, -0.415, 0.03], { c: 0.015 });
    });
  }
  g.userData.style = v1 ? 'black & tan' : 'tan';
  return finish(g, K, rig);
}
