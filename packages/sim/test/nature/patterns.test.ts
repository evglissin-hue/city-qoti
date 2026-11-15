// C5C: the four I3 Hearth patterns, each with a site that has it and one that misses one rule, and
// discovery through the engine at Village rank. Rules in docs/spec/12-hearth.md.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { Road, Terrain, Water } from '../../src/map/layers';
import { removeById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { worldIndex } from '../../src/state/worldIndex';
import { detectors } from '../../src/systems/hearth/patterns/detectors';
import { runPatterns } from '../../src/systems/hearth/patterns/engine';
import { createTickCtx } from '../../src/turn';
import { addDecorAt, placeFree } from '../fixtures/seasonsPlace';
import { EX, EZ, natureFixture } from '../fixtures/nature';
import { addHousehold, addResident } from '../village/helpers';

const S = MAP_SIZE;

function found(state: WorldState, pattern: string): number {
  const def = content.patternById.get(pattern)!;
  return detectors.get(def.detector)!(state, def).length;
}

function drop(state: WorldState, id: number): void {
  const d = state.decor.find((x) => x.id === id)!;
  worldIndex(state).decorGrid.remove(d);
  removeById(state.decor, id);
}

/** R1: an orchard is a farmstead business with trade 'orchard' (3x3). */
function orchard(state: WorldState, x: number, z: number): void {
  insertBuilding(state, null, content.buildingById.get('farmstead')!, x, z, 0, 0, {
    site: false,
    trade: 'orchard',
  });
}

function path(state: WorldState, x0: number, x1: number, z: number): void {
  for (let x = x0; x <= x1; x++) state.map.road[z * S + x] = Road.path;
}

describe('the I3 Hearth patterns (C5C)', () => {
  it('are looked for from Village rank, with a detector and an unlock each', () => {
    for (const id of ['orchard-path', 'childrens-corner', 'reading-nook', 'pond-garden']) {
      const p = content.patternById.get(id)!;
      expect(p.rank).toBe('village');
      expect(detectors.has(p.detector)).toBe(true);
      expect(p.unlocks.every((u) => content.decorById.get(u)?.locked)).toBe(true);
    }
  });

  it('Orchard Path: a path along an orchard and a bench by it', () => {
    const s = natureFixture().state;
    orchard(s, EX + 4, EZ + 4);
    path(s, EX + 3, EX + 8, EZ + 7);
    expect(found(s, 'orchard-path')).toBe(0);
    const bench = addDecorAt(s, 'bench', EX + 5.5, EZ + 8.5);
    expect(found(s, 'orchard-path')).toBe(1);
    drop(s, bench);
    addDecorAt(s, 'bench', EX + 5.5, EZ + 12.5);
    expect(found(s, 'orchard-path')).toBe(0);
  });

  it("Children's Corner: a swing three homes with children can see, and a bench", () => {
    const s = natureFixture().state;
    const homes = [0, 3, 6].map((k) => placeFree(s, 'cottage', EX + k, EZ + 2));
    homes.slice(0, 2).forEach((h) => addResident(s, addHousehold(s, h), 'child'));
    addDecorAt(s, 'swing', EX + 4.5, EZ + 7.5);
    addDecorAt(s, 'bench', EX + 6.5, EZ + 7.5);
    expect(found(s, 'childrens-corner')).toBe(0);
    addResident(s, addHousehold(s, homes[2]!), 'child');
    expect(found(s, 'childrens-corner')).toBe(1);
  });

  it('Reading Nook: a bench walled in, with flowers and a lantern, in the quiet', () => {
    const s = natureFixture().state;
    const bx = EX + 6.5;
    const bz = EZ + 6.5;
    addDecorAt(s, 'bench', bx, bz);
    for (const dx of [-1, 0, 1]) addDecorAt(s, 'low-wall', bx + dx, bz - 1.5);
    addDecorAt(s, 'flower-bed', bx + 1.5, bz);
    expect(found(s, 'reading-nook')).toBe(0);
    addDecorAt(s, 'lantern', bx - 1.5, bz);
    expect(found(s, 'reading-nook')).toBe(1);
    s.map.charmNoise[Math.floor(bz) * S + Math.floor(bx)] = 8;
    expect(found(s, 'reading-nook')).toBe(0);
  });

  it('Pond Garden: a pond with planting, a seat and a path', () => {
    const s = natureFixture().state;
    for (const x of [EX + 4, EX + 5]) {
      s.map.water[(EZ + 4) * S + x] = Water.pond;
      s.map.terrain[(EZ + 4) * S + x] = Terrain.water;
    }
    addDecorAt(s, 'flower-bed', EX + 3.5, EZ + 5.5);
    addDecorAt(s, 'flower-bed', EX + 6.5, EZ + 5.5);
    addDecorAt(s, 'bench', EX + 4.5, EZ + 6.5);
    expect(found(s, 'pond-garden')).toBe(0);
    path(s, EX + 3, EX + 7, EZ + 2);
    expect(found(s, 'pond-garden')).toBe(1);
    s.map.water[(EZ + 4) * S + EX + 5] = Water.none;
    expect(found(s, 'pond-garden')).toBe(0);
  });

  it('is discovered through the engine and unlocks its piece', () => {
    const s = natureFixture().state;
    orchard(s, EX + 4, EZ + 4);
    path(s, EX + 3, EX + 8, EZ + 7);
    addDecorAt(s, 'bench', EX + 5.5, EZ + 8.5);
    runPatterns(s, createTickCtx(s));
    expect(s.hearth.sites.some((x) => x.pattern === 'orchard-path')).toBe(true);
    expect(s.hearth.unlocked).toContain('pear-tree');
  });
});
