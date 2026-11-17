// R2F before and after: lays a small street grid beside the grown village by command, zones it
// (Townhouses both sides, a parade of Shops on the high street), stocks the storehouses and runs the
// full sim day by day, then writes the result as a valley file the client can load. Run from the repo
// root with the same seed and commands on each branch:
//   npx tsx apps/client/e2e/r2f-street-grow.ts <out.qoti> [days=20]
// Env: QOTI_FIXTURE (the grown village to start from; default the one beside this checkout),
//      QOTI_MIN_GROWN (stop early once this share of street lots has a building; default 0.9).
// Prints the street block's center tile ("CENTER x z"), a per-day table and the counts as JSON.
import { readFileSync, writeFileSync } from 'node:fs';
import { content } from '@qoti/content';
import {
  advanceTo,
  createTickCtx,
  deserialize,
  executeCommand,
  growthDemand,
  MAP_SIZE,
  serialize,
  TICKS_PER_DAY,
  worldIndex,
} from '@qoti/sim';
import type { Command, WorldState } from '@qoti/sim';
import { storehouseReach, within } from '../../../packages/sim/src/systems/logistics/range';

const S = MAP_SIZE;

const out = process.argv[2];
const days = Number(process.argv[3] ?? 20);
if (!out) throw new Error('usage: r2f-street-grow.ts <out.qoti> [days]');
const fixture = process.env.QOTI_FIXTURE ?? 'apps/client/src/app/fixtures/grown.qoti';
const stopShare = Number(process.env.QOTI_MIN_GROWN ?? 0.9);

const state: WorldState = deserialize(new Uint8Array(readFileSync(fixture)));
state.time.connected = [0, 1];
const ctx = createTickCtx(state);
const m = state.map;
const reader = worldIndex(state).reader;

// --- layout (relative to the grid's west end A and the high street's row Z) --------------------
const W = 18; // roads run x = A .. A + W
const HIGH = 0; // high street at z = Z
const BACK = 9; // back street at z = Z + 9
const MID = 9; // a cross street at x = A + 9 (and one at each end)
const Z_MIN = -4; // shops band is Z-3 .. Z-1 (one spare row)
const Z_MAX = 13; // townhouses south of the back street are Z+10 .. Z+12

function bad(x: number, z: number): boolean {
  const i = z * S + x;
  if (x < 2 || z < 2 || x >= S - 2 || z >= S - 2) return true;
  if (!reader.parcelUnlocked(x, z)) return true;
  if (m.water[i] || m.occupant[i] || m.road[i] || m.zone[i] || m.fieldOwner[i] || m.lot[i]) return true;
  if (m.terrain[i] === 4 || m.terrain[i] === 5 || m.terrain[i] === 6 || m.terrain[i] === 7) return true;
  return false;
}

// Nearest existing road tile (Manhattan) from every tile, by a multi-source BFS over open land.
const roadDist = new Int16Array(S * S).fill(-1);
{
  const q: number[] = [];
  for (let i = 0; i < S * S; i++)
    if (m.road[i]) {
      roadDist[i] = 0;
      q.push(i);
    }
  for (let h = 0; h < q.length; h++) {
    const i = q[h]!;
    const x = i % S;
    const z = (i - x) / S;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
      const j = nz * S + nx;
      if (roadDist[j]! >= 0) continue;
      roadDist[j] = (roadDist[i] as number) + 1;
      q.push(j);
    }
  }
}

// Staffed storehouses (porters at work): the whole grid must lie in the range of one of them.
const reaches = storehouseReach(state).filter((r) => r.porters > 0);
const inReach = (x: number, z: number) => reaches.some((r) => within(r, z * S + x));

console.log(
  'REACH',
  reaches.map((r) => [r.door % S, Math.floor(r.door / S), r.radius, r.porters]).join(' | '),
);
interface Site {
  A: number;
  Z: number;
  score: number;
}
let best: Site | null = null;
let cOpen = 0;
let cFlat = 0;
let dMin = 999;
let dAt = [0, 0];
for (let Z = 6; Z < S - Z_MAX - 2; Z++) {
  for (let A = 6; A < S - W - 4; A++) {
    // Cheap pre-check on the corners, then the full rectangle.
    let ok = true;
    let hMin = 99;
    let hMax = -1;
    let trees = 0;
    for (let z = Z + Z_MIN - 1; z <= Z + Z_MAX && ok; z++) {
      for (let x = A - 1; x <= A + W + 1; x++) {
        if (bad(x, z)) {
          ok = false;
          break;
        }
        const h = m.height[z * S + x]!;
        if (h < hMin) hMin = h;
        if (h > hMax) hMax = h;
        if (m.tree[z * S + x]) trees++;
      }
    }
    if (ok) cOpen++;
    if (!ok || hMax - hMin > 1) continue;
    cFlat++;
    {
      const d = Math.min(
        ...reaches.map((r) => Math.abs((r.door % S) - (A + 9)) + Math.abs(Math.floor(r.door / S) - (Z + 5))),
      );
      if (d < dMin) {
        dMin = d;
        dAt = [A, Z];
      }
    }
    const pts = [A - 1, A + W / 2, A + W + 1].filter((x) =>
      [Z - 4, Z + 5, Z + 13].some((z) => inReach(x, z)),
    ).length;
    if (pts < 1) continue;
    // Near the town: the grid's west and east ends and its middle, by road distance.
    const near = Math.min(
      roadDist[(Z + 5) * S + A - 2] ?? 999,
      roadDist[(Z + 5) * S + A + W + 2] ?? 999,
      roadDist[(Z - 5) * S + A + 9] ?? 999,
      roadDist[(Z + 14) * S + A + 9] ?? 999,
    );
    const score = (3 - pts) * 100 + near * 10 + trees + (hMax - hMin) * 20;
    if (!best || score < best.score) best = { A, Z, score };
  }
}
if (!best) console.log('open', cOpen, 'flat', cFlat, 'nearest', dMin, dAt);
if (!best) throw new Error('no open flat ground found for the street grid');
const { A, Z } = best;
console.log('BEST', JSON.stringify(best));

// --- commands ---------------------------------------------------------------------------------
let seq = 1;
function run(cmd: Command): void {
  const before = ctx.events.length;
  if (!executeCommand(state, { seat: 0, seq: seq++, cmd }, ctx)) {
    const rej = ctx.events.slice(before).filter((e) => e.e === 'command.rejected');
    throw new Error(`command rejected: ${JSON.stringify(cmd).slice(0, 160)} ${JSON.stringify(rej)}`);
  }
}

// Money and the unlock, if the commands would refuse for them.
if (!state.hearth.unlocked.includes('street')) state.hearth.unlocked.push('street');
state.economy.treasury += 5_000_000;
state.economy.external += 5_000_000;

// Builders are never the limit: timber, stone and brick in every storehouse.
const goodIdx = ['timber', 'stone', 'brick', 'firewood'].map((g) => content.goodIndex.get(g)!);
for (const b of state.buildings) {
  const def = content.buildingById.get(b.def);
  if (def?.id === 'storehouse' && b.rt) for (const g of goodIdx) b.rt.store[g] = 600;
}

function line(x0: number, z0: number, x1: number, z1: number): [number, number][] {
  const t: [number, number][] = [];
  if (z0 === z1) for (let x = x0; x <= x1; x++) t.push([x, z0]);
  else for (let z = z0; z <= z1; z++) t.push([x0, z]);
  return t;
}
const gx = (dx: number) => A + dx;
const gz = (dz: number) => Z + dz;

// A lane from the grid to the nearest road of the town, found by a walk over open land.
function connector(): [number, number][] {
  const starts = [
    [gx(0), gz(4)],
    [gx(W), gz(4)],
    [gx(MID), gz(-1)],
  ] as const;
  let bestPath: [number, number][] | null = null;
  for (const [sx, sz] of starts) {
    const prev = new Map<number, number>();
    const q: number[] = [sz * S + sx];
    prev.set(q[0]!, -1);
    let end = -1;
    for (let h = 0; h < q.length && end < 0; h++) {
      const i = q[h]!;
      const x = i % S;
      const z = (i - x) / S;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 2 || nz < 2 || nx >= S - 2 || nz >= S - 2) continue;
        const j = nz * S + nx;
        if (prev.has(j)) continue;
        if (Math.abs(m.height[j]! - m.height[i]!) >= 2) continue;
        if (m.road[j]) {
          prev.set(j, i);
          end = j;
          break;
        }
        if (bad(nx, nz)) continue;
        // Keep out of the street grid's own zone bands.
        if (nx >= A - 1 && nx <= A + W + 1 && nz >= Z + Z_MIN - 1 && nz <= Z + Z_MAX) {
          if (
            !(nx === sx && nz === sz) &&
            !(nz >= Z - 1 && nz <= Z + BACK + 1 && (nx === A - 1 || nx === A + W + 1))
          )
            continue;
        }
        prev.set(j, i);
        q.push(j);
      }
    }
    if (end < 0) continue;
    const path: [number, number][] = [];
    // The walk ends on a road tile; leave that tile out (it is road already).
    for (let i = prev.get(end)!; i >= 0; i = prev.get(i)!) path.push([i % S, (i - (i % S)) / S]);
    path.reverse();
    if (!bestPath || path.length < bestPath.length) bestPath = path;
  }
  if (!bestPath) throw new Error('no way to connect the street grid to the town');
  return bestPath;
}

const streetTiles: [number, number][][] = [
  line(gx(0), gz(HIGH), gx(W), gz(HIGH)),
  line(gx(0), gz(BACK), gx(W), gz(BACK)),
  line(gx(0), gz(HIGH + 1), gx(0), gz(BACK - 1)),
  line(gx(MID), gz(HIGH + 1), gx(MID), gz(BACK - 1)),
  line(gx(W), gz(HIGH + 1), gx(W), gz(BACK - 1)),
];
const link = connector(); // found before the grid's own roads exist, so it ends on the town's
for (const tiles of streetTiles) run({ t: 'road.paint', kind: 'street', tiles });
// The connector as one lane polyline, split into straight runs so every step is orthogonal.
const linkTiles = link.filter(([x, z]) => !m.road[z * S + x]);
if (linkTiles.length) run({ t: 'road.paint', kind: 'lane', tiles: linkTiles });

// Zones: shops north of the high street, townhouses south of it, and both sides of the back street.
const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => {
  const t: [number, number][] = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) t.push([x, z]);
  return t;
};
function zone(id: string, tiles: [number, number][]): void {
  for (let i = 0; i < tiles.length; i += 250)
    run({ t: 'zone.paint', zone: id, tiles: tiles.slice(i, i + 250) });
}
zone('shops', rect(gx(1), gz(-3), gx(W - 1), gz(-1)));
zone('homes-medium', rect(gx(1), gz(1), gx(W - 1), gz(3)));
zone('homes-medium', rect(gx(1), gz(BACK - 3), gx(W - 1), gz(BACK - 1)));
zone('homes-medium', rect(gx(1), gz(BACK + 1), gx(W - 1), gz(BACK + 3)));
// Rows along the cross streets too, so the ground between them is a closed block (gardens).
for (const cx of [0, MID, W]) {
  if (cx > 0) zone('homes-medium', rect(gx(cx - 3), gz(4), gx(cx - 1), gz(BACK - 4)));
  if (cx < W) zone('homes-medium', rect(gx(cx + 1), gz(4), gx(cx + 3), gz(BACK - 4)));
}

// --- the street's lots: those whose tiles lie inside the grid's box ------------------------------
const box = { x0: A, x1: A + W, z0: Z + Z_MIN, z1: Z + Z_MAX };
type L = Record<string, unknown> & {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  buildingId: number;
  row?: number;
  kind?: string;
  corner?: boolean;
  zone: number;
};
function streetLots(): L[] {
  return (state.lots as unknown as L[]).filter(
    (l) => l.x >= box.x0 && l.x + l.w - 1 <= box.x1 && l.z >= box.z0 && l.z + l.d - 1 <= box.z1,
  );
}
const isGarden = (l: L) => l.kind === 'garden';

function table(day: number): { plots: number; built: number; gardens: number } {
  const ls = streetLots();
  const plots = ls.filter((l) => !isGarden(l)).length;
  const built = ls.filter((l) => !isGarden(l) && l.buildingId).length;
  const gardens = ls.filter(isGarden).length;
  const empty = (state.lots as unknown as L[]).filter((l) => !l.buildingId && l.kind !== 'garden').length;
  const sites = state.buildings.filter((b) => b.rt?.construction).length;
  console.log(
    `  (town: empty lots ${empty}, sites going up ${sites}, residents ${state.residents.length}, demand ${JSON.stringify(growthDemand(state))})`,
  );
  console.log(
    `day ${String(day).padStart(2)}  lots ${String(plots).padStart(3)}  built ${String(built).padStart(3)}  gardens ${String(gardens).padStart(3)}`,
  );
  return { plots, built, gardens };
}

const DAY = TICKS_PER_DAY;
// Focus (default on; QOTI_FOCUS=0 leaves the town's other empty lots in competition): the town's own
// empty lots are unzoned, as a player who wants the street to fill first would, so growth has nowhere
// else to go. Run a day first so the street's lots are cut and the hourly pass has settled.
if (process.env.QOTI_FOCUS !== '0') {
  const inBox = new Set(streetLots().map((l) => l.id));
  const tiles: [number, number][] = [];
  for (const l of state.lots as unknown as L[])
    if (!l.buildingId && !inBox.has(l.id) && l.kind !== 'garden')
      for (let z = l.z; z < l.z + l.d; z++) for (let x = l.x; x < l.x + l.w; x++) tiles.push([x, z]);
  for (let i = 0; i < tiles.length; i += 250) run({ t: 'zone.clear', tiles: tiles.slice(i, i + 250) });
  console.log(`FOCUS cleared ${tiles.length} tiles of the town's empty lots`);
}
const startTick = state.tick;
console.log('SITE', A, Z, `grid ${W + 1} x ${BACK + 1}`);
table(0);
const history: { day: number; plots: number; built: number; gardens: number }[] = [];
for (let d = 1; d <= days; d++) {
  while (state.tick < startTick + d * DAY) advanceTo(state, state.lastTurn + 1, ctx);
  const r = table(d);
  history.push({ day: d, ...r });
  if (r.plots > 0 && r.built / r.plots >= stopShare && d >= 3) break;
}

writeFileSync(out, serialize(state));

// --- counts from the saved state ----------------------------------------------------------------
const ls = streetLots();
const plots = ls.filter((l) => !isGarden(l));
const byRow = new Map<number, L[]>();
for (const l of plots) {
  const r = (l.row as number | undefined) ?? 0;
  const k = r || -l.id;
  if (!byRow.has(k)) byRow.set(k, []);
  byRow.get(k)!.push(l);
}
const occ = new Set<number>();
for (const l of plots)
  for (let z = l.z; z < l.z + l.d; z++) for (let x = l.x; x < l.x + l.w; x++) occ.add(z * S + x);
const builtLots = plots.filter((l) => l.buildingId);
const touches = (a: L, b: L) => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
  return (ox === 0 && oz > 0) || (oz === 0 && ox > 0);
};
const lonely = builtLots.filter((a) => !builtLots.some((b) => b !== a && touches(a, b)));
let gaps = 0;
for (const row of byRow.values()) {
  row.sort((a, b) => a.x - b.x || a.z - b.z);
  for (let i = 1; i < row.length; i++) {
    const a = row[i - 1]!;
    const b = row[i]!;
    const alongX = a.z === b.z && a.d === b.d;
    if (alongX && b.x - (a.x + a.w) > 0) gaps++;
    if (!alongX && a.x === b.x && a.w === b.w && b.z - (a.z + a.d) > 0) gaps++;
  }
}
const storeysByRow = [...byRow.entries()].map(([k, row]) => ({
  row: k,
  lots: row.length,
  built: row.filter((l) => l.buildingId).length,
  storeys: row
    .filter((l) => l.buildingId)
    .map(
      (l) =>
        (state.buildings.find((b) => b.id === l.buildingId) as { storeys?: number } | undefined)?.storeys ??
        null,
    ),
}));
const counts = {
  site: { A, Z },
  center: [A + W / 2, Z + BACK / 2],
  day: Math.round((state.tick - startTick) / DAY),
  plots: plots.length,
  built: builtLots.length,
  gardens: ls.filter(isGarden).length,
  corners: plots.filter((l) => l.corner).length,
  rows: byRow.size,
  lotsPerRow: [...byRow.values()].map((r) => r.length),
  gapsInRows: gaps,
  builtLotsTouchingNoBuiltNeighbor: lonely.length,
  storeysByRow,
};
console.log('COUNTS ' + JSON.stringify(counts));
console.log(`CENTER ${A + W / 2} ${Z + BACK / 2}`);
