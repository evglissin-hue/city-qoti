// R2F: the per-road-class lot shapes in content (zones.ts) stay in range and fit a building that grows there.
import { content, type BuildingDef, type LotDef } from '@qoti/content';
import { describe, expect, it } from 'vitest';

/** Buildings that grow on a zone: by their `grows` and by the trades the zone runs. */
function growsOn(zoneId: string): BuildingDef[] {
  const ids = new Set<string>();
  for (const d of content.buildings) if (d.grows?.zone === zoneId) ids.add(d.id);
  for (const t of content.trades) if (t.zone === zoneId) ids.add(t.building);
  return [...ids].map((id) => content.buildingById.get(id)!).filter(Boolean);
}

describe('zone road shapes', () => {
  const withRoads = content.zones.filter((z) => z.roads);
  it('exist for the row zones', () => {
    expect(withRoads.map((z) => z.id)).toEqual(expect.arrayContaining(['homes-medium', 'shops']));
    for (const z of withRoads) expect(z.roads!.street?.row).toBe(true);
  });

  for (const zone of withRoads) {
    for (const [cls, spec] of Object.entries(zone.roads!)) {
      it(`${zone.id} on a ${cls}: widths 1 to 3, depths 2 to 4, each fits a building that grows there`, () => {
        expect(spec.lots.length).toBeGreaterThan(0);
        const defs = growsOn(zone.id);
        expect(defs.length).toBeGreaterThan(0);
        spec.lots.forEach((shape: LotDef) => {
          const [w, d] = shape.size;
          expect(w).toBeGreaterThanOrEqual(1);
          expect(w).toBeLessThanOrEqual(3);
          expect(d).toBeGreaterThanOrEqual(2);
          expect(d).toBeLessThanOrEqual(4);
          expect(shape.weight).toBeGreaterThan(0);
          expect(
            defs.some((def) => def.size[0] <= w && def.size[1] <= d),
            `${zone.id} ${cls} ${w}x${d}`,
          ).toBe(true);
        });
      });
    }
  }
});
