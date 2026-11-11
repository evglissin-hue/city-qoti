// "Lay it out" (docs/spec/12-hearth.md, Decorating that composes itself): a discovered pattern's
// layout, turned a quarter at a time around an anchor tile, as the ordinary commands that would
// build it. Pure functions; the layout tool wraps them in one plan.
import { content, type PatternDef, type PatternPiece } from '@qoti/content';
import {
  canPaintRoad,
  canPlaceBuilding,
  canPlaceDecor,
  canPlaceDecorRun,
  canPlantTree,
  DECOR_ROTATIONS,
  footprintSize,
  TILE_FP,
  type Command,
  type MapReader,
  type Rot4,
} from '@qoti/sim';
import { isFacingSeat, seatRotation } from './seat';

export type Turn = 0 | 1 | 2 | 3;

type Point = [number, number];

/** A tile offset turned clockwise (seen from above, x east, z south) by `turn` quarters. */
export function turnOffset(dx: number, dz: number, turn: Turn): Point {
  switch (turn) {
    case 0:
      return [dx, dz];
    case 1:
      return [-dz, dx];
    case 2:
      return [-dx, -dz];
    case 3:
      return [dz, -dx];
  }
}

const center = (t: number): number => t * TILE_FP + TILE_FP / 2;

/** Every tile on the line between two tiles, ends included. */
function lineTiles(a: Point, b: Point): Point[] {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  if (n === 0) return [[a[0], a[1]]];
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t: Point = [Math.round(a[0] + ((b[0] - a[0]) * i) / n), Math.round(a[1] + ((b[1] - a[1]) * i) / n)];
    if (!out.some((o) => o[0] === t[0] && o[1] === t[1])) out.push(t);
  }
  return out;
}

/** One layout piece, placed: its command and the tiles it covers (for the ghost). */
export interface PlacedPiece {
  cmd: Command;
  tiles: Point[];
  /** True when a reader was given and the piece would be refused on its map. */
  blocked?: boolean;
}

function turned(dx: number, dz: number, anchor: Point, turn: Turn): Point {
  const [ox, oz] = turnOffset(dx, dz, turn);
  return [anchor[0] + ox, anchor[1] + oz];
}

function placeOne(
  p: PatternPiece,
  anchor: Point,
  turn: Turn,
  reader: MapReader | undefined,
  skip: ((id: string) => boolean) | undefined,
): PlacedPiece | null {
  if ('decor' in p) {
    if (skip?.(p.decor)) return null;
    const def = content.decorById.get(p.decor);
    if (!def) return null;
    const [x, z] = turned(p.dx, p.dz, anchor, turn);
    const fx = center(x);
    const fz = center(z);
    let rot: number;
    if (p.rot !== undefined) rot = (p.rot + turn * (DECOR_ROTATIONS / 4)) % DECOR_ROTATIONS;
    else if (reader && isFacingSeat(def)) rot = seatRotation(reader, fx, fz) ?? 0;
    else rot = (turn * (DECOR_ROTATIONS / 4)) % DECOR_ROTATIONS;
    const blocked = reader ? !canPlaceDecor(reader, def, fx, fz, rot).ok : false;
    return {
      cmd: { t: 'decor.place', def: p.decor, fx, fz, rot },
      tiles: [[x, z]],
      ...(blocked && { blocked }),
    };
  }
  if ('tree' in p) {
    const [x, z] = turned(p.dx, p.dz, anchor, turn);
    const blocked = reader ? !canPlantTree(reader, x, z).ok : false;
    return { cmd: { t: 'tree.plant', species: p.tree, x, z }, tiles: [[x, z]], ...(blocked && { blocked }) };
  }
  if ('building' in p) {
    const def = content.buildingById.get(p.building);
    if (!def) return null;
    const rot = (((p.rot ?? 0) + turn) % 4) as Rot4;
    // The footprint's min corner moves with the turn: turn both corner tiles and keep the minimum.
    const [w, d] = footprintSize(def, (p.rot ?? 0) as Rot4);
    const a = turned(p.dx, p.dz, anchor, turn);
    const b = turned(p.dx + w - 1, p.dz + d - 1, anchor, turn);
    const x = Math.min(a[0], b[0]);
    const z = Math.min(a[1], b[1]);
    const [tw, td] = footprintSize(def, rot);
    const tiles: Point[] = [];
    for (let j = 0; j < td; j++) for (let i = 0; i < tw; i++) tiles.push([x + i, z + j]);
    const blocked = reader ? !canPlaceBuilding(reader, def, x, z, rot).ok : false;
    return { cmd: { t: 'build.place', def: p.building, x, z, rot }, tiles, ...(blocked && { blocked }) };
  }
  if ('run' in p) {
    if (skip?.(p.run)) return null;
    const def = content.decorById.get(p.run);
    if (!def) return null;
    const a = turned(p.dx, p.dz, anchor, turn);
    const b = turned(p.tx, p.tz, anchor, turn);
    const from: Point = [center(a[0]), center(a[1])];
    const to: Point = [center(b[0]), center(b[1])];
    const blocked = reader ? !canPlaceDecorRun(reader, def, from, to).ok : false;
    return {
      cmd: { t: 'decor.placeRun', def: p.run, from, to },
      tiles: lineTiles(a, b),
      ...(blocked && { blocked }),
    };
  }
  const a = turned(p.dx, p.dz, anchor, turn);
  const b = turned(p.tx, p.tz, anchor, turn);
  const tiles = lineTiles(a, b);
  const blocked = reader ? !canPaintRoad(reader, p.road, tiles).ok : false;
  return { cmd: { t: 'road.paint', kind: p.road, tiles }, tiles, ...(blocked && { blocked }) };
}

/**
 * The pieces of a pattern's layout, turned `turn` quarters around the anchor tile. With a reader,
 * a bench without its own rotation faces what is worth looking at where it lands, and each piece
 * says whether it would be refused on that map. `skip` leaves out decor locked for this valley.
 */
export function layoutPieces(
  def: PatternDef,
  anchor: [number, number],
  turn: Turn,
  reader?: MapReader,
  skip?: (id: string) => boolean,
): PlacedPiece[] {
  const out: PlacedPiece[] = [];
  for (const piece of def.layout ?? []) {
    const placed = placeOne(piece, anchor, turn, reader, skip);
    if (placed) out.push(placed);
  }
  return out;
}

/** The ordinary commands that build a pattern's layout. */
export function layoutCommands(
  def: PatternDef,
  anchor: [number, number],
  turn: Turn,
  reader?: MapReader,
  skip?: (id: string) => boolean,
): Command[] {
  return layoutPieces(def, anchor, turn, reader, skip).map((p) => p.cmd);
}
