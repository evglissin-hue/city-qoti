// Charm rules (docs/spec/12-hearth.md, Charm): sources with falloff, no spam, variety, clutter,
// enclosure, water, height, paths, lanterns by night, pattern site bonuses and the recompute rules.
import { describe, expect, it } from 'vitest';
import { CHUNKS_PER_SIDE, TICKS_PER_HOUR, TILE_FP } from '../../src/constants';
import { recomputeDirty } from '../../src/systems/hearth/charm';
import { markCharmDirty } from '../../src/systems/hearth/charm/dirty';
import { lanternsLit } from '../../src/systems/hearth/charm/sources';
import { runPatterns } from '../../src/systems/hearth/patterns/engine';
import { advanceTo, createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { run } from '../helpers';
import { build, charm, decor, road, runHours, S, settle, standardWorld, tree } from './helpers';

describe('charm sources', () => {
  it('a bench lifts comfort at its tile and fades to nothing a tile past its radius', () => {
    const w = standardWorld();
    decor(w, 'bench', 120, 30);
    settle(w);
    expect(charm(w, 'charmComfort', 120, 30)).toBe(3);
    expect(charm(w, 'charmComfort', 121, 30)).toBe(2);
    expect(charm(w, 'charmComfort', 122, 30)).toBe(1);
    expect(charm(w, 'charmComfort', 123, 30)).toBe(0);
    // Total adds variety: one decor type within 3 tiles is +2.
    expect(charm(w, 'charm', 120, 30)).toBe(5);
    expect(charm(w, 'charm', 123, 30)).toBe(2);
    expect(charm(w, 'charm', 124, 30)).toBe(0);
  });

  it('fifty benches count as two', () => {
    const two = standardWorld();
    const fifty = standardWorld();
    decor(two, 'bench', 120, 30);
    decor(two, 'bench', 121, 30);
    decor(fifty, 'bench', 120, 30);
    decor(fifty, 'bench', 121, 30);
    // The other 48 crowd around them, every one within reach of the measured tile.
    const ring: [number, number][] = [];
    for (let z = 27; z <= 33; z++) {
      for (let x = 117; x <= 123; x++) {
        const d2 = (x - 120) * (x - 120) + (z - 30) * (z - 30);
        if (d2 >= 2 && d2 <= 8) ring.push([x, z]);
      }
    }
    for (let i = 0; i < 48; i++) decor(fifty, 'bench', ...ring[i % ring.length]!);
    settle(two);
    settle(fifty);
    expect(charm(fifty, 'charmComfort', 120, 30)).toBe(charm(two, 'charmComfort', 120, 30));
    expect(charm(two, 'charmComfort', 120, 30)).toBe(5);
  });

  it('noise from workshops adds up and is stored as a magnitude', () => {
    const one = standardWorld();
    const two = standardWorld();
    build(one, 'sawpit', 130, 40);
    build(two, 'sawpit', 130, 40);
    build(two, 'sawpit', 130, 45);
    settle(one);
    settle(two);
    const a = charm(one, 'charmNoise', 131, 43);
    const b = charm(two, 'charmNoise', 131, 43);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(charm(one, 'charm', 131, 43)).toBe(0);
  });

  it('a construction site is noisy until it is built', () => {
    const w = standardWorld();
    const b = build(w, 'cottage', 130, 40);
    b.stage = 'construction';
    settle(w);
    expect(charm(w, 'charmNoise', 133, 41)).toBe(2);
    b.stage = 'built';
    settle(w);
    expect(charm(w, 'charmNoise', 133, 41)).toBe(0);
  });

  it('variety adds 2 per distinct decor type within 3 tiles, up to 10', () => {
    const w = standardWorld();
    for (const [i, def] of ['barrels', 'crates', 'signpost', 'fence', 'low-wall', 'bench'].entries()) {
      decor(w, def, 140 + (i % 3), 30 + Math.floor(i / 3));
    }
    settle(w);
    const t = charm(w, 'charm', 141, 30);
    const comfort = charm(w, 'charmComfort', 141, 30);
    // Six types would be 12; the cap holds it at 10.
    expect(t - comfort).toBe(10);
  });

  it('more than 12 items within 2 tiles is clutter', () => {
    const tidy = standardWorld();
    const cluttered = standardWorld();
    for (const w of [tidy, cluttered]) {
      const n = w === tidy ? 12 : 13;
      // Packed within a tile or so of the measured tile's center.
      for (let i = 0; i < n; i++) {
        decor(w, 'barrels', 0, 0, 0, {
          fx: 151 * TILE_FP + 128 + ((i % 4) - 1.5) * 90,
          fz: 51 * TILE_FP + 128 + (Math.floor(i / 4) - 1.5) * 90,
        });
      }
    }
    settle(tidy);
    settle(cluttered);
    // Barrels have no charm source: only variety (+2) and clutter (-5) move the total.
    expect(charm(tidy, 'charm', 151, 51)).toBe(2);
    expect(charm(cluttered, 'charm', 151, 51)).toBe(0);
  });

  it('linear pieces are boundaries, not clutter', () => {
    const w = standardWorld();
    for (let x = 150; x < 156; x++) {
      decor(w, 'fence', x, 49);
      decor(w, 'fence', x, 51);
    }
    decor(w, 'fence', 156, 50);
    settle(w);
    expect(charm(w, 'charm', 152, 50)).toBe(2);
  });

  it('an open tile with buildings on three sides within 4 tiles feels enclosed', () => {
    const w = standardWorld();
    build(w, 'cottage', 127, 39);
    build(w, 'cottage', 132, 39);
    settle(w);
    expect(charm(w, 'charm', 130, 40)).toBe(0);
    build(w, 'cottage', 129, 36);
    settle(w);
    expect(charm(w, 'charm', 130, 40)).toBe(5);
    // A one-tile well does not close a square.
    const v = standardWorld();
    build(v, 'cottage', 127, 39);
    build(v, 'cottage', 132, 39);
    build(v, 'well', 130, 37);
    settle(v);
    expect(charm(v, 'charm', 130, 43)).toBe(0);
  });

  it('water in view, height and paths', () => {
    const w = standardWorld();
    w.map.height[60 * S + 150] = 8;
    road(w, 'path', 160, 60, 165, 60);
    settle(w);
    expect(charm(w, 'charmView', 98, 50)).toBe(3);
    expect(charm(w, 'charmView', 99, 50)).toBe(5);
    expect(charm(w, 'charmView', 95, 50)).toBe(0);
    expect(charm(w, 'charm', 100, 50)).toBe(0);
    expect(charm(w, 'charmView', 150, 60)).toBe(3);
    expect(charm(w, 'charmView', 151, 60)).toBe(0);
    expect(charm(w, 'charmComfort', 162, 60)).toBe(1);
    expect(charm(w, 'charmComfort', 162, 61)).toBe(0);
  });

  it('a forest counts its two nearest trees, not all of them', () => {
    const w = standardWorld();
    for (let z = 70; z < 75; z++) for (let x = 140; x < 145; x++) tree(w, x, z);
    settle(w);
    expect(charm(w, 'charmNature', 142, 72)).toBe(5);
  });

  it('window boxes count as a little flower piece', () => {
    const w = standardWorld();
    const b = build(w, 'cottage', 130, 40);
    settle(w);
    const before = charm(w, 'charmNature', 132, 41);
    b.custom = { windowBoxes: true };
    settle(w);
    expect(charm(w, 'charmNature', 132, 41)).toBeGreaterThan(before);
  });
});

describe('lanterns by day and night', () => {
  it('lanterns are lit from 18:00 to 07:00', () => {
    expect(lanternsLit(0)).toBe(true); // 06:00, still dawn
    expect(lanternsLit(TICKS_PER_HOUR)).toBe(false); // 07:00
    expect(lanternsLit(12 * TICKS_PER_HOUR)).toBe(true); // 18:00
    expect(lanternsLit(22 * TICKS_PER_HOUR)).toBe(true); // 04:00
  });

  it('the charm system relights lanterns at dusk and dims them at dawn', () => {
    const w = standardWorld();
    decor(w, 'lantern', 140, 60);
    const ctx = runHours(w, 1); // the first tick, at 06:00, is still lit
    expect(charm(w, 'charmLight', 140, 60)).toBe(6);
    runHours(w, 1, ctx); // past 07:00
    expect(charm(w, 'charmLight', 140, 60)).toBe(2);
    runHours(w, 11, ctx); // past 18:00
    expect(charm(w, 'charmLight', 140, 60)).toBe(6);
    runHours(w, 13, ctx); // past 07:00 the next morning
    expect(charm(w, 'charmLight', 140, 60)).toBe(2);
  });
});

describe('recompute rules', () => {
  it('a Hearth command recomputes on the next tick', () => {
    const w = standardWorld();
    runHours(w, 1);
    expect(w.hearth.dirtyChunks).toEqual([]);
    const ctx = run(w, { t: 'decor.place', def: 'bench', fx: 120 * TILE_FP + 128, fz: 30 * TILE_FP + 128, rot: 0 });
    expect(charm(w, 'charmComfort', 120, 30)).toBe(3);
    expect(w.hearth.charmSoon).toBeUndefined();
    // Clients get patches for the charm layers.
    const layers = new Set(ctx.dirty.collectPatches(w.map).map((p) => p.layer));
    expect(layers.has('charm')).toBe(true);
    expect(layers.has('charmComfort')).toBe(true);
  });

  it('other changes wait for the hourly pass', () => {
    const w = standardWorld();
    runHours(w, 1);
    advanceTo(w, w.lastTurn + 10, createTickCtx(w));
    run(w, { t: 'road.paint', kind: 'path', tiles: [[160, 60]] });
    expect(charm(w, 'charmComfort', 160, 60)).toBe(0);
    expect(w.hearth.dirtyChunks.length).toBeGreaterThan(0);
    runHours(w, 1);
    expect(charm(w, 'charmComfort', 160, 60)).toBe(1);
    expect(w.hearth.dirtyChunks).toEqual([]);
  });

  it('marking spreads to the chunks a change reaches', () => {
    const w = standardWorld();
    markCharmDirty(w, [17, 17, 17, 17]);
    expect(w.hearth.dirtyChunks).toEqual([0, 1, CHUNKS_PER_SIDE, CHUNKS_PER_SIDE + 1]);
    w.hearth.dirtyChunks.length = 0;
    markCharmDirty(w, [40, 40, 40, 40]);
    expect(w.hearth.dirtyChunks).toEqual([2 * CHUNKS_PER_SIDE + 2]);
  });

  it('only marks layers that changed', () => {
    const w = standardWorld();
    settle(w);
    const ctx = createTickCtx(w);
    markCharmDirty(w, [120, 30, 120, 30]);
    recomputeDirty(w, ctx);
    expect(ctx.dirty.collectPatches(w.map)).toHaveLength(0);
  });
});

describe('pattern site bonuses', () => {
  it('the Well Gathering Place lifts charm around the well', () => {
    const f = hamletFixture();
    settle(f.state);
    const before = charm(f.state, 'charm', 57, 53);
    const far = charm(f.state, 'charm', 57, 60);
    runPatterns(f.state, createTickCtx(f.state));
    recomputeDirty(f.state, null);
    // One tile from the well and the tree: 8 x (5 - 1) / 5 = 6.4 on top.
    const after = charm(f.state, 'charm', 57, 53);
    expect(after - before).toBeGreaterThanOrEqual(6);
    expect(after - before).toBeLessThanOrEqual(7);
    expect(charm(f.state, 'charm', 57, 60)).toBe(far);
  });
});
