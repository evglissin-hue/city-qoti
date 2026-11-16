import { readFileSync } from 'node:fs';
import { deserialize, type Lot } from '@qoti/sim';

/** A lot as this script reads it (the sim's Lot, with the axis it runs along). */
type GapLot = Lot & { horizontal?: boolean };

const [file, A, Z] = [process.argv[2]!, Number(process.argv[3]), Number(process.argv[4])];
const st = deserialize(new Uint8Array(readFileSync(file)));
const lots = (st.lots as GapLot[]).filter(
  (l) =>
    l.kind !== 'garden' && l.x >= A && l.x + l.w - 1 <= A + 18 && l.z >= Z - 4 && l.z + l.d - 1 <= Z + 13,
);
// Group by the line the entrance faces: rot picks the axis; frontage tile gives the road line.
const groups = new Map<string, GapLot[]>();
for (const l of lots) {
  const fx = l.frontage % 192;
  const fz = Math.floor(l.frontage / 192);
  const horizontal = fz < l.z || fz >= l.z + l.d; // road north or south of the lot: lots run along x
  const key = horizontal ? `h${fz}` : `v${fx}`;
  (groups.get(key) ?? groups.set(key, []).get(key)!).push({ ...l, horizontal });
}
let touching = 0;
let gaps = 0;
const gapSizes: number[] = [];
let built = 0;
let corner = 0;
for (const [key, g] of groups) {
  g.sort((a, b) => (a.horizontal ? a.x - b.x : a.z - b.z));
  for (let i = 1; i < g.length; i++) {
    const p = g[i - 1]!;
    const q = g[i]!;
    const d = q.horizontal ? q.x - (p.x + p.w) : q.z - (p.z + p.d);
    if (d === 0) touching++;
    else if (d > 0) {
      gaps++;
      gapSizes.push(d);
    }
  }
  void key;
}
for (const l of lots) {
  if (l.buildingId) built++;
  if (l.corner) corner++;
}
console.log(
  JSON.stringify({
    lots: lots.length,
    frontageLines: groups.size,
    touchingPairs: touching,
    gapPairs: gaps,
    gapSizes,
    built,
    corner,
  }),
);

// Building to building: per row, the gap in tiles between the footprints of neighboring built lots
// (0 is wall to wall), measured along the row from the occupant layer.
const occ = st.map.occupant as Int32Array;
const box = new Map<number, [number, number, number, number]>();
for (let z = Z - 4; z <= Z + 13; z++)
  for (let x = A; x <= A + 18; x++) {
    const id = occ[z * 192 + x]!;
    if (id <= 0) continue;
    const b = box.get(id) ?? [x, z, x, z];
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], z);
    b[2] = Math.max(b[2], x);
    b[3] = Math.max(b[3], z);
    box.set(id, b);
  }
const rows = new Map<number, GapLot[]>();
for (const l of lots)
  if (l.buildingId && box.has(l.buildingId)) (rows.get(l.row) ?? rows.set(l.row, []).get(l.row)!).push(l);
const report: unknown[] = [];
for (const [row, g] of rows) {
  const first = g[0]!;
  const fx = first.frontage % 192;
  const fz = Math.floor(first.frontage / 192);
  const horizontal = fz < first.z || fz >= first.z + first.d;
  const bs = g
    .map((l) => ({ l, b: box.get(l.buildingId)! }))
    .sort((a, b) => (horizontal ? a.b[0] - b.b[0] : a.b[1] - b.b[1]));
  const gapsB: number[] = [];
  for (let i = 1; i < bs.length; i++) {
    const p = bs[i - 1]!.b;
    const q = bs[i]!.b;
    gapsB.push(horizontal ? q[0] - p[2] - 1 : q[1] - p[3] - 1);
  }
  const storeys = g.map((l) => st.buildings.find((b) => b.id === l.buildingId)?.storeys ?? null);
  report.push({
    row,
    built: g.length,
    lotsInRow: lots.filter((l) => l.row === row).length,
    lotWidths: lots.filter((l) => l.row === row).map((l) => (horizontal ? l.w : l.d)),
    buildingGaps: gapsB,
    storeys,
    line: horizontal ? 'z' + fz : 'x' + fx,
  });
}
console.log(JSON.stringify(report));
