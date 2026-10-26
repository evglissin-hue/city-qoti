// The charm system (docs/spec/12-hearth.md, Charm). Recomputes the dirty chunks once per in-game
// hour (offset 50), on the tick after a Hearth command (hearth.charmSoon), and around every
// lantern when the lights go on at 18:00 and off at 07:00. The first tick of a valley computes the
// whole map. Recomputed layers are marked on ctx.dirty, so clients receive LayerPatches.
import { content } from '@qoti/content';
import { CHUNKS_PER_SIDE, HOURS_PER_DAY, START_HOUR, TICKS_PER_HOUR, TILE_FP } from '../../../constants';
import type { System, TickCtx, WorldState } from '../../../contracts';
import { isStandard } from '../../../state/hamlet';
import { recomputeChunk } from './compute';
import { markChunks } from './dirty';
import { DECOR_SOURCES, lanternsLit, LIGHTS_OFF_HOUR, LIGHTS_ON_HOUR } from './sources';

export const CHARM_OFFSET = 50;
const DECOR_INDEX = new Map(content.decor.map((d, i) => [d.id, i]));
/** Decor defs whose value changes when the lights go on. */
const NIGHT_DECOR: readonly boolean[] = DECOR_SOURCES.map((list) => list.some((s) => s.night !== s.value));

export const charm: System = {
  id: 'charm',
  order: 70,
  every: 1,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const t = state.tick - 1;
    const h = state.hearth;
    let due = t % TICKS_PER_HOUR === CHARM_OFFSET || h.charmSoon === true;
    if (t === 0) {
      markChunks(state, [0, 0, CHUNKS_PER_SIDE * 16 - 1, CHUNKS_PER_SIDE * 16 - 1]);
      due = true;
    }
    if (t % TICKS_PER_HOUR === 0) {
      const hour = (Math.floor(t / TICKS_PER_HOUR) + START_HOUR) % HOURS_PER_DAY;
      if (hour === LIGHTS_ON_HOUR || hour === LIGHTS_OFF_HOUR) {
        markLanterns(state);
        due = true;
      }
    }
    if (due && h.dirtyChunks.length > 0) recomputeDirty(state, ctx);
    if (h.charmSoon) delete h.charmSoon;
  },
};

/** Recomputes every dirty chunk now and clears the list. */
export function recomputeDirty(state: WorldState, ctx: TickCtx | null): number {
  const list = state.hearth.dirtyChunks;
  // Normally sorted and unique (markCharmDirty); tolerate lists written by hand.
  list.sort((a, b) => a - b);
  const night = lanternsLit(state.tick);
  const cache = new Map<number, boolean>();
  let n = 0;
  for (let k = 0; k < list.length; k++) {
    const c = list[k]!;
    if ((k > 0 && list[k - 1] === c) || c < 0 || c >= CHUNKS_PER_SIDE * CHUNKS_PER_SIDE) continue;
    recomputeChunk(state, c, night, ctx, cache);
    n++;
  }
  list.length = 0;
  return n;
}

/** Marks the chunks around every light source whose value differs by night. */
function markLanterns(state: WorldState): void {
  for (const d of state.decor) {
    const i = DECOR_INDEX.get(d.def);
    if (i === undefined || !NIGHT_DECOR[i]) continue;
    const x = Math.floor(d.fx / TILE_FP);
    const z = Math.floor(d.fz / TILE_FP);
    let r = 0;
    for (const s of DECOR_SOURCES[i]!) r = Math.max(r, s.radius + 1);
    markChunks(state, [x - r, z - r, x + r, z + r]);
  }
}
