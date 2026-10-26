// Trait effects and compatibility (packages/content/src/traits.ts). Effects are data read by name;
// they are lists, never iterated by key.
import { content } from '@qoti/content';
import type { Resident } from '../../contracts';

export function hasTrait(r: Resident, id: string): boolean {
  return r.traits.includes(id);
}

/** Sum of an additive effect over a resident's traits (mood points, schedule shift hours). */
export function traitSum(r: Resident, effect: string): number {
  let sum = 0;
  for (let i = 0; i < r.traits.length; i++) {
    const effects = content.traitById.get(r.traits[i]!)?.effects;
    if (!effects) continue;
    for (const [name, value] of effects) if (name === effect) sum += value;
  }
  return sum;
}

/** Product of a percent effect over a resident's traits, as a percent (100 when none apply). */
export function traitPercent(r: Resident, effect: string): number {
  let pct = 100;
  for (let i = 0; i < r.traits.length; i++) {
    const effects = content.traitById.get(r.traits[i]!)?.effects;
    if (!effects) continue;
    for (const [name, value] of effects) if (name === effect) pct = (pct * value) / 100;
  }
  return pct;
}

/** Product of a multiplier effect (the leisure *Weight effects), 1 when none apply. */
export function traitFactor(r: Resident, effect: string): number {
  let f = 1;
  for (let i = 0; i < r.traits.length; i++) {
    const effects = content.traitById.get(r.traits[i]!)?.effects;
    if (!effects) continue;
    for (const [name, value] of effects) if (name === effect) f *= value;
  }
  return f;
}

/** True when two trait ids may share a resident. */
export function traitsCompatible(a: string, b: string): boolean {
  if (a === b) return false;
  const ta = content.traitById.get(a);
  const tb = content.traitById.get(b);
  return !ta?.clashes.includes(b) && !tb?.clashes.includes(a);
}

/**
 * Friendship compatibility in percent: 150 when a trait of one befriends a trait of the other,
 * 50 when traits clash (clashes win), else 100.
 */
export function compatibility(a: Resident, b: Resident): number {
  let match = false;
  for (const ta of a.traits) {
    const da = content.traitById.get(ta);
    for (const tb of b.traits) {
      if (da?.clashes.includes(tb)) return 50;
      if (da?.befriends?.includes(tb) || content.traitById.get(tb)?.befriends?.includes(ta)) match = true;
    }
  }
  return match ? 150 : 100;
}
