import { loadDataNode } from '../../data/loadData.js';
import { GameSim } from '../GameSim.js';
const data = await loadDataNode();
const DT = 1/60;
const seed = +(process.argv[2] || 9);
const sim = new GameSim(data, { seed, solo: true });
sim.applyDriverCommand({ type: 'skipTutorial' });
for (let i = 0; i < 600 && sim.phase !== 'drive'; i++) sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);
const def = data.route.stops[0], lot = sim.track.stopLot(def), rv = sim.rv;
rv.x = lot.cx; rv.z = lot.cz; rv.yaw = sim.road.heading ? sim.road.heading(lot.cz) : 0; rv.vx = rv.vz = 0; rv.speed = 0; rv.w = 0;
sim.traffic.frontier = rv.z + 40; sim.peds.frontier = rv.z + 40;
sim.heat.set(2.4);
let last = -1; const evs = [];
for (let i = 0; i < 60 * 40 && sim.phase === 'drive'; i++) {
  sim.step({ throttle: 0, steer: 0, handbrake: true }, DT);
  for (const e of sim.drainLocalEvents()) if (['shot','copDisabled','copHit','roofHit','reload'].includes(e.type)) evs.push(`${sim.t.toFixed(2)} ${e.type} ${e.gun||e.device||''} ${e.copId??''} ${e.part||e.how||''} ${e.effect||''}`);
  if (sim.t - last > 1 && sim.t > 10) { last = sim.t; console.log(sim.t.toFixed(1), sim.roof.gun, 'mag', sim.roof.mag[sim.roof.gun], 'rl', sim.roof.reload ? sim.roof.reload.left.toFixed(1) : '-', 'tgt', sim.roof.ai.targetId, sim.roof.ai.part, 'bust', sim.heat.bust.toFixed(2), sim.copsList().map(c => `${c.id}:${c.state}@${Math.hypot(c.x-rv.x,c.z-rv.z).toFixed(1)}:${(sim.roof._outUntil.get(c.id)-sim.roof.t||0).toFixed(1)}`).join(' ')); }
}
console.log(evs.join('\n'));
