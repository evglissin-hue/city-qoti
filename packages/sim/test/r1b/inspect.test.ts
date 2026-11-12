// R1B: the inspector's BuildingDetail for businesses and specialized buildings: the trades the
// Ledger may pin (its zone's, its site allowing), the pinned flag, and a specialized building's reach,
// served and capacity.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { findById, removeById } from '../../src/state/entities';
import { growLot } from '../../src/systems/growth/api';
import { buildingDetail } from '../../src/view/inspect';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { lotsIn, paintZone, zoneNow } from '../growth/helpers';

describe('the inspector', () => {
  it("lists the trades a business's site allows, its own always, and whether it is pinned", () => {
    const f = villageFixture();
    const s = f.state;
    paintZone(s, 'crafts', [83, 44, 95, 49]);
    zoneNow(s);
    const lot = lotsIn(s, [83, 44, 95, 49]).sort((a, b) => a.x - b.x)[0]!;
    const b = growLot(s, createTickCtx(s), lot.id, 'workshop', undefined, 'baker')!;
    b.stage = 'built';
    b.rt!.construction = null;
    b.pinned = true;
    let d = buildingDetail(s, b.id)!;
    const ids = () => (d.trades ?? []).map((t) => t.id);
    expect(ids()).toContain('baker');
    expect(ids()).toContain('weaver');
    // No Sawmill in the valley (nor the Water Wheel): no carpenter to pin.
    expect(ids()).not.toContain('carpenter');
    expect(d.pinned).toBe(true);
    // Its windmill gone, its own trade still shows (so the Ledger can see what it is).
    removeById(s.buildings, f.b.windmill);
    d = buildingDetail(s, b.id)!;
    expect(ids()).toContain('baker');
  });

  it("gives a specialized building's reach, who it serves and how many it may", () => {
    const f = villageFixture();
    const s = f.state;
    const d = buildingDetail(s, f.b.windmill)!;
    const def = content.buildingById.get('windmill')!;
    expect(d.reach).toEqual({ tiles: def.reach, served: 1, capacity: def.capacity });
    expect(buildingDetail(s, findById(s.buildings, f.b.townHall)!.id)!.reach).toBeUndefined();
  });
});
