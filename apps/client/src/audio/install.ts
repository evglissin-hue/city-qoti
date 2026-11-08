// Starts sound on the first user gesture in a valley (C5G). The engine is its own chunk, loaded
// only then, so the title screen and the first paint load no audio. Until it lands, `audio()` is
// the silent stub and calls to it simply do nothing.
import { effect } from '@preact/signals';
import { setAudio, silentAudio } from './api';
import type { AudioEngine, AudioSource } from './engine';
import { audioSettings } from './store';

let engine: AudioEngine | null = null;
let context: AudioContext | null = null;

/** The running engine, or null before the first gesture (for the debug hook and the session). */
export function audioEngine(): AudioEngine | null {
  return engine;
}

/**
 * Waits for the first pointer or key press, then creates the audio context and the engine and
 * attaches it to the valley. Returns a function that tears it down (leaving the valley).
 */
export function installAudio(source: AudioSource): () => void {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return () => {};
  // Automated browsers (the e2e suite) stay silent unless a page asks for sound with ?audio: two
  // browsers rendering instruments on a shared CI runner slowed the two-seat specs past their time.
  if (navigator.webdriver && !new URLSearchParams(location.search).has('audio')) return () => {};
  let disposed = false;
  let stopSettings: (() => void) | null = null;
  const start = (): void => {
    window.removeEventListener('pointerdown', start, true);
    window.removeEventListener('keydown', start, true);
    // Resume on the gesture itself, as browsers require; the engine module follows.
    context ??= new AudioContext({ latencyHint: 'playback' });
    void context.resume();
    void import('./engine').then(({ AudioEngine }) => {
      if (disposed || !context) return;
      engine = new AudioEngine(context, audioSettings.value);
      engine.attach(source);
      stopSettings = effect(() => engine?.apply(audioSettings.value));
      setAudio(engine);
    });
  };
  window.addEventListener('pointerdown', start, true);
  window.addEventListener('keydown', start, true);
  return () => {
    disposed = true;
    window.removeEventListener('pointerdown', start, true);
    window.removeEventListener('keydown', start, true);
    stopSettings?.();
    engine?.detach();
    engine = null;
    setAudio(silentAudio);
  };
}
