// R2F: random street grids against the cutter's invariants (task 5 and the acceptance list): the same
// lots whatever the order of painting, a pass that finds nothing the second time, a lot layer that
// agrees with the lots, rows that touch, corners and gardens that are valid.
import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { villageFixture } from '../fixtures/village';
import { frontageMap, paintZone, zoneNow } from '../growth/helpers';
import { along, rowsOf, S, signature, span } from './helpers';

/** Roads painted in any order end the same: a crossing tile keeps the busier road. */
function roadX(s: WorldState, z: number, x0: number, x1: number, kind: number): void {
  for (let x = x0; x <= x1; x++) s.map.road[z * S + x] = Math.max(s.map.road[z * S + x]!, kind);
  s.networkVersion++;
}
function roadZ(s: WorldState, x: number, z0: number, z1: number, kind: number): void {
  for (let z = z0; z <= z1; z++) s.map.road[z * S + x] = Math.max(s.map.road[z * S + x]!, kind);
  s.networkVersion++;
}

/** A tiny seeded generator, test-side only. */
function lcg(seed: number): () => number {
  let a = seed * 2654435761 + 12345;
  return () => {
    a = (Math.imul(a, 1103515245) + 12345) >>> 0;
    return (a >>> 8) / (1 << 24);
  };
}

interface Scene {
  roads: (() => void)[];
  zones: (() => void)[];
}

/** A random grid in the free ground east of the river, as steps against one state. */
export function scene(seed: number, s: WorldState): Scene {
  const rnd = lcg(seed);
  const int = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
  const kinds = [Road.street, Road.street, Road.street, Road.avenue, Road.lane];
  const roads: (() => void)[] = [];
  const zones: (() => void)[] = [];
  for (let k = 0; k < int(2, 3); k++) {
    const z = 108 + k * int(8, 14);
    const x0 = int(110, 120);
    const x1 = int(x0 + 14, 150);
    const kind = kinds[int(0, kinds.length - 1)]!;
    roads.push(() => roadX(s, z, x0, x1, kind));
  }
  for (let k = 0; k < int(2, 3); k++) {
    const x = 112 + k * int(8, 14);
    const z0 = int(102, 110);
    const z1 = int(z0 + 14, 150);
    const kind = kinds[int(0, kinds.length - 1)]!;
    roads.push(() => roadZ(s, x, z0, z1, kind));
  }
  const taken: [number, number, number, number][] = [];
  const names = ['homes-medium', 'shops', 'homes-low', 'crafts'];
  for (let k = 0; k < int(3, 6); k++) {
    const x0 = int(108, 150);
    const z0 = int(104, 146);
    const rect: [number, number, number, number] = [
      x0,
      z0,
      Math.min(154, x0 + int(3, 14)),
      Math.min(150, z0 + int(3, 12)),
    ];
    const zone = names[int(0, 1) === 0 ? 0 : int(0, names.length - 1)]!;
    // Zones that overlap are painted over each other, so the last wins: keep the rects apart, so
    // the final zones do not depend on the order of painting.
    if (taken.some((r) => rect[0] <= r[2] && r[0] <= rect[2] && rect[1] <= r[3] && r[1] <= rect[3])) continue;
    taken.push(rect);
    zones.push(() => paintZone(s, zone, rect));
  }
  return { roads, zones };
}

const VIEW: [number, number, number, number] = [104, 100, 156, 152];

export function verify(s: WorldState, label: string): void {
  const view = (): string => '\n' + frontageMap(s, [104, 100, 156, 152]);
  const seen = new Map<number, number>();
  for (const l of s.lots) {
    for (let z = l.z; z < l.z + l.d; z++)
      for (let x = l.x; x < l.x + l.w; x++) {
        const i = z * S + x;
        expect(seen.has(i), `${label} overlap ${x},${z}${view()}`).toBe(false);
        seen.set(i, l.id);
        expect(s.map.lot[i], `${label} layer ${x},${z}${view()}`).toBe(l.id);
        expect(s.map.road[i], `${label} road under lot ${x},${z}${view()}`).toBe(0);
      }
    if (l.kind === 'garden') {
      expect(l.zone).toBe(0);
      expect(l.buildingId).toBe(0);
      expect(l.row).not.toBe(0);
    }
  }
  let layerTiles = 0;
  for (let i = 0; i < S * S; i++) if (s.map.lot[i]) layerTiles++;
  expect(layerTiles, `${label} stray lot tiles`).toBe(seen.size);
  for (const list of rowsOf(s).values()) {
    // A row is one line of lots that touch.
    for (let i = 1; i < list.length; i++) {
      expect(along(list[i - 1]!) + span(list[i - 1]!), `${label} row gap${view()}`).toBe(along(list[i]!));
      expect(list[i]!.zone).toBe(list[0]!.zone);
      expect(list[i]!.rot).toBe(list[0]!.rot);
    }
  }
  for (const l of s.lots) {
    if (l.corner) {
      expect(l.frontage2, `${label} corner without second frontage${view()}`).toBeDefined();
      expect(s.map.road[l.frontage2!]!, `${label} frontage2 not road${view()}`).toBeGreaterThanOrEqual(
        Road.lane,
      );
      expect(s.map.road[l.frontage]!, `${label} frontage not road${view()}`).toBeGreaterThanOrEqual(
        Road.street,
      );
      expect(l.frontage2).not.toBe(l.frontage);
    } else expect(l.frontage2).toBeUndefined();
  }
}

describe('random street grids', () => {
  for (let seed = 1; seed <= 40; seed++) {
    it(`seed ${seed}: valid, idempotent and the same whatever the order of painting`, () => {
      const a = villageFixture().state;
      const sa = scene(seed, a);
      sa.roads.forEach((f) => f());
      sa.zones.forEach((f) => f());
      zoneNow(a);
      verify(a, `seed ${seed} roads first`);
      const again = zoneNow(a);
      expect(again.added + again.removed, `seed ${seed} second pass\n${frontageMap(a, VIEW)}`).toBe(0);
      const expected = signature(a);

      // Zones first, then roads, one pass at the end.
      const b = villageFixture().state;
      const sb = scene(seed, b);
      [...sb.zones, ...sb.roads].forEach((f) => f());
      zoneNow(b);
      verify(b, `seed ${seed} zones first`);
      expect(
        signature(b).lots,
        `seed ${seed} zones first\n${frontageMap(a, VIEW)}\n\n${frontageMap(b, VIEW)}`,
      ).toEqual(expected.lots);
      expect(signature(b).rows).toEqual(expected.rows);

      // Everything reversed, one pass at the end.
      const c = villageFixture().state;
      const sc = scene(seed, c);
      [...sc.zones].reverse().forEach((f) => f());
      [...sc.roads].reverse().forEach((f) => f());
      zoneNow(c);
      zoneNow(c);
      expect(signature(c).lots, `seed ${seed} reversed`).toEqual(expected.lots);
      expect(signature(c).rows).toEqual(expected.rows);
    });
  }
});
