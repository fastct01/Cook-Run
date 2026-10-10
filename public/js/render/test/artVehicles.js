// Test-only shim: ART's real vehicle builders (assets/models/vehicles.js) + fallbacks for
// every other kind, so the real vehicle models can be checked before assets/index.js exists.
// view-test.html?assets=./test/artVehicles.js
import { VEHICLE_BUILDERS } from '../../assets/models/vehicles.js';
import { createFallbackModel } from '../fallbackModels.js';
export function createModel(kind, variant = 0) {
  const b = VEHICLE_BUILDERS[kind];
  if (b) return b.build(variant % (b.variants || 1));
  return createFallbackModel(kind, variant);
}
