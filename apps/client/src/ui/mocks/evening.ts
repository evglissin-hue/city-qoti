// R2D: mock evening views for UI work until R2A to R2C land (the place pass, the round, gaps and the
// edition are stand-ins that find nothing). Built from whatever valley the Mirror holds, so they work
// over every fixture: hosts (wells, stalls, a tavern), seat pieces and porches become places; the
// evening footfall walks the roads from homes to them; the edition credits both seats by name.
// Debug only: `?debug&fixture=village&mock&evening` lays them over the live fixture.
import { content } from '@qoti/content';
import {
  footprintSize,
  MAP_SIZE,
  RoundFlags,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type DrawParts,
  type EditionLine,
  type EntityId,
  type EveningTally,
  type EveningView,
  type FootfallView,
  type GapView,
  type GapsView,
  type PlaceKind,
  type PlaceSource,
  type PlaceView,
  type ResidentDetail,
  type SeatId,
  type RoundStopView,
  type StreetView,
} from '@qoti/sim';
import type { Session } from '../../app/session';
import type { Mirror } from '../../state/mirror';

const N = MAP_SIZE;

/** A place for tests and mocks: every field filled, the given ones on top. */
export function mockPlace(p: Partial<PlaceView> & { id: string }): PlaceView {
  const parts: DrawParts = p.parts ?? {
    charm: 38,
    site: 0,
    pieces: 4,
    water: 0,
    lit: 5,
    treats: 4,
    winter: 0,
  };
  return {
    name: p.name ?? 'the bench by the Hollybush cottage',
    generated: p.generated ?? p.name ?? 'the bench by the Hollybush cottage',
    source: 'seats',
    def: 'bench',
    tile: 0,
    tiles: [0],
    members: [],
    seats: 4,
    childSeats: 0,
    standing: 2,
    kinds: ['sit'],
    sheltered: false,
    warm: false,
    serves: [],
    draw: parts.charm + parts.site + parts.pieces + parts.water + parts.lit + parts.treats + parts.winter,
    parts,
    visitors: [6, 9, 12],
    takings: [0, 40, 120],
    sold: [0, 1, 3],
    present: 0,
    wants: [],
    ...p,
  };
}

export function mockTally(t: Partial<EveningTally> = {}): EveningTally {
  return {
    day: 6,
    weather: 'fair',
    grownups: 40,
    out: 27,
    nowhere: 5,
    stood: 3,
    scoreSum: 40 * 54,
    friendships: 2,
    treatsAtStops: 14,
    treatsPassing: 5,
    treatsDoorstep: 3,
    takings: 210,
    ...t,
  };
}

const HOST_DEFS: Record<string, { kinds: PlaceKind[]; seats: number; standing: number; label: string }> = {
  'market-stall': { kinds: ['eat', 'meet'], seats: 0, standing: 4, label: 'stall' },
  well: { kinds: ['meet'], seats: 0, standing: 4, label: 'well' },
  tavern: { kinds: ['eat', 'meet'], seats: 12, standing: 6, label: 'tavern' },
  'bath-house': { kinds: ['meet'], seats: 8, standing: 4, label: 'Bath House' },
};

const STREET_NAMES = [
  'Mill Lane',
  'Underbank Row',
  'Hollybush Street',
  'Chapel Walk',
  'Tanner’s Lane',
  'Copper Row',
];

interface Mocks {
  places: PlaceView[];
  streets: StreetView[];
  gaps: GapsView;
  evening: EveningView;
  footfall: FootfallView;
}

function footprint(m: Mirror, id: EntityId): number[] {
  const b = m.buildings.get(id)!;
  const def = content.buildingById.get(b.def);
  const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
  const out: number[] = [];
  for (let z = b.z - 1; z <= b.z + d; z++)
    for (let x = b.x - 1; x <= b.x + w; x++) if (x >= 0 && z >= 0 && x < N && z < N) out.push(z * N + x);
  return out.sort((a, b2) => a - b2);
}

function familyNear(m: Mirror, x: number, z: number): string {
  let best = '';
  let bd = Infinity;
  for (const h of m.households.values()) {
    const home = m.buildings.get(h.homeId);
    if (!home) continue;
    const d = Math.abs(home.x - x) + Math.abs(home.z - z);
    if (d < bd) {
      bd = d;
      best = h.family;
    }
  }
  return best || 'Hollybush';
}

/** Breadth-first along road tiles; a straight line where the roads do not join. */
function walk(m: Mirror, from: number, to: number): number[] {
  const road = (t: number) => m.layers.road[t]! > 0;
  const nearRoad = (t: number): number => {
    const x = t % N;
    const z = Math.floor(t / N);
    for (let r = 0; r <= 3; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const zz = z + dz;
          if (xx >= 0 && zz >= 0 && xx < N && zz < N && road(zz * N + xx)) return zz * N + xx;
        }
    return -1;
  };
  const a = nearRoad(from);
  const b = nearRoad(to);
  if (a >= 0 && b >= 0) {
    const prev = new Map<number, number>([[a, -1]]);
    const queue = [a];
    for (let i = 0; i < queue.length && !prev.has(b); i++) {
      const t = queue[i]!;
      const x = t % N;
      for (const n of [t - N, t + N, x > 0 ? t - 1 : -1, x < N - 1 ? t + 1 : -1]) {
        if (n < 0 || n >= N * N || prev.has(n) || !road(n)) continue;
        prev.set(n, t);
        queue.push(n);
      }
    }
    if (prev.has(b)) {
      const path: number[] = [];
      for (let t = b; t !== -1; t = prev.get(t)!) path.push(t);
      return path;
    }
  }
  const path: number[] = [];
  let x = from % N;
  let z = Math.floor(from / N);
  const tx = to % N;
  const tz = Math.floor(to / N);
  while (x !== tx) {
    path.push(z * N + x);
    x += Math.sign(tx - x);
  }
  while (z !== tz) {
    path.push(z * N + x);
    z += Math.sign(tz - z);
  }
  return path;
}

/** Straight runs of road tiles at least five long, named in turn. */
function streetsOf(m: Mirror): StreetView[] {
  const out: StreetView[] = [];
  const seen = new Uint8Array(N * N);
  let id = 9001;
  for (let z = 0; z < N && out.length < STREET_NAMES.length; z++)
    for (let x = 0; x < N && out.length < STREET_NAMES.length; x++) {
      const t = z * N + x;
      if (seen[t] || !m.layers.road[t]) continue;
      const tiles: number[] = [];
      for (let xx = x; xx < N && m.layers.road[z * N + xx]; xx++) tiles.push(z * N + xx);
      if (tiles.length < 5) continue;
      for (const s of tiles) seen[s] = 1;
      const name = STREET_NAMES[out.length]!;
      out.push({ id: id++, name, generated: name, anchor: tiles[0]!, tiles });
    }
  return out;
}

/** The mock evening for the valley the Mirror holds now. */
export function eveningMocks(m: Mirror): Mocks {
  const seats = m.seats.value;
  const nameOf = (seat: number) => seats.find((s) => s.seat === seat)?.name ?? (seat === 0 ? 'Ada' : 'Bo');
  const places: PlaceView[] = [];
  let k = 0;
  for (const b of [...m.buildings.values()].sort((a, b2) => a.id - b2.id)) {
    const host = HOST_DEFS[b.def];
    if (!host || b.stage !== 'built') continue;
    const tiles = footprint(m, b.id);
    const charm = 30 + ((b.id * 7) % 25);
    const treats = host.kinds.includes('eat') ? 4 : 0;
    const parts: DrawParts = {
      charm,
      site: 0,
      pieces: 2,
      water: b.def === 'well' ? 5 : 0,
      lit: 5,
      treats,
      winter: 0,
    };
    const visitors = [4 + (k % 5), 7 + ((k * 3) % 6), 9 + ((k * 5) % 9)];
    const serves = host.kinds.includes('eat') ? [b.id] : [];
    places.push(
      mockPlace({
        id: `host:${b.id}`,
        name: `the ${host.label} by the ${familyNear(m, b.x, b.z)} cottage`,
        source: 'host' as PlaceSource,
        def: b.def,
        tile: b.z * N + b.x,
        tiles,
        members: [b.id],
        seats: host.seats,
        standing: host.standing,
        kinds: host.kinds,
        sheltered: b.def === 'tavern' || b.def === 'bath-house',
        warm: b.def === 'tavern' || b.def === 'bath-house',
        serves,
        parts,
        visitors,
        takings: serves.length ? visitors.map((v) => v * 12) : [0, 0, 0],
        sold: serves.length ? visitors.map((v) => Math.floor(v / 2)) : [0, 0, 0],
        present: k % 3 === 0 ? 3 : 0,
        wants: serves.length
          ? ['two benches would seat the ones who stand']
          : [`a stall would sell to the ${visitors[2]} who come`],
      }),
    );
    k++;
  }
  // Seat pieces: each bench (and its neighbors within 3 tiles) is a sitting spot.
  const benches = [...m.decor.values()]
    .filter((d) => (content.decorById.get(d.def)?.seats ?? 0) > 0)
    .sort((a, b) => a.id - b.id);
  const used = new Set<EntityId>();
  for (const d of benches) {
    if (used.has(d.id)) continue;
    const group = benches
      .filter((o) => !used.has(o.id) && Math.abs(o.fx - d.fx) + Math.abs(o.fz - d.fz) <= 3)
      .slice(0, 4);
    for (const g of group) used.add(g.id);
    const tiles = new Set<number>();
    for (const g of group)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) tiles.add((Math.floor(g.fz) + dz) * N + Math.floor(g.fx) + dx);
    const seatCount = group.reduce((t, g) => t + (content.decorById.get(g.def)?.seats ?? 0), 0);
    places.push(
      mockPlace({
        id: `seats:${d.id}`,
        name: `the bench by the ${familyNear(m, d.fx, d.fz)} cottage`,
        def: d.def,
        tile: Math.floor(d.fz) * N + Math.floor(d.fx),
        tiles: [...tiles].sort((a, b) => a - b),
        members: group.map((g) => g.id),
        seats: seatCount,
        standing: Math.max(2, Math.floor(seatCount / 2)),
        present: 2,
      }),
    );
  }
  // Two porches, for the plainest evening there is.
  const homes = [...m.households.values()].sort((a, b) => a.id - b.id).slice(0, 2);
  for (const h of homes) {
    const b = m.buildings.get(h.homeId);
    if (!b) continue;
    places.push(
      mockPlace({
        id: `porch:${b.id}`,
        name: `the ${h.family} porch`,
        source: 'porch',
        def: b.def,
        tile: b.z * N + b.x,
        tiles: footprint(m, b.id),
        members: [b.id],
        seats: 2,
        standing: 2,
        kinds: ['sit'],
        parts: { charm: 24, site: 0, pieces: 0, water: 0, lit: 0, treats: 0, winter: 0 },
        visitors: [2, 2, 1],
        takings: [0, 0, 0],
        sold: [0, 0, 0],
        household: h.id,
      }),
    );
  }
  places.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Evening footfall: every home walks to the two nearest places; day footfall to the storehouse.
  const eve = new Uint16Array(N * N);
  const day = new Uint16Array(N * N);
  const store = [...m.buildings.values()].find((b) => b.def === 'storehouse');
  for (const h of m.households.values()) {
    const home = m.buildings.get(h.homeId);
    if (!home) continue;
    const from = home.z * N + home.x;
    const near = [...places]
      .filter((p) => p.source !== 'porch')
      .sort((a, b) => dist(a.tile, from) - dist(b.tile, from))
      .slice(0, 2);
    for (const p of near)
      for (const t of walk(m, from, p.tile)) eve[t] = Math.min(65535, eve[t]! + 3 * h.members.length);
    if (store)
      for (const t of walk(m, from, store.z * N + store.x))
        day[t] = Math.min(65535, day[t]! + 2 * h.members.length);
  }

  const streets = streetsOf(m);
  const today = Math.floor(m.tick.value / TICKS_PER_DAY);
  const unserved = places.find((p) => p.serves.length === 0 && p.source === 'host');
  const busiest = [...places].sort((a, b) => (b.visitors.at(-1) ?? 0) - (a.visitors.at(-1) ?? 0))[0];
  const open: GapView[] = [];
  if (unserved) {
    const n = unserved.visitors.at(-1) ?? 0;
    open.push({
      id: 7001,
      kind: 'nothingToSell',
      subject: unserved.id,
      tile: unserved.tile,
      lane: 'ledger',
      text: `${cap(unserved.name)} drew ${n} folk and had nothing to sell them.`,
      closes: 'A stall or a shop within 3 tiles, with treats on the shelf.',
      openedDay: today - 1,
      n,
    });
  }
  if (streets[1]) {
    open.push({
      id: 7002,
      kind: 'nowhereToGo',
      subject: `street:${streets[1].id}`,
      tile: streets[1].anchor,
      lane: 'hearth',
      text: `${streets[1].name} stays in of an evening.`,
      closes: 'A bench or two in reach, somewhere worth the walk.',
      openedDay: today - 2,
      n: 6,
    });
  }
  const closed: GapView[] = busiest
    ? [
        {
          id: 6990,
          kind: 'nothingToSell',
          subject: busiest.id,
          tile: busiest.tile,
          lane: 'ledger',
          text: `${cap(busiest.name)} drew ${busiest.visitors.at(-1)} folk and had nothing to sell them.`,
          closes: 'A stall or a shop within 3 tiles, with treats on the shelf.',
          openedDay: today - 4,
          n: busiest.visitors.at(-1) ?? 0,
          closedDay: today,
          closers: [1 as SeatId],
        },
      ]
    : [];
  const tally = mockTally({ day: today });
  const top = places.filter((p) => p.source !== 'porch').slice(0, 3);
  const lines: EditionLine[] = [
    ...(busiest
      ? [
          {
            text: `${nameOf(1)}'s stall by ${busiest.name} sold to the ${busiest.visitors.at(-1)} who came: ${Math.round((busiest.takings.at(-1) ?? 0) / 100)} coins.`,
            seats: [1 as SeatId],
            refs: [busiest.id],
          },
        ]
      : []),
    ...(top[1]
      ? [
          {
            text: `${nameOf(0)}'s benches brought ${top[1].visitors.at(-1)} folk to ${top[1].name}, and 4 of them bought a treat.`,
            seats: [0 as SeatId],
            refs: [top[1].id],
          },
        ]
      : []),
    {
      text: `${tally.out} of ${tally.grownups} grown-ups went out. The average evening was a fair ${Math.round(tally.scoreSum / tally.grownups)}.`,
      seats: [],
      refs: [],
    },
    {
      text: `${tally.stood} folk stood for want of a seat. Nobody complained out loud.`,
      seats: [],
      refs: [],
    },
  ];
  const evening: EveningView = {
    tally,
    lines,
    places: [...places]
      .sort((a, b) => (b.visitors.at(-1) ?? 0) - (a.visitors.at(-1) ?? 0))
      .map((p) => ({
        id: p.id,
        name: p.name,
        visitors: p.visitors.at(-1) ?? 0,
        seats: p.seats,
        takings: p.takings.at(-1) ?? 0,
      })),
  };
  return {
    places,
    streets,
    gaps: { open, closed, closedCount: closed.length, closedBySeat: [0, closed.length] },
    evening,
    footfall: { day, eve },
  };
}

/** Today's round for a resident, over the mock places. */
export function mockRound(m: Mirror, residentId: EntityId): RoundStopView[] {
  const list = [...m.places.values()].filter((p) => p.source !== 'porch');
  if (!list.length) return [];
  const dayStart = Math.floor(m.tick.value / TICKS_PER_DAY) * TICKS_PER_DAY;
  const at = (h: number) => dayStart + Math.round(h * TICKS_PER_HOUR);
  const a = list[residentId % list.length]!;
  const b = list[(residentId + 1) % list.length]!;
  const stops: RoundStopView[] = [
    {
      place: a.id,
      name: a.name,
      kind: a.kinds[0] ?? 'sit',
      tile: a.tile,
      draw: a.draw,
      flags: RoundFlags.arrived | RoundFlags.seated | RoundFlags.friend,
      arrived: at(17.4),
    },
  ];
  if (b.id !== a.id)
    stops.push({
      place: b.id,
      name: b.name,
      kind: b.kinds[0] ?? 'meet',
      tile: b.tile,
      draw: b.draw,
      flags: RoundFlags.arrived | RoundFlags.standing | RoundFlags.treat,
      arrived: at(18.6),
    });
  return stops;
}

/** Lays the mock evening over the Mirror and teaches inspect a resident's round. Debug only. */
export function overlayEveningMocks(session: Session): Mocks {
  const m = session.mirror;
  const mocks = eveningMocks(m);
  m.setPlaces({ places: mocks.places });
  m.setStreets(mocks.streets);
  m.gaps.value = mocks.gaps;
  m.evening.value = mocks.evening;
  m.footfall.value = mocks.footfall;
  const t = mocks.evening.tally;
  if (m.town.value)
    m.town.value = {
      ...m.town.value,
      evenings: { out: t.out, grownups: t.grownups, average: Math.round(t.scoreSum / t.grownups) },
    };
  const live = session.inspect.bind(session);
  session.inspect = async (kind, id) => {
    const real = await live(kind, id);
    if (kind === 'resident' && real && 'r' in real) {
      const d = real as ResidentDetail;
      return { ...d, round: d.round ?? mockRound(m, id), evening: d.evening ?? { need: 58, score: 64 } };
    }
    return real;
  };
  return mocks;
}

function dist(a: number, b: number): number {
  return Math.abs((a % N) - (b % N)) + Math.abs(Math.floor(a / N) - Math.floor(b / N));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
