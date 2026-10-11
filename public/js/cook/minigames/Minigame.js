// Base class for every lab minigame (one per recipe step).
// Pure logic + a Canvas2D draw() — no DOM. Ports to Unity as a plain C# class with
// Update(dt, feel) / OnPointer*(nx, ny) and a separate view that reads its public state.
//
// Coordinates: the minigame lives in a 4:3 "focus area". Pointer input arrives in
// normalised focus coords (nx, ny ∈ 0..1, y down). Sizes are expressed in "height
// units" (1 = focus-area height), so horizontal distances are (nx * ASPECT).
// Objects stand on the bench line at ny = BENCH_Y.

export const ASPECT = 4 / 3;
export const BENCH_Y = 0.8;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth01 = (t) => t * t * (3 - 2 * t);

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Distance between two focus points, in height units (aspect-corrected). */
export function hDist(ax, ay, bx, by) {
  return Math.hypot((ax - bx) * ASPECT, ay - by);
}

export class Minigame {
  /**
   * @param {object} params  the recipe step from lab.json (type, label, + type-specific numbers)
   * @param {object} ctx     { hazards, product, material:{id,name,color}, rand(), emit(type,data),
   *                           startFire(amount), hurt(hp), toast(text,tone),
   *                           levers: { zoneScale, burnerFireMult, spillMult } (difficulty, rules.cook) }
   */
  constructor(params = {}, ctx = {}) {
    this.params = params;
    this.ctx = ctx;
    this.type = params.type || 'step';
    this.label = params.label || '';
    this.hazards = ctx.hazards || {};
    this.rand = ctx.rand || Math.random;
    this.material = ctx.material || { id: 'salts', name: 'Mesa Salts', color: '#e8e1cf' };
    this.t = 0;
    this._progress = 0;
    this._score = 1;
    this._done = false;
    this._failed = false;
    this.failReason = null;
    this.pointer = { x: 0.5, y: 0.5, down: false, inside: false };
    // difficulty levers (rules.cook; Hard = 1): target zones × zoneScale, unwatched burner × burnerFireMult.
    // (spillMult is applied by CookLab to feel.bumpHit before it reaches update()).
    this.levers = ctx.levers || {};
    this.zoneScale = clamp(+(this.levers.zoneScale ?? 1) || 1, 0.3, 2.5);
    this.unwatched = false;          // CookLab sets it: a step running while Doc is away from its station
  }

  // ── read-only state for CookLab / CookUI ──────────────────────────────────
  get progress() { return this._progress; }
  get done() { return this._done; }
  get failed() { return this._failed; }
  get score() { return clamp(this._score, 0, 1); }
  get instructions() { return this.label; }
  /** Fumes this step is adding right now (per second). */
  get fumesPerSec() { return this.params.fumesPerSec || 0; }
  /** CSS cursor hint for the view. */
  get cursor() { return 'default'; }
  /** True while the step itself is feeding a fire (only heat). */
  get overheating() { return false; }

  // ── input (normalised focus coords) ───────────────────────────────────────
  pointerDown(nx, ny) { this.pointer.x = nx; this.pointer.y = ny; this.pointer.down = true; this.pointer.inside = true; }
  pointerMove(nx, ny) { this.pointer.x = nx; this.pointer.y = ny; this.pointer.inside = nx >= -0.05 && nx <= 1.05 && ny >= -0.05 && ny <= 1.05; }
  pointerUp(nx, ny) { if (nx !== undefined) { this.pointer.x = nx; this.pointer.y = ny; } this.pointer.down = false; }
  key(_code) { return false; }

  // ── loop ──────────────────────────────────────────────────────────────────
  update(dt, _feel) { this.t += dt; }
  draw(_g, _w, _h, _theme) {}

  // ── helpers for subclasses ────────────────────────────────────────────────
  _finish() { if (!this._done && !this._failed) { this._done = true; this._progress = 1; this.emit('stepDone', { score: this.score }); } }
  _fail(reason) { if (!this._done && !this._failed) { this._failed = true; this.failReason = reason; this.emit('stepFailed', { reason }); } }
  emit(type, data = {}) { this.ctx.emit?.(type, data); }
  toast(text, tone = 'info') { this.ctx.toast?.(text, tone); }
  bumpThreshold() { return this.hazards.bumpSpillThreshold ?? 0.55; }
}
