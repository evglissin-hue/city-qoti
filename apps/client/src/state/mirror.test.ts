import { content } from '@qoti/content';
import {
  applyTurn,
  buildView,
  canPaintRoad,
  canPlaceBuilding,
  canPlaceDecor,
  canPlantTree,
  createTickCtx,
  createWorld,
  defaultSettings,
  LAYER_NAMES,
  rngFromSeed,
  type Command,
  type Rot4,
  type Turn,
  type WorldState,
  worldIndex,
} from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { Mirror } from './mirror';

/** A world plus a mirror that follows it exactly the way the client does. */
function pair(seed: string) {
  const world = createWorld(seed, defaultSettings());
  const ctx = createTickCtx(world);
  const mirror = new Mirror();
  mirror.load(buildView(world));
  const play = (cmds: Command[], seat: 0 | 1 = 0) => {
    const turn: Turn = { t: world.lastTurn + 1, cmds: cmds.map((cmd, i) => ({ seat, seq: i + 1, cmd })) };
    applyTurn(world, turn, ctx);
    const patches = ctx.dirty.collectPatches(world.map);
    const update = { t: world.lastTurn, tick: world.tick, events: ctx.events, patches };
    ctx.events = [];
    return mirror.apply(update);
  };
  play([{ t: 'sys.seatJoined', seat: 0 }]);
  return { world, mirror, play };
}

function startCenter(world: WorldState): [number, number] {
  const [x0, z0, x1, z1] = world.meta.startArea;
  return [Math.floor((x0 + x1) / 2), Math.floor((z0 + z1) / 2)];
}

/** Places a mix of pieces around the start area with the sim's own rules. */
function furnish(world: WorldState, play: (cmds: Command[]) => unknown, seed: string) {
  const rng = rngFromSeed(seed);
  const [cx, cz] = startCenter(world);
  const reader = worldIndex(world).reader;
  for (let i = 0; i < 300; i++) {
    const x = cx + rng.range(-20, 20);
    const z = cz + rng.range(-20, 20);
    const roll = rng.int(4);
    if (roll === 0) {
      const def = content.buildings[rng.int(content.buildings.length)]!;
      const rot = rng.int(4) as Rot4;
      if (canPlaceBuilding(reader, def, x, z, rot).ok) play([{ t: 'build.place', def: def.id, x, z, rot }]);
    } else if (roll === 1) {
      const def = content.decor[rng.int(content.decor.length)]!;
      const fx = x * 256 + rng.int(256);
      const fz = z * 256 + rng.int(256);
      if (canPlaceDecor(reader, def, fx, fz, 0).ok) play([{ t: 'decor.place', def: def.id, fx, fz, rot: 0 }]);
    } else if (roll === 2) {
      const tiles: [number, number][] = [
        [x, z],
        [x + 1, z],
        [x + 2, z],
      ];
      if (canPaintRoad(reader, 'path', tiles).ok) play([{ t: 'road.paint', kind: 'path', tiles }]);
    } else if (canPlantTree(reader, x, z).ok) {
      play([{ t: 'tree.plant', species: 'birch', x, z }]);
    }
  }
}

describe('Mirror', () => {
  it('loads a view and stays equal to the sim through patches and events', () => {
    const { world, mirror, play } = pair('mirror-follow');
    furnish(world, play, 'mirror-follow');
    for (const name of LAYER_NAMES) expect(mirror.layers[name], name).toEqual(world.map[name]);
    expect([...mirror.buildings.keys()]).toEqual(world.buildings.map((b) => b.id));
    expect([...mirror.decor.keys()]).toEqual(world.decor.map((d) => d.id));
    expect(world.buildings.length).toBeGreaterThan(3);
    expect(mirror.lastTurn.value).toBe(world.lastTurn);
    expect(mirror.tick.value).toBe(world.tick);
    expect(mirror.seats.value.map((s) => s.seat)).toEqual([0]);
  });

  it('removes entities and reports what changed', () => {
    const { world, mirror, play } = pair('mirror-remove');
    furnish(world, play, 'mirror-remove');
    const b = world.buildings[0]!;
    const d = world.decor[0]!;
    const change = play([
      { t: 'build.remove', ids: [b.id] },
      { t: 'decor.remove', ids: [d.id] },
    ]);
    expect(change.buildings && change.decor).toBe(true);
    expect(mirror.buildings.has(b.id)).toBe(false);
    expect(mirror.decor.has(d.id)).toBe(false);
    expect(mirror.decorNear(d.fx, d.fz, 4).some((x) => x.id === d.id)).toBe(false);
    for (const name of LAYER_NAMES) expect(mirror.layers[name], name).toEqual(world.map[name]);
  });

  it('collects rejections for the issuing seat', () => {
    const { mirror, play } = pair('mirror-reject');
    const change = play([{ t: 'build.place', def: 'cottage', x: -5, z: 0, rot: 0 }]);
    expect(change.rejections).toEqual([{ seat: 0, seq: 1, reason: 'OUT_OF_BOUNDS' }]);
    expect(mirror.buildings.size).toBe(0);
  });
});

describe('ghost validity', () => {
  // Property: for any candidate placement, the rules on the Mirror agree with the sim's command
  // validation on its own state, reason code included.
  it('equals sim validation for random placements', () => {
    const { world, mirror, play } = pair('ghost-property');
    furnish(world, play, 'ghost-property');
    const reader = worldIndex(world).reader;
    const rng = rngFromSeed('ghost-candidates');
    const [cx, cz] = startCenter(world);
    let valid = 0;
    for (let i = 0; i < 3000; i++) {
      const x = cx + rng.range(-30, 30);
      const z = cz + rng.range(-30, 30);
      const kind = rng.int(4);
      if (kind === 0) {
        const def = content.buildings[rng.int(content.buildings.length)]!;
        const rot = rng.int(4) as Rot4;
        const m = canPlaceBuilding(mirror, def, x, z, rot);
        const s = canPlaceBuilding(reader, def, x, z, rot);
        expect(m).toEqual(s);
        if (s.ok) valid++;
      } else if (kind === 1) {
        const def = content.decor[rng.int(content.decor.length)]!;
        const fx = x * 256 + rng.int(256);
        const fz = z * 256 + rng.int(256);
        const rot = rng.int(64);
        expect(canPlaceDecor(mirror, def, fx, fz, rot)).toEqual(canPlaceDecor(reader, def, fx, fz, rot));
      } else if (kind === 2) {
        const len = rng.range(1, 6);
        const tiles: [number, number][] = Array.from({ length: len }, (_, k) => [x + k, z]);
        expect(canPaintRoad(mirror, 'lane', tiles)).toEqual(canPaintRoad(reader, 'lane', tiles));
      } else {
        expect(canPlantTree(mirror, x, z)).toEqual(canPlantTree(reader, x, z));
      }
    }
    expect(valid).toBeGreaterThan(20);
  });
});
