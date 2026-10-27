// The I3 threat fixture (C5.0): the village fixture on Autumn day 2 of year 1, 10:00. Storehouse A
// stands behind a palisade with a gate in front of its door; a watchtower looks north; lanterns line
// lane A; a Medium raid is telegraphed from the northern forest edge for day 4 at dusk, two days
// out, with the Watch posted at storehouse A and the market. `raidAtDusk()` is the same valley on
// day 4 at 18:30 with six raiders on the map and the bell rung.
import { MAP_SIZE, RAIDER_MORALE } from '../../src/constants';
import type { EntityId, WorldState } from '../../src/contracts';
import { addDecorAt, placeFree, tickAt } from './seasonsPlace';
import { villageFixture, type VillageFixture } from './village';

export interface ThreatFixture {
  state: WorldState;
  village: VillageFixture;
  palisade: EntityId[];
  gate: EntityId;
  watchtower: EntityId;
  watchHouse: EntityId;
  lanterns: EntityId[];
  watch: EntityId[];
}

const S = MAP_SIZE;

export function threatFixture(): ThreatFixture {
  const village = villageFixture();
  const state = village.state;
  state.tick = tickAt(0, 2, 2, 10);
  const storeA = state.buildings.find((b) => b.id === village.b.storehouses[0])!;

  // A palisade round storehouse A's back and sides, and a gate on the lane side.
  const palisade: EntityId[] = [];
  for (let x = 38; x <= 42; x++) palisade.push(placeFree(state, 'palisade', x, 45).id);
  for (const x of [38, 42])
    for (let z = 46; z <= 48; z++) palisade.push(placeFree(state, 'palisade', x, z).id);
  const gate = placeFree(state, 'gate', 38, 49);
  gate.rt!.open = true;
  gate.rt!.hp = 100;
  for (const id of palisade) state.buildings.find((b) => b.id === id)!.rt!.hp = 100;
  const watchtower = placeFree(state, 'watchtower', 60, 44);
  const watchHouse = placeFree(state, 'watch-house', 90, 47);

  const lanterns: EntityId[] = [];
  for (let x = 36; x <= 94; x += 6) lanterns.push(addDecorAt(state, 'lantern', x + 0.5, 51.2));

  const watch = village.residents
    .map((id) => state.residents.find((r) => r.id === id)!)
    .filter((r) => r.stage === 'adult')
    .slice(0, 5)
    .map((r) => r.id)
    .sort((a, b) => a - b);
  const stall = state.buildings.find((b) => b.id === village.b.stalls[0])!;
  state.watch = {
    members: watch,
    target: 6,
    training: 120,
    morale: 70,
    posture: [(storeA.z + 2) * S + storeA.x + 1, (stall.z + 1) * S + stall.x],
    duty: [],
    budget: 800,
  };
  state.threats = {
    pressure: 1150,
    deterrence: { walls: 220, towers: 140, lanterns: 90, watch: 300 },
    scheduled: {
      season: 2,
      year: 0,
      day: 4,
      side: 'n',
      band: 'medium',
      strength: 6,
      telegraphTick: tickAt(0, 2, 2, 6),
      signs: ['tracks', 'crows'],
    },
    wolves: [],
    history: [],
    captives: [],
  };
  return {
    state,
    village,
    palisade,
    gate: gate.id,
    watchtower: watchtower.id,
    watchHouse: watchHouse.id,
    lanterns,
    watch,
  };
}

/** The same valley on day 4 at 18:30: six raiders at the northern edge and the bell rung. */
export function raidAtDusk(): ThreatFixture & { raiders: EntityId[] } {
  const f = threatFixture();
  const state = f.state;
  state.tick = tickAt(0, 2, 4, 18) + 100;
  const storeA = f.village.b.storehouses[0];
  const raiders: EntityId[] = [];
  const list = [];
  for (let i = 0; i < 6; i++) {
    const id = state.nextId++;
    raiders.push(id);
    list.push({
      id,
      tile: 1 * S + 58 + i,
      move: null,
      morale: RAIDER_MORALE,
      load: [] as [number, number][],
      state: 'approach' as const,
      target: storeA,
    });
  }
  state.raid = {
    id: state.nextId++,
    startTick: tickAt(0, 2, 4, 18),
    side: 'n',
    band: 'medium',
    raiders: list,
    watch: f.watch.map((resident) => ({ resident, state: 'guard' as const, morale: 10 })),
    bell: true,
    lanterns: false,
  };
  return { ...f, raiders };
}
