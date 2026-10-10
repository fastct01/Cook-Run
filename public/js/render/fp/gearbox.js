// ─────────────────────────────────────────────────────────────────────────────
// Gearbox — a simulated 3-speed automatic behind a carbureted big-block V8.
// Client-only (cosmetic): drives the cab's rpm needle AND the engine sound, so
// both use the same numbers. Pure logic, no three.js / WebAudio.
//
//   const gb = new Gearbox({ topSpeed: rules.rv.topSpeed, accel: rules.rv.accel });
//   gb.update(dt, { speed, throttle?, airborne, nitro, engine: 'off'|'cranking'|'on', braking })
//   gb.rpm (0..6000) · gb.gear (-1 R, 0 N, 1..3) · gb.throttle 0..1 · gb.shifted (±1 on the frame
//   of a shift, else 0) · gb.load 0..1 (how hard the engine works; for the intake roar / whine)
// If `throttle` is omitted it is estimated from the speed trace (cook side has no input).
// Unity port: a small MonoBehaviour with the same fields.
// ─────────────────────────────────────────────────────────────────────────────
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export const IDLE_RPM = 650;
export const REDLINE = 5200;
const RATIO = [0, 430, 252, 150];             // rpm per (m/s) in gears 1..3 (final drive folded in)
const STALL = 1950;                            // torque-converter stall speed

export class Gearbox {
  constructor({ topSpeed = 30, accel = 7.5 } = {}) {
    this.topSpeed = topSpeed;
    this.accelMax = accel;
    this.reset();
  }

  reset() {
    this.rpm = 0;
    this.gear = 1;
    this.throttle = 0;
    this.load = 0;
    this.shifted = 0;
    this.shiftT = 9;          // seconds since the last shift
    this.prevSpeed = null;
    this.accel = 0;
    this.t = 0;
    this.running = true;
  }

  /** Upshift speeds (m/s) for the current throttle: light throttle shifts early, full throttle holds the gear. */
  upAt(g, thr) { return g === 1 ? lerp(5.2, 10.2, thr) : lerp(11.5, 19.5, thr); }

  update(dt, { speed = 0, throttle = null, airborne = false, nitro = false, engine = 'on', braking = false } = {}) {
    if (!(dt > 0)) return this;
    this.t += dt;
    this.shifted = 0;
    this.shiftT += dt;
    // acceleration estimate (smoothed)
    if (this.prevSpeed == null) this.prevSpeed = speed;
    const a = (speed - this.prevSpeed) / dt;
    this.prevSpeed = speed;
    this.accel += (clamp(a, -30, 30) - this.accel) * (1 - Math.exp(-dt * 6));
    const sp = Math.abs(speed);

    // throttle: given (driver input) or estimated (holding top speed needs full throttle; lifting = decel)
    let thr;
    if (throttle != null) thr = clamp(throttle, 0, 1);
    else {
      thr = clamp(this.accel / (this.accelMax * 0.8) + (sp / this.topSpeed) * 0.75, 0, 1);
      if (this.accel < -1.6 || braking) thr = 0;
      if (sp < 0.4 && Math.abs(this.accel) < 0.3) thr = 0;
    }
    if (nitro) thr = 1;
    this.throttle += (thr - this.throttle) * (1 - Math.exp(-dt * (thr > this.throttle ? 10 : 6)));
    const T = this.throttle;

    // engine state
    if (engine === 'off') { this.running = false; this.rpm += (0 - this.rpm) * (1 - Math.exp(-dt * 2.5)); this.load = 0; return this; }
    if (engine === 'cranking') {
      this.running = false;
      const crank = 190 + 55 * Math.sin(this.t * Math.PI * 2 * 4.6);
      this.rpm += (crank - this.rpm) * (1 - Math.exp(-dt * 12));
      this.load = 0.2;
      return this;
    }
    this.running = true;

    // gear selection (with hysteresis + kickdown)
    if (speed < -0.4) this.gear = -1;
    else if (this.gear === -1 && speed > -0.1) this.gear = 1;
    if (this.gear >= 1 && !airborne) {
      const g = this.gear;
      if (g < 3 && sp > this.upAt(g, T)) this._shift(g + 1);
      else if (g > 1) {
        const down = this.upAt(g - 1, T) * (T > 0.92 ? 0.82 : 0.55);   // kickdown when flooring it
        if (sp < down && this.shiftT > 0.6) this._shift(g - 1);
      }
    }

    // target rpm
    let target;
    if (airborne) target = IDLE_RPM + T * 4300;                                   // wheels free: it just revs
    else if (this.gear === -1) target = IDLE_RPM + sp * 380 + T * 300;
    else {
      const coupled = sp * RATIO[this.gear];
      const slip = T * (STALL - IDLE_RPM) * Math.exp(-sp / 4.5);                 // torque converter flare
      target = Math.max(IDLE_RPM + slip, coupled + T * 260);
    }
    target += Math.sin(this.t * 8.2) * 18 + Math.sin(this.t * 2.9) * 12;          // lumpy cam at idle
    target = clamp(target, 0, nitro ? 5900 : REDLINE + 300);
    const k = this.shiftT < 0.25 ? 16 : target > this.rpm ? 5 + T * 4 : 4;
    this.rpm += (target - this.rpm) * (1 - Math.exp(-dt * k));
    this.load = clamp(T * (0.45 + 0.55 * clamp(this.rpm / 4500, 0, 1)), 0, 1);
    return this;
  }

  _shift(g) {
    this.shifted = Math.sign(g - this.gear);
    this.gear = g;
    this.shiftT = 0;
  }

  get state() { return { rpm: this.rpm, gear: this.gear, throttle: this.throttle, load: this.load, shifted: this.shifted, running: this.running }; }
}
