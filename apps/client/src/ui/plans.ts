// Plans (I2, C4F): which commands a sketch may hold, plans in words ("a bakery, a bench and 12
// tiles of lane"), and their blueprint shapes on the ground. docs/spec/16-coop.md, Plans layer.
import { content } from '@qoti/content';
import { footprintSize, TILE_FP, type Command, type CommandType, type PlanItem } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import type { Sketch } from './state';

/** Commands a plan may hold (the sim's list): building the valley, not running it. */
export const PLANNABLE: ReadonlySet<CommandType> = new Set<CommandType>([
  'build.place',
  'build.remove',
  'decor.place',
  'decor.placeRun',
  'decor.remove',
  'field.paint',
  'field.remove',
  'note.pin',
  'road.paint',
  'road.remove',
  'terrain.lower',
  'terrain.raise',
  'tree.plant',
  'tree.remove',
  'zone.clear',
  'zone.paint',
]);

/**
 * While a sketch is open, a building command joins it instead of going to the sim. Returns the
 * sketch with the command added, or null when the command should be sent as usual.
 */
export function sketchWith(sketch: Sketch | null, cmd: Command): Sketch | null {
  if (!sketch || !PLANNABLE.has(cmd.t)) return null;
  return { ...sketch, items: [...sketch.items, { cmd }] };
}

const a = (name: string) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

function counted(n: number, one: string, many: string): string {
  return n === 1 ? a(one) : `${n} ${many}`;
}

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** A plan's contents in a line: "a bakery, two benches and 12 tiles of lane". */
export function planSummary(items: readonly PlanItem[]): string {
  const builds = new Map<string, number>();
  const decor = new Map<string, number>();
  let roadTiles = 0;
  let roadKind = 'road';
  let zoneTiles = 0;
  let trees = 0;
  let removals = 0;
  let fields = 0;
  let notes = 0;
  let earth = 0;
  for (const { cmd } of items) {
    switch (cmd.t) {
      case 'build.place':
        builds.set(cmd.def, (builds.get(cmd.def) ?? 0) + 1);
        break;
      case 'decor.place':
      case 'decor.placeRun':
        decor.set(cmd.def, (decor.get(cmd.def) ?? 0) + 1);
        break;
      case 'road.paint':
        roadTiles += cmd.tiles.length;
        roadKind = cmd.kind;
        break;
      case 'zone.paint':
        zoneTiles += cmd.tiles.length;
        break;
      case 'tree.plant':
        trees++;
        break;
      case 'field.paint':
        fields += cmd.tiles.length;
        break;
      case 'note.pin':
        notes++;
        break;
      case 'terrain.raise':
      case 'terrain.lower':
        earth += cmd.tiles.length;
        break;
      default:
        removals++;
    }
  }
  const parts: string[] = [];
  for (const [def, n] of builds) {
    const name = (content.buildingById.get(def)?.name ?? def).toLowerCase();
    parts.push(n === 1 ? a(name) : `${n} ${name}s`);
  }
  for (const [def, n] of decor) {
    const name = (content.decorById.get(def)?.name ?? def).toLowerCase();
    parts.push(n === 1 ? a(name) : `${n} ${name}s`);
  }
  if (roadTiles) parts.push(`${roadTiles} ${roadTiles === 1 ? 'tile' : 'tiles'} of ${roadKind}`);
  if (zoneTiles) parts.push(`${zoneTiles} zoned ${zoneTiles === 1 ? 'tile' : 'tiles'}`);
  if (fields) parts.push(`${fields} ${fields === 1 ? 'field' : 'fields'}`);
  if (trees) parts.push(counted(trees, 'tree', 'trees'));
  if (earth) parts.push(`${earth} ${earth === 1 ? 'tile' : 'tiles'} of earthworks`);
  if (notes) parts.push(counted(notes, 'note', 'notes'));
  if (removals) parts.push(`${removals} ${removals === 1 ? 'thing' : 'things'} cleared away`);
  return list(parts) || 'nothing yet';
}

/** One shape of a blueprint, in tile units on the ground. */
export type BlueprintShape =
  | { kind: 'rect'; x: number; z: number; w: number; d: number; removal?: boolean; label?: string }
  | { kind: 'tiles'; tiles: [number, number][]; removal?: boolean; tone?: string }
  | { kind: 'line'; points: [number, number][]; removal?: boolean }
  | { kind: 'dot'; x: number; z: number; r: number; removal?: boolean };

const fp = (v: number) => v / TILE_FP;

/** Where a command would land, as blueprint shapes. Removals look up what they would clear. */
export function shapesOf(cmd: Command, m: Mirror): BlueprintShape[] {
  switch (cmd.t) {
    case 'build.place': {
      const def = content.buildingById.get(cmd.def);
      if (!def) return [];
      const [w, d] = footprintSize(def, cmd.rot);
      return [{ kind: 'rect', x: cmd.x, z: cmd.z, w, d, label: def.name }];
    }
    case 'build.remove':
      return cmd.ids.flatMap((id) => {
        const b = m.buildings.get(id);
        const def = b ? content.buildingById.get(b.def) : undefined;
        if (!b || !def) return [];
        const [w, d] = footprintSize(def, b.rot);
        return [{ kind: 'rect' as const, x: b.x, z: b.z, w, d, removal: true }];
      });
    case 'decor.place':
      return [{ kind: 'dot', x: fp(cmd.fx), z: fp(cmd.fz), r: 0.32 }];
    case 'decor.placeRun':
      return [
        {
          kind: 'line',
          points: [
            [fp(cmd.from[0]), fp(cmd.from[1])],
            [fp(cmd.to[0]), fp(cmd.to[1])],
          ],
        },
      ];
    case 'decor.remove':
      return cmd.ids.flatMap((id) => {
        const d = m.decor.get(id);
        return d ? [{ kind: 'dot' as const, x: fp(d.fx), z: fp(d.fz), r: 0.32, removal: true }] : [];
      });
    case 'road.paint':
      return [{ kind: 'line', points: cmd.tiles.map(([x, z]) => [x + 0.5, z + 0.5]) }];
    case 'road.remove':
    case 'tree.remove':
    case 'field.remove':
    case 'zone.clear':
      return [{ kind: 'tiles', tiles: cmd.tiles, removal: true }];
    case 'zone.paint':
      return [{ kind: 'tiles', tiles: cmd.tiles, tone: content.zoneById.get(cmd.zone)?.token ?? '' }];
    case 'field.paint':
    case 'terrain.raise':
    case 'terrain.lower':
      return [{ kind: 'tiles', tiles: cmd.tiles }];
    case 'tree.plant':
      return [{ kind: 'dot', x: cmd.x + 0.5, z: cmd.z + 0.5, r: 0.38 }];
    case 'note.pin':
      return [{ kind: 'dot', x: cmd.x + 0.5, z: cmd.z + 0.5, r: 0.22 }];
    default:
      return [];
  }
}

/** The middle of a plan, for the camera. */
export function planCenter(items: readonly PlanItem[], m: Mirror): [number, number] | null {
  let sx = 0;
  let sz = 0;
  let n = 0;
  const add = (x: number, z: number) => {
    sx += x;
    sz += z;
    n++;
  };
  for (const { cmd } of items) {
    for (const s of shapesOf(cmd, m)) {
      if (s.kind === 'rect') add(s.x + s.w / 2, s.z + s.d / 2);
      else if (s.kind === 'dot') add(s.x, s.z);
      else if (s.kind === 'line') for (const [x, z] of s.points) add(x, z);
      else for (const [x, z] of s.tiles) add(x + 0.5, z + 0.5);
    }
  }
  return n ? [sx / n, sz / n] : null;
}

/** True when a tile falls inside any of a plan's shapes (the plan tool picks plans this way). */
export function planCovers(items: readonly PlanItem[], m: Mirror, x: number, z: number): boolean {
  for (const { cmd } of items) {
    for (const s of shapesOf(cmd, m)) {
      if (s.kind === 'rect' && x >= s.x && x < s.x + s.w && z >= s.z && z < s.z + s.d) return true;
      if (s.kind === 'dot' && Math.floor(s.x) === x && Math.floor(s.z) === z) return true;
      if (s.kind === 'line' && s.points.some(([px, pz]) => Math.floor(px) === x && Math.floor(pz) === z))
        return true;
      if (s.kind === 'tiles' && s.tiles.some(([tx, tz]) => tx === x && tz === z)) return true;
    }
  }
  return false;
}
