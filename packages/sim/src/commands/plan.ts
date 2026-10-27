// Plans (C4.0 baseline; C4D owns them). docs/spec/16-coop.md, Plans layer: a named set of proposed
// commands drawn as ink-blue ghosts. Either seat may comment, approve or discard, including its
// own; approving runs the commands in order where they are still valid and reports the rest.
// C4D adds plan.edit (a tweak the partner sees afresh) and the note after an approval.
import { lifePhrases } from '@qoti/content';
import {
  MAX_COMMENT_CHARS,
  MAX_COMMENTS,
  MAX_PLAN_ITEMS,
  MAX_PLAN_NAME_CHARS,
  MAX_PLANS,
} from '../constants';
import type { CommandType, Plan, PlanItem, TickCtx, WorldState } from '../contracts';
import { isInt } from '../rules/geometry';
import { findById, removeById } from '../state/entities';
import { fillText } from '../view/hamlet';
import { planView } from '../view/village';
import { seatName } from '../systems/chronicle/text';
import { handlerFor } from './index';
import { takeId, trimmed, type HandlerFor } from './util';

/** Commands a plan may hold: building the valley, not running it. */
const PLANNABLE: ReadonlySet<CommandType> = new Set<CommandType>([
  'build.place',
  'build.remove',
  'decor.place',
  'decor.placeRun',
  'decor.remove',
  'field.paint',
  'field.remove',
  'note.pin',
  'road.paint',
  'road.remove',
  'terrain.lower',
  'terrain.raise',
  'tree.plant',
  'tree.remove',
  'zone.clear',
  'zone.paint',
]);

function validItems(items: unknown): items is PlanItem[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_PLAN_ITEMS) return false;
  for (const item of items) {
    const cmd = (item as PlanItem | null)?.cmd;
    if (!cmd || typeof cmd !== 'object' || !PLANNABLE.has(cmd.t)) return false;
  }
  return true;
}

function openPlan(state: WorldState, id: unknown): Plan | undefined {
  const p = isInt(id) ? findById(state.plans, id) : undefined;
  return p?.status === 'open' ? p : undefined;
}

function emitPlan(ctx: TickCtx, p: Plan): void {
  ctx.events.push({ e: 'plan.updated', p: planView(p) });
}

export const add: HandlerFor<'plan.add'> = {
  type: 'plan.add',
  validate(state, _seat, cmd) {
    if (!trimmed(cmd.name, MAX_PLAN_NAME_CHARS) || !validItems(cmd.items)) return 'INVALID';
    return state.plans.filter((p) => p.status === 'open').length >= MAX_PLANS ? 'TOO_MANY' : null;
  },
  apply(state, seat, cmd, ctx) {
    const p: Plan = {
      id: takeId(state),
      name: trimmed(cmd.name, MAX_PLAN_NAME_CHARS)!,
      by: seat,
      tick: state.tick,
      items: cmd.items.map((i) => ({ cmd: i.cmd })),
      comments: [],
      seenBy: [seat],
      status: 'open',
    };
    state.plans.push(p);
    ctx.events.push({ e: 'plan.added', p: planView(p) });
  },
};

export const remove: HandlerFor<'plan.remove'> = {
  type: 'plan.remove',
  validate(state, _seat, cmd) {
    return isInt(cmd.id) && findById(state.plans, cmd.id) ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    removeById(state.plans, cmd.id);
    ctx.events.push({ e: 'plan.removed', id: cmd.id });
  },
};

export const approve: HandlerFor<'plan.approve'> = {
  type: 'plan.approve',
  validate(state, _seat, cmd) {
    return openPlan(state, cmd.id) ? null : 'NOT_FOUND';
  },
  apply(state, seat, cmd, ctx) {
    const p = openPlan(state, cmd.id)!;
    let applied = 0;
    let skipped = 0;
    for (const item of p.items) {
      const handler = handlerFor(item.cmd);
      let ok: boolean;
      try {
        ok = !!handler && handler.validate(state, seat, item.cmd as never) === null;
      } catch {
        ok = false;
      }
      if (ok) {
        handler!.apply(state, seat, item.cmd as never, ctx);
        applied++;
      } else skipped++;
    }
    p.status = 'approved';
    p.applied = applied;
    p.skipped = skipped;
    if (!p.seenBy.includes(seat)) {
      p.seenBy.push(seat);
      p.seenBy.sort((a, b) => a - b);
    }
    state.village.plansApproved += 1;
    emitPlan(ctx, p);
    // C4D: a note to both seats on what was built and what had to be skipped.
    const template =
      skipped === 0
        ? lifePhrases.planApproved
        : applied === 0
          ? lifePhrases.planNone
          : lifePhrases.planPartly;
    ctx.events.push({
      e: 'notify',
      kind: 'letter',
      text: fillText(template, [
        ['who', seatName(state, seat)],
        ['plan', p.name],
        ['applied', String(applied)],
        ['skipped', String(skipped)],
      ]),
    });
  },
};

/** C4D: tweak an open plan. New items replace the old; whoever has not seen the change yet is told. */
export const edit: HandlerFor<'plan.edit'> = {
  type: 'plan.edit',
  validate(state, _seat, cmd) {
    if (!openPlan(state, cmd.id)) return 'NOT_FOUND';
    if (cmd.name !== undefined && !trimmed(cmd.name, MAX_PLAN_NAME_CHARS)) return 'INVALID';
    return validItems(cmd.items) ? null : 'INVALID';
  },
  apply(state, seat, cmd, ctx) {
    const p = openPlan(state, cmd.id)!;
    p.items = cmd.items.map((i) => ({ cmd: i.cmd }));
    if (cmd.name !== undefined) p.name = trimmed(cmd.name, MAX_PLAN_NAME_CHARS)!;
    p.seenBy = [seat];
    emitPlan(ctx, p);
  },
};

export const comment: HandlerFor<'plan.comment'> = {
  type: 'plan.comment',
  validate(state, _seat, cmd) {
    const p = openPlan(state, cmd.id);
    if (!p) return 'NOT_FOUND';
    if (!trimmed(cmd.text, MAX_COMMENT_CHARS)) return 'INVALID';
    return p.comments.length >= MAX_COMMENTS ? 'TOO_MANY' : null;
  },
  apply(state, seat, cmd, ctx) {
    const p = openPlan(state, cmd.id)!;
    p.comments.push({ by: seat, tick: state.tick, text: trimmed(cmd.text, MAX_COMMENT_CHARS)! });
    if (!p.seenBy.includes(seat)) p.seenBy.push(seat);
    emitPlan(ctx, p);
  },
};

export const seen: HandlerFor<'plan.seen'> = {
  type: 'plan.seen',
  validate(state, _seat, cmd) {
    return isInt(cmd.id) && findById(state.plans, cmd.id) ? null : 'NOT_FOUND';
  },
  apply(state, seat, cmd, ctx) {
    const p = findById(state.plans, cmd.id)!;
    if (p.seenBy.includes(seat)) return;
    p.seenBy.push(seat);
    p.seenBy.sort((a, b) => a - b);
    emitPlan(ctx, p);
  },
};
