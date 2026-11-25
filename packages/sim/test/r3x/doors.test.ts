// R3X: the dead-end class behind the audit's gate, palisade and fishery cut-offs: a placement the
// rules accept must leave its door a way in (docs/spec/22-quality.md, Playability). Gates face along
// their road, a wall run that shuts one of its own pieces in is refused, a building that would seal a
// neighbor's only way to its door is refused (CUT_OFF), and a step on open water is no step.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import type { Rot4, WorldState } from '../../src/contracts';
import { canPlaceBuilding } from '../../src/rules/building';
import { footprintTiles } from '../../src/rules/footprint';
import { doorFront, doorReached, reachesTile } from '../../src/rules/reach';
import { canPaintWall, isWallDef, wouldEnclose } from '../../src/rules/wall';
import { insertBuilding } from '../../src/state/place';
import { reachOf, townReachesDoor } from '../../src/state/reach';
import { worldIndex } from '../../src/state/worldIndex';
import { rejection, run } from '../helpers';
import { villageFixture } from '../fixtures/village';

const S = MAP_SIZE;
const at = (x: number, z: number) => z * S + x;

function put(s: WorldState, def: string, x: number, z: number, rot: Rot4 = 0) {
  return insertBuilding(s, null, content.buildingById.get(def)!, x, z, rot, 0, { site: false });
}

/**
 * Independent of the sim's own door rule: some 4-neighbor of the step (or the step itself) is a
 * tile a walker stands on (reached by the flood from the town), not water without a road, not
 * inside the building's own footprint.
 */
function walkableWayIn(s: WorldState, b: { def: string; x: number; z: number; rot: Rot4 }): boolean {
  const r = worldIndex(s).reader;
  const reach = reachOf(s);
  const front = doorFront(b);
  const fx = front % S;
  const fz = Math.floor(front / S);
  if (r.water(fx, fz) > 0 && r.road(fx, fz) === 0) return false;
  if (reach[front]) return true;
  const own = new Set(
    footprintTiles(content.buildingById.get(b.def)!, b.x, b.z, b.rot).map(([x, z]) => at(x, z)),
  );
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const nx = fx + dx;
    const nz = fz + dz;
    if (nx < 0 || nz < 0 || nx >= S || nz >= S || own.has(at(nx, nz))) continue;
    if (reach[at(nx, nz)] && Math.abs(r.height(nx, nz) - r.height(fx, fz)) < 2) return true;
  }
  return false;
}

describe('a gate faces along its road (hazel #1174, #1460; oak #843; willow #613)', () => {
  it('turns to a road neighbor, so its door is on the lane, not on the lots beside it', () => {
    const s = villageFixture().state;
    const r = worldIndex(s).reader;
    // Lane A runs east to west at z 50: the tile south of (40, 50) is no road.
    expect(r.road(40, 50)).toBeGreaterThan(0);
    expect(r.road(40, 51)).toBe(0);
    // Lots standing south of the lane on both sides of the gate, on ground a terrace lower than the
    // lane (a cliff step from it): facing south, the door was a pocket the lane could not step into.
    for (const z of [51, 52]) s.map.height[at(40, z)] = 5;
    put(s, 'cottage', 38, 51);
    put(s, 'cottage', 41, 51);
    put(s, 'cottage', 40, 53);
    const plan = canPaintWall(worldIndex(s).reader, 'palisade', [[40, 50]], s.buildings, s.meta.valleyGate);
    expect(plan.ok).toBe(true);
    expect(plan.pieces).toEqual([[40, 50, 'gate']]);
    expect(plan.rots).toHaveLength(1);
    expect(plan.rots![0]).not.toBe(0);
    const gate = insertBuilding(s, null, content.buildingById.get('gate')!, 40, 50, plan.rots![0]!, 0, {
      site: false,
    });
    expect(townReachesDoor(s, gate)).toBe(true);
    expect(walkableWayIn(s, gate)).toBe(true);
    // Facing south, its door is a pocket between those lots: the lane's tile is the gate itself.
    expect(walkableWayIn(s, { def: 'gate', x: 40, z: 50, rot: 0 })).toBe(false);
  });

  it('wall.paint turns the gate it lays across a lane', () => {
    const s = villageFixture().state;
    s.economy.treasury = 1e9;
    for (const z of [51, 52]) s.map.height[at(40, z)] = 5;
    put(s, 'cottage', 38, 51);
    put(s, 'cottage', 41, 51);
    put(s, 'cottage', 40, 53);
    expect(rejection(run(s, { t: 'wall.paint', def: 'palisade', tiles: [[40, 50]] }))).toBeUndefined();
    const gate = s.buildings.find((b) => b.def === 'gate' && b.x === 40 && b.z === 50)!;
    expect(gate.rot).not.toBe(0);
    expect(townReachesDoor(s, gate)).toBe(true);
  });
});

describe('a wall piece the run shuts in is refused (hazel #1455, #1917 to #1919, #1925)', () => {
  it('CUT_OFF when no way the piece could face has a way in', () => {
    const s = villageFixture().state;
    // A pit: the four steps around (60, 110) stand a terrace above the ground, cut off from it.
    for (const [x, z] of [
      [59, 110],
      [61, 110],
      [60, 109],
      [60, 111],
    ] as const)
      s.map.height[at(x, z)] = 5;
    const plan = canPaintWall(worldIndex(s).reader, 'palisade', [[60, 110]], s.buildings, s.meta.valleyGate);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe('CUT_OFF');
    expect(plan.firstBadTile).toEqual([60, 110]);
    s.economy.treasury = 1e9;
    expect(rejection(run(s, { t: 'wall.paint', def: 'palisade', tiles: [[60, 110]] }))).toBe('CUT_OFF');
    const open = villageFixture().state;
    expect(
      canPaintWall(worldIndex(open).reader, 'palisade', [[60, 110]], open.buildings, open.meta.valleyGate).ok,
    ).toBe(true);
  });

  it('a piece in a ring turns off the next piece of its run (hazel #1917)', () => {
    const s = villageFixture().state;
    // A vertical run: facing south, each piece's step would be the next piece of the run.
    const tiles: [number, number][] = [60, 61, 62, 63].map((z): [number, number] => [60, z + 50]);
    const plan = canPaintWall(worldIndex(s).reader, 'palisade', tiles, s.buildings, s.meta.valleyGate);
    expect(plan.ok).toBe(true);
    expect(plan.rots).toHaveLength(4);
    s.economy.treasury = 1e9;
    expect(rejection(run(s, { t: 'wall.paint', def: 'palisade', tiles }))).toBeUndefined();
    for (const b of s.buildings.filter((q) => q.def === 'palisade' && q.x === 60 && q.z > 100)) {
      expect(townReachesDoor(s, b)).toBe(true);
      expect(walkableWayIn(s, b)).toBe(true);
    }
  });

  it('a ring of palisades with its gates leaves every piece a way in', () => {
    const s = villageFixture().state;
    s.economy.treasury = 1e9;
    const tiles: [number, number][] = [];
    for (let x = 30; x <= 36; x++) tiles.push([x, 106], [x, 112]);
    for (let z = 107; z <= 111; z++) tiles.push([30, z], [36, z]);
    expect(rejection(run(s, { t: 'wall.paint', def: 'palisade', tiles }))).toBeUndefined();
    for (const b of s.buildings.filter((q) => isWallDef(q.def))) expect(walkableWayIn(s, b)).toBe(true);
  });
});

describe('a building that seals a neighbor in is refused (hazel #201)', () => {
  /** A fishery on open ground whose step has a single way in, and that way. */
  function pocketed() {
    const s = villageFixture().state;
    s.economy.treasury = 1e9;
    const fish = put(s, 'fishery', 60, 100, 2);
    const front = doorFront(fish);
    const fx = front % S;
    const fz = Math.floor(front / S);
    const own = new Set(
      footprintTiles(content.buildingById.get('fishery')!, 60, 100, 2).map(([x, z]) => at(x, z)),
    );
    const around = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const
    )
      .map(([dx, dz]) => [fx + dx, fz + dz] as [number, number])
      .filter(([x, z]) => !own.has(at(x, z)));
    expect(around).toHaveLength(3);
    const [way, ...shut] = around as [[number, number], ...[number, number][]];
    for (const [x, z] of shut) put(s, 'palisade', x, z);
    return { s, fish, way };
  }

  it('the rule names the fishery when a footprint covers its only way in', () => {
    const { s, fish, way } = pocketed();
    expect(townReachesDoor(s, fish)).toBe(true);
    // The fishery, and any wall piece whose own step the way also served.
    expect(
      wouldEnclose(worldIndex(s).reader, [[way[0], way[1], 'well']], s.buildings, s.meta.valleyGate),
    ).toContain(fish.id);
  });

  it('build.place says CUT_OFF, and builds where the way stays open', () => {
    const { s, way } = pocketed();
    expect(rejection(run(s, { t: 'build.place', def: 'well', x: way[0], z: way[1], rot: 0 }))).toBe(
      'CUT_OFF',
    );
    expect(s.buildings.some((b) => b.def === 'well' && b.x === way[0] && b.z === way[1])).toBe(false);
    expect(
      rejection(run(s, { t: 'build.place', def: 'well', x: way[0] + 6, z: way[1] + 6, rot: 0 })),
    ).toBeUndefined();
  });
});

describe('a step on open water is no step', () => {
  it('a fishery whose door faces the river has no way in, though a bank tile is reached', () => {
    const s = villageFixture().state;
    const r = worldIndex(s).reader;
    // The river is x 100 and 101: a fishery on the bank (x 98 to 99), its door facing east.
    const fish = { def: 'fishery', x: 98, z: 100, rot: 3 as Rot4 };
    expect(canPlaceBuilding(r, content.buildingById.get('fishery')!, 98, 100, 3).ok).toBe(true);
    const f = doorFront(fish);
    expect(r.water(f % S, Math.floor(f / S))).toBeGreaterThan(0);
    const everywhere = new Uint8Array(S * S).fill(1);
    expect(doorReached(everywhere, r, fish)).toBe(false);
    expect(reachesTile(everywhere, r, f)).toBe(false);
    // Facing the land it is fine.
    expect(doorReached(everywhere, r, { ...fish, rot: 1 })).toBe(true);
  });
});

describe('every building and wall piece the rules accept keeps its door (class check)', () => {
  it('samples each def at spots and turns on the village map', () => {
    const s = villageFixture().state;
    s.economy.treasury = 1e9;
    let accepted = 0;
    let refusedCut = 0;
    const defs = [...content.buildingById.values()].filter((d) => !isWallDef(d.id));
    for (const def of defs) {
      let mine = 0;
      for (let z = 96; z < 176 && mine < 3; z += 5) {
        for (let x = 20; x < 96 && mine < 3; x += 7) {
          for (const rot of [0, 1, 2, 3] as Rot4[]) {
            if (!canPlaceBuilding(worldIndex(s).reader, def, x, z, rot).ok) continue;
            const why = rejection(run(s, { t: 'build.place', def: def.id, x, z, rot }));
            if (why === 'CUT_OFF') refusedCut++;
            if (why) continue;
            const b = s.buildings[s.buildings.length - 1]!;
            expect(b.def).toBe(def.id);
            expect(walkableWayIn(s, b), `${def.id} at ${x},${z} rot ${rot}`).toBe(true);
            accepted++;
            mine++;
            break;
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(10);
    // Nothing already standing was shut off by what came after.
    for (const b of s.buildings) expect(walkableWayIn(s, b), `${b.def} #${b.id}`).toBe(true);
    expect(refusedCut).toBeGreaterThanOrEqual(0);
  });

  it('wall runs: every piece laid has a way in, across rings, lines and lane crossings', () => {
    const s = villageFixture().state;
    s.economy.treasury = 1e9;
    const runs: [number, number][][] = [];
    for (let k = 0; k < 6; k++) {
      const tiles: [number, number][] = [];
      const x0 = 24 + k * 10;
      for (let x = x0; x < x0 + 6; x++) tiles.push([x, 44], [x, 54]);
      for (let z = 45; z < 54; z++) tiles.push([x0, z], [x0 + 5, z]);
      runs.push(tiles);
    }
    runs.push(Array.from({ length: 30 }, (_, i): [number, number] => [64, 40 + i]));
    let laid = 0;
    for (const tiles of runs) {
      for (const def of ['palisade', 'gate']) {
        if (rejection(run(s, { t: 'wall.paint', def, tiles }))) continue;
        laid++;
      }
    }
    expect(laid).toBeGreaterThan(0);
    for (const b of s.buildings.filter((q) => isWallDef(q.def)))
      expect(walkableWayIn(s, b), `${b.def} #${b.id} at ${b.x},${b.z}`).toBe(true);
  });
});
