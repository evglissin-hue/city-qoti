// R2F: cutter bugs these tests expose (kept failing on purpose, see the report). Not to be patched here.
import { describe, expect, it } from 'vitest';
import { Road } from '../../src/map/layers';
import { villageFixture } from '../fixtures/village';
import { frontageMap, lotsIn, paintZone, zoneNow } from '../growth/helpers';
import { roadX, roadZ, S, signature } from './helpers';

describe('order of painting with passes in between', () => {
  /** Shops beside a lane, then a street arrives beside the lane's lots: the same as street first? */
  function build(streetFirst: boolean) {
    const { state: s } = villageFixture();
    const zones = () => paintZone(s, 'shops', [125, 119, 135, 123]);
    const lane = () => roadX(s, 120, 112, 135, Road.lane);
    const street = () => roadZ(s, 124, 110, 130, Road.street);
    const steps = streetFirst ? [street, lane, zones] : [zones, lane, street];
    for (const f of steps) {
      f();
      zoneNow(s);
    }
    zoneNow(s);
    return s;
  }

  it('a street built after lane lots stood gets its frontage like one built before', () => {
    const a = build(true);
    const b = build(false);
    const view = `\n${frontageMap(a, [120, 114, 140, 126])}\n\n${frontageMap(b, [120, 114, 140, 126])}`;
    expect(signature(b).lots, view).toEqual(signature(a).lots);
  });

  it('puts a corner lot on the street frontage, not behind an old lane lot', () => {
    const b = build(false);
    const lots = lotsIn(b, [125, 121, 135, 123]);
    expect(
      lots.some((l) => l.row !== 0 && b.map.road[l.frontage] === Road.street && l.frontage % S === 124),
      '\n' + frontageMap(b, [120, 114, 140, 126]),
    ).toBe(true);
  });
});

describe('a corner lot whose side road is busier', () => {
  it('keeps its entrance on the busier road, even where that road is a one-tile stub past the street', () => {
    const { state: s } = villageFixture();
    roadX(s, 116, 112, 140, Road.street);
    // An avenue crossing the street that ends one tile past it.
    roadZ(s, 123, 109, 117, Road.avenue);
    paintZone(s, 'homes-medium', [115, 117, 122, 119]);
    zoneNow(s);
    for (const l of s.lots.filter((l) => l.corner)) {
      expect(
        s.map.road[l.frontage]!,
        `lot ${l.x},${l.z}\n${frontageMap(s, [112, 112, 130, 122])}`,
      ).toBeGreaterThanOrEqual(s.map.road[l.frontage2!]!);
    }
  });
});
