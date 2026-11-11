import { artKitId, kitById, type KitAnchors } from '@qoti/art';
import { content } from '@qoti/content';
import { entranceTiles, type Rot4 } from '@qoti/sim';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { drawDef } from '../defs';
import { createWorldEnv, MAX_GROUND_LIGHTS, type WorldEnv } from '../env';
import { buildingMatrix, decorMatrix, standLevel } from '../kitGeometry';
import { LIGHT_LOOP, type LightDisc } from '../lightMap';
import { lampColor, windowLit } from '../lighting';
import { groundY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * Night lights. V2A: every light source is fed to the light map (render/lightMap.ts) as discs under
 * its own source name, and the ground and the kit materials read the map:
 * - `lanterns`: decor lamps, by kit (a lamp post throws farther than a hanging lantern);
 * - `windows`: the spill under lit panes, following the same seeded choice as the panes;
 * - `fires`: the festival bonfire;
 * - `ovens`: a glow at the door of bakeries, kilns, pie shops and smithies while they work;
 * - `shops`: a wide lamp over the threshold of shops of an evening.
 * Lamps take their color from the era (`lampColor`). The old 32-light loop survives only behind
 * `?debug&lights=loop`, so both nights can be measured on one build.
 */

/** How far and how bright each decor kit's lamp throws (kit id from `artKitId`). */
const LAMP_SHAPE: Readonly<Record<string, readonly [radius: number, intensity: number]>> = {
  bunting: [1.4, 0.3],
  'hanging-lantern': [2.1, 0.75],
  'lamp-post': [2.8, 1.0],
  lantern: [2.3, 0.85],
};
const LAMP_DEFAULT: readonly [number, number] = [2.2, 0.8];

/** Buildings with a fire at the door, sorted. */
export const OVEN_KITS: readonly string[] = ['bakery', 'brick-kiln', 'pie-shop', 'smithy'];
/** Buildings that leave a lamp over the threshold of an evening, sorted. */
export const SHOP_KITS: readonly string[] = [
  'chandler',
  'herbalist',
  'market-stall',
  'pie-shop',
  'shop',
  'tailor',
  'tavern',
  'trading-post',
];

/** Ovens glow from 4:00 to 23:00. */
export function ovenLit(hour: number): boolean {
  return hour >= 4 && hour < 23;
}

/** A shop's door lamp burns from 17:00 to 22:30; the tavern keeps it to midnight. */
export function shopLit(kit: string, hour: number): boolean {
  return hour >= 17 && hour < (kit === 'tavern' ? 24 : 22.5);
}

const FIRE_COLOR = 0xff7a3a;
const OVEN_COLOR = 0xff8f45;

interface GroundLight {
  x: number;
  y: number;
  z: number;
  strength: number;
  /** Window pane position for the lit test; null for lanterns (always considered). */
  pane: Vector3 | null;
}

interface WindowLight {
  pane: Vector3;
  disc: LightDisc;
}

interface DoorLight {
  kit: string;
  disc: LightDisc;
}

const decorAnchors = new Map<string, KitAnchors>();
const buildingAnchors = new Map<string, KitAnchors>();

function anchorsForDecor(defId: string): KitAnchors {
  let a = decorAnchors.get(defId);
  if (!a) {
    const def = content.decorById.get(defId);
    const kit = def ? kitById.get(artKitId(def.art)) : undefined;
    a = kit?.anchors?.(def?.art.params ? { params: def.art.params } : {}) ?? {};
    decorAnchors.set(defId, a);
  }
  return a;
}

function anchorsForBuilding(defId: string): KitAnchors {
  let a = buildingAnchors.get(defId);
  if (!a) {
    const def = drawDef(defId);
    const kit = def ? kitById.get(artKitId(def.art)) : undefined;
    a =
      (def &&
        kit?.anchors?.({
          size: def.size,
          entrance: def.entrance,
          ...(def.art.params ? { params: def.art.params } : {}),
        })) ||
      {};
    buildingAnchors.set(defId, a);
  }
  return a;
}

export function lightsLayer(): RenderLayer {
  let ctx: LayerContext | null = null;
  let env: WorldEnv | null = null;
  /** Only filled with the debug loop on: every pool, from which the 32 nearest are chosen. */
  let all: GroundLight[] = [];
  let windows: WindowLight[] = [];
  let ovens: DoorLight[] = [];
  let shops: DoorLight[] = [];
  let dirty = true;
  let lastShare = -1;
  let lastHourKey = -1;
  /** The light map's discs changed since the last frame (a static-layer event). */
  let fed = false;
  const lastFocus = new Vector3(Infinity, 0, 0);
  const m = new Matrix4();
  const p = new Vector3();

  const feed = (source: string, discs: readonly LightDisc[]): void => {
    if (env?.lightWriter.set(source, discs)) fed = true;
  };

  function collect(): void {
    if (!ctx) return;
    const mirror = ctx.mirror;
    all = [];
    windows = [];
    ovens = [];
    shops = [];
    const lanterns: LightDisc[] = [];
    const fires: LightDisc[] = [];
    for (const d of mirror.decor.values()) {
      const lights = anchorsForDecor(d.def).lights;
      if (!lights?.length) continue;
      const def = content.decorById.get(d.def);
      const kit = def ? artKitId(def.art) : '';
      const fire = kit === 'bonfire';
      const [radius, intensity] = LAMP_SHAPE[kit] ?? LAMP_DEFAULT;
      const color = lampColor(def?.eras);
      decorMatrix(mirror, d.fx, d.fz, d.rot, m);
      for (const l of lights) {
        p.set(l[0], l[1], l[2]).applyMatrix4(m);
        if (fire) fires.push({ x: p.x, z: p.z, radius: 3.6, color: FIRE_COLOR, intensity: 1.7 });
        else lanterns.push({ x: p.x, z: p.z, radius, color, intensity });
        if (LIGHT_LOOP)
          all.push({ x: p.x, y: groundY(mirror, p.x, p.z) + 0.05, z: p.z, strength: 0.8, pane: null });
      }
    }
    for (const b of mirror.buildings.values()) {
      const def = drawDef(b.def);
      const kit = def ? artKitId(def.art) : '';
      const color = lampColor(def?.eras);
      const oven = OVEN_KITS.includes(kit);
      const shop = SHOP_KITS.includes(kit);
      if (def && (oven || shop)) {
        const { entrance, front } = entranceTiles(def, b.x, b.z, b.rot as Rot4);
        const fx = front[0] - entrance[0];
        const fz = front[1] - entrance[1];
        const cx = front[0] + 0.5;
        const cz = front[1] + 0.5;
        // Just outside the door: the oven's glow hugs the wall, the shop's lamp stands a little out.
        if (oven) {
          const disc = {
            x: cx - fx * 0.25,
            z: cz - fz * 0.25,
            radius: 1.9,
            color: OVEN_COLOR,
            intensity: 0.95,
          };
          ovens.push({ kit, disc });
        }
        if (shop) {
          const disc = { x: cx + fx * 0.1, z: cz + fz * 0.1, radius: 3.0, color, intensity: 0.6 };
          shops.push({ kit, disc });
        }
      }
      const lights = anchorsForBuilding(b.def).lights;
      if (!lights?.length) continue;
      const level = standLevel(mirror, b.def, b.x, b.z, b.rot);
      buildingMatrix(b.def, b.x, b.z, b.rot, level, m);
      const [w, dd] = def?.size ?? [1, 1];
      const center = new Vector3(w / 2, 0, dd / 2).applyMatrix4(m);
      for (const l of lights) {
        p.set(l[0], l[1], l[2]).applyMatrix4(m);
        // Outward along the facade's normal (the dominant axis away from the middle).
        const dx = p.x - center.x;
        const dz = p.z - center.z;
        const ox = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
        const oz = ox === 0 ? Math.sign(dz) : 0;
        const pane = new Vector3(p.x - ox * 0.026, p.y, p.z - oz * 0.026);
        const gx = p.x + ox * 0.3;
        const gz = p.z + oz * 0.3;
        // Upper floors spill less than the ground floor.
        const disc: LightDisc = { x: gx, z: gz, radius: 1.15, color, intensity: l[1] < 0.9 ? 0.38 : 0.24 };
        windows.push({ pane, disc });
        if (LIGHT_LOOP) all.push({ x: gx, y: groundY(mirror, gx, gz) + 0.05, z: gz, strength: 0.2, pane });
      }
    }
    dirty = false;
    lastShare = -1;
    lastHourKey = -1;
    feed('lanterns', lanterns);
    feed('fires', fires);
  }

  function setWindows(share: number): void {
    feed(
      'windows',
      windows.filter((w) => windowLit(w.pane.x, w.pane.y, w.pane.z, share)).map((w) => w.disc),
    );
    lastShare = share;
  }

  function setHours(hour: number): void {
    const key = (ovenLit(hour) ? 1 : 0) + (shopLit('shop', hour) ? 2 : 0) + (shopLit('tavern', hour) ? 4 : 0);
    if (key === lastHourKey) return;
    lastHourKey = key;
    feed(
      'ovens',
      ovens.filter(() => ovenLit(hour)).map((o) => o.disc),
    );
    feed(
      'shops',
      shops.filter((s) => shopLit(s.kit, hour)).map((s) => s.disc),
    );
  }

  /** Debug loop only: the 32 pools nearest the view, as the ground shader's list. */
  function choose(): void {
    if (!env) return;
    const share = env.windowShare.value;
    const f = env.focus;
    const lit = all.filter((l) => !l.pane || windowLit(l.pane.x, l.pane.y, l.pane.z, share));
    lit.sort((a, b) => (a.x - f.x) ** 2 + (a.z - f.z) ** 2 - ((b.x - f.x) ** 2 + (b.z - f.z) ** 2));
    const n = Math.min(MAX_GROUND_LIGHTS, lit.length);
    for (let i = 0; i < n; i++) {
      const l = lit[i]!;
      env.lights.value[i]!.set(l.x, l.y, l.z, l.strength);
    }
    env.lightCount.value = n;
    lastFocus.copy(f);
  }

  return {
    id: 'lights',
    // Light only, nothing here casts: a change redraws the still frame, not the shadow map.
    shadowless: true,
    init(c) {
      ctx = c;
      env = c.env ?? createWorldEnv(new PerspectiveCamera());
      collect();
    },
    update(change) {
      if (change.full || change.buildings || change.decor || change.rects.has('height')) dirty = true;
    },
    frame() {
      if (!env) return false;
      if (dirty) collect();
      let changed = false;
      const share = env.windowShare.value;
      const shareMoved = lastShare !== share;
      if (shareMoved) setWindows(share);
      setHours(env.shown.hour);
      if (LIGHT_LOOP && env.night.value > 0.01) {
        if (shareMoved || lastFocus.distanceToSquared(env.focus) > 16) {
          choose();
          changed = true;
        }
      }
      // Discs fed to the light map are a static change too.
      if (fed) {
        fed = false;
        changed = true;
      }
      return changed;
    },
    dispose() {
      if (env) {
        env.lightCount.value = 0;
        for (const s of ['lanterns', 'windows', 'fires', 'ovens', 'shops']) env.lightWriter.clear(s);
      }
    },
  };
}
