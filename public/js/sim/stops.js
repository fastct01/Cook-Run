// ─────────────────────────────────────────────────────────────────────────────
// StopSystem: supply stops (route.stops) — the two-player stop flow — + the sell point.
//
// Round 3 (ROUND3_CONTRACT.md §Stop flow): DOC does the shop run in first person; Rook stays
// with the RV (and defends it from the roof — sim/roof.js).
//   parked ─0.6 s→ shopping ──shopEnter──▶ (doc 'out') ──shopDone / shopAbort / 90 s──▶
//   returning (doc 'back', 2 s) → loading → done
//    • parked:    RV inside the lot rectangle (track.stopLot) at |speed| < maxLoadSpeed
//                 → 'stopParked' {id} + the police response (cops.dispatchToStop: rules.stops.
//                 response — heat to ≥ 1★, N cars after `delay` s, EV.STOP_COPS + toast).
//                 Driving off (out of the lot / faster) cancels.
//    • shopping, doc 'in': the RV is NOT held — the driver may still drive off; leaving the lot
//                 cancels the stop (unlooted, can be retried). The 90 s limit already counts.
//    • shopEnter (CMD from the cook through sim.applyCookCommand; DCMD 'shopEnter' for solo):
//                 doc 'out', EV.DOC_OUT {stopId, out: true}; holdsRv() until loading (Doc must
//                 get back in). shopDone also counts as shopEnter if it was never sent.
//                 The shop runs on Doc's computer and reports CMD shopDone {stopId, score} or
//                 shopAbort {stopId} (DCMD shopDone/shopAbort stay for solo + bots); after
//                 rules.stops.shopMaxSeconds (90) it times out as an abort.
//                 → 'shopResult' {id, score, ok}
//    • returning: rules.stops.returnSeconds (2) — Doc runs back (RV held; skipped if Doc never
//                 got out), then EV.DOC_OUT {out: false}.
//    • loading:   def.loadTime s at |speed| < maxLoadSpeed; pauses while an active cop
//                 (state 1: soaked/stalled/blind/wrecked cops don't count) is within
//                 rules.stops.copBlockRadius. Leaving the lot abandons the stop unlooted.
//                 After an abort there is no loading: straight to done (unlooted).
//    • done:      supplies added (score ≥ rules.stops.bonusScore → +1 of the first item),
//                 'stopDone' {id, gives}, def.alarm → heat (Last Chance Gas). 1.5 s later
//                 the stop state clears. Each stop can be visited once.
//   The bust rule (heat.js) still applies while parked: the roof defence matters.
//  • nearStop: the next stop ahead that is neither looted nor closed, within
//    rules.stops.bannerDist (800 m) → { id, name, dist, side, z, shopType }.
//  • Sell point: RV within sellPoint.radius of the drive-in and slow → end (GameSim).
// Unity port: SupplyStop (trigger volume MonoBehaviour + state machine) + SellPoint.
// ─────────────────────────────────────────────────────────────────────────────
import { clamp } from './util.js';


export class StopSystem {
  constructor(sim) {
    this.sim = sim;
    this.stops = sim.route.stops.map((s) => ({
      def: s, lot: sim.track.stopLot(s), looted: false, closed: false, inside: false, blocked: false,
      shopType: s.shop ? (s.shop.variant ? `${s.shop.type}` : s.shop.type) : 'collect',
    }));
    this.active = null;   // { st, state, t, shopT, loadT, score, ok, blocked, copDist, bonus }
    this.current = null;  // kept for back-compat: the stop whose state machine is running
    this.sell = sim.track.sellPointPos();
    this.log = [];        // [{ id, ok, score, looted, shopT }] (tests)
  }

  get S() { return this.sim.rules.stops || {}; }

  lotAt(x, z) {
    for (const s of this.stops) {
      const L = s.lot;
      if (Math.abs(z - L.cz) <= L.halfLen && Math.abs(x - L.cx) <= L.halfDepth) return s;
    }
    return null;
  }
  // a little slack so wobbling on the lot edge doesn't abandon a stop
  _inLot(st, x, z, pad = 2) {
    const L = st.lot;
    return Math.abs(z - L.cz) <= L.halfLen + pad && Math.abs(x - L.cx) <= L.halfDepth + pad;
  }

  lootedCount() { return this.stops.filter((s) => s.looted).length; }
  // the RV is held while Doc is out of it (shopping after shopEnter, running back)
  holdsRv() {
    const a = this.active;
    if (!a) return false;
    return (a.state === 'shopping' && a.doc === 'out') || (a.state === 'returning' && a.doc === 'back');
  }
  state() { return this.active ? this.active.state : null; }

  _copNear(R) {
    const sim = this.sim, rv = sim.rv;
    let best = Infinity, blocked = false;
    for (const c of sim.cops.cops) {
      if (c.kind === 'heli' || c.dead) continue;
      const dx = c.x - rv.x, dz = c.z - rv.z, d = Math.sqrt(dx * dx + dz * dz);
      if (c.state !== 1) continue;                  // only un-disabled, chasing cops count
      if (d < best) best = d;
      if (d < R) blocked = true;
    }
    return { blocked, dist: Number.isFinite(best) ? best : 999 };
  }

  update(dt) {
    const sim = this.sim, rv = sim.rv, C = sim.cfg.stops, S = this.S;
    const lot = rv.airborne ? null : this.lotAt(rv.x, rv.z);
    for (const st of this.stops) {
      const inside = st === lot;
      if (inside && !st.inside && !st.looted && !st.closed) sim.emit({ type: 'stopEnter', id: st.def.id, name: st.def.name });
      st.inside = inside;
    }
    if (sim.phase !== 'drive') return;
    const speed = Math.abs(rv.speed);
    let a = this.active;
    if (!a) {
      if (lot && !lot.looted && !lot.closed && speed < C.maxLoadSpeed) {
        a = this.active = { st: lot, state: 'parked', t: 0, shopT: 0, loadT: 0, score: 0, ok: false, blocked: false, copDist: 999, bonus: false, doc: 'in' };
        this.current = lot;
        sim.emit({ type: 'stopParked', id: lot.def.id, name: lot.def.name, shopType: lot.shopType });
        // someone calls it in: a police response heads for the stop
        try { sim.cops.dispatchToStop(lot.def.id); } catch (e) { console.error('[sim] stop response failed:', e); }
      } else { this.current = null; return; }
    }
    const st = a.st;
    a.t += dt;
    const near = this._copNear(S.copBlockRadius ?? C.blockRadius ?? 25);
    a.copDist = near.dist;
    switch (a.state) {
      case 'parked':
        if (!this._inLot(st, rv.x, rv.z, 0.5) || speed > C.maxLoadSpeed + 0.5) { this._cancel(); return; }
        if (a.t >= (S.parkSeconds ?? 0.6)) {
          a.state = 'shopping'; a.t = 0;
          sim.emit({ type: 'msg', text: `Shop run at ${st.def.name} — Doc, out the side door!`, tone: 'info' });
        }
        break;
      case 'shopping':
        // Doc still inside: the RV isn't held — driving out of the lot calls the stop off (retryable)
        if (a.doc === 'in' && !this._inLot(st, rv.x, rv.z, 2)) {
          sim.emit({ type: 'msg', text: `Drove off before Doc got out — no supplies from ${st.def.name}.`, tone: 'bad' });
          this._cancel();
          return;
        }
        a.shopT += dt;
        if (a.shopT >= (S.shopMaxSeconds ?? 90)) { this._result(false, 0, 'timeout'); }
        break;
      case 'returning':
        // Doc runs back (2 s); if he never got out there's nothing to wait for
        if (a.doc !== 'back' || a.t >= (S.returnSeconds ?? 2)) {
          if (a.doc === 'back') { a.doc = 'in'; sim.emit({ type: 'docOut', stopId: st.def.id, out: false }); }
          if (a.ok) { a.state = 'loading'; a.t = 0; }
          else this._finish(false);
        }
        break;
      case 'loading':
        if (!this._inLot(st, rv.x, rv.z, 2)) {
          st.closed = true;
          this.log.push({ id: st.def.id, ok: a.ok, score: a.score, looted: false, shopT: a.shopT, abandoned: true });
          sim.emit({ type: 'msg', text: `You drove off without the supplies from ${st.def.name}!`, tone: 'bad' });
          this.active = null; this.current = null;
          return;
        }
        a.blocked = near.blocked;
        st.blocked = near.blocked;
        if (!near.blocked && speed < C.maxLoadSpeed) {
          a.loadT = Math.min(st.def.loadTime, a.loadT + dt);
          if (a.loadT >= st.def.loadTime) this._finish(true);
        }
        break;
      case 'done':
        if (a.t >= 1.5 || !this._inLot(st, rv.x, rv.z, 6)) { this.active = null; this.current = null; }
        break;
    }
  }

  _cancel() {
    const a = this.active;
    if (a) { try { this.sim.cops.cancelResponse(a.st.def.id); } catch (e) { /* ignore */ } }
    this.active = null; this.current = null;
  }

  // shop finished (DCMD shopDone / shopAbort / timeout)
  _result(ok, score, why = '') {
    const a = this.active, sim = this.sim;
    if (!a) return false;
    a.ok = ok; a.score = ok ? clamp(+score || 0, 0, 1) : 0;
    a.state = 'returning'; a.t = 0;
    if (a.doc === 'out') a.doc = 'back';
    sim.emit({ type: 'shopResult', id: a.st.def.id, score: a.score, ok, reason: why || undefined });
    if (!ok) sim.emit({ type: 'msg', text: a.doc !== 'back' ? 'Doc never made it out — no supplies.' : why === 'timeout' ? 'Doc took too long and comes back empty-handed.' : 'Doc comes back empty-handed.', tone: 'bad' });
    return true;
  }

  // Doc jumped out of the side door (CMD.shopEnter from the cook; DCMD 'shopEnter' in solo)
  shopEnter(stopId) {
    const a = this.active, sim = this.sim;
    if (!a || (a.state !== 'shopping' && a.state !== 'parked')) return false;
    if (stopId != null && stopId !== a.st.def.id) return false;
    if (a.doc !== 'in') return true;   // already out
    if (a.state === 'parked') { a.state = 'shopping'; a.t = 0; }
    a.doc = 'out';
    sim.emit({ type: 'docOut', stopId: a.st.def.id, out: true });
    return true;
  }

  shopDone(stopId, score) {
    const a = this.active;
    if (!a || (a.state !== 'shopping' && a.state !== 'parked')) return false;
    if (stopId != null && stopId !== a.st.def.id) return false;
    if (a.doc === 'in') this.shopEnter(stopId);   // shopDone implies shopEnter
    return this._result(true, score);
  }

  shopAbort(stopId) {
    const a = this.active;
    if (!a || (a.state !== 'shopping' && a.state !== 'parked')) return false;
    if (stopId != null && stopId !== a.st.def.id) return false;
    return this._result(false, 0, 'abort');
  }

  _finish(ok) {
    const a = this.active, sim = this.sim, st = a.st, S = this.S;
    a.state = 'done'; a.t = 0;
    if (!ok) {
      st.closed = true;
      this.log.push({ id: st.def.id, ok: false, score: a.score, looted: false, shopT: a.shopT });
      return;
    }
    st.looted = true;
    const inv = sim.inv;
    const gives = { ...st.def.gives };
    const first = Object.keys(gives)[0];
    if (first && a.score >= (S.bonusScore ?? 0.8)) { gives[first] += 1; a.bonus = true; }
    for (const [k, n] of Object.entries(gives)) inv.mat[k] = (inv.mat[k] || 0) + n;
    this.log.push({ id: st.def.id, ok: true, score: a.score, looted: true, shopT: a.shopT, bonus: a.bonus });
    sim.emit({ type: 'stopDone', id: st.def.id, gives, bonus: a.bonus });
    const lab = sim.data.lab;
    const names = Object.entries(gives).map(([k, n]) => `${n}× ${lab.ingredients[k]?.name ?? k}`).join(', ');
    sim.emit({ type: 'msg', text: `Loaded up: ${names}${a.bonus ? ' (bonus!)' : ''}`, tone: 'good' });
    if (st.def.alarm > 0 && !sim.heat.gaveUp) {
      sim.heat.add(st.def.alarm);
      sim.cops.spawnT = Math.min(sim.cops.spawnT, sim.cfg.cops.alarmSpawnDelay ?? 2);
      sim.emit({ type: 'msg', text: 'The silent alarm went off — cops incoming!', tone: 'bad' });
    }
  }

  stopInfo() {
    const a = this.active;
    if (!a) return null;
    const st = a.st, def = st.def, sim = this.sim;
    const ds = sim.labLink?.shop;
    const docShop = ds && (a.state === 'shopping' || a.state === 'parked') && (ds.stopId == null || ds.stopId === def.id) ? { ...ds } : null;
    return {
      id: def.id, name: def.name, shopType: st.shopType, state: a.state,
      shopT: a.shopT, shopMax: this.S.shopMaxSeconds ?? 90, loadT: a.loadT, loadTime: def.loadTime,
      progress: def.loadTime > 0 ? a.loadT / def.loadTime : 1, blocked: a.state === 'loading' && a.blocked,
      copDist: Math.min(999, a.copDist), score: a.score, ok: a.ok, bonus: a.bonus, side: def.side,
      doc: a.doc, docShop, held: this.holdsRv(),
      roof: sim._roofState(),
    };
  }

  nearStop() {
    const rv = this.sim.rv, R = this.S.bannerDist ?? this.sim.cfg.stops.nearRange ?? 800;
    let best = null;
    for (const st of this.stops) {
      if (st.looted || st.closed) continue;
      const d = st.def.z - rv.z;
      if (d < -st.def.lotLength / 2 || d > R) continue;
      if (!best || d < best.dist) best = { id: st.def.id, name: st.def.name, dist: d, side: st.def.side, z: st.def.z, shopType: st.shopType };
    }
    return best;
  }

  isNearSell(x, z, extra = 0) {
    const r = this.sim.route.sellPoint.radius + extra;
    const dx = x - this.sell.x, dz = z - this.sell.z;
    return dx * dx + dz * dz <= r * r;
  }
}
