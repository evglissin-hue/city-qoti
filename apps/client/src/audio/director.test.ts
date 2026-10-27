import { describe, expect, it } from 'vitest';
import { compose } from './composer';
import {
  GAP_SECONDS,
  STYLES,
  phaseOf,
  startDirector,
  stepDirector,
  styleFor,
  type PieceChoice,
} from './director';
import { seededRand } from './rng';

describe('music director', () => {
  it('follows the hour and the season', () => {
    expect(phaseOf(6)).toBe('morning');
    expect(phaseOf(12)).toBe('afternoon');
    expect(phaseOf(18)).toBe('evening');
    expect(phaseOf(23)).toBe('night');
    expect(phaseOf(3)).toBe('night');
    expect(styleFor(7, 0).id).toBe('morning');
    expect(styleFor(14, 1).id).toBe('afternoon');
    expect(styleFor(14, 2).id).toBe('autumn');
    expect(styleFor(19, 1).id).toBe('evening');
    expect(styleFor(19, 3).id).toBe('waltz');
    expect(styleFor(2, 3).id).toBe('waltz');
    expect(styleFor(7, 3).id).toBe('morning');
    expect(styleFor(23, 0).id).toBe('night');
  });

  it('starts quietly, then alternates pieces and gaps of 20 to 90 seconds', () => {
    const d = startDirector(0);
    const rand = seededRand(3);
    const len = (c: PieceChoice) => compose(c).seconds;
    expect(stepDirector(d, 1, 9, 0, rand, len)).toBeNull();
    let now = 6;
    const gaps: number[] = [];
    for (let i = 0; i < 40; i++) {
      const choice = stepDirector(d, now, 9, 0, rand, len);
      expect(choice).not.toBeNull();
      expect(d.mode).toBe('playing');
      now = d.until;
      expect(stepDirector(d, now, 9, 0, rand, len)).toBeNull();
      expect(d.mode).toBe('quiet');
      gaps.push(d.until - now);
      now = d.until;
    }
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(GAP_SECONDS[0]);
      expect(g).toBeLessThanOrEqual(GAP_SECONDS[1]);
    }
  });

  it('never plays one of the last two pieces again', () => {
    const d = startDirector(0);
    const rand = seededRand(11);
    const seeds: number[] = [];
    let now = 6;
    for (let i = 0; i < 200; i++) {
      const c = stepDirector(d, now, 20, 1, rand, () => 30)!;
      seeds.push(c.seed);
      now = d.until;
      stepDirector(d, now, 20, 1, rand, () => 30);
      now = d.until;
    }
    for (let i = 2; i < seeds.length; i++) {
      expect(seeds[i]).not.toBe(seeds[i - 1]);
      expect(seeds[i]).not.toBe(seeds[i - 2]);
    }
  });
});

describe('composer', () => {
  it('writes the same piece from the same choice, and pieces of a sensible length', () => {
    for (const style of STYLES) {
      for (let seed = 0; seed < 6; seed++) {
        const choice = { style, seed, key: 50 };
        const a = compose(choice);
        expect(compose(choice)).toEqual(a);
        expect(a.seconds).toBeGreaterThan(20);
        expect(a.seconds).toBeLessThan(120);
        expect(a.notes.length).toBeGreaterThan(a.bars * 2);
        for (const n of a.notes) {
          expect(n.beat).toBeGreaterThanOrEqual(0);
          expect(n.beat).toBeLessThan(a.bars * a.meter);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          if (n.voice !== 'brush') {
            expect(n.midi).toBeGreaterThanOrEqual(36);
            expect(n.midi).toBeLessThanOrEqual(86);
          }
        }
      }
    }
  });

  it('keeps the melody in the key and ends at home', () => {
    const major = [0, 2, 4, 5, 7, 9, 11];
    for (let seed = 0; seed < 10; seed++) {
      const key = 53;
      const p = compose({ style: STYLES[0]!, seed, key });
      for (const n of p.notes.filter((x) => x.voice === 'lead'))
        expect(major).toContain((((n.midi - key) % 12) + 12) % 12);
      const last = p.notes.filter((x) => x.voice === 'lead').at(-1)!;
      expect((((last.midi - key) % 12) + 12) % 12).toBe(0);
    }
  });

  it('waltzes in three and swings the evening', () => {
    const waltz = compose({ style: STYLES.find((s) => s.id === 'waltz')!, seed: 1, key: 48 });
    expect(waltz.meter).toBe(3);
    const evening = compose({ style: STYLES.find((s) => s.id === 'evening')!, seed: 1, key: 48 });
    expect(evening.notes.some((n) => n.voice === 'lead' && Math.abs((n.beat % 1) - 0.665) < 0.01)).toBe(true);
  });
});
