// A MapReader with one piece left out, so a move can ask "may it stand there?" without the piece
// blocking itself. The sim's move commands and the client's Move ghost both use it, so the ghost
// says what the sim will say.
import type { BuildingDef } from '@qoti/content';
import type { EntityId, MapReader, Rot4 } from '../contracts';
import { doorReached, townReach, townSources, type ReachBuilding } from './reach';
import { gateTiles, isWallDef } from './wall';

export interface Leave {
  /** A building whose tiles read as free. */
  building?: EntityId;
  /** A decor piece that is not counted as near anything. */
  decor?: EntityId;
}

export function readerWithout(reader: MapReader, leave: Leave): MapReader {
  const { building, decor } = leave;
  return {
    // Delegates by hand: a Mirror keeps its readers on the prototype, which a spread would drop.
    size: reader.size,
    height: (x, z) => reader.height(x, z),
    terrain: (x, z) => reader.terrain(x, z),
    water: (x, z) => reader.water(x, z),
    road: (x, z) => reader.road(x, z),
    tree: (x, z) => reader.tree(x, z),
    deposit: (x, z) => reader.deposit(x, z),
    fertility: (x, z) => reader.fertility(x, z),
    parcelUnlocked: (x, z) => reader.parcelUnlocked(x, z),
    occupant: (x, z) => {
      const o = reader.occupant(x, z);
      return building !== undefined && o === building ? 0 : o;
    },
    decorNear: (fx, fz, radius) => {
      const near = reader.decorNear(fx, fz, radius);
      return decor === undefined ? near : near.filter((d) => d.id !== decor);
    },
  };
}

/**
 * Pieces that stay where they were put: wall pieces and gates (painted in runs, and the enclosure
 * rule reads the whole run), and bridges and other story landmarks (the story chose the spot).
 */
export function staysPut(def: BuildingDef): boolean {
  return (
    isWallDef(def.id) ||
    !!def.defense?.blocks ||
    def.defense?.passable === 'gate' ||
    def.category === 'landmark' ||
    !!def.tags?.includes('bridge')
  );
}

/**
 * Could the town still walk to the door if `moving` stood at (x, z, rot)? Its own old tiles are
 * left out, and it is not one of the places the town walks out from. Standard valleys only.
 */
export function movedReaches(
  reader: MapReader,
  buildings: readonly (ReachBuilding & { id: EntityId })[],
  moving: { id: EntityId; def: string },
  x: number,
  z: number,
  rot: Rot4,
): boolean {
  const others = buildings.filter((o) => o.id !== moving.id);
  if (!others.some((o) => o.stage === 'built')) return true;
  const open = readerWithout(reader, { building: moving.id });
  const reach = townReach(open, townSources(others), gateTiles(others));
  if (!reach.some((v) => v === 1)) return true;
  return doorReached(reach, open, { def: moving.def, x, z, rot });
}
