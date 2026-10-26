// Trait effects and compatibility (packages/content/src/traits.ts). Effects are data read by name;
// they are lists, never iterated by key. Lookups go through small tables built once from content,
// because schedules and friendships ask thousands of times an hour.
import { content } from '@qoti/content';
import type { Resident } from '../../contracts';

let traitIndex: Map<string, number> | null = null;
/** 1 when trait i clashes with trait j (either way), 2 when one befriends the other, else 0. */
let pairTable: Uint8Array | null = null;
const sums = new Map<string, Float64Array>();
const percents = new Map<string, Float64Array>();
const factors = new Map<string, Float64Array>();

function index(): Map<string, number> {
  if (!traitIndex) {
    traitIndex = new Map(content.traits.map((t, i) => [t.id, i]));
    const n = content.traits.length;
    pairTable = new Uint8Array(n * n);
    content.traits.forEach((a, i) => {
      content.traits.forEach((b, j) => {
        if (a.clashes.includes(b.id) || b.clashes.includes(a.id)) pairTable![i * n + j] = 1;
        else if (a.befriends?.includes(b.id) || b.befriends?.includes(a.id)) pairTable![i * n + j] = 2;
      });
    });
  }
  return traitIndex;
}

/** Per-trait values of one effect: combine 'sum' (default 0), 'percent' (100) or 'factor' (1). */
function table(cache: Map<string, Float64Array>, effect: string, fallback: number): Float64Array {
  let t = cache.get(effect);
  if (!t) {
    t = new Float64Array(content.traits.length).fill(fallback);
    content.traits.forEach((def, i) => {
      for (const [name, value] of def.effects ?? []) if (name === effect) t![i] = value;
    });
    cache.set(effect, t);
  }
  return t;
}

export function hasTrait(r: Resident, id: string): boolean {
  return r.traits.includes(id);
}

/** Sum of an additive effect over a resident's traits (mood points, schedule shift hours). */
export function traitSum(r: Resident, effect: string): number {
  const idx = index();
  const t = table(sums, effect, 0);
  let sum = 0;
  for (let i = 0; i < r.traits.length; i++) sum += t[idx.get(r.traits[i]!) ?? -1] ?? 0;
  return sum;
}

/** Product of a percent effect over a resident's traits, as a percent (100 when none apply). */
export function traitPercent(r: Resident, effect: string): number {
  const idx = index();
  const t = table(percents, effect, 100);
  let pct = 100;
  for (let i = 0; i < r.traits.length; i++) pct = (pct * (t[idx.get(r.traits[i]!) ?? -1] ?? 100)) / 100;
  return pct;
}

/** Product of a multiplier effect (the leisure *Weight effects), 1 when none apply. */
export function traitFactor(r: Resident, effect: string): number {
  const idx = index();
  const t = table(factors, effect, 1);
  let f = 1;
  for (let i = 0; i < r.traits.length; i++) f *= t[idx.get(r.traits[i]!) ?? -1] ?? 1;
  return f;
}

/** True when two trait ids may share a resident. */
export function traitsCompatible(a: string, b: string): boolean {
  if (a === b) return false;
  const idx = index();
  const i = idx.get(a);
  const j = idx.get(b);
  if (i === undefined || j === undefined) return true;
  return pairTable![i * content.traits.length + j] !== 1;
}

/**
 * Friendship compatibility in percent: 150 when a trait of one befriends a trait of the other,
 * 50 when traits clash (clashes win), else 100.
 */
export function compatibility(a: Resident, b: Resident): number {
  const idx = index();
  const n = content.traits.length;
  let match = false;
  for (const ta of a.traits) {
    const i = idx.get(ta);
    if (i === undefined) continue;
    for (const tb of b.traits) {
      const j = idx.get(tb);
      if (j === undefined) continue;
      const v = pairTable![i * n + j];
      if (v === 1) return 50;
      if (v === 2) match = true;
    }
  }
  return match ? 150 : 100;
}
