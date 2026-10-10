// ─────────────────────────────────────────────────────────────────────────────
// Round 3 pack (PROPOSED, not wired into the game yet): the redesigned first-person cab —
// realistic steering wheel and hands. Owned by agent R3-CAB. Exports PACK.
//   rv_cab_fp_r3  v0: blue nitrile gloves + yellow protective-suit cuffs · v1: bare hands + flannel cuffs
// Builder: r3-cab-model.js (helpers r3-cab-geo.js, r3-cab-hands.js, r3-cab-atlas.js). Notes: docs/NOTES-r3-cab.md
// ─────────────────────────────────────────────────────────────────────────────
import { buildRvCabFpR3 } from './r3-cab-model.js';

const RV_CAB_FP_PARTS = ['needle_speed', 'needle_rpm', 'needle_temp', 'wheel', 'hand_l', 'hand_r', 'wiper_l', 'wiper_r', 'mirror_l_glass', 'mirror_r_glass', 'mirror_c_glass'];

export const PACK = {
  builders: { rv_cab_fp_r3: { build: buildRvCabFpR3, variants: 2 } },
  categories: { x_round3: ['rv_cab_fp_r3'] },
  labels: { rv_cab_fp_r3: 'RV cab, redesigned (proposed)' },
  namedParts: {
    rv_cab_fp_r3: [...RV_CAB_FP_PARTS, 'horn_pad', 'stalk_signal', 'stalk_wiper', 'gear_pointer', 'key', 'lamp_check', 'lamp_oil', 'lamp_heat'],
  },
};
