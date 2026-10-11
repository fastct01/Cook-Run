// ─────────────────────────────────────────────────────────────────────────────
// Round 3 pack (PROPOSED, not wired into the game yet): garage chemistry gear, protective apparel,
// suited crew and the way-out arrow. Owned by agent R3-GARAGE. Exports PACK.
// Builders live in r3-garage-lab.js (lab gear), r3-garage-gear.js (suit rack, suited crew, exit
// arrows) and r3-garage-atlas.js (the one label/sign atlas + pack materials).
// Preview: public/r3-garage-preview.html · notes: docs/NOTES-r3-garage.md.
// ─────────────────────────────────────────────────────────────────────────────
import { measure } from '../models/kit.js';
import {
  buildChemBench, buildFumeHood, buildChemDrums, buildGasCylinders, buildReagentShelf, buildRecipeWhiteboard,
  buildElementPoster, buildSafetyStation,
} from './r3-garage-lab.js';
import { buildSuitRack, buildCrewSuited, buildExitArrow } from './r3-garage-gear.js';

/** userData.size = the measured bounds (w × h × l), so getFootprint() is honest for layout. */
const fit = (build) => (v) => {
  const g = build(v);
  if (g.userData.kind !== 'crew_suited') {
    const m = measure(g);
    g.userData.size = { w: +m.w.toFixed(2), h: +Math.max(0.01, m.h).toFixed(2), l: +m.l.toFixed(2) };
  }
  return g;
};
const B = (build, variants = 1) => ({ build: fit(build), variants });

const builders = {
  chem_bench: B(buildChemBench),
  fume_hood: B(buildFumeHood),
  chem_drums: B(buildChemDrums, 2),
  gas_cylinders: B(buildGasCylinders),
  reagent_shelf: B(buildReagentShelf),
  recipe_whiteboard: B(buildRecipeWhiteboard),
  element_poster: B(buildElementPoster),
  safety_station: B(buildSafetyStation),
  suit_rack: B(buildSuitRack),
  crew_suited: B(buildCrewSuited, 2),
  exit_arrow: B(buildExitArrow, 2),
};

const labels = {
  chem_bench: 'Lab bench + glassware',
  fume_hood: 'Homemade fume hood',
  chem_drums: 'Chemical drums / jerrycans',
  gas_cylinders: 'Gas cylinder rack',
  reagent_shelf: 'Reagent shelf',
  recipe_whiteboard: 'Recipe whiteboard',
  element_poster: 'Element poster',
  safety_station: 'Safety station',
  suit_rack: 'Suit rack (PPE)',
  crew_suited: 'Crew in suits (Rook / Doc)',
  exit_arrow: 'Way-out arrow',
};

const CHEV = Array.from({ length: 8 }, (_, i) => `chev_${i}`);
const namedParts = {
  suit_rack: ['suit_0', 'suit_1'],
  crew_suited: ['leg_l', 'leg_r', 'arm_l', 'arm_r', 'head', 'body'],
  exit_arrow: [...CHEV, 'arrow'],
};

export const R3_GARAGE_KINDS = Object.keys(builders);
export const PACK = { builders, categories: { x_round3: R3_GARAGE_KINDS.slice() }, labels, namedParts };
