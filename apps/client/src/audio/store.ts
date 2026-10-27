// The player's sound settings as a signal (C5G), so the Settings panel can change them before the
// engine exists (no sound loads until the first gesture) and the engine follows them after.
import { signal } from '@preact/signals';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from './settings';

export const audioSettings = signal<AudioSettings>(loadAudioSettings());

export function setAudioSettings(next: AudioSettings): void {
  audioSettings.value = next;
  saveAudioSettings(next);
}
