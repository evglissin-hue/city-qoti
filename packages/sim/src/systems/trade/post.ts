// The Trading Post at the valley gate (docs/spec/13-ledger.md, Trade). C4C adds the building (tag
// 'trading-post'); C4A trades through it. Caravans load from the post's own store first and then
// from the storehouses (no hauling is needed to send a surplus away, as with the I1 peddler), and
// what they bring back goes into the post's store, or the nearest storehouse when the post has no
// room or keeps none.
import type { Building, WorldState } from '../../contracts';
import { defOf, isStorehouse, storageSpace, stowNearest } from '../logistics/stores';
import { doorTile } from '../movement/api';

/** The built Trading Post, or null. The first by id when there are several. */
export function tradingPost(state: WorldState): Building | null {
  for (const b of state.buildings) {
    if (b.stage === 'built' && b.rt && defOf(b)?.tags?.includes('trading-post')) return b;
  }
  return null;
}

/** Buildings caravans load from, in order: the post, then storehouses by id. */
function sources(state: WorldState, post: Building): Building[] {
  const out = [post];
  for (const b of state.buildings) {
    if (b !== post && b.stage === 'built' && b.rt && isStorehouse(defOf(b))) out.push(b);
  }
  return out;
}

/** Units of a good caravans can take now: the post and storehouses, less porters' promises. */
export function tradableStock(state: WorldState, post: Building, good: number): number {
  let n = 0;
  for (const b of sources(state, post)) n += Math.max(0, b.rt!.store[good]! - b.rt!.reservedOut[good]!);
  return n;
}

/** Takes up to `qty` units of a good for a caravan. Returns the units taken. */
export function loadCaravan(state: WorldState, post: Building, good: number, qty: number): number {
  let left = qty;
  for (const b of sources(state, post)) {
    if (left <= 0) break;
    const rt = b.rt!;
    const n = Math.min(left, Math.max(0, rt.store[good]! - rt.reservedOut[good]!));
    rt.store[good]! -= n;
    left -= n;
  }
  return qty - left;
}

/** Unloads a returning caravan's goods: into the post when it keeps a store, else storehouses. */
export function unloadCaravan(state: WorldState, post: Building, good: number, qty: number): void {
  const def = defOf(post);
  let left = qty;
  if ((def?.storage ?? 0) > 0) {
    const n = Math.min(left, storageSpace(def, post.rt!));
    post.rt!.store[good]! += n;
    left -= n;
  }
  if (left > 0) left -= stowNearest(state, doorTile(post, def), good, left, post.id);
  // Nowhere to put it: the carters stack it by the post's door rather than take it home again.
  if (left > 0) post.rt!.store[good]! += left;
}
