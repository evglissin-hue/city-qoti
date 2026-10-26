// Sitting Wall: 4+ low-wall segments in a continuous line (gaps under 0.2 tile) beside a path,
// with flowers or hedge on the side away from the path. Segments chain when they point the same
// way and their centers sit one segment length apart along that line. The path side is the side
// where the tile three quarters of a tile out is road for at least half the segments; the green
// must be on the other side, within a tile and a half of a segment. Anchored on the smallest
// tile under the wall.
import { MAP_SIZE, TILE_FP } from '../../../../constants';
import type { Decor, EntityId } from '../../../../contracts';
import { DIR_COS, DIR_SIN } from '../../../../map/directions';
import { type Detector, hasTag, param, type SiteCandidate, tagged, taggedIn, tileOf } from '../shared';

const S = MAP_SIZE;
const UNIT = 16384;

function dirOf(d: Decor): [number, number] {
  return [DIR_COS[d.rot & 63]! / UNIT, DIR_SIN[d.rot & 63]! / UNIT];
}

export const sittingWall: Detector = (state, def) => {
  const need = param(def, 'segments', 4);
  const gap = param(def, 'gap', 51);
  const walls = tagged(state, 'wall');
  if (walls.length < need) return [];

  // Union-find over segments that continue each other's line.
  const parent = walls.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  const index = new Map(walls.map((w, i) => [w.id, i]));
  const reach = TILE_FP + gap;
  for (let i = 0; i < walls.length; i++) {
    const a = walls[i]!;
    const [ax, az] = dirOf(a);
    const t = tileOf(a);
    const x = t % S;
    const z = (t - x) / S;
    for (const b of taggedIn(state, [x - 2, z - 2, x + 2, z + 2], 'wall')) {
      const j = index.get(b.id);
      if (j === undefined || j <= i) continue;
      const [bx, bz] = dirOf(b);
      if (Math.abs(ax * bx + az * bz) < 0.92) continue;
      const dx = b.fx - a.fx;
      const dz = b.fz - a.fz;
      const along = Math.abs(dx * ax + dz * az);
      const across = Math.abs(dx * -az + dz * ax);
      if (along > reach || along < TILE_FP - gap || across > TILE_FP * 0.3) continue;
      parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Decor[]>();
  for (let i = 0; i < walls.length; i++) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(walls[i]!);
    else groups.set(root, [walls[i]!]);
  }

  const road = state.map.road;
  const roadAt = (fx: number, fz: number) => {
    const x = Math.floor(fx / TILE_FP);
    const z = Math.floor(fz / TILE_FP);
    return x >= 0 && z >= 0 && x < S && z < S && road[z * S + x]! > 0;
  };
  const out: SiteCandidate[] = [];
  for (const line of groups.values()) {
    if (line.length < need) continue;
    let plus = 0;
    let minus = 0;
    for (const w of line) {
      const [dx, dz] = dirOf(w);
      const nx = -dz * TILE_FP * 0.75;
      const nz = dx * TILE_FP * 0.75;
      if (roadAt(w.fx + nx, w.fz + nz)) plus++;
      if (roadAt(w.fx - nx, w.fz - nz)) minus++;
    }
    const side = plus >= minus ? 1 : -1;
    if (Math.max(plus, minus) * 2 < line.length) continue;

    const greens = new Set<EntityId>();
    for (const w of line) {
      const [dx, dz] = dirOf(w);
      const t = tileOf(w);
      const x = t % S;
      const z = (t - x) / S;
      for (const g of taggedIn(state, [x - 2, z - 2, x + 2, z + 2], 'flower').concat(
        taggedIn(state, [x - 2, z - 2, x + 2, z + 2], 'hedge'),
      )) {
        if (hasTag(g.def, 'wall')) continue;
        const ox = (g.fx - w.fx) / TILE_FP;
        const oz = (g.fz - w.fz) / TILE_FP;
        if (ox * ox + oz * oz > 2.25) continue;
        const toward = (ox * -dz + oz * dx) * side;
        if (toward < -0.1) greens.add(g.id);
      }
    }
    if (greens.size === 0) continue;
    const tiles = [...new Set(line.map(tileOf))].sort((a, b) => a - b);
    out.push({ anchor: tiles[0]!, members: [...line.map((w) => w.id), ...greens], tiles });
  }
  return out;
};
