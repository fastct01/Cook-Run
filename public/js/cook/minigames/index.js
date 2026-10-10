// Registry of step type → minigame class. Unity port: a factory switch on step.type.
import { GrindGame } from './grind.js';
import { MeasureGame } from './measure.js';
import { HeatGame } from './heat.js';
import { StirGame } from './stir.js';
import { CoolGame } from './cool.js';
import { BreakGame } from './break.js';
import { HammerGame } from './hammer.js';

export const MINIGAMES = Object.freeze({
  grind: GrindGame,
  measure: MeasureGame,
  heat: HeatGame,
  stir: StirGame,
  cool: CoolGame,
  break: BreakGame,
  hammer: HammerGame,
});

/** Relative weight of each step type in the batch quality average (step.weight overrides). */
export const STEP_WEIGHTS = Object.freeze({
  grind: 0.8, measure: 1.0, heat: 1.5, stir: 1.2, cool: 1.2, break: 0.8, hammer: 1.0,
});

export function createMinigame(step, ctx) {
  const Cls = MINIGAMES[step.type];
  if (!Cls) throw new Error(`Unknown lab step type "${step.type}"`);
  return new Cls(step, ctx);
}

export { GrindGame, MeasureGame, HeatGame, StirGame, CoolGame, BreakGame, HammerGame };
