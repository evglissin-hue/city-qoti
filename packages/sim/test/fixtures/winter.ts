// The I3 winter fixture (C5.0): the village fixture on Winter day 2 of year 2, 10:00. The river froze
// this morning and it is snowing; there is firewood in store, but two households ran short and are
// cold; a Bath House stands on lane A; the Winter Hearth Feast is planned at the well gathering place
// with pies and cider on the menu; the Village's first winter trial is running; a Watch House has
// four members; the Field Guide has two pages.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../src/constants';
import type { EntityId, WorldState } from '../../src/contracts';
import { addDecorAt, placeFree, tickAt } from './seasonsPlace';
import { villageFixture, type VillageFixture } from './village';

export interface WinterFixture {
  state: WorldState;
  village: VillageFixture;
  bathHouse: EntityId;
  watchHouse: EntityId;
  /** Households cold this morning. */
  cold: [EntityId, EntityId];
  watch: EntityId[];
}

export function winterFixture(): WinterFixture {
  const village = villageFixture();
  const state = village.state;
  state.tick = tickAt(1, 3, 2, 10);
  state.weather = {
    today: 'snow',
    forecast: [
      { day: 1 * 24 + 18 + 2, kind: 'snow' },
      { day: 1 * 24 + 18 + 3, kind: 'cloudy' },
    ],
    events: [],
    river: { frozen: true, frozenTick: tickAt(1, 3, 2, 0) },
  };

  const bathHouse = placeFree(state, 'bath-house', 84, 46);
  const watchHouse = placeFree(state, 'watch-house', 90, 47);

  // Warmth: everyone burned their firewood today except two households, who ran short.
  const cold: [EntityId, EntityId] = [village.households[0]!, village.households[1]!];
  for (const h of state.households) {
    h.warmth = cold.includes(h.id)
      ? { burnedToday: 0, coldHours: 3, coldDays: 1 }
      : { burnedToday: 1, coldHours: 0, coldDays: 0 };
  }
  state.warmth = { winter: 1, coldHouseholdDays: 2, coldHouseholds: [...cold].sort((a, b) => a - b) };

  // The Winter Hearth Feast at the well gathering place, pies and cider on the menu, half put by.
  const pies = content.goodIndex.get('pies')!;
  const cider = content.goodIndex.get('cider')!;
  state.festival.plan = {
    festival: 'hearth-feast',
    season: 3,
    year: 1,
    site: { pattern: 'well-gathering-place', anchor: 52 * MAP_SIZE + 60 },
    menu: [
      [pies, 20],
      [cider, 16],
    ],
    reserved: [
      [pies, 10],
      [cider, 8],
    ],
    twist: 'snow-sculptures',
    music: 'none',
    musician: 0,
    by: 0,
    tick: tickAt(1, 3, 1, 9),
  };
  state.festival.pieces.push(addDecorAt(state, 'bonfire', 61.5, 54.5));
  for (const d of state.decor) if (state.festival.pieces.includes(d.id)) d.festival = { kept: false };

  state.trial = {
    kind: 'winter',
    charter: 'village',
    season: 3,
    year: 1,
    status: 'running',
    measured: [['coldHouseholdDays', 2]],
  };

  const watch = village.residents
    .map((id) => state.residents.find((r) => r.id === id)!)
    .filter((r) => r.stage === 'adult')
    .slice(0, 4)
    .map((r) => r.id)
    .sort((a, b) => a - b);
  state.watch = {
    members: watch,
    target: 4,
    training: 110,
    morale: 60,
    posture: [],
    duty: [watch[0]!],
    budget: 500,
  };
  for (const id of watch) state.residents.find((r) => r.id === id)!.watch = { dutyDay: 43, shakenUntil: 0 };

  state.nature.guide.push(
    { species: 'kingfisher', firstTick: tickAt(1, 1, 3, 7), seats: [0, 1], count: 2 },
    { species: 'robin', firstTick: tickAt(1, 2, 5, 8), seats: [0], count: 5 },
  );
  state.renown = {
    points: 14,
    level: 1,
    log: [{ tick: tickAt(1, 2, 6, 22), source: 'festival', points: 4 }],
  };
  state.seasons.bestStars = 4;
  state.festival.history.push({
    season: 2,
    year: 1,
    festival: 'harvest-supper',
    stars: 4,
    twist: 'harvest-display',
  });

  return { state, village, bathHouse: bathHouse.id, watchHouse: watchHouse.id, cold, watch };
}
