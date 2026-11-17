// P2-A: a grown or business kit keeps its geometry (roof overhang included) inside its own lot, so
// two unjoined neighbors never cut into each other.
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { artKitId, kitById } from './kits';
import type { KitBuildOptions } from './kits/types';

const KITS = ['cottage', 'farmstead', 'house', 'shop', 'townhouse', 'workshop'];
const STYLES = ['', 'timber', 'stone', 'brick', 'plaster'];
const LEVELS = [0, 1, 2, 3];
/** Sides next to a neighbor (x-, x+) and the back (z-): nothing may pass the lot edge. */
const EPS = 0.005;
/** The front (z+) faces the street, not a lot: steps, a porch, an awning or a yard may reach past it. */
const FRONT = 0.25;
/** Ground dressing (garden edging, flower beds, stepping stones) lies below this height and may spill a little. */
const GROUND = 0.2;

function optsOf(
  id: string,
  style: string,
  level: number,
  seed: number,
  extra: Record<string, number | string> = {},
): KitBuildOptions {
  const kit = kitById.get(id)!;
  const def = content.buildings.find((b) => artKitId(b.art) === id);
  return {
    size: def?.size ?? kit.footprint?.size ?? [2, 2],
    entrance: def?.entrance ?? kit.footprint?.entrance ?? [1, 1],
    seed,
    params: {
      ...(def?.art.params ?? {}),
      ...(style ? { style } : {}),
      ...(level ? { level } : {}),
      ...extra,
    },
  };
}

describe('lot bounds (P2-A)', () => {
  it(
    'keep every grown and business kit inside its lot on the sides that are not party walls',
    {
      timeout: 120000,
    },
    () => {
      const worst = new Map<string, number>();
      for (const id of KITS)
        for (const style of STYLES)
          for (const level of LEVELS)
            for (let seed = 1; seed <= 24; seed++) {
              const o = optsOf(id, style, level, seed);
              const [w, d] = o.size!;
              const pos = kitById.get(id)!.build(o).getAttribute('position');
              const bb = { min: { x: Infinity, z: Infinity }, max: { x: -Infinity, z: -Infinity } };
              for (let i = 0; i < pos.count; i++) {
                if (pos.getY(i) < GROUND) continue;
                bb.min.x = Math.min(bb.min.x, pos.getX(i));
                bb.max.x = Math.max(bb.max.x, pos.getX(i));
                bb.min.z = Math.min(bb.min.z, pos.getZ(i));
                bb.max.z = Math.max(bb.max.z, pos.getZ(i));
              }
              const label = `${id} style=${style || '-'} level=${level}`;
              const over = {
                left: -bb.min.x,
                right: bb.max.x - w,
                back: -bb.min.z,
                front: bb.max.z - d - FRONT,
              };
              for (const [side, v] of Object.entries(over)) {
                const k = `${label} ${side}`;
                worst.set(k, Math.max(worst.get(k) ?? -Infinity, v));
              }
            }
      const bad = [...worst].filter(([, v]) => v > EPS).map(([k, v]) => `${k} by ${v.toFixed(3)}`);
      expect(bad).toEqual([]);
    },
  );

  // V3B: taller and shorter cottages and houses, with and without a corner, stay in their lot too.
  it(
    'keep the cottage and the house inside their lot at every storeys, with and without a corner',
    { timeout: 120000 },
    () => {
      const worst = new Map<string, number>();
      for (const id of ['cottage', 'house'])
        for (const style of STYLES)
          for (const storeys of [1, 1.5, 2, 2.5, 3, 3.5, 4])
            for (const corner of ['', 'L', 'R'])
              for (let seed = 1; seed <= 8; seed++) {
                const o = optsOf(id, style, style ? 1 : 0, seed, { storeys, ...(corner ? { corner } : {}) });
                const [w, d] = o.size!;
                const pos = kitById.get(id)!.build(o).getAttribute('position');
                let minX = Infinity;
                let maxX = -Infinity;
                let minZ = Infinity;
                let maxZ = -Infinity;
                for (let i = 0; i < pos.count; i++) {
                  if (pos.getY(i) < GROUND) continue;
                  minX = Math.min(minX, pos.getX(i));
                  maxX = Math.max(maxX, pos.getX(i));
                  minZ = Math.min(minZ, pos.getZ(i));
                  maxZ = Math.max(maxZ, pos.getZ(i));
                }
                const label = `${id} style=${style || '-'} storeys=${storeys} corner=${corner || '-'}`;
                const over = { left: -minX, right: maxX - w, back: -minZ, front: maxZ - d - FRONT };
                for (const [side, v] of Object.entries(over)) {
                  const k = `${label} ${side}`;
                  worst.set(k, Math.max(worst.get(k) ?? -Infinity, v));
                }
              }
      const bad = [...worst].filter(([, v]) => v > EPS).map(([k, v]) => `${k} by ${v.toFixed(3)}`);
      expect(bad).toEqual([]);
    },
  );

  // V3B: a row kit of any storeys keeps its roof and walls inside the lot (the roof rides the walls).
  it('keep the townhouse and the shop inside their lot at 1 to 4 storeys', { timeout: 120000 }, () => {
    const bad: string[] = [];
    for (const id of ['shop', 'townhouse'])
      for (const style of STYLES)
        for (const storeys of [1, 1.5, 2.5, 3, 3.5, 4])
          for (const level of id === 'shop' ? LEVELS : [0])
            for (let seed = 1; seed <= 6; seed++) {
              const o = optsOf(id, style, level, seed);
              o.params = { ...o.params, storeys };
              const [w, d] = o.size!;
              const pos = kitById.get(id)!.build(o).getAttribute('position');
              for (let i = 0; i < pos.count; i++) {
                if (pos.getY(i) < GROUND) continue;
                const out = Math.max(-pos.getX(i), pos.getX(i) - w, -pos.getZ(i), pos.getZ(i) - d - FRONT);
                if (out > EPS) {
                  bad.push(
                    `${id} ${style} storeys=${storeys} level=${level} seed=${seed} by ${out.toFixed(3)}`,
                  );
                  break;
                }
              }
            }
    expect(bad).toEqual([]);
  });
});
