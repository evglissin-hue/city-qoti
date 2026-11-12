// V2X: every light map reader goes through the shared strength curve (`qLamp`, lightMap.ts), so a
// crowd of pools glows rather than floods on every surface alike. A reader that samples the map
// raw is listed here with its reason.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname);
const ART = join(__dirname, '../../../../packages/art/src');

/** Readers that sample the map raw on purpose. */
const RAW: Record<string, string> = {
  'lightMap.ts': 'defines qLightMap and qLamp',
  'layers/water.ts': 'reflection: reads beyond the point along the view, shaken by the ripples',
};

function sources(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p, base));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('light map readers (V2X)', () => {
  it('read through qLamp, the shared curve, unless listed with a reason', () => {
    const readers: string[] = [];
    for (const file of [...sources(ROOT), ...sources(ART)]) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('LIGHT_MAP_GLSL') && !text.includes('qLamp(')) continue;
      const rel = file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : `art/${file.slice(ART.length + 1)}`;
      readers.push(rel);
      if (RAW[rel]) continue;
      // Only GLSL calls count: `qLightMap(` inside a comment line is fine.
      const raw = text
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*)/.test(l))
        .some((l) => /qLightMap\(/.test(l) && !/vec3 qLightMap\(/.test(l));
      expect(raw, `${rel} samples the light map raw; use qLamp or list it in RAW`).toBe(false);
    }
    // The readers the wave notes name are all found (a rename would hide one from this check).
    for (const r of ['ground.ts', 'scatter.ts', 'layers/meadow.ts', 'layers/effects.ts', 'art/materials.ts'])
      expect(readers).toContain(r);
  });
});
