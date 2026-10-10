// Which van station each lab step type is worked at (see VAN_CONTRACT.md).
// Shared by CookLab (presence gating) and the 3D presenters (public/js/van/presenters).
// Unity port: a static readonly Dictionary<string,string> in the CookLab assembly.
export const STEP_STATION = Object.freeze({
  grind: 'grind',
  measure: 'measure',
  heat: 'stove',
  stir: 'stove',
  cool: 'cool',
  break: 'break',
  hammer: 'hammer',
});

/** Station ids that host a step (idle props exist for each). */
export const STEP_STATIONS = Object.freeze([...new Set(Object.values(STEP_STATION))]);

/** Station id for a step type, or null for unknown types. */
export function stationForStep(type) {
  return STEP_STATION[type] ?? null;
}
