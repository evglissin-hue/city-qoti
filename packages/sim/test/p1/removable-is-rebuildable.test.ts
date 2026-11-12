// The dead-end hunt's class for P1's soft lock (a town hall that could be removed but not rebuilt):
// for every building def a standard valley's player can take down, either the removal is refused
// or the def can be placed again, by the real commands, on the ground it freed.
import { content, type BuildingDef } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../../src/constants';
import type { Building, Rot4, WorldState } from '../../src/contracts';
import { canPlaceBuilding } from '../../src/rules/building';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { townReachesDoor } from '../../src/state/reach';
import { worldIndex } from '../../src/state/worldIndex';
import { placeableNow } from '../../src/systems/hearth/wishes/achievable';
import { createValley, defaultSettings } from '../../src/state/create';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';

/** A free spot for a def: open ground the town can walk to. */
function spotFor(state: WorldState, def: BuildingDef): [number, number, Rot4] | null {
  const reader = worldIndex(state).reader;
  for (let z = 4; z < MAP_SIZE - 4; z++) {
    for (let x = 4; x < MAP_SIZE - 4; x++) {
      const ok = canPlaceBuilding(reader, def, x, z, 0);
      if (ok.ok && townReachesDoor(state, { def: def.id, x, z, rot: 0 })) return [x, z, 0];
    }
  }
  return null;
}

describe('whatever can be removed can be rebuilt', () => {
  const defs = content.buildings;

  it('walks every building def', () => {
    expect(defs.length).toBeGreaterThan(30);
  });

  for (const def of defs) {
    it(`${def.id}: removal is refused, or it can be placed again`, () => {
      // The hamlet fixture's flat ground, or, for what only goes on a riverbank, in clay or in
      // rock (the quarry, the dock, the bridge), a real generated valley.
      let s = hamletFixture().state;
      let spot = spotFor(s, def);
      if (!spot) {
        s = createValley('meadow', { ...defaultSettings(), mode: 'standard' });
        spot = spotFor(s, def);
      }
      s.economy.treasury = 1_000_000;
      s.economy.leanTimes = false;
      // No room in the fixture is a gap in this test, not a pass: say so.
      expect(spot, `no room to try ${def.id}`).not.toBeNull();
      const [x, z, rot] = spot!;
      const wasPlaceable = placeableNow(s, def);
      // A fixture's own copy may stand where its site rule (open ground) no longer allows it: take
      // the legal spot found above instead.
      const ownSiteRules = !def.placement?.some((r) => r.kind === 'openGround');
      let b: Building | undefined = ownSiteRules
        ? s.buildings.find((o) => o.def === def.id && o.stage === 'built')
        : undefined;
      if (!b) b = insertBuilding(s, null, def, x, z, rot, 0, { site: false });
      const ctx = run(s, { t: 'build.remove', ids: [b.id] });
      if (rejection(ctx)) return;
      expect(findById(s.buildings, b.id), `${def.id} was not removed`).toBeUndefined();
      // Not placeable at all (a grown-only def, a rank or innovation not yet earned) before the
      // removal means it is not this test's business; becoming unplaceable by being removed is.
      if (!wasPlaceable) return;
      expect(placeableNow(s, def), `${def.id} cannot be placed again after removal`).toBe(true);
      const again = run(s, { t: 'build.place', def: def.id, x: b.x, z: b.z, rot: b.rot });
      expect(rejection(again), `${def.id} refused its own spot after removal`).toBeUndefined();
      expect(s.buildings.some((o) => o.def === def.id && o.x === b!.x && o.z === b!.z)).toBe(true);
    });
  }
});
