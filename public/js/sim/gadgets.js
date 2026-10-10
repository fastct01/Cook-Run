// ─────────────────────────────────────────────────────────────────────────────
// GadgetSystem: the driver's cook-made toys (one charge each in inv.gadgets).
//  • nitro (Shift edge): rv.nitroT = rules.rv.nitroSeconds → higher top speed/accel.
//  • smoke (Q edge): smoke_cloud entity dropped behind the RV for smoke.duration s;
//    cops entering it are blinded (state 2) for smoke.blindSeconds; shakes the rival.
//  • oil (E edge): oil_slick entity behind the RV for oil.duration s; cops/traffic
//    crossing it spin out (cop state 3 / car state 2) for oil.spinSeconds.
// No charge → msg "No smoke bombs — ask the cook!". Every use → event 'gadget'.
// state of smoke_cloud / oil_slick entities = age seconds × 10 (int).
// Unity port: GadgetLauncher (on the RV) + SmokeCloud / OilSlick trigger volumes.
// ─────────────────────────────────────────────────────────────────────────────
import { KIND_ID } from '../shared/protocol.js';
import { clamp } from './util.js';

const NONE_MSG = {
  smoke: 'No smoke bombs — ask the cook!',
  oil: 'No oil slicks — ask the cook!',
  nitro: 'No nitro — ask the cook!',
};

export class GadgetSystem {
  constructor(sim) {
    this.sim = sim;
    this.items = []; // { id, kind:'smoke'|'oil', x, z, age, life, r, yaw }
    this.used = { smoke: 0, oil: 0, nitro: 0 };
  }

  _consume(g) {
    const sim = this.sim, inv = sim.inv;
    if ((inv.gadgets[g] || 0) <= 0) { sim.emit({ type: 'msg', text: NONE_MSG[g], tone: 'bad' }); return false; }
    inv.gadgets[g]--;
    this.used[g]++;
    return true;
  }

  handleInput(input) {
    const sim = this.sim, rv = sim.rv;
    if (sim.phase !== 'drive') return;
    if (input.nitro && rv.nitroT <= 0 && this._consume('nitro')) {
      rv.nitroT = sim.rules.rv.nitroSeconds ?? sim.rules.gadgets.nitro.seconds;
      sim.emit({ type: 'gadget', gadget: 'nitro', x: rv.x, z: rv.z });
    }
    if (input.smoke && this._consume('smoke')) this._drop('smoke', 5.5);
    if (input.oil && this._consume('oil')) this._drop('oil', 2.0);
  }

  // Plugin helpers: active zones on the road, and spending a charge from outside the cab.
  zones() { return this.items.map((it) => ({ kind: it.kind, x: it.x, z: it.z, r: it.r, age: it.age })); }
  use(kind, opts = {}) {
    const sim = this.sim, inv = sim.inv;
    if (!['smoke', 'oil', 'nitro'].includes(kind) || (inv.gadgets[kind] || 0) <= 0 || sim.phase !== 'drive') return false;
    inv.gadgets[kind]--;
    this.used[kind]++;
    if (opts.place && kind !== 'nitro' && Number.isFinite(opts.x) && Number.isFinite(opts.z)) this._place(kind, opts.x, opts.z);
    return true;
  }
  _place(kind, x, z) {
    const sim = this.sim, G = sim.rules.gadgets[kind];
    const it = {
      id: sim.newId(), kind, kid: KIND_ID[kind === 'smoke' ? 'smoke_cloud' : 'oil_slick'],
      x, y: sim.road.surfaceY(z) ?? 0, z, yaw: sim.rv.yaw, age: 0, life: G.duration, r: G.radius,
    };
    this.items.push(it);
    sim.emit({ type: 'gadget', gadget: kind, x, z });
  }

  _drop(kind, extraBack) {
    const sim = this.sim, rv = sim.rv, G = sim.rules.gadgets[kind];
    // at speed the canister lands behind the RV; at a standstill it pops right beside it
    const k = clamp(Math.abs(rv.speed) / 10, 0, 1);
    const back = (rv.len / 2 + extraBack) * (kind === 'smoke' ? k : 0.5 + 0.5 * k);
    const x = rv.x - Math.sin(rv.yaw) * back, z = rv.z - Math.cos(rv.yaw) * back;
    const it = {
      id: sim.newId(), kind, kid: KIND_ID[kind === 'smoke' ? 'smoke_cloud' : 'oil_slick'],
      x, y: kind === 'smoke' ? Math.max(0, rv.y) : (sim.road.surfaceY(z) ?? 0), z, yaw: rv.yaw,
      age: 0, life: G.duration, r: G.radius,
    };
    this.items.push(it);
    sim.emit({ type: 'gadget', gadget: kind, x, z });
  }

  update(dt) {
    const sim = this.sim, G = sim.rules.gadgets;
    for (const it of this.items) {
      it.age += dt;
      const r = it.kind === 'smoke' ? it.r * Math.min(1, 0.45 + it.age * 0.8) : it.r; // smoke billows out
      const r2 = r * r;
      if (it.kind === 'smoke') {
        for (const c of sim.cops.cops) {
          if (c.kind === 'heli') continue;
          const dx = c.x - it.x, dz = c.z - it.z;
          if (dx * dx + dz * dz < r2) sim.cops.blind(c, G.smoke.blindSeconds);
        }
        for (const car of sim.traffic.cars) {
          if (!car.hostile) continue;
          const dx = car.x - it.x, dz = car.z - it.z;
          if (dx * dx + dz * dz < r2) sim.traffic.rivalShaken(car);
        }
      } else {
        for (const c of sim.cops.cops) {
          if (c.kind === 'heli' || c.airborne) continue;
          const dx = c.x - it.x, dz = c.z - it.z;
          if (dx * dx + dz * dz < r2 && Math.abs(c.speed) > 3) sim.cops.spinOut(c, G.oil.spinSeconds);
        }
        for (const car of sim.traffic.cars) {
          if (car.state !== 0 || car.oilCd > 0) continue;
          const dx = car.x - it.x, dz = car.z - it.z;
          if (dx * dx + dz * dz < r2 && Math.abs(car.speed) > 3) { car.oilCd = G.oil.spinSeconds + 2; sim.traffic.spinOut(car, G.oil.spinSeconds); }
        }
        // the RV can slip on its own slick (after it has had time to spread)
        const rv = sim.rv;
        if (it.age > 1.2 && !rv.airborne) {
          const dx = rv.x - it.x, dz = rv.z - it.z;
          if (dx * dx + dz * dz < r2) rv.oilT = 0.3;
        }
      }
    }
    this.items = this.items.filter((it) => it.age < it.life && Math.abs(it.z - sim.rv.z) < 600);
  }

  clear() { this.items = []; }

  pushEnts(out) {
    for (const it of this.items) out.push([it.id, it.kid, it.x, it.y, it.z, it.yaw, 0, Math.floor(it.age * 10)]);
  }
}
