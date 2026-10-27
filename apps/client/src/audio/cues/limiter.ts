// Cue rate limits (C5G): each cue waits its own gap before it plays again, and no more than a few
// cues play in any second, so a box drag of 40 houses plays one sound.
import type { SoundCueId } from '../api';

/** Minimum seconds between two plays of the same cue. */
export const CUE_GAP: Record<SoundCueId, number> = {
  achievement: 2,
  bell: 1.5,
  built: 0.8,
  coins: 12,
  emote: 0.3,
  'festival-cheer': 8,
  howl: 20,
  letter: 1.5,
  pattern: 2,
  ping: 0.4,
  place: 0.25,
  'raid-horn': 10,
  'rank-up': 5,
  remove: 0.25,
  skates: 3,
  thunder: 6,
};

/** At most this many cues start in any one second. */
export const CUES_PER_SECOND = 4;

export class CueLimiter {
  private readonly last = new Map<SoundCueId, number>();
  private recent: number[] = [];

  /** True when `id` may play at `now` (seconds); records the play. */
  allow(id: SoundCueId, now: number): boolean {
    const prev = this.last.get(id);
    if (prev !== undefined && now - prev < CUE_GAP[id]) return false;
    this.recent = this.recent.filter((t) => now - t < 1);
    if (this.recent.length >= CUES_PER_SECOND) return false;
    this.last.set(id, now);
    this.recent.push(now);
    return true;
  }
}
