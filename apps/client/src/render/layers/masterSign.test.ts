// @vitest-environment happy-dom
// R3X: the master's sign sits right on every facade it can hang on (docs/build/r3-wave-notes.md): every
// business trade at three levels and every specialized building that has a master, on a roomy lot and
// on one squeezed to its footprint, in all four turns. A wall sign touches flat wall at its plate with
// nothing in its way and stays off the windows and the door; a sign on a post stands on the ground,
// off the door's path and near the door.
import { describe, expect, it } from 'vitest';
import {
  anchorsFor,
  artKitId,
  boundsOf,
  doorCorridor,
  FACADE_CELLS_X,
  FACADE_CELLS_Y,
  FACADE_PROUD,
  FACADE_SUB,
  FACADE_TOUCH,
  facadeOf,
  footprintOf,
  kitById,
  SIGN_SIZE,
  WALL_BEHIND_DOOR,
  WINDOW_CLEAR,
  type Placement,
} from '@qoti/art';
import { content } from '@qoti/content';
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '@qoti/sim';
import type { BuildingView } from '@qoti/sim';
import { MeshBasicMaterial, PerspectiveCamera, Scene } from 'three';
import type { Mirror } from '../../state/mirror';
import { drawDef } from '../defs';
import { createWorldEnv } from '../env';
import { buildingParams, buildingVariantGeometry } from '../kitGeometry';
import { dressingLayer, dressingSubject } from './dressing';
import type { LayerContext } from './types';

interface Facade {
  label: string;
  b: BuildingView;
}

function mirrorFor(b: BuildingView, squeezed: boolean): Mirror {
  const tick = 100 * TICKS_PER_DAY - START_HOUR * TICKS_PER_HOUR + 10;
  const [sw, sd] = drawDef(b.def)!.size;
  const lot = squeezed
    ? { id: b.lot, x: b.x, z: b.z, w: sw, d: sd, buildingId: b.id }
    : { id: b.lot, x: b.x - 1, z: b.z - 2, w: sw + 2, d: sd + 3, buildingId: b.id };
  return {
    buildings: new Map([[b.id, b]]),
    households: new Map(),
    residents: new Map(),
    lots: new Map([[b.lot!, lot as never]]),
    clock: { value: { season: 1 } },
    tick: { value: tick },
    height: () => 0,
    water: () => 0,
    occupant: squeezed
      ? (x: number, z: number) => (x < b.x || x >= b.x + sw || z < b.z || z >= b.z + sd ? 1 : 0)
      : () => 0,
    road: () => 0,
    tree: () => 0,
  } as unknown as Mirror;
}

function layerFor(mirror: Mirror) {
  const layer = dressingLayer();
  const camera = new PerspectiveCamera(60, 1.6, 0.5, 500);
  camera.position.set(11, 6, 15);
  camera.lookAt(11, 0, 11);
  camera.updateMatrixWorld();
  const env = createWorldEnv(camera);
  env.dressing = 'all';
  env.focus.set(11, 0, 11);
  env.shown.hour = 12;
  layer.init({
    env,
    mirror,
    scene: new Scene(),
    camera,
    material: new MeshBasicMaterial(),
    invalidate: () => {},
  } as unknown as LayerContext);
  return layer;
}

/** Every business trade at three levels and every specialized building that has a master. */
function facades(rot: 0 | 1 | 2 | 3 = 0): Facade[] {
  const out: Facade[] = [];
  for (const m of content.masters) {
    const trade = content.tradeById.get(m.of);
    for (const level of [1, 2, 3]) {
      const b = {
        id: 1,
        def: trade ? trade.building : m.of,
        x: 10,
        z: 10,
        rot,
        stage: 'built',
        lot: 1,
        master: true,
        level,
        ...(trade ? { trade: trade.id } : {}),
      } as unknown as BuildingView;
      out.push({ label: `${m.of} L${level} rot ${rot}`, b });
    }
  }
  return out;
}

function signOf(b: BuildingView, squeezed: boolean): { sign: Placement | undefined; count: number } {
  const layer = layerFor(mirrorFor(b, squeezed));
  layer.frame?.(0.016);
  const all = layer.placementsOf(b.id).filter((p) => p.rule === 'master-sign');
  return { sign: all[0], count: all.length };
}

describe('the master sign rule (R3X)', () => {
  it('is in the shipped table once, keyed to the master and kept on Low', () => {
    const rules = content.dressingRules.filter((r) => r.piece.kit === 'master-sign');
    expect(rules.map((r) => r.id)).toEqual(['master-sign']);
    expect(rules[0]!.who.master).toBe(true);
    expect(rules[0]!.low).toBe(true);
  });

  it('reads BuildingView.master into the dressing subject', () => {
    const b = facades()[0]!.b;
    const mirror = mirrorFor(b, false);
    expect(dressingSubject(mirror, b).master).toBe(true);
    expect(dressingSubject(mirror, { ...b, master: undefined } as BuildingView).master).toBeUndefined();
  });

  it('hangs while a master works there and goes when they leave, through the same layer', () => {
    const b = facades()[1]!.b;
    const mirror = mirrorFor(b, false);
    const layer = layerFor(mirror);
    layer.frame?.(0.016);
    expect(layer.placementsOf(b.id).some((p) => p.rule === 'master-sign')).toBe(true);
    (mirror.buildings as Map<number, BuildingView>).set(b.id, { ...b, master: undefined } as BuildingView);
    layer.update?.({ full: false, buildings: true, rects: new Map() } as never);
    layer.frame?.(0.016);
    expect(layer.placementsOf(b.id).some((p) => p.rule === 'master-sign')).toBe(false);
    (mirror.buildings as Map<number, BuildingView>).set(b.id, b);
    layer.update?.({ full: false, buildings: true, rects: new Map() } as never);
    layer.frame?.(0.016);
    expect(layer.placementsOf(b.id).some((p) => p.rule === 'master-sign')).toBe(true);
  });
});

describe('the master sign on every facade (R3X)', () => {
  // Windows are where the kit's lights are, on the street face, at the building's level.
  function litWindows(b: BuildingView): [number, number][] {
    const def = drawDef(b.def)!;
    const trade = b.trade ? content.tradeById.get(b.trade) : undefined;
    const kit = kitById.get(artKitId(trade ? trade.look : def.art))!;
    const lights = kit.anchors?.({
      size: def.size,
      entrance: def.entrance,
      params: buildingParams(b),
    })?.lights;
    return (lights ?? []).filter((l) => l[2] > def.size[1] - 0.5).map((l) => [l[0], l[1]]);
  }

  for (const rot of [0, 1, 2, 3] as const) {
    it(`gives every master a sign that sits right (turn ${rot})`, { timeout: 120000 }, () => {
      for (const { label, b } of facades(rot)) {
        for (const squeezed of [false, true]) {
          const at = `${label}${squeezed ? ' squeezed' : ''}`;
          const { sign, count } = signOf(b, squeezed);
          expect(count, at).toBe(1);
          const p = sign!;
          expect(p.params?.emblem, at).toBe(b.trade ?? b.def);
          const def = drawDef(b.def)!;
          const trade = b.trade ? content.tradeById.get(b.trade) : undefined;
          const art = trade ? trade.look : def.art;
          const door = anchorsFor(kitById.get(artKitId(art))!, {
            size: def.size,
            entrance: def.entrance,
            ...(art.params ? { params: art.params } : {}),
          }).door!;
          if (p.params?.post === true) {
            // On a post: on the ground, off the door's path, near the door.
            const bounds = boundsOf(
              kitById.get('master-sign')!.build({ seed: p.seed % 4, params: { ...p.params } }),
            );
            expect(p.at[1], at).toBe(0);
            const f = footprintOf(p, bounds);
            const lane = doorCorridor(door, [-1, -1, def.size[0] + 1, def.size[1] + 1]);
            const blocks = f[0] < lane[2] && f[2] > lane[0] && f[1] < lane[3] && f[3] > lane[1];
            expect(blocks, `${at} blocks the door`).toBe(false);
            expect(Math.abs(p.at[0] - door.at[0]), `${at} near the door`).toBeLessThan(1.6);
            expect(Math.abs(p.at[2] - door.at[2]), `${at} near the door`).toBeLessThan(1.3);
            continue;
          }
          // On the wall: re-measure the facade the buildings layer draws and check the spot against it.
          const g = buildingVariantGeometry(b, 'high');
          const f = facadeOf(g, def.size[0]);
          g.dispose();
          const x = p.at[0];
          const wallZ = p.at[2] + 0.002;
          const ix = Math.round(x * FACADE_CELLS_X - 0.5);
          const iy = Math.round(p.at[1] * FACADE_CELLS_Y);
          // Touching: the plate's patch of wall is flat and at the sign's depth.
          const sx = f.nx * FACADE_SUB;
          const cj = (iy + Math.floor(SIGN_SIZE.armY * FACADE_CELLS_Y)) * FACADE_SUB + 1;
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++)
              expect(
                Math.abs(f.buf[(cj + dj) * sx + ix * FACADE_SUB + 1 + di]! - wallZ),
                `${at} plate`,
              ).toBeLessThanOrEqual(FACADE_TOUCH + 1e-6);
          // Never floating, never in the way: nothing in front of the wall under the board and rail.
          const half = Math.ceil(SIGN_SIZE.halfW * FACADE_CELLS_X);
          for (let jy = iy; jy < iy + Math.ceil(SIGN_SIZE.h * FACADE_CELLS_Y); jy++)
            for (let jx = ix - half; jx <= ix + half; jx++) {
              const hi = f.zMax[jy * f.nx + jx]!;
              if (!Number.isNaN(hi))
                expect(hi, `${at} column`).toBeLessThanOrEqual(wallZ + FACADE_PROUD + 1e-6);
            }
          // Not blocking the door: clear of its opening, or above it.
          if (p.at[1] < 1.05)
            expect(Math.abs(x - door.at[0]), `${at} door`).toBeGreaterThanOrEqual(
              0.34 + SIGN_SIZE.halfW - 1e-6,
            );
          // Not over a window: clear of every lit pane on the street face.
          for (const [lx, ly] of litWindows(b)) {
            const clearX = Math.abs(lx - x) >= WINDOW_CLEAR.x - 1e-6;
            const clearY = Math.abs(ly - (p.at[1] + SIGN_SIZE.h / 2)) >= WINDOW_CLEAR.y - 1e-6;
            expect(clearX || clearY, `${at} window at ${lx.toFixed(2)},${ly.toFixed(2)}`).toBe(true);
          }
          // At its own door: on the same front as the door anchor (not a side bay), near it.
          expect(Math.abs(x - door.at[0]), `${at} near the door`).toBeLessThan(1.7);
          expect(Math.abs(wallZ - door.at[2]), `${at} on the front`).toBeLessThanOrEqual(
            WALL_BEHIND_DOOR + 1e-6,
          );
        }
      }
    });
  }

  it('is the same between runs', () => {
    for (const { b } of facades().slice(0, 6)) {
      expect(signOf(b, false).sign).toEqual(signOf(b, false).sign);
    }
  });
});
