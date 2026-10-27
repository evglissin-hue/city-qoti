import { describe, expect, it } from 'vitest';
import { chordInfo, compose } from './composer';
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
    expect(styleFor(7, 1).id).toBe('summer-morning');
    expect(styleFor(14, 1).id).toBe('afternoon');
    expect(styleFor(14, 2).id).toBe('autumn');
    expect(styleFor(19, 1).id).toBe('evening');
    expect(styleFor(23, 0).id).toBe('night');
    expect(styleFor(7, 3).id).toBe('winter-morning');
    expect(styleFor(19, 3).id).toBe('waltz');
    expect(styleFor(2, 3).id).toBe('waltz');
  });

  it('starts quietly, then alternates pieces and gaps of 20 to 90 seconds', () => {
    const d = startDirector(0);
    const rand = seededRand(3);
    const len = (c: PieceChoice) => compose(c).seconds;
    expect(stepDirector(d, 1, 9, 0, rand, len)).toBeNull();
    let now = 6;
    for (let i = 0; i < 12; i++) {
      expect(stepDirector(d, now, 9, 0, rand, len)).not.toBeNull();
      expect(d.mode).toBe('playing');
      now = d.until;
      expect(stepDirector(d, now, 9, 0, rand, len)).toBeNull();
      expect(d.mode).toBe('quiet');
      const gap = d.until - now;
      expect(gap).toBeGreaterThanOrEqual(GAP_SECONDS[0]);
      expect(gap).toBeLessThanOrEqual(GAP_SECONDS[1]);
      now = d.until;
    }
  });

  it('never plays one of the last two pieces again', () => {
    const d = startDirector(0);
    const rand = seededRand(11);
    const seeds: number[] = [];
    let now = 6;
    for (let i = 0; i < 200; i++) {
      seeds.push(stepDirector(d, now, 20, 1, rand, () => 30)!.seed);
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

describe('chords', () => {
  it('reads numerals and colors in major and minor', () => {
    expect(chordInfo('I', 'major').tones).toEqual([0, 4, 7]);
    expect(chordInfo('ii7', 'major').tones).toEqual([2, 5, 9, 12]);
    expect(chordInfo('V7', 'major').tones).toEqual([7, 11, 14, 17]);
    expect(chordInfo('IVmaj7', 'major').tones).toEqual([5, 9, 12, 16]);
    expect(chordInfo('Iadd9', 'major').tones).toEqual([0, 4, 7, 14]);
    expect(chordInfo('ii9', 'major').tones).toEqual([2, 5, 9, 12, 16]);
    expect(chordInfo('V7sus4', 'major').tones).toEqual([7, 12, 14, 17]);
    // The minor key's dominant borrows the leading tone.
    expect(chordInfo('V', 'minor').tones).toEqual([7, 11, 14]);
    expect(chordInfo('VI', 'minor').tones).toEqual([8, 12, 15]);
  });
});

describe('composer', () => {
  const pc = (n: number, key: number) => (((n - key) % 12) + 12) % 12;

  it('writes the same piece from the same choice, of a sensible length, in every style', () => {
    for (const style of STYLES) {
      for (let seed = 0; seed < 4; seed++) {
        const choice = { style, seed, key: 50 };
        const a = compose(choice);
        expect(compose(choice)).toEqual(a);
        expect(a.seconds).toBeGreaterThan(45);
        expect(a.seconds).toBeLessThan(150);
        for (const n of a.notes) {
          expect(n.time).toBeGreaterThanOrEqual(0);
          expect(n.time).toBeLessThan(a.seconds);
          expect(n.dur).toBeGreaterThan(0);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          if (n.voice !== 'drums') {
            expect(n.midi).toBeGreaterThanOrEqual(28);
            expect(n.midi).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it('keeps the melody in the key, mostly stepwise, and ends at home', () => {
    for (const style of STYLES) {
      const scale = style.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10, 11];
      let steps = 0;
      let moves = 0;
      for (let seed = 0; seed < 8; seed++) {
        const key = [48, 50, 53, 55][seed % 4]!;
        const p = compose({ style, seed, key });
        const lead = p.notes.filter((n) => n.voice === 'lead');
        for (const n of lead) expect(scale).toContain(pc(n.midi, key));
        for (let i = 1; i < lead.length; i++) {
          moves++;
          if (Math.abs(lead[i]!.midi - lead[i - 1]!.midi) <= 4) steps++;
        }
        expect(pc(lead.at(-1)!.midi, key)).toBe(0);
      }
      expect(steps / moves).toBeGreaterThan(0.85);
    }
  });

  it('brings the theme back: the last A is the first A again', () => {
    for (const style of STYLES) {
      const p = compose({ style, seed: 5, key: 48 });
      const spb = 60 / p.tempo;
      // A player's looseness may put a note a few milliseconds early.
      const bar = (n: { time: number }) => Math.floor(n.time / spb / p.meter + 0.02);
      const lead = p.notes.filter((n) => n.voice === 'lead');
      const first = lead.filter((n) => bar(n) >= 2 && bar(n) < 10).map((n) => n.midi);
      const lastStart = p.bars - 2 - 8;
      const last = lead.filter((n) => bar(n) >= lastStart && bar(n) < lastStart + 8).map((n) => n.midi);
      expect(last).toEqual(first);
    }
  });

  it('swings the evening and waltzes in three', () => {
    const evening = compose({ style: STYLES.find((s) => s.id === 'evening')!, seed: 1, key: 48 });
    const spb = 60 / evening.tempo;
    const offbeats = evening.notes.filter((n) => n.voice === 'drums').map((n) => (n.time / spb) % 1);
    expect(offbeats.some((f) => f > 0.58 && f < 0.7)).toBe(true);
    expect(compose({ style: STYLES.find((s) => s.id === 'waltz')!, seed: 1, key: 48 }).meter).toBe(3);
  });

  it('voices chords close together, so the hands barely move', () => {
    const p = compose({ style: STYLES.find((s) => s.id === 'night')!, seed: 2, key: 50 });
    const pads = p.notes.filter((n) => n.voice === 'comp');
    const groups = new Map<number, number[]>();
    for (const n of pads)
      groups.set(Math.round(n.time * 10), [...(groups.get(Math.round(n.time * 10)) ?? []), n.midi]);
    const chords = [...groups.values()].map((g) => g.sort((a, b) => a - b));
    let move = 0;
    for (let i = 1; i < chords.length; i++) move += Math.abs(chords[i]![0]! - chords[i - 1]![0]!);
    expect(move / (chords.length - 1)).toBeLessThan(4);
  });
});
