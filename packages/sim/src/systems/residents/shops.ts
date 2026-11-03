// Opening a shop (C5B; docs/spec/11-residents.md, Ages and life events, I3): once a season, on
// day SHOP_DAY at SHOP_HOUR, a grown-up whose household has put by SHOP_SAVINGS and who has a trait
// that suits shopkeeping opens a named shop on a vacant shop lot (growLot with the grown shop), with
// its own sign. The town's builders put it up as for any grown building, so no money moves; the
// savings only show the family can see a shop through. One shop a family, and one a season.
import { PENNIES_PER_COIN, Zone } from '../../constants';
import type { Building, Household, Resident, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { chronicle } from '../chronicle/api';
import { growLot } from '../growth/api';
import { growable } from '../growth';
import { seasonNow } from '../seasons/api';

/** Savings a household needs, in coins. */
export const SHOP_SAVINGS = 40;
export const SHOP_DAY = 2;
export const SHOP_HOUR = 10;
/** Traits that suit a shop, and the sign each paints (24 characters at most with the family name). */
export const SHOP_TRAITS: readonly (readonly [trait: string, sign: string])[] = [
  ['artistic', 'Curios'],
  ['cheerful', 'Stores'],
  ['generous', 'Provisions'],
  ['practical', 'Hardware'],
  ['sweet-tooth', 'Sweets'],
  ['thrifty', 'Bargains'],
];
const SIGN_MAX = 24;

function signFor(family: string, kind: string): string {
  const s = `${family} ${kind}`;
  return s.length <= SIGN_MAX ? s : kind;
}

function hasShop(state: WorldState, family: string): boolean {
  for (const b of state.buildings) {
    const sign = b.custom?.sign;
    if (typeof sign === 'string' && sign.startsWith(`${family} `)) return true;
  }
  return false;
}

/** The first grown-up (by id) who would open a shop now, with the sign it would carry. */
export function shopkeeper(state: WorldState): { r: Resident; h: Household; sign: string } | null {
  for (const r of state.residents) {
    if (r.stage !== 'adult') continue;
    const fit = SHOP_TRAITS.find(([t]) => r.traits.includes(t));
    if (!fit) continue;
    const h = findById(state.households, r.householdId);
    if (!h || h.savings < SHOP_SAVINGS * PENNIES_PER_COIN || hasShop(state, h.family)) continue;
    return { r, h, sign: signFor(h.family, fit[1]) };
  }
  return null;
}

/** Opens a shop if someone is ready and a shop lot is free. Returns the new building or null. */
export function openShop(state: WorldState, ctx: TickCtx | null): Building | null {
  const defs = growable(state, 'shops');
  const def = defs[0];
  if (!def) return null;
  const who = shopkeeper(state);
  if (!who) return null;
  for (const lot of state.lots) {
    if (lot.buildingId || lot.zone !== Zone.shops) continue;
    const b = growLot(state, ctx, lot.id, def.id);
    if (!b) continue;
    b.custom = { ...(b.custom ?? {}), sign: who.sign };
    if (ctx) {
      const name = `${who.r.given} ${who.r.family}`;
      chronicle(state, ctx, 'shop-opened', {
        text: [
          ['name', name],
          ['shop', who.sign],
        ],
        refs: [who.r.id, b.id],
      });
      ctx.events.push({
        e: 'notify',
        kind: 'letter',
        text: `${name} is opening a shop: ${who.sign}. The sign is already painted, slightly crooked, entirely charming.`,
      });
    }
    return b;
  }
  return null;
}

/** The daily look, from the C5B hourly pass. */
export function shopsHour(state: WorldState, ctx: TickCtx, hour: number): void {
  if (hour !== SHOP_HOUR || seasonNow(state).day !== SHOP_DAY) return;
  openShop(state, ctx);
}
