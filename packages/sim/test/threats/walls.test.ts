// C5D: wall runs, gates, WOULD_ENCLOSE, routes through gates and the bell (14-challenge.md, Defenses).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { rngFromSeed } from '../../src/rng/streams';
import { doorFront, reachesTile, townReach } from '../../src/rules/reach';
import { canPaintWall, gateTiles, mustReach } from '../../src/rules/wall';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { worldIndex } from '../../src/state/worldIndex';
import { pathBetween } from '../../src/systems/movement/paths';
import { walkable } from '../../src/systems/movement/grid';
import { scheduleOverride } from '../../src/systems/residents/overrides';
import { moneyInside } from '../../src/systems/economy/money';
import { rejection, run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { raidAtDusk, threatFixture } from '../fixtures/threat';
import { villageFixture } from '../fixtures/village';

const S = MAP_SIZE;

/** Every home, workplace and storehouse door the valley gate reaches (gates open). */
function cutOff(s: WorldState): number[] {
  const r = worldIndex(s).reader;
  const g = s.meta.valleyGate;
  const reach = townReach(r, [g[1] * S + g[0]], gateTiles(s.buildings));
  return s.buildings.filter((b) => mustReach(b.def) && !reachesTile(reach, r, doorFront(b))).map((b) => b.id);
}

function ring(cx: number, cz: number, rad: number): [number, number][] {
  const out: [number, number][] = [];
  for (let x = cx - rad; x <= cx + rad; x++) out.push([x, cz - rad], [x, cz + rad]);
  for (let z = cz - rad + 1; z < cz + rad; z++) out.push([cx - rad, z], [cx + rad, z]);
  return out;
}

describe('wall runs', () => {
  it('paint a construction site a tile, priced per piece, money kept', () => {
    const s = villageFixture().state;
    const before = moneySnapshot(s);
    const inside = moneyInside(s);
    const tiles: [number, number][] = [
      [20, 100],
      [21, 100],
      [22, 100],
    ];
    expect(rejection(run(s, { t: 'wall.paint', def: 'palisade', tiles }))).toBeUndefined();
    const pieces = s.buildings.filter((b) => b.def === 'palisade');
    expect(pieces).toHaveLength(3);
    expect(pieces.every((b) => b.stage === 'construction' && b.rt!.hp === 100)).toBe(true);
    expect(inside - moneyInside(s)).toBe(3 * content.buildingById.get('palisade')!.cost!.coins! * 100);
    expectMoneyInvariant(before, s);
    // Painting over the same tiles skips the pieces already there.
    expect(rejection(run(s, { t: 'wall.paint', def: 'palisade', tiles }))).toBe('OCCUPIED');
    // Removing refunds the unfinished pieces.
    expect(rejection(run(s, { t: 'wall.remove', tiles }))).toBeUndefined();
    expect(s.buildings.filter((b) => b.def === 'palisade')).toHaveLength(0);
    expect(moneyInside(s)).toBe(inside);
  });

  it('puts a gate where a run crosses a road', () => {
    const s = villageFixture().state;
    let road = -1;
    for (let i = 0; i < S * S && road < 0; i++)
      if (s.map.road[i] && !s.map.water[i] && !s.map.occupant[i]) road = i;
    const x = road % S;
    const z = Math.floor(road / S);
    const plan = canPaintWall(worldIndex(s).reader, 'palisade', [[x, z]], s.buildings, s.meta.valleyGate);
    expect(plan.ok).toBe(true);
    expect(plan.pieces).toEqual([[x, z, 'gate']]);
  });

  it('refuses a run that would close a home in (WOULD_ENCLOSE), and a ring with a gate is fine', () => {
    const f = threatFixture();
    const s = f.state;
    const home = findById(s.buildings, f.village.b.cottages[0]!)!;
    const door = doorFront(home);
    const tiles = ring(door % S, Math.floor(door / S), 1).filter(([x, z]) => !s.map.occupant[z * S + x]);
    const plan = canPaintWall(worldIndex(s).reader, 'palisade', tiles, s.buildings, s.meta.valleyGate);
    if (plan.ok) {
      // The ring crossed a road: gates keep it open.
      expect(plan.pieces.some(([, , d]) => d === 'gate')).toBe(true);
    } else {
      expect(plan.reason).toBe('WOULD_ENCLOSE');
      expect(plan.enclosed).toContain(home.id);
      expect(rejection(run(s, { t: 'wall.paint', def: 'palisade', tiles }))).toBe('WOULD_ENCLOSE');
    }
    // A palisade placed by hand checks too.
    expect(cutOff(s)).toEqual([]);
  });

  it('never encloses a home, workplace or storehouse (property over random runs)', () => {
    const s = villageFixture().state;
    s.economy.treasury = 1e9;
    const rng = rngFromSeed('walls');
    const builtIds = s.buildings.filter((b) => mustReach(b.def)).map((b) => b.id);
    let accepted = 0;
    let refused = 0;
    for (let k = 0; k < 120; k++) {
      const b = findById(s.buildings, builtIds[rng.int(builtIds.length)]!)!;
      const kind = rng.int(3);
      let tiles: [number, number][];
      if (kind === 0) tiles = ring(b.x + 1, b.z + 1, 2 + rng.int(3));
      else if (kind === 1) {
        const len = 4 + rng.int(12);
        const z = b.z - 2 + rng.int(6);
        tiles = Array.from({ length: len }, (_, i) => [b.x - 4 + i, z] as [number, number]);
      } else {
        const len = 4 + rng.int(12);
        const x = b.x - 2 + rng.int(6);
        tiles = Array.from({ length: len }, (_, i) => [x, b.z - 4 + i] as [number, number]);
      }
      tiles = tiles.filter(([x, z]) => x > 0 && z > 0 && x < S - 1 && z < S - 1);
      const plan = canPaintWall(worldIndex(s).reader, 'palisade', tiles, s.buildings, s.meta.valleyGate);
      if (!plan.ok) {
        refused++;
        continue;
      }
      for (const [x, z, d] of plan.pieces) {
        const nb = insertBuilding(s, null, content.buildingById.get(d)!, x, z, 0, 0, { site: false });
        if (d === 'gate') nb.rt!.open = true;
      }
      accepted++;
      expect(cutOff(s), `run ${k}`).toEqual([]);
    }
    expect(accepted).toBeGreaterThan(10);
    expect(refused).toBeGreaterThan(0);
  });
});

describe('gates', () => {
  it('residents route through an open gate and round a shut one', () => {
    const f = threatFixture();
    const s = f.state;
    // A gate across lane A (a run painted over the lane puts one there).
    expect(rejection(run(s, { t: 'wall.paint', def: 'palisade', tiles: [[45, 50]] }))).toBeUndefined();
    const gate = s.buildings.find((b) => b.def === 'gate' && b.x === 45 && b.z === 50)!;
    gate.stage = 'built';
    gate.rt!.construction = null;
    s.networkVersion++;
    const g = 50 * S + 45;
    expect(walkable(s, g)).toBe(true);
    expect(pathBetween(s, 50 * S + 44, 50 * S + 46)).toContain(g);
    expect(rejection(run(s, { t: 'gate.set', id: gate.id, open: false }))).toBeUndefined();
    expect(walkable(s, g)).toBe(false);
    const round = pathBetween(s, 50 * S + 44, 50 * S + 46);
    expect(round).not.toBeNull();
    expect(round).not.toContain(g);
  });

  it('the bell sends everyone indoors, the Watch on its feet excepted', () => {
    const d = raidAtDusk();
    const s = d.state;
    const folk = s.residents.find((r) => !d.watch.includes(r.id))!;
    expect(scheduleOverride(s, folk, 18)).toEqual({ kind: 'home' });
    const member = findById(s.residents, d.watch[0]!)!;
    member.watch = { dutyDay: 0, shakenUntil: 0 };
    expect(scheduleOverride(s, member, 18)?.kind).toBe('leisure');
    s.raid!.bell = false;
    expect(scheduleOverride(s, folk, 18)).toBeNull();
  });
});
