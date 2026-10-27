// Samples the Mirror around the camera focus into an AmbienceScene (C5G): a coarse grid of tiles
// for water, woods and grass, and the working buildings nearby. About 300 tile reads and one pass
// over the buildings, every half second.
import { MAP_SIZE, MAX_HEIGHT, Terrain, Water, type BuildingView } from '@qoti/sim';
import { WORK_SOUNDS, emptyPresence, type AmbienceScene, type Presence } from './ambience';

/** Tiles around the focus that are heard, from the zoom. */
export function hearingRadius(zoom: number): number {
  return Math.max(12, Math.min(48, zoom * 0.5));
}

export interface SceneLayers {
  terrain: ArrayLike<number>;
  water: ArrayLike<number>;
  tree: ArrayLike<number>;
  height: ArrayLike<number>;
  occupant: ArrayLike<number>;
}

function addTo(p: Presence, dx: number, dz: number, w: number): void {
  p.amount += w;
  p.dx += dx * w;
  p.dz += dz * w;
}

function finish(p: Presence, total: number): void {
  if (p.amount > 0) {
    p.dx /= p.amount;
    p.dz /= p.amount;
  }
  if (total > 0) p.amount /= total;
}

export function sampleScene(
  layers: SceneLayers,
  buildings: Iterable<BuildingView>,
  fx: number,
  fz: number,
  zoom: number,
  size = MAP_SIZE,
): AmbienceScene {
  const radius = hearingRadius(zoom);
  const step = Math.max(1, Math.floor(radius / 8));
  const water = emptyPresence();
  const forest = emptyPresence();
  const grass = emptyPresence();
  let heightSum = 0;
  let samples = 0;
  for (let dz = -radius; dz <= radius; dz += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const x = Math.floor(fx + dx);
      const z = Math.floor(fz + dz);
      if (x < 0 || z < 0 || x >= size || z >= size) continue;
      const i = z * size + x;
      samples++;
      heightSum += layers.height[i]!;
      if (layers.water[i]! !== Water.none) addTo(water, dx, dz, 1);
      else if (layers.tree[i]! > 0 || layers.terrain[i] === Terrain.forestFloor) addTo(forest, dx, dz, 1);
      else if (
        (layers.terrain[i] === Terrain.grass || layers.terrain[i] === Terrain.meadow) &&
        layers.occupant[i] === 0
      )
        addTo(grass, dx, dz, 1);
    }
  }
  finish(water, samples);
  finish(forest, samples);
  finish(grass, samples);

  const hammer = emptyPresence();
  const anvil = emptyPresence();
  const saw = emptyPresence();
  const market = emptyPresence();
  const by = { hammer, anvil, saw, market };
  for (const b of buildings) {
    const dx = b.x - fx;
    const dz = b.z - fz;
    if (Math.abs(dx) > radius || Math.abs(dz) > radius) continue;
    const present = b.rt?.present ?? 0;
    if (b.stage === 'construction') {
      if (present > 0) addTo(hammer, dx, dz, 1);
      continue;
    }
    const sound = WORK_SOUNDS.get(b.def);
    if (!sound) continue;
    // Stalls and taverns murmur when open even with nobody counted inside; workshops only at work.
    if (sound === 'market') addTo(market, dx, dz, b.def === 'tavern' || b.def === 'trading-post' ? 2 : 1);
    else if (present > 0) addTo(by[sound], dx, dz, 1);
  }
  for (const p of [hammer, anvil, saw, market]) finish(p, 1);
  return {
    water,
    forest,
    grass,
    height: samples ? heightSum / samples / MAX_HEIGHT : 0,
    hammer,
    anvil,
    saw,
    market,
    radius,
  };
}
