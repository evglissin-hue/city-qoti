// R3D: mock R3 views for UI work and screenshots until R3A to R3C land (the sim's supplies, masters
// and Town Book views are stand-ins that find nothing). Built from whatever valley the Mirror holds,
// like ui/mocks/evening.ts: real places, lanterns, homes, businesses, residents and seats.
// Debug only: `?debug&fixture=village&mock&evening&r3` lays them over the live fixture (the places
// come from the evening mocks, so pass `evening` too).
import { content } from '@qoti/content';
import {
  GOOD_FAMILIES,
  LEANINGS,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type BalancesView,
  type BuildingDetail,
  type BusinessView,
  type CallingView,
  type CharterView,
  type DecorView,
  type EntityId,
  type InspectResult,
  type PlaceSupplyView,
  type PlaceView,
  type RestingView,
  type ResidentDetail,
  type SeatId,
  type SuppliesView,
  type TownBookHintView,
  type TownBookPageView,
  type TownBookView,
} from '@qoti/sim';
import type { Session } from '../../app/session';
import type { Mirror } from '../../state/mirror';

/** The mock pages: two specialties (one Made Together) and two customs; three industry pages earn Mill Town. */
const PAGE_DEFS: { kind: 'specialty' | 'custom'; id: string; together?: boolean }[] = [
  { kind: 'specialty', id: 'market-cross-cider' },
  { kind: 'specialty', id: 'market-cross-pies', together: true },
  { kind: 'custom', id: 'market-night' },
  { kind: 'custom', id: 'orchard-stroll' },
];

/** The hints for pages not yet found (a specialty, a custom, a specialty). */
const HINT_IDS = ['lantern-walk-mead', 'evening-walk', 'pond-garden-honey'];

export interface MockMasters {
  /** The business with a master, an apprentice and a master's good. */
  business: EntityId;
  master: EntityId;
  trade: string;
  title: string;
  good: string;
  apprentices: EntityId[];
  /** A business whose master left: it keeps its level for a few more days. */
  graceBusiness: EntityId | null;
}

export interface R3Mocks {
  townBook: TownBookView;
  supplies: SuppliesView;
  /** Supplied pieces the valley lacked, to add to the Mirror (empty when the fixture has its own). */
  decor: DecorView[];
  /** The Mirror's places with priority, supplies, resting and pages on a few. */
  places: PlaceView[];
  balances: BalancesView | null;
  /** The businesses with master fields. */
  businesses: BusinessView[];
  masters: MockMasters | null;
  callings: { id: string; name: string }[];
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const lanternSupply = (d: DecorView) => {
  const s = content.decorById.get(d.def)?.supply;
  return s?.kind === 'nightly' ? s : undefined;
};
const fireSupply = (d: DecorView) => {
  const s = content.decorById.get(d.def)?.supply;
  return s?.kind === 'evening' ? s : undefined;
};

/** The Town Book, the supplies, the priorities and the masters for the valley the Mirror holds now. */
export function r3Mocks(m: Mirror): R3Mocks {
  const seats = m.seats.value;
  const day = Math.floor(m.tick.value / TICKS_PER_DAY);
  const base = day * TICKS_PER_DAY;
  const placeList = [...m.places.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const spots = placeList.filter((p) => p.source !== 'porch');
  const both = seats.map((s) => s.seat).slice(0, 2) as SeatId[];

  // --- The Town Book: four pages at real places, three hints, Mill Town earned.
  const pages: TownBookPageView[] = [];
  PAGE_DEFS.forEach((spec, i) => {
    const def =
      spec.kind === 'specialty' ? content.specialtyById.get(spec.id) : content.customById.get(spec.id);
    const place = spots[i % Math.max(1, spots.length)];
    if (!def || !place) return;
    const page: TownBookPageView = {
      id: 8001 + i,
      kind: spec.kind,
      def: spec.id,
      place: place.id,
      name: cap(def.name),
      day: Math.max(0, day - 12 + i * 3),
      seats: spec.together ? both : [(i % 2) as SeatId],
      leaning: def.leaning,
      placeName: place.name,
      text: def.text,
      together: !!spec.together && both.length >= 2,
    };
    if (spec.kind === 'specialty') {
      const good = content.specialtyById.get(spec.id)!.good;
      page.good = content.goods.findIndex((g) => g.id === good);
      page.goodId = good;
    } else page.dayOfSeason = 3 + i;
    pages.push(page);
  });
  const hints: TownBookHintView[] = [];
  for (const id of HINT_IDS) {
    const sp = content.specialtyById.get(id);
    const cu = content.customById.get(id);
    if (sp) hints.push({ def: id, kind: 'specialty', hint: sp.hint, leaning: sp.leaning });
    else if (cu) hints.push({ def: id, kind: 'custom', hint: cu.hint, leaning: cu.leaning });
  }
  const leanings = LEANINGS.map((l) => pages.filter((p) => p.leaning === l).length);
  const callings: CallingView[] = [];
  for (const def of content.callings) {
    const n = leanings[LEANINGS.indexOf(def.leaning)] ?? 0;
    if (n < content.townBook.pagesForCalling) continue;
    const day3 = pages.filter((p) => p.leaning === def.leaning)[content.townBook.pagesForCalling - 1]!.day;
    callings.push({
      id: def.id,
      name: def.name,
      blurb: def.blurb,
      icon: def.icon,
      leaning: def.leaning,
      effectLines: [...def.effectLines],
      day: day3,
    });
  }
  const townBook: TownBookView = { pages, hints, callings, leanings };

  // --- Supplied pieces: every lantern lit but two, one fire resting cold. Add what the valley lacks.
  const decor: DecorView[] = [];
  const real = [...m.decor.values()].sort((a, b) => a.id - b.id);
  let nextId = 9500;
  const piece = (def: string, k: number): DecorView => {
    const tile = spots[k % Math.max(1, spots.length)]?.tile ?? 0;
    const side = m.size;
    return {
      id: nextId++,
      def,
      fx: (tile % side) + 0.5 + (k % 3) * 0.4,
      fz: Math.floor(tile / side) + 1.5,
      rot: 0,
      builtBy: 0,
    };
  };
  const lanterns = real.filter((d) => lanternSupply(d));
  const fires = real.filter((d) => fireSupply(d));
  while (lanterns.length < 8 && spots.length > 0) {
    const d = piece('lamp-post', lanterns.length);
    decor.push(d);
    lanterns.push(d);
  }
  if (fires.length === 0 && spots.length > 0) {
    const d = piece('brazier', 1);
    decor.push(d);
    fires.push(d);
  }
  const fire = fires[0];
  const restLamps = lanterns.slice(3, 5);
  const resting: RestingView[] = [
    ...restLamps.map((d) => ({ id: d.id, kind: 'unlit' as const })),
    ...(fire ? [{ id: fire.id, kind: 'cold' as const }] : []),
  ].sort((a, b) => a.id - b.id);
  const restingIds = new Set(resting.map((r) => r.id));
  const lamps = lanterns
    .filter((d) => !restingIds.has(d.id))
    .map((d, i) => ({
      id: d.id,
      reach: base + 17.6 * TICKS_PER_HOUR + i * 10,
      out: base + 30 * TICKS_PER_HOUR,
    }));
  const homes = [...m.households.values()].sort((a, b) => a.id - b.id).slice(0, 2);
  const candles = homes.map((h) => h.homeId).sort((a, b) => a - b);
  const lamplighter = [...m.residents.values()].find((r) => r.stage === 'adult');
  const supplies: SuppliesView = {
    night: day,
    lamps,
    resting,
    candles,
    candleUntil: base + 22 * TICKS_PER_HOUR,
    lamplighters: {
      jobs: Math.max(1, Math.ceil(lanterns.length / content.supplies.lanternsPerLamplighter)),
      held: lamplighter ? [lamplighter.id] : [],
    },
  };

  // --- Places: keep one, let one rest, with their supplied pieces in words.
  const places = placeList.map((p) => ({ ...p }));
  const keep = places.find((p) => p.id === spots[0]?.id);
  const rest = places.find((p) => p.id === spots[1]?.id);
  const supplyOf = (kind: 'nightly' | 'evening', pieces: DecorView[], restingN: number): PlaceSupplyView => {
    const s = kind === 'nightly' ? lanternSupply(pieces[0]!) : fireSupply(pieces[0]!);
    return {
      kind,
      ...(s?.good ? { good: s.good } : {}),
      pieces: pieces.length,
      wants: kind === 'nightly' ? Math.ceil(pieces.length / (s?.per ?? 4)) : (s?.qty ?? 1),
      resting: restingN,
    };
  };
  if (keep) {
    const mine = lanterns.slice(0, 3);
    keep.priority = 'keep';
    keep.members = [...keep.members, ...mine.map((d) => d.id)];
    keep.supplies = mine.length ? [supplyOf('nightly', mine, 0)] : [];
    keep.resting = [];
    keep.pages = pages.filter((p) => p.place === keep.id).map((p) => p.id);
  }
  if (rest) {
    const mine = restLamps;
    rest.priority = 'rest';
    rest.members = [...rest.members, ...mine.map((d) => d.id), ...(fire ? [fire.id] : [])];
    rest.supplies = [
      ...(mine.length ? [supplyOf('nightly', mine, mine.length)] : []),
      ...(fire ? [supplyOf('evening', [fire], 1)] : []),
    ];
    rest.resting = resting.filter((r) => rest.members.includes(r.id));
    rest.pages = pages.filter((p) => p.place === rest.id).map((p) => p.id);
  }
  for (const p of places)
    if (p !== keep && p !== rest) p.pages = pages.filter((g) => g.place === p.id).map((g) => g.id);

  // --- Balances: what places drew last night, and the carrier's switch for them.
  const b = m.balances.value;
  const fam = (id: string) => GOOD_FAMILIES.indexOf(id as (typeof GOOD_FAMILIES)[number]);
  const balances: BalancesView | null = b
    ? {
        ...b,
        lines: b.lines.map((line, i) =>
          i === fam('wares')
            ? { ...line, drawnByPlaces: { lastNight: 14, before: 11 }, forPlaces: true }
            : i === fam('fuel')
              ? { ...line, drawnByPlaces: { lastNight: 6, before: 6 }, forPlaces: false }
              : line,
        ),
      }
    : null;

  // --- Masters: a master with an apprentice where the work is, and a business in its grace.
  let masters: MockMasters | null = null;
  const businesses: BusinessView[] = [];
  const crews = [...m.businesses.values()]
    .filter((bz) => bz.trade && content.masters.some((d) => d.of === bz.trade && d.good))
    .map((bz) => ({
      bz,
      workers: [...m.residents.values()].filter((r) => r.jobId === bz.id && r.stage === 'adult'),
    }))
    .filter((c) => c.workers.length >= 1)
    .sort((a, c) => c.workers.length - a.workers.length || a.bz.id - c.bz.id);
  const first = crews[0];
  if (first) {
    const def = content.masters.find((d) => d.of === first.bz.trade)!;
    const [master, ...others] = first.workers;
    const apprentices = others.slice(0, 1).map((r) => r.id);
    masters = {
      business: first.bz.id,
      master: master!.id,
      trade: first.bz.trade!,
      title: def.title,
      good: def.good!,
      apprentices,
      graceBusiness: crews[1]?.bz.id ?? null,
    };
    businesses.push({
      ...first.bz,
      masterId: master!.id,
      masterGood: def.good!,
      ...(apprentices.length ? { apprentices } : {}),
    });
    if (crews[1]) businesses.push({ ...crews[1].bz, graceDays: 4 });
  }

  return {
    townBook,
    supplies,
    decor,
    places,
    balances,
    businesses,
    masters,
    callings: callings.map((c) => ({ id: c.id, name: c.name })),
  };
}

/** Answers inspect for the mock masters, the Town Hall's lamplighter and a home's candle. */
export function r3Detail(
  m: Mirror,
  mocks: R3Mocks,
  kind: string,
  id: number,
  real: InspectResult,
): InspectResult {
  if (!real) return real;
  const nameOf = (rid: EntityId) => {
    const r = m.residents.get(rid);
    return r ? `${r.given} ${r.family}` : 'Somebody';
  };
  const mm = mocks.masters;
  if (kind === 'resident' && 'r' in real) {
    const d = real as ResidentDetail;
    if (mm && id === mm.master)
      return { ...d, craft: [{ trade: mm.trade, days: 26 }], master: { trade: mm.trade, title: mm.title } };
    if (mm && mm.apprentices.includes(id))
      return {
        ...d,
        craft: [{ trade: mm.trade, days: 7 }],
        apprenticeOf: { id: mm.master, name: nameOf(mm.master) },
      };
    return d;
  }
  if (kind === 'building' && 'b' in real) {
    const d = real as BuildingDetail;
    const out: BuildingDetail = { ...d };
    if (mm && id === mm.business)
      out.master = {
        id: mm.master,
        name: nameOf(mm.master),
        trade: mm.trade,
        title: mm.title,
        apprentices: mm.apprentices.map((a) => ({ id: a, name: nameOf(a) })),
      };
    if (d.b.def === 'town-hall')
      out.lamplighter = {
        jobs: mocks.supplies.lamplighters.jobs,
        held: mocks.supplies.lamplighters.held.map((h) => ({ id: h, name: nameOf(h) })),
        lanterns: mocks.supplies.lamps.length,
        candles: mocks.supplies.candles.length,
      };
    if (mocks.supplies.candles.includes(id)) out.candle = 4;
    return out;
  }
  return real;
}

/** Lays the R3 mocks over the Mirror and teaches inspect their details. Debug only. */
export function overlayR3Mocks(session: Session): R3Mocks {
  const m = session.mirror;
  const mocks = r3Mocks(m);
  if (mocks.decor.length)
    m.apply({
      t: m.lastTurn.value + 1,
      events: mocks.decor.map((d) => ({ e: 'decor.added' as const, d })),
      patches: [],
    });
  m.setPlaces({ places: mocks.places });
  m.supplies.value = mocks.supplies;
  m.townBook.value = mocks.townBook;
  if (mocks.balances) m.balances.value = mocks.balances;
  for (const bz of mocks.businesses) m.businesses.set(bz.id, bz);
  const c = m.charter.value;
  if (c) m.charter.value = { ...c, callings: mocks.callings } satisfies CharterView;
  m.villageRevision.value++;
  m.hamletRevision.value++;
  const live = session.inspect.bind(session);
  session.inspect = async (kind, id) => r3Detail(m, mocks, kind, id, await live(kind, id));
  return mocks;
}
