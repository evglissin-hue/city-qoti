import { describe, expect, it } from 'vitest';
import { AUDIO_DEFAULTS, busGain, clampVolume } from './settings';

describe('audio settings', () => {
  it('clamps volumes to 0 to 1 in steps of 0.05', () => {
    expect(clampVolume(1.4, 0.5)).toBe(1);
    expect(clampVolume(-1, 0.5)).toBe(0);
    expect(clampVolume(0.333, 0.5)).toBe(0.35);
    expect(clampVolume('loud', 0.5)).toBe(0.5);
  });

  it('squares the gain so the middle sounds like the middle, and mutes', () => {
    const s = { ...AUDIO_DEFAULTS, master: 1, music: 0.5 };
    expect(busGain(s, 'music')).toBeCloseTo(0.25);
    expect(busGain({ ...s, muted: true }, 'music')).toBe(0);
  });
});
