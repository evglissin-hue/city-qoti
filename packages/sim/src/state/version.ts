import { content } from '@qoti/content';
import { DAYS_PER_SEASON, LEDGER_CATEGORIES, MAP_SIZE, NEED_IDS, RIVER_FREEZE_DAY } from '../constants';
import { RNG_STREAMS, seedStream } from '../rng/streams';
import { base64ToBytes, bytesToBase64, bytesToWords, wordsToBytes } from './base64';
import { emptyHamletSlices } from './hamlet';
import { emptySeasonsSlices, markFloodplain, seasonAt } from './seasons';
import { emptyVillageSlices, lockedInnovations, unstartedStories } from './village';

/** Bump whenever the shape of saved state changes, and add a migration with a test. */
export const SAVE_VERSION = 4;

export type SaveObject = Record<string, unknown> & { saveVersion: number };
export type Migration = (save: SaveObject) => SaveObject;

// Migration registry: migrations.get(n) upgrades a save from version n to n + 1.
// One line per migration, in version order.
// prettier-ignore
export const migrations: ReadonlyMap<number, Migration> = new Map<number, Migration>([
  [1, toV2],
  [2, toV3],
  [3, toV4],
]);

/**
 * v1 (I0) to v2 (I1 contracts): empty hamlet slices, zeroed charm, field and crop layers. I0
 * valleys stay sandbox valleys, so their buildings get no runtime.
 */
function toV2(save: SaveObject): SaveObject {
  const n = MAP_SIZE * MAP_SIZE;
  const zeros8 = bytesToBase64(new Uint8Array(n));
  const zeros32 = bytesToBase64(new Uint8Array(n * 4));
  const map = { ...(save.map as Record<string, string>) };
  for (const name of [
    'charm',
    'charmNature',
    'charmComfort',
    'charmLight',
    'charmView',
    'charmNoise',
    'crop',
  ]) {
    map[name] = zeros8;
  }
  map.fieldOwner = zeros32;
  return { ...save, ...emptyHamletSlices(), map, saveVersion: 2 };
}

type Obj = Record<string, unknown>;

/** A deep copy of plain save data, so migrations never edit their input. */
function clone(v: unknown): unknown {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** Pads an array (in place, if it is one) to `n` entries with `fill`. */
function pad<T>(v: unknown, n: number, fill: T): void {
  if (!Array.isArray(v)) return;
  while (v.length < n) v.push(fill);
}

function padPeriod(p: unknown, goods: number, categories: number): void {
  if (!p || typeof p !== 'object') return;
  const period = p as Obj;
  pad(period.money, categories, 0);
  pad(period.produced, goods, 0);
  pad(period.consumed, goods, 0);
}

/**
 * v2 (I1) to v3 (I2 contracts): per-good arrays grow to the I2 goods, ledger periods to the I2
 * categories, residents' needs to the tier needs (at 100: an I1 valley's Settlers have none of
 * them), the money counter starts at 0, new map layers start empty, and the I2 slices start
 * neutral: base prices, default levers, no lots, Hamlet rank, everything locked. I1 valleys keep
 * playing as Settlers until they zone, trade and claim the Village Charter.
 */
function toV3(save: SaveObject): SaveObject {
  const goods = content.goods.length;
  const categories = LEDGER_CATEGORIES.length;
  const needs = NEED_IDS.length;
  const n = MAP_SIZE * MAP_SIZE;
  const map = { ...(save.map as Record<string, string>) };
  map.lot = bytesToBase64(new Uint8Array(n * 4));
  map.traffic = bytesToBase64(new Uint8Array(n));
  map.wear = bytesToBase64(new Uint8Array(n));

  const economy = clone(save.economy) as Obj;
  pad(economy.forSale, goods, false);
  for (const k of ['today', 'yesterday', 'season', 'lastSeason']) padPeriod(economy[k], goods, categories);
  for (const day of (economy.stockHistory as unknown[]) ?? []) pad(day, goods, 0);
  pad(economy.everProduced, goods, 0);
  economy.external = 0;

  const buildings = clone(save.buildings) as Obj[];
  for (const b of buildings) {
    const rt = b.rt as Obj | undefined;
    if (!rt) continue;
    for (const k of ['input', 'output', 'store', 'reservedIn', 'reservedOut', 'producedToday']) {
      pad(rt[k], goods, 0);
    }
    const c = rt.construction as Obj | null | undefined;
    if (c) {
      pad(c.needs, goods, 0);
      pad(c.delivered, goods, 0);
    }
  }
  const households = clone(save.households) as Obj[];
  for (const h of households) pad(h.pantry, goods, 0);
  const residents = clone(save.residents) as Obj[];
  for (const r of residents) pad(r.needs, needs, 100);

  return {
    ...save,
    ...emptyVillageSlices(),
    map,
    economy,
    buildings,
    households,
    residents,
    saveVersion: 3,
  };
}

/** Firewood the County sends each household when a valley is migrated in autumn or winter (C5.0). */
export const MIGRATION_FIREWOOD = DAYS_PER_SEASON;

/**
 * v3 (I2) to v4 (I3 contracts): per-good arrays grow to the I3 goods (base prices, no caps, open
 * trade), ledger periods to the I3 categories, the new RNG streams (nature, festival) are seeded
 * from the valley's seed, every valley gets its floodplain flag, the I3 slices start neutral
 * (clear weather, no festival, no threats), and the two new story arcs and two innovations are
 * added unstarted and locked. P53, a gentle update: the river is frozen if the date says so; a
 * valley migrated in autumn or winter gets a County gift of firewood for every household, so
 * nobody is cold on the first night; a valley already at Village rank keeps it, and its trial is
 * the next winter. The first days guide is over for every migrated valley.
 */
function toV4(save: SaveObject): SaveObject {
  const goods = content.goods.length;
  const categories = LEDGER_CATEGORIES.length;
  const n = MAP_SIZE * MAP_SIZE;

  // RNG: the old streams keep their words; appended streams are seeded like a new valley's.
  const old = base64ToBytes(save.rng as string);
  const words = new Uint32Array(RNG_STREAMS.length * 4);
  words.set(bytesToWords(old, new Uint32Array(old.length / 4)));
  for (let i = old.length / 16; i < RNG_STREAMS.length; i++) {
    seedStream(words, i * 4, save.seed as string, RNG_STREAMS[i]!);
  }
  const rng = bytesToBase64(wordsToBytes(words));

  // The floodplain, from heights and water.
  const map = { ...(save.map as Record<string, string>) };
  const layer = (name: string) => {
    const bytes = base64ToBytes(map[name]!);
    if (bytes.length !== n) throw new Error(`Layer ${name} has the wrong size`);
    return bytes;
  };
  const flags = layer('flags');
  markFloodplain({ height: layer('height'), water: layer('water'), flags });
  map.flags = bytesToBase64(flags);

  const economy = clone(save.economy) as Obj;
  pad(economy.forSale, goods, false);
  for (const k of ['today', 'yesterday', 'season', 'lastSeason']) padPeriod(economy[k], goods, categories);
  for (const day of (economy.stockHistory as unknown[]) ?? []) pad(day, goods, 0);
  pad(economy.everProduced, goods, 0);

  const firewood = content.goodIndex.get('firewood')!;
  const { season, year, day } = seasonAt(save.tick as number);
  const gift = season >= 2;
  const buildings = clone(save.buildings) as Obj[];
  for (const b of buildings) {
    const rt = b.rt as Obj | undefined;
    if (!rt) continue;
    for (const k of ['input', 'output', 'store', 'reservedIn', 'reservedOut', 'producedToday']) {
      pad(rt[k], goods, 0);
    }
    pad(rt.upgrade, goods, 0);
    const c = rt.construction as Obj | null | undefined;
    if (c) {
      pad(c.needs, goods, 0);
      pad(c.delivered, goods, 0);
    }
  }
  const households = clone(save.households) as Obj[];
  for (const h of households) {
    pad(h.pantry, goods, 0);
    if (gift) (h.pantry as number[])[firewood]! += MIGRATION_FIREWOOD;
  }

  const market = clone(save.market) as Obj;
  const base = content.goods.map((g) => g.basePrice);
  const padTo = (v: unknown, fill: (i: number) => number | boolean): void => {
    if (!Array.isArray(v)) return;
    while (v.length < goods) v.push(fill(v.length));
  };
  padTo(market.prices, (i) => base[i]!);
  for (const k of ['demand', 'demandToday', 'cover']) padTo(market[k], () => 0);
  for (const dayPrices of (market.history as unknown[]) ?? []) padTo(dayPrices, (i) => base[i]!);
  const levers = clone(save.levers) as Obj;
  padTo(levers.priceCaps, () => 0);
  padTo(levers.subsidies, () => 0);
  padTo(levers.exportBans, () => false);
  const trade = clone(save.trade) as Obj;
  for (const nb of (trade.neighbors as Obj[]) ?? []) {
    padTo(nb.drift, () => 1000);
    padTo(nb.impact, () => 1000);
  }

  // New arcs and innovations, unstarted and locked, beside the old ones.
  const stories = clone(save.stories) as { arc: string }[];
  for (const s of unstartedStories()) if (!stories.some((x) => x.arc === s.arc)) stories.push(s);
  stories.sort((a, b) => (a.arc < b.arc ? -1 : a.arc > b.arc ? 1 : 0));
  const innovations = clone(save.innovations) as { id: string }[];
  for (const s of lockedInnovations()) if (!innovations.some((x) => x.id === s.id)) innovations.push(s);
  innovations.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const slices = emptySeasonsSlices();
  if (season === 3 && day >= RIVER_FREEZE_DAY) {
    slices.weather.river = { frozen: true, frozenTick: save.tick as number };
  }
  const charter = save.charter as { rank?: string } | undefined;
  if (charter?.rank && charter.rank !== 'hamlet') {
    // The next winter: this one if it has not begun, else next year's.
    slices.trial = {
      kind: 'winter',
      charter: 'village',
      season: 3,
      year: season === 3 ? year + 1 : year,
      status: 'upcoming',
      measured: [],
    };
  }

  return {
    ...save,
    ...slices,
    rng,
    map,
    economy,
    buildings,
    households,
    market,
    levers,
    trade,
    stories,
    innovations,
    saveVersion: 4,
  };
}

/** Brings a parsed save up to SAVE_VERSION, one migration at a time. */
export function migrateSave(
  save: SaveObject,
  registry: ReadonlyMap<number, Migration> = migrations,
): SaveObject {
  if (typeof save.saveVersion !== 'number' || !Number.isInteger(save.saveVersion)) {
    throw new Error('Not a City Qoti save: missing saveVersion');
  }
  if (save.saveVersion > SAVE_VERSION) {
    throw new Error(`Save version ${save.saveVersion} is newer than this game (${SAVE_VERSION})`);
  }
  let current = save;
  while (current.saveVersion < SAVE_VERSION) {
    const step = registry.get(current.saveVersion);
    if (!step) throw new Error(`No migration from save version ${current.saveVersion}`);
    const next = step(current);
    if (next.saveVersion !== current.saveVersion + 1) {
      throw new Error(
        `Migration from ${current.saveVersion} must produce version ${current.saveVersion + 1}`,
      );
    }
    current = next;
  }
  return current;
}
