// C5C: ponds: where they may be dug, what they cost, that walkers go round them, that charm sees the
// water and the habitats the wetland, and that they freeze with the river.
import { describe, expect, it } from 'vitest';
import { HABITAT_IDS, MAP_SIZE } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { Road, Terrain, Water } from '../../src/map/layers';
import { POND_MAX_TILES, pondCost } from '../../src/commands/pond';
import { isFrozen } from '../../src/systems/seasons/api';
import { walkable } from '../../src/systems/movement/grid';
import { recomputeDirty } from '../../src/systems/hearth/charm';
import { scoreChunks } from '../../src/systems/nature/habitats';
import { rejection, run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { addDecorAt } from '../fixtures/seasonsPlace';
import { EMPTY_CHUNK, EX, EZ, natureFixture } from '../fixtures/nature';

const S = MAP_SIZE;

/** Low, fertile grass across the empty chunk. */
function lowland(): WorldState {
  const s = natureFixture().state;
  for (let z = EZ; z < EZ + 16; z++) {
    for (let x = EX; x < EX + 16; x++) {
      s.map.height[z * S + x] = 1;
      s.map.fertility[z * S + x] = 60;
    }
  }
  return s;
}

const T = (x: number, z: number): [number, number] => [EX + x, EZ + z];

describe('ponds', () => {
  it('dig fertile low grass to level 0 and fill it, for coins booked as terraforming', () => {
    const s = lowland();
    const before = moneySnapshot(s);
    const treasury = s.economy.treasury;
    const net = s.networkVersion;
    const tiles = [T(4, 4), T(5, 4), T(4, 5), T(5, 5)];
    expect(rejection(run(s, { t: 'terrain.pond', tiles }))).toBeUndefined();
    for (const [x, z] of tiles) {
      const i = z * S + x;
      expect(s.map.water[i]).toBe(Water.pond);
      expect(s.map.terrain[i]).toBe(Terrain.water);
      expect(s.map.height[i]).toBe(0);
      expect(walkable(s, i)).toBe(false);
    }
    expect(s.networkVersion).toBeGreaterThan(net);
    expect(treasury - s.economy.treasury).toBe(pondCost(4));
    expect(scoreChunks(s, [EMPTY_CHUNK])[0]![HABITAT_IDS.indexOf('wetland')]).toBeGreaterThan(0);
    expectMoneyInvariant(before, s);
  });

  it('refuse high, poor, built-on, paved and frozen ground, and ponds past the cap', () => {
    const s = lowland();
    const at = (x: number, z: number) => rejection(run(s, { t: 'terrain.pond', tiles: [T(x, z)] }));
    s.map.height[(EZ + 1) * S + EX + 1] = 2;
    expect(at(1, 1)).toBe('TOO_STEEP');
    s.map.fertility[(EZ + 2) * S + EX + 2] = 5;
    expect(at(2, 2)).toBe('NEEDS_FERTILITY');
    s.map.road[(EZ + 3) * S + EX + 3] = Road.path;
    expect(at(3, 3)).toBe('OCCUPIED');
    addDecorAt(s, 'bench', EX + 6.5, EZ + 6.5);
    expect(at(6, 6)).toBe('OCCUPIED');
    s.map.terrain[(EZ + 7) * S + EX + 7] = Terrain.sand;
    expect(at(7, 7)).toBe('NOT_ALLOWED');
    const big: [number, number][] = [];
    for (let k = 0; k < POND_MAX_TILES; k++) big.push(T(k % 12, 10 + Math.floor(k / 12)));
    expect(rejection(run(s, { t: 'terrain.pond', tiles: big }))).toBeUndefined();
    expect(at(0, 12)).toBe('TOO_MANY');
    s.weather.river = { frozen: true, frozenTick: s.tick };
    expect(at(14, 1)).toBe('FROZEN');
    expect(isFrozen(s)).toBe(true);
  });

  it('count as water in view for charm', () => {
    const s = lowland();
    const near = (EZ + 6) * S + EX + 4;
    recomputeDirty(s, null);
    const before = s.map.charmView[near]!;
    run(s, { t: 'terrain.pond', tiles: [T(4, 4), T(5, 4)] });
    recomputeDirty(s, null);
    expect(s.map.charmView[near]!).toBeGreaterThan(before);
  });
});
