// History lines and coarse resident events. resident.updated goes out only when the coarse view
// changes (home, job, tier, wish, mood band, bond, flags, stage), so the event stream stays small.
// The last signature sent per resident lives in a derived index, never in saved state; a valley
// loaded from a snapshot starts from the snapshot's views, so its first look sends nothing.
import { MAX_HISTORY } from '../../constants';
import type { EntityId, Resident, TickCtx, WorldState } from '../../contracts';
import { householdView, moodBand, residentView, townView } from '../../view/hamlet';
import { findById } from '../../state/entities';
import { dayIndex } from './time';

export function pushHistory(state: WorldState, r: Resident, kind: string, ref?: EntityId): void {
  const day = dayIndex(state.tick);
  r.history.push(ref === undefined ? { day, kind } : { day, kind, ref });
  if (r.history.length > MAX_HISTORY) r.history.splice(0, r.history.length - MAX_HISTORY);
}

/** True when the resident already logged this kind today (keeps repeats out of the history). */
export function loggedToday(state: WorldState, r: Resident, kind: string): boolean {
  const day = dayIndex(state.tick);
  for (let i = r.history.length - 1; i >= 0; i--) {
    const h = r.history[i]!;
    if (h.day !== day) return false;
    if (h.kind === kind) return true;
  }
  return false;
}

const STAGES = ['child', 'young', 'adult', 'elder'];
const TIERS = ['settler', 'craftsfolk', 'merchant', 'patron'];

function mix(h: number, v: number): number {
  return Math.imul(h ^ v, 0x9e3779b1) ^ (h >>> 15);
}

/** A number that changes whenever the coarse ResidentView changes. */
export function coarseSignature(state: WorldState, r: Resident): number {
  const home = findById(state.households, r.householdId)?.homeId ?? 0;
  let h = 0x811c9dc5;
  h = mix(h, home);
  h = mix(h, r.jobId);
  h = mix(h, TIERS.indexOf(r.tier));
  h = mix(h, r.wishId);
  h = mix(h, moodBand(r.mood));
  h = mix(h, r.bond);
  h = mix(h, r.flags);
  h = mix(h, STAGES.indexOf(r.stage));
  h = mix(h, r.householdId);
  return h >>> 0;
}

const signatures = new WeakMap<WorldState, Map<EntityId, number>>();

function sigs(state: WorldState): Map<EntityId, number> {
  let m = signatures.get(state);
  if (!m) {
    m = new Map();
    signatures.set(state, m);
  }
  return m;
}

/** Emits resident.updated when the coarse view moved since the last one sent. */
export function syncResident(state: WorldState, ctx: TickCtx, r: Resident): void {
  const m = sigs(state);
  const sig = coarseSignature(state, r);
  const old = m.get(r.id);
  if (old === sig) return;
  m.set(r.id, sig);
  if (old !== undefined) ctx.events.push({ e: 'resident.updated', r: residentView(state, r) });
}

/** resident.added, remembering the signature it carried. */
export function announceResident(state: WorldState, ctx: TickCtx, r: Resident): void {
  sigs(state).set(r.id, coarseSignature(state, r));
  ctx.events.push({ e: 'resident.added', r: residentView(state, r) });
}

export function forgetResident(state: WorldState, ctx: TickCtx, id: EntityId): void {
  sigs(state).delete(id);
  ctx.events.push({ e: 'resident.removed', id });
}

export function announceHousehold(state: WorldState, ctx: TickCtx, id: EntityId, added = false): void {
  const h = findById(state.households, id);
  if (h) ctx.events.push({ e: added ? 'household.added' : 'household.updated', h: householdView(h) });
}

export function announceTown(state: WorldState, ctx: TickCtx): void {
  ctx.events.push({ e: 'town.updated', t: townView(state) });
}
