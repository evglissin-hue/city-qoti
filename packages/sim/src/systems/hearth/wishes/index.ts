// Wishes (docs/spec/12-hearth.md, Wishes). Each in-game hour every active wish's target is
// checked: met means granted (mood and bond rewards through C3A's APIs, a hop, a thank-you letter,
// a line for the weekly digest), past its expiry means it fades quietly. Each day at 07:00 new
// wishes are made up to the active cap (2 + population / 15, max 12), at most two a day: residents
// are picked weighted toward low mood (no active wish, bond under 5), then a template whose offer
// conditions match and whose target is not already met, weighted by template.
import { chroniclePhrases, content, type WishTemplate } from '@qoti/content';
import {
  MAX_WISHES,
  ResidentFlags,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  HOURS_PER_DAY,
  WISH_EXPIRY_DAYS,
} from '../../../constants';
import type {
  Building,
  EntityId,
  Resident,
  SimEvent,
  System,
  TickCtx,
  Wish,
  WorldState,
} from '../../../contracts';
import { type Binding, evaluate } from '../../../conditions';
import { buildingRect, rectGap2 } from '../../../conditions/geo';
import { findById, removeById } from '../../../state/entities';
import { isStandard } from '../../../state/hamlet';
import { patternView, residentView, townView, wishView } from '../../../view/hamlet';
import { fill, pick } from '../../chronicle/text';
import { addBond, addMoodModifier } from '../../residents/api';

export const WISH_HOUR = 7;
/** New wishes per morning at most (tune). */
export const WISHES_PER_DAY = 2;
/** The mood boost of a granted wish lasts three days, fading as it goes. */
export const WISH_MOOD_TICKS = 3 * TICKS_PER_DAY;

export const wishes: System = {
  id: 'wishes',
  order: 74,
  every: TICKS_PER_HOUR,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    checkWishes(state, ctx);
    const t = state.tick - 1;
    const hour = (Math.floor(t / TICKS_PER_HOUR) + START_HOUR) % HOURS_PER_DAY;
    if (hour === WISH_HOUR) generateWishes(state, ctx);
  },
};

/** Active wish cap for a population. */
export function wishCap(population: number): number {
  return Math.min(MAX_WISHES, 2 + Math.floor(population / 15));
}

export function homeOf(state: WorldState, r: Resident): EntityId {
  const h = findById(state.households, r.householdId);
  return h && findById(state.buildings, h.homeId) ? h.homeId : 0;
}

/** The market stall nearest a home (by footprint gap, ties to the lower id), or 0. */
export function nearestMarket(state: WorldState, homeId: EntityId): EntityId {
  const home = findById(state.buildings, homeId);
  if (!home) return 0;
  const r = buildingRect(home);
  let best = 0;
  let bestGap = Infinity;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || !content.buildingById.get(b.def)?.tags?.includes('market')) continue;
    const g = rectGap2(buildingRect(b), r);
    if (g < bestGap) {
      bestGap = g;
      best = b.id;
    }
  }
  return best;
}

/** The places a wish for this resident would be bound to right now. */
export function bindFor(state: WorldState, r: Resident): Binding {
  const home = homeOf(state, r);
  const work = r.jobId && findById(state.buildings, r.jobId) ? r.jobId : 0;
  return { residentId: r.id, home, work, market: nearestMarket(state, home) };
}

export function wishBinding(w: Wish): Binding {
  return { residentId: w.residentId, home: w.home, work: w.work, market: w.market };
}

// --- Generation ---------------------------------------------------------------------------------

/** Makes the morning's new wishes from `templates` (all of them in play). Returns how many were made. */
export function generateWishes(
  state: WorldState,
  ctx: TickCtx,
  templates: readonly WishTemplate[] = content.wishes,
): number {
  const slots = Math.min(WISHES_PER_DAY, wishCap(state.residents.length) - state.wishes.length);
  if (slots <= 0) return 0;
  const rng = ctx.rng('wishes');
  const pool = state.residents.filter(
    (r) => r.wishId === 0 && r.bond < 5 && !(r.flags & ResidentFlags.leaving) && homeOf(state, r) !== 0,
  );
  let made = 0;
  while (made < slots && pool.length > 0) {
    let total = 0;
    for (const r of pool) total += residentWeight(r);
    let roll = rng.int(total);
    let i = 0;
    while (roll >= residentWeight(pool[i]!)) roll -= residentWeight(pool[i++]!);
    const r = pool.splice(i, 1)[0]!;
    const bind = bindFor(state, r);
    const options: WishTemplate[] = [];
    let weights = 0;
    for (const t of templates) {
      if (activeAtHome(state, t.id, bind.home!)) continue;
      if (!evaluate(state, t.when, bind) || evaluate(state, t.target, bind)) continue;
      options.push(t);
      weights += templateWeight(t);
    }
    if (options.length === 0) continue;
    let pickW = rng.int(weights);
    let k = 0;
    while (pickW >= templateWeight(options[k]!)) pickW -= templateWeight(options[k++]!);
    makeWish(state, ctx, r, options[k]!, bind, rng.int(options[k]!.text.length));
    made++;
  }
  return made;
}

function templateWeight(t: WishTemplate): number {
  return Math.max(1, t.weight ?? 1);
}

/** Lower mood weighs more: a resident at mood 20 is about twice as likely as one at 70. */
function residentWeight(r: Resident): number {
  return 20 + Math.max(0, 100 - r.mood);
}

function activeAtHome(state: WorldState, template: string, home: EntityId): boolean {
  for (const w of state.wishes) if (w.template === template && w.home === home) return true;
  return false;
}

/** Creates a wish (also used by tests and debug tools). */
export function makeWish(
  state: WorldState,
  ctx: TickCtx,
  r: Resident,
  t: WishTemplate,
  bind: Binding = bindFor(state, r),
  variant = 0,
): Wish {
  const w: Wish = {
    id: state.nextId++,
    template: t.id,
    residentId: r.id,
    variant,
    home: bind.home ?? 0,
    work: bind.work ?? 0,
    market: bind.market ?? 0,
    createdTick: state.tick,
    expiresTick: state.tick + (t.expiryDays ?? WISH_EXPIRY_DAYS) * TICKS_PER_DAY,
  };
  state.wishes.push(w);
  r.wishId = w.id;
  ctx.events.push({ e: 'wish.added', w: wishView(state, w) });
  ctx.events.push({ e: 'resident.updated', r: residentView(state, r) });
  return w;
}

// --- Hourly checks ------------------------------------------------------------------------------

/** Grants met wishes, fades expired ones and drops orphans. Returns [granted, expired]. */
export function checkWishes(state: WorldState, ctx: TickCtx): [number, number] {
  let granted = 0;
  let expired = 0;
  for (const w of [...state.wishes]) {
    const t = content.wishById.get(w.template);
    const r = findById(state.residents, w.residentId);
    if (!t || !r || r.wishId !== w.id || !findById(state.buildings, w.home)) {
      endWish(state, ctx, w, r && r.wishId === w.id ? r : undefined);
      expired++;
    } else if (evaluate(state, t.target, wishBinding(w))) {
      grantWish(state, ctx, w, r, t);
      granted++;
    } else if (state.tick >= w.expiresTick) {
      endWish(state, ctx, w, r);
      expired++;
    }
  }
  return [granted, expired];
}

function endWish(state: WorldState, ctx: TickCtx, w: Wish, r: Resident | undefined): void {
  removeById(state.wishes, w.id);
  state.stats.wishesExpired += 1;
  ctx.events.push({ e: 'wish.expired', id: w.id });
  if (r) {
    r.wishId = 0;
    ctx.events.push({ e: 'resident.updated', r: residentView(state, r) });
  }
}

export function grantWish(state: WorldState, ctx: TickCtx, w: Wish, r: Resident, t: WishTemplate): void {
  removeById(state.wishes, w.id);
  addMoodModifier(state, r.id, { kind: 'wish-granted', value: t.reward.mood, ticks: WISH_MOOD_TICKS });
  addBond(state, r.id, t.reward.bond);
  if (t.reward.unlock && !state.hearth.unlocked.includes(t.reward.unlock)) {
    state.hearth.unlocked.push(t.reward.unlock);
  }
  r.wishId = 0;
  r.flags |= ResidentFlags.hop;
  state.stats.wishesGranted += 1;
  state.stats.digest.push([r.id, w.template]);

  const home = findById(state.buildings, w.home);
  ctx.events.push({ e: 'wish.granted', id: w.id, residentId: r.id });
  ctx.events.push({ e: 'resident.updated', r: residentView(state, r) });
  const letter: Extract<SimEvent, { e: 'notify' }> = {
    e: 'notify',
    kind: 'letter',
    text: thankYouLetter(state, ctx, r, t, home),
  };
  if (home) letter.at = [home.x, home.z];
  ctx.events.push(letter);
  if (t.reward.hint) {
    for (const id of state.hearth.hints) ctx.events.push({ e: 'pattern.updated', p: patternView(state, id) });
  }
  ctx.events.push({ e: 'town.updated', t: townView(state) });
}

/** The letter: a thank-you variant, a sign-off, and a hint if the resident is curious. */
export function thankYouLetter(
  state: WorldState,
  ctx: TickCtx,
  r: Resident,
  t: WishTemplate,
  home: Building | undefined,
): string {
  const params: [string, string][] = [
    ['name', r.given],
    ['family', r.family],
    ['place', home ? (content.buildingById.get(home.def)?.name.toLowerCase() ?? 'home') : 'home'],
  ];
  const rng = ctx.rng('wishes');
  const body = fill(t.thanks[rng.int(Math.max(1, t.thanks.length))] ?? '', params);
  const lines = [body];
  if (r.traits.includes('curious')) {
    const hinted = state.hearth.hints[0];
    const hint = hinted ? content.patternById.get(hinted)?.hint : undefined;
    if (hint) {
      const lower = hint.charAt(0).toLowerCase() + hint.slice(1);
      lines.push(fill(pick(ctx, chroniclePhrases.curiousPostscript), [['hint', lower]]));
    }
  }
  lines.push(fill(pick(ctx, chroniclePhrases.letterSignoff), params));
  return lines.join('\n');
}
