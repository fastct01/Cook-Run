// ─────────────────────────────────────────────────────────────────────────────
// LabLink: the host side of the mobile lab.
//  • setLabState(lab): stores the cook's LabState (6 Hz) — echoed in snapshot.lab.
//  • Cook damage: LabState.cookHurt (hp lost since the last LabState — CookLab
//    computes fume/fire damage to Doc itself) is subtracted from crew.cook.
//    Host-side fume/fire damage to the cook is only used for a lab client that
//    never reports cookHurt (or with rules.sim.lab.hostCookDamage = true).
//  • Hazards each step (lab.json hazards):
//      fumes > fumesHurtAbove → driver −fumesDriverDamagePerSec (the fumes reach the cab)
//      fire > 0               → rv hp −fireRvDamagePerSec·fire
//      ventOpen && cooking    → heat + rules.heat.sources.ventSmokePerSec (visible smoke; fallback
//                               lab.hazards.ventSmokeHeatPerSec). Not "witnessed" by default: it doesn't
//                               stop heat decaying, so it mostly hurts while cops can see you.
//      cop within spottedRange && cooking && !curtains → heat + spottedHeat (cooldown) + 'spotted'
//      (LabState.curtains === true means the curtains are CLOSED)
//  • Commands (CMD): startRecipe (check+deduct inv.mat → recipeOk/recipeDenied),
//    recipeDone (product / gadget / repair; only for an accepted reqId, once),
//    recipeFail, explosion (rv + cook damage, heat), callout ("Doc: …" msg).
//  • Cook at 0 hp → crew.cookDown = true: cook commands are ignored (startRecipe
//    gets recipeDenied 'Doc is out cold') — not game over; after cookReviveSeconds
//    (12 s, matches CookLab) Doc is back with cookReviveHp (25).
// Unity port: LabLink (MonoBehaviour on the RV) receiving CookCommand structs.
// ─────────────────────────────────────────────────────────────────────────────
import { clamp } from './util.js';

export class LabLink {
  constructor(sim) {
    this.sim = sim;
    this.H = sim.data.lab.hazards;
    this.recipes = Object.fromEntries(sim.data.lab.recipes.map((r) => [r.id, r]));
    this.pending = new Map();   // reqId → recipeId (accepted, not finished yet)
    this.spottedCd = 0;
    this.downT = 0;
    this.batches = 0;
    this.unitsCooked = 0;
    this.labReportsHurt = false; // true once a LabState carried a numeric cookHurt
  }

  setLabState(l) {
    if (!l || typeof l !== 'object') return;
    const sim = this.sim;
    sim.lab = {
      cooking: !!l.cooking, recipeId: l.recipeId ?? null, step: l.step | 0, stepType: l.stepType ?? null,
      temp: +l.temp || 0, fumes: clamp(+l.fumes || 0, 0, 1), fire: clamp(+l.fire || 0, 0, 1),
      ventOpen: !!l.ventOpen, curtains: !!l.curtains, cookHurt: +l.cookHurt || 0,
    };
    if (typeof l.cookHurt === 'number') this.labReportsHurt = true;
    if (sim.lab.cookHurt > 0 && sim.phase === 'drive') this.hurtCook(sim.lab.cookHurt);
  }

  update(dt) {
    const sim = this.sim, H = this.H, L = sim.lab, crew = sim.crew, C = sim.cfg.lab;
    if (this.spottedCd > 0) this.spottedCd -= dt;
    // cook knocked out → comes round later
    if (crew.cookDown) {
      this.downT -= dt;
      if (this.downT <= 0 && sim.phase === 'drive') {
        crew.cookDown = false; crew.cook = C.cookReviveHp;
        sim.emit({ type: 'msg', text: 'Doc is back on his feet.', tone: 'info' });
      }
    }
    // nearest cop (alert)
    const rv = sim.rv;
    let best = Infinity;
    for (const c of sim.cops.cops) {
      if (c.state === 4 || c.state === 5) continue;
      const dx = c.x - rv.x, dz = c.z - rv.z, dy = c.kind === 'heli' ? (c.y - rv.y) : 0;
      const d = Math.sqrt(dx * dx + dz * dz + dy * dy);
      if (d < best) best = d;
    }
    sim.alert.copDist = Number.isFinite(best) ? best : 999;
    sim.alert.copClose = best < C.copCloseRange;
    if (sim.phase !== 'drive' || !L) return;
    // hazards
    const hostCook = C.hostCookDamage || !this.labReportsHurt;
    if (L.fumes > H.fumesHurtAbove) {
      if (hostCook) this.hurtCook(H.fumesCookDamagePerSec * dt);
      sim.hurtDriver(H.fumesDriverDamagePerSec * dt);
    }
    if (L.fire > 0) {
      sim.damageRv(H.fireRvDamagePerSec * L.fire * dt, 'fire', true);
      if (hostCook) this.hurtCook(H.fireCookDamagePerSec * L.fire * dt);
    }
    if (L.ventOpen && L.cooking) {
      const rate = sim.rules.heat.sources.ventSmokePerSec ?? H.ventSmokeHeatPerSec;
      sim.heat.add(rate * dt, !!C.ventSmokeWitnessed);
    }
    if (L.cooking && !L.curtains && best < C.spottedRange && this.spottedCd <= 0 && !sim.heat.gaveUp) {
      this.spottedCd = C.spottedCooldown;
      sim.heat.add(H.spottedHeat);
      sim.emit({ type: 'spotted' });
      sim.emit({ type: 'msg', text: 'A cop saw the lab! Close the curtains!', tone: 'bad' });
    }
  }

  hurtCook(v) {
    const sim = this.sim, crew = sim.crew;
    if (crew.cookDown || !(v > 0)) return;
    crew.cook = Math.max(0, crew.cook - v);
    if (crew.cook <= 0) {
      crew.cookDown = true;
      this.downT = sim.cfg.lab.cookReviveSeconds;
      sim.emit({ type: 'msg', text: 'Doc is down! The lab is out of action.', tone: 'bad' });
    }
  }

  apply(cmd) {
    const sim = this.sim;
    if (!cmd || typeof cmd !== 'object') return;
    if (sim.phase === 'won' || sim.phase === 'lost') return;
    const inv = sim.inv;
    if (sim.crew.cookDown) {
      // Doc is out cold: the lab can't act. Answer a recipe request so the cook UI doesn't hang.
      if (cmd.type === 'startRecipe') sim.emit({ type: 'recipeDenied', reqId: cmd.reqId, recipeId: cmd.recipeId, reason: 'Doc is out cold' });
      return;
    }
    switch (cmd.type) {
      case 'startRecipe': {
        const r = this.recipes[cmd.recipeId];
        const deny = (reason) => sim.emit({ type: 'recipeDenied', reqId: cmd.reqId, recipeId: cmd.recipeId, reason });
        if (!r) return deny('Unknown recipe');
        for (const [k, n] of Object.entries(r.needs || {})) {
          if ((inv.mat[k] || 0) < n) return deny(`Missing ${sim.data.lab.ingredients[k]?.name ?? k}`);
        }
        for (const [k, n] of Object.entries(r.needs || {})) inv.mat[k] -= n;
        this.pending.set(cmd.reqId, r.id);
        sim.emit({ type: 'recipeOk', reqId: cmd.reqId, recipeId: r.id });
        break;
      }
      case 'recipeDone': {
        // only an accepted request pays out, and only once (duplicates / never-approved reqIds are ignored)
        if (cmd.reqId != null && !this.pending.has(cmd.reqId)) return;
        const id = this.pending.get(cmd.reqId) ?? cmd.recipeId;
        const r = this.recipes[id];
        if (!r) return;
        this.pending.delete(cmd.reqId);
        const q = clamp(+cmd.quality || 0, 0, 1);
        const pct = Math.round(q * 100);
        if (r.kind === 'product') {
          const units = r.units || 0;
          const prev = inv.units;
          inv.quality = prev + units > 0 ? (inv.quality * prev + q * units) / (prev + units) : q;
          inv.units += units;
          inv.value += units * sim.rules.scoring.perUnitValue * q * (r.valueMult ?? 1);
          this.batches++; this.unitsCooked += units;
          sim.emit({ type: 'msg', text: `Doc finished a ${r.name} — ${pct}%! (+${units} ${sim.data.lab.product.unitName}s)`, tone: 'good' });
        } else if (r.kind === 'gadget') {
          inv.gadgets[r.gadget] = (inv.gadgets[r.gadget] || 0) + 1;
          sim.emit({ type: 'msg', text: `Doc made a ${r.name}! (${r.gadget === 'nitro' ? 'Shift' : r.gadget === 'smoke' ? 'Q' : 'E'})`, tone: 'good' });
        } else if (r.kind === 'repair') {
          const rep = r.repair || {};
          const k = 0.5 + 0.5 * q;
          if (rep.rv) sim.rv.hp = Math.min(sim.rules.rv.maxHp, sim.rv.hp + rep.rv * k);
          if (rep.crew) {
            const max = sim.rules.rv.crewMaxHp;
            sim.crew.driver = Math.min(max, sim.crew.driver + rep.crew * k);
            if (!sim.crew.cookDown) sim.crew.cook = Math.min(max, sim.crew.cook + rep.crew * k);
          }
          sim.emit({ type: 'msg', text: `Doc: ${r.name} done (${pct}%).`, tone: 'good' });
        }
        break;
      }
      case 'recipeFail': {
        const id = this.pending.get(cmd.reqId) ?? cmd.recipeId;
        this.pending.delete(cmd.reqId);
        const r = this.recipes[id];
        sim.emit({ type: 'msg', text: `Doc ruined the ${r ? r.name : 'batch'}${cmd.reason ? ` (${cmd.reason})` : ''}.`, tone: 'bad' });
        break;
      }
      case 'explosion': {
        const p = clamp(+cmd.power || 0.5, 0, 1);
        const E = this.H.explosion;
        sim.damageRv(E.rvDamage * p, 'explosion', true);
        this.hurtCook(E.cookDamage * p);
        sim.heat.add((E.heat ?? sim.rules.heat.sources.explosion) * p);
        sim.addBump(0.6 + 0.4 * p);
        sim.emit({ type: 'crash', x: sim.rv.x, z: sim.rv.z, power: p });
        sim.emit({ type: 'msg', text: 'BOOM! The lab exploded!', tone: 'bad' });
        break;
      }
      case 'callout': {
        const text = String(cmd.text ?? '').slice(0, 80);
        if (text) sim.emit({ type: 'msg', text: `Doc: ${text}`, tone: 'info' });
        break;
      }
    }
  }
}
