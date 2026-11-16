// R2D: the Town overlay's drawing (docs/spec/17-presentation.md, "One map, two inks"): the sage wash
// of evening footfall, places, evening streets and gaps draped on the ground as one sheet, and the
// glints where an outlet sells as another (the layer pulses its opacity, softly). Goods routes in
// ochre are the flows ribbons, which the overlays layer draws. The numbers come from `townInk`.
import { CHUNK_SIZE, MAP_SIZE } from '@qoti/sim';
import { Color, type BufferGeometry } from 'three';
import type { Mirror } from '../state/mirror';
import { drapeGrid, drapeTiles, mergeDrapes, type Rgba } from './drape';
import { TOWN_COLORS, type InkStrength, type TownInk } from './overlayTown';

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
