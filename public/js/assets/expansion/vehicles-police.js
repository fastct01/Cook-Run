// ─────────────────────────────────────────────────────────────────────────────
// Expansion pack VEHICLES: police (rhino_truck, moto_cop, interceptor).
// Generic police only: "POLICE" text, no department names or real insignia.
// ─────────────────────────────────────────────────────────────────────────────
import {
  THREE, Kit, root, empty, PAL, mix, shade, addWheel, edgeQuad, sideBlob, arch,
  vrig, finish, beam, tube, figure, frameBox, policeLamps, textTex, addSign, sideSigns, addWheelGeo, bikeWheelGeo,
  fourWheels, carShell, carLamps, mirrors, doorSeams, handles, badge, pushBar, rivets, hazardStripes, grimeBand, CHARCOAL,
} from './vehicles-common.js';

/** Shared "POLICE" panel texture: navy letters on a reflective off-white panel. */
export function policeTex() {
  return textTex('police_panel', 'POLICE', { w: 512, h: 112, bg: '#e9e6dc', fg: PAL.copNavy, border: PAL.copNavy, bw: 7, inset: 6, size: 0.7, maxW: 0.84 });
}

// ═════════════════════════════════════════════════════════════════════════════
// RHINO — police armoured truck (5 stars). Original boxy design, ~6.6 × 2.7 × 3.1.
// Rear bay is hollow: when rear_door_l/_r swing open the `lobber` officer kneels
// at the doors and throws smoke canisters (throw_point = canister in his hand).
// ═════════════════════════════════════════════════════════════════════════════
export function buildRhino(variant = 0) {
  const g = root('rhino_truck', variant, { w: 2.7, h: 3.1, l: 6.6 });
  const k = new Kit(3100 + variant);
  const rig = vrig();
  const navy = variant === 1 ? '#2b3340' : PAL.copNavy;   // v1: unmarked charcoal-grey tactical
  const steel = CHARCOAL, dark = '#1f2126', plate = shade(navy, 0.82);
  const W = 2.5, hw = W / 2, zB = -3.22, zBay = -1.85, roofY = 2.62, floorY = 1.0;
  const wr = 0.56, ww = 0.42, zf = 2.05, zr = -1.95;

  // ── hull: solid front section + hollow rear bay ───────────────────────────
  const prof = [[zBay, 0.7], [2.98, 0.7], [3.15, 0.95], [3.14, 1.42], [2.9, 1.66], [1.95, 1.78], [1.42, 2.5], [1.2, roofY], [zBay, roofY]];
  k.extrude(navy, prof, W, { axis: 'x', bevel: 0.08 });
  const bayL = zBay - zB, bayZ = (zB + zBay) / 2;
  k.box(navy, [W, floorY - 0.7, bayL], [0, (0.7 + floorY) / 2, bayZ]);
  for (const s of [1, -1]) k.box(navy, [0.1, roofY - floorY, bayL], [s * (hw - 0.05), (floorY + roofY) / 2, bayZ]);
  k.box(navy, [W, 0.1, bayL], [0, roofY - 0.05, bayZ]);
  // structural ribs hide the joint + read as armour framing
  for (const s of [1, -1]) {
    k.box(steel, [0.06, 1.95, 0.14], [s * (hw + 0.02), 1.66, zBay]);
    k.box(steel, [0.06, 1.95, 0.12], [s * (hw + 0.02), 1.66, zB + 0.06]);
  }
  k.box(PAL.under, [1.7, 0.34, 6.0], [0, 0.6, -0.1]);
  // bay interior (seen when the rear doors swing open)
  const inC = '#6a6e73', inDark = '#55595e';
  k.rectZ(inC, zBay, [-1.15, 1.15], [floorY, roofY - 0.1], -1);
  k.rectX(inDark, hw - 0.1, [zB, zBay], [floorY, roofY - 0.1], -1);
  k.rectX(inDark, -(hw - 0.1), [zB, zBay], [floorY, roofY - 0.1], 1);
  k.poly('#7a7e83', [[-1.15, roofY - 0.1, zB], [1.15, roofY - 0.1, zB], [1.15, roofY - 0.1, zBay], [-1.15, roofY - 0.1, zBay]], { facing: [0, -1, 0], off: 0.012 });
  k.rectY('#3a3c40', floorY, [-1.15, 1.15], [zB, zBay]);
  for (let i = 0; i < 5; i++) k.rectY('#2e2f33', floorY + 0.004, [-1.1, 1.1], [zB + 0.12 + i * 0.27, zB + 0.2 + i * 0.27]);
  k.poly(PAL.lampWarm, [[-0.3, roofY - 0.11, -2.3], [0.3, roofY - 0.11, -2.3], [0.3, roofY - 0.11, -2.1], [-0.3, roofY - 0.11, -2.1]], { facing: [0, -1, 0], off: 0.014 });
  // bench (+X wall) and canister rack (−X wall)
  k.box(steel, [0.42, 0.08, 1.2], [0.9, 1.45, -2.5]);
  k.box(dark, [0.06, 0.45, 1.2], [0.72, 1.22, -2.5]);
  k.box(steel, [0.3, 0.05, 1.1], [-0.98, 1.6, -2.45]);
  k.box(steel, [0.3, 0.05, 1.1], [-0.98, 1.95, -2.45]);
  for (let i = 0; i < 5; i++) for (const y of [1.625, 1.975]) {
    const z = -2.9 + i * 0.2;
    k.cyl('#6f7377', 0.055, 0.055, 0.18, [-0.98, y + 0.09, z], { seg: 6 });
    k.cyl(PAL.orange, 0.057, 0.057, 0.04, [-0.98, y + 0.12, z], { seg: 6 });
  }

  // ── paint: charcoal skirt, reflective stripe, plates, rivets, grime ──────
  k.side(steel, hw, [[zB, 0.7], [3.0, 0.7], [3.0, 1.0], [zB, 1.0]], { off: 0.014 });
  k.side('#d8d6cc', hw, [[zB + 0.1, 1.02], [2.95, 1.02], [2.95, 1.07], [zB + 0.1, 1.07]], { off: 0.016 });
  k.side(plate, hw, [[zB + 0.12, 1.85], [1.0, 1.85], [1.0, 1.88], [zB + 0.12, 1.88]], { off: 0.016 });
  for (const z of [0.95, -0.5]) k.side(plate, hw, [[z - 0.015, 1.1], [z + 0.015, 1.1], [z + 0.015, 2.55], [z - 0.015, 2.55]], { off: 0.016 });
  for (const s of [1, -1]) {
    rivets(k, hw, zB + 0.25, 0.85, 1.93, 12, '#121826', 0.035, s);
    rivets(k, hw, -1.7, 0.8, 1.13, 8, '#121826', 0.035, s);
  }
  grimeBand(k, hw, zB + 0.05, 3.0, 0.72, mix(steel, PAL.dirt, 0.6), [[zf, wr], [zr, wr]], 31, 0.2);
  for (const s of [1, -1]) {
    sideBlob(k, mix(navy, PAL.dirt, 0.45), hw, zr - 0.8, 1.15, 0.35, 0.1, 37 + s, s, 0.02);
    sideBlob(k, PAL.rustDark, hw, 2.6, 1.2, 0.09, 0.06, 41 + s, s, 0.024);
  }
  // wheel arches + chunky flares
  arch(k, hw, zf, wr, wr + 0.1, 0.7, '#141516');
  arch(k, hw, zr, wr, wr + 0.1, 0.7, '#141516');
  for (const [zc] of [[zf], [zr]]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const a = Math.PI * (i / 6); pts.push([zc + Math.cos(a) * (wr + 0.22), 0.72 + Math.sin(a) * (wr + 0.05)]); }
    for (let i = 6; i >= 0; i--) { const a = Math.PI * (i / 6); pts.push([zc + Math.cos(a) * (wr + 0.1), 0.72 + Math.sin(a) * (wr - 0.06)]); }
    for (const s of [1, -1]) k.extrude(steel, pts, 0.12, { axis: 'x', pos: [s * (hw + 0.04), 0, 0] });
  }

  // ── cab glass: small armoured panes ───────────────────────────────────────
  edgeQuad(k, steel, [1.95, 1.78], [1.42, 2.5], [-1.2, 1.2], [0.0, 1.0], 0.01);
  edgeQuad(k, PAL.glass, [1.95, 1.78], [1.42, 2.5], [-1.05, -0.1], [0.2, 0.82], 0.018);
  edgeQuad(k, PAL.glass, [1.95, 1.78], [1.42, 2.5], [0.1, 1.05], [0.2, 0.82], 0.018);
  edgeQuad(k, PAL.glassHi, [1.95, 1.78], [1.42, 2.5], [0.55, 0.66], [0.26, 0.76], 0.022);
  edgeQuad(k, PAL.glassHi, [1.95, 1.78], [1.42, 2.5], [-0.5, -0.42], [0.26, 0.76], 0.022);
  k.box(steel, [2.3, 0.08, 0.3], [0, 2.52, 1.38]);   // sun/armour visor
  for (const s of [1, -1]) {
    k.side(steel, hw, [[0.78, 1.82], [1.72, 1.82], [1.32, 2.38], [0.78, 2.38]], { side: s, off: 0.014 });
    k.side(PAL.glass, hw, [[0.88, 1.9], [1.56, 1.9], [1.25, 2.3], [0.88, 2.3]], { side: s, off: 0.02 });
    k.side(PAL.glassHi, hw, [[1.15, 1.94], [1.22, 1.94], [1.3, 2.26], [1.23, 2.26]], { side: s, off: 0.024 });
    // gun-port slits along the bay + mid body
    for (const z of [-2.75, -1.25, 0.2]) {
      k.side(steel, hw, [[z - 0.24, 2.05], [z + 0.24, 2.05], [z + 0.24, 2.25], [z - 0.24, 2.25]], { side: s, off: 0.016 });
      k.side('#121315', hw, [[z - 0.18, 2.11], [z + 0.18, 2.11], [z + 0.18, 2.19], [z - 0.18, 2.19]], { side: s, off: 0.02 });
    }
    // cab door seams + handle + step
    k.side('#141a2a', hw, [[0.68, 1.1], [0.71, 1.1], [0.71, 2.45], [0.68, 2.45]], { side: s, off: 0.018 });
    k.side('#141a2a', hw, [[1.74, 1.1], [1.77, 1.1], [1.77, 1.75], [1.74, 1.75]], { side: s, off: 0.018 });
    k.box(PAL.chrome, [0.04, 0.05, 0.18], [s * (hw + 0.02), 1.7, 0.85]);
    k.box(steel, [0.22, 0.08, 0.7], [s * (hw + 0.1), 0.72, 1.2]);
    // mirrors on arms
    k.box(dark, [0.3, 0.04, 0.04], [s * (hw + 0.14), 2.0, 1.75]);
    k.box(dark, [0.07, 0.42, 0.2], [s * (hw + 0.3), 1.92, 1.75], { c: 0.02 });
    // mud flaps
    k.box('#1a1a1a', [0.04, 0.42, 0.3], [s * (hw - 0.18), 0.48, zr - 0.72]);
  }

  // ── nose: armoured grille, caged lamps, heavy ram ────────────────────────
  k.front(steel, 3.145, [[-1.05, 0.98], [1.05, 0.98], [1.05, 1.4], [-1.05, 1.4]], 1, { off: 0.012 });
  for (let i = 0; i < 6; i++) k.front('#101113', 3.145, [[-0.6, 1.03 + i * 0.06], [0.6, 1.03 + i * 0.06], [0.6, 1.06 + i * 0.06], [-0.6, 1.06 + i * 0.06]], 1, { off: 0.018 });
  for (const s of [1, -1]) {
    k.front(PAL.headlight, 3.145, [[s * 0.75 - 0.14, 1.1], [s * 0.75 + 0.14, 1.1], [s * 0.75 + 0.14, 1.3], [s * 0.75 - 0.14, 1.3]], 1, { off: 0.018 });
    for (let i = 0; i < 3; i++) k.box(dark, [0.025, 0.24, 0.025], [s * 0.75 - 0.1 + i * 0.1, 1.2, 3.18]);
    k.box(PAL.amber, [0.14, 0.07, 0.04], [s * 0.98, 1.36, 3.13]);
  }
  k.box(steel, [2.5, 0.3, 0.3], [0, 0.82, 3.1], { c: 0.05 });
  // ram (push bar, wedge plate)
  const rc = '#17181a';
  for (const s of [1, -1]) {
    k.box(rc, [0.12, 0.9, 0.12], [s * 0.62, 1.05, 3.36]);
    k.box(rc, [0.1, 0.1, 0.36], [s * 0.62, 0.78, 3.2]);
    k.box(rc, [0.1, 0.1, 0.36], [s * 0.62, 1.38, 3.2]);
  }
  k.box(rc, [1.6, 0.12, 0.12], [0, 1.45, 3.36]);
  k.box(rc, [1.6, 0.1, 0.1], [0, 1.12, 3.38]);
  k.box(rc, [2.0, 0.34, 0.14], [0, 0.72, 3.38], { c: 0.03, taper: [1, 0.6] });
  k.box(PAL.metal, [1.9, 0.04, 0.02], [0, 0.88, 3.46]);
  // tow hooks
  for (const s of [1, -1]) k.box('#8e2a22', [0.06, 0.12, 0.1], [s * 0.9, 0.62, 3.3]);

  // ── roof: rails, turret hatch with PA horn, spotlight, antennas ──────────
  for (const s of [1, -1]) k.box(steel, [0.06, 0.1, 4.2], [s * (hw - 0.08), roofY + 0.05, -1.0]);
  const tz = -0.75;
  k.cyl(steel, 0.5, 0.52, 0.16, [0, roofY + 0.08, tz], { seg: 10 });
  k.cyl(dark, 0.4, 0.4, 0.02, [0, roofY + 0.165, tz], { seg: 10 });
  k.at([0, roofY + 0.17, tz - 0.4], [-0.42, 0, 0], () => k.cyl('#4a4e55', 0.4, 0.4, 0.06, [0, 0.03, 0.4], { seg: 10 }));
  k.box(steel, [0.9, 0.34, 0.06], [0, roofY + 0.32, tz + 0.48], { taper: [0.85, 1] });
  k.cyl('#7d8186', 0.06, 0.17, 0.3, [0.3, roofY + 0.34, tz + 0.64], { axis: 'z', seg: 7 });
  k.cyl('#1e1f22', 0.16, 0.16, 0.01, [0.3, roofY + 0.34, tz + 0.795], { axis: 'z', seg: 7 });
  k.cyl(dark, 0.12, 0.13, 0.16, [-0.7, roofY + 0.1, -2.6], { seg: 8 });
  k.cyl(PAL.headlight, 0.1, 0.1, 0.02, [-0.7, roofY + 0.19, -2.6], { seg: 8, rot: [0.4, 0, 0] });
  k.box(dark, [0.02, 0.5, 0.02], [0.95, roofY + 0.25, -2.9]);
  k.box(dark, [0.02, 0.36, 0.02], [0.8, roofY + 0.18, -2.95]);
  for (let i = 0; i < 3; i++) k.box(plate, [0.55, 0.06, 0.32], [-0.35, roofY + 0.03, -1.9 - i * 0.4]);
  // light-bar base (lenses are the separate light_red / light_blue meshes)
  const lbz = 0.75, lby = roofY;
  k.box('#1d1e21', [1.7, 0.08, 0.36], [0, lby + 0.04, lbz], { c: 0.02 });
  k.box('#2a2b2f', [0.26, 0.13, 0.3], [0, lby + 0.145, lbz]);

  // ── rear: bumper step, tail lamps, chevrons on the doors ────────────────
  k.box(steel, [W, 0.22, 0.36], [0, 0.66, zB - 0.12], { c: 0.03 });
  for (let i = 0; i < 4; i++) k.box('#26282c', [W - 0.1, 0.02, 0.04], [0, 0.775, zB - 0.25 + i * 0.08]);
  hazardStripes(k, zB - 0.001, -1.2, 1.2, 0.72, 0.98, -1, '#d8d6cc', PAL.red, 8);
  for (const s of [1, -1]) {
    k.box(PAL.taillight, [0.22, 0.12, 0.05], [s * 1.0, 0.86, zB - 0.31]);
    k.box(PAL.amber, [0.12, 0.08, 0.05], [s * 0.72, 0.86, zB - 0.31]);
  }
  k.box(PAL.plate, [0.42, 0.16, 0.02], [0, 0.6, zB - 0.31]);

  // ── rear doors (hinged on the outer edges) ───────────────────────────────
  const dz = zB - 0.035, dt = 0.07, dy0 = floorY, dy1 = roofY - 0.1;
  const doors = [];
  for (const [name, s] of [['rear_door_l', 1], ['rear_door_r', -1]]) {
    const hx = s * (hw - 0.01);
    const bi = rig.add(name, [hx, (dy0 + dy1) / 2, dz], 'body');
    doors.push(bi);
    k.withBone(bi, () => {
      const xin = s * 0.008, xc = (hx + xin) / 2, dw = Math.abs(hx - xin);
      k.box(navy, [dw, dy1 - dy0, dt], [xc, (dy0 + dy1) / 2, dz], { c: 0.015 });
      // inner skin (visible when open)
      k.rectZ(inC, dz + dt / 2, [Math.min(hx, xin) + 0.04, Math.max(hx, xin) - 0.04], [dy0 + 0.05, dy1 - 0.05], 1);
      // armoured window + port
      const wx = s * 0.6;
      k.rectZ(steel, dz - dt / 2, [wx - 0.24, wx + 0.24], [1.95, 2.33], -1);
      k.rectZ(PAL.glass, dz - dt / 2 - 0.004, [wx - 0.18, wx + 0.18], [2.0, 2.28], -1);
      k.rectZ(PAL.glassHi, dz - dt / 2 - 0.008, [wx + 0.02, wx + 0.07], [2.03, 2.25], -1);
      k.rectZ(steel, dz - dt / 2, [wx - 0.22, wx + 0.22], [1.52, 1.66], -1);
      k.rectZ('#121315', dz - dt / 2 - 0.004, [wx - 0.17, wx + 0.17], [1.56, 1.62], -1);
      // hinges + handle + reflective chevrons
      for (const y of [1.2, 1.8, 2.35]) k.box(steel, [0.06, 0.14, 0.05], [hx - s * 0.02, y, dz - dt / 2 - 0.02]);
      k.box(PAL.chrome, [0.05, 0.18, 0.05], [s * 0.12, 1.6, dz - dt / 2 - 0.03]);
      hazardStripes(k, dz - dt / 2 - 0.001, Math.min(hx, xin) + 0.02, Math.max(hx, xin) - 0.02, 1.05, 1.32, -1, '#d8d6cc', PAL.red, 4);
    });
  }

  // ── lobber: officer kneeling in the bay, facing −Z; torso + arms on `lobber` ──
  const hip = [-0.22, 1.5, -2.78];
  const lob = rig.add('lobber', hip, 'body');
  let fig;
  k.withBone(lob, () => {
    fig = figure(k, {
      hip, yaw: Math.PI, lean: 0.25, legsBone: 0,
      skin: PAL.skin[2], top: '#2b3a5c', bottom: '#2a3142', boots: '#141416', gloves: '#18191b', armour: '#4a5468',
      head: { type: 'riot', color: '#2a3142', visor: '#5d7480' },
      hands: [[-0.55, 1.78, -3.2], [0.16, 2.36, -2.62]],     // left: pointing out the back; right: canister raised behind the head
      feet: [[-0.38, floorY + 0.06, -3.12], [-0.06, floorY + 0.06, -2.45]],
      armHint: [0.7, -0.3, -0.4], legHint: [0.15, 0.5, 0.9], bootShaft: true,
    });
  });
  k.withBone(lob, () => { frameBox(k, '#d8d6cc', fig.torso, [0, 0.02, 0], [0.47, 0.06, 0.32]); frameBox(k, PAL.copNavy, fig.torso, [0, 0.13, 0], [0.47, 0.03, 0.32]); });
  const hand = fig.hands[1];
  const tp = rig.add('throw_point', [hand.x, hand.y + 0.06, hand.z], 'lobber');
  k.withBone(tp, () => {
    k.cyl('#6f7377', 0.06, 0.06, 0.22, [hand.x, hand.y + 0.06, hand.z], { seg: 7, rot: [0.5, 0, 0] });
    k.cyl(PAL.orange, 0.062, 0.062, 0.05, [hand.x, hand.y + 0.1, hand.z + 0.02], { seg: 7, rot: [0.5, 0, 0] });
  });

  // ── wheels ───────────────────────────────────────────────────────────────
  fourWheels(k, rig, { zf, zr, x: hw - ww / 2 + 0.06, r: wr, w: ww, style: 'black' });
  const bones = finish(g, k, rig);
  void doors;

  // lamps: roof bar halves + grille strobes + rear corner strobes
  const [red, blue] = policeLamps(g,
    (lk) => { lk.box('#fff', [0.62, 0.14, 0.3], [0.48, lby + 0.15, lbz]); lk.box('#fff', [0.14, 0.07, 0.04], [0.42, 1.36, 3.15]); lk.box('#fff', [0.08, 0.14, 0.06], [1.12, 2.45, zB - 0.02]); },
    (lk) => { lk.box('#fff', [0.62, 0.14, 0.3], [-0.48, lby + 0.15, lbz]); lk.box('#fff', [0.14, 0.07, 0.04], [-0.42, 1.36, 3.15]); lk.box('#fff', [0.08, 0.14, 0.06], [-1.12, 2.45, zB - 0.02]); });
  bones.body.add(red, blue);
  // POLICE side panels
  if (variant === 0) sideSigns(bones.body, policeTex(), 3.3, 0.6, hw + 0.025, 1.4, -0.55, 'sign_police', '#e9e6dc');
  else sideSigns(bones.body, policeTex(), 1.7, 0.31, hw + 0.025, 1.3, -0.4, 'sign_police', '#e9e6dc');
  bones.body.add(empty('exhaust', [-0.95, 0.5, zB + 0.2]));
  g.userData.viewBox = undefined;
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// Police motorbike with its rider seated (~2.3 × 0.95 × 1.75).
// ═════════════════════════════════════════════════════════════════════════════
export function buildMotoCop(variant = 0) {
  const g = root('moto_cop', variant, { w: 0.95, h: 1.75, l: 2.3 });
  const k = new Kit(3200 + variant);
  const rig = vrig();
  const white = PAL.copWhite, navy = PAL.copNavy, dark = '#232427', chrome = PAL.chrome;
  const r = 0.33, zF = 0.8, zR = -0.74;
  // engine + frame
  k.box('#3a3c40', [0.34, 0.32, 0.55], [0, 0.5, 0.05], { c: 0.05 });
  for (const s of [1, -1]) {
    k.box(chrome, [0.16, 0.14, 0.2], [s * 0.26, 0.52, 0.22], { c: 0.03 });
    k.box('#5c5f63', [0.1, 0.16, 0.22], [s * 0.18, 0.52, 0.22]);
  }
  beam(k, dark, [0, 0.62, -0.3], [0, 0.98, 0.52], 0.08, 0.08);
  beam(k, dark, [0, 0.42, -0.25], [0, 0.4, zR], 0.06, 0.06);
  for (const s of [1, -1]) beam(k, chrome, [s * 0.09, r, zR], [s * 0.09, 0.72, -0.3], 0.05, 0.05);
  // tank + seat
  k.box(white, [0.36, 0.2, 0.52], [0, 0.82, 0.18], { c: 0.08, taper: [0.8, 0.9] });
  k.box(navy, [0.37, 0.05, 0.4], [0, 0.82, 0.18]);
  k.box('#1b1c1e', [0.32, 0.1, 0.62], [0, 0.88, -0.32], { c: 0.04 });
  // fairing + windscreen
  k.box(white, [0.62, 0.42, 0.34], [0, 0.96, 0.6], { c: 0.08, taper: [0.75, 0.7], shear: [0, -0.06] });
  k.box(navy, [0.63, 0.08, 0.35], [0, 0.86, 0.6]);
  k.box(PAL.headlight, [0.18, 0.12, 0.04], [0, 0.96, 0.78], { c: 0.02 });
  beam(k, '#3c4a52', [0, 1.14, 0.62], [0, 1.44, 0.5], 0.5, 0.025, { hint: [0, 0, 1] });
  beam(k, '#5f7079', [0.1, 1.17, 0.625], [0.14, 1.4, 0.53], 0.05, 0.03, { hint: [0, 0, 1] });
  // forks + bars
  for (const s of [1, -1]) beam(k, chrome, [s * 0.1, r, zF], [s * 0.1, 1.0, 0.52], 0.05, 0.05);
  beam(k, dark, [-0.4, 1.06, 0.44], [0.4, 1.06, 0.44], 0.035, 0.035);
  for (const s of [1, -1]) k.box('#1b1c1e', [0.1, 0.05, 0.05], [s * 0.4, 1.06, 0.44]);
  // mudguards
  k.box(white, [0.16, 0.04, 0.5], [0, r + 0.36, zF], { rot: [0.15, 0, 0] });
  k.box(white, [0.2, 0.04, 0.55], [0, r + 0.38, zR - 0.05], { rot: [-0.25, 0, 0] });
  k.box(PAL.taillight, [0.14, 0.06, 0.04], [0, 0.78, zR - 0.32]);
  // panniers + top box + crash bars + exhaust
  for (const s of [1, -1]) {
    k.box(white, [0.17, 0.38, 0.52], [s * 0.36, 0.64, -0.5], { c: 0.04 });
    k.box(navy, [0.175, 0.05, 0.53], [s * 0.36, 0.76, -0.5]);
    beam(k, chrome, [s * 0.16, 0.36, 0.42], [s * 0.4, 0.5, 0.36], 0.035, 0.035);
    beam(k, chrome, [s * 0.4, 0.5, 0.36], [s * 0.38, 0.72, 0.3], 0.035, 0.035);
    beam(k, chrome, [s * 0.38, 0.72, 0.3], [s * 0.18, 0.8, 0.36], 0.035, 0.035);
    k.box(dark, [0.04, 0.42, 0.04], [s * 0.3, 1.1, -0.72]);           // lamp poles
  }
  k.box(white, [0.42, 0.28, 0.36], [0, 1.0, -0.72], { c: 0.04 });
  k.box(navy, [0.43, 0.05, 0.37], [0, 0.98, -0.72]);
  tube(k, chrome, [-0.2, 0.36, 0.2], [-0.22, 0.32, -0.75], 0.045, 0.05, 6);
  tube(k, '#2a2826', [-0.22, 0.32, -0.75], [-0.22, 0.32, -0.82], 0.052, 0.052, 6);
  // rider
  const rb = rig.add('rider', [0, 1.0, -0.24], 'body');
  k.withBone(rb, () => figure(k, {
    hip: [0, 1.0, -0.24], lean: 0.3,
    skin: PAL.skin[1], top: navy, sleeve: navy, bottom: '#272b33', boots: '#141416', gloves: '#18191b', bootShaft: true,
    head: { type: 'moto', color: white, stripe: navy },
    hands: [[0.38, 1.08, 0.42], [-0.38, 1.08, 0.42]], feet: [[0.2, 0.42, 0.08], [-0.2, 0.42, 0.08]],
    armHint: [0.7, -0.6, -0.2], legHint: [0.35, 0.6, 0.6],
  }));
  // wheels
  addWheelGeo(k, rig, 'wheel_f', [0, r, zF], bikeWheelGeo(r, 0.13, { rim: '#b9b8b0', brake: true }), 1);
  addWheelGeo(k, rig, 'wheel_r', [0, r, zR], bikeWheelGeo(r, 0.16, { rim: '#b9b8b0' }), 1);
  const bones = finish(g, k, rig);
  const [red, blue] = policeLamps(g,
    (lk) => { lk.box('#fff', [0.08, 0.08, 0.04], [0.2, 1.0, 0.75]); lk.box('#fff', [0.08, 0.1, 0.08], [0.3, 1.34, -0.72]); },
    (lk) => { lk.box('#fff', [0.08, 0.08, 0.04], [-0.2, 1.0, 0.75]); lk.box('#fff', [0.08, 0.1, 0.08], [-0.3, 1.34, -0.72]); });
  bones.body.add(red, blue);
  sideSigns(bones.body, policeTex(), 0.44, 0.1, 0.45, 0.66, -0.5, 'sign_police', '#e9e6dc');
  return g;
}

// ═════════════════════════════════════════════════════════════════════════════
// Interceptor — highway-patrol muscle car, slate + white (~4.95 × 1.98 × 1.5).
// ═════════════════════════════════════════════════════════════════════════════
export function buildInterceptor(variant = 0) {
  const slate = variant === 1 ? '#2f3540' : '#4e5966', white = PAL.copWhite;
  const W = 1.98, hw = W / 2;
  const s = {
    W, color: slate, cabinColor: slate, roofColor: variant === 1 ? slate : white,
    profile: [[-2.42, 0.28], [2.38, 0.28], [2.47, 0.5], [2.43, 0.7], [2.24, 0.79], [0.78, 0.88], [-1.5, 0.9], [-2.3, 0.88], [-2.47, 0.64]],
    cabin: { y0: 0.86, y1: 1.3, zb: [-1.58, 0.76], zt: [-0.88, 0.04], wb: 0.9, wt: 0.71 },
    wheel: { r: 0.35, zf: 1.48, zr: -1.45 }, archLip: '#1d1f22', rearArchGrow: 0.1,
    pillarSplit: [[0.08, 0.5], [0.55, 0.9]],
    lights: { fz: 2.46, rz: -2.46, fy: 0.62, ry: 0.72, fx: 0.66, rx: 0.68 }, bumper: '#232427', headW: 0.34, tailW: 0.42,
  };
  const g = root('interceptor', variant, { w: 1.98, h: 1.5, l: 4.95 });
  const k = new Kit(3300 + variant);
  const rig = vrig();
  carShell(k, s);
  carLamps(k, s);
  for (const sd of [1, -1]) {
    // white door slash (v0) / plain slick-top (v1)
    if (variant === 0) k.side(white, hw, [[0.95, 0.31], [-1.15, 0.31], [-1.35, 0.8], [0.62, 0.8]], { side: sd, off: 0.016 });
    k.side('#1e2329', hw, [[-1.6, 0.8], [1.9, 0.8], [1.9, 0.83], [-1.6, 0.83]], { side: sd, off: 0.02 });
    badge(k, hw, 1.38, 0.62, 0.13, '#c9a24a', sd);
    if (variant === 1) badge(k, hw, 0.15, 0.6, 0.11, '#c9a24a', sd);
    sideBlob(k, mix(slate, PAL.dirt, 0.5), hw, -2.05, 0.45, 0.25, 0.08, 51 + sd, sd, 0.02);
  }
  doorSeams(k, hw, [0.78, -0.42], 0.33, 0.86, '#2a3038');
  handles(k, hw, [0.5], 0.78);
  mirrors(k, W, 0.96, 0.7, slate);
  // muscle cues: hood scoop, ducktail, side exhausts, wide rear tyres
  k.box(shade(slate, 0.8), [0.62, 0.1, 0.8], [0, 0.86, 1.45], { c: 0.03, taper: [0.9, 0.85] });
  k.box('#15171a', [0.5, 0.06, 0.02], [0, 0.88, 1.86]);
  k.box(slate, [1.7, 0.08, 0.3], [0, 0.94, -2.24], { c: 0.02, rot: [0.18, 0, 0] });
  for (const sd of [1, -1]) {
    k.cyl(PAL.chrome, 0.05, 0.05, 0.14, [sd * 0.5, 0.28, -2.5], { axis: 'z', seg: 7 });
    k.cyl('#1a1918', 0.04, 0.04, 0.02, [sd * 0.5, 0.28, -2.58], { axis: 'z', seg: 7 });
  }
  pushBar(k, 2.46, 0.26, 1.05);
  // A-pillar spotlight + antenna + roof number
  k.cyl(PAL.chrome, 0.06, 0.06, 0.13, [0.9, 0.98, 0.7], { axis: 'z', seg: 6 });
  k.box('#111', [0.02, 0.6, 0.02], [-0.55, 1.5, -1.75]);
  k.rectY('#1e2329', 1.302, [-0.18, 0.18], [-0.65, -0.4], { off: 0.006 });
  // wheels: wide rear
  addWheel(k, rig, 'wheel_fl', [hw - 0.13, 0.35, 1.48], 0.35, 0.26, 1, 'black');
  addWheel(k, rig, 'wheel_fr', [-(hw - 0.13), 0.35, 1.48], 0.35, 0.26, -1, 'black');
  addWheel(k, rig, 'wheel_rl', [hw - 0.15, 0.36, -1.45], 0.36, 0.32, 1, 'black');
  addWheel(k, rig, 'wheel_rr', [-(hw - 0.15), 0.36, -1.45], 0.36, 0.32, -1, 'black');
  // low, wide light bar
  const ly = 1.3, lz = -0.22;
  k.box('#1d1e21', [1.36, 0.07, 0.3], [0, ly + 0.035, lz], { c: 0.02 });
  k.box('#2a2b2f', [0.22, 0.1, 0.26], [0, ly + 0.12, lz]);
  const bones = finish(g, k, rig);
  const [red, blue] = policeLamps(g,
    (lk) => { lk.box('#fff', [0.5, 0.1, 0.26], [0.37, ly + 0.12, lz]); lk.box('#fff', [0.1, 0.05, 0.03], [0.32, 0.62, 2.5]); },
    (lk) => { lk.box('#fff', [0.5, 0.1, 0.26], [-0.37, ly + 0.12, lz]); lk.box('#fff', [0.1, 0.05, 0.03], [-0.32, 0.62, 2.5]); });
  bones.body.add(red, blue);
  if (variant === 0) sideSigns(bones.body, policeTex(), 1.05, 0.23, hw + 0.03, 0.55, -0.2, 'sign_police', '#e9e6dc');
  return g;
}
