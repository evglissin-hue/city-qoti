import { signal } from '@preact/signals';
import { content, type ZoneDef } from '@qoti/content';
import { MAP_SIZE, MAX_ZONE_TILES, Road, Water } from '@qoti/sim';
import { setGroundMarks, type GroundMark } from '../../ui/marks';
import { rankAtLeast, UNZONE, zoneInk } from '../../ui/village';
import type { ToolContext } from '../context';
import { INPUT_COPY } from '../copy';
import { cursorHint } from '../hint';
import type { Tool } from '../tool';

type Tile = [number, number];

/** Whether a tile can hold a zone: not road, water or under a building. */
function zoneable(ctx: ToolContext, x: number, z: number): boolean {
  const m = ctx.mirror;
  return !m.road(x, z) && !m.water(x, z) && !m.occupant(x, z);
}

/** Road worthy of frontage: lanes and streets (carts and shopfronts), not footpaths. */
function frontageRoad(ctx: ToolContext, x: number, z: number): number {
  if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) return 0;
  const r = ctx.mirror.road(x, z);
  return r >= Road.lane && ctx.mirror.water(x, z) === Water.none ? r : 0;
}

const SIDES: { dx: number; dz: number; door: GroundMark['door'] }[] = [
  { dx: 0, dz: -1, door: 'n' },
  { dx: 0, dz: 1, door: 's' },
  { dx: -1, dz: 0, door: 'w' },
  { dx: 1, dz: 0, door: 'e' },
];

/**
 * A sketch of the lots a zone would get (docs/spec/13-ledger.md, Zoning and growth): walk the
 * zoned tiles that touch a lane or street and cut the zone's first lot shape along the road,
 * facing it, wherever the whole footprint is zoned and free. The sim's surveyor (C4B) cuts the
 * real ones hourly; this is the pencil version, and it says so.
 */
export function previewLots(
  ctx: ToolContext,
  zone: ZoneDef,
  painted: ReadonlySet<number>,
): {
  lots: GroundMark[];
  road: string;
} {
  const m = ctx.mirror;
  const value = zone.layerValue;
  const lotLayer = m.layers.lot;
  const zoneLayer = m.layers.zone;
  const inZone = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) return false;
    const i = z * MAP_SIZE + x;
    if (lotLayer?.[i]) return false;
    return painted.has(i) || zoneLayer?.[i] === value;
  };
  const [w0, d0] = zone.lots[0]?.size ?? [2, 2];
  const taken = new Set<number>();
  const lots: GroundMark[] = [];
  let street = 0;
  const ordered = [...painted].sort((a, b) => a - b);
  for (const i of ordered) {
    const x = i % MAP_SIZE;
    const z = Math.floor(i / MAP_SIZE);
    for (const side of SIDES) {
      const road = frontageRoad(ctx, x + side.dx, z + side.dz);
      if (!road) continue;
      // Width runs along the road, depth away from it.
      const alongX = side.dz !== 0;
      const w = alongX ? w0 : d0;
      const d = alongX ? d0 : w0;
      const lx = side.dx === 1 ? x - w + 1 : x;
      const lz = side.dz === 1 ? z - d + 1 : z;
      let fits = true;
      for (let tz = lz; tz < lz + d && fits; tz++) {
        for (let tx = lx; tx < lx + w && fits; tx++) {
          if (!inZone(tx, tz) || taken.has(tz * MAP_SIZE + tx)) fits = false;
        }
      }
      if (!fits) continue;
      // The whole front edge has to face the road.
      let front = true;
      for (let k = 0; k < (alongX ? w : d) && front; k++) {
        const fx = alongX ? lx + k : x + side.dx;
        const fz = alongX ? z + side.dz : lz + k;
        if (!frontageRoad(ctx, fx, fz)) front = false;
      }
      if (!front) continue;
      for (let tz = lz; tz < lz + d; tz++) for (let tx = lx; tx < lx + w; tx++) taken.add(tz * MAP_SIZE + tx);
      lots.push({ x: lx, z: lz, w, d, ink: zoneInk(zone.id), door: side.door });
      street = Math.max(street, road);
      break;
    }
  }
  return { lots, road: street === Road.street ? 'street' : 'lane' };
}

/**
 * Zoning (Ledger, Village rank): pick a zone, drag a box to paint it; Shift+drag or the Unzone card
 * clears. While dragging, the lots the box would make are sketched along the road.
 */
export function zoneTool(ctx: ToolContext): Tool {
  const variant = signal('homes-low');
  let start: Tile | null = null;
  let end: Tile | null = null;
  let erase = false;
  let cx = 0;
  let cy = 0;

  const locked = () => !rankAtLeast(ctx.mirror.town.value?.rank, 'village');
  const clearing = () => erase || variant.value === UNZONE;

  function box(): Tile[] {
    if (!start || !end) return [];
    const [x0, x1] = [Math.min(start[0], end[0]), Math.max(start[0], end[0])];
    const [z0, z1] = [Math.min(start[1], end[1]), Math.max(start[1], end[1])];
    const zone = ctx.mirror.layers.zone;
    const out: Tile[] = [];
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (clearing()) {
          if (zone?.[z * MAP_SIZE + x]) out.push([x, z]);
        } else if (zoneable(ctx, x, z)) out.push([x, z]);
      }
    }
    return out;
  }

  function preview(): void {
    if (locked()) {
      cursorHint(INPUT_COPY.zoneLocked, cx, cy);
      setGroundMarks([]);
      return;
    }
    if (!start) {
      cursorHint(null);
      return;
    }
    const tiles = box();
    const zone = content.zoneById.get(variant.value);
    ctx.render.setGhost({
      kind: 'tiles',
      tiles: tiles.length ? tiles : [end ?? start],
      valid: tiles.length > 0,
    });
    if (clearing() || !zone) {
      setGroundMarks([]);
      cursorHint(
        tiles.length ? `Unzone ${tiles.length} ${tiles.length === 1 ? 'tile' : 'tiles'}` : null,
        cx,
        cy,
      );
      return;
    }
    const painted = new Set(tiles.map(([x, z]) => z * MAP_SIZE + x));
    const { lots, road } = previewLots(ctx, zone, painted);
    setGroundMarks(lots, INPUT_COPY.zonePreview(lots.length, road));
    cursorHint(
      tiles.length > MAX_ZONE_TILES
        ? `${zone.name}: the first ${MAX_ZONE_TILES} tiles`
        : `${zone.name}: ${tiles.length} tiles`,
      cx,
      cy,
    );
  }

  function finish(): void {
    const tiles = box();
    start = null;
    end = null;
    ctx.render.setGhost(null);
    setGroundMarks([]);
    cursorHint(null);
    if (!tiles.length) return;
    for (let i = 0; i < tiles.length; i += MAX_ZONE_TILES) {
      const chunk = tiles.slice(i, i + MAX_ZONE_TILES);
      if (clearing()) ctx.submit({ t: 'zone.clear', tiles: chunk });
      else ctx.submit({ t: 'zone.paint', zone: variant.value, tiles: chunk });
    }
  }

  return {
    id: 'zone',
    lane: 'ledger',
    icon: '▤',
    label: 'Zone',
    hint: INPUT_COPY.zoneHint,
    order: 35,
    modes: ['standard'],
    get variants() {
      return [...content.zones.map((z) => ({ id: z.id, label: z.name })), { id: UNZONE, label: 'Unzone' }];
    },
    variant,
    pointerMove(p) {
      cx = p.clientX;
      cy = p.clientY;
      if (!p.tile) return;
      if (start) {
        end = [p.tile.x, p.tile.z];
        preview();
      } else {
        ctx.render.setGhost({ kind: 'tiles', tiles: [[p.tile.x, p.tile.z]], valid: !locked() });
        cursorHint(locked() ? INPUT_COPY.zoneLocked : null, cx, cy);
      }
    },
    pointerDown(p) {
      if (!p.tile) return;
      if (locked()) {
        ctx.ui.toast(INPUT_COPY.zoneLocked);
        return;
      }
      erase = p.shiftKey;
      start = [p.tile.x, p.tile.z];
      end = start;
      preview();
    },
    pointerUp(p) {
      if (!start) return;
      if (p.tile) end = [p.tile.x, p.tile.z];
      finish();
    },
    key(e) {
      if (e.key === 'Escape' && start) {
        start = null;
        end = null;
        ctx.render.setGhost(null);
        setGroundMarks([]);
        cursorHint(null);
        return true;
      }
      return false;
    },
    exit() {
      start = null;
      end = null;
      ctx.render.setGhost(null);
      setGroundMarks([]);
      cursorHint(null);
    },
  };
}
