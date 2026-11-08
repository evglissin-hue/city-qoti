// Population tiers (docs/spec/13-ledger.md, Population tiers; C4C). What a household needs to move
// up (the next tier's basket within reach, its services, charm and savings, and a home that can
// grow), what keeps it there, and the home upgrade itself: materials by porter into rt.upgrade, then
// the def swaps in place. Shared by the tiers system, logistics (deliveries) and the inspector.
import type { BuildingDef, NeedsBasket } from '@qoti/content';
import { content, villagePhrases } from '@qoti/content';
import { BuildingStatus, MAP_SIZE, PENNIES_PER_COIN, TIER_UP_DAYS, TIERS } from '../../constants';
import type { Building, EntityId, Household, TickCtx, TierId, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { goodsArray, isStandard } from '../../state/hamlet';
import { householdView } from '../../view/hamlet';
import { emitBuilding } from '../economy/emit';
import { markCharmDirty } from '../hearth/charm/dirty';
import { doorTile } from '../movement/api';
import { averageAround } from '../residents/desirability';
import { serviceCoverage } from '../services/coverage';
import type { ServiceKind } from '../services/weights';
import { dayIndex } from '../residents/time';

/** Charm a home may fall short by before its household counts as failing its tier (hysteresis). */
export const CHARM_SLACK = 5;
/** Basket satisfaction (C4A's household.basket) below which a group counts as unmet. */
export const BASKET_MET = 50;
/** Tiles around the door the home's charm is averaged over (as the beauty need does). */
const CHARM_RADIUS = 3;

export function tierIndex(t: TierId | undefined): number {
  return Math.max(0, TIERS.indexOf(t ?? 'settler'));
}

/** The tier above, when the valley has unlocked it (the Village Charter unlocks Craftsfolk). */
export function nextTier(state: WorldState, tier: TierId): TierId | null {
  const next = TIERS[tierIndex(tier) + 1];
  if (!next || !content.basketByTier.has(next) || !state.hearth.unlocked.includes(next)) return null;
  return next;
}

function defTier(def: BuildingDef | undefined): number {
  return tierIndex(def?.tier);
}

/**
 * How a home can house a tier: 'fits' (its def already does, for example a townhouse whose
 * household slid back), 'upgrade' (it upgrades in place into a def that does), or null.
 */
export function homeRoute(def: BuildingDef | undefined, tier: TierId): 'fits' | 'upgrade' | null {
  if (!def?.housing) return null;
  if (defTier(def) >= tierIndex(tier)) return 'fits';
  const to = def.upgradesTo ? content.buildingById.get(def.upgradesTo.def) : undefined;
  return to && defTier(to) >= tierIndex(tier) ? 'upgrade' : null;
}

/** Units of each good on outlet shelves (storehouses, stalls, shops), not promised to porters. */
export function outletStock(state: WorldState): number[] {
  const out = goodsArray();
  for (const b of state.buildings) {
    const rt = b.rt;
    if (b.stage !== 'built' || !rt || !content.buildingById.get(b.def)?.tags?.includes('outlet')) continue;
    for (let g = 0; g < out.length; g++)
      out[g]! += Math.max(0, (rt.store[g] ?? 0) - (rt.reservedOut[g] ?? 0));
  }
  return out;
}

/** Everything one pass of checks shares: outlet stock and service coverage, computed once. */
export interface TierContext {
  stock: number[];
  covered: Map<ServiceKind, Map<EntityId, number>>;
}

export function tierContext(state: WorldState): TierContext {
  const covered = new Map<ServiceKind, Map<EntityId, number>>();
  for (const kind of ['social', 'health', 'education'] as const) {
    covered.set(kind, serviceCoverage(state, kind).quality);
  }
  return { stock: outletStock(state), covered };
}

/** Average charm around a home's door. */
export function homeCharm(state: WorldState, home: Building): number {
  const door = doorTile(home);
  const x = door % MAP_SIZE;
  return averageAround(state.map.charm, x, (door - x) / MAP_SIZE, CHARM_RADIUS);
}

export interface TierCheck {
  tier: TierId;
  /** Readable names of what is missing (empty when met). */
  missing: string[];
}

/** Units of a group a household goes through in a day (at least one). */
function groupNeed(h: Household, perDay: number, perHousehold: boolean | undefined): number {
  return Math.max(1, Math.ceil(perHousehold ? perDay : perDay * h.members.length));
}

/**
 * Checks a household against a tier's basket. `aspiring` is the move up: every group must be on
 * the shelves (or in the pantry), with savings and a home that can grow. Otherwise it is the check
 * to stay: C4A's basket satisfaction when the household buys this basket, else the shelves again,
 * and charm with a little slack.
 */
export function checkTier(
  state: WorldState,
  tc: TierContext,
  h: Household,
  basket: NeedsBasket,
  aspiring: boolean,
): TierCheck {
  const missing: string[] = [];
  const M = villagePhrases.missing;
  const home = findById(state.buildings, h.homeId);
  const def = home ? content.buildingById.get(home.def) : undefined;
  if (aspiring && !homeRoute(def, basket.tier)) missing.push(M.home ?? 'home');
  const own = !aspiring && h.basket && h.tier === basket.tier;
  // Two kinds of food lately, bread among them (docs/spec/13-ledger.md, Craftsfolk).
  const bread = content.goodIndex.get('bread')!;
  const wantsBread = basket.groups.some((g) => g.goods.some(([id]) => id === 'bread'));
  if (aspiring && wantsBread) {
    const kinds = new Set(h.recentFoods);
    if (kinds.size < 2 || !kinds.has(bread)) missing.push(M.food ?? 'food');
  }
  basket.groups.forEach((group, gi) => {
    if (own) {
      if ((h.basket![gi] ?? 100) < BASKET_MET) missing.push(group.name.toLowerCase());
      return;
    }
    if (group.id === 'food') return;
    const need = groupNeed(h, group.perDay, group.perHousehold);
    let ok = false;
    for (const [id] of group.goods) {
      const g = content.goodIndex.get(id);
      if (g === undefined) continue;
      if ((h.pantry[g] ?? 0) + (tc.stock[g] ?? 0) >= need) ok = true;
    }
    if (!ok) missing.push(group.name.toLowerCase());
  });
  for (const service of basket.services) {
    const map = tc.covered.get(service as ServiceKind);
    if (map && !map.has(h.id)) missing.push(M[service] ?? service);
  }
  if (home && basket.charm > 0) {
    const charm = homeCharm(state, home);
    if (charm < basket.charm - (aspiring ? 0 : CHARM_SLACK)) missing.push(M.charm ?? 'charm');
  }
  if (aspiring && h.savings < basket.savings * PENNIES_PER_COIN) missing.push(M.savings ?? 'savings');
  return { tier: basket.tier, missing };
}

function phrase(list: readonly string[], key: number): string {
  return list[((key % list.length) + list.length) % list.length] ?? '';
}

function fillText(text: string, pairs: readonly [string, string][]): string {
  let out = text;
  for (const [k, v] of pairs) out = out.split(`{${k}}`).join(v);
  return out;
}

function notice(
  state: WorldState,
  ctx: TickCtx,
  h: Household,
  list: readonly string[],
  home: Building,
): void {
  const def = content.buildingById.get(home.def);
  const text = fillText(phrase(list, h.id + dayIndex(state.tick)), [
    ['family', h.family],
    ['home', (def?.name ?? 'home').toLowerCase()],
    ['tier', villagePhrases.tierNames[tierIndex(h.tier)] ?? h.tier],
  ]);
  const door = doorTile(home);
  const x = door % MAP_SIZE;
  ctx.events.push({ e: 'notify', kind: 'tier', text, at: [x, (door - x) / MAP_SIZE] });
}

/** Moves a household (its members and its home's runtime) to a tier. */
export function setHouseholdTier(state: WorldState, ctx: TickCtx | null, h: Household, tier: TierId): void {
  h.tier = tier;
  h.tierDays = 0;
  // A new tier buys a new basket: C4A fills it on its next pass.
  delete h.basket;
  delete h.owed;
  for (const id of h.members) {
    const r = findById(state.residents, id);
    if (r) r.tier = tier;
  }
  const home = findById(state.buildings, h.homeId);
  if (home?.rt) home.rt.tier = tier;
  if (ctx) ctx.events.push({ e: 'household.updated', h: householdView(h) });
}

/**
 * Starts the move up: a home that already fits promotes the household at once; one that upgrades
 * asks porters for its materials (rt.upgrade) and promotes when they are in (finishUpgrade).
 */
export function startUpgrade(state: WorldState, ctx: TickCtx, h: Household, tier: TierId): boolean {
  const home = findById(state.buildings, h.homeId);
  const def = home ? content.buildingById.get(home.def) : undefined;
  const route = homeRoute(def, tier);
  if (!home?.rt || !def || !route || home.rt.upgrade) return false;
  if (route === 'fits') {
    setHouseholdTier(state, ctx, h, tier);
    emitBuilding(state, ctx, home);
    notice(state, ctx, h, villagePhrases.tierUp, home);
    return true;
  }
  const need = goodsArray();
  for (const [id, qty] of def.upgradesTo!.goods) {
    const g = content.goodIndex.get(id);
    if (g !== undefined) need[g]! += qty;
  }
  home.rt.upgrade = need;
  home.rt.status |= BuildingStatus.upgrading;
  emitBuilding(state, ctx, home);
  notice(state, ctx, h, villagePhrases.upgradeStarted, home);
  return true;
}

/** True while a home waits for upgrade materials. */
export function upgradeDue(b: Building): boolean {
  const u = b.rt?.upgrade;
  if (!u) return false;
  for (let i = 0; i < u.length; i++) if (u[i]! > 0) return true;
  return false;
}

/**
 * Takes delivered materials into a home upgrade; returns the units used (the rest goes back to a
 * storehouse). Completes the upgrade when the last are in.
 */
export function deliverUpgrade(
  state: WorldState,
  ctx: TickCtx,
  b: Building,
  good: number,
  qty: number,
): number {
  const u = b.rt?.upgrade;
  if (!u) return 0;
  const used = Math.min(qty, u[good] ?? 0);
  if (used <= 0) return 0;
  u[good]! -= used;
  const e = state.economy;
  e.today.consumed[good]! += used;
  e.season.consumed[good]! += used;
  if (!upgradeDue(b)) finishUpgrade(state, ctx, b);
  return used;
}

/** The def swaps in place and the household moves up (or the house simply waits for the next one). */
export function finishUpgrade(state: WorldState, ctx: TickCtx, b: Building): void {
  const rt = b.rt;
  const def = content.buildingById.get(b.def);
  const to = def?.upgradesTo ? content.buildingById.get(def.upgradesTo.def) : undefined;
  if (!rt || !def || !to) return;
  rt.upgrade = null;
  rt.status &= ~BuildingStatus.upgrading;
  b.def = to.id;
  const h = state.households.find((x) => x.homeId === b.id);
  const tier = to.tier ?? 'settler';
  if (h && tierIndex(h.tier) < tierIndex(tier)) {
    setHouseholdTier(state, ctx, h, tier);
    notice(state, ctx, h, villagePhrases.tierUp, b);
  } else if (!h) {
    rt.tier = 'settler';
  }
  markCharmDirty(state, [b.x - 1, b.z - 1, b.x + to.size[0], b.z + to.size[1]]);
  emitBuilding(state, ctx, b);
}

/** The household slides back a tier; the home keeps its looks. */
export function slideBack(state: WorldState, ctx: TickCtx, h: Household): void {
  const down = TIERS[tierIndex(h.tier) - 1];
  if (!down) return;
  setHouseholdTier(state, ctx, h, down);
  const home = findById(state.buildings, h.homeId);
  if (home) {
    emitBuilding(state, ctx, home);
    notice(state, ctx, h, villagePhrases.tierDown, home);
  }
}

/** Valleys where tiers move: standard ones that unlocked a tier above Settlers. */
export function tiersActive(state: WorldState): boolean {
  return isStandard(state) && nextTier(state, 'settler') !== null;
}

/** Tier progress for the inspector: the next tier, days met so far, days needed, what is missing. */
export function tierProgress(
  state: WorldState,
  h: Household,
): { next: TierId; days: number; needed: number; missing: string[] } | null {
  const next = nextTier(state, h.tier);
  const basket = next ? content.basketByTier.get(next) : undefined;
  if (!next || !basket) return null;
  const check = checkTier(state, tierContext(state), h, basket, true);
  return { next, days: Math.max(0, h.tierDays ?? 0), needed: TIER_UP_DAYS, missing: check.missing };
}

/**
 * Residents take jobs at their tier or one below (docs/spec/13-ledger.md, Population tiers): a
 * Settler cannot take a skilled job, and Merchants and above refuse basic ones.
 */
export function jobFits(residentTier: TierId, def: BuildingDef | undefined): boolean {
  const job = tierIndex(def?.jobs?.tier);
  const own = tierIndex(residentTier);
  return job <= own && job >= own - 1;
}

/**
 * Goods the Village is short of for its tiers (C4C), so the residents' hiring puts hands on them
 * first (systems/residents/jobs.ts): each Craftsfolk basket group with less than a day of it on
 * the shelves for the whole town, bricks while homes wait to upgrade, herbs while a herbalist is
 * out of them; with the goods their workshops are waiting on (wool for the loom's yarn, flour for
 * the bakery). Empty until the valley unlocks Craftsfolk, so a Hamlet hires as in I1.
 */
export function tierShortages(state: WorldState, stock: readonly number[]): string[] {
  if (!tiersActive(state)) return [];
  const basket = content.basketByTier.get('craftsfolk');
  if (!basket) return [];
  const out = new Set<string>();
  const pop = state.residents.length;
  const homes = state.households.length;
  for (const group of basket.groups) {
    if (group.id === 'food') continue;
    const need = Math.max(4, Math.ceil(group.perDay * (group.perHousehold ? homes : pop)));
    let have = 0;
    for (const [id] of group.goods) have += stock[content.goodIndex.get(id) ?? -1] ?? 0;
    if (have < need) for (const [id] of group.goods) out.add(id);
  }
  if (state.buildings.some((b) => upgradeDue(b))) out.add('bricks');
  // Upstream: whatever the makers of a short good take in.
  for (let pass = 0; pass < 2; pass++) {
    for (const def of content.buildings) {
      for (const m of def.methods ?? []) {
        if (!m.outputs.some(([g]) => out.has(g))) continue;
        for (const [g] of m.inputs) out.add(g);
      }
    }
  }
  return [...out].sort();
}
