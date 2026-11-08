// C5C: modules (customization phase 2): which slots take what, coins at once and goods by porter (as
// a home upgrade), the module's charm and habitat once fitted, handmade, calling one off with a
// refund, and the money invariant throughout.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { PENNIES_PER_COIN, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { recomputeDirty } from '../../src/systems/hearth/charm';
import { moduleGoods } from '../../src/systems/modules';
import { buildingDetail } from '../../src/view/inspect';
import { rejection, run } from '../helpers';
import { ticksUntil, toWork } from '../ledger/helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { placeFree } from '../fixtures/seasonsPlace';
import { natureFixture } from '../fixtures/nature';

function townhouse(): { s: WorldState; b: Building } {
  const s = natureFixture().state;
  const b = placeFree(s, 'townhouse', 86, 52, 2);
  return { s, b };
}

const setModule = (s: WorldState, b: Building, slot: string, module: string | null, seat: 0 | 1 = 0) =>
  rejection(run(s, { t: 'build.setModule', id: b.id, slot, module }, seat));

describe('modules', () => {
  it('fit only the slots a def offers, one at a time, from Village rank', () => {
    const { s, b } = townhouse();
    // A built building whose def offers no slots (the cottage did not, until playtest round seven).
    const bare = s.buildings.find(
      (x) => x.stage === 'built' && x.rt && !content.buildingById.get(x.def)?.moduleSlots,
    )!;
    expect(setModule(s, bare, 'front', 'porch')).toBe('NOT_ALLOWED');
    expect(setModule(s, b, 'front', 'dormer')).toBe('INVALID');
    expect(setModule(s, b, 'front', 'no-such-module')).toBe('INVALID');
    expect(setModule(s, b, 'front', null)).toBe('NOT_FOUND');
    expect(setModule(s, b, 'front', 'porch')).toBeUndefined();
    expect(setModule(s, b, 'roof', 'dormer')).toBe('NOT_READY');
    s.charter.rank = 'hamlet';
    const other = placeFree(s, 'townhouse', 90, 52, 2);
    expect(setModule(s, other, 'roof', 'dormer')).toBe('LOCKED');
  });

  it('pays coins now, the goods come by porter, then the module is on and charming', () => {
    const { s, b } = townhouse();
    const before = moneySnapshot(s);
    const porch = content.moduleById.get('porch')!;
    const treasury = s.economy.treasury;
    recomputeDirty(s, null);
    const door = (b.z - 1) * 192 + b.x;
    const comfort = s.map.charmComfort[door]!;
    expect(setModule(s, b, 'front', 'porch', 1)).toBeUndefined();
    expect(treasury - s.economy.treasury).toBe(porch.cost!.coins! * PENNIES_PER_COIN);
    expect(b.handmade).toBe(true);
    expect(b.rt!.moduleWork).toEqual(moduleGoods(porch));
    expect(b.rt!.modules).toBeUndefined();
    expect(buildingDetail(s, b.id)?.moduleWork?.module).toBe('porch');
    for (const st of s.buildings.filter((x) => x.def === 'storehouse')) toWork(s, st.rt!.workers);
    ticksUntil(s, () => !!b.rt!.modules, 6 * TICKS_PER_HOUR);
    expect(b.rt!.modules).toEqual([['front', 'porch']]);
    expect(b.rt!.moduleWork).toBeNull();
    expect(b.rt!.moduleNext).toBeUndefined();
    recomputeDirty(s, null);
    expect(s.map.charmComfort[door]!).toBeGreaterThan(comfort);
    expectMoneyInvariant(before, s);
  });

  it('goes on at once when it needs no goods, and comes off for free', () => {
    const { s, b } = townhouse();
    const before = moneySnapshot(s);
    expect(setModule(s, b, 'wall', 'ivy')).toBeUndefined();
    expect(b.rt!.modules).toEqual([['wall', 'ivy']]);
    const treasury = s.economy.treasury;
    expect(setModule(s, b, 'wall', null)).toBeUndefined();
    expect(b.rt!.modules).toBeUndefined();
    expect(s.economy.treasury).toBe(treasury);
    expectMoneyInvariant(before, s);
  });

  it('called off while waiting: coins back, delivered goods to a storehouse', () => {
    const { s, b } = townhouse();
    const before = moneySnapshot(s);
    const treasury = s.economy.treasury;
    expect(setModule(s, b, 'top', 'tower')).toBeUndefined();
    const planks = content.goodIndex.get('planks')!;
    const stored = () => s.buildings.reduce((n, x) => n + (x.rt?.store[planks] ?? 0), 0);
    // Pretend the planks came in already.
    const all = stored();
    b.rt!.moduleWork![planks] = 0;
    expect(setModule(s, b, 'top', null)).toBeUndefined();
    expect(s.economy.treasury).toBe(treasury);
    expect(stored()).toBe(all + moduleGoods(content.moduleById.get('tower')!)[planks]!);
    expect(b.rt!.moduleWork).toBeNull();
    expectMoneyInvariant(before, s);
  });

  it('walls take ivy and flower boxes; the special homes and landmarks have slots', () => {
    for (const id of ['townhouse', 'herbalists-cottage', 'town-hall', 'tavern', 'stone-wall']) {
      const slots = content.buildingById.get(id)!.moduleSlots!.map(([x]) => x);
      expect(slots, id).toContain('wall');
    }
    expect(
      content.modules
        .filter((m) => m.slot === 'wall')
        .map((m) => m.id)
        .sort(),
    ).toEqual(['flower-boxes', 'ivy']);
  });
});
