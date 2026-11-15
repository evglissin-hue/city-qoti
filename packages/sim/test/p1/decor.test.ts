// Playtest round seven: pricier decor. Costs and refunds, the window box default and its flower
// colors. R1 took out the yield boost (an unlock is never "+5%", P6): the pieces keep their charm.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { PENNIES_PER_COIN, TILE_FP } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { buildingRect } from '../../src/conditions/geo';
import { findById } from '../../src/state/entities';
import { windowBoxesOn } from '../../src/rules/windowBoxes';
import { methodOf } from '../../src/state/zones';
import { yieldPermille } from '../../src/systems/production/modifiers';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';
import { charm, settle } from '../hearth/helpers';

const good = (id: string): number => content.goodIndex.get(id)!;

/** Stocks the storehouse so costed pieces can be paid for. */
function stocked(state: WorldState, id: number, timber = 100, stone = 100): void {
  const b = findById(state.buildings, id)!;
  b.rt!.store[good('timber')] = timber;
  b.rt!.store[good('stone')] = stone;
}

function totalStore(state: WorldState, g: string): number {
  let n = 0;
  for (const b of state.buildings) n += b.rt?.store[good(g)] ?? 0;
  return n;
}

let seq = 1;
function placeAt(state: WorldState, def: string, tx: number, tz: number) {
  const ctx = run(
    state,
    { t: 'decor.place', def, fx: tx * TILE_FP + 128, fz: tz * TILE_FP + 128, rot: 0 },
    0,
    seq++,
  );
  return { ctx, err: rejection(ctx) };
}

/** A free tile for a piece at gap steps (Chebyshev) from a building's rect, tried around it. */
function freeTileNear(state: WorldState, b: Building, def: string, gap: number): [number, number] {
  const r = buildingRect(b);
  for (let tz = r[1] - gap; tz <= r[3] + gap; tz++) {
    for (let tx = r[0] - gap; tx <= r[2] + gap; tx++) {
      const dx = tx < r[0] ? r[0] - tx : tx > r[2] ? tx - r[2] : 0;
      const dz = tz < r[1] ? r[1] - tz : tz > r[3] ? tz - r[3] : 0;
      if (Math.max(dx, dz) !== gap || (dx > 0 && dz > 0)) continue;
      const ok = run(
        state,
        { t: 'decor.place', def, fx: tx * TILE_FP + 128, fz: tz * TILE_FP + 128, rot: 0 },
        0,
        seq++,
      );
      if (rejection(ok) === undefined) {
        // Undo the probe so the caller places it itself.
        const piece = state.decor[state.decor.length - 1]!;
        run(state, { t: 'decor.remove', ids: [piece.id] }, 0, seq++);
        return [tx, tz];
      }
    }
  }
  throw new Error('no free tile');
}

describe('decor costs', () => {
  it('charges coins and goods, and refunds them in full on removal', () => {
    const f = hamletFixture();
    stocked(f.state, f.b.storehouse);
    const coins0 = f.state.economy.treasury;
    const timber0 = totalStore(f.state, 'timber');
    const stone0 = totalStore(f.state, 'stone');
    const sawpit = findById(f.state.buildings, f.b.sawpit)!;
    const [tx, tz] = freeTileNear(f.state, sawpit, 'tool-rack', 1);
    const { err } = placeAt(f.state, 'tool-rack', tx, tz);
    expect(err).toBeUndefined();
    expect(f.state.economy.treasury).toBe(coins0 - 12 * PENNIES_PER_COIN);
    expect(totalStore(f.state, 'timber')).toBe(timber0 - 6);
    expect(totalStore(f.state, 'stone')).toBe(stone0 - 2);
    const piece = f.state.decor[f.state.decor.length - 1]!;
    run(f.state, { t: 'decor.remove', ids: [piece.id] }, 0, seq++);
    expect(f.state.economy.treasury).toBe(coins0);
    expect(totalStore(f.state, 'timber')).toBe(timber0);
    expect(totalStore(f.state, 'stone')).toBe(stone0);
  });

  it('refuses when the goods or the coins are missing, and while times are lean', () => {
    const f = hamletFixture();
    const sawpit = findById(f.state.buildings, f.b.sawpit)!;
    const [tx, tz] = freeTileNear(f.state, sawpit, 'tool-rack', 1);
    stocked(f.state, f.b.storehouse, 5, 100);
    expect(placeAt(f.state, 'tool-rack', tx, tz).err).toBe('CANNOT_AFFORD');
    stocked(f.state, f.b.storehouse);
    f.state.economy.treasury = 11 * PENNIES_PER_COIN;
    expect(placeAt(f.state, 'tool-rack', tx, tz).err).toBe('CANNOT_AFFORD');
    f.state.economy.treasury = -1;
    expect(placeAt(f.state, 'tool-rack', tx, tz).err).toBe('LEAN_TIMES');
  });

  it('charges nothing for the older, uncosted pieces and in creative valleys', () => {
    const f = hamletFixture();
    const coins0 = f.state.economy.treasury;
    const sawpit = findById(f.state.buildings, f.b.sawpit)!;
    const [tx, tz] = freeTileNear(f.state, sawpit, 'bench', 1);
    expect(placeAt(f.state, 'bench', tx, tz).err).toBeUndefined();
    expect(f.state.economy.treasury).toBe(coins0);
    const g = hamletFixture();
    g.state.settings.mode = 'sandbox';
    g.state.economy.treasury = 0;
    const [ux, uz] = freeTileNear(g.state, findById(g.state.buildings, g.b.sawpit)!, 'tool-rack', 1);
    expect(placeAt(g.state, 'tool-rack', ux, uz).err).toBeUndefined();
    expect(g.state.economy.treasury).toBe(0);
  });
});

describe('no decor boost', () => {
  it("a tool rack by a baker's workshop adds charm, never output", () => {
    const f = hamletFixture();
    stocked(f.state, f.b.storehouse);
    const bakery = findById(f.state.buildings, f.b.bakery)!;
    const def = content.buildingById.get(bakery.def)!;
    const method = methodOf(bakery)!;
    const before = yieldPermille(f.state, bakery, def, method);
    const [tx, tz] = freeTileNear(f.state, bakery, 'tool-rack', 1);
    expect(placeAt(f.state, 'tool-rack', tx, tz).err).toBeUndefined();
    expect(yieldPermille(f.state, bakery, def, method)).toBe(before);
  });
});

describe('window boxes are added, never assumed', () => {
  it('a hand-placed cottage has none until someone adds them, and the charm follows', () => {
    const f = hamletFixture();
    const c = findById(f.state.buildings, f.b.cottages[0])!;
    const def = content.buildingById.get('cottage')!;
    expect(windowBoxesOn(c, def)).toBe(false);
    settle(f.state);
    const plain = charm(f.state, 'charmNature', c.x, c.z - 1);
    run(f.state, { t: 'build.customize', id: c.id, custom: { windowBoxes: true } }, 0, seq++);
    expect(windowBoxesOn(c, def)).toBe(true);
    settle(f.state);
    expect(charm(f.state, 'charmNature', c.x, c.z - 1)).toBeGreaterThan(plain);
    run(f.state, { t: 'build.customize', id: c.id, custom: { windowBoxes: null } }, 0, seq++);
    expect(windowBoxesOn(c, def)).toBe(false);
  });

  it('counts only the boxes somebody chose, on any building', () => {
    const f = hamletFixture();
    const bakery = findById(f.state.buildings, f.b.bakery)!;
    expect(windowBoxesOn(bakery, content.buildingById.get(bakery.def))).toBe(false);
  });

  it('takes a flower color from the flowers swatch group, and only from it', () => {
    const f = hamletFixture();
    const id = f.b.cottages[0];
    for (const s of content.swatches.filter((x) => x.group === 'flowers')) {
      const ctx = run(f.state, { t: 'build.customize', id, custom: { windowFlowers: s.id } }, 0, seq++);
      expect(rejection(ctx), s.id).toBeUndefined();
    }
    expect(content.swatches.filter((x) => x.group === 'flowers')).toHaveLength(6);
    expect(findById(f.state.buildings, id)!.custom?.windowFlowers).toBe('rose');
    for (const bad of ['plum', 'teal', 'chartreuse', 3]) {
      const ctx = run(
        f.state,
        { t: 'build.customize', id, custom: { windowFlowers: bad as string } },
        0,
        seq++,
      );
      expect(rejection(ctx), String(bad)).toBe('INVALID');
    }
    run(f.state, { t: 'build.customize', id, custom: { windowFlowers: null } }, 0, seq++);
    expect(findById(f.state.buildings, id)!.custom?.windowFlowers).toBeUndefined();
  });

  it('gives the cottage a front and a wall slot', () => {
    const slots = content.buildingById.get('cottage')!.moduleSlots!.map(([s]) => s);
    expect(slots).toEqual(['front', 'wall']);
  });
});
