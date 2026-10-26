import { content } from '@qoti/content';
import {
  canPaintRoad,
  canPlaceBuilding,
  canPlaceDecor,
  footprintSize,
  TILE_FP,
  type Command,
  type LayerName,
  type Rot4,
  type Turn,
  type ValleySettings,
} from '@qoti/sim';
import { SimHost } from '../worker/host';
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
    /** C3D-1: jumps the camera (no glide) to look at a tile from `distance`, for screenshots. */
    look: (x: number, z: number, distance: number) => {
      const r = s()?.renderer;
      r?.focus(x, z, distance);
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
