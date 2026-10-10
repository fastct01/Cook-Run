// Idle station props — what each step station shows while nothing is being worked there.
// Built from the SAME builders + LAYOUT as the presenters so idle ↔ active swaps line up.
import * as THREE from 'three';
import {
  LAYOUT, INGREDIENT_DEFAULTS, kitMesh, contactShadows,
  addMortar, addSaltJar, makeJarLabel, makePestle, pestleRestPose,
  addBeakerSolid, makeBeakerGlass, makeBottle,
  buildStoveSet,
  addSink, makeTray,
  addBreakTray, addRolledBags, makeSmallHammer,
  addToolBoard, makePegboardFace, makeClawHammer,
} from './props.js';

export function buildIdle(stationId, opts = {}) {
  const ing = opts.lab?.ingredients || {};
  const info = (id) => ing[id] || INGREDIENT_DEFAULTS[id] || { name: id, color: '#9fd3c7' };
  const grp = new THREE.Group();
  grp.name = `idle_${stationId}`;
  grp.userData.station = stationId;
  switch (stationId) {
    case 'grind': {
      const P = LAYOUT.grind.mortar;
      grp.add(kitMesh('idle_grind', (k) => { addMortar(k, P); addSaltJar(k, LAYOUT.grind.jar, info('salts').color); }));
      grp.add(makeJarLabel(LAYOUT.grind.jar, 'salts', info('salts').name, info('salts').color));
      const pestle = makePestle();
      pestleRestPose(pestle, P);
      grp.add(pestle);
      grp.add(contactShadows([[P[0], P[2], 0.13, 0.12, 0.34], [LAYOUT.grind.jar[0], LAYOUT.grind.jar[2], 0.055, 0.05, 0.3]]));
      return grp;
    }
    case 'measure': {
      const B = LAYOUT.measure.beaker;
      grp.add(kitMesh('idle_measure', (k) => addBeakerSolid(k, B), { shadows: false }));
      const glass = makeBeakerGlass();
      glass.position.set(B[0], 0, B[2]);
      grp.add(glass);
      LAYOUT.measure.rackIds.forEach((id, i) => {
        const b = makeBottle(id, info(id).name, info(id).color);
        const R = LAYOUT.measure.rack[i];
        b.group.position.set(R[0], R[1], R[2]);
        b.group.rotation.y = -0.25 + i * 0.12;
        grp.add(b.group);
      });
      grp.add(contactShadows([[B[0], B[2], 0.095, 0.085, 0.32], ...LAYOUT.measure.rack.map((R) => [R[0], R[2], 0.055, 0.05, 0.3])]));
      return grp;
    }
    case 'stove': {
      const set = buildStoveSet({ lid: 'on' });
      set.group.name = 'idle_stove_set';
      grp.add(set.group);
      grp.userData.knob = set.knob;      // VanLab3D may turn it for flavour
      return grp;
    }
    case 'cool': {
      const P = LAYOUT.cool.sink;
      grp.add(kitMesh('idle_cool', (k) => addSink(k, P, { ice: false })));
      const tray = makeTray();
      tray.position.set(P[0], 0.012, P[2]);
      grp.add(tray);
      grp.add(contactShadows([[P[0], P[2], 0.38, 0.25, 0.34]]));
      return grp;
    }
    case 'break': {
      const T = LAYOUT.break.tray, BG = LAYOUT.break.bags, H = LAYOUT.break.hammer;
      grp.add(kitMesh('idle_break', (k) => { addBreakTray(k, T); addRolledBags(k, [BG[0], 0, BG[2]]); }));
      const hammer = makeSmallHammer();
      hammer.position.set(H[0] - 0.08, 0.013, H[2]);
      hammer.quaternion.setFromEuler(new THREE.Euler(0, 0.35, -Math.PI / 2, 'YXZ'));
      grp.add(hammer);
      grp.add(contactShadows([[T[0], T[2], 0.21, 0.2, 0.3], [BG[0], BG[2], 0.08, 0.06, 0.28]]));
      return grp;
    }
    case 'hammer': {
      const Bd = LAYOUT.hammer.board;
      grp.add(kitMesh('idle_hammer', (k) => addToolBoard(k, Bd, { sheet: true, hammerHook: true })));
      grp.add(makePegboardFace(Bd));
      // claw hammer hanging head-up on the hook
      const h = makeClawHammer();
      h.position.set(Bd[0] - 0.05, Bd[1] - 0.13, Bd[2] + 0.04);
      h.rotation.set(0, Math.PI / 2, 0.08);
      grp.add(h);
      return grp;
    }
    default: return null;
  }
}
