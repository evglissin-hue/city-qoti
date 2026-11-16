// R2F: the lot cutter for streets (docs/build/cycle-r2f-street-lots.md, tasks 1 to 3 and 5): rows that
// touch, gardens behind closed blocks, corner lots with two frontages, a pass that is idempotent and
// free of the order of painting, and occupied lots that nothing moves.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Lot, SimEvent, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { findById } from '../../src/state/entities';
import { growLot } from '../../src/systems/growth/api';
import { growthPass } from '../../src/systems/growth';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { frontageMap, lotsIn, paintZone, zoneNow } from '../growth/helpers';
import {
  along,
  BLOCK_ZONES,
  closedBlockRoads,
  growSome,
  hold,
  paintBlockZones,
  roadX,
  roadZ,
  rowsOf,
  S,
  signature,
  span,
} from './helpers';

const zoneValue = (id: string): number => content.zoneById.get(id)!.layerValue;
const isRoad = (state: WorldState, i: number, min: number = Road.lane): boolean =>
  i >= 0 && state.map.road[i]! >= min;

/** Draws the lots in a rect, for a failure message. */
const mapOf = (state: WorldState, rect: [number, number, number, number]): string =>
  '\n' + frontageMap(state, rect);

describe('rows on a street', () => {
  it('cuts a row zone into lots that touch, sharing one row id per side of the street', () => {
    const { state: s } = villageFixture();
    // South side of street B (z=70): Townhouses; north side: Shops, in the free stretch x 70 to 82.
    paintZone(s, 'homes-medium', [68, 71, 95, 73]);
    paintZone(s, 'shops', [70, 67, 82, 69]);
    zoneNow(s);

    for (const [zone, rect] of [
      ['homes-medium', [68, 71, 95, 73]],
      ['shops', [70, 67, 82, 69]],
    ] as const) {
      const lots = lotsIn(s, [rect[0], rect[1], rect[2], rect[3]])
        .filter((l) => l.zone === zoneValue(zone))
        .sort((p, q) => p.x - q.x);
      const label = mapOf(s, [60, 64, 96, 76]);
      expect(lots.length, label).toBeGreaterThan(3);
      // One row, all touching: no gap and no overlap.
      expect(new Set(lots.map((l) => l.row)).size, label).toBe(1);
      expect(lots[0]!.row, label).not.toBe(0);
      expect(lots[0]!.x, label).toBe(rect[0]);
      for (let i = 1; i < lots.length; i++) expect(lots[i - 1]!.x + lots[i - 1]!.w, label).toBe(lots[i]!.x);
      expect(lots[lots.length - 1]!.x + lots[lots.length - 1]!.w - 1, label).toBe(rect[2]);
      // Every zoned tile that fronts the street (the rect's row beside it) is in a lot, without a gap.
      const front = zone === 'homes-medium' ? rect[1] : rect[3];
      for (let x = rect[0]; x <= rect[2]; x++)
        expect(s.map.lot[front * S + x], `${x},${front}${label}`).not.toBe(0);
      for (const l of lots) {
        expect(l.kind).toBe('plot');
        expect(l.w).toBeGreaterThanOrEqual(1);
        expect(l.w).toBeLessThanOrEqual(3);
        expect(l.frontage % S).toBeGreaterThanOrEqual(l.x);
        expect(s.map.road[l.frontage]).toBe(Road.street);
      }
    }
    // The two sides are two rows.
    const south = lotsIn(s, [68, 71, 95, 73])[0]!;
    const north = lotsIn(s, [70, 67, 82, 69])[0]!;
    expect(south.row).not.toBe(north.row);
  });

  it('cuts the same zone along a lane the old way: no row, gaps allowed', () => {
    const { state: s } = villageFixture();
    paintZone(s, 'homes-medium', [40, 51, 58, 53]);
    paintZone(s, 'shops', [84, 51, 95, 53]);
    zoneNow(s);
    const lots = lotsIn(s, [40, 51, 95, 53]);
    expect(lots.length).toBeGreaterThan(4);
    const shapes = (zone: string) =>
      new Set(content.zoneById.get(zone)!.lots.map((l) => `${l.size[0]}x${l.size[1]}`));
    for (const l of lots) {
      expect(l.row).toBe(0);
      expect(l.kind).toBe('plot');
      expect(l.corner).toBeUndefined();
      expect(l.frontage2).toBeUndefined();
      const zone = content.zoneByValue.get(l.zone)!;
      // C4B's own shapes (a lot along a road facing north is w by d as the zone lists them).
      expect(shapes(zone.id).has(`${l.w}x${l.d}`) || shapes(zone.id).has(`${l.d}x${l.w}`)).toBe(true);
    }
    expect(s.lots.some((l) => l.kind === 'garden' && l.x >= 40 && l.x <= 95 && l.z >= 51 && l.z <= 53)).toBe(
      false,
    );
  });

  it('keeps a low-density zone on a street as it was: no row, odd gaps', () => {
    const { state: s } = villageFixture();
    paintZone(s, 'homes-low', [68, 71, 95, 73]);
    zoneNow(s);
    const lots = lotsIn(s, [68, 71, 95, 73]);
    expect(lots.length).toBeGreaterThan(4);
    for (const l of lots) {
      expect(l.row).toBe(0);
      expect(l.corner).toBeUndefined();
    }
  });

  it('numbers a row from state.nextId and nothing else', () => {
    const { state: s } = villageFixture();
    const before = s.nextId;
    paintZone(s, 'homes-medium', [68, 71, 95, 73]);
    zoneNow(s);
    const rows = rowsOf(s);
    expect(rows.size).toBe(1);
    const id = [...rows.keys()][0]!;
    expect(id).toBeGreaterThanOrEqual(before);
    expect(id).toBeLessThan(s.nextId);
    // The row id is its own: no lot or building has it.
    expect(s.lots.some((l) => l.id === id)).toBe(false);
    expect(s.buildings.some((b) => b.id === id)).toBe(false);
  });

  it('cuts a row on the far side of an avenue too (avenue counts as a street)', () => {
    const { state: s } = villageFixture();
    roadX(s, 90, 40, 95, Road.avenue);
    paintZone(s, 'homes-medium', [42, 91, 70, 93]);
    zoneNow(s);
    const lots = lotsIn(s, [42, 91, 70, 93]).sort((p, q) => p.x - q.x);
    expect(lots.length).toBeGreaterThan(3);
    expect(new Set(lots.map((l) => l.row)).size).toBe(1);
    expect(lots[0]!.row).not.toBe(0);
    for (let i = 1; i < lots.length; i++) expect(lots[i - 1]!.x + lots[i - 1]!.w).toBe(lots[i]!.x);
  });
});

describe('garden lots', () => {
  function closedBlock(): WorldState {
    const { state: s } = villageFixture();
    closedBlockRoads(s);
    paintBlockZones(s);
    zoneNow(s);
    return s;
  }

  it('fill a closed block behind its rows, never in a zone, never built on', () => {
    const s = closedBlock();
    const gardens = s.lots.filter((l) => l.kind === 'garden');
    const label = mapOf(s, [62, 56, 90, 84]);
    expect(gardens.length, label).toBeGreaterThan(0);
    const rows = rowsOf(s);
    for (const g of gardens) {
      expect(g.zone).toBe(0);
      expect(g.buildingId).toBe(0);
      expect(g.style).toBe('');
      expect(g.w).toBeLessThanOrEqual(4);
      expect(g.d).toBeLessThanOrEqual(4);
      // Carries a valid row: some row lot has the same row id, and the garden's rot and frontage are copied from one of them.
      expect(g.row, label).not.toBe(0);
      const owners = rows.get(g.row);
      expect(owners, label).toBeDefined();
      expect(
        owners!.some((o) => o.rot === g.rot && o.frontage === g.frontage),
        label,
      ).toBe(true);
      // Its tiles are its own in the lot layer.
      for (let z = g.z; z < g.z + g.d; z++)
        for (let x = g.x; x < g.x + g.w; x++) {
          expect(s.map.lot[z * S + x]).toBe(g.id);
          expect(s.map.road[z * S + x]).toBe(0);
        }
    }
    // Gardens never overlap each other or a plot.
    const seen = new Set<number>();
    for (const l of s.lots)
      for (let z = l.z; z < l.z + l.d; z++)
        for (let x = l.x; x < l.x + l.w; x++) {
          expect(seen.has(z * S + x), `overlap at ${x},${z}`).toBe(false);
          seen.add(z * S + x);
        }
  });

  it('are never offered: growLot refuses them, and nights never build on them', () => {
    const s = closedBlock();
    const gardens = s.lots.filter((l) => l.kind === 'garden');
    expect(gardens.length).toBeGreaterThan(0);
    for (const g of gardens) {
      for (const def of content.buildings.filter((d) => d.grows)) {
        expect(growLot(s, null, g.id, def.id)).toBeNull();
      }
    }
    // Stock the town and let many nights try to grow: not one site lands on a garden.
    const store = s.buildings.find((b) => b.def === 'storehouse' && b.rt)!;
    for (let g = 0; g < content.goods.length; g++) store.rt!.store[g] = 500;
    for (let n = 0; n < 12; n++) {
      s.demand.starts = { day: -1, n: 0 };
      growthPass(s, createTickCtx(s));
      for (const b of s.buildings) {
        if (b.stage === 'construction') b.stage = 'built';
      }
    }
    expect(s.buildings.filter((b) => b.lot).length).toBeGreaterThan(0);
    for (const g of s.lots.filter((l) => l.kind === 'garden')) expect(g.buildingId).toBe(0);
    for (const b of s.buildings) if (b.lot) expect(findById(s.lots, b.lot)!.kind).toBe('plot');
  });

  it('are not counted as free lots when only gardens are left', () => {
    const s = closedBlock();
    const plots = s.lots.filter((l) => l.kind === 'plot');
    // Every plot taken by a stand-in building id, so the gardens are the only empty lots.
    for (const l of plots) l.buildingId = 9_000_000 + l.id;
    const before = s.buildings.length;
    s.demand.starts = { day: -1, n: 0 };
    growthPass(s, createTickCtx(s));
    expect(s.buildings.length).toBe(before);
    for (const g of s.lots.filter((l) => l.kind === 'garden')) expect(g.buildingId).toBe(0);
  });

  it('are not made on an open block: a street with no street behind it has none', () => {
    const { state: s } = villageFixture();
    paintZone(s, 'homes-medium', [67, 71, 83, 79]);
    zoneNow(s);
    expect(s.lots.some((l) => l.kind === 'garden')).toBe(false);
    expect(lotsIn(s, [67, 71, 83, 79]).length).toBeGreaterThan(0);
  });

  it('go when a side street goes; occupied lots stay and only empty lots are released', () => {
    const s = closedBlock();
    expect(s.lots.some((l) => l.kind === 'garden')).toBe(true);
    // Build on lots along street B and the back street (never the east street we take away).
    const built = growSome(s, 4, (l) => l.x + l.w < 82 && l.z + l.d > 71);
    expect(built.length).toBeGreaterThan(1);
    const held = hold(built);
    const emptyBefore = new Set(s.lots.filter((l) => !l.buildingId).map((l) => l.id));
    const buildingsBefore = s.buildings.length;

    // The east street goes (z 71 to 79, between street B and the back street).
    for (let z = 71; z <= 79; z++) s.map.road[z * S + 84] = 0;
    s.networkVersion++;
    const { ctx } = zoneNow(s);

    expect(s.lots.filter((l) => l.kind === 'garden').length, mapOf(s, [62, 56, 90, 84])).toBe(0);
    expect(s.buildings.length).toBe(buildingsBefore);
    for (const h of held) {
      const l = findById(s.lots, h.id)!;
      expect(l, `lot ${h.id} survives`).toBeDefined();
      expect(hold([l])[0]).toEqual(h);
      expect(findById(s.buildings, l.buildingId)).toBeDefined();
    }
    // Only empty lots were released.
    const removed = ctx.events.filter(
      (e): e is Extract<SimEvent, { e: 'lot.removed' }> => e.e === 'lot.removed',
    );
    expect(removed.length).toBeGreaterThan(0);
    for (const e of removed) expect(emptyBefore.has(e.id)).toBe(true);
    // And the lot layer still agrees with the lots.
    for (const l of s.lots)
      for (let z = l.z; z < l.z + l.d; z++)
        for (let x = l.x; x < l.x + l.w; x++) expect(s.map.lot[z * S + x]).toBe(l.id);
  });

  it('come back when the street does, and a second pass changes nothing', () => {
    const s = closedBlock();
    const gardens = s.lots.filter((l) => l.kind === 'garden').length;
    for (let z = 71; z <= 79; z++) s.map.road[z * S + 84] = 0;
    s.networkVersion++;
    zoneNow(s);
    expect(s.lots.some((l) => l.kind === 'garden')).toBe(false);
    for (let z = 71; z <= 79; z++) s.map.road[z * S + 84] = Road.street;
    s.networkVersion++;
    zoneNow(s);
    expect(s.lots.filter((l) => l.kind === 'garden').length).toBe(gardens);
    const again = zoneNow(s);
    expect(again.added).toBe(0);
    expect(again.removed).toBe(0);
  });
});

describe('corner lots', () => {
  const CX = 130;
  const CZ = 120;
  /** The four quadrants of the crossing, each a 8 by 6 block of row zone against the corner. */
  const QUADS: { name: string; rect: [number, number, number, number]; zone: string }[] = [
    { name: 'nw', rect: [CX - 8, CZ - 6, CX - 1, CZ - 1], zone: 'homes-medium' },
    { name: 'ne', rect: [CX + 1, CZ - 6, CX + 8, CZ - 1], zone: 'shops' },
    { name: 'sw', rect: [CX - 8, CZ + 1, CX - 1, CZ + 6], zone: 'shops' },
    { name: 'se', rect: [CX + 1, CZ + 1, CX + 8, CZ + 6], zone: 'homes-medium' },
  ];

  function crossing(zRoad: number, xRoad: number): WorldState {
    const { state: s } = villageFixture();
    roadX(s, CZ, CX - 14, CX + 14, zRoad);
    roadZ(s, CX, CZ - 12, CZ + 12, xRoad);
    // The crossing tile itself belongs to the busier road.
    s.map.road[CZ * S + CX] = Math.max(zRoad, xRoad);
    for (const q of QUADS) paintZone(s, q.zone, q.rect);
    zoneNow(s);
    return s;
  }

  function cornersIn(s: WorldState, rect: [number, number, number, number]): Lot[] {
    return lotsIn(s, rect).filter((l) => l.corner);
  }

  function checkCorner(s: WorldState, l: Lot, label: string): void {
    expect(l.frontage2, label).toBeDefined();
    const f1 = l.frontage;
    const f2 = l.frontage2!;
    expect(isRoad(s, f1), label).toBe(true);
    expect(isRoad(s, f2), label).toBe(true);
    expect(f1, label).not.toBe(f2);
    // They lie on different roads: one beside the lot's front, one beside its side (so one on the row
    // street, one on the cross street).
    const [x1, z1] = [f1 % S, Math.floor(f1 / S)];
    const [x2, z2] = [f2 % S, Math.floor(f2 / S)];
    const onZ = (z: number) => z === CZ;
    const onX = (x: number) => x === CX;
    expect((onZ(z1) && onX(x2)) || (onX(x1) && onZ(z2)), `${label} f1=${x1},${z1} f2=${x2},${z2}`).toBe(true);
    // Both within one level of the lot's ground.
    const ground = s.map.height[l.z * S + l.x]!;
    expect(Math.abs(s.map.height[f1]! - ground), label).toBeLessThanOrEqual(1);
    expect(Math.abs(s.map.height[f2]! - ground), label).toBeLessThanOrEqual(1);
    // frontage2 is beside the lot (touching a side of it, not its front).
    const near = (x: number, z: number): boolean => {
      const dx = x < l.x ? l.x - x : x >= l.x + l.w ? x - (l.x + l.w - 1) : 0;
      const dz = z < l.z ? l.z - z : z >= l.z + l.d ? z - (l.z + l.d - 1) : 0;
      return dx + dz === 1;
    };
    expect(near(x1, z1), label).toBe(true);
    expect(near(x2, z2), label).toBe(true);
  }

  it('gives each quadrant of a street crossing exactly one corner lot, with two frontages', () => {
    const s = crossing(Road.street, Road.street);
    for (const q of QUADS) {
      const label = `${q.name}${mapOf(s, [CX - 12, CZ - 8, CX + 12, CZ + 8])}`;
      const corners = cornersIn(s, q.rect);
      expect(corners.length, label).toBe(1);
      checkCorner(s, corners[0]!, label);
      // The corner lot is the end of a row: it stands against the cross street.
      expect(corners[0]!.row, label).not.toBe(0);
    }
    expect(s.lots.filter((l) => l.corner).length).toBe(4);
    // Only corner lots carry a second frontage.
    for (const l of s.lots) expect(l.frontage2 !== undefined, `lot ${l.id}`).toBe(!!l.corner);
  });

  it('keeps the entrance on the busier road: a street beside a lane', () => {
    // The z road is a street, the x road a lane: lots face the street, the lane is the side road.
    const s = crossing(Road.street, Road.lane);
    for (const q of QUADS) {
      const label = `${q.name}${mapOf(s, [CX - 12, CZ - 8, CX + 12, CZ + 8])}`;
      const corners = cornersIn(s, q.rect);
      expect(corners.length, label).toBe(1);
      const l = corners[0]!;
      checkCorner(s, l, label);
      expect(s.map.road[l.frontage], label).toBe(Road.street);
      expect(s.map.road[l.frontage2!], label).toBe(Road.lane);
    }
    // And the other way round: the x road is the street.
    const t = crossing(Road.lane, Road.street);
    for (const q of QUADS) {
      const label = `${q.name}${mapOf(t, [CX - 12, CZ - 8, CX + 12, CZ + 8])}`;
      const corners = cornersIn(t, q.rect);
      expect(corners.length, label).toBe(1);
      const l = corners[0]!;
      checkCorner(t, l, label);
      expect(t.map.road[l.frontage], label).toBe(Road.street);
      expect(t.map.road[l.frontage2!], label).toBe(Road.lane);
    }
  });

  it('keeps the entrance on an avenue when it crosses a street', () => {
    for (const [zRoad, xRoad] of [
      [Road.avenue, Road.street],
      [Road.street, Road.avenue],
    ] as const) {
      const s = crossing(zRoad, xRoad);
      for (const q of QUADS) {
        const label = `${q.name} z=${zRoad} x=${xRoad}${mapOf(s, [CX - 12, CZ - 8, CX + 12, CZ + 8])}`;
        const corners = cornersIn(s, q.rect);
        expect(corners.length, label).toBe(1);
        const l = corners[0]!;
        checkCorner(s, l, label);
        expect(s.map.road[l.frontage], label).toBe(Road.avenue);
        expect(s.map.road[l.frontage2!], label).toBe(Road.street);
      }
    }
  });

  it('has no corner lot where a row zone meets only a lane crossing a lane', () => {
    const s = crossing(Road.lane, Road.lane);
    expect(s.lots.filter((l) => l.corner || l.row !== 0).length).toBe(0);
  });

  it('marks a lot a corner on a higher level only when the cross road is within one level', () => {
    const s = crossing(Road.street, Road.street);
    const nw = QUADS[0]!;
    const before = cornersIn(s, nw.rect)[0]!;
    expect(before).toBeDefined();
    // Raise the whole cross road a level and a half above the lot ground: no second frontage there.
    for (let z = CZ - 12; z <= CZ + 12; z++) s.map.height[z * S + CX] = 5;
    s.networkVersion++;
    zoneNow(s);
    for (const l of cornersIn(s, nw.rect)) checkCorner(s, l, 'after raise');
    for (const l of lotsIn(s, nw.rect)) {
      if (l.frontage2 !== undefined)
        expect(Math.abs(s.map.height[l.frontage2]! - s.map.height[l.z * S + l.x]!)).toBeLessThanOrEqual(1);
    }
  });
});

describe('the pass is idempotent', () => {
  it('a second pass right after adds, removes and emits nothing', () => {
    const { state: s } = villageFixture();
    closedBlockRoads(s);
    paintBlockZones(s);
    paintZone(s, 'homes-medium', [68, 71, 70, 73]);
    const first = zoneNow(s);
    expect(first.added).toBeGreaterThan(0);
    const lots = JSON.stringify(s.lots);
    const layer = s.map.lot.slice();
    const next = s.nextId;
    const again = zoneNow(s);
    expect(again.added).toBe(0);
    expect(again.removed).toBe(0);
    const lotEvents = again.ctx.events.filter((e) => e.e.startsWith('lot.'));
    expect(lotEvents).toEqual([]);
    expect(JSON.stringify(s.lots)).toBe(lots);
    expect(s.map.lot).toEqual(layer);
    expect(s.nextId).toBe(next);
    // Three more in a row.
    for (let k = 0; k < 3; k++) {
      const more = zoneNow(s);
      expect(more.added + more.removed).toBe(0);
      expect(more.ctx.events.filter((e) => e.e.startsWith('lot.'))).toEqual([]);
    }
    expect(s.nextId).toBe(next);
  });

  it('keeps ids when a lot is cut again exactly in place (a pass after a building is added elsewhere)', () => {
    const { state: s } = villageFixture();
    closedBlockRoads(s);
    paintBlockZones(s);
    zoneNow(s);
    const ids = s.lots.map((l) => `${l.id}:${l.row}:${l.kind}`).sort();
    // Paint zone the same again over the same tiles and over its neighbors: nothing new to cut.
    for (const [zone, rect] of BLOCK_ZONES) paintZone(s, zone, rect);
    zoneNow(s);
    expect(s.lots.map((l) => `${l.id}:${l.row}:${l.kind}`).sort()).toEqual(ids);
  });
});

describe('the cut does not depend on the order of painting', () => {
  type Step = (s: WorldState) => void;
  const crossStreet: Step = (s) => roadZ(s, 84, 58, 82);
  const backAndWest: Step = (s) => {
    for (let x = 66; x <= 84; x++) s.map.road[80 * S + x] = Road.street;
    for (let z = 71; z < 80; z++) s.map.road[z * S + 66] = Road.street;
    s.networkVersion++;
  };
  /** The east street without street B's tile (the fixture already has it). */
  const east: Step = (s) => {
    for (let z = 58; z <= 82; z++) if (z !== 70) s.map.road[z * S + 84] = Road.street;
    s.networkVersion++;
  };
  const zonesWhole: Step = (s) => paintBlockZones(s);
  const zonesStrips =
    (reverse: boolean): Step =>
    (s) => {
      for (const [zone, rect] of BLOCK_ZONES) {
        const strips: [number, number, number, number][] = [];
        for (let z = rect[1]; z <= rect[3]; z++) strips.push([rect[0], z, rect[2], z]);
        if (reverse) strips.reverse();
        for (const r of strips) paintZone(s, zone, r);
      }
    };

  function build(
    steps: Step[],
    passes: 'each' | 'end',
  ): { state: WorldState; sig: ReturnType<typeof signature> } {
    const { state: s } = villageFixture();
    for (const step of steps) {
      step(s);
      if (passes === 'each') zoneNow(s);
    }
    zoneNow(s);
    zoneNow(s);
    return { state: s, sig: signature(s) };
  }

  const baseline = build([east, backAndWest, zonesWhole], 'end');

  it('has lots to compare', () => {
    expect(baseline.sig.lots.length).toBeGreaterThan(20);
    expect(baseline.sig.rows.length).toBeGreaterThan(2);
    expect(baseline.state.lots.some((l) => l.kind === 'garden')).toBe(true);
  });

  const cases: [string, Step[], 'each' | 'end'][] = [
    ['zones before roads', [zonesWhole, east, backAndWest], 'end'],
    ['zones before roads, a pass after each step', [zonesWhole, east, backAndWest], 'each'],
    ['roads before zones, a pass after each step', [east, backAndWest, zonesWhole], 'each'],
    ['strips of zone in order', [east, backAndWest, zonesStrips(false)], 'each'],
    ['strips of zone in reverse', [east, backAndWest, zonesStrips(true)], 'each'],
    ['strips in reverse, zones first', [zonesStrips(true), backAndWest, east], 'each'],
    ['the cross street last', [backAndWest, zonesWhole, crossStreet], 'each'],
    ['the cross street last, one pass at the end', [backAndWest, zonesWhole, crossStreet], 'end'],
    ['the cross street first, zones in reverse strips', [crossStreet, zonesStrips(true), backAndWest], 'end'],
  ];
  for (const [name, steps, passes] of cases) {
    it(`cuts the same lots: ${name}`, () => {
      const got = build(steps, passes);
      expect(got.sig.lots).toEqual(baseline.sig.lots);
      expect(got.sig.rows).toEqual(baseline.sig.rows);
    });
  }
});

describe('occupied lots are never disturbed', () => {
  it('keeps x, z, w, d, rot, frontage and building through an extended street, repainted zones and a new cross street', () => {
    const { state: s } = villageFixture();
    closedBlockRoads(s);
    paintBlockZones(s);
    zoneNow(s);
    const built = growSome(s, 5, (l) => l.kind === 'plot' && l.row !== 0);
    expect(built.length).toBeGreaterThanOrEqual(3);
    const held = hold(built);
    const check = (what: string): void => {
      for (const h of held) {
        const l = findById(s.lots, h.id);
        expect(l, `${what}: lot ${h.id}`).toBeDefined();
        expect(hold([l!])[0], what).toEqual(h);
        const b = findById(s.buildings, h.buildingId);
        expect(b?.lot, what).toBe(h.id);
        expect(l!.kind).toBe('plot');
      }
      // The lot layer still shows each occupied lot.
      for (const h of held)
        for (let z = h.z; z < h.z + h.d; z++)
          for (let x = h.x; x < h.x + h.w; x++) expect(s.map.lot[z * S + x], what).toBe(h.id);
    };
    check('after growing');
    const standing = s.buildings.filter((b) => b.lot).length;

    // A column of the block no occupied lot touches, for the new cross street.
    const taken = new Set<number>();
    for (const h of held) for (let x = h.x; x < h.x + h.w; x++) taken.add(x);
    let col = -1;
    for (let x = 70; x <= 80; x++) if (!taken.has(x - 1) && !taken.has(x) && !taken.has(x + 1)) col = x;

    // 1. The back street runs on west.
    roadX(s, 80, 50, 65);
    zoneNow(s);
    check('after extending the back street');
    // 2. More ground zoned beside it, and the old zones painted again.
    paintZone(s, 'homes-medium', [52, 81, 65, 83]);
    paintBlockZones(s);
    zoneNow(s);
    check('after repainting zones');
    // 3. A cross street through the block, where nothing stands.
    if (col >= 0) {
      for (let z = 71; z <= 79; z++) if (!s.map.occupant[z * S + col]) s.map.road[z * S + col] = Road.street;
      s.networkVersion++;
      zoneNow(s);
      check('after a cross street');
    }
    // 4. Street B grows a branch north.
    roadZ(s, 76, 60, 69);
    zoneNow(s);
    check('after a branch');
    // 5. Everything cleared of zone and painted anew in reverse.
    zoneNow(s);
    check('after a quiet pass');
    expect(s.buildings.filter((b) => b.lot).length).toBe(standing);
  });

  it('keeps an occupied lot when the road that fed it goes (the building stays; nothing is cut from under it)', () => {
    const { state: s } = villageFixture();
    paintZone(s, 'homes-medium', [68, 71, 95, 73]);
    zoneNow(s);
    const [one] = growSome(s, 1);
    expect(one).toBeDefined();
    const h = hold([one!]);
    // Take street B's tiles away elsewhere along the row (not the ones in front of the building).
    for (let x = 86; x <= 95; x++) s.map.road[70 * S + x] = 0;
    s.networkVersion++;
    zoneNow(s);
    expect(hold([findById(s.lots, h[0]!.id)!])).toEqual(h);
    // Rows are still numbered over what stands.
    for (const [, list] of rowsOf(s)) {
      for (let i = 1; i < list.length; i++)
        expect(along(list[i - 1]!) + span(list[i - 1]!)).toBeLessThanOrEqual(along(list[i]!));
    }
  });
});
