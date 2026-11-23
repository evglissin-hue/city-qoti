// R3E: the two ways the bench plays a seed. The tuned player is the autoplayer as tuned through R2;
// the newcomer pair is P3A's (`newcomer.ts`, docs/build): workplaces before homes, zoning late and in
// lumps, no places for the first evenings, several sites at once, no labor sums.
import type { AutoplayOptions } from './advisors/types';

export type Profile = 'tuned' | 'newcomer';
export const PROFILES: readonly Profile[] = ['tuned', 'newcomer'];

/**
 * Whether `autoplay` reads `AutoplayOptions.newcomer` yet. P3A adds that on `main`; until it merges,
 * `autoplay` ignores the option and a newcomer run plays as the tuned player. The master flips this
 * to true when P3A lands (R3X did, on merging main), and the report headers stop saying "pending".
 */
export const NEWCOMER_LIVE = true;

/** The autoplay options for a profile. */
export function profileOptions(p: Profile): AutoplayOptions {
  return p === 'newcomer' ? { newcomer: true } : {};
}

/** The seed column of a row: `willow` for the tuned player, `willow/newcomer` for the newcomers. */
export function seedLabel(seed: string, p: Profile): string {
  return p === 'tuned' ? seed : `${seed}/${p}`;
}

/** The header line saying how the newcomer profile plays. */
export function newcomerNote(): string {
  return NEWCOMER_LIVE ? 'newcomer profile: live (P3A)' : 'newcomer profile: pending P3A, plays as tuned';
}
