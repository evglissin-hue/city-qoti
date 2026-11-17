// Valley seeds the specs type on the title screen when a check needs a known valley rather than a
// random one. Plain values only: unit tests import this file too.

/**
 * audio.spec.ts: a valley (Aldermere) whose first piece plays a recorded lead, the clarinet. A
 * hamlet's band is its lead and a guitar, and one valley in three draws the kalimba lead; neither
 * has recordings, so that first piece fetches none. src/audio/music.test.ts checks this seed.
 */
export const AUDIO_SEED = 'first-gesture';
