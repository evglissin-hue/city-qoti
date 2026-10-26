// Puts a building into state: footprint occupancy, trees cleared, runtime in standard valleys.
// Shared by build.place, the standard starting town and test fixtures.
import type { BuildingDef } from '@qoti/content';
import { MAP_SIZE } from '../constants';
import type { Building, Rot4, SeatId, TickCtx, WorldState } from '../contracts';
import { tilesRect } from '../map/layers';
import { footprintTiles } from '../rules/footprint';
import { markCharmDirty } from '../systems/hearth/charm/dirty';
import { buildingView } from '../view';
import { createRuntime, isStandard } from './hamlet';

export interface InsertOptions {
  /** Standard valleys: start as a construction site (default true for player placements). */
  site?: boolean;
  foundation?: boolean;
  handmade?: boolean;
}

export function insertBuilding(
  state: WorldState,
  ctx: TickCtx | null,
  def: BuildingDef,
  x: number,
  z: number,
  rot: Rot4,
  seat: SeatId,
  opts: InsertOptions = {},
): Building {
  const site = isStandard(state) && (opts.site ?? true);
  const b: Building = {
    id: state.nextId++,
    def: def.id,
    x,
    z,
    rot,
    builtBy: seat,
    handmade: opts.handmade ?? false,
    stage: site ? 'construction' : 'built',
    foundation: opts.foundation ?? false,
  };
  if (isStandard(state)) b.rt = createRuntime(def, site);
  const tiles = footprintTiles(def, x, z, rot);
  for (const [tx, tz] of tiles) {
    state.map.occupant[tz * MAP_SIZE + tx] = b.id;
    state.map.tree[tz * MAP_SIZE + tx] = 0;
  }
  state.buildings.push(b);
  state.networkVersion += 1;
  const rect = tilesRect(tiles);
  markCharmDirty(state, rect && [rect[0] - 1, rect[1] - 1, rect[2] + 1, rect[3] + 1]);
  if (ctx) {
    ctx.events.push({ e: 'building.added', b: buildingView(b) });
    ctx.events.push({ e: 'tiles.changed', rect: rect!, layers: ['occupant', 'tree'] });
    ctx.dirty.mark('occupant', rect!);
    ctx.dirty.mark('tree', rect!);
  }
  return b;
}
