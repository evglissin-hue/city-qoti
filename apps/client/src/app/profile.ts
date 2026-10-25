// The player's own name and color, remembered on this device and sent with seat.setProfile
// when a valley opens, so labels and "paused by" use real names.
import { readJson, writeJson } from './storage';

export interface PlayerProfile {
  name: string;
  color: number | null;
}

const KEY = 'qoti.profile.v1';

// Warm swatches for the color picker, in display order.
export const SWATCHES: readonly number[] = [0xd0704f, 0xd9a441, 0x7f9c6c, 0x5f93b3, 0x9a6b8f, 0xe08e8e];

export function loadProfile(): PlayerProfile {
  const p = readJson<Partial<PlayerProfile>>(KEY, {});
  return {
    name: typeof p.name === 'string' ? p.name.slice(0, 24) : '',
    color: typeof p.color === 'number' ? p.color : null,
  };
}

export function saveProfile(p: PlayerProfile): void {
  writeJson(KEY, p);
}

/** The setProfile payload needed to bring a seat in line with the saved profile, or null. */
export function profileUpdate(
  p: PlayerProfile,
  current: { name: string; color: number },
): { name: string; color: number } | null {
  const name = p.name.trim() || current.name;
  const color = p.color ?? current.color;
  if (name === current.name && color === current.color) return null;
  return { name, color };
}
