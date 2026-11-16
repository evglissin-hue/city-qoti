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
  doorTile,
  placesNear,
  placesView,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type WorldState,
} from '@qoti/sim';
import { findById } from '../../../packages/sim/src/state/entities';
import { DEFAULT_SEEDS } from './audit';
import { autoplay, type AutoplayOptions, type DayLine } from './autoplay';
import { runCartScene, type CartRun } from './cartScene';

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
}

// --- Measuring functions (pure) --------------------------------------------------------------------

const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

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

/** Outcome 6b: a one-road town; the cart waits at the edge, delivers after 21:00, no deadlock by 23:00. */
export function rowCartOneRoad(marked: CartRun): OutcomeRow {
  const base = {
    outcome: 'Cart with no way round waits, delivers after 21:00',
    seed: 'one-road scene',
    target: 'delivered after 21:00, 0 ticks on the stretch before, parked by 23:00',
    needs: 'R2B (traffic, logistics)',
  };
  if (!marked.jobTaken)
    return { ...base, measured: 'no delivery was due (the cart took no job)', verdict: 'MISS' };
  const delivered = marked.tripTicks >= 0;
  const clock = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const ok = delivered && marked.deliveredAt >= 21 && marked.onEveningTiles === 0 && marked.parkedAtEnd;
  return {
    ...base,
    measured: `${delivered ? `delivered ${clock(marked.deliveredAt)}` : 'not delivered by 23:00'}, ${marked.onEveningTiles} ticks on the stretch, ${marked.parkedAtEnd ? 'parked' : 'not parked'} at ${clock(marked.endHour)}`,
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

/** Records an autoplay run's evenings, rooms, craftsfolk and gaps (this reads state; it changes none). */
export function recordRun(seed: string, days: number, opts: AutoplayOptions = {}): RunRecord {
  const rec: RunRecord = { seed, days, evenings: [], rooms: [], daySamples: [], gaps: [] };
  const seenGap = new Map<number, SeenGap>();
  let lastEvening = -2;
  let lastRoom = -1;
  const onHour = (w: WorldState) => {
    const hour = clockHour(w);
    const day = dayOf(w);
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
  };
  autoplay(seed, days, {
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
  rec.gaps = [...seenGap.values()].sort((a, b) => a.id - b.id);
  return rec;
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
  ];
}

/** The scripted cart scenes' rows. */
export function cartRows(): OutcomeRow[] {
  return [
    ...rowsCartLoop(runCartScene('loop', true), runCartScene('loop', false)),
    rowCartOneRoad(runCartScene('oneRoad', true)),
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
