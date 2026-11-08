// The minimap (I2, C4F; docs/spec/17-presentation.md, Layout): the valley as a little inked chart
// in the bottom right corner. Ground, river, roads, zones and buildings from the Mirror's layers,
// the view as a lantern-lit outline, your partner as a colored dot. Click to glide there.
import { content } from '@qoti/content';
import { MAP_SIZE, Road, Terrain, Water } from '@qoti/sim';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../app/session';
import type { MirrorChange } from '../state/mirror';
import { Glyph } from './icons';
import { zoneInkByValue } from './village';

const GROUND: Record<number, [number, number, number]> = {
  [Terrain.grass]: [170, 196, 128],
  [Terrain.meadow]: [184, 205, 136],
  [Terrain.forestFloor]: [128, 158, 102],
  [Terrain.sand]: [226, 208, 158],
  [Terrain.rock]: [176, 168, 152],
  [Terrain.mountain]: [150, 142, 130],
  [Terrain.water]: [120, 170, 196],
  [Terrain.field]: [216, 190, 110],
};
const WATER: [number, number, number] = [104, 158, 190];
const DEEP: [number, number, number] = [84, 138, 176];
const TREE: [number, number, number] = [92, 124, 78];
const ROAD: Record<number, [number, number, number]> = {
  [Road.path]: [208, 184, 140],
  [Road.lane]: [186, 150, 104],
  [Road.street]: [150, 140, 128],
  [Road.avenue]: [150, 140, 128],
};
const BUILDING: [number, number, number] = [92, 66, 49];
const HOME: [number, number, number] = [168, 86, 64];

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Paints the valley into an ImageData-sized buffer, one pixel per tile. */
export function paintMinimap(session: Session, data: Uint8ClampedArray): void {
  const m = session.mirror;
  const homes = new Set<number>();
  for (const b of m.buildings.values()) if (content.buildingById.get(b.def)?.housing) homes.add(b.id);
  const L = m.layers;
  for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) {
    const h = L.height[i] ?? 0;
    let c = GROUND[L.terrain[i] ?? 0] ?? GROUND[Terrain.grass]!;
    const water = L.water[i] ?? 0;
    if (water) c = water === Water.riverDeep ? DEEP : WATER;
    else if (L.tree[i]) c = TREE;
    let [r, g, b] = c;
    if (!water) {
      // Higher ground a touch lighter, so the hills read.
      const lift = Math.min(40, h * 3);
      r += lift * 0.5;
      g += lift * 0.5;
      b += lift * 0.4;
      const zone = zoneInkByValue(L.zone[i] ?? 0);
      if (zone) {
        const [zr, zg, zb] = hexRgb(zone);
        r = r * 0.55 + zr * 0.45;
        g = g * 0.55 + zg * 0.45;
        b = b * 0.55 + zb * 0.45;
      }
    }
    const road = L.road[i] ?? 0;
    if (road) [r, g, b] = ROAD[road] ?? ROAD[Road.lane]!;
    const occ = L.occupant[i] ?? 0;
    if (occ) [r, g, b] = homes.has(occ) ? HOME : BUILDING;
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
}

/** The four ground points at the corners of the screen, as fractions of the map, or null. */
function viewQuad(session: Session): [number, number][] | null {
  const r = session.render;
  if (!r) return null;
  const w = innerWidth;
  const h = innerHeight;
  const corners: [number, number][] = [
    [w * 0.02, h * 0.12],
    [w * 0.98, h * 0.12],
    [w * 0.98, h * 0.98],
    [w * 0.02, h * 0.98],
  ];
  const out: [number, number][] = [];
  for (const [x, y] of corners) {
    const t = r.pickTile(x, y);
    if (!t) return null;
    out.push([t.fx / 256 / MAP_SIZE, t.fz / 256 / MAP_SIZE]);
  }
  return out;
}

/**
 * Whether the map is out: the player's choice, except that it steps aside while an inspector or the
 * paint box holds the right column, so they get its full height.
 */
export function minimapShown(session: Session): boolean {
  const ui = session.ui;
  return ui.minimapOpen.value && ui.selection.value === null && ui.customize.value === null;
}

export function Minimap({ session }: { session: Session }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [quad, setQuad] = useState<[number, number][] | null>(null);
  const open = minimapShown(session);
  const cursors = session.ui.cursors.value;
  const seats = session.mirror.seats.value;

  // Repaint on layer and building changes, at most twice a second.
  useEffect(() => {
    if (!open) return;
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const image = ctx.createImageData(MAP_SIZE, MAP_SIZE);
    let pending = 0 as ReturnType<typeof setTimeout> | 0;
    const paint = () => {
      pending = 0;
      paintMinimap(session, image.data);
      ctx.putImageData(image, 0, 0);
    };
    paint();
    const off = session.mirror.onChange((ch: MirrorChange) => {
      if (pending || (!ch.full && !ch.buildings && ch.rects.size === 0)) return;
      pending = setTimeout(paint, 500);
    });
    return () => {
      off();
      if (pending) clearTimeout(pending);
    };
  }, [session, open]);

  // The view outline follows the camera a few times a second (picking is cheap math).
  useEffect(() => {
    if (!open) return;
    let last = '';
    const timer = setInterval(() => {
      const q = viewQuad(session);
      const key = q ? q.map(([x, z]) => `${x.toFixed(3)},${z.toFixed(3)}`).join(' ') : '';
      if (key !== last) {
        last = key;
        setQuad(q);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [session, open]);

  const toggle = () => {
    if (open) {
      session.ui.minimapOpen.value = false;
      return;
    }
    // Opening it by hand while something is inspected puts the inspector away.
    session.ui.minimapOpen.value = true;
    session.ui.selection.value = null;
    session.ui.customize.value = null;
  };
  if (!open) {
    return (
      <button
        type="button"
        class="panel minimap-fold"
        data-testid="minimap-open"
        title="Show the map"
        onClick={toggle}
      >
        <Glyph id="map" />
      </button>
    );
  }
  const go = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * MAP_SIZE;
    const z = ((e.clientY - rect.top) / rect.height) * MAP_SIZE;
    session.render?.focus(x, z);
  };
  const partner = [...cursors.entries()].filter(([seat]) => seat !== session.seat);
  return (
    <section class="panel minimap" data-testid="minimap">
      <div class="minimap-chart" onClick={go} title="Click to go there">
        <canvas ref={canvas} width={MAP_SIZE} height={MAP_SIZE} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="minimap-ink">
          {quad && (
            <polygon
              class="minimap-view"
              points={quad.map(([x, z]) => `${(x * 100).toFixed(2)},${(z * 100).toFixed(2)}`).join(' ')}
            />
          )}
          {partner.map(([seat, c]) => {
            const s = seats.find((x) => x.seat === seat);
            return (
              <circle
                key={seat}
                class="minimap-partner"
                cx={((c.x + 0.5) / MAP_SIZE) * 100}
                cy={((c.z + 0.5) / MAP_SIZE) * 100}
                r="2.2"
                style={{ fill: s ? `#${s.color.toString(16).padStart(6, '0')}` : 'var(--river)' }}
              />
            );
          })}
        </svg>
        <span class="minimap-compass" aria-hidden="true">
          N
        </span>
      </div>
      <button
        type="button"
        class="close minimap-close"
        title="Fold the map away"
        data-testid="minimap-close"
        onClick={toggle}
      >
        −
      </button>
    </section>
  );
}
