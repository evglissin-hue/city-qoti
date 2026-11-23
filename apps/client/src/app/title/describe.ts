import { SEASON_NAMES } from '@qoti/sim';
import { copy } from '../../ui/copy';
import type { RecentValley } from '../recent';

/** Season and day for a valley that has been played since the title learned to keep them. */
export function whereItStands(v: RecentValley): string | null {
  if (typeof v.season !== 'number' || typeof v.day !== 'number') return null;
  const season = SEASON_NAMES[v.season];
  if (!season) return null;
  const year = typeof v.year === 'number' && v.year > 1 ? `, ${copy.title.yearTag(v.year)}` : '';
  return `${season}, day ${v.day}${year}`;
}

/** Who the valley is shared with: Solo, with the partner by name, or For two. */
export function sharedWith(v: RecentValley): string {
  if (v.mode === 'solo') return copy.title.solo;
  return v.partner ? `with ${v.partner}` : copy.title.online;
}
