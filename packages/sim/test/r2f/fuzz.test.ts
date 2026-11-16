import { content } from '@qoti/content';
// R2F: random street grids against the cutter's invariants (task 5 and the acceptance list): the same
// lots whatever the order of painting, a pass that finds nothing the second time, a lot layer that
// agrees with the lots, rows that touch, corners and gardens that are valid.
import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { villageFixture } from '../fixtures/village';
import { frontageMap, zoneNow } from '../growth/helpers';
import { scene } from './fuzzScene';
import { along, rowsOf, S, signature, span } from './helpers';

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
    // From the player's chair: lots wider than the zone's commonest width hold a building a tile short
    // of its neighbor, so a row takes another width at most once (where it will not come out even).
    const shapes = content.zoneByValue.get(list[0]!.zone)!.roads!.street!.lots;
    const weight = new Map<number, number>();
    for (const sh of shapes) weight.set(sh.size[0], (weight.get(sh.size[0]) ?? 0) + sh.weight);
    const common = [...weight].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0]![0];
    const odd = list.filter((l) => span(l) !== common).length;
    expect(
      odd,
      `${label} row ${list[0]!.row} has ${odd} lots off the common width${view()}`,
    ).toBeLessThanOrEqual(1);
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

/** The lots streets manage (rows and gardens), by where they stand. */
function streetLots(s: WorldState): string[] {
  const keep = { ...s, lots: s.lots.filter((l) => l.row !== 0 || l.kind === 'garden') };
  return signature(keep).lots;
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

      // A pass after every stroke, roads and zones interleaved in reverse: the lots streets manage
      // (rows and gardens) come out the same. Lanes keep C4B's cut, which depends on what stood
      // first, so only the streets' lots are compared.
      const d = villageFixture().state;
      const sd = scene(seed, d);
      const strokes = [...sd.zones, ...sd.roads].reverse();
      strokes.forEach((f, k) => {
        f();
        zoneNow(d);
        if (k % 2 === 1) verify(d, `seed ${seed} stroke ${k}`);
      });
      zoneNow(d);
      verify(d, `seed ${seed} a pass a stroke`);
      expect(
        streetLots(d),
        `seed ${seed} a pass a stroke\n${frontageMap(a, VIEW)}\n\n${frontageMap(d, VIEW)}`,
      ).toEqual(streetLots(a));
      expect(signature(d).rows).toEqual(expected.rows);
    });
  }
});
