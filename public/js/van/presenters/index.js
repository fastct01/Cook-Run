// ─────────────────────────────────────────────────────────────────────────────
// 3D cook-step presenters + idle station props (Agent VANCOOK). See VAN_CONTRACT.md.
//
//   import { createPresenter, buildIdleProps, STEP_STATION, presenterTypes } from './van/presenters/index.js';
//   const idle = buildIdleProps('stove');                       // THREE.Object3D (or null)
//   const p = createPresenter('heat', { anchor, lab, game: lab.current, step, recipe });
//   p.update(dt, { feel, active }); p.pick(); p.pointerDown(hit); p.pointerMove(hit); p.pointerUp(hit);
//   p.key(code, isDown); p.camera(); p.hint; p.dispose();
// ─────────────────────────────────────────────────────────────────────────────
import { STEP_STATION, STEP_STATIONS, stationForStep } from '../../cook/stations.js';
import { GrindPresenter } from './grind.js';
import { MeasurePresenter } from './measure.js';
import { HeatPresenter } from './heat.js';
import { StirPresenter } from './stir.js';
import { CoolPresenter } from './cool.js';
import { BreakPresenter } from './break.js';
import { HammerPresenter } from './hammer.js';
import { buildIdle } from './idle.js';

export { STEP_STATION, STEP_STATIONS, stationForStep };
export { Presenter } from './Presenter.js';

const CLASSES = Object.freeze({
  grind: GrindPresenter,
  measure: MeasurePresenter,
  heat: HeatPresenter,
  stir: StirPresenter,
  cool: CoolPresenter,
  break: BreakPresenter,
  hammer: HammerPresenter,
});

/** Step types that have a 3D presenter. */
export const presenterTypes = Object.freeze(Object.keys(CLASSES));

/**
 * Create the presenter for a step type (null for unknown types).
 * @param {string} stepType
 * @param {{ anchor: THREE.Object3D, lab?: object, game?: object, step?: object, recipe?: object }} ctx
 */
export function createPresenter(stepType, ctx = {}) {
  const Cls = CLASSES[stepType];
  if (!Cls) return null;
  const game = ctx.game || (ctx.lab?.current?.type === stepType ? ctx.lab.current : null);
  if (!game) { console.warn(`[presenters] no live "${stepType}" minigame to present`); return null; }
  return new Cls({ ...ctx, game });
}

/**
 * Resting props for a station (anchor space), or null for stations without any.
 * opts.lab = lab.json data (optional; for ingredient names/colours on the bottles).
 * The caller owns the returned object; dispose with disposeIdleProps(obj).
 */
export function buildIdleProps(stationId, opts = {}) {
  return buildIdle(stationId, opts) || null;
}

/** Free the geometry a buildIdleProps() result owns (materials/textures are shared caches). */
export function disposeIdleProps(obj) {
  if (!obj) return;
  obj.removeFromParent();
  obj.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.userData.ownGeometry && o.geometry) o.geometry.dispose(); });
}

/** Station ids that have idle props. */
export const idleStations = STEP_STATIONS;

