// Needs and mood (docs/spec/11-residents.md, Needs and Mood). Food is eaten at 07:00 from the
// household pantry, preferring variety; water, shelter, belonging and beauty move hourly toward
// their targets; mood is the weighted average of needs plus modifiers and traits, clamped 0 to 100.
import { content } from '@qoti/content';
import { MOOD_PRODUCTIVITY, NEED_IDS, NEED_WEIGHTS, TICKS_PER_DAY } from '../../constants';
import type { Household, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { moodBand } from '../../view/hamlet';
import { modifierValue } from './api';
import { averageAround, tasteScore } from './desirability';
import { doorOf, tileX, tileZ } from './places';
import { announceHousehold } from './records';
import { hasTrait, traitSum } from './traits';

export const Need = { food: 0, water: 1, shelter: 2, belonging: 3, beauty: 4 } as const;
const WEIGHT_TOTAL = NEED_WEIGHTS.reduce((a, b) => a + b, 0);
/** Charm at which a settler home counts as beautiful (tune). */
export const BEAUTY_THRESHOLD = { settler: 25, craftsfolk: 35, merchant: 45, patron: 55 } as const;

let foodGoods: number[] | null = null;
/** Indexes of food goods, in goods order. */
export function foodIndexes(): number[] {
  if (!foodGoods) {
    foodGoods = [];
    for (let i = 0; i < content.goods.length; i++) if (content.goods[i]!.food) foodGoods.push(i);
  }
  return foodGoods;
}

export function pantryFood(h: Household): number {
  let n = 0;
  for (const g of foodIndexes()) n += h.pantry[g] ?? 0;
  return n;
}

/** Breakfast at 07:00: one food per member, the kind eaten least lately first. */
export function eatBreakfast(state: WorldState, ctx: TickCtx): void {
  const foods = foodIndexes();
  for (const h of state.households) {
    if (!h.homeId) continue;
    let ate = false;
    for (const id of h.members) {
      const r = findById(state.residents, id);
      if (!r || r.activity.kind === 'arrive' || r.activity.kind === 'leave') continue;
      let pick = -1;
      let pickSeen = Infinity;
      for (const g of foods) {
        if ((h.pantry[g] ?? 0) <= 0) continue;
        let seen = 0;
        for (const f of h.recentFoods) if (f === g) seen++;
        if (seen < pickSeen) {
          pickSeen = seen;
          pick = g;
        }
      }
      if (pick < 0) {
        r.needs[Need.food] = Math.max(0, r.needs[Need.food]! - 35);
        continue;
      }
      h.pantry[pick]! -= 1;
      h.recentFoods.push(pick);
      state.economy.today.consumed[pick]! += 1;
      state.economy.season.consumed[pick]! += 1;
      ate = true;
      const kinds = new Set(h.recentFoods).size;
      let food = 80 + (kinds >= 2 ? 10 : 0);
      if (hasTrait(r, 'sweet-tooth') && content.goods[pick]!.id === 'bread') food += 5;
      r.needs[Need.food] = Math.min(100, food);
    }
    // Keep three days of meals for the variety bonus.
    const keep = 3 * Math.max(1, h.members.length);
    if (h.recentFoods.length > keep) h.recentFoods.splice(0, h.recentFoods.length - keep);
    if (ate) announceHousehold(state, ctx, h.id);
  }
}

/** Water service: each well serves households by id within its radius until its capacity is used. */
export function waterServed(state: WorldState): Set<number> {
  const wells: { door: number; x: number; z: number; r: number; left: number }[] = [];
  for (const b of state.buildings) {
    if (b.stage !== 'built') continue;
    const cov = content.buildingById.get(b.def)?.coverage?.find((c) => c.kind === 'water');
    if (!cov) continue;
    wells.push({ door: doorOf(state, b.id), x: b.x, z: b.z, r: cov.radius, left: cov.capacity ?? 30 });
  }
  const served = new Set<number>();
  if (wells.length === 0) return served;
  for (const h of state.households) {
    if (!h.homeId) continue;
    const door = doorOf(state, h.homeId);
    if (door < 0) continue;
    const x = tileX(door);
    const z = tileZ(door);
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < wells.length; i++) {
      const w = wells[i]!;
      if (w.left < h.members.length) continue;
      const dx = w.x - x;
      const dz = w.z - z;
      const d = dx * dx + dz * dz;
      if (d <= w.r * w.r && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      wells[best]!.left -= h.members.length;
      served.add(h.id);
    }
  }
  return served;
}

/** Moves a need a quarter of the way to its target each hour (at least one point). */
function approach(current: number, target: number): number {
  if (current === target) return current;
  const step = Math.trunc((target - current) / 4);
  return current + (step !== 0 ? step : target > current ? 1 : -1);
}

let servedMemo: { state: WorldState; tick: number; served: Set<number> } | null = null;

/** waterServed, computed at most once per tick. */
function servedNow(state: WorldState): Set<number> {
  if (!servedMemo || servedMemo.state !== state || servedMemo.tick !== state.tick) {
    servedMemo = { state, tick: state.tick, served: waterServed(state) };
  }
  return servedMemo.served;
}

/**
 * Hourly needs for one household (staggered over the hour by id): water, shelter, belonging and
 * beauty move toward their targets, then mood is recomputed for each member.
 */
export function updateHouseholdNeeds(state: WorldState, h: Household): void {
  const door = doorOf(state, h.homeId);
  const housed = door >= 0;
  let beauty = 20;
  if (housed) {
    const x = tileX(door);
    const z = tileZ(door);
    const charm = averageAround(state.map.charm, x, z, 3);
    // Charm does most of the work; the household's own tastes add a nudge either way.
    const first = findById(state.residents, h.members[0] ?? 0);
    const sp = first ? content.speciesById.get(first.species) : undefined;
    const taste = sp ? tasteScore(state, sp, x, z, h.homeId) : 0;
    const target = Math.round(Math.min(100, (charm * 100) / BEAUTY_THRESHOLD[h.tier]) * 0.7 + 30 + taste);
    beauty = Math.max(0, Math.min(100, target));
  }
  const watered = housed && servedNow(state).has(h.id);
  for (const id of h.members) {
    const r = findById(state.residents, id);
    if (!r) continue;
    const n = r.needs;
    n[Need.water] = approach(n[Need.water]!, watered ? 100 : 25);
    n[Need.shelter] = approach(n[Need.shelter]!, housed ? 100 : 0);
    n[Need.belonging] = approach(n[Need.belonging]!, belongingTarget(r));
    n[Need.beauty] = approach(n[Need.beauty]!, beauty);
    expireModifiers(state, r);
    r.mood = computeMood(state, r);
  }
}

function belongingTarget(r: Resident): number {
  let best = 0;
  for (const f of r.friends) if (f.level > best) best = f.level;
  return best >= 2 ? 100 : best === 1 ? 70 : r.friends.length > 0 ? 50 : 35;
}

/** Need contribution to mood (weighted), as whole points. */
export function needPoints(r: Resident, i: number): number {
  return ((r.needs[i] ?? 0) * NEED_WEIGHTS[i]!) / WEIGHT_TOTAL;
}

/** +2 when a friend at level 1 or more is Cheerful (it spreads). */
export function cheerfulFriendBonus(state: WorldState, r: Resident): number {
  for (const f of r.friends) {
    if (f.level < 1) continue;
    const other = findById(state.residents, f.id);
    if (other && traitSum(other, 'friendMood') > 0) return traitSum(other, 'friendMood');
  }
  return 0;
}

export function computeMood(state: WorldState, r: Resident): number {
  let mood = 0;
  for (let i = 0; i < NEED_IDS.length; i++) mood += needPoints(r, i);
  mood += traitSum(r, 'mood') + cheerfulFriendBonus(state, r);
  const t = state.tick;
  for (const m of r.modifiers) mood += modifierValue(m, t);
  return Math.max(0, Math.min(100, Math.round(mood)));
}

/** Drops modifiers that have run out. */
export function expireModifiers(state: WorldState, r: Resident): void {
  for (let i = r.modifiers.length - 1; i >= 0; i--) {
    const m = r.modifiers[i]!;
    if (m.until !== 0 && state.tick >= m.until) r.modifiers.splice(i, 1);
  }
}

/** Productivity percent from the mood band, plus Practical's bonus. */
export function productivity(r: Resident): number {
  return MOOD_PRODUCTIVITY[moodBand(r.mood)]! + traitSum(r, 'productivity');
}

/** A newcomer's first-day modifier lasts two days. */
export const FRESH_START_TICKS = 2 * TICKS_PER_DAY;
