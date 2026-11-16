import { readFileSync, writeFileSync } from 'node:fs';
import { content } from '@qoti/content';
import { MAP_SIZE } from '../../../packages/sim/src/constants';
import { createTickCtx, deserialize, executeCommand, serialize, applyTurn, calendar } from '@qoti/sim';
import { doorTile } from '../../../packages/sim/src/systems/movement/api';
const out = process.argv[2]!;
const s = deserialize(new Uint8Array(readFileSync('../../apps/client/src/app/fixtures/grown.qoti')));
s.time.connected = [0, 1];
s.time.desired = [3, 3, 1, 1];
const ctx = createTickCtx(s);
const S = MAP_SIZE;
const stalls = s.buildings.filter((b) => b.def === 'market-stall' && b.stage === 'built');
const shopish = s.buildings.filter((b) => content.buildingById.get(b.def)?.tags?.includes('market') && b.stage === 'built');
console.log('stalls', stalls.map((b) => b.id), 'markets', shopish.map((b) => `${b.def}#${b.id}`).join(' '));
const b = stalls[0] ?? shopish[0]!;
const door = doorTile(b);
const x = door % S, z = Math.floor(door / S);
// The stretch of road through the stall's door, a few tiles each way along the road.
const tiles: [number, number][] = [];
const seen = new Set<number>();
for (let d = -3; d <= 3; d++) for (const [tx, tz] of [[x + d, z], [x, z + d]] as [number, number][]) if (s.map.road[tz * S + tx] && !seen.has(tz * S + tx)) { seen.add(tz * S + tx); tiles.push([tx, tz]); }
const ok = executeCommand(s, { seat: 1, seq: 1, cmd: { t: 'road.setEvening', tiles, on: true } } as any, ctx);
console.log('setEvening', ok, JSON.stringify(ctx.events.filter((e: any) => e.e === 'command.rejected')), tiles.length, 'door', x, z, 'stall', b.id);
const cal = () => calendar(s.tick);
console.log('start', JSON.stringify(cal()));
let day0 = Math.floor(s.tick / 4800);
const target = (day0 + 2) * 4800 + (17 - 6) * 200 + 133; // 17:40 two days on
while (s.tick < target) applyTurn(s, { t: s.lastTurn + 1, cmds: [] }, ctx);
console.log('now', JSON.stringify(cal()), 'stall status', b.rt?.status);
const r = s.residents.filter((r) => r.stage === 'adult').slice(0, 3).map((r) => `${r.given} ev ${r.needs[9]} mood ${r.mood}`);
console.log(r.join(' | '));
s.time.connected = [];
writeFileSync(out, serialize(s));
console.log('saved', out);
