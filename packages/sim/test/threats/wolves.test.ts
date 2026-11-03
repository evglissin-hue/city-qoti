// C5D: winter wolves, the Hamlet tutorial and bandits offered a home (14-challenge.md).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, TICKS_PER_HOUR } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { vacantHomes } from '../../src/systems/residents/places';
import { dayIndex } from '../../src/systems/economy/time';
import { isFarm } from '../../src/systems/production/fields';
import { yieldModifiers } from '../../src/systems/production/modifiers';
import { packFor, packTile, SCARED_YIELD, wolvesTick } from '../../src/systems/raids/wolves';
import { frontOf } from '../../src/systems/threats/api';
import { threatDay } from '../../src/systems/threats/pressure';
import { createTickCtx } from '../../src/turn';
import { rejection, run } from '../helpers';
import { hamletFixture } from '../fixtures/hamlet';
import { addDecorAt, placeFree, tickAt } from '../fixtures/seasonsPlace';
import { raidAtDusk } from '../fixtures/threat';
import { villageFixture } from '../fixtures/village';

const S = MAP_SIZE;

/** A farmhouse out on its own, far from the Town Hall. */
function outlyingFarm(s: WorldState): number {
  for (let z = 150; z > 20; z -= 3)
    for (let x = 170; x > 20; x -= 3) {
      try {
        return placeFree(s, 'farmhouse', x, z).id;
      } catch {
        // taken
      }
    }
  throw new Error('no room');
}

function winterNight(s: WorldState, hour: number): void {
  // Winter day 3 of year 1; the wolves' night is day 2's evening.
  const night = dayIndex(tickAt(0, 3, 2, 12));
  s.threats.wolves = [night];
  s.tick = hour >= 12 ? tickAt(0, 3, 2, hour) : tickAt(0, 3, 3, 6) - (6 - hour) * TICKS_PER_HOUR;
}

describe('wolves', () => {
  it('are planned for a few winter nights on Winter day 1', () => {
    const s = villageFixture().state;
    s.settings.threat = 'standard';
    s.tick = tickAt(0, 3, 1, 0) + 133;
    threatDay(s, createTickCtx(s));
    expect(s.threats.wolves.length).toBe(2);
    for (const n of s.threats.wolves) expect(n).toBeGreaterThan(dayIndex(s.tick));
  });

  it('go for the most outlying unguarded farm and frighten folk outdoors on unlit ground', () => {
    const s = villageFixture().state;
    s.settings.threat = 'standard';
    const farm = outlyingFarm(s);
    winterNight(s, 1);
    const p = packFor(s);
    expect(p.farm).not.toBeNull();
    expect(isFarm(content.buildingById.get(p.farm!.def))).toBe(true);
    expect(farm).toBeGreaterThan(0);
    // At 01:00 the pack is at the farm's door.
    expect(packTile(s)).toBe(frontOf(p.farm!));
    const near = s.residents[0]!;
    near.inside = 0;
    near.tile = packTile(s) + 1;
    const far = s.residents[1]!;
    far.inside = 0;
    far.tile = 5 * S + 5;
    wolvesTick(s, createTickCtx(s));
    expect(near.modifiers.some((m) => m.kind === 'fright' && m.value < 0)).toBe(true);
    expect(far.modifiers.some((m) => m.kind === 'fright')).toBe(false);
  });

  it('avoid lit tiles and fenced farms', () => {
    const s = villageFixture().state;
    s.settings.threat = 'standard';
    outlyingFarm(s);
    winterNight(s, 1);
    const first = packFor(s).farm!;
    addDecorAt(s, 'fence', first.x - 1 + 0.5, first.z + 0.5);
    const second = packFor(s).farm;
    expect(second?.id).not.toBe(first.id);
    const r = s.residents[0]!;
    r.inside = 0;
    r.tile = packTile(s);
    addDecorAt(s, 'lantern', (r.tile % S) + 0.5, Math.floor(r.tile / S) + 0.5);
    wolvesTick(s, createTickCtx(s));
    expect(r.modifiers.some((m) => m.kind === 'fright')).toBe(false);
  });

  it('scare the animals: the farm makes half as much the day after', () => {
    const s = villageFixture().state;
    s.settings.threat = 'standard';
    outlyingFarm(s);
    winterNight(s, 1);
    const farm = packFor(s).farm!;
    s.tick = tickAt(0, 3, 3, 10);
    const def = content.buildingById.get(farm.def)!;
    const wolves = yieldModifiers.find(([id]) => id === 'wolves')![1];
    expect(wolves(s, farm, def, def.methods![0]!)).toBe(SCARED_YIELD);
    s.tick = tickAt(0, 3, 4, 10);
    expect(wolves(s, farm, def, def.methods![0]!)).toBe(1000);
  });

  it('only howl at the forest edge in the first Hamlet winter, and on Peaceful', () => {
    for (const make of [
      () => {
        const h = hamletFixture().state;
        h.settings.threat = 'standard';
        return h;
      },
      () => {
        const v = villageFixture().state;
        v.settings.threat = 'peaceful';
        return v;
      },
    ]) {
      const s = make();
      winterNight(s, 21);
      for (const r of s.residents) r.inside = 0;
      const ctx = createTickCtx(s);
      wolvesTick(s, ctx);
      expect(s.chronicle.at(-1)!.kind).toBe('wolves-howl');
      winterNight(s, 1);
      wolvesTick(s, ctx);
      expect(s.residents.some((r) => r.modifiers.some((m) => m.kind === 'fright'))).toBe(false);
      expect(packFor(s).farm).toBeNull();
    }
  });

  it('leave a Chronicle line in the morning', () => {
    const s = villageFixture().state;
    s.settings.threat = 'standard';
    winterNight(s, 5);
    wolvesTick(s, createTickCtx(s));
    const e = s.chronicle.at(-1)!;
    expect(e.kind).toBe('wolves');
    expect(e.snapshot).toBeTruthy();
  });
});

describe('captured bandits', () => {
  it('offered a home: a Reformed newcomer with bond 0, in a vacant home', () => {
    const d = raidAtDusk();
    const s = d.state;
    const id = s.raid!.raiders[0]!.id;
    s.threats.captives = [id];
    const n = s.residents.length;
    const homes = s.households.length;
    // No home free: they cannot be offered one yet.
    const full = vacantHomes(s).length === 0;
    if (full) expect(rejection(run(s, { t: 'bandit.decide', id, choice: 'home' }))).toBe('NOT_ALLOWED');
    for (let x = 150; vacantHomes(s).length === 0; x -= 3) {
      try {
        placeFree(s, 'cottage', x, 140);
      } catch {
        // taken
      }
    }
    expect(rejection(run(s, { t: 'bandit.decide', id, choice: 'home' }))).toBeUndefined();
    expect(s.residents.length).toBe(n + 1);
    expect(s.households.length).toBe(homes + 1);
    const r = s.residents.at(-1)!;
    expect(r.reformed).toBe(true);
    expect(r.traits).toContain('reformed');
    expect(r.bond).toBe(0);
    expect(s.threats.captives).toEqual([]);
    expect(s.chronicle.at(-1)!.kind).toBe('bandit-home');
  });

  it('sent off: renown +1, and no home is needed', () => {
    const d = raidAtDusk();
    const s = d.state;
    const id = s.raid!.raiders[0]!.id;
    s.threats.captives = [id];
    const before = s.renown.points;
    expect(rejection(run(s, { t: 'bandit.decide', id, choice: 'send' }))).toBeUndefined();
    expect(s.renown.points).toBe(before + 1);
  });
});
