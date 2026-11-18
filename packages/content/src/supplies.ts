import type { SuppliesTuning } from './types';

// The supplies' numbers (docs/spec/19-evenings.md, Supplies), written in R3.0 from the spec's starting
// values. Every number tunes here and nowhere else: systems read `content.supplies`, never a literal.

export const SUPPLIES: SuppliesTuning = {
  // From this rank pieces draw on the town's goods; below it every piece is supplied for nothing.
  fromRank: 'village',
  // The settling: the night's candles, and which lanterns get them, are decided at 17:30.
  settleHour: 17,
  settleMinute: 30,
  // Settled lanterns count as lit from 18:00 until 07:00.
  litHour: 18,
  outHour: 7,
  // One lamplighter job for every 40 supplied lanterns, rounded up.
  lanternsPerLamplighter: 40,
  // Ticks the lamplighter stands at each lantern to light it.
  lightTicks: 10,
  // A household's candle lasts five nights, and lights every window until ten.
  candleNights: 5,
  candleUntilHour: 22,
  // A faded or dry piece keeps half its charm.
  restCharmPercent: 50,
  // The lamplighter's walk is reckoned at a road's pace, five ticks a tile; a round too long for the
  // half hour from the settling is pressed into it.
  walkTicks: 5,
  // The fourth gap's words: "6 candles a night", "2 firewood an evening", "4 cloth this season".
  gapWhen: { nightly: 'a night', evening: 'an evening', season: 'this season' },
};
