// `npm run outcomes -w @qoti/bench [seeds...] [--strict]` (R2E): measures what R2 promises
// (docs/spec/19-evenings.md, Acceptance; docs/build/cycle-r2e-bench.md, task 4) and prints one table:
// outcome, seed, measured, target, PASS or MISS, and which cycle's code the number depends on.
//
//   1. Out on a fair evening: every grown-up with a place in reach goes out; places fill to their
//      room and no further.
//   2. No places, nobody out: with the Hearth off from day 1, nobody goes out on an evening with no
//      place, and Craftsfolk never come where no place ever stood in reach.
//   3. Treats on the round: with three places standing, four fifths of Treats sell on the round.
//   4. The first Craftsfolk by day 40.
//   5. Gaps: each R2 kind opens, closes and credits a seat.
//   6. A cart routes round an evening street (or waits at its edge and delivers after 21:00).
//
// Exits 0, or 1 with --strict (or OUTCOMES_STRICT=1) when any row MISSes. OUTCOMES_DAYS (default 70)
// shortens the autoplay runs. Every measuring function is pure over recorded data, so the unit test
// feeds it hand-made samples; the runner records them from a live autoplay (never assuming the
// stand-ins: a town where nobody goes out simply measures 0).
import { content } from '@qoti/content';
import {
  callingsCount,
  doorTile,
  isMaster,
  loansOwed,
  mastersCount,
  mastersMade,
  creditLimit,
  pagesFound,
  PENNIES_PER_COIN,
  placesNear,
  placesView,
  RANKS,
  seasonAt,
  START_HOUR,
  suppliesView,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  townStock,
  type HealthIssue,
  type WorldState,
} from '@qoti/sim';
import { findById } from '../../../packages/sim/src/state/entities';
import { MASTER_GOOD_IDS } from '../../../packages/sim/src/state/masters';
import { tallyDecisions } from './decisions';
import { DEFAULT_SEEDS } from './audit';
import { autoplay, type AutoplayOptions, type AutoplayResult, type DayLine } from './autoplay';
import { runCartScene, type CartRun } from './cartScene';
import { NO_ROWS, rowsOf, type RowsMeasure } from './rows';

export type Verdict = 'PASS' | 'MISS' | 'N/A';

export interface OutcomeRow {
  outcome: string;
  seed: string;
  measured: string;
  target: string;
  verdict: Verdict;
  /** The cycle whose code the number depends on. */
  needs: string;
}

// --- Recorded data -------------------------------------------------------------------------------

/** One evening, read after 21:00. */
export interface EveningSample {
  day: number;
  weather: 'fair' | 'rain' | 'storm';
  /** Grown-ups (young and adult) with a place within their leisure radius of their home door. */
  eligible: number;
  /** Of them, with an arrived stop at a place. */
  out: number;
  /** Grown-ups with an arrived stop at a place, in reach or not. */
  outAny: number;
  /** Places standing. */
  places: number;
  treatsAtStops: number;
  treatsPassing: number;
  treatsDoorstep: number;
}

/** One place read in an evening hour (17:00 to 21:00). */
export interface RoomSample {
  day: number;
  hour: number;
  place: string;
  present: number;
  /** Seats plus standing room. */
  room: number;
}

/** Households at the end of a day. */
export interface DaySample {
  day: number;
  crafts: number;
  households: number;
}

/** A gap as seen over a run (opened once, closed once). */
export interface SeenGap {
  id: number;
  kind: string;
  subject: string;
  closed: boolean;
  closers: number[];
  openedDay: number;
}

export interface RunRecord {
  seed: string;
  days: number;
  evenings: EveningSample[];
  rooms: RoomSample[];
  daySamples: DaySample[];
  gaps: SeenGap[];
  /** The street lots at the end of the run (R2F's rows and gardens). */
  rows: RowsMeasure;
  /** R3E: what R3's rows and the report read (supplies, masters, the Town Book, the books). */
  r3: R3Record;
}

/** R3E: one night's supplies, read at 18:00 or later (after the 17:30 settling). */
export interface NightSample {
  day: number;
  /** 0 spring to 3 winter. */
  season: number;
  rank: string;
  /** Lanterns standing (decor with a nightly supply). */
  standing: number;
  /** Lanterns lit tonight (`suppliesView(w).lamps`). */
  lit: number;
  /** Supplied pieces resting tonight. */
  resting: number;
  /** Units places drew the night just settled, by good. */
  drawn: { candles: number; firewood: number; cloth: number };
}

/** R3E: one day's books, read at 23:00. */
export interface R3DaySample {
  day: number;
  residents: number;
  households: number;
  /** Households past Settlers. */
  crafts: number;
  leanTimes: boolean;
  masters: number;
  /** Masters by trade (or specialized building def), sorted by trade. */
  byTrade: [string, number][];
  mastersMade: number;
  /** Units of masters' goods on outlet shelves; made and used (consumed) yesterday. */
  masterShelf: number;
  masterMade: number;
  masterUsed: number;
  pages: number;
  specialties: number;
  customs: number;
  /** Pages crediting seat 0 and seat 1 (a page crediting both counts for each). */
  seat0: number;
  seat1: number;
  together: number;
  callings: number;
  /** Units of Treats-family goods in storehouses, stalls, shops and output buffers. */
  treats: number;
  /** Coins; the credit line is what the County Bank lends in all (`creditLimit`). */
  treasury: number;
  owed: number;
  creditLine: number;
}

export interface R3Record {
  nights: NightSample[];
  days: R3DaySample[];
  /** The first day a specialized building's level was above 1, and its def. */
  firstClimb: { day: number; def: string; level: number } | null;
  /** The days a master's good first stood on an outlet shelf (0 never). */
  firstMasterDay: number;
  firstShelfDay: number;
  /** The day the town first stood at Village rank (0 never). */
  villageDay: number;
  /** The first day a tavern stood built (0 never). */
  tavernDay: number;
  /** Health issues seen over the run, counted by kind (the audit's watch). */
  health: Record<string, number>;
  /** Commands accepted by lane over the first 70 days, and refused. */
  decisions: { ledger: number; hearth: number; refused: number };
}

export const EMPTY_R3: R3Record = {
  nights: [],
  days: [],
  firstClimb: null,
  firstMasterDay: 0,
  firstShelfDay: 0,
  villageDay: 0,
  tavernDay: 0,
  health: {},
  decisions: { ledger: 0, hearth: 0, refused: 0 },
};

// --- Measuring functions (pure) --------------------------------------------------------------------

const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

/** Where the one-road cart scene stops: 02:00 the next morning (outcome 6b). */
const ONE_ROAD_UNTIL = 26;

export interface OutMeasure {
  /** Fair evenings with a grown-up who had a place in reach. */
  evenings: number;
  mean: number;
  worst: number;
  worstDay: number;
}

/** Outcome 1a: the share of eligible grown-ups out, per fair evening. */
export function measureOut(evenings: readonly EveningSample[]): OutMeasure {
  let n = 0;
  let sum = 0;
  let worst = 1;
  let worstDay = -1;
  for (const e of evenings) {
    if (e.weather !== 'fair' || e.eligible <= 0) continue;
    const share = e.out / e.eligible;
    n++;
    sum += share;
    if (share < worst || worstDay < 0) {
      worst = share;
      worstDay = e.day;
    }
  }
  return { evenings: n, mean: n ? sum / n : 0, worst: n ? worst : 0, worstDay };
}

export function rowOut(seed: string, evenings: readonly EveningSample[]): OutcomeRow {
  const m = measureOut(evenings);
  const base = { outcome: 'Out on a fair evening', seed, target: '100% (worst evening)', needs: 'R2A' };
  if (m.evenings === 0)
    return { ...base, measured: 'no fair evening with a place in reach', verdict: 'MISS' };
  return {
    ...base,
    measured: `worst ${pct(m.worst)} (day ${m.worstDay}), mean ${pct(m.mean)}, ${m.evenings} evenings`,
    verdict: m.worst >= 1 ? 'PASS' : 'MISS',
  };
}

/** Outcome 1b: samples where more were present than the place's room (seats plus standing). */
export function measureOverflow(rooms: readonly RoomSample[]): { overflows: number; samples: number } {
  let overflows = 0;
  for (const r of rooms) if (r.present > r.room) overflows++;
  return { overflows, samples: rooms.length };
}

export function rowOverflow(seed: string, rooms: readonly RoomSample[]): OutcomeRow {
  const m = measureOverflow(rooms);
  return {
    outcome: 'Places fill to their room, no further',
    seed,
    measured: m.samples
      ? `${m.overflows} overflows in ${m.samples} place-hours`
      : 'no place sampled 17:00 to 21:00',
    target: '0 overflows',
    verdict: m.samples === 0 ? 'MISS' : m.overflows === 0 ? 'PASS' : 'MISS',
    needs: 'R2A',
  };
}

export interface NoPlacesMeasure {
  /** Evenings on which no place stood. */
  placeFreeEvenings: number;
  /** Grown-ups out at a place on those evenings. */
  outOnThem: number;
  /** Evenings on which a place stood within reach of some grown-up's home. */
  inReachEvenings: number;
}

/** Outcome 2: who went out on evenings with no place at all. */
export function measureNoPlaces(evenings: readonly EveningSample[]): NoPlacesMeasure {
  let free = 0;
  let out = 0;
  let reach = 0;
  for (const e of evenings) {
    if (e.places === 0) {
      free++;
      out += e.outAny;
    }
    if (e.eligible > 0) reach++;
  }
  return { placeFreeEvenings: free, outOnThem: out, inReachEvenings: reach };
}

export function rowNoPlaces(
  seed: string,
  evenings: readonly EveningSample[],
  last: DaySample | undefined,
): OutcomeRow[] {
  const m = measureNoPlaces(evenings);
  const out: OutcomeRow = {
    outcome: 'No places, nobody out (Hearth off)',
    seed,
    measured:
      m.placeFreeEvenings === 0
        ? `no place-free evening (a place stood on all ${evenings.length} evenings)`
        : `${m.outOnThem} grown-ups out over ${m.placeFreeEvenings} place-free evenings`,
    target: '0 out',
    verdict: m.placeFreeEvenings === 0 ? 'N/A' : m.outOnThem === 0 ? 'PASS' : 'MISS',
    needs: 'R2A',
  };
  const crafts = last?.crafts ?? 0;
  const never: OutcomeRow = {
    outcome: 'No places in reach, no Craftsfolk (Hearth off)',
    seed,
    measured:
      m.inReachEvenings > 0
        ? `n/a: a place stood in reach on ${m.inReachEvenings} evenings (${crafts} Craftsfolk households at the end)`
        : `${crafts} Craftsfolk households at the end`,
    target: '0 Craftsfolk',
    verdict: m.inReachEvenings > 0 ? 'N/A' : crafts === 0 ? 'PASS' : 'MISS',
    needs: 'R2A, R2B',
  };
  return [out, never];
}

export interface TreatsMeasure {
  evenings: number;
  onRound: number;
  total: number;
}

/** Outcome 3: over evenings with three or more places, (at stops + passing) / all Treats sold. */
export function measureTreats(evenings: readonly EveningSample[]): TreatsMeasure {
  let n = 0;
  let round = 0;
  let total = 0;
  for (const e of evenings) {
    if (e.places < 3) continue;
    n++;
    round += e.treatsAtStops + e.treatsPassing;
    total += e.treatsAtStops + e.treatsPassing + e.treatsDoorstep;
  }
  return { evenings: n, onRound: round, total };
}

export function rowTreats(seed: string, evenings: readonly EveningSample[]): OutcomeRow {
  const m = measureTreats(evenings);
  const base = {
    outcome: 'Treats on the round (3+ places)',
    seed,
    target: '>= 80% on the round',
    needs: 'R2A, R2B',
  };
  if (m.evenings === 0) return { ...base, measured: 'no evening with three places', verdict: 'MISS' };
  if (m.total === 0)
    return { ...base, measured: `no Treats sold over ${m.evenings} evenings`, verdict: 'MISS' };
  const share = m.onRound / m.total;
  return {
    ...base,
    measured: `${pct(share)} (${m.onRound} of ${m.total} over ${m.evenings} evenings)`,
    verdict: share >= 0.8 ? 'PASS' : 'MISS',
  };
}

/** Outcome 7: a street town has rows of 3+ lots with garden lots behind them (R2F cuts them). */
export function rowStreetRows(seed: string, m: RowsMeasure): OutcomeRow {
  return {
    outcome: 'Street rows with gardens behind',
    seed,
    measured: `${m.rowLots} row lots in ${m.rows} rows (longest ${m.longestRow}, ${m.rowsOf3} of 3+), ${m.gardens} gardens, ${m.corners} corners, ${m.grownRowLots} grown`,
    target: '>= 1 row of 3+ lots, >= 1 garden',
    verdict: m.rowsOf3 >= 1 && m.gardens >= 1 ? 'PASS' : 'MISS',
    needs: 'R2F (street lots), R2E (streets laid)',
  };
}

/** Outcome 4: the first day a household is past Settlers, or 0. */
export function measureFirstCraftsfolk(days: readonly DaySample[]): number {
  for (const d of days) if (d.crafts > 0) return d.day;
  return 0;
}

export function rowFirstCraftsfolk(seed: string, days: readonly DaySample[]): OutcomeRow {
  const day = measureFirstCraftsfolk(days);
  return {
    outcome: 'First Craftsfolk by day 40',
    seed,
    measured: day ? `day ${day}` : `none in ${days.length} days`,
    target: 'day <= 40',
    verdict: day > 0 && day <= 40 ? 'PASS' : 'MISS',
    needs: 'R2B (tiers read evenings)',
  };
}

export interface GapMeasure {
  kind: string;
  opened: number;
  closed: number;
  /** Seats credited over the closed gaps (a seat counts once per gap). */
  credited: number;
  /** Closed gaps whose first closing of that subject credited nobody (a repeat closing may credit nobody). */
  uncredited: number;
  /** Closers that are not seats 0 or 1. */
  badSeats: number;
}

/** Outcome 5: per R2 gap kind, what opened, closed and credited. */
export function measureGaps(kinds: readonly string[], gaps: readonly SeenGap[]): GapMeasure[] {
  return kinds.map((kind) => {
    const mine = gaps.filter((g) => g.kind === kind).sort((a, b) => a.id - b.id);
    const m: GapMeasure = { kind, opened: mine.length, closed: 0, credited: 0, uncredited: 0, badSeats: 0 };
    const seen = new Set<string>();
    for (const g of mine) {
      if (!g.closed) continue;
      m.closed++;
      m.credited += g.closers.length;
      m.badSeats += g.closers.filter((s) => s !== 0 && s !== 1).length;
      if (g.closers.length === 0 && !seen.has(g.subject)) m.uncredited++;
      if (g.closers.length > 0) seen.add(g.subject);
    }
    return m;
  });
}

export function rowsGaps(seed: string, kinds: readonly string[], gaps: readonly SeenGap[]): OutcomeRow[] {
  return measureGaps(kinds, gaps).map((m) => {
    const ok = m.opened > 0 && m.closed > 0 && m.uncredited === 0 && m.badSeats === 0;
    return {
      outcome: `Gap ${m.kind}: opens, closes, credits`,
      seed,
      measured: `opened ${m.opened}, closed ${m.closed}, seats credited ${m.credited}${m.uncredited ? `, ${m.uncredited} closed with no closers` : ''}`,
      target: 'opened > 0, closed > 0, every first closing credits a seat',
      verdict: ok ? 'PASS' : 'MISS',
      needs: 'R2C',
    };
  });
}

/** Outcome 6a: a loop town; the cart drives round the marked stretch, within twice the free-flow trip. */
export function rowsCartLoop(marked: CartRun, free: CartRun): OutcomeRow[] {
  const needs = 'R2B (traffic, logistics)';
  if (!marked.jobTaken || marked.tripTicks < 0) {
    const m = marked.jobTaken
      ? 'a load was taken and never delivered by 23:00'
      : 'no delivery was due (the cart took no job)';
    return [
      {
        outcome: 'Cart routes round an evening street: off the stretch',
        seed: 'loop scene',
        measured: m,
        target: '0 ticks on the stretch 17:00 to 21:00',
        verdict: 'MISS',
        needs,
      },
      {
        outcome: 'Cart routes round an evening street: trip time',
        seed: 'loop scene',
        measured: m,
        target: '<= 2.0x free flow',
        verdict: 'MISS',
        needs,
      },
    ];
  }
  const ratio = free.tripTicks > 0 ? marked.tripTicks / free.tripTicks : Infinity;
  return [
    {
      outcome: 'Cart routes round an evening street: off the stretch',
      seed: 'loop scene',
      measured: `${marked.onEveningTiles} ticks on the stretch 17:00 to 21:00`,
      target: '0 ticks',
      verdict: marked.onEveningTiles === 0 ? 'PASS' : 'MISS',
      needs,
    },
    {
      outcome: 'Cart routes round an evening street: trip time',
      seed: 'loop scene',
      measured: `${marked.tripTicks} ticks vs ${free.tripTicks} free flow (${Number.isFinite(ratio) ? ratio.toFixed(2) : 'n/a'}x)`,
      target: '<= 2.0x free flow',
      verdict: ratio <= 2 ? 'PASS' : 'MISS',
      needs,
    },
  ];
}

/**
 * Outcome 6b: a one-road town; the cart waits at the edge, delivers after 21:00, no deadlock. R2X: the
 * scene's only way from lane A to street B is the far lane, so its pickup and drop are some 200 tiles
 * at a cart's pace (four hours with no evening street at all): the run goes on to 02:00 to see it home.
 */
export function rowCartOneRoad(marked: CartRun): OutcomeRow {
  const base = {
    outcome: 'Cart with no way round waits, delivers after 21:00',
    seed: 'one-road scene',
    target: `delivered after 21:00, 0 ticks on the stretch before, parked by ${ONE_ROAD_UNTIL - 24}:00`,
    needs: 'R2B (traffic, logistics)',
  };
  if (!marked.jobTaken)
    return { ...base, measured: 'no delivery was due (the cart took no job)', verdict: 'MISS' };
  const delivered = marked.tripTicks >= 0;
  const clock = (h: number) => `${Math.floor(h) % 24}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const ok = delivered && marked.deliveredAt >= 21 && marked.onEveningTiles === 0 && marked.parkedAtEnd;
  return {
    ...base,
    measured: `${delivered ? `delivered ${clock(marked.deliveredAt)}` : `not delivered by ${clock(marked.endHour)}`}, ${marked.onEveningTiles} ticks on the stretch, ${marked.parkedAtEnd ? 'parked' : 'not parked'} at ${clock(marked.endHour)}`,
    verdict: ok ? 'PASS' : 'MISS',
  };
}

// --- Recording an autoplay run ----------------------------------------------------------------------

const dayTicks = TICKS_PER_DAY;

/** The clock hour (0 to 23) of the sim. */
function clockHour(w: WorldState): number {
  return Math.floor(((w.tick + START_HOUR * TICKS_PER_HOUR) % dayTicks) / TICKS_PER_HOUR);
}

/** The absolute day index (the tally's `day` counts the same way). */
function dayOf(w: WorldState): number {
  return Math.floor((w.tick + START_HOUR * TICKS_PER_HOUR) / dayTicks);
}

const isGrownup = (stage: string): boolean => stage === 'young' || stage === 'adult';

/** An arrived stop at a place (not a shop, not a friend's home). */
export function atAPlace(r: WorldState['residents'][number]): boolean {
  return (r.round ?? []).some(
    (s) => s.arrived >= 0 && !s.place.startsWith('shop:') && !s.place.startsWith('home:'),
  );
}

function leisureRadius(traits: readonly string[]): number {
  const p = content.places;
  if (traits.includes('curious')) return p.curiousRadius;
  if (traits.includes('homebody')) return p.homebodyRadius;
  return p.radius;
}

/** Reads the evening that has just closed (tally and rounds) into a sample. */
export function sampleEvening(w: WorldState): EveningSample {
  const day = dayOf(w);
  // Until the tally rolls (R2A's 17:00 roll), it is last evening's or none: count what it holds only
  // when it is tonight's, and take the weather as fair.
  const mine = w.evenings.tonight.day === day;
  const t = mine ? w.evenings.tonight : null;
  let eligible = 0;
  let out = 0;
  let outAny = 0;
  const homeDoor = new Map<number, number>();
  for (const r of w.residents) {
    if (!isGrownup(r.stage)) continue;
    const went = atAPlace(r);
    if (went) outAny++;
    let door = homeDoor.get(r.householdId);
    if (door === undefined) {
      const hh = w.households.find((h) => h.id === r.householdId);
      const home = hh ? findById(w.buildings, hh.homeId) : undefined;
      door = home ? doorTile(home) : -1;
      homeDoor.set(r.householdId, door);
    }
    if (door < 0) continue;
    if (placesNear(w, door, leisureRadius(r.traits)).length === 0) continue;
    eligible++;
    if (went) out++;
  }
  return {
    day,
    weather: t?.weather ?? 'fair',
    eligible,
    out,
    outAny,
    places: placesView(w).places.length,
    treatsAtStops: t?.treatsAtStops ?? 0,
    treatsPassing: t?.treatsPassing ?? 0,
    treatsDoorstep: t?.treatsDoorstep ?? 0,
  };
}

// --- R3 samples (reads only) ----------------------------------------------------------------------------

const goodIndex = (id: string): number => content.goods.findIndex((g) => g.id === id);
const G_CANDLES = goodIndex('candles');
const G_FIREWOOD = goodIndex('firewood');
const G_CLOTH = goodIndex('cloth');
const TREATS_GOODS: readonly number[] = content.goods.flatMap((g, i) => (g.family === 'treats' ? [i] : []));
const MASTER_GOODS: readonly number[] = content.goods.flatMap((g, i) =>
  MASTER_GOOD_IDS.has(g.id) ? [i] : [],
);

export function rankIndex(rank: string): number {
  return RANKS.indexOf(rank as (typeof RANKS)[number]);
}

/** A lantern: decor with a nightly supply. */
export function lanternsStanding(w: WorldState): number {
  let n = 0;
  for (const d of w.decor) if (content.decorById.get(d.def)?.supply?.kind === 'nightly') n++;
  return n;
}

/** One night's supplies; views and counts only. */
export function sampleNight(w: WorldState): NightSample {
  const v = suppliesView(w);
  const drawn = w.supplies.drawn[w.supplies.drawn.length - 1] ?? [];
  return {
    day: dayOf(w),
    season: seasonAt(w.tick).season,
    rank: w.charter.rank,
    standing: lanternsStanding(w),
    lit: v.lamps.length,
    resting: v.resting.length,
    drawn: {
      candles: drawn[G_CANDLES] ?? 0,
      firewood: drawn[G_FIREWOOD] ?? 0,
      cloth: drawn[G_CLOTH] ?? 0,
    },
  };
}

/** One day's R3 books. */
export function sampleR3Day(w: WorldState, line: DayLine): R3DaySample {
  const stock = townStock(w);
  let shelf = 0;
  const shelfGoods = new Array<number>(content.goods.length).fill(0);
  for (const b of w.buildings) {
    const rt = b.rt;
    if (b.stage !== 'built' || !rt || !content.buildingById.get(b.def)?.tags?.includes('outlet')) continue;
    for (const g of MASTER_GOODS) shelfGoods[g]! += Math.max(0, rt.store[g] ?? 0);
  }
  for (const g of MASTER_GOODS) shelf += shelfGoods[g]!;
  const y = w.economy.yesterday;
  const byTrade = new Map<string, number>();
  for (const r of w.residents)
    if (isMaster(r) && r.mastery !== undefined) byTrade.set(r.mastery, (byTrade.get(r.mastery) ?? 0) + 1);
  let seat0 = 0;
  let seat1 = 0;
  for (const p of w.townBook.pages) {
    if (p.seats.includes(0)) seat0++;
    if (p.seats.includes(1)) seat1++;
  }
  return {
    day: line.day,
    residents: w.residents.length,
    households: w.households.length,
    crafts: w.households.filter((h) => h.tier !== 'settler').length,
    leanTimes: line.leanTimes,
    masters: mastersCount(w),
    byTrade: [...byTrade.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    mastersMade: mastersMade(w),
    masterShelf: shelf,
    masterMade: MASTER_GOODS.reduce((n, g) => n + (y.produced[g] ?? 0), 0),
    masterUsed: MASTER_GOODS.reduce((n, g) => n + (y.consumed[g] ?? 0), 0),
    pages: pagesFound(w),
    specialties: pagesFound(w, 'specialty'),
    customs: pagesFound(w, 'custom'),
    seat0,
    seat1,
    together: w.townBook.pages.filter((p) => p.seats.length >= 2).length,
    callings: callingsCount(w),
    treats: TREATS_GOODS.reduce((n, g) => n + (stock[g] ?? 0), 0),
    treasury: Math.round(w.economy.treasury / PENNIES_PER_COIN),
    owed: Math.round(loansOwed(w) / PENNIES_PER_COIN),
    creditLine: Math.round(creditLimit(w) / PENNIES_PER_COIN),
  };
}

/** The first sight of a specialized building above level 1, or null. */
export function specializedClimb(w: WorldState, day: number): R3Record['firstClimb'] {
  for (const b of w.buildings) {
    if (b.stage !== 'built' || (b.level ?? 1) <= 1) continue;
    if (content.buildingById.get(b.def)?.specialized) return { day, def: b.def, level: b.level ?? 1 };
  }
  return null;
}

/** Health issues counted by kind (kinds compared as strings: R3's arrive without a type change here). */
export function healthByKind(issues: readonly Pick<HealthIssue, 'kind'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of issues) out[i.kind as string] = (out[i.kind as string] ?? 0) + 1;
  return out;
}

/** Records an autoplay run's evenings, rooms, craftsfolk and gaps (this reads state; it changes none). */
export function recordRun(seed: string, days: number, opts: AutoplayOptions = {}): RunRecord {
  return recordRunWith(seed, days, opts).rec;
}

/** As `recordRun`, and the run itself too (its world, for the scripted scenes that go on from it). */
export function recordRunWith(
  seed: string,
  days: number,
  opts: AutoplayOptions = {},
): { rec: RunRecord; run: AutoplayResult } {
  const r3: R3Record = { ...EMPTY_R3, nights: [], days: [], health: {} };
  const rec: RunRecord = { seed, days, evenings: [], rooms: [], daySamples: [], gaps: [], rows: NO_ROWS, r3 };
  const seenGap = new Map<number, SeenGap>();
  let lastEvening = -2;
  let lastRoom = -1;
  let lastNight = -2;
  const onHour = (w: WorldState) => {
    const hour = clockHour(w);
    const day = dayOf(w);
    // R3E: the night, once, after the 17:30 settling (18:00 to 23:00 of the same day).
    if (hour >= 18 && hour <= 23 && day !== lastNight) {
      lastNight = day;
      r3.nights.push(sampleNight(w));
    }
    // Rooms: each hour 17:00 to 21:00, once.
    if (hour >= 17 && hour <= 21) {
      const key = day * 24 + hour;
      if (key !== lastRoom) {
        lastRoom = key;
        for (const p of placesView(w).places)
          rec.rooms.push({ day, hour, place: p.id, present: p.present, room: p.seats + p.standing });
      }
    }
    // The evening, once, after it has closed (22:00 or later).
    if (hour >= 22 && day !== lastEvening) {
      lastEvening = day;
      rec.evenings.push(sampleEvening(w));
    }
    for (const g of [...w.gaps.open, ...w.gaps.closed]) {
      const s = seenGap.get(g.id) ?? {
        id: g.id,
        kind: g.kind,
        subject: g.subject,
        closed: false,
        closers: [],
        openedDay: g.openedDay,
      };
      if (g.closedDay !== undefined) {
        s.closed = true;
        s.closers = [...(g.closers ?? [])];
      }
      seenGap.set(g.id, s);
    }
  };
  const onDay = (w: WorldState, line: DayLine) => {
    const crafts = w.households.filter((h) => h.tier !== 'settler').length;
    rec.daySamples.push({ day: line.day, crafts, households: w.households.length });
    const d = sampleR3Day(w, line);
    r3.days.push(d);
    if (r3.villageDay === 0 && rankIndex(w.charter.rank) >= rankIndex('village')) r3.villageDay = line.day;
    if (r3.firstMasterDay === 0 && d.masters > 0) r3.firstMasterDay = line.day;
    if (r3.firstShelfDay === 0 && d.masterShelf > 0) r3.firstShelfDay = line.day;
    if (r3.tavernDay === 0 && w.buildings.some((b) => b.def === 'tavern' && b.stage === 'built'))
      r3.tavernDay = line.day;
    if (!r3.firstClimb) r3.firstClimb = specializedClimb(w, line.day);
  };
  const run = autoplay(seed, days, {
    village: true,
    ...opts,
    onHour: (w) => {
      onHour(w);
      opts.onHour?.(w);
    },
    onDay: (w, line) => {
      onDay(w, line);
      opts.onDay?.(w, line);
    },
  });
  rec.rows = rowsOf(run.hamlet.world);
  r3.health = healthByKind(run.health);
  r3.decisions = (({ ledger, hearth, refused }) => ({ ledger, hearth, refused }))(
    tallyDecisions(run.decisions, 70),
  );
  rec.gaps = [...seenGap.values()].sort((a, b) => a.id - b.id);
  return { rec, run };
}

// --- The report ---------------------------------------------------------------------------------------

/** The R2 gap kinds, in content order. */
export function r2GapKinds(): string[] {
  return content.gaps.filter((g) => g.from === 'R2').map((g) => g.kind);
}

/** Every row for one seed's two runs (both lanes; the Hearth off from day 1). */
export function seedRows(seed: string, both: RunRecord, hearthOff: RunRecord): OutcomeRow[] {
  return [
    rowOut(seed, both.evenings),
    rowOverflow(seed, both.rooms),
    ...rowNoPlaces(seed, hearthOff.evenings, hearthOff.daySamples[hearthOff.daySamples.length - 1]),
    rowTreats(seed, both.evenings),
    rowFirstCraftsfolk(seed, both.daySamples),
    ...rowsGaps(seed, r2GapKinds(), both.gaps),
    rowStreetRows(seed, both.rows),
  ];
}

/** The scripted cart scenes' rows. */
export function cartRows(): OutcomeRow[] {
  return [
    ...rowsCartLoop(runCartScene('loop', true), runCartScene('loop', false)),
    rowCartOneRoad(runCartScene('oneRoad', true, ONE_ROAD_UNTIL)),
  ];
}

export function formatRows(rows: readonly OutcomeRow[]): string {
  const cols: (keyof OutcomeRow)[] = ['outcome', 'seed', 'measured', 'target', 'verdict', 'needs'];
  const width = cols.map((c) => Math.max(c.length, ...rows.map((r) => r[c].length)));
  const line = (get: (c: keyof OutcomeRow) => string) =>
    cols
      .map((c, i) => get(c).padEnd(width[i]!))
      .join('  ')
      .trimEnd();
  return [
    line((c) => c),
    line((c) => '-'.repeat(width[cols.indexOf(c)]!)),
    ...rows.map((r) => line((c) => r[c])),
  ].join('\n');
}

export function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): number {
  const strict = argv.includes('--strict') || env.OUTCOMES_STRICT === '1';
  const seeds = argv.filter((a) => !a.startsWith('--'));
  const list = seeds.length ? seeds : DEFAULT_SEEDS.slice(0, 2);
  const days = Number(env.OUTCOMES_DAYS ?? 70) || 70;
  const rows: OutcomeRow[] = [];
  for (const seed of list) {
    const both = recordRun(seed, days);
    const off = recordRun(seed, days, { hearthOffFrom: 1 });
    rows.push(...seedRows(seed, both, off));
  }
  rows.push(...cartRows());
  console.log(`R2 outcomes, ${days} days, seeds ${list.join(', ')}`);
  console.log(formatRows(rows));
  const miss = rows.filter((r) => r.verdict === 'MISS').length;
  console.log(
    `\n${rows.length} rows: ${rows.filter((r) => r.verdict === 'PASS').length} PASS, ${miss} MISS, ${rows.filter((r) => r.verdict === 'N/A').length} N/A`,
  );
  return strict && miss > 0 ? 1 : 0;
}

const entry = process.argv[1] ?? '';
if (/outcomes\.(ts|js)$/.test(entry)) process.exitCode = main(process.argv.slice(2));
