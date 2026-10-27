// Per-player sound settings (C5G): a volume per bus and mute, saved in this browser only (never in
// the valley). Stored behind try/catch so the game still works when storage throws.

export interface AudioSettings {
  master: number;
  music: number;
  ambience: number;
  effects: number;
  muted: boolean;
}

const KEY = 'qoti.audio.v1';
export const AUDIO_DEFAULTS: AudioSettings = {
  master: 0.8,
  music: 0.6,
  ambience: 0.7,
  effects: 0.8,
  muted: false,
};

/** A volume in 0 to 1, in steps of 0.05. */
export function clampVolume(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, Math.round(n * 20) / 20));
}

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...AUDIO_DEFAULTS };
    const p = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      master: clampVolume(p.master, AUDIO_DEFAULTS.master),
      music: clampVolume(p.music, AUDIO_DEFAULTS.music),
      ambience: clampVolume(p.ambience, AUDIO_DEFAULTS.ambience),
      effects: clampVolume(p.effects, AUDIO_DEFAULTS.effects),
      muted: p.muted === true,
    };
  } catch {
    return { ...AUDIO_DEFAULTS };
  }
}

export function saveAudioSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage is optional; the settings still apply for this visit.
  }
}

/** Gain for a bus: perceptual (squared) so the slider's middle sounds like the middle. */
export function busGain(s: AudioSettings, bus: 'music' | 'ambience' | 'effects'): number {
  if (s.muted) return 0;
  const v = s.master * s[bus];
  return v * v;
}
