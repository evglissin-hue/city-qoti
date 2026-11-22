import { artKitId, kitById, lampFlameGeometry, LAMP_LIT_GROW, type KitAnchors } from '@qoti/art';
import { content } from '@qoti/content';
import {
  calendar,
  entranceTiles,
  footprintSize,
  MAP_SIZE,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type EntityId,
  type Rot4,
  type SuppliesView,
} from '@qoti/sim';
import { InstancedMesh, Matrix4, PerspectiveCamera, Vector3, type BufferGeometry } from 'three';
import { drawDef } from '../defs';
import { createWorldEnv, MAX_GROUND_LIGHTS, type WorldEnv } from '../env';
import { buildingMatrix, decorMatrix, standLevel } from '../kitGeometry';
import { LIGHT_LOOP, type LightDisc } from '../lightMap';
import { lampColor, windowLit } from '../lighting';
import { lamplightShowcase, type LamplightShowcase } from '../lamplightShowcase';
import { candleMask } from '../material';
import { groundY } from '../surface';
import type { LayerContext, RenderLayer } from './types';

/**
 * Night lights. V2A: every light source is fed to the light map (render/lightMap.ts) as discs under
 * its own source name, and the ground and the kit materials read the map:
 * - `lanterns`: the lamps the town lights (lanterns, hanging lanterns, lamp posts), by kit (a lamp
 *   post throws farther than a hanging lantern);
 * - `decor-lights`: other decor lit every night (the festival stage's corner lanterns);
 * - `windows`: the spill under lit panes, following the same seeded choice as the panes;
 * - `fires`: the festival bonfire and braziers;
 * - `ovens`: a glow at the door of bakeries, kilns, pie shops and smithies while they work;
 * - `shops`: a wide lamp over the threshold of shops of an evening.
 * Lamps take their color from the era (`lampColor`). The old 32-light loop survives only behind
 * `?debug&lights=loop`, so both nights can be measured on one build.
 *
 * R3F (docs/spec/19-evenings.md, Supplies; the handshake with V4A in docs/build/v4-wave-notes.md):
 * the town's lamps follow `SuppliesView` (the Mirror's `supplies`). A lamp listed tonight comes on
 * at its `reach` tick (as the lamplighter reaches it on his round) and goes out at `out` (07:00); a
 * lamp not listed stays dark. Lighting one is its pool in the light map and its glass in one
 * instanced draw of lit glass (`lampFlameGeometry` over each of its kit's `flames`), which the decor
 * layer draws unlit (`flame: 'off'`): no lantern's geometry changes, no shadow is drawn again, and
 * lamps reached in the same tick change the map once. A home with a candle tonight lights every
 * window from dusk until `candleUntil` (the kit material reads the candle mask, `candleMask`); a
 * cold fire throws no light.
 */

/** How far and how bright each decor kit's lamp throws (kit id from `artKitId`). */
// V2X: a quarter brighter than V2A's, with the tighter pool shape (`discFalloff`), and small lamps
// throw less far (a grown village stands its lanterns a tile and a half apart along every street,
// so V2A's 2-tile pools met in one wash): bright under the lamp, dark between lamps.
const LAMP_SHAPE: Readonly<Record<string, readonly [radius: number, intensity: number]>> = {
  bunting: [1.0, 0.35],
  'hanging-lantern': [1.6, 0.95],
  'lamp-post': [2.4, 1.25],
  lantern: [1.4, 1.0],
};
const LAMP_DEFAULT: readonly [number, number] = [1.6, 1.0];

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

const FIRE_COLOR = 0xff9548;
const OVEN_COLOR = 0xff8f45;
/** R3F: a brazier's fire, smaller than the bonfire's. */
const BRAZIER_POOL: readonly [radius: number, intensity: number] = [2.0, 1.0];

// --- R3F: the supplies' clock -------------------------------------------------------------------

/** The absolute tick of `hour` (fractional) on day index `day` (as the sim's views count them). */
export function tickAt(day: number, hour: number): number {
  return day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR;
}

/** The day index of a tick (days start at midnight). */
export function dayOf(tick: number): number {
  return Math.floor((tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
}

/** The night a tick belongs to: its day from `outHour` (07:00) on, the day before until then. */
export function nightOf(tick: number): number {
  const day = dayOf(tick);
  return tick < tickAt(day, content.supplies.outHour) ? day - 1 : day;
}

/** The quarter hour the renderer shows for a tick when nothing pins it (`Renderer.updateLighting`). */
function quarterOf(tick: number): number {
  const c = calendar(tick);
  return c.hour + Math.floor(c.minute / 15) / 4;
}

/**
 * R3F: the tick the picture shows. The Mirror's own while the light follows it (the renderer shows
 * its quarter hour, so `shownHour` is the quarter of this tick or of the last one seen); with the
 * hour pinned (`?debug&hour=`, `__qoti.setHour`, a time of day held for a photo), that hour of the
 * tick's day, so the lamps agree with the light on screen.
 */
export function shownTick(tick: number, shownHour: number, lastTick = tick): number {
  if (shownHour === quarterOf(tick) || shownHour === quarterOf(lastTick)) return tick;
  return Math.round(tickAt(dayOf(tick), shownHour));
}

/** R3F: tonight's lamps, candles and rests as the lights and decor layers read them. */
export interface SuppliesClock {
  /** The night the view describes. */
  night: number;
  /** Each listed lamp's reach and out (absolute ticks of `night`), sorted by id. */
  lamps: { id: EntityId; reach: number; out: number }[];
  /** Homes with a candle that night, and the window of ticks their windows burn (`night`'s). */
  candles: ReadonlySet<EntityId>;
  candleFrom: number;
  candleUntil: number;
}

/**
 * R3F: the clock for a view, or with none (a snapshot from before R3, a showcase) every supplied
 * lamp lit from `litHour` to `outHour` of `night`, as before R3.
 */
export function suppliesClock(
  view: SuppliesView | null,
  lampIds: readonly EntityId[],
  night: number,
): SuppliesClock {
  const S = content.supplies;
  const settle = S.settleHour + S.settleMinute / 60;
  if (!view)
    return {
      night,
      lamps: lampIds.map((id) => ({
        id,
        reach: tickAt(night, S.litHour),
        out: tickAt(night + 1, S.outHour),
      })),
      candles: new Set(),
      candleFrom: tickAt(night, settle),
      candleUntil: tickAt(night, settle),
    };
  return {
    night: view.night,
    lamps: view.lamps.map((l) => ({ id: l.id, reach: l.reach, out: l.out })),
    candles: new Set(view.candles),
    candleFrom: tickAt(view.night, settle),
    candleUntil: view.candleUntil,
  };
}

/**
 * R3F: the whole days to move a clock by so it describes the night `tick` belongs to. A view keeps
 * its night until the next `supplies.updated` (the settling at 17:30, the lamps out at 07:00), so a
 * view from a night before (a seat joining in the day, a valley before R3A's settling) stands for
 * tonight's as it was: lamps never go dark only because no update has come yet.
 */
export function clockShift(clock: Pick<SuppliesClock, 'night'>, tick: number): number {
  return (nightOf(tick) - clock.night) * TICKS_PER_DAY;
}

/** The lamps of a clock lit at `tick` (shifted to its night), in the clock's order. */
export function litLamps(clock: SuppliesClock, tick: number): EntityId[] {
  const t = tick - clockShift(clock, tick);
  const out: EntityId[] = [];
  for (const l of clock.lamps) if (l.reach <= t && t < l.out) out.push(l.id);
  return out;
}

/** Whether a clock's candle-lit homes burn at `tick` (dusk to `candleUntil`). */
export function candlesBurn(clock: SuppliesClock, tick: number): boolean {
  const t = tick - clockShift(clock, tick);
  return t >= clock.candleFrom && t < clock.candleUntil;
}

/**
 * R3F: a key that changes exactly when the lit set or the candles may change: the night's shift
 * and how many of the clock's edges (reach, out, the candles' window) `tick` has passed. Between two
 * edges nothing changes, so a frame compares a key and does nothing else.
 */
export function clockKey(clock: SuppliesClock, edges: readonly number[], tick: number): string {
  const shift = clockShift(clock, tick);
  const t = tick - shift;
  let lo = 0;
  let hi = edges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (edges[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return `${shift}:${lo}`;
}

/** The sorted edges of a clock (every reach and out, and the candles' window). */
export function clockEdges(clock: SuppliesClock): number[] {
  const e = [clock.candleFrom, clock.candleUntil];
  for (const l of clock.lamps) e.push(l.reach, l.out);
  return [...new Set(e)].sort((a, b) => a - b);
}

/** Whether a decor def is a lamp the town lights (a candle a night: lantern, hanging lantern, lamp post). */
export function isTownLamp(defId: string): boolean {
  return content.decorById.get(defId)?.supply?.kind === 'nightly';
}

/** R3F: the decor kits whose fire burns unless it rests cold, sorted. */
export const FIRE_KITS: readonly string[] = ['bonfire', 'brazier'];

interface GroundLight {
  x: number;
  y: number;
  z: number;
  strength: number;
  /** Window pane position for the lit test; null for lanterns (always considered). */
  pane: Vector3 | null;
}

interface WindowLight {
  /** The building the window is in (a home with a candle lights them all). */
  building: EntityId;
  pane: Vector3;
  disc: LightDisc;
}

interface DoorLight {
  kit: string;
  disc: LightDisc;
}

/** A lamp the town lights: its pools, and its glass boxes in the world for the lit glass. */
interface TownLamp {
  discs: LightDisc[];
  glass: Matrix4[];
}

interface Fire {
  id: EntityId;
  discs: LightDisc[];
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

let glassGeometry: BufferGeometry | null = null;

/** R3F: the lights layer, with what its tests and the debug hook read. */
export interface LightsLayer extends RenderLayer {
  /** Town lamps lit now, by decor id (sorted), and whether candle-lit homes burn now. */
  readonly lit: () => { lamps: readonly EntityId[]; candles: boolean };
  /**
   * Debug only: the lamplight scene in this client's Mirror (`lamplightShowcase.ts`), reached as
   * `__qoti.renderer().layers.find((l) => l.id === 'lights').showcase()`, as the fireworks are.
   */
  readonly showcase: (x?: number, z?: number) => LamplightShowcase | null;
}

export function lightsLayer(): LightsLayer {
  let ctx: LayerContext | null = null;
  let env: WorldEnv | null = null;
  /** Only filled with the debug loop on: every pool, from which the 32 nearest are chosen. */
  let all: GroundLight[] = [];
  let windows: WindowLight[] = [];
  let ovens: DoorLight[] = [];
  let shops: DoorLight[] = [];
  /** R3F: the town's lamps by decor id, and fires by decor id. */
  let lamps = new Map<EntityId, TownLamp>();
  let fires: Fire[] = [];
  let dirty = true;
  let lastShare = -1;
  let lastHourKey = -1;
  /** R3F: the supplies' clock, its edges, and what the last frame showed. */
  let clock: SuppliesClock | null = null;
  let edges: number[] = [];
  let suppliesDirty = true;
  /** The Mirror's supplies view the clock was built from (a new view object is a new view). */
  let seenView: SuppliesView | null | undefined;
  let lastKey = '';
  let lastTick = 0;
  let litNow: EntityId[] = [];
  let candlesNow = false;
  /** The candle-lit homes the mask holds (empty when none burn). */
  let maskHomes: ReadonlySet<EntityId> = new Set();
  let cold: ReadonlySet<EntityId> = new Set();
  let glass: InstancedMesh | null = null;
  /** The light map's discs changed since the last frame (a static-layer event). */
  let fed = false;
  const lastFocus = new Vector3(Infinity, 0, 0);
  const m = new Matrix4();
  const local = new Matrix4();
  const p = new Vector3();
  const grow = new Vector3();

  const feed = (source: string, discs: readonly LightDisc[]): void => {
    if (env?.lightWriter.set(source, discs)) fed = true;
  };

  /** The tick on screen (`shownTick`), remembering the Mirror's last. */
  function nowTick(): number {
    const tick = ctx?.mirror.tick.value ?? 0;
    const t = env ? shownTick(tick, env.shown.hour, lastTick) : tick;
    lastTick = tick;
    return t;
  }

  function collect(): void {
    if (!ctx) return;
    const mirror = ctx.mirror;
    all = [];
    windows = [];
    ovens = [];
    shops = [];
    lamps = new Map();
    fires = [];
    const others: LightDisc[] = [];
    for (const d of mirror.decor.values()) {
      const anchors = anchorsForDecor(d.def);
      const lights = anchors.lights;
      if (!lights?.length) continue;
      const def = content.decorById.get(d.def);
      const kit = def ? artKitId(def.art) : '';
      const fire = FIRE_KITS.includes(kit);
      const town = isTownLamp(d.def);
      const [radius, intensity] = LAMP_SHAPE[kit] ?? LAMP_DEFAULT;
      const color = lampColor(def?.eras);
      decorMatrix(mirror, d.fx, d.fz, d.rot, m);
      const discs: LightDisc[] = [];
      for (const l of lights) {
        p.set(l[0], l[1], l[2]).applyMatrix4(m);
        if (kit === 'bonfire') discs.push({ x: p.x, z: p.z, radius: 3.0, color: FIRE_COLOR, intensity: 1.3 });
        else if (fire)
          discs.push({
            x: p.x,
            z: p.z,
            radius: BRAZIER_POOL[0],
            color: FIRE_COLOR,
            intensity: BRAZIER_POOL[1],
          });
        else discs.push({ x: p.x, z: p.z, radius, color, intensity });
        if (LIGHT_LOOP)
          all.push({ x: p.x, y: groundY(mirror, p.x, p.z) + 0.05, z: p.z, strength: 0.8, pane: null });
      }
      if (fire) fires.push({ id: d.id, discs });
      else if (town) {
        const boxes = (anchors.flames ?? []).map((f) => {
          grow.set(
            f.half[0] * 2 * LAMP_LIT_GROW[0],
            f.half[1] * 2 * LAMP_LIT_GROW[1],
            f.half[2] * 2 * LAMP_LIT_GROW[2],
          );
          local.makeScale(grow.x, grow.y, grow.z).setPosition(f.center[0], f.center[1], f.center[2]);
          return m.clone().multiply(local);
        });
        lamps.set(d.id, { discs, glass: boxes });
      } else others.push(...discs);
    }
    for (const b of mirror.buildings.values()) {
      const def = drawDef(b.def);
      // R1X: a business is drawn as its trade (a baker's workshop is a bakery, R1E's looks), so its
      // oven or shop lamp is the trade's: by the def alone no R1 bakery ever glowed.
      const trade = b.trade ? content.tradeById.get(b.trade) : undefined;
      const kit = trade ? artKitId(trade.look) : def ? artKitId(def.art) : '';
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
        const disc: LightDisc = { x: gx, z: gz, radius: 0.95, color, intensity: l[1] < 0.9 ? 0.16 : 0.1 };
        windows.push({ building: b.id, pane, disc });
        if (LIGHT_LOOP) all.push({ x: gx, y: groundY(mirror, gx, gz) + 0.05, z: gz, strength: 0.2, pane });
      }
    }
    dirty = false;
    lastShare = -1;
    lastHourKey = -1;
    // The lamps, fires and candles are fed again from the clock on this frame.
    suppliesDirty = true;
    feed('decor-lights', others);
  }

  /** R3F: rebuilds the supplies' clock from the Mirror's view (or the stand-in for none). */
  function rebuildClock(tick: number): void {
    if (!ctx) return;
    const view = ctx.mirror.supplies.value;
    clock = suppliesClock(
      view,
      [...lamps.keys()].sort((a, b) => a - b),
      nightOf(tick),
    );
    edges = clockEdges(clock);
    cold = new Set((view?.resting ?? []).filter((r) => r.kind === 'cold').map((r) => r.id));
    feed(
      'fires',
      fires.filter((f) => !cold.has(f.id)).flatMap((f) => f.discs),
    );
    suppliesDirty = false;
    lastKey = '';
  }

  /** R3F: the lit glass over each lit lamp, one instanced draw (made on the first lamp lit). */
  function setGlass(lit: readonly EntityId[]): void {
    if (!ctx) return;
    let n = 0;
    for (const id of lit) n += lamps.get(id)?.glass.length ?? 0;
    if (n === 0 && !glass) return;
    if (!glass || glass.instanceMatrix.count < n) {
      if (glass) {
        ctx.scene.remove(glass);
        glass.dispose();
      }
      glassGeometry ??= lampFlameGeometry();
      glass = new InstancedMesh(glassGeometry, ctx.material, Math.max(16, n + (n >> 1)));
      glass.name = 'lamp-glass';
      // Light only: nothing here casts (nor may the renderer's override make it), and it sits inside
      // its lantern's frame.
      glass.castShadow = false;
      glass.userData.noCast = true;
      glass.receiveShadow = true;
      glass.frustumCulled = false;
      ctx.scene.add(glass);
    }
    let i = 0;
    for (const id of lit) for (const g of lamps.get(id)?.glass ?? []) glass.setMatrixAt(i++, g);
    glass.count = i;
    glass.visible = i > 0;
    glass.instanceMatrix.needsUpdate = true;
  }

  /** R3F: the candle mask (every tile of each candle-lit home's footprint, while they burn). */
  function setCandles(homes: ReadonlySet<EntityId>): boolean {
    if (!ctx || !env) return false;
    const same = homes.size === maskHomes.size && [...homes].every((h) => maskHomes.has(h));
    if (same) return false;
    maskHomes = homes;
    const tex = candleMask(env).uCandles.value;
    const data = tex.image.data as Uint8Array;
    data.fill(0);
    for (const id of homes) {
      const b = ctx.mirror.buildings.get(id);
      const def = b ? drawDef(b.def) : undefined;
      if (!b || !def) continue;
      const [w, d] = footprintSize(def, b.rot as Rot4);
      for (let z = Math.max(0, b.z); z < Math.min(MAP_SIZE, b.z + d); z++)
        for (let x = Math.max(0, b.x); x < Math.min(MAP_SIZE, b.x + w); x++) data[z * MAP_SIZE + x] = 255;
    }
    tex.needsUpdate = true;
    return true;
  }

  /** R3F: lamps, candles and fires for the tick on screen; true when anything changed. */
  function supplies(tick: number): boolean {
    if (suppliesDirty || !clock) rebuildClock(tick);
    const c = clock!;
    const key = clockKey(c, edges, tick);
    if (key === lastKey) return false;
    lastKey = key;
    // Lamps reached since the last frame, in one tick or several, change the map once.
    const lit = litLamps(c, tick).filter((id) => lamps.has(id));
    const burn = candlesBurn(c, tick);
    let changed = false;
    if (lit.length !== litNow.length || lit.some((id, i) => id !== litNow[i])) {
      litNow = lit;
      feed(
        'lanterns',
        lit.flatMap((id) => lamps.get(id)!.discs),
      );
      setGlass(lit);
      changed = true;
    }
    candlesNow = burn;
    if (setCandles(burn ? c.candles : new Set())) {
      lastShare = -1;
      changed = true;
    }
    return changed;
  }

  function setWindows(share: number): void {
    feed(
      'windows',
      windows
        .filter((w) => maskHomes.has(w.building) || windowLit(w.pane.x, w.pane.y, w.pane.z, share))
        .map((w) => w.disc),
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
    lit: () => ({ lamps: litNow, candles: candlesNow }),
    showcase: (x, z) => (ctx ? lamplightShowcase(ctx.mirror, x, z) : null),
    init(c) {
      ctx = c;
      env = c.env ?? createWorldEnv(new PerspectiveCamera());
      lastTick = c.mirror.tick.value;
      collect();
    },
    update(change) {
      if (change.full || change.buildings || change.decor || change.rects.has('height')) dirty = true;
    },
    frame() {
      if (!env || !ctx) return false;
      if (dirty) collect();
      // `supplies.updated` replaces the view whole: a new object is a new night, priority or rest.
      if (ctx.mirror.supplies.value !== seenView) {
        seenView = ctx.mirror.supplies.value;
        suppliesDirty = true;
      }
      let changed = supplies(nowTick());
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
        for (const s of ['lanterns', 'decor-lights', 'windows', 'fires', 'ovens', 'shops'])
          env.lightWriter.clear(s);
        if (maskHomes.size) setCandles(new Set());
      }
      if (glass) {
        ctx?.scene.remove(glass);
        glass.dispose();
        glass = null;
      }
    },
  };
}
