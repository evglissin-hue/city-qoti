import { content, type DecorDef } from '@qoti/content';
import { DECOR_CAP, TILE_FP } from '../constants';
import type { Decor, RejectReason, SeatId, TickCtx, WorldState } from '../contracts';
import { canPlaceDecor, canPlaceDecorRun } from '../rules/decor';
import { findById, removeById } from '../state/entities';
import { worldIndex } from '../state/worldIndex';
import { chargeDecor, decorBlocked, refundDecor } from '../systems/economy/decorCost';
import { currentPlan } from '../systems/festivals/api';
import { markCharmSoon } from '../systems/hearth/charm/dirty';
import { decorView } from '../view';
import { checkIds, type HandlerFor, takeId, worldChanged } from './util';

/** Rect of tiles around a decor center, for charm and walkability. */
function decorRect(fx: number, fz: number): [number, number, number, number] {
  const x = Math.floor(fx / TILE_FP);
  const z = Math.floor(fz / TILE_FP);
  return [x - 1, z - 1, x + 1, z + 1];
}

/**
 * Standard valleys offer Pattern Book pieces only once unlocked. Sandbox valleys offer everything.
 * I3 (C5B): festival pieces may also be placed while this season's festival is planned (they come
 * down the morning after it unless kept).
 */
function lockedReason(state: WorldState, def: DecorDef): 'LOCKED' | null {
  if (!def.locked || state.settings.mode !== 'standard') return null;
  if (state.hearth.unlocked.includes(def.id)) return null;
  return def.festival && currentPlan(state) ? null : 'LOCKED';
}

/** A festival piece placed for this season's festival (not one unlocked as ordinary decor). */
function temporaryPiece(state: WorldState, def: DecorDef | undefined): boolean {
  return (
    !!def?.festival &&
    state.settings.mode === 'standard' &&
    !state.hearth.unlocked.includes(def.id) &&
    !!currentPlan(state)
  );
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
  if (temporaryPiece(state, content.decorById.get(def))) {
    d.festival = { kept: false };
    state.festival.pieces.push(d.id);
  }
  state.decor.push(d);
  worldIndex(state).decorGrid.add(d);
  ctx.events.push({ e: 'decor.added', d: decorView(d) });
  worldChanged(state, decorRect(fx, fz), !!content.decorById.get(def)?.blocksWalking);
  markCharmSoon(state);
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
    if (!result.ok) return result.reason ?? 'INVALID';
    return temporaryPiece(state, def) ? null : decorBlocked(state, def);
  },
  apply(state, seat, cmd, ctx) {
    const def = content.decorById.get(cmd.def)!;
    if (!temporaryPiece(state, def)) chargeDecor(state, ctx, def);
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
    if (state.decor.length + result.segments.length > DECOR_CAP) return 'TOO_MANY';
    return temporaryPiece(state, def) ? null : decorBlocked(state, def, result.segments.length);
  },
  apply(state, seat, cmd, ctx) {
    const def = content.decorById.get(cmd.def)!;
    const { segments } = canPlaceDecorRun(worldIndex(state).reader, def, cmd.from, cmd.to);
    if (!temporaryPiece(state, def)) chargeDecor(state, ctx, def, segments.length);
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
      // A piece that cost something comes back in full (festival pieces never cost anything).
      const def = content.decorById.get(d.def);
      if (def && !d.festival) refundDecor(state, ctx, def, d.fx, d.fz);
      if (d.festival) state.festival.pieces = state.festival.pieces.filter((p) => p !== id);
      grid.remove(d);
      ctx.events.push({ e: 'decor.removed', id });
      worldChanged(state, decorRect(d.fx, d.fz), !!content.decorById.get(d.def)?.blocksWalking);
      markCharmSoon(state);
    }
  },
};
