// P3C: the stand-in check. The owner's playtest of V3 found two pale, unshaded objects on a path
// ("meshes with no material, a site's stand-in, or pieces set down at the wrong angle"): road stairs
// as pale plinths off the ground (now checked in the client's village.test.ts, since a layer draws
// them). This catches the whole class in the art kits: every kit (the dressing's yard and goods
// pieces are kits), at both levels and at every stage, and every construction site stage of every
// building kit, is built and must
// - carry every attribute the kit material reads, finite, with unit normals (else a face renders
//   black or unlit);
// - near, draw no large pale face without a surface: a plain face (surface 0) under the kit material has
//   no pattern, so a big pale one reads as a stand-in close up (a site's half-built walls, the
//   windmill's tower, the quarry's blocks were);
// - near, sit on its anchor: its base at y 0, neither sunk below it (buildings may cut 0.2 into a hill)
//   nor floating over it.
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import type { BufferGeometry } from 'three';
import { artKitId, kits } from './kits';
import { constructionGeometry } from './kits/construction';
import type { Kit, KitBuildOptions } from './kits/types';

/** The largest plain face a pale color may have, in square tiles (a face about a third of a tile across). */
const PALE_PLAIN_MAX = 0.1;
/** Linear luma over which a color is pale. */
const PALE = 0.45;
/** How far a piece's base may stand off the ground: a tenth of a resident's height. */
const FLOAT_MAX = 0.03;
/** Placed sunk by the nature layer (rocks go 0.2 to 0.3 into the ground), so their base may stand off y 0. */
const PLACED_SUNK: ReadonlySet<string> = new Set(['rock']);

function footprint(kit: Kit): { size: [number, number]; entrance: [number, number] } {
  const def = content.buildings.find((b) => artKitId(b.art) === kit.id);
  return {
    size: def?.size ?? kit.footprint?.size ?? [2, 2],
    entrance: def?.entrance ?? kit.footprint?.entrance ?? [1, 1],
  };
}

/** The builds a kit is checked at: its levels, and a tree's stages and a thinned crown. */
function variants(kit: Kit): KitBuildOptions[] {
  const base = kit.kind === 'building' ? footprint(kit) : {};
  const out: KitBuildOptions[] = [base, { ...base, lod: 'low' }, { ...base, seed: 5 }];
  if (kit.kind === 'tree') for (const stage of [0, 1, 2]) out.push({ ...base, stage, seed: 3 });
  if (kit.kind === 'tree' || kit.kind === 'nature') out.push({ ...base, params: { thin: 0.4 } });
  // R3H: a specialized building's kit at each level it climbs, near and far, with its def's params.
  const def = content.buildings.find((b) => artKitId(b.art) === kit.id && b.levels);
  if (def)
    for (const level of [2, 3])
      for (const lod of ['high', 'low'] as const)
        out.push({ ...base, lod, params: { ...(def.art.params ?? {}), level } });
  return out;
}

/** What is wrong with a geometry, as short lines (empty when nothing is). */
function standIn(g: BufferGeometry, building: boolean, sunk: boolean, far = false): string[] {
  const out: string[] = [];
  const pos = g.getAttribute('position');
  for (const name of ['normal', 'color', 'glow', 'surface']) {
    const a = g.getAttribute(name);
    if (!a || a.count !== pos.count) out.push(`no ${name} attribute`);
  }
  if (out.length) return out;
  const nor = g.getAttribute('normal');
  const col = g.getAttribute('color');
  const surf = g.getAttribute('surface');
  let minY = Infinity;
  let palest = 0;
  let badNormals = 0;
  for (let v = 0; v < pos.count; v++) {
    const y = pos.getY(v);
    if (
      !Number.isFinite(pos.getX(v) + y + pos.getZ(v)) ||
      !Number.isFinite(col.getX(v) + col.getY(v) + col.getZ(v))
    )
      out.push(`vertex ${v} not finite`);
    const n = Math.hypot(nor.getX(v), nor.getY(v), nor.getZ(v));
    if (!(Math.abs(n - 1) < 0.05)) badNormals++;
    minY = Math.min(minY, y);
  }
  if (badNormals) out.push(`${badNormals} normals not unit length`);
  for (let t = 0; t + 2 < pos.count; t += 3) {
    if (surf.getX(t) !== 0) continue;
    const luma = 0.2126 * col.getX(t) + 0.7152 * col.getY(t) + 0.0722 * col.getZ(t);
    if (luma <= PALE) continue;
    const ax = pos.getX(t + 1) - pos.getX(t);
    const ay = pos.getY(t + 1) - pos.getY(t);
    const az = pos.getZ(t + 1) - pos.getZ(t);
    const bx = pos.getX(t + 2) - pos.getX(t);
    const by = pos.getY(t + 2) - pos.getY(t);
    const bz = pos.getZ(t + 2) - pos.getZ(t);
    palest = Math.max(palest, Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2);
  }
  // The far level is only drawn far off, where neither a pattern nor a few centimeters show.
  if (far) return out;
  if (palest > PALE_PLAIN_MAX) out.push(`a pale face with no surface of ${palest.toFixed(2)} square tiles`);
  if (minY < (building ? -0.2 : -0.001)) out.push(`sunk to ${minY.toFixed(3)}`);
  if (!sunk && minY > FLOAT_MAX) out.push(`floats ${minY.toFixed(3)} over its anchor`);
  return out;
}

describe('stand-ins (P3C)', () => {
  it(
    'no kit, at any level or stage, draws a stand-in, an unlit face or a piece off its anchor',
    { timeout: 120000 },
    () => {
      const bad: string[] = [];
      for (const kit of kits) {
        for (const opts of variants(kit)) {
          const found = standIn(
            kit.build(opts),
            kit.kind === 'building',
            PLACED_SUNK.has(kit.id),
            opts.lod === 'low',
          );
          for (const f of found) bad.push(`${kit.id} ${JSON.stringify(opts)}: ${f}`);
        }
      }
      expect(bad).toEqual([]);
    },
  );

  it('no construction site stage of any building draws one either', { timeout: 120000 }, () => {
    const bad: string[] = [];
    let sites = 0;
    for (const kit of kits) {
      if (kit.kind !== 'building') continue;
      const { size } = footprint(kit);
      for (const stage of [0, 1, 2, 3]) {
        for (const lod of ['high', 'low'] as const) {
          sites++;
          for (const f of standIn(
            constructionGeometry({ kit: kit.id, size, stage, lod }),
            true,
            false,
            lod === 'low',
          ))
            bad.push(`site ${kit.id} stage ${stage} ${lod}: ${f}`);
        }
      }
    }
    expect(sites).toBeGreaterThan(100);
    expect(bad).toEqual([]);
  });

  it('checks the dressing pieces too (they are kits)', () => {
    const ids = kits.map((k) => k.id);
    expect(ids.filter((id) => id.startsWith('yard-')).length).toBeGreaterThan(5);
    expect(ids.filter((id) => id.startsWith('goods-')).length).toBeGreaterThan(5);
  });
});
