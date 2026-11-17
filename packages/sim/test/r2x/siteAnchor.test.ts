// R2X: a pattern site keeps its anchor as it grows (patterns/engine.ts). Most detectors anchor a site
// on its smallest tile, and a place's id is `site:<pattern>:<anchor>`, so a Lantern Walk lengthened at
// its low end used to become a new place: its name, its evening counts and any open gap about it went
// (willow's nothing-to-sell gaps vanished one evening before they would have closed). The class: an
// id built from a position that moves as the thing grows.
import { describe, expect, it } from 'vitest';
import { removeById } from '../../src/state/entities';
import { worldIndex } from '../../src/state/worldIndex';
import { runPatterns } from '../../src/systems/hearth/patterns/engine';
import { placeIndex } from '../../src/systems/places/index';
import { createTickCtx } from '../../src/turn';
import { decor, road, S, standardWorld } from '../hearth/helpers';

function walks(w: ReturnType<typeof standardWorld>) {
  return w.hearth.sites.filter((s) => s.pattern === 'lantern-walk');
}

describe('a pattern site that grows (R2X)', () => {
  it('keeps its anchor, and its place its id, when a Lantern Walk is lengthened at its low end', () => {
    const w = standardWorld();
    road(w, 'path', 110, 90, 135, 90);
    for (let i = 0; i < 3; i++) decor(w, 'lantern', 111 + i * 5, 91);
    runPatterns(w, createTickCtx(w));
    expect(walks(w)).toHaveLength(1);
    const anchor = walks(w)[0]!.anchor;
    expect(anchor).toBe(90 * S + 110);
    const id = `site:lantern-walk:${anchor}`;
    expect(placeIndex(w).byId.has(id)).toBe(true);

    // Lengthen it to the west: the walk's smallest tile is now x 100, yet it is the same walk.
    road(w, 'path', 100, 90, 109, 90);
    decor(w, 'lantern', 101, 91);
    decor(w, 'lantern', 106, 91);
    runPatterns(w, createTickCtx(w));
    expect(walks(w)).toHaveLength(1);
    const grown = walks(w)[0]!;
    expect(grown.tiles).toContain(90 * S + 100);
    expect(grown.anchor).toBe(anchor);
    expect(placeIndex(w).byId.has(id)).toBe(true);
    // And again: the anchor holds pass after pass.
    runPatterns(w, createTickCtx(w));
    expect(walks(w)[0]!.anchor).toBe(anchor);
  });

  it('takes a new anchor once its old tile is no longer part of it', () => {
    const w = standardWorld();
    road(w, 'path', 110, 90, 140, 90);
    const first = decor(w, 'lantern', 111, 91);
    for (let i = 1; i < 6; i++) decor(w, 'lantern', 111 + i * 5, 91);
    runPatterns(w, createTickCtx(w));
    expect(walks(w).map((s) => s.anchor)).toEqual([90 * S + 110]);
    // The first lantern goes: the walk now starts at x 115, past its old anchor.
    const d = removeById(w.decor, first)!;
    worldIndex(w).decorGrid.remove(d);
    runPatterns(w, createTickCtx(w));
    expect(walks(w)).toHaveLength(1);
    expect(walks(w)[0]!.tiles).not.toContain(90 * S + 110);
    expect(walks(w)[0]!.anchor).toBe(walks(w)[0]!.tiles[0]);
  });
});
