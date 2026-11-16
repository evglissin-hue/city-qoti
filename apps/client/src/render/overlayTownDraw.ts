// R2D: the Town overlay's drawing (docs/spec/17-presentation.md, "One map, two inks"): the sage wash
// of evening footfall, places, evening streets and gaps draped on the ground as one sheet, and the
// glints where an outlet sells as another (the layer pulses its opacity, softly), and the goods routes
// in ochre as fine dashes along the roads. The numbers come from `townInk` and `routeEdges`.
import { CHUNK_SIZE, MAP_SIZE } from '@qoti/sim';
import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import type { Mirror } from '../state/mirror';
import { drapeGrid, drapeTiles, groundY, mergeDrapes, type Rgba } from './drape';
import { TOWN_COLORS, type InkStrength, type RouteEdge, type TownInk } from './overlayTown';

const N = MAP_SIZE;

function rgba(hex: number, a: number): Rgba {
  const c = new Color(hex);
  return [c.r, c.g, c.b, a];
}

const tileXZ = (i: number): { x: number; z: number } => ({ x: i % N, z: Math.floor(i / N) });

/** The ground sheet: footfall wash, places, evening streets, gaps; null when there is nothing to draw. */
export function townSheet(mirror: Mirror, ink: TownInk, strength: InkStrength): BufferGeometry | null {
  const sheets: BufferGeometry[] = [];
  const sage = new Color(TOWN_COLORS.sage);
  // The wash: per chunk, corners average their four tiles, so it falls off softly and has no edge.
  const cut = 0.03;
  const at = (x: number, z: number): number => {
    const tx = Math.min(N - 1, Math.max(0, x));
    const tz = Math.min(N - 1, Math.max(0, z));
    return ink.eve[tz * N + tx]!;
  };
  const busy = (cx: number, cz: number): boolean => {
    for (let z = Math.max(0, cz - 1); z < Math.min(N, cz + CHUNK_SIZE + 1); z++)
      for (let x = Math.max(0, cx - 1); x < Math.min(N, cx + CHUNK_SIZE + 1); x++)
        if (ink.eve[z * N + x]! > cut) return true;
    return false;
  };
  for (let cz = 0; cz < N; cz += CHUNK_SIZE) {
    for (let cx = 0; cx < N; cx += CHUNK_SIZE) {
      if (!busy(cx, cz)) continue;
      sheets.push(
        drapeGrid(mirror, cx, cz, cx + CHUNK_SIZE, cz + CHUNK_SIZE, (x, z): Rgba => {
          const t = (at(x - 1, z - 1) + at(x, z - 1) + at(x - 1, z) + at(x, z)) / 4;
          return [sage.r, sage.g, sage.b, t > cut ? strength.sage * t * 0.72 : 0];
        }),
      );
    }
  }
  // Places: a pale sage fill on every tile of them.
  if (ink.places.length > 0) {
    const a = 0.12 + 0.2 * strength.sage;
    sheets.push(
      drapeTiles(
        mirror,
        ink.places.map((i) => ({ ...tileXZ(i), rgba: rgba(TOWN_COLORS.sage, a) })),
        0.1,
      ),
    );
  }
  // Evening streets: the road tiles themselves, a deeper sage, whole tiles wide.
  if (ink.evening.length > 0) {
    const a = 0.4 + 0.3 * strength.sage;
    sheets.push(
      drapeTiles(
        mirror,
        ink.evening.map((i) => ({ ...tileXZ(i), rgba: rgba(TOWN_COLORS.street, a) })),
        0.08,
        0.06,
      ),
    );
  }
  // Gaps: the tile itself in dark umber, with a faint halo of its neighbors so it reads from afar.
  if (ink.gaps.length > 0) {
    const tiles: { x: number; z: number; rgba: Rgba }[] = [];
    for (const i of ink.gaps) {
      const { x, z } = tileXZ(i);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const xx = x + dx;
          const zz = z + dz;
          if (xx >= 0 && zz >= 0 && xx < N && zz < N)
            tiles.push({ x: xx, z: zz, rgba: rgba(TOWN_COLORS.gap, 0.2) });
        }
    }
    for (const i of ink.gaps) tiles.push({ ...tileXZ(i), rgba: rgba(TOWN_COLORS.gap, 0.85) });
    sheets.push(drapeTiles(mirror, tiles, 0.06, 0.07));
  }
  return sheets.length > 0 ? mergeDrapes(sheets) : null;
}

/** The glints: a small pale square at each outlet that sells to the round (the layer pulses it). */
export function townGlints(mirror: Mirror, ink: TownInk): BufferGeometry | null {
  if (ink.glints.length === 0) return null;
  return drapeTiles(
    mirror,
    ink.glints.map(([x, z]) => ({
      x: Math.floor(x),
      z: Math.floor(z),
      rgba: rgba(TOWN_COLORS.glint, 0.95),
    })),
    0.3,
    0.09,
  );
}

/** Quads along straight segments [x0, z0, x1, z1] (tile space), draped on the ground in short steps. */
function drapeSegments(
  mirror: Mirror,
  segments: readonly [number, number, number, number, Rgba, number][],
  lift = 0.07,
): BufferGeometry | null {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (const [x0, z0, x1, z1, rgba, width] of segments) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.01) continue;
    const nx = (-(z1 - z0) / len) * (width / 2);
    const nz = ((x1 - x0) / len) * (width / 2);
    const steps = Math.max(1, Math.round(len / 0.25));
    for (let i = 0; i < steps; i++) {
      const base = pos.length / 3;
      for (const [t, s] of [
        [i / steps, -1],
        [i / steps, 1],
        [(i + 1) / steps, -1],
        [(i + 1) / steps, 1],
      ] as const) {
        const px = x0 + (x1 - x0) * t + nx * s;
        const pz = z0 + (z1 - z0) * t + nz * s;
        pos.push(px, groundY(mirror, px, pz) + lift, pz);
        col.push(...rgba);
      }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  if (idx.length === 0) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

/**
 * The goods routes in ochre, as quiet as the sage beside them (the master's read of the first cut:
 * thick chevron bands across the fields, loud next to the footfall): fine dashes along the roads, a
 * little bolder where many routes share a road, fainter where a route has no road and goes straight.
 */
export function townRoutes(
  mirror: Mirror,
  edges: readonly RouteEdge[],
  strength: InkStrength,
): BufferGeometry | null {
  if (edges.length === 0) return null;
  const max = Math.max(1, ...edges.map((e) => e.units));
  const segments: [number, number, number, number, Rgba, number][] = [];
  for (const e of edges) {
    const ax = (e.a % N) + 0.5;
    const az = Math.floor(e.a / N) + 0.5;
    const bx = (e.b % N) + 0.5;
    const bz = Math.floor(e.b / N) + 0.5;
    const len = Math.hypot(bx - ax, bz - az);
    const road = len <= 1.01;
    const share = Math.sqrt(e.units / max);
    const width = 0.09 + 0.07 * share;
    const a = (road ? 0.36 + 0.26 * share : 0.24) * (0.45 + 0.55 * strength.ochre);
    const c = rgba(TOWN_COLORS.ochre, a);
    // A dash per tile step, with a gap either side of each tile center; straight fallbacks dash every tile.
    const dashes = Math.max(1, Math.round(len));
    for (let i = 0; i < dashes; i++) {
      const t0 = (i + 0.18) / dashes;
      const t1 = (i + 0.82) / dashes;
      segments.push([
        ax + (bx - ax) * t0,
        az + (bz - az) * t0,
        ax + (bx - ax) * t1,
        az + (bz - az) * t1,
        c,
        width,
      ]);
    }
  }
  return drapeSegments(mirror, segments);
}

/**
 * An inked outline round a set of tiles (a selected place), with the faintest wash inside, in place of
 * a filled block (the owner's note on P2's pale lot rectangle; the master's on the place card's).
 */
export function tileOutline(
  mirror: Mirror,
  tiles: readonly [number, number][],
  color: Color,
): BufferGeometry | null {
  if (tiles.length === 0) return null;
  const set = new Set(tiles.map(([x, z]) => z * N + x));
  const has = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N && set.has(z * N + x);
  // The lens tone taken halfway to ink brown, so the edge reads as drawn rather than lit.
  const inked = color.clone().lerp(new Color(0x5a4231), 0.45);
  const ink: Rgba = [inked.r, inked.g, inked.b, 0.75];
  const w = 0.075;
  const inset = 0.06;
  const segments: [number, number, number, number, Rgba, number][] = [];
  for (const [x, z] of tiles) {
    if (!has(x, z - 1)) segments.push([x, z + inset + w / 2, x + 1, z + inset + w / 2, ink, w]);
    if (!has(x, z + 1)) segments.push([x, z + 1 - inset - w / 2, x + 1, z + 1 - inset - w / 2, ink, w]);
    if (!has(x - 1, z)) segments.push([x + inset + w / 2, z, x + inset + w / 2, z + 1, ink, w]);
    if (!has(x + 1, z)) segments.push([x + 1 - inset - w / 2, z, x + 1 - inset - w / 2, z + 1, ink, w]);
  }
  const line = drapeSegments(mirror, segments, 0.08);
  const wash = drapeTiles(
    mirror,
    tiles.map(([x, z]) => ({ x, z, rgba: [color.r, color.g, color.b, 0.07] as Rgba })),
    0,
    0.06,
  );
  return line ? mergeDrapes([wash, line]) : wash;
}
