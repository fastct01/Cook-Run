// Registry of set-piece plugins: route.json `setpieces[].type` → class (extends SetPiece via ./common.js).
// Agent SETPIECES — one file per type in this folder; docs/NOTES-x-setpieces.md documents each one
// (zone, entities + kinds/variants/states, state() fields, colliders, captions).
// Plugins import { SetPiece } from "./base.js" (through ./common.js) — never from host.js (cycle).
import { FreightWagons } from './freight_wagons.js';
import { MidnightComet } from './midnight_comet.js';
import { Parade } from './parade.js';
import { Drawbridge } from './drawbridge.js';
import { WideLoad } from './wide_load.js';
import { CarCarrier } from './car_carrier.js';
import { TollPlaza } from './toll_plaza.js';
import { InflatableGorilla } from './inflatable_gorilla.js';
import { CarWash } from './car_wash.js';
import { CattleDrive } from './cattle_drive.js';
import { Combine } from './combine.js';
import { LogSpill } from './log_spill.js';
import { Rattlers } from './rattlers.js';
import { Tornado } from './tornado.js';
import { Stagecoach } from './stagecoach.js';
import { PrattJump } from './pratt_jump.js';
import { Handover } from './handover.js';

export const SETPIECE_TYPES = {
  freight_wagons: FreightWagons,
  midnight_comet: MidnightComet,
  parade: Parade,
  drawbridge: Drawbridge,
  wide_load: WideLoad,
  car_carrier: CarCarrier,
  toll_plaza: TollPlaza,
  inflatable_gorilla: InflatableGorilla,
  car_wash: CarWash,
  cattle_drive: CattleDrive,
  combine: Combine,
  log_spill: LogSpill,
  rattlers: Rattlers,
  tornado: Tornado,
  stagecoach: Stagecoach,
  pratt_jump: PrattJump,
  handover: Handover,
};
