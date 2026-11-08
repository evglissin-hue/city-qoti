import { describe, expect, it } from 'vitest';
import { compose } from './composer';
import { STYLES } from './director';
import { notePan, pieceGain } from './music';

describe('piece loudness', () => {
  const gains = new Map(
    STYLES.map((s) => {
      const piece = compose({ style: s, seed: 3, key: 50 });
      return [s.id, pieceGain(piece)] as const;
    }),
  );

  it('gives every piece a finite, bounded gain', () => {
    for (const g of gains.values()) {
      expect(g).toBeGreaterThan(0.3);
      expect(g).toBeLessThan(3);
    }
  });

  it('puts the night below its own match by the offset', () => {
    const night = STYLES.find((s) => s.id === 'night')!;
    const piece = compose({ style: night, seed: 3, key: 50 });
    // Same notes, a style id with no offset: night is 2.5 dB lower.
    const flat = pieceGain({ ...piece, style: 'none' });
    expect(pieceGain(piece) / flat).toBeCloseTo(Math.pow(10, -2.5 / 20), 5);
  });
});

describe('note pan', () => {
  it('spreads strings to both sides and keeps leads near the center', () => {
    expect(notePan({ inst: 'strings', midi: 60 })).toBe(-0.55);
    expect(notePan({ inst: 'strings', midi: 61 })).toBe(0.55);
    expect(Math.abs(notePan({ inst: 'flute', midi: 72 }))).toBeLessThanOrEqual(0.3);
    expect(notePan({ inst: 'bass', midi: 36 })).toBe(0);
  });
});
