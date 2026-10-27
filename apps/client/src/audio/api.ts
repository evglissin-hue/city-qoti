// Audio contract (C5.0; C5G owns the engine behind it). docs/build/cycle-05g-audio.md. A client
// interface (docs/spec/31-parallel-development.md): additive changes only during the I3 wave.
// Sound never touches the sim: nothing in packages/sim imports this.

/**
 * Short sounds any track may ask for. C5G maps sim events to most cues itself; these are the ones
 * other tracks call directly. Add new ids at the end of their group.
 */
export type SoundCueId =
  // I3 seasons and the Watch
  | 'bell'
  | 'howl'
  | 'festival-cheer'
  | 'raid-horn'
  | 'skates'
  | 'thunder'
  // Interface (C5G)
  | 'place'
  | 'remove'
  | 'coins'
  | 'letter'
  | 'ping'
  | 'pattern'
  | 'achievement'
  | 'rank-up'
  | 'built'
  | 'emote';

export interface AudioApi {
  /** Plays a cue once (rate-limited by the engine). */
  cue(id: SoundCueId): void;
  /** Where the camera looks (tiles) and how far out (zoom distance), for ambience. */
  setFocus(x: number, z: number, zoom: number): void;
  /** Lowers the music under letters, the rank-up and raids. */
  duck(on: boolean): void;
}

/** The engine the client starts with until C5G lands: does nothing, quietly. */
export const silentAudio: AudioApi = {
  cue() {},
  setFocus() {},
  duck() {},
};

let current: AudioApi = silentAudio;

/** The audio engine in use. Call sites keep calling `audio().cue(...)`; C5G swaps the engine in. */
export function audio(): AudioApi {
  return current;
}

/** C5G: installs the real engine (once the first user gesture allows sound). */
export function setAudio(engine: AudioApi): void {
  current = engine;
}
