// ─────────────────────────────────────────────────────────────────────────────
// ScoringSystem: points/chaos counters, smooth-driving bonus and the EndResult.
//  • score.points: peds (pedPoints), smashed props (obstacle points), cop wrecks
//    (copWreckPoints), plus a smooth-driving bonus: smoothBonusPerSec while the
//    cook is cooking and the ride is calm (|latAcc| < smoothLatAcc, bump below
//    smoothMaxBump, moving faster than smoothMinSpeed).
//  • EndResult.points = score.points + payout/10 + time bonus (timeBonusPerSecUnder
//    per second under parTimeSeconds) + noKnockBonus if nobody was knocked over.
//  • payout = Σ units × perUnitValue × quality × recipe.valueMult (tracked as a
//    running `inv.value` when product is added). Rating 1..3 stars: points ≥
//    rules.scoring.stars[i] for i = 0,1,2 (default [0, 3000, 5000]); 0 when lost.
//  • Round 3: EndResult.points is multiplied by rules.scoring.mult (difficulty: Easy 0.75,
//    Hard 1, Extreme 1.5); EndResult gains difficulty and scoreMult. The rating uses the
//    multiplied points. breakdown.raw keeps the un-multiplied total.
// Unity port: ScoreKeeper.
// ─────────────────────────────────────────────────────────────────────────────
export class ScoringSystem {
  constructor(sim) {
    this.sim = sim;
    this.smoothT = 0;
    this.smoothPts = 0;
    this._acc = 0;
  }

  add(points) { this.sim.score.points += points; }

  update(dt) {
    const sim = this.sim, S = sim.rules.scoring, C = sim.cfg.scoring;
    const lab = sim.lab;
    if (sim.phase !== 'drive' || !lab || !lab.cooking || sim.crew.cookDown) return;
    const f = sim.feel;
    if (Math.abs(f.latAcc) < C.smoothLatAcc && f.bump < C.smoothMaxBump && Math.abs(sim.rv.speed) > C.smoothMinSpeed && !sim.rv.airborne) {
      this.smoothT += dt;
      this._acc += S.smoothBonusPerSec * dt;
      if (this._acc >= 1) { const n = Math.floor(this._acc); this._acc -= n; sim.score.points += n; this.smoothPts += n; }
    }
  }

  buildResult(won, reason) {
    const sim = this.sim, S = sim.rules.scoring, C = sim.cfg.scoring;
    const inv = sim.inv, score = sim.score;
    const timeSec = sim.driveTime;
    const payout = won ? Math.round(inv.value) : 0;
    const timeBonus = won ? Math.max(0, Math.round((S.parTimeSeconds - timeSec) * S.timeBonusPerSecUnder)) : 0;
    const noKnock = won && score.knocked === 0 ? S.noKnockBonus : 0;
    const mult = Number.isFinite(+S.mult) && +S.mult > 0 ? +S.mult : 1;
    const raw = Math.round(score.points + payout / 10 + timeBonus + noKnock);
    const points = Math.round(raw * mult);
    let stars = 0;
    if (won) {
      const th = S.stars || C.ratingPoints || [0, 3000, 5000];
      stars = 1; // any delivery is at least 1 star (th[0])
      if (points >= th[1]) stars = 2;
      if (points >= th[2]) stars = 3;
    }
    return {
      won, reason, units: inv.units, quality: Math.round(inv.quality * 100) / 100, payout, points,
      chaos: score.chaos, knocked: score.knocked, timeSec: Math.round(timeSec * 10) / 10, stars,
      difficulty: sim.difficulty ?? 'hard', scoreMult: mult,
      // extras (not in the base EndResult contract, safe to ignore)
      breakdown: { base: Math.round(score.points), payoutPts: Math.round(payout / 10), timeBonus, noKnockBonus: noKnock, smooth: this.smoothPts, raw, mult },
      smashed: score.smashed, copsWrecked: score.copsWrecked, maxStars: sim.heat.maxStars,
      stopsLooted: sim.stops.lootedCount(), rvHp: Math.round(sim.rv.hp),
      damageTaken: sim.damageTaken ? { rv: Math.round(sim.damageTaken.rv), driver: Math.round(sim.damageTaken.driver), cook: Math.round(sim.damageTaken.cook) } : undefined,
    };
  }
}
