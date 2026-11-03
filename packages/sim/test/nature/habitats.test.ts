// C5C: the six habitats, each with a fixture that builds it and one that does not, and the 02:00 pass
// recomputing only the changed chunks and today's rolling sixth.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { HABITAT_IDS, MAP_SIZE, TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { Terrain, treeValue, TREE_MATURE, TREE_SPECIES, Water } from '../../src/map/layers';
import { markCharmDirty } from '../../src/systems/hearth/charm/dirty';
import {
  CHUNKS,
  chunksToday,
  ROLLING_PARTS,
  scoreAt,
  scoreChunks,
  updateHabitats,
} from '../../src/systems/nature/habitats';
import { createTickCtx } from '../../src/turn';
import { addDecorAt, placeFree } from '../fixtures/seasonsPlace';
import { EMPTY_CHUNK, EX, EZ, natureFixture } from '../fixtures/nature';

const S = MAP_SIZE;
const H = (id: string) => (HABITAT_IDS as readonly string[]).indexOf(id);

function score(state: WorldState, habitat: string): number {
  return scoreChunks(state, [EMPTY_CHUNK])[0]![H(habitat)]!;
}

/** A decor def with a tag. */
function decorWith(tag: string): string {
  return content.decor.find((d) => d.tags.includes(tag) && !d.festival)!.id;
}

/** One way to build each habitat in the empty chunk, from the content's own sources. */
const BUILD: Record<string, (s: WorldState) => void> = {
  pollinator: (s) => {
    for (let k = 0; k < 4; k++) addDecorAt(s, decorWith('flower'), EX + 2.5 + k * 2, EZ + 4.5);
  },
  wetland: (s) => {
    for (let x = EX + 2; x < EX + 6; x++) {
      s.map.water[(EZ + 2) * S + x] = Water.pond;
      s.map.terrain[(EZ + 2) * S + x] = Terrain.water;
    }
  },
  hedgerow: (s) => {
    for (let k = 0; k < 5; k++) addDecorAt(s, 'hedge', EX + 2.5 + k, EZ + 8.5);
  },
  woodland: (s) => {
    for (let z = EZ; z < EZ + 8; z++)
      for (let x = EX; x < EX + 8; x++) s.map.tree[z * S + x] = treeValue(TREE_SPECIES.oak, TREE_MATURE);
  },
  meadow: (s) => {
    for (let z = EZ; z < EZ + 8; z++)
      for (let x = EX; x < EX + 8; x++) s.map.terrain[z * S + x] = Terrain.meadow;
  },
  garden: (s) => {
    for (let k = 0; k < 4; k++) addDecorAt(s, 'low-wall', EX + 2.5 + k, EZ + 12.5);
    placeFree(s, 'herb-garden', EX + 8, EZ + 10);
  },
};

describe('habitats', () => {
  for (const id of HABITAT_IDS) {
    it(`${id}: built where the content says, absent on bare grass`, () => {
      const s = natureFixture().state;
      expect(score(s, id)).toBe(0);
      BUILD[id]!(s);
      expect(score(s, id)).toBeGreaterThan(0);
      expect(score(s, id)).toBeLessThanOrEqual(255);
    });
  }

  it('counts a module and window boxes toward garden nooks', () => {
    const s = natureFixture().state;
    const th = placeFree(s, 'townhouse', EX + 4, EZ + 4);
    expect(score(s, 'garden')).toBe(0);
    th.rt!.modules = [['wall', 'ivy']];
    const ivy = content.habitatSources.find((x) => x.from === 'module' && x.ref === 'ivy')!.points;
    expect(score(s, 'garden')).toBe(ivy);
  });

  it('the first pass scores the whole map; later passes the changed chunks and a sixth', () => {
    const f = natureFixture();
    const s = f.state;
    expect(chunksToday(s)).toHaveLength(CHUNKS);
    updateHabitats(s, createTickCtx(s));
    expect(scoreAt(s, H('wetland'), 6 * 12 + 6)).toBeGreaterThan(0); // the river at x 100
    delete s.nature.dirty;
    const today = chunksToday(s);
    expect(today.length).toBe(CHUNKS / ROLLING_PARTS);
    const part = Math.floor(s.tick / TICKS_PER_DAY) % ROLLING_PARTS;
    expect(today.every((c) => c % ROLLING_PARTS === part)).toBe(true);
    // A change in a chunk outside today's sixth: picked up because the change marked it.
    const c = today.includes(EMPTY_CHUNK) ? EMPTY_CHUNK + 1 : EMPTY_CHUNK;
    const cx = (c % 12) * 16;
    const cz = Math.floor(c / 12) * 16;
    s.map.terrain.fill(Terrain.meadow, cz * S + cx, cz * S + cx + 8);
    expect(chunksToday(s)).not.toContain(c);
    markCharmDirty(s, [cx, cz, cx + 7, cz]);
    expect(chunksToday(s)).toContain(c);
    const ctx = createTickCtx(s);
    const scored = updateHabitats(s, ctx);
    expect(scored).toContain(c);
    expect(scored.length).toBeLessThan(CHUNKS / 2);
    expect(scoreAt(s, H('meadow'), c)).toBeGreaterThan(0);
    const moved = ctx.events.find((e) => e.e === 'habitats.updated');
    expect(moved && moved.e === 'habitats.updated' && moved.chunks.some(([k]) => k === c)).toBe(true);
    expect(s.nature.dirty).toBeUndefined();
  });

  it('a chunk nobody touched keeps its score until its day comes round', () => {
    const s = natureFixture().state;
    updateHabitats(s, createTickCtx(s));
    delete s.nature.dirty;
    const today = chunksToday(s);
    const c = today.includes(EMPTY_CHUNK) ? EMPTY_CHUNK + 1 : EMPTY_CHUNK;
    const cx = (c % 12) * 16;
    const cz = Math.floor(c / 12) * 16;
    for (let x = cx; x < cx + 16; x++) s.map.terrain[cz * S + x] = Terrain.meadow;
    updateHabitats(s, createTickCtx(s));
    expect(scoreAt(s, H('meadow'), c)).toBe(0);
    for (let d = 1; d <= ROLLING_PARTS; d++) {
      s.tick += TICKS_PER_DAY;
      updateHabitats(s, createTickCtx(s));
    }
    expect(scoreAt(s, H('meadow'), c)).toBeGreaterThan(0);
  });
});
