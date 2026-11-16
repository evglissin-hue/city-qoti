// R2F acceptance: a grown Village street (docs/build/cycle-r2f-street-lots.md). The full sim runs a few
// days on a street grid with stocked stores; real growth is slow there (a Village's demand asks for a
// building every few days), so the rest of the lots go up by hand in the order growth would offer them,
// each day through the full sim (builders, the hourly zoning pass, the storeys refit).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Lot, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { findById } from '../../src/state/entities';
import { MAX_STOREYS } from '../../src/systems/zoning/storeys';
import { growStreetsFilled, streetsFixture } from '../fixtures/streets';
import { frontageMap } from '../growth/helpers';
import { along, rowsOf, S, span } from './helpers';

const VIEW: [number, number, number, number] = [62, 56, 90, 84];
const view = (s: WorldState): string => '\n' + frontageMap(s, VIEW);

const storeysOf = (s: WorldState, l: Lot): number | undefined => findById(s.buildings, l.buildingId)?.storeys;
const touch = (a: Lot, b: Lot): boolean => along(a) + span(a) === along(b) || along(b) + span(b) === along(a);

describe('a grown street', () => {
  let state: WorldState;
  it(
    'grows (3 days of the full sim, then 14 more with the rest by hand in growth order)',
    { timeout: 90_000 },
    () => {
      const f = streetsFixture();
      const t0 = performance.now();
      growStreetsFilled(f, 3, 14, 3);
      const ms = performance.now() - t0;
      state = f.state;
      const plots = state.lots.filter((l) => l.kind === 'plot' && l.row !== 0);
      const built = plots.filter((l) => l.buildingId);
      expect(plots.length).toBeGreaterThan(20);
      // Most lots are full.
      expect(built.length / plots.length, view(state)).toBeGreaterThanOrEqual(0.8);
      expect(ms).toBeLessThan(60_000);
    },
  );

  it('has every lot on a street frontage of a row zone in a row that touches its neighbors', () => {
    const rows = rowsOf(state);
    expect(rows.size).toBeGreaterThanOrEqual(3);
    for (const l of state.lots) {
      if (l.kind !== 'plot') continue;
      const zone = content.zoneByValue.get(l.zone);
      if (zone?.roads?.street?.row && state.map.road[l.frontage]! >= Road.street) {
        expect(l.row, `lot ${l.x},${l.z}${view(state)}`).not.toBe(0);
      }
    }
    for (const list of rows.values()) {
      for (let i = 1; i < list.length; i++) {
        expect(touch(list[i - 1]!, list[i]!), `row ${list[0]!.row}${view(state)}`).toBe(true);
      }
    }
  });

  it('has a garden lot in its closed block', () => {
    const gardens = state.lots.filter((l) => l.kind === 'garden');
    expect(gardens.length, view(state)).toBeGreaterThan(0);
    for (const g of gardens) expect(g.buildingId).toBe(0);
    expect(gardens.some((g) => g.x >= 67 && g.x <= 83 && g.z >= 71 && g.z <= 79)).toBe(true);
  });

  it('leaves nothing alone on a lawn: in a row with two or more built lots, each touches another built one', () => {
    for (const list of rowsOf(state).values()) {
      const built = list.filter((l) => l.buildingId);
      if (built.length < 2) continue;
      for (const l of built) {
        const next = built.some((o) => o !== l && touch(l, o));
        expect(next, `lot ${l.x},${l.z} in row ${l.row}${view(state)}`).toBe(true);
      }
    }
  });

  it('steps its storeys by at most one between built neighbors, and never above four', () => {
    let pairs = 0;
    for (const list of rowsOf(state).values()) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i]!;
        const sa = storeysOf(state, a);
        if (sa !== undefined) {
          expect(sa).toBeLessThanOrEqual(MAX_STOREYS);
          expect(sa).toBeGreaterThan(0);
        }
        const b = list[i + 1];
        if (!b || !touch(a, b)) continue;
        const sb = storeysOf(state, b);
        if (sa === undefined || sb === undefined) continue;
        pairs++;
        expect(Math.abs(sa - sb), `lots ${a.x},${a.z} and ${b.x},${b.z}`).toBeLessThanOrEqual(1);
      }
    }
    expect(pairs).toBeGreaterThan(8);
    for (const b of state.buildings)
      if (b.storeys !== undefined) expect(b.storeys).toBeLessThanOrEqual(MAX_STOREYS);
  });

  it('keeps the lot layer in step with the lots', () => {
    for (const l of state.lots)
      for (let z = l.z; z < l.z + l.d; z++)
        for (let x = l.x; x < l.x + l.w; x++) expect(state.map.lot[z * S + x]).toBe(l.id);
  });
});
