import { firstWinter } from './seasons';
import type { CharterDef } from './types';

// Charters (docs/spec/15-progression.md, Ranks and Charters). The Village Charter ships in I2; the
// winter trial joins it in I3. C4D runs the board and the claim.

export const villageCharter: CharterDef = {
  id: 'village',
  rank: 'village',
  from: 'hamlet',
  goals: [
    { id: 'residents', text: '30 residents', lane: 'shared', measure: { what: 'residents' }, target: 30 },
    {
      id: 'patterns',
      text: '3 patterns discovered',
      lane: 'hearth',
      measure: { what: 'patternsDiscovered' },
      target: 3,
    },
    { id: 'wishes', text: '5 wishes granted', lane: 'hearth', measure: { what: 'wishesGranted' }, target: 5 },
    { id: 'food', text: '5 days of food in stock', lane: 'ledger', measure: { what: 'foodDays' }, target: 5 },
    {
      id: 'surplus',
      text: 'A season ended in surplus',
      lane: 'ledger',
      measure: { what: 'seasonsInSurplus' },
      target: 1,
    },
  ],
  // R1: Homes, Workshops and Farmland are zoned from founding, so the Village opens the Shops and
  // Townhouses zones (ZoneDef.requires), and the carrier's default rule for Wares and Treats turns
  // to Always (docs/spec/15-progression.md, From the redesign). The Sawmill and the Brickworks are
  // Village buildings too, but their innovations open them (Water Wheel, Brick Kiln): an id listed
  // here goes into hearth.unlocked, which would let them skip it.
  unlocks: [
    'shops-zone',
    'townhouses-zone',
    'market-prices',
    'craftsfolk',
    'market-square',
    'trading-post',
    'carrier-wares-treats',
    'school',
    'tavern',
    'herbalist',
    'carts',
    'street',
    'loans',
  ],
  proclamation: 'By order of the County, {town} is a village. Somebody fetch the bunting.',
  // C5.0: the first winter after the claim seals it (C5A runs the trial; the rank is granted at the
  // claim as in I2).
  trial: firstWinter,
};
