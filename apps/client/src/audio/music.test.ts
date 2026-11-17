import { createWorld, defaultSettings, START_HOUR } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { AUDIO_SEED } from '../../e2e/seeds';
import { compose } from './composer';
import { startDirector, stepDirector, STYLES } from './director';
import { noteLayer, notePan, pieceGain } from './music';
import { seededRand } from './rng';
import { zoneFor } from './sampler';
import { valleySeed } from './settings';

describe("audio.spec.ts's valley", () => {
  // As the title screen makes it: a creative valley with no typed names, at the morning of day one.
  const world = createWorld(AUDIO_SEED, {
    ...defaultSettings(),
    mode: 'sandbox',
    threat: 'peaceful',
    valleyName: '',
  });
  const seed = valleySeed(world.settings.valleyName, world.settings.townName);

  it('opens on a piece with recordings to fetch, whatever the band and the weather', () => {
    for (let rank = 0; rank <= 4; rank++)
      for (const weather of ['clear', 'rain', 'storm', 'fog', 'snow']) {
        // The music player's first step: the director's opening breath is over, its dice are the valley's.
        const choice = stepDirector(
          startDirector(0),
          6,
          START_HOUR,
          0,
          seededRand(seed),
          (c) => compose(c).seconds,
          { rank, weather, festival: false, valleySeed: seed },
        );
        expect(choice).not.toBeNull();
        const recorded = compose(choice!).notes.filter((n) => zoneFor(n.inst, n.midi, noteLayer(n)));
        expect(recorded.length, `rank ${rank}, ${weather}`).toBeGreaterThan(0);
      }
  });
});

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
