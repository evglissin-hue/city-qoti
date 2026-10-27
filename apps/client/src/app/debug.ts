import { content } from '@qoti/content';
import {
  canPaintRoad,
  canPlaceBuilding,
  canPlaceDecor,
  footprintSize,
  MAP_SIZE,
  TILE_FP,
  type Command,
  type Lens,
  type LayerName,
  type RankId,
  type Rot4,
  type Turn,
  type ValleySettings,
} from '@qoti/sim';
import type { Selection } from '../input/context';
import { applySettings, loadSettings } from '../ui/settings';
import { roadsShowcase } from '../render/roadShowcase';
import { villageShowcase } from '../render/showcase';
import { fakeCharm, fakeRuntime, startSyntheticResidents, type SyntheticOptions } from '../render/synthetic';
import { SimHost } from '../worker/host';
import { overlayMocks, overlayVillageMocks } from './fixture';
import type { Session } from './session';

export interface GoldenScript {
  seed: string;
  settings: ValleySettings;
  lastTurn: number;
  turns: Turn[];
}

export const DEBUG = new URLSearchParams(location.search).has('debug');

/** Tiles around the start area center, nearest first, that are on screen. */
function nearbyTiles(session: Session, radius: number): [number, number][] {
  const [x0, z0, x1, z1] = session.mirror.meta.startArea;
  const cx = Math.floor((x0 + x1) / 2);
  const cz = Math.floor((z0 + z1) / 2);
  const out: [number, number][] = [];
  for (let r = 0; r <= radius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (session.renderer?.screenOf(cx + dx, cz + dz)) out.push([cx + dx, cz + dz]);
      }
    }
  }
  return out;
}

/**
 * window.__qoti, only with ?debug: mirror counts, last turn and last hash for tests, plus helpers
 * that find valid, visible spots so end to end tests can drive the real tools with the mouse.
 */
export function installDebugHook(getSession: () => Session | null): void {
  if (!DEBUG) return;
  const s = () => getSession();
  let stopSynth: (() => void) | null = null;
  const hook = {
    status: () => s()?.connection?.status.value ?? 'none',
    phase: () => s()?.phase.value ?? 'none',
    seat: () => s()?.seat ?? null,
    valleyId: () => s()?.target.valleyId ?? null,
    counts: () => {
      const m = s()?.mirror;
      if (!m) return null;
      return {
        buildings: m.buildings.size,
        decor: m.decor.size,
        notes: m.notes.size,
        trees: m.treeCount(),
        roads: m.roadCount(),
      };
    },
    lastTurn: () => s()?.mirror.lastTurn.value ?? 0,
    clock: () => {
      const m = s()?.mirror;
      return m ? { ...m.clock.value, tick: m.tick.value } : null;
    },
    lastHash: () => s()?.debug.lastHash ?? null,
    hashAt: (t: number) => s()?.debug.hashes.get(t) ?? null,
    hashTurns: () => [...(s()?.debug.hashes.keys() ?? [])],
    firstSeen: (key: string) => s()?.debug.firstSeen.get(key) ?? null,
    /** Earliest time an entity of `kind` ('building', 'decor', 'note') first appeared at or after `since`. */
    seenSince: (kind: string, since: number) => {
      let best: number | null = null;
      for (const [key, at] of s()?.debug.firstSeen ?? []) {
        if (key.startsWith(`${kind}:`) && at >= since && (best === null || at < best)) best = at;
      }
      return best;
    },
    lastSubmitAt: () => s()?.debug.lastSubmitAt ?? 0,
    resyncs: () => s()?.debug.resyncs ?? 0,
    /** Makes this seat's sim drift from the room's; the room should notice and resync it. */
    corrupt: () => s()?.corruptForTest(),
    stats: () => s()?.renderer?.stats ?? null,
    screenOf: (x: number, z: number) => s()?.renderer?.screenOf(x, z) ?? null,
    screenOfFp: (fx: number, fz: number) => s()?.renderer?.screenOfFp(fx, fz) ?? null,
    selectTool: (id: string, variant?: string) => s()?.tools?.select(id, variant),
    submit: (cmd: Command) => s()?.submit(cmd) ?? -1,
    /** Where to hover so the building tool places `def` validly; returns the hover tile too. */
    findBuildingSpot: (def: string, rot: Rot4 = 0) => {
      const session = s();
      const d = content.buildingById.get(def);
      if (!session || !d) return null;
      const [w, h] = footprintSize(d, rot);
      for (const [tx, tz] of nearbyTiles(session, 20)) {
        const x = tx - Math.floor((w - 1) / 2);
        const z = tz - Math.floor((h - 1) / 2);
        // Keep one free tile around it, so a pixel of picking error cannot spoil the click.
        const ok =
          canPlaceBuilding(session.mirror, d, x, z, rot).ok &&
          canPlaceBuilding(session.mirror, d, x - 1, z - 1, rot).ok &&
          canPlaceBuilding(session.mirror, d, x + 1, z + 1, rot).ok;
        if (ok) return { x, z, tile: [tx, tz] as [number, number] };
      }
      return null;
    },
    /** The center of a tile where `def` fits with room to spare. */
    findDecorSpot: (def: string) => {
      const session = s();
      const d = content.decorById.get(def);
      if (!session || !d) return null;
      for (const [tx, tz] of nearbyTiles(session, 20)) {
        const fx = tx * TILE_FP + TILE_FP / 2;
        const fz = tz * TILE_FP + TILE_FP / 2;
        const ok = [
          [0, 0],
          [-60, -60],
          [60, 60],
          [-60, 60],
          [60, -60],
        ].every(([ox, oz]) => canPlaceDecor(session.mirror, d, fx + ox!, fz + oz!, 0).ok);
        if (ok) return { fx, fz, tile: [tx, tz] as [number, number] };
      }
      return null;
    },
    /** A straight east-west run of `len` paintable tiles, all on screen. */
    findRoadRun: (len: number) => {
      const session = s();
      if (!session) return null;
      for (const [tx, tz] of nearbyTiles(session, 18)) {
        const tiles: [number, number][] = [];
        for (let i = 0; i < len; i++) tiles.push([tx + i, tz]);
        const visible = tiles.every(([x, z]) => session.renderer?.screenOf(x, z));
        const clear = tiles.every(([x, z]) => !session.mirror.road(x, z) && !session.mirror.tree(x, z));
        if (visible && clear && canPaintRoad(session.mirror, 'path', tiles).ok) return tiles;
      }
      return null;
    },
    /** Runs a golden script in a fresh sim worker and resolves with the final state hash. */
    runGolden: async (script: GoldenScript) => {
      const host = new SimHost();
      try {
        const turns = [...script.turns];
        if ((turns[turns.length - 1]?.t ?? 0) < script.lastTurn) turns.push({ t: script.lastTurn, cmds: [] });
        await host.init({ kind: 'new', seed: script.seed, settings: script.settings }, turns);
        return (await host.hash()).h;
      } finally {
        host.terminate();
      }
    },
    /** Glides the camera to the start area at `distance`, for screenshots. */
    focusStart: (distance = 18, snap = false) => {
      const session = s();
      if (!session) return;
      const [x0, z0, x1, z1] = session.mirror.meta.startArea;
      session.renderer?.focus((x0 + x1) / 2, (z0 + z1) / 2, distance);
      // C3D-1: snap skips the glide, which crawls at SwiftShader frame rates.
      if (snap) session.renderer?.rig.snap();
    },
    /** Pins the lighting to an hour of the day (null follows the clock again). */
    setHour: (hour: number | null) => s()?.renderer?.setDebugHour(hour),
    // I1 (C3E): hamlet UI helpers for tests and screenshots.
    mode: () => s()?.mirror.settings.value.mode ?? null,
    town: () => s()?.mirror.town.value ?? null,
    budget: () => s()?.mirror.budget.value ?? null,
    residentIds: () => [...(s()?.mirror.residents.keys() ?? [])],
    buildingsOf: (def: string) =>
      [...(s()?.mirror.buildings.values() ?? [])].filter((b) => b.def === def).map((b) => b.id),
    select: (sel: Selection | null) => {
      const session = s();
      if (session) session.ui.selection.value = sel;
    },
    openPanel: (id: string | null) => {
      const session = s();
      if (session) session.ui.panel.value = id;
    },
    setLens: (lens: Lens) => {
      const session = s();
      if (session) session.ui.lens.value = lens;
    },
    customize: (id: number | null) => {
      const session = s();
      if (session) session.ui.customize.value = id;
    },
    // I2 (C4D): plans, requests, stories, letters and the Charter, for the co-op e2e.
    plans: () => [...(s()?.mirror.plans.values() ?? [])],
    requests: () => [...(s()?.mirror.requests.values() ?? [])],
    stories: () => [...(s()?.mirror.stories.values() ?? [])],
    storyLetters: () => s()?.mirror.letters.value ?? [],
    charter: () => s()?.mirror.charter.value ?? null,
    undo: () => s()?.undoLast(),
    undoSize: () => s()?.undo.size.value ?? 0,
    /** Shows the while-you-were-away letter built from the mocks (the real one needs a day away). */
    showMockLetter: async () => {
      const session = s();
      if (!session) return;
      const { mockAwayLetter } = await import('../ui/mocks/hamlet');
      session.ui.letter.value = { ...mockAwayLetter, seat: session.seat };
    },
    overlayMocks: async () => {
      const session = s();
      if (session) await overlayMocks(session);
    },
    /** I2 (C4F): the village mocks over the live village fixture; `charter` adds a board in progress. */
    villageMocks: async (opts?: { charter?: boolean }) => {
      const session = s();
      if (session) await overlayVillageMocks(session, opts);
    },
    /** I2 (C4F): opens a story letter (the latest from the mocks or the Mirror). */
    openLetter: (index = -1) => {
      const session = s();
      const letters = session?.mirror.letters.value ?? [];
      const l = letters.at(index);
      if (session && l) session.ui.storyLetter.value = l;
      return !!l;
    },
    /** I2 (C4F): the rank-up moment, as the sim's rank.up event would show it. */
    rankUp: (rank: RankId = 'village') => {
      const session = s();
      if (session) session.ui.rankUp.value = { rank, text: '' };
    },
    /** I2 (C4F): pulls a UI signal by name (tabs, focus) for screenshots and tests. */
    setUi: (name: string, value: unknown) => {
      const session = s();
      const sig = session?.ui[name as keyof Session['ui']] as { value: unknown } | undefined;
      if (sig && 'value' in sig) sig.value = value;
    },
    lots: () => [...(s()?.mirror.lots.values() ?? [])],
    zoneAt: (x: number, z: number) => s()?.mirror.layers.zone[z * MAP_SIZE + x] ?? 0,
    /** Interface size, 0.8 to 1.4, as the settings slider sets it. */
    setUiScale: (scale: number) => applySettings({ ...loadSettings(), uiScale: scale }),
    awayLetter: async () => (await s()?.inspect('away', s()!.seat)) ?? null,
    /** C3D: n synthetic residents wandering near the start area; returns false without a session. */
    synthResidents: (n: number, opts?: SyntheticOptions) => {
      const session = s();
      if (!session) return false;
      stopSynth?.();
      stopSynth = startSyntheticResidents(session.mirror, n, opts);
      return true;
    },
    /** C3D: plausible runtimes for every building (piles, crops, status), and some construction sites. */
    synthRuntime: (opts?: { sites?: number; status?: boolean }) => {
      const session = s();
      if (session) fakeRuntime(session.mirror, opts);
    },
    /**
     * C4E: dresses the village fixture as a grown village in this client's Mirror (never the sim):
     * village buildings, streets, carts, couples, babies and story characters. `dense` adds two
     * streets of homes for the 150-building budget scene. Returns what it placed.
     */
    villageShowcase: (dense = false) => {
      const session = s();
      if (!session) return null;
      const r = villageShowcase(session.mirror, { dense });
      return { buildings: r.buildings, carts: r.carts };
    },
    /** C4P: a hill of paths, lanes, a street and stairs in this client's Mirror, for road art review. */
    roadsShowcase: (x?: number, z?: number) => {
      const session = s();
      return session ? roadsShowcase(session.mirror, x, z) : null;
    },
    /** C3D: a made-up charm field for overlay screenshots (until the charm system runs). */
    synthCharm: () => {
      const session = s();
      if (session) fakeCharm(session.mirror);
    },
    /** C3D: the renderer, for render tests (overlays, bubbles, follow, stats). */
    renderer: () => s()?.renderer ?? null,
    /** C3D-1: jumps the camera (no glide) to look at a tile from `distance`, for screenshots. */
    look: (x: number, z: number, distance: number, turn = 0, tilt = 0) => {
      const r = s()?.renderer;
      r?.focus(x, z, distance);
      // Optional turn and tilt (radians, relative to the current view).
      r?.rig.rotateBy(turn, tilt);
      r?.rig.snap();
    },
    /**
     * C3D-1, look checks only: overwrites a rect of a map layer in this client's mirror (never the
     * sim), for art that has no sim behind it yet, such as fields and crops. `value` may be a
     * function of the tile.
     */
    paintLayer: (
      layer: string,
      x0: number,
      z0: number,
      x1: number,
      z1: number,
      value: number | ((x: number, z: number) => number),
    ) => {
      const m = s()?.mirror;
      if (!m) return;
      const w = x1 - x0 + 1;
      const name = layer as LayerName;
      const data =
        m.layers[name] instanceof Int32Array
          ? new Int32Array(w * (z1 - z0 + 1))
          : new Uint8Array(w * (z1 - z0 + 1));
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++)
          data[(z - z0) * w + (x - x0)] = typeof value === 'function' ? value(x, z) : value;
      m.apply({ t: m.lastTurn.value, events: [], patches: [{ layer: name, rect: [x0, z0, x1, z1], data }] });
    },
    /** C3D-1: the water tile nearest the start area center, or null. */
    /** C3D-1: whether a tile is water, and the start area rect, for screenshot scripts. */
    isWater: (x: number, z: number) => !!s()?.mirror.water(x, z),
    startArea: () => s()?.mirror.meta.startArea ?? null,
    nearestWater: () => {
      const m = s()?.mirror;
      if (!m) return null;
      const [x0, z0, x1, z1] = m.meta.startArea;
      const cx = Math.floor((x0 + x1) / 2);
      const cz = Math.floor((z0 + z1) / 2);
      for (let r = 1; r < m.size; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) === r && m.water(cx + dx, cz + dz)) {
              return [cx + dx, cz + dz] as [number, number];
            }
          }
        }
      }
      return null;
    },
  };
  (window as unknown as { __qoti: typeof hook }).__qoti = hook;
}
