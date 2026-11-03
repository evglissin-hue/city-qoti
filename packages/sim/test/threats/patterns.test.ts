// C5D: the Town Gate and Watch Lookout patterns, on the threat fixture (12-hearth.md, later patterns).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import { findById } from '../../src/state/entities';
import { townGate } from '../../src/systems/hearth/patterns/detectors/townGate';
import { watchLookout } from '../../src/systems/hearth/patterns/detectors/watchLookout';
import { addDecorAt, placeFree } from '../fixtures/seasonsPlace';
import { threatFixture } from '../fixtures/threat';

const S = MAP_SIZE;

describe('Town Gate', () => {
  it('a gate in a wall run, lanterns either side and a dressed stone wall beside it', () => {
    const f = threatFixture();
    const s = f.state;
    const def = content.patternById.get('town-gate')!;
    expect(def.rank).toBe('village');
    const gate = findById(s.buildings, f.gate)!;
    // The fixture's gate stands in the palisade with lantern A1 near, but no dressed wall yet.
    expect(townGate(s, def)).toEqual([]);
    addDecorAt(s, 'lantern', gate.x - 1 + 0.5, gate.z + 1 + 0.5);
    addDecorAt(s, 'lantern', gate.x + 1 + 0.5, gate.z + 1 + 0.5);
    const wall = placeFree(s, 'stone-wall', 38, 52);
    expect(townGate(s, def)).toEqual([]);
    wall.rt!.modules = [['wall', 'ivy']];
    const sites = townGate(s, def);
    expect(sites).toHaveLength(1);
    expect(sites[0]!.anchor).toBe(gate.z * S + gate.x);
    expect(sites[0]!.members.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Watch Lookout', () => {
  it('a watchtower with a bench and a view over a lane or the river', () => {
    const f = threatFixture();
    const s = f.state;
    const def = content.patternById.get('watch-lookout')!;
    expect(def.rank).toBe('village');
    expect(watchLookout(s, def)).toEqual([]);
    const tower = findById(s.buildings, f.watchtower)!;
    addDecorAt(s, 'bench', tower.x + 1.5, tower.z + 1.5);
    const sites = watchLookout(s, def);
    expect(sites).toHaveLength(1);
    expect(sites[0]!.anchor).toBe(tower.z * S + tower.x);
  });
});
