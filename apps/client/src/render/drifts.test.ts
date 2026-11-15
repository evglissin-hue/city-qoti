import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hash2 } from './coords';
import { driftHue, flowerDrift } from './drifts';
import { patch } from './ground';

const N = 192;

describe('flower drifts', () => {
  it('is pure and deterministic', () => {
    const run = () => {
      const out: number[] = [];
      for (let i = 0; i < 200; i++) out.push(flowerDrift(i * 3, 200 - i), driftHue(i * 3, 200 - i));
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('stays in range', () => {
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const d = flowerDrift(x, z);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1.8);
        const h = driftHue(x, z);
        expect(Number.isInteger(h) && h >= 0 && h <= 4).toBe(true);
      }
  });

  it('is smooth at drift scale', () => {
    let sum = 0;
    let diff = 0;
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N - 1; x++) {
        sum += flowerDrift(x, z);
        diff += Math.abs(flowerDrift(x, z) - flowerDrift(x + 1, z));
      }
    expect(diff / sum).toBeLessThan(0.4);
  });

  it('covers roughly a quarter to a third of the ground', () => {
    let on = 0;
    for (let z = 0; z < 512; z++) for (let x = 0; x < 512; x++) if (flowerDrift(x, z) > 0.8) on++;
    const share = on / (512 * 512);
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.4);
  });

  it('keeps one hue across a drift', () => {
    let pairs = 0;
    let same = 0;
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N - 1; x++)
        if (flowerDrift(x, z) > 0.8 && flowerDrift(x + 1, z) > 0.8) {
          pairs++;
          if (driftHue(x, z) === driftHue(x + 1, z)) same++;
        }
    expect(pairs).toBeGreaterThan(1000);
    expect(same / pairs).toBeGreaterThan(0.85);
  });

  it('is the one function the ground and the nature layer both use', () => {
    const ground = readFileSync(new URL('ground.ts', import.meta.url), 'utf8');
    const nature = readFileSync(new URL('layers/nature.ts', import.meta.url), 'utf8');
    expect(ground).toMatch(/import \{[^}]*flowerDrift[^}]*\} from '\.\/drifts'/);
    expect(ground).toContain('flowers * flowerDrift(x, z)');
    expect(nature).toMatch(/import \{[^}]*flowerDrift[^}]*\} from '\.\.\/drifts'/);
    expect(nature).toContain('flowerDrift(x, z)');
  });

  it('plants no more flowers overall than the even scatter did', () => {
    // Mirrors buildNatureChunk's flower rolls on an all-meadow and an all-grass 192 x 192 area.
    for (const meadow of [true, false]) {
      let before = 0;
      let after = 0;
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N; x++) {
          const bloom = patch(x, z, 7, 9);
          const old = meadow ? 0.25 + bloom * 0.4 : Math.max(0, bloom - 0.6) * 0.8;
          const now = old * flowerDrift(x, z);
          before += Number(hash2(x, z, 131) < old) + Number(meadow && hash2(x, z, 135) < old * 0.6);
          after += Number(hash2(x, z, 131) < now) + Number(meadow && hash2(x, z, 135) < now * 0.6);
        }
      console.log(
        `flower instances, ${meadow ? 'meadow' : 'grass'} ${N}x${N}: before ${before}, after ${after}`,
      );
      expect(after).toBeLessThanOrEqual(before);
    }
  });
});
