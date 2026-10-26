import { content } from '@qoti/content';
import {
  applyTurn,
  canPlaceBuilding,
  canPlaceDecor,
  createTickCtx,
  createWorld,
  defaultSettings,
  MAP_SIZE,
  TILE_FP,
  worldIndex,
  type Command,
  type SimCtx,
  type WorldState,
} from '@qoti/sim';

export interface Synthetic {
  world: WorldState;
  ctx: SimCtx;
  buildings: number;
  decor: number;
}

const BATCH = 200;

/** Applies commands as turns of up to BATCH commands each, from seat 0. */
function play(world: WorldState, ctx: SimCtx, cmds: Command[]): void {
  for (let i = 0; i < cmds.length; i += BATCH) {
    const chunk = cmds.slice(i, i + BATCH).map((cmd, k) => ({ seat: 0 as const, seq: i + k + 1, cmd }));
    applyTurn(world, { t: world.lastTurn + 1, cmds: chunk }, ctx);
    ctx.events.length = 0;
    ctx.dirty.clear();
  }
}

/**
 * The I0 bench valley (docs/spec/22-quality.md): a generated valley with up to 1,000 buildings
 * and 6,000 decor, placed through real commands so every rule and index is exercised.
 */
export function syntheticValley(seed: string, targetBuildings = 1000, targetDecor = 6000): Synthetic {
  const world = createWorld(seed, defaultSettings());
  const ctx = createTickCtx(world);
  play(world, ctx, [{ t: 'sys.seatJoined', seat: 0 }]);
  const reader = worldIndex(world).reader;

  // Buildings on a coarse grid: a cottage where it fits, else a well.
  const cottage = content.buildingById.get('cottage')!;
  const well = content.buildingById.get('well')!;
  let placed = 0;
  for (let z = 7; z < MAP_SIZE - 8 && placed < targetBuildings; z += 3) {
    const batch: Command[] = [];
    for (let x = 7; x < MAP_SIZE - 8 && placed + batch.length < targetBuildings; x += 3) {
      if (canPlaceBuilding(reader, cottage, x, z, 0).ok)
        batch.push({ t: 'build.place', def: 'cottage', x, z, rot: 0 });
      else if (canPlaceBuilding(reader, well, x, z, 0).ok)
        batch.push({ t: 'build.place', def: 'well', x, z, rot: 0 });
    }
    play(world, ctx, batch);
    placed = world.buildings.length;
  }

  // Decor: lanterns and benches at four spots per open tile.
  const lantern = content.decorById.get('lantern')!;
  const offsets = [64, 192];
  for (let z = 0; z < MAP_SIZE && world.decor.length < targetDecor; z++) {
    const batch: Command[] = [];
    for (let x = 0; x < MAP_SIZE && world.decor.length + batch.length < targetDecor; x++) {
      for (const oz of offsets) {
        for (const ox of offsets) {
          if (world.decor.length + batch.length >= targetDecor) break;
          const fx = x * TILE_FP + ox;
          const fz = z * TILE_FP + oz;
          if (canPlaceDecor(reader, lantern, fx, fz, 0).ok) {
            // Neighbors in this batch are not in the index yet; the spacing keeps them apart.
            batch.push({
              t: 'decor.place',
              def: (x + z) % 3 === 0 ? 'bench' : 'lantern',
              fx,
              fz,
              rot: (x * 7) % 64,
            });
          }
        }
      }
    }
    play(world, ctx, batch);
  }
  return { world, ctx, buildings: world.buildings.length, decor: world.decor.length };
}
