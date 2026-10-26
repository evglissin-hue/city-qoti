import { content, type DecorDef } from '@qoti/content';
import { DECOR_CAP, TILE_FP } from '../constants';
import type { Decor, RejectReason, SeatId, TickCtx, WorldState } from '../contracts';
import { canPlaceDecor, canPlaceDecorRun } from '../rules/decor';
import { findById, removeById } from '../state/entities';
import { worldIndex } from '../state/worldIndex';
import { decorView } from '../view';
import { checkIds, type HandlerFor, takeId, worldChanged } from './util';

/** Rect of tiles around a decor center, for charm and walkability. */
function decorRect(fx: number, fz: number): [number, number, number, number] {
  const x = Math.floor(fx / TILE_FP);
  const z = Math.floor(fz / TILE_FP);
  return [x - 1, z - 1, x + 1, z + 1];
}

/** Standard valleys offer Pattern Book pieces only once unlocked. Sandbox valleys offer everything. */
function lockedReason(state: WorldState, def: DecorDef): 'LOCKED' | null {
  if (!def.locked || state.settings.mode !== 'standard') return null;
  return state.hearth.unlocked.includes(def.id) ? null : 'LOCKED';
}

function addDecor(
  state: WorldState,
  ctx: TickCtx,
  seat: SeatId,
  def: string,
  fx: number,
  fz: number,
  rot: number,
): void {
  const d: Decor = { id: takeId(state), def, fx, fz, rot, builtBy: seat };
  state.decor.push(d);
  worldIndex(state).decorGrid.add(d);
  ctx.events.push({ e: 'decor.added', d: decorView(d) });
  worldChanged(state, decorRect(fx, fz), !!content.decorById.get(def)?.blocksWalking);
}

export const place: HandlerFor<'decor.place'> = {
  type: 'decor.place',
  validate(state, _seat, cmd) {
    const def = typeof cmd.def === 'string' ? content.decorById.get(cmd.def) : undefined;
    if (!def) return 'INVALID';
    const locked: RejectReason | null = lockedReason(state, def);
    if (locked) return locked;
    if (state.decor.length >= DECOR_CAP) return 'TOO_MANY';
    const result = canPlaceDecor(worldIndex(state).reader, def, cmd.fx, cmd.fz, cmd.rot);
    return result.ok ? null : (result.reason ?? 'INVALID');
  },
  apply(state, seat, cmd, ctx) {
    addDecor(state, ctx, seat, cmd.def, cmd.fx, cmd.fz, cmd.rot);
  },
};

export const placeRun: HandlerFor<'decor.placeRun'> = {
  type: 'decor.placeRun',
  validate(state, _seat, cmd) {
    const def = typeof cmd.def === 'string' ? content.decorById.get(cmd.def) : undefined;
    if (!def || !Array.isArray(cmd.from) || !Array.isArray(cmd.to)) return 'INVALID';
    const locked = lockedReason(state, def);
    if (locked) return locked;
    const result = canPlaceDecorRun(worldIndex(state).reader, def, cmd.from, cmd.to);
    if (!result.ok) return result.reason ?? 'INVALID';
    return state.decor.length + result.segments.length > DECOR_CAP ? 'TOO_MANY' : null;
  },
  apply(state, seat, cmd, ctx) {
    const def = content.decorById.get(cmd.def)!;
    const { segments } = canPlaceDecorRun(worldIndex(state).reader, def, cmd.from, cmd.to);
    for (const s of segments) addDecor(state, ctx, seat, def.id, s.fx, s.fz, s.rot);
  },
};

/** Removing another seat's handmade decor is allowed here; the client asks for confirmation. */
export const remove: HandlerFor<'decor.remove'> = {
  type: 'decor.remove',
  validate(state, _seat, cmd) {
    const bad = checkIds(cmd.ids);
    if (bad) return bad;
    return cmd.ids.every((id) => findById(state.decor, id)) ? null : 'NOT_FOUND';
  },
  apply(state, _seat, cmd, ctx) {
    const grid = worldIndex(state).decorGrid;
    for (const id of cmd.ids) {
      const d = removeById(state.decor, id);
      if (!d) continue;
      grid.remove(d);
      ctx.events.push({ e: 'decor.removed', id });
      worldChanged(state, decorRect(d.fx, d.fz), !!content.decorById.get(d.def)?.blocksWalking);
    }
  },
};
