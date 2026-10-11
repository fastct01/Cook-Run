// ─────────────────────────────────────────────────────────────────────────────
// Round 3 pack (PROPOSED, not wired into the game yet): a younger Rook + real guns for the roof
// defence. Owned by agent R3-ROOK. Exports PACK.
//   r3-rook-body.js  rook_young (v0 casual, v1 suited) · rook_roof_aim (v0 revolver, v1 shotgun, v2 rifle)
//   r3-rook-guns.js  gun_revolver · gun_shotgun · gun_rifle · ammo_box (3) · muzzle_flash (2) · shell_casing (3)
//   r3-rook-fx.js    bullet_hole (2) · windshield_crack (2) · flat_tyre (2) + stickOnWindscreen / fitFlatTyre
// Tone: shots hit the police CARS (tyres, radiators, windscreens); officers duck — no blood, no gore.
// Preview: public/r3-rook-preview.html · notes: docs/NOTES-r3-rook.md.
// ─────────────────────────────────────────────────────────────────────────────
import { measure } from '../models/kit.js';
import { buildRookYoung, buildRookRoofAim } from './r3-rook-body.js';
import { buildGun, buildAmmoBox, buildMuzzleFlash, buildShellCasing } from './r3-rook-guns.js';
import { buildBulletHole, buildWindshieldCrack, buildFlatTyre } from './r3-rook-fx.js';

const CHAR = new Set(['rook_young', 'rook_roof_aim']);
/** userData.size = measured bounds (h ≥ 0.01 so flat decals still report a size); characters keep the body footprint. */
const fit = (build) => (v) => {
  const g = build(v);
  if (!CHAR.has(g.userData.kind)) {
    const m = measure(g);
    g.userData.size = { w: +Math.max(0.01, m.w).toFixed(2), h: +Math.max(0.01, m.h).toFixed(2), l: +Math.max(0.01, m.l).toFixed(2) };
  }
  return g;
};
const B = (build, variants = 1) => ({ build: fit(build), variants });

const builders = {
  rook_young: B(buildRookYoung, 2),
  rook_roof_aim: B(buildRookRoofAim, 3),
  gun_revolver: B(() => buildGun('revolver')),
  gun_shotgun: B(() => buildGun('shotgun')),
  gun_rifle: B(() => buildGun('rifle')),
  ammo_box: B(buildAmmoBox, 3),
  muzzle_flash: B(buildMuzzleFlash, 2),
  shell_casing: B(buildShellCasing, 3),
  bullet_hole: B(buildBulletHole, 2),
  windshield_crack: B(buildWindshieldCrack, 2),
  flat_tyre: B(buildFlatTyre, 2),
};

const labels = {
  rook_young: 'Rook, younger (casual / suited)',
  rook_roof_aim: 'Rook aiming on the roof (revolver / shotgun / rifle)',
  gun_revolver: 'Revolver (6-shot)',
  gun_shotgun: 'Pump shotgun',
  gun_rifle: 'Bolt-action rifle + scope',
  ammo_box: 'Ammo box (revolver / shells / rifle)',
  muzzle_flash: 'Muzzle flash (star / wide)',
  shell_casing: 'Spent casing (rifle / shell / revolver)',
  bullet_hole: 'Bullet hole decal (metal / glass)',
  windshield_crack: 'Windscreen crack decal',
  flat_tyre: 'Flat tyre (cop wheel)',
};

const HUMAN = ['body', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r'];
const GUN = { revolver: ['gun', 'cylinder', 'hammer', 'muzzle', 'grip'], shotgun: ['gun', 'pump', 'muzzle', 'grip'], rifle: ['gun', 'bolt', 'muzzle', 'grip'] };
const namedParts = {
  rook_young: HUMAN,
  rook_roof_aim: [...HUMAN, 'gun', 'muzzle', 'grip'],
  gun_revolver: GUN.revolver,
  gun_shotgun: GUN.shotgun,
  gun_rifle: GUN.rifle,
  ammo_box: ['lid'],
  muzzle_flash: ['flash'],
  shell_casing: ['casing'],
  bullet_hole: ['decal'],
  windshield_crack: ['decal'],
  flat_tyre: ['wheel'],
};

export const R3_ROOK_KINDS = Object.keys(builders);
/** Tri budgets this pack holds itself to (the shared checker allows 6k for x_* kinds). */
export const R3_ROOK_BUDGET = { character: 1200, prop: 1500, characters: ['rook_young', 'rook_roof_aim'] };
export const PACK = { builders, categories: { x_round3: R3_ROOK_KINDS.slice() }, labels, namedParts };
