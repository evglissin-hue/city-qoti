// Generates packages/sim/test/golden/i0-basic.json: a seed, settings and 2,000 turns of mixed
// commands (mostly valid, some deliberately not). Run with `npm run golden -w @qoti/sim`.
// The file is committed; regenerate it only when the script format changes. Determinism tests
// replay it and compare hashes, so it stays useful even after worldgen or rules change.
import { content } from '@qoti/content';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  applyTurn,
  canPlaceBuilding,
  canPlaceDecor,
  canPlantTree,
  type Command,
  createTickCtx,
  createWorld,
  defaultSettings,
  MAP_SIZE,
  type Rot4,
  type SeatedCommand,
  type SeatId,
  type Turn,
  worldIndex,
} from '../src/index';
import { rngFromSeed } from '../src/rng/streams';

const TURNS = 2000;
const seed = 'golden-i0';
const settings = defaultSettings();
const world = createWorld(seed, settings);
const ctx = createTickCtx(world);
const rng = rngFromSeed('golden-script');
const reader = worldIndex(world).reader;
const seq: number[] = [0, 0, 0, 0];
const [x0, z0, x1, z1] = world.meta.startArea;
const cx = (x0 + x1) >> 1;
const cz = (z0 + z1) >> 1;

const pick = <T>(list: readonly T[]): T => list[rng.int(list.length)]!;
const near = (spread: number): [number, number] => [
  Math.max(0, Math.min(MAP_SIZE - 1, cx + rng.range(-spread, spread))),
  Math.max(0, Math.min(MAP_SIZE - 1, cz + rng.range(-spread, spread))),
];

const NOTES = ['Bakery here?', 'Keep this meadow', 'Bridge one day', 'Lanterns along the lane', 'Orchard!'];
const BUILDINGS = content.buildings.map((b) => b.id);
const POINT_DECOR = content.decor.filter((d) => !d.linear).map((d) => d.id);
const LINEAR_DECOR = content.decor.filter((d) => d.linear).map((d) => d.id);

function roadCommand(): Command {
  const kind = rng.chance(0.6) ? 'path' : 'lane';
  const [sx, sz] = near(30);
  const len = rng.range(2, 12);
  const horizontal = rng.chance(0.5);
  const tiles: [number, number][] = [];
  for (let i = 0; i < len; i++) tiles.push(horizontal ? [sx + i, sz] : [sx, sz + i]);
  return { t: 'road.paint', kind, tiles };
}

function buildCommand(): Command {
  const def = pick(BUILDINGS);
  const rot = rng.int(4) as Rot4;
  // Usually look for a valid spot; sometimes take whatever comes, valid or not.
  const tries = rng.chance(0.8) ? 30 : 1;
  let spot = near(32);
  for (let i = 0; i < tries; i++) {
    if (canPlaceBuilding(reader, content.buildingById.get(def)!, spot[0], spot[1], rot).ok) break;
    spot = near(32);
  }
  return { t: 'build.place', def, x: spot[0], z: spot[1], rot };
}

function decorCommand(): Command {
  const def = pick(POINT_DECOR);
  const rot = rng.int(64);
  let fx = 0;
  let fz = 0;
  for (let i = 0; i < 20; i++) {
    const [tx, tz] = near(28);
    fx = tx * 256 + rng.int(256);
    fz = tz * 256 + rng.int(256);
    if (canPlaceDecor(reader, content.decorById.get(def)!, fx, fz, rot).ok) break;
  }
  return { t: 'decor.place', def, fx, fz, rot };
}

function runCommand(): Command {
  const [tx, tz] = near(28);
  const from: [number, number] = [tx * 256 + 128, tz * 256 + 128];
  const to: [number, number] = [from[0] + rng.range(-5, 5) * 256, from[1] + rng.range(-5, 5) * 256];
  return { t: 'decor.placeRun', def: pick(LINEAR_DECOR), from, to };
}

function treeCommand(): Command {
  let spot = near(30);
  for (let i = 0; i < 10 && !canPlantTree(reader, spot[0], spot[1]).ok; i++) spot = near(30);
  return { t: 'tree.plant', species: pick(['oak', 'birch', 'pine'] as const), x: spot[0], z: spot[1] };
}

function removeCommand(): Command | null {
  const roll = rng.int(5);
  if (roll === 0 && world.buildings.length) return { t: 'build.remove', ids: [pick(world.buildings).id] };
  if (roll === 1 && world.decor.length) return { t: 'decor.remove', ids: [pick(world.decor).id] };
  if (roll === 2 && world.notes.length) return { t: 'note.remove', id: pick(world.notes).id };
  if (roll === 3) {
    const [x, z] = near(30);
    return {
      t: 'tree.remove',
      tiles: [
        [x, z],
        [x + 1, z],
      ],
    };
  }
  const [x, z] = near(30);
  return reader.road(x, z) ? { t: 'road.remove', tiles: [[x, z]] } : null;
}

function invalidCommand(): Command {
  return pick<Command>([
    { t: 'build.place', def: 'castle', x: cx, z: cz, rot: 0 },
    { t: 'road.paint', kind: 'path', tiles: [[-3, 4]] },
    { t: 'decor.place', def: 'bench', fx: 1, fz: 1, rot: 99 },
    { t: 'note.pin', x: cx, z: cz, text: '' },
    { t: 'build.remove', ids: [999999] },
  ]);
}

function randomCommand(): Command | null {
  const roll = rng.float();
  if (roll < 0.22) return roadCommand();
  if (roll < 0.4) return buildCommand();
  if (roll < 0.58) return decorCommand();
  if (roll < 0.66) return runCommand();
  if (roll < 0.74) return treeCommand();
  if (roll < 0.8) {
    const [x, z] = near(30);
    return { t: 'note.pin', x, z, text: pick(NOTES) };
  }
  if (roll < 0.9) return removeCommand();
  if (roll < 0.95) return { t: 'time.setSpeed', speed: pick([1, 1, 2, 3, 3, 0] as const) };
  return invalidCommand();
}

/** Scripted moments: joins, a leave and rejoin, profiles, settings and a together-only stretch. */
function scripted(t: number): SeatedCommand[] {
  const sys = (cmd: Command, seat: SeatId): SeatedCommand => ({ seat, seq: 0, cmd });
  const out: SeatedCommand[] = [];
  if (t === 1) out.push(sys({ t: 'sys.seatJoined', seat: 0 }, 0));
  if (t === 4) out.push(sys({ t: 'sys.seatJoined', seat: 1 }, 1));
  if (t === 6) out.push(mine(0, { t: 'seat.setProfile', name: 'Ada', color: 0xd9822b, lens: 'hearth' }));
  if (t === 7) out.push(mine(1, { t: 'seat.setProfile', name: 'Bo', color: 0x2b8fd9, lens: 'ledger' }));
  if (t === 900) out.push(mine(0, { t: 'valley.setSettings', settings: { townName: 'Golden Hollow' } }));
  if (t === 1200) out.push(sys({ t: 'sys.seatLeft', seat: 1 }, 1));
  if (t === 1210) out.push(mine(0, { t: 'valley.setSettings', settings: { togetherOnly: true } }));
  if (t === 1300) out.push(sys({ t: 'sys.seatJoined', seat: 1 }, 1));
  if (t === 1320) out.push(mine(1, { t: 'valley.setSettings', settings: { togetherOnly: false } }));
  return out;
}

function mine(seat: SeatId, cmd: Command): SeatedCommand {
  seq[seat] = (seq[seat] ?? 0) + 1;
  return { seat, seq: seq[seat]!, cmd };
}

const turns: Turn[] = [];
let accepted = 0;
let rejected = 0;
for (let t = 1; t <= TURNS; t++) {
  const cmds = scripted(t);
  if (t > 8 && rng.chance(0.3)) {
    const count = rng.chance(0.25) ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const seat: SeatId = t >= 1200 && t < 1300 ? 0 : rng.chance(0.5) ? 0 : 1;
      const cmd = randomCommand();
      if (cmd) cmds.push(mine(seat, cmd));
    }
  }
  const turn: Turn = { t, cmds };
  applyTurn(world, turn, ctx);
  for (const e of ctx.events) {
    if (e.e === 'command.rejected') rejected++;
  }
  accepted += cmds.length;
  ctx.events.length = 0;
  ctx.dirty.clear();
  if (cmds.length) turns.push(turn);
}

const out = fileURLToPath(new URL('../test/golden/i0-basic.json', import.meta.url));
writeFileSync(out, JSON.stringify({ seed, settings, lastTurn: TURNS, turns }) + '\n');
console.log(
  `Wrote ${turns.length} non-empty turns, ${accepted} commands (${rejected} rejected); ` +
    `final tick ${world.tick}, ${world.buildings.length} buildings, ${world.decor.length} decor.`,
);
