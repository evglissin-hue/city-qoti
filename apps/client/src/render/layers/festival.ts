import {
  circusGeometry,
  crateOf,
  festoonPosts,
  mergeFlat,
  seeded,
  ShapeBuilder,
  STALL_COUNTER,
} from '@qoti/art';
import { MAP_SIZE, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '@qoti/sim';
import { Mesh, type BufferGeometry } from 'three';
import type { LightDisc } from '../lightMap';
import { decorMatrix } from '../kitGeometry';
import { groundY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * C5E: what a festival and the circus put up that is not decor of its own (docs/spec/12-hearth.md,
 * Festivals): festoon lanterns on posts round the festival's site all through its day (lit at
 * night by the kit material's glow), the menu's goods set out in crates on every festival stall, and
 * the circus tent with its wagons on the Village Green while the circus is in town. Static: it
 * rebuilds, and drops the still frame, only when one of those changes.
 */
/** The festoon lanterns' paper colors, as the kit paints them. */
const FESTOON_COLORS = [0xffc977, 0xf2b8c6, 0xffd58a, 0xbfe0a0];

export function festivalLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let mesh: Mesh | null = null;
  let key = '';
  let timer = 0;

  /** Today's absolute day (the sim calendar's day index). */
  function today(): number {
    const tick = ctx?.mirror.tick.value ?? 0;
    return Math.floor((tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
  }

  /** The festival's site as a tile rect, when it is planned for today. */
  function siteRect(): [number, number, number, number] | null {
    const f = ctx?.mirror.festival.value;
    const site = f?.plan?.site;
    if (!f || !site || (f.day !== today() && !f.live)) return null;
    if ('rect' in site) return site.rect;
    const n = MAP_SIZE;
    const x = site.anchor % n;
    const z = Math.floor(site.anchor / n);
    return [x - 3, z - 3, x + 3, z + 3];
  }

  /** The Village Green's middle while a circus is on, or null. */
  function circusAt(): [number, number] | null {
    const m = ctx?.mirror;
    const on = m?.weather.value?.events.some((e) => e.event === 'circus' && e.active);
    if (!m || !on) return null;
    const site = m.patterns.get('village-green')?.sites[0];
    if (!site) return null;
    if (!site.tiles.length) return [site.x + 0.5, site.z + 0.5];
    let sx = 0;
    let sz = 0;
    for (const t of site.tiles) {
      sx += t % MAP_SIZE;
      sz += Math.floor(t / MAP_SIZE);
    }
    return [sx / site.tiles.length + 0.5, sz / site.tiles.length + 0.5];
  }

  function stateKey(): string {
    const m = ctx!.mirror;
    const rect = siteRect();
    const menu = m.festival.value?.plan?.menu.map(([g]) => g) ?? [];
    const stalls = [...m.decor.values()]
      .filter((d) => d.def === 'festival-stall')
      .map((d) => `${d.id}@${d.fx},${d.fz},${d.rot}`);
    const circus = circusAt();
    return `${rect?.join(',') ?? ''}|${menu.join(',')}|${stalls.join(';')}|${circus?.join(',') ?? ''}`;
  }

  function rebuild(): void {
    if (!ctx) return;
    const k = stateKey();
    if (k === key) return;
    key = k;
    if (mesh) {
      ctx.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh = null;
    }
    const m = ctx.mirror;
    const parts: BufferGeometry[] = [];
    const rnd = seeded(7);
    const discs: LightDisc[] = [];
    const rect = siteRect();
    if (rect) {
      // Posts at the corners and every few tiles along each edge, a string of lanterns between.
      const [x0, z0, x1, z1] = rect;
      const a = [x0 + 0.2, z0 + 0.2] as const;
      const b = [x1 + 0.8, z1 + 0.8] as const;
      const pts: [number, number][] = [];
      const edge = (p: readonly [number, number], q: readonly [number, number]): void => {
        const n = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 3));
        for (let i = 0; i < n; i++)
          pts.push([p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n]);
      };
      edge([a[0], a[1]], [b[0], a[1]]);
      edge([b[0], a[1]], [b[0], b[1]]);
      edge([b[0], b[1]], [a[0], b[1]]);
      edge([a[0], b[1]], [a[0], a[1]]);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const q = pts[(i + 1) % pts.length]!;
        const s = new ShapeBuilder();
        // Kit space is local to the first post; lift it onto the ground there.
        const lights = festoonPosts(s, [0, 0], [q[0] - p[0], q[1] - p[1]], rnd);
        for (const l of lights) {
          discs.push({
            x: p[0] + l[0],
            z: p[1] + l[2],
            radius: 1.6,
            color: FESTOON_COLORS[discs.length % FESTOON_COLORS.length]!,
            intensity: 0.45,
          });
        }
        s.translate(p[0], groundY(m, p[0], p[1]), p[1]);
        parts.push(s.build());
      }
    }
    const menu = m.festival.value?.plan?.menu.map(([g]) => g) ?? [];
    if (menu.length) {
      for (const d of m.decor.values()) {
        if (d.def !== 'festival-stall') continue;
        const s = new ShapeBuilder();
        const r = seeded(d.id);
        const goods =
          menu.length === 1
            ? [menu[0]!, menu[0]!]
            : [menu[d.id % menu.length]!, menu[(d.id + 1) % menu.length]!];
        const { y, x0, x1, z } = STALL_COUNTER;
        crateOf(s, goods[0]!, x0 + 0.12, y, z, r);
        crateOf(s, goods[1]!, x1 - 0.12, y, z, r);
        const g = s.build();
        g.applyMatrix4(decorMatrix(m, d.fx, d.fz, d.rot));
        parts.push(g);
      }
    }
    const circus = circusAt();
    if (circus) {
      const g = circusGeometry('high').build();
      g.translate(circus[0], groundY(m, circus[0], circus[1]), circus[1]);
      parts.push(g);
    }
    if (parts.length) {
      const g = mergeFlat(parts);
      for (const p of parts) p.dispose();
      mesh = new Mesh(g, ctx.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      ctx.scene.add(mesh);
    }
    ctx.env?.lightWriter.set('festival', discs);
    ctx.invalidate();
  }

  return {
    id: 'festival',
    init(c) {
      ctx = c;
      rebuild();
    },
    update(change) {
      if (change.full || change.decor || change.seasons || change.patterns || change.rects.has('height'))
        rebuild();
    },
    frame(dt) {
      // The festival's day starts and ends with the clock, not with an event: look once a second.
      timer -= dt;
      if (!ctx || timer > 0) return false;
      timer = 1;
      const k = stateKey();
      if (k !== key) rebuild();
      return false;
    },
    dispose() {
      ctx?.env?.lightWriter.clear('festival');
      if (mesh) {
        ctx?.scene.remove(mesh);
        mesh.geometry.dispose();
      }
    },
  };
}
