import { MAP_SIZE, MAX_REMOVE_IDS } from '../constants';
import type {
  Command,
  CommandHandler,
  LayerName,
  Rect,
  RejectReason,
  SeatId,
  TickCtx,
  WorldState,
} from '../contracts';
import { inBounds, tilesRect } from '../map/layers';
import { isInt, isTile } from '../rules/geometry';

/** A handler for one command type, typed by its `t`. */
export type HandlerFor<T extends Command['t']> = CommandHandler<Extract<Command, { t: T }>>;

/** Any registered handler. */
export type AnyHandler = { [T in Command['t']]: HandlerFor<T> }[Command['t']];

export function isSeat(v: unknown): v is SeatId {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

/** Validates a tile list for removal commands: 1 to 256 in-bounds tiles. */
export function checkTiles(tiles: unknown, max = 256): RejectReason | null {
  if (!Array.isArray(tiles) || tiles.length === 0) return 'INVALID';
  if (tiles.length > max) return 'TOO_MANY';
  for (const t of tiles) {
    if (!isTile(t)) return 'INVALID';
    if (!inBounds(t[0], t[1], MAP_SIZE)) return 'OUT_OF_BOUNDS';
  }
  return null;
}

/** Validates an id list for removal commands: 1 to 256 integer ids. */
export function checkIds(ids: unknown): RejectReason | null {
  if (!Array.isArray(ids) || ids.length === 0) return 'INVALID';
  if (ids.length > MAX_REMOVE_IDS) return 'TOO_MANY';
  for (const id of ids) if (!isInt(id) || id <= 0) return 'INVALID';
  return null;
}

/** Records changed layers: a tiles.changed event for the UI and dirty chunks for patches. */
export function tilesChanged(ctx: TickCtx, rect: Rect | null, layers: LayerName[]): void {
  if (!rect) return;
  ctx.events.push({ e: 'tiles.changed', rect, layers });
  for (const layer of layers) ctx.dirty.mark(layer, rect);
}

export function tilesChangedFor(ctx: TickCtx, tiles: [number, number][], layers: LayerName[]): void {
  tilesChanged(ctx, tilesRect(tiles), layers);
}

export function takeId(state: WorldState): number {
  return state.nextId++;
}

export function trimmed(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length === 0 || s.length > max ? null : s;
}
