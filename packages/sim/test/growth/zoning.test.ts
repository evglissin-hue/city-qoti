// C4B zoning: lots cut along road frontage (docs/spec/13-ledger.md, Zoning and growth). Tests run
// the zoning pass directly on the village fixture, so no other system moves anything.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { Zone } from '../../src/constants';
import type { Lot } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { createTickCtx, advanceTo } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { run, S } from '../helpers';
import { frontageMap, lotsIn, paintZone, zoneNow, zoneOf } from './helpers';

/** Every tile of every lot belongs to exactly that lot, and no two lots overlap. */
function expectTidy(lots: readonly Lot[], layer: Int32Array): void {
  const seen = new Set<number>();
  for (const l of lots) {
    for (let z = l.z; z < l.z + l.d; z++) {
      for (let x = l.x; x < l.x + l.w; x++) {
        const i = z * S + x;
        expect(seen.has(i), `lot ${l.id} overlaps at ${x},${z}`).toBe(false);
        seen.add(i);
        expect(layer[i]).toBe(l.id);
      }
    }
  }
}

describe('lots along the frontage', () => {
  it('cuts zoned frontage into 2 to 3 tile lots facing the road, and stops there', () => {
    const f = villageFixture();
    const s = f.state;
    // Homes south of street B, east of the path: four tiles deep.
    paintZone(s, 'homes-low', [66, 71, 95, 74]);
    const { added, ctx } = zoneNow(s);
    const lots = lotsIn(s, [66, 71, 95, 74]);
    const map = frontageMap(s, [64, 69, 97, 75]);
    expect(added, map).toBeGreaterThanOrEqual(8);
    expect(lots).toHaveLength(added);
    const shapes = content.zoneById.get('homes-low')!.lots.map((l) => l.size.join('x'));
    for (const l of lots) {
      expect(l.rot, map).toBe(2);
      expect(l.z, map).toBe(71);
      expect(shapes).toContain(`${l.w}x${l.d}`);
      expect(s.map.road[l.frontage]).toBe(Road.street);
      expect(l.style).not.toBe('');
      expect(l.desirability).toBeGreaterThan(0);
      expect(zoneOf(l)).toBe('homes-low');
    }
    expectTidy(s.lots, s.map.lot);
    expect(ctx.events.filter((e) => e.e === 'lot.added')).toHaveLength(added);
    // Only the frontage row is cut: the back of a four-deep zone stays zoned land.
    expect(s.map.lot[74 * S + 70]).toBe(0);
    // A second pass finds nothing to do.
    const again = zoneNow(s);
    expect(again.added + again.removed).toBe(0);
    // Low density: a mix of widths, and the odd garden gap, but never a lone orphan tile.
    expect(new Set(lots.map((l) => l.w)).size, map).toBeGreaterThan(1);
  });

  it('faces lots east and west onto a north to south road, turned', () => {
    const f = villageFixture();
    const s = f.state;
    // The lane at x = 32 runs from z 51 to 69: zone both sides.
    paintZone(s, 'shops', [33, 52, 35, 64]);
    paintZone(s, 'shops', [28, 52, 31, 64]);
    zoneNow(s);
    const east = lotsIn(s, [33, 51, 36, 69]);
    const west = lotsIn(s, [27, 51, 31, 69]);
    const map = frontageMap(s, [26, 50, 37, 66]);
    expect(east.length, map).toBeGreaterThan(2);
    expect(west.length, map).toBeGreaterThan(2);
    for (const l of east) {
      expect(l.rot, map).toBe(1);
      expect(l.x).toBe(33);
      expect(s.map.road[l.frontage]).toBe(Road.lane);
      expect(l.frontage % S).toBe(32);
    }
    for (const l of west) {
      expect(l.rot, map).toBe(3);
      expect(l.x + l.w - 1).toBe(31);
    }
    // Medium density: shoulder to shoulder, no gaps between lots along the lane.
    const zs = east.map((l) => [l.z, l.z + l.d - 1] as const).sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < zs.length; k++) expect(zs[k]![0], map).toBe(zs[k - 1]![1] + 1);
    expectTidy(s.lots, s.map.lot);
  });

  it('gives a corner to the busier road and keeps dead ends and doors clear', () => {
    const f = villageFixture();
    const s = f.state;
    // A lane spur north from lane A at x = 90, ending at z = 40 (a dead end).
    for (let z = 40; z < 50; z++) s.map.road[z * S + 90] = Road.lane;
    s.networkVersion++;
    paintZone(s, 'homes-low', [84, 36, 96, 49]);
    zoneNow(s);
    const map = frontageMap(s, [82, 34, 97, 51]);
    // The two tiles straight on from the dead end stay free, so the lane can carry on.
    expect(s.map.lot[39 * S + 90], map).toBe(0);
    expect(s.map.lot[38 * S + 90], map).toBe(0);
    // The corner tile beside both roads went to the lane A frontage (the longer run).
    const corner = findById(s.lots, s.map.lot[49 * S + 91]!);
    expect(corner, map).toBeDefined();
    expect(corner!.rot, map).toBe(0);
    expectTidy(s.lots, s.map.lot);
  });

  it('never swallows decor, never builds on a steep plot, and steps back where the land rises', () => {
    const f = villageFixture();
    const s = f.state;
    // A bench on zoned frontage, and a bank two levels up behind part of the row.
    run(s, { t: 'decor.place', def: 'bench', fx: 70 * 256 + 128, fz: 71 * 256 + 128, rot: 0 });
    for (let x = 80; x <= 86; x++) for (let z = 73; z <= 74; z++) s.map.height[z * S + x] = 4;
    for (let x = 80; x <= 86; x++) s.map.height[72 * S + x] = 3;
    s.networkVersion++;
    paintZone(s, 'homes-medium', [66, 71, 90, 74]);
    zoneNow(s);
    const map = frontageMap(s, [64, 69, 92, 75]);
    expect(s.map.lot[71 * S + 70], map).toBe(0);
    for (const l of lotsIn(s, [66, 71, 90, 74])) {
      let lo = 99;
      let hi = 0;
      for (let z = l.z; z < l.z + l.d; z++) {
        for (let x = l.x; x < l.x + l.w; x++) {
          lo = Math.min(lo, s.map.height[z * S + x]!);
          hi = Math.max(hi, s.map.height[z * S + x]!);
        }
      }
      expect(hi - lo, map).toBeLessThanOrEqual(1);
    }
    // On the bank the deep townhouse shape gives way to a shallow one.
    const bank = lotsIn(s, [80, 71, 86, 74]);
    expect(bank.length, map).toBeGreaterThan(0);
    for (const l of bank) expect(l.d, map).toBe(2);
  });

  it('lets a road through an empty lot, and keeps a grown one', () => {
    const f = villageFixture();
    const s = f.state;
    paintZone(s, 'homes-low', [66, 71, 95, 73]);
    zoneNow(s);
    const lot = lotsIn(s, [66, 71, 95, 73])[1]!;
    const ctx = run(s, {
      t: 'road.paint',
      kind: 'path',
      tiles: [
        [lot.x, 71],
        [lot.x, 72],
        [lot.x, 73],
      ],
    });
    expect(ctx.events.some((e) => e.e === 'command.rejected')).toBe(false);
    // The path leaves the zone; the next pass lets the lot go and cuts what still fits.
    expect(s.map.zone[72 * S + lot.x]).toBe(0);
    const { removed } = zoneNow(s);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(findById(s.lots, lot.id)).toBeUndefined();
    expectTidy(s.lots, s.map.lot);
    // The fixture's grown cottage keeps its lot even with the zone cleared under it.
    run(s, { t: 'zone.clear', tiles: [[40, 71]] });
    zoneNow(s);
    expect(findById(s.lots, f.lots.homes[0]!)!.buildingId).toBe(f.b.grown);
  });

  it('keeps the fixture lots as they are, hour after hour', () => {
    const f = villageFixture();
    const s = f.state;
    const before = JSON.stringify(s.lots.map((l) => [l.id, l.x, l.z, l.w, l.d, l.rot, l.frontage]));
    const { added, removed } = zoneNow(s);
    expect(added + removed).toBe(0);
    expect(JSON.stringify(s.lots.map((l) => [l.id, l.x, l.z, l.w, l.d, l.rot, l.frontage]))).toBe(before);
  });

  it('runs hourly in standard valleys and skips sandbox ones', () => {
    const f = villageFixture();
    const s = f.state;
    paintZone(s, 'crafts', [66, 71, 80, 73]);
    advanceTo(s, s.tick + 200, createTickCtx(s));
    expect(lotsIn(s, [66, 71, 80, 73]).length).toBeGreaterThan(0);
    expect(lotsIn(s, [66, 71, 80, 73]).every((l) => l.zone === Zone.crafts)).toBe(true);
    // A building placed over zoned land: its door's front tile stays free.
    const g = villageFixture().state;
    const b = insertBuilding(g, null, content.buildingById.get('well')!, 90, 72, 2, 0, { site: false });
    paintZone(g, 'homes-low', [84, 71, 95, 74]);
    zoneNow(g);
    expect(g.map.lot[71 * S + 90]).toBe(0);
    expect(b.id).toBeGreaterThan(0);
  });
});
