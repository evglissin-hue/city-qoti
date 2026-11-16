// R2E: the land advisor cobbles the village core when Cobbles is open, and lays a lane when it is not
// (then cobbles the lane once Cobbles opens). Cobbles is unlocked by hand in a short run.
import { content } from '@qoti/content';
import { MAP_SIZE, PENNIES_PER_COIN, type WorldState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay } from '../autoplay';

const VILLAGE_DAY = 12;
const stone = content.goodIndex.get('stone')!;

/** Stone in the first standing storehouse (the road draws from storehouses) and coins in the till. */
function stock(w: WorldState): void {
  const store = w.buildings.find((b) => b.def === 'storehouse' && b.stage === 'built');
  if (store?.rt) store.rt.store[stone] = (store.rt.store[stone] ?? 0) + 200;
  w.economy.treasury = Math.max(w.economy.treasury, 800 * PENNIES_PER_COIN);
}

function setCobbles(w: WorldState, open: boolean): void {
  const i = w.innovations.find((x) => x.id === 'cobbles');
  if (i) i.unlockedTick = open ? Math.max(0, i.unlockedTick) : -1;
}

describe('the land advisor lays streets', { timeout: 120_000 }, () => {
  it('cobbles the village street when Cobbles is open', () => {
    const run = autoplay('hazel', VILLAGE_DAY + 2, {
      villageDay: VILLAGE_DAY,
      onDay: (w, line) => {
        if (line.day >= VILLAGE_DAY - 3) {
          setCobbles(w, true);
          stock(w);
        }
      },
    });
    const lay = run.decisions.find((d) => d.label === 'lay the village street' && d.ok);
    expect(lay, run.actions.join('\n')).toBeTruthy();
    expect(lay!.cmd).toMatchObject({ t: 'road.paint', kind: 'street' });
    // The founding street stays a lane.
    const first = run.decisions.find((d) => d.label === 'lay the high street' && d.ok);
    expect(first!.cmd).toMatchObject({ t: 'road.paint', kind: 'lane' });
  });

  it('lays a lane without Cobbles, and cobbles it once Cobbles opens', () => {
    // Cobbles may open on its own before the village street (hazel's stone rate): hold it shut.
    let shut = true;
    const run = autoplay('hazel', VILLAGE_DAY + 4, {
      villageDay: VILLAGE_DAY,
      onHour: (w) => {
        if (shut) setCobbles(w, false);
      },
      onDay: (w, line) => {
        if (line.day >= VILLAGE_DAY) {
          shut = false;
          setCobbles(w, true);
          stock(w);
        }
      },
    });
    const lay = run.decisions.find((d) => d.label === 'lay the village street' && d.ok);
    expect(lay, run.actions.join('\n')).toBeTruthy();
    expect(lay!.cmd).toMatchObject({ t: 'road.paint', kind: 'lane' });
    const cobble = run.decisions.find((d) => d.label === 'cobble the village street' && d.ok);
    expect(cobble, run.actions.join('\n')).toBeTruthy();
    expect(cobble!.cmd).toMatchObject({ t: 'road.paint', kind: 'street' });
    expect(cobble!.day).toBeGreaterThan(lay!.day);
  });

  it('lays one closed ring of street with homes-medium zoned inside, once the village street is cobbled', () => {
    const run = autoplay('hazel', VILLAGE_DAY + 8, {
      villageDay: VILLAGE_DAY,
      onDay: (w, line) => {
        if (line.day >= VILLAGE_DAY - 3) {
          setCobbles(w, true);
          stock(w);
        }
      },
    });
    const w = run.hamlet.world;
    const lay = run.decisions.find((d) => d.label === 'lay a block of streets' && d.ok);
    expect(lay, run.actions.join('\n')).toBeTruthy();
    expect(lay!.cmd).toMatchObject({ t: 'road.paint', kind: 'street' });
    expect(run.decisions.filter((d) => d.label === 'lay a block of streets' && d.ok)).toHaveLength(1);
    const tiles = (lay!.cmd as { tiles: [number, number][] }).tiles;
    // The ring: each tile touches the next, the last touches the first, and the ground is street now.
    const n = tiles.findIndex(
      ([x, z], k) => k > 0 && Math.abs(x - tiles[k - 1]![0]) + Math.abs(z - tiles[k - 1]![1]) !== 1,
    );
    const ring = n < 0 ? tiles : tiles.slice(0, n);
    const [fx, fz] = ring[0]!;
    const [lx, lz] = ring[ring.length - 1]!;
    expect(Math.abs(fx - lx) + Math.abs(fz - lz)).toBe(1);
    for (const [x, z] of tiles) expect(w.map.road[z * MAP_SIZE + x]).toBe(3);
    // The inside is zoned homes-medium (shops on the side nearest the village street, when lit).
    const xs = ring.map((t) => t[0]);
    const zs = ring.map((t) => t[1]);
    const mx = (Math.min(...xs) + Math.max(...xs)) >> 1;
    const mz = (Math.min(...zs) + Math.max(...zs)) >> 1;
    expect(w.map.zone[(Math.min(...zs) + 1) * MAP_SIZE + mx]).toBeGreaterThan(0);
    expect(w.map.zone[mz * MAP_SIZE + Math.min(...xs) + 1]).toBeGreaterThan(0);
    const zoned = run.decisions.find((d) => d.label === 'zone the block' && d.ok);
    expect(zoned, run.actions.join('\n')).toBeTruthy();
    // One road.paint for the ring and a few zone.paint strokes: a handful of decisions.
    expect(run.decisions.filter((d) => d.ok && /block/.test(d.label)).length).toBeLessThanOrEqual(4);
  });
});
