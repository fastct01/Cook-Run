// ─────────────────────────────────────────────────────────────────────────────
// Expansion pack: PEOPLE & ANIMALS (owned by one art agent). Must export PACK.
//   builders:   { kind: { build: (variant) => THREE.Object3D, variants: n } }
//   categories: { x_people: [kind, ...] }
//   labels:     { kind: 'Human label' }
//   namedParts: { kind: ['part', ...] }          (checked by test/check-assets.js)
//
// Humans share Rook/Doc/ped's body (people-human.js is a verified copy of characters.js
// buildHuman + pose hooks): ~1.75 m adults, pivots body (pelvis 0,0.88,0) → head (neck),
// arm_l/arm_r (shoulders), leg_l/leg_r (hips); `_l` = +X; rotation.x > 0 swings a limb
// backward. Poses are baked into the limb meshes, so every pivot is at rotation 0.
// Animals follow the cow: body → leg_fl/leg_fr/leg_rl/leg_rr (+ head at the neck base, tail).
// All characters are original designs; adults only. See docs/assets-x/people.md.
// ─────────────────────────────────────────────────────────────────────────────
import {
  buildDocRoof, buildKestrel, buildPratt, buildCopOfficer, buildSwat, buildComet, buildClerk, buildFarmer,
  buildCowboyHorse, buildBiker, buildBandMember, buildDockWorker, buildLogger, buildRanger, buildGhostTownActor,
} from './people-cast.js';
import { buildGoat, buildSheep, buildHorse, buildGuardDog } from './people-animals.js';

const HUMAN = ['body', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r'];
const ANIMAL = ['body', 'head', 'tail', 'leg_fl', 'leg_fr', 'leg_rl', 'leg_rr'];

const builders = {
  doc_roof: { build: () => buildDocRoof(), variants: 1 },
  kestrel: { build: () => buildKestrel(), variants: 1 },
  sgt_pratt: { build: () => buildPratt(), variants: 1 },
  cop_officer: { build: (v) => buildCopOfficer(v), variants: 3 },
  swat_officer: { build: () => buildSwat(), variants: 1 },
  comet_hero: { build: () => buildComet(), variants: 1 },
  clerk: { build: (v) => buildClerk(v), variants: 6 },
  farmer: { build: (v) => buildFarmer(v), variants: 2 },
  cowboy_horse: { build: (v) => buildCowboyHorse(v), variants: 2 },
  biker: { build: (v) => buildBiker(v), variants: 3 },
  band_member: { build: (v) => buildBandMember(v), variants: 3 },
  dock_worker: { build: (v) => buildDockWorker(v), variants: 2 },
  logger: { build: () => buildLogger(), variants: 1 },
  ranger: { build: () => buildRanger(), variants: 1 },
  ghost_town_actor: { build: () => buildGhostTownActor(), variants: 1 },
  goat: { build: (v) => buildGoat(v), variants: 1 },
  sheep: { build: (v) => buildSheep(v), variants: 2 },
  horse: { build: (v) => buildHorse(v), variants: 3 },
  guard_dog: { build: (v) => buildGuardDog(v), variants: 2 },
};

export const PACK = {
  builders,
  categories: { x_people: Object.keys(builders) },
  labels: {
    doc_roof: 'Doc (roof defence)', kestrel: 'Mr. Kestrel (buyer)', sgt_pratt: 'Sgt. Dolores Pratt', cop_officer: 'Police officer',
    swat_officer: 'SWAT officer', comet_hero: 'The Midnight Comet', clerk: 'Shop clerk', farmer: 'Farmer', cowboy_horse: 'Cowboy on horseback',
    biker: 'Rattlers biker', band_member: 'Marching band', dock_worker: 'Dock worker', logger: 'Logger', ranger: 'Park ranger',
    ghost_town_actor: 'Ghost-town sheriff (actor)', goat: 'Goat', sheep: 'Sheep', horse: 'Horse', guard_dog: 'Junkyard dog',
  },
  namedParts: {
    doc_roof: [...HUMAN, 'nozzle'],
    kestrel: HUMAN, sgt_pratt: HUMAN, cop_officer: HUMAN,
    swat_officer: [...HUMAN, 'shield'],
    comet_hero: [...HUMAN, 'scarf'],
    clerk: HUMAN, farmer: HUMAN,
    cowboy_horse: [...ANIMAL, 'rider', 'rider_head', 'arm_l', 'arm_r'],
    biker: HUMAN,
    band_member: [...HUMAN, 'instrument'],
    dock_worker: HUMAN, logger: HUMAN, ranger: HUMAN, ghost_town_actor: HUMAN,
    goat: ANIMAL, sheep: ANIMAL, horse: ANIMAL, guard_dog: ANIMAL,
  },
};
