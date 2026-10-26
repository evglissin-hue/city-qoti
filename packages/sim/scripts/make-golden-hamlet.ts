// Generates packages/sim/test/golden/i1-hamlet.json: a standard valley played for two and a half
// in-game days by two seats at 3x, with the kind of things players do in a hamlet: paths, benches,
// flowers and lanterns by the well, new building sites, a tree, a note, and one cottage pulled
// down on the second day (so a family has to move or leave). Run with
// `npx tsx packages/sim/scripts/make-golden-hamlet.ts`. The file is committed; determinism tests
// replay it twice in Node and once in a browser worker and compare hashes.
import { content } from '@qoti/content';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  applyTurn,
  canPaintRoad,
  canPlaceBuilding,
  canPlaceDecor,
  canPlantTree,
  type Command,
  createTickCtx,
  createWorld,
  defaultSettings,
  type Rot4,
  type SeatId,
  type Turn,
  TICKS_PER_DAY,
  worldIndex,
} from '../src/index';
import { rngFromSeed } from '../src/rng/streams';

const seed = 'golden-i1';
const settings = { ...defaultSettings(), mode: 'standard' as const, townName: 'Puddleby' };
const world = createWorld(seed, settings);
const ctx = createTickCtx(world);
const rng = rngFromSeed('golden-hamlet-script');
const reader = worldIndex(world).reader;
const turns: Turn[] = [];
const seq = [0, 0];
const SPEED = 3;
const LAST_TURN = Math.ceil((2.5 * TICKS_PER_DAY) / SPEED) + 10;

function play(cmds: [SeatId, Command][]): void {
  const turn: Turn = {
    t: world.lastTurn + 1,
    cmds: cmds.map(([seat, cmd]) => ({ seat, seq: ++seq[seat]!, cmd })),
  };
  if (turn.cmds.length) turns.push(turn);
  applyTurn(world, turn, ctx);
  ctx.events.length = 0;
  ctx.dirty.clear();
}

function idleUntil(t: number): void {
  while (world.lastTurn < t) play([]);
}

const well = world.buildings.find((b) => b.def === 'well')!;
const hall = world.buildings.find((b) => b.def === 'town-hall')!;

/** A valid decor spot near a tile, or null. */
function decorNear(def: string, x: number, z: number, spread: number): Command | null {
  const d = content.decorById.get(def)!;
  for (let i = 0; i < 40; i++) {
    const fx = (x + rng.range(-spread, spread)) * 256 + rng.range(32, 224);
    const fz = (z + rng.range(-spread, spread)) * 256 + rng.range(32, 224);
    const rot = rng.int(64);
    if (canPlaceDecor(reader, d, fx, fz, rot).ok) return { t: 'decor.place', def, fx, fz, rot };
  }
  return null;
}

/** A valid building spot near a tile whose entrance faces a road, or null. */
function buildingNear(def: string, x: number, z: number): Command | null {
  const d = content.buildingById.get(def)!;
  for (let r = 2; r < 16; r++) {
    for (let k = 0; k < 24; k++) {
      const bx = x + rng.range(-r, r);
      const bz = z + rng.range(-r, r);
      const rot = rng.int(4) as Rot4;
      if (canPlaceBuilding(reader, d, bx, bz, rot).ok) return { t: 'build.place', def, x: bx, z: bz, rot };
    }
  }
  return null;
}

// Turn 1: both seats arrive and ask for 3x.
play([
  [0, { t: 'sys.seatJoined', seat: 0 }],
  [1, { t: 'sys.seatJoined', seat: 1 }],
]);
play([
  [0, { t: 'time.setSpeed', speed: SPEED }],
  [1, { t: 'time.setSpeed', speed: SPEED }],
]);

// Morning of day one: a path from the well toward the town hall, benches and flowers by the well.
idleUntil(60);
paint: for (const dz of [2, -2, 3, -3, 4, -4, 1, -1]) {
  for (const dir of [1, -1]) {
    const path: [number, number][] = [];
    for (let i = 1; i <= 6; i++) path.push([well.x + dir * i, well.z + dz]);
    if (canPaintRoad(reader, 'path', path).ok) {
      play([[0, { t: 'road.paint', kind: 'path', tiles: path }]]);
      break paint;
    }
  }
}
idleUntil(90);
const cozy: [SeatId, Command][] = [];
for (const [seat, def] of [
  [1, 'bench'],
  [1, 'bench'],
  [0, 'flower-bed'],
  [0, 'planter'],
  [1, 'lantern'],
] as const) {
  const c = decorNear(def, well.x, well.z, 3);
  if (c) cozy.push([seat, c]);
}
play(cozy);

// Midday: a market stall and a cottage site near the town hall, a tree and a note.
idleUntil(250);
const stall = buildingNear('market-stall', hall.x, hall.z);
const cottage = buildingNear('cottage', hall.x + 4, hall.z + 4);
play([
  ...(stall ? ([[0, stall]] as [SeatId, Command][]) : []),
  ...(cottage ? ([[1, cottage]] as [SeatId, Command][]) : []),
]);
idleUntil(320);
for (let i = 0; i < 20; i++) {
  const x = well.x + rng.range(-5, 5);
  const z = well.z + rng.range(-5, 5);
  if (canPlantTree(reader, x, z).ok) {
    play([[1, { t: 'tree.plant', species: 'oak', x, z }]]);
    break;
  }
}
play([[0, { t: 'note.pin', x: well.x, z: well.z + 1, text: 'Bakery here, one day' }]]);

// Evening: more lanterns along the new path.
idleUntil(1000);
const lanterns: [SeatId, Command][] = [];
for (let i = 0; i < 3; i++) {
  const c = decorNear('lantern', well.x + 2 + 2 * i, well.z + 3, 1);
  if (c) lanterns.push([1, c]);
}
play(lanterns);

// Day two, mid-morning: one of the starting cottages comes down; somebody has to cope.
idleUntil(Math.round((1.2 * TICKS_PER_DAY) / SPEED));
const home = world.buildings.find((b) => b.def === 'cottage' && b.stage === 'built');
if (home) play([[0, { t: 'build.remove', ids: [home.id] }]]);
idleUntil(Math.round((1.4 * TICKS_PER_DAY) / SPEED));
const bench = world.decor.find((d) => d.def === 'bench');
if (bench) play([[1, { t: 'decor.remove', ids: [bench.id] }]]);
idleUntil(LAST_TURN);

const out = fileURLToPath(new URL('../test/golden/i1-hamlet.json', import.meta.url));
writeFileSync(out, JSON.stringify({ seed, settings, lastTurn: LAST_TURN, turns }) + '\n');
console.log(
  `wrote ${out}: ${turns.length} turns with commands, last turn ${LAST_TURN}, ` +
    `${world.residents.length} residents, ${world.households.length} households`,
);
