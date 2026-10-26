// New households (docs/spec/11-residents.md, Names and Arrival). Every draw comes from the
// residents RNG stream, so both laptops meet the same family.
import { content } from '@qoti/content';
import { DAYS_PER_YEAR, NEED_IDS, TICKS_PER_DAY } from '../../constants';
import type { EntityId, Household, LifeStage, Resident, Rng, WorldState } from '../../contracts';
import { goodsArray } from '../../state/hamlet';
import { traitsCompatible } from './traits';
import { dayIndex } from './time';

/** Household makeup (tune): single 25%, couple 30%, family with children 35%, elder pair 10%. */
export type Makeup = 'single' | 'couple' | 'family' | 'elders';

export function pickMakeup(rng: Rng): Makeup {
  const roll = rng.int(100);
  if (roll < 25) return 'single';
  if (roll < 55) return 'couple';
  if (roll < 90) return 'family';
  return 'elders';
}

/** Life stages for a makeup, fitted to the home's capacity (at least one grown-up). */
export function stagesFor(makeup: Makeup, rng: Rng, capacity: number): LifeStage[] {
  const cap = Math.max(1, capacity);
  switch (makeup) {
    case 'single':
      return [rng.chance(0.3) ? 'young' : 'adult'];
    case 'couple':
      return cap < 2 ? ['adult'] : ['adult', rng.chance(0.25) ? 'young' : 'adult'];
    case 'elders':
      return cap < 2 ? ['elder'] : ['elder', 'elder'];
    case 'family': {
      const out: LifeStage[] = cap < 2 ? ['adult'] : ['adult', 'adult'];
      const kids = Math.min(cap - out.length, rng.range(1, 3));
      for (let i = 0; i < kids; i++) out.push(rng.chance(0.3) ? 'young' : 'child');
      return out;
    }
  }
}

/** Age in days for a stage: child 0 to 3 years, young 3 to 5, adult 5 to 15, elder 15+. */
export function ageDaysFor(stage: LifeStage, rng: Rng): number {
  const Y = DAYS_PER_YEAR;
  switch (stage) {
    case 'child':
      return rng.range(Math.floor(Y / 3), 3 * Y - 1);
    case 'young':
      return rng.range(3 * Y, 5 * Y - 1);
    case 'adult':
      return rng.range(5 * Y, 15 * Y - 1);
    case 'elder':
      return rng.range(15 * Y, 20 * Y);
  }
}

/** Stage for an age in days. */
export function stageForAge(days: number): LifeStage {
  const Y = DAYS_PER_YEAR;
  if (days < 3 * Y) return 'child';
  if (days < 5 * Y) return 'young';
  if (days < 15 * Y) return 'adult';
  return 'elder';
}

/** A family name no current household uses, when one is left. */
export function pickFamily(state: WorldState, rng: Rng): string {
  const pool = content.familyNames;
  const used = new Set(state.households.map((h) => h.family));
  const start = rng.int(pool.length);
  for (let k = 0; k < pool.length; k++) {
    const name = pool[(start + k) % pool.length]!;
    if (!used.has(name)) return name;
  }
  return pool[start]!;
}

/** A given name of the species whose pair with `family` no current resident has. */
export function pickGiven(rng: Rng, species: string, family: string, taken: Set<string>): string {
  const pool = content.speciesById.get(species)?.givenNames ?? ['Sam'];
  const start = rng.int(pool.length);
  for (let k = 0; k < pool.length; k++) {
    const given = pool[(start + k) % pool.length]!;
    if (!taken.has(`${given} ${family}`)) return given;
  }
  // Every name in the pool is taken in this family: borrow from the whole valley's pools.
  for (const sp of content.species) {
    for (const given of sp.givenNames) if (!taken.has(`${given} ${family}`)) return given;
  }
  return pool[start]!;
}

/** Two compatible traits (no clash, no repeat). */
export function pickTraits(rng: Rng): [string, string] {
  const all = content.traits;
  const a = all[rng.int(all.length)]!.id;
  const ok = all.filter((t) => traitsCompatible(a, t.id));
  const b = ok[rng.int(ok.length)]!.id;
  return [a, b];
}

/** Species weights: every species is welcome; the valley's best home for each tips the scales. */
export function pickSpecies(rng: Rng, weights: readonly [species: string, weight: number][]): string {
  let total = 0;
  for (const [, w] of weights) total += Math.max(1, w);
  let roll = rng.float() * total;
  for (const [id, w] of weights) {
    roll -= Math.max(1, w);
    if (roll < 0) return id;
  }
  return weights[weights.length - 1]![0];
}

export interface NewHousehold {
  species: string;
  stages: LifeStage[];
  homeId: EntityId;
  /** Where the members stand: the valley gate for arrivals. */
  tile: number;
  /** The building they are in (0 outdoors). */
  inside: EntityId;
  activity: Resident['activity'];
}

/** Starting needs of a newcomer, NEED_IDS order: fed, watered, housed, a stranger, curious. */
const NEWCOMER_NEEDS: Record<string, number> = {
  food: 75,
  water: 70,
  shelter: 100,
  belonging: 40,
  beauty: 50,
};

/** Builds a household and its residents into state (sorted by id) and returns them. */
export function createHousehold(
  state: WorldState,
  rng: Rng,
  spec: NewHousehold,
): { household: Household; members: Resident[] } {
  const today = dayIndex(state.tick);
  const family = pickFamily(state, rng);
  const taken = new Set(state.residents.map((r) => `${r.given} ${r.family}`));
  const household: Household = {
    id: state.nextId++,
    family,
    members: [],
    homeId: spec.homeId,
    pantry: goodsArray(),
    recentFoods: [],
    savings: 0,
    tier: 'settler',
    arrivedDay: today,
    lowMoodDays: 0,
  };
  // A welcome hamper: a day's food for everyone, half bread and half vegetables.
  const bread = content.goodIndex.get('bread');
  const veg = content.goodIndex.get('vegetables');
  for (let i = 0; i < spec.stages.length; i++) {
    const g = i % 2 === 0 ? bread : veg;
    if (g !== undefined) household.pantry[g]! += 1;
  }
  const members: Resident[] = [];
  for (const stage of spec.stages) {
    const given = pickGiven(rng, spec.species, family, taken);
    taken.add(`${given} ${family}`);
    const age = ageDaysFor(stage, rng);
    const r: Resident = {
      id: state.nextId++,
      given,
      family,
      species: spec.species,
      stage,
      bornDay: today - age,
      traits: pickTraits(rng),
      householdId: household.id,
      jobId: 0,
      tier: 'settler',
      mood: 70,
      needs: NEED_IDS.map((n) => NEWCOMER_NEEDS[n] ?? 50),
      modifiers: [
        { kind: 'fresh-start', value: 10, from: state.tick, until: state.tick + 2 * TICKS_PER_DAY },
      ],
      bond: 0,
      friends: [],
      activity: spec.activity,
      move: null,
      tile: spec.tile,
      inside: spec.inside,
      carry: null,
      wishId: 0,
      history: [{ day: today, kind: 'arrived' }],
      flags: 0,
      look: rng.next() >>> 0,
    };
    members.push(r);
    household.members.push(r.id);
  }
  // The first two grown-ups of a couple, a family or an elder pair arrive married (C4D).
  const [a, b] = members;
  if (a && b && a.stage !== 'child' && b.stage !== 'child') {
    a.partner = b.id;
    b.partner = a.id;
    a.marriedDay = Math.max(1, today);
    b.marriedDay = Math.max(1, today);
  }
  state.households.push(household);
  for (const r of members) state.residents.push(r);
  return { household, members };
}
