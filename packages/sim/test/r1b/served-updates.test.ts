// R1X E2: a specialized building's served count reaches the Businesses book when a business in its
// reach goes (demolished) or changes to a trade it does not enable, not only when one comes.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Building, GameEvent, WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { insertBuilding } from '../../src/state/place';
import { served } from '../../src/systems/specialized/api';
import { retool } from '../../src/systems/growth/retool';
import { doorTile } from '../../src/systems/movement/api';
import { createTickCtx } from '../../src/turn';
import { flatWorld, run, S } from '../helpers';

const def = (id: string) => content.buildingById.get(id)!;

function put(s: WorldState, id: string, x: number, z: number, trade?: string): Building {
  return insertBuilding(s, null, def(id), x, z, 0, 0, { site: false, ...(trade !== undefined && { trade }) });
}

/** A windmill with a road along its door and two bakers beside it, all in reach. */
function town(): { s: WorldState; mill: Building; a: Building; b: Building } {
  const s = flatWorld();
  const mill = put(s, 'windmill', 30, 50);
  const a = put(s, 'workshop', 36, 50, 'baker');
  const b = put(s, 'workshop', 42, 50, 'baker');
  const z = Math.floor(doorTile(mill) / S);
  for (let x = 28; x < 50; x++) s.map.road[z * S + x] = Road.lane;
  s.networkVersion += 1;
  return { s, mill, a, b };
}

function millUpdates(events: readonly GameEvent[], id: number) {
  return events
    .filter((e) => e.e === 'business.updated' && e.b.id === id)
    .map((e) => (e as never as { b: { served?: { count: number } } }).b);
}

describe('served count updates', () => {
  it('tells the windmill when a baker in its reach is demolished', () => {
    const { s, mill, a, b } = town();
    expect(content.buildingById.get('windmill')!.enables).toContain('baker');
    expect(served(s, mill)).toBe(2);
    const before = run(s, { t: 'build.remove', ids: [b.id] });
    const ups = millUpdates(before.events, mill.id);
    expect(ups.length).toBeGreaterThan(0);
    expect(ups[ups.length - 1]!.served?.count).toBe(1);
    expect(s.buildings.some((x) => x.id === a.id)).toBe(true);
  });

  it('tells the windmill when a baker retools to a trade it does not enable', () => {
    const { s, mill, a } = town();
    const ctx = createTickCtx(s);
    retool(s, ctx, a, content.tradeById.get('weaver')!);
    const ups = millUpdates(ctx.events, mill.id);
    expect(ups.length).toBe(1);
    expect(ups[0]!.served?.count).toBe(1);
  });
});
