// Homes dress themselves (P1, docs/spec/13-ledger.md, Zoning and growth: Homes improve on their own).
// Daily at 10:30 (R1: the carrier has 10:00), each built home with a household, in buildings order, may take the next rung of the
// ladder in content (`dressing`: window boxes, a porch, ivy) when the charm around its door and its
// household's mood allow, one rung per home every three days (a phase from a hash of the home's id,
// so no cooldown is stored). A home a seat ever customized or fitted a module on (`handmade`) is never
// touched, and the ladder's own changes never set that flag. The first home to step each day sends one
// gentle notice naming its household. Standard valleys only (sandbox has no households).
import { content, type DressingStep } from '@qoti/content';
import { TICKS_PER_DAY } from '../../constants';
import type { Building, System, TickCtx, WorldState } from '../../contracts';
import { buildingRect, householdIn, isHomeDef } from '../../conditions/geo';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { rankAtLeast } from '../../state/village';
import { mix } from '../growth/desirability';
import { markCharmDirty, markCharmSoon } from '../hearth/charm/dirty';
import { emitBuilding } from '../economy/emit';
import { dailyOffset } from '../economy/time';
import { fitModule } from '../modules';
import { averageAround } from '../residents/desirability';
import { doorOf, tileX, tileZ } from '../residents/places';
import { dayIndex } from '../residents/time';

/** A household's average mood needed before its home dresses up (0 to 100). */
export const DRESSING_MOOD = 60;
/** Days between a home's steps. */
export const DRESSING_DAYS = 3;

const FLOWERS: readonly string[] = content.swatches.filter((s) => s.group === 'flowers').map((s) => s.id);

/** Whether the step is already in place on the home. */
function done(b: Building, step: DressingStep): boolean {
  if (step.kind === 'custom') return b.custom?.[step.ref] === true;
  const slot = content.moduleById.get(step.ref)?.slot;
  return !!b.rt?.modules?.some(([s, id]) => s === slot && id === step.ref);
}

/** Whether a module step has a free slot to go in (modules are fitted one at a time, never over another). */
function slotFree(b: Building, step: DressingStep): boolean {
  const m = content.moduleById.get(step.ref);
  const rt = b.rt;
  if (!m || !rt || rt.moduleNext || rt.upgrade) return false;
  const slots = content.buildingById.get(b.def)?.moduleSlots ?? [];
  if (!slots.some(([s]) => s === m.slot)) return false;
  return !(rt.modules ?? []).some(([s]) => s === m.slot);
}

/** The step a home would take next at this charm, or undefined. Steps lacking a free slot are passed over. */
export function nextStep(state: WorldState, b: Building, charm: number): DressingStep | undefined {
  for (const step of content.dressing) {
    if (done(b, step)) continue;
    if (step.kind === 'module' && !slotFree(b, step)) continue;
    if (!rankAtLeast(state, step.rank)) continue;
    return charm >= step.charm ? step : undefined;
  }
  return undefined;
}

function householdMood(state: WorldState, members: readonly number[]): number {
  let sum = 0;
  let n = 0;
  for (const id of members) {
    const r = findById(state.residents, id);
    if (!r) continue;
    sum += r.mood;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

function take(state: WorldState, ctx: TickCtx, b: Building, step: DressingStep): void {
  if (step.kind === 'custom') {
    const flower = FLOWERS.length ? FLOWERS[mix(b.id, 7) % FLOWERS.length]! : 'mixed';
    b.custom = { ...(b.custom ?? {}), windowFlowers: flower, [step.ref]: true };
    markCharmDirty(state, buildingRect(b));
    markCharmSoon(state);
  } else {
    fitModule(state, b, content.moduleById.get(step.ref)!.slot, step.ref);
  }
  emitBuilding(state, ctx, b);
}

export function dressHomes(state: WorldState, ctx: TickCtx): void {
  const day = dayIndex(state.tick);
  let told = false;
  for (const b of state.buildings) {
    if (b.stage !== 'built' || b.handmade) continue;
    if ((day + mix(b.id)) % DRESSING_DAYS !== 0) continue;
    if (!isHomeDef(content.buildingById.get(b.def))) continue;
    const h = householdIn(state, b.id);
    if (!h || householdMood(state, h.members) < DRESSING_MOOD) continue;
    const door = doorOf(state, b.id);
    if (door < 0) continue;
    const charm = averageAround(state.map.charm, tileX(door), tileZ(door), 3);
    const step = nextStep(state, b, charm);
    if (!step) continue;
    take(state, ctx, b, step);
    if (!told) {
      told = true;
      ctx.events.push({
        e: 'notify',
        kind: 'dressing',
        text: step.notice.replace('{family}', h.family),
        at: [b.x, b.z],
      });
    }
  }
}

export const dressing: System = {
  id: 'dressing',
  order: 71,
  every: TICKS_PER_DAY,
  offset: dailyOffset(10, 100),
  tick(state, ctx) {
    if (!isStandard(state)) return;
    dressHomes(state, ctx);
  },
};
