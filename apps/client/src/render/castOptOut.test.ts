// V2B: the renderer turns every solid mesh of a static layer casting whenever the shadow map renders
// (`Renderer.updateShadowFlags`), unless the mesh opts out with `userData.qotiShadows = false` or
// `userData.noCast`. A static layer that only sets `castShadow = false` is overridden (the meadow
// carpet's blades shadowed the ground under them as dark stipple). This checks the whole class: a
// static layer that turns casting off also opts out of the override.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, 'layers');

describe('static layers that cast nothing (V2B)', () => {
  it('opt out of the renderer casting override, not only castShadow', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    let checked = 0;
    for (const f of files) {
      const src = readFileSync(join(DIR, f), 'utf8');
      if (!/castShadow\s*=\s*false/.test(src)) continue;
      if (/motion:\s*'moving'/.test(src)) continue;
      checked++;
      expect(/qotiShadows\s*=\s*false|noCast\s*=\s*true/.test(src), f).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
