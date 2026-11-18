// Places the seasons read (C5A): the middle of town for Chronicle snapshots, and the skating spots on
// the bank beside the ice. R3.0: the spots are fixed when the river freezes and saved with it
// (`weather.river.spots`), so a seat joining mid-freeze reads the spots its partner reads, whatever
// was built or planted on the bank since. Pure: reads state.
import { MAP_SIZE } from '../../constants';
import type { WorldState } from '../../contracts';
import { Water } from '../../map/layers';

/** The Town Hall's tile, or the middle of the map before there is one. */
export function townFocus(state: WorldState): [number, number] {
  for (const b of state.buildings) if (b.def === 'town-hall') return [b.x + 2, b.z + 2];
  return [MAP_SIZE >> 1, MAP_SIZE >> 1];
}

/** Skating spots kept along the bank (one in every SPOT_STRIDE bank tiles, at most SPOTS_MAX). */
const SPOT_STRIDE = 24;
const SPOTS_MAX = 16;
const NONE: readonly number[] = [];

function isRiver(w: number): boolean {
  return w === Water.river || w === Water.riverDeep;
}

/**
 * Dry, open bank tiles beside river water (the edge of the ice), spaced along the river, row-major
 * order, read from the map as it is now. The freeze calls it once and saves the answer; everything
 * else reads `skatingSpots`.
 */
export function findSkatingSpots(state: WorldState): number[] {
  const S = MAP_SIZE;
  const m = state.map;
  const spots: number[] = [];
  let seen = 0;
  for (let z = 1; z < S - 1 && spots.length < SPOTS_MAX; z++) {
    for (let x = 1; x < S - 1 && spots.length < SPOTS_MAX; x++) {
      const i = z * S + x;
      if (m.water[i] || m.occupant[i] || m.tree[i]) continue;
      if (
        !isRiver(m.water[i - 1]!) &&
        !isRiver(m.water[i + 1]!) &&
        !isRiver(m.water[i - S]!) &&
        !isRiver(m.water[i + S]!)
      )
        continue;
      if (seen++ % SPOT_STRIDE === 0) spots.push(i);
    }
  }
  return spots;
}

/**
 * The skating spots while the river is frozen: the ones fixed at the freeze (saved). None while the
 * river is open. Skating is an outing on the ice by the bank, not a route across the river.
 */
export function skatingSpots(state: WorldState): readonly number[] {
  const river = state.weather.river;
  if (!river.frozen) return NONE;
  // A frozen river written by hand (tests) has no saved spots: read them from the map, uncached, so
  // two states equal now read the same spots (never a cache that outlives a change, the old hazard).
  return river.spots ?? findSkatingSpots(state);
}

/** The skating spot nearest a tile (straight line), or -1 when the river has no open bank. */
export function nearestSpot(state: WorldState, tile: number): number {
  const spots = skatingSpots(state);
  const x = tile % MAP_SIZE;
  const z = (tile - x) / MAP_SIZE;
  let best = -1;
  let bestD = Infinity;
  for (const s of spots) {
    const dx = (s % MAP_SIZE) - x;
    const dz = Math.floor(s / MAP_SIZE) - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}
