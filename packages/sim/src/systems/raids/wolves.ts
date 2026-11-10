// Winter wolves (C5D). docs/spec/14-challenge.md, Threat types. On a few winter nights (planned on
// Winter day 1, systems/threats) wolves come down from the forest edge at 21:00, prowl toward the
// most outlying farm with no fence, hedge, wall or lantern by it, and are back in the trees by
// 05:00. Residents still outdoors on an unlit tile near them get a fright (-10 mood, never harm);
// that farm's animals are scared and its output halves for the day after. They avoid lit tiles and
// fenced farms. In the first Hamlet winter (the tutorial) and on Peaceful they only howl at the
// forest edge. The pack is derived from the clock and the map, so it is never saved: the view
// draws it from the same arithmetic (agent rows with AgentFlags.wolf).
import { hasTag } from '../../state/zones';
import type { BuildingDef, ProductionMethod } from '@qoti/content';
import { content } from '@qoti/content';
import { MAP_SIZE, TICKS_PER_HOUR } from '../../constants';
import type { Building, TickCtx, WorldState } from '../../contracts';
import { Terrain } from '../../map/layers';
import { rankAtLeast } from '../../state/village';
import { chronicle } from '../chronicle/api';
import { dayIndex, hourOf } from '../economy/time';
import { isFarm } from '../production/fields';
import { addMoodModifier } from '../residents/api';
import { frontOf, litTiles } from '../threats/api';

const S = MAP_SIZE;
/** Wolves are about from 21:00 to 05:00, at the farm at 01:00. */
export const WOLF_FROM = 21;
export const WOLF_TO = 5;
/** Folk outdoors within this many tiles of the pack get a fright. */
export const WOLF_FRIGHT_RANGE = 10;
export const WOLF_FRIGHT = -10;
/** A farm counts as outlying this far (tiles) from the Town Hall. */
export const OUTLYING = 12;
/** Output of a farm the wolves scared, for the day after (permille). */
export const SCARED_YIELD = 500;
/** Wolves in the pack (view rows). */
export const PACK = 3;

/** The day index of the evening a night belongs to (hours before noon count to the evening before). */
export function nightOf(tick: number): number {
  return hourOf(tick) < 12 ? dayIndex(tick) - 1 : dayIndex(tick);
}

/** True when the wolves come in earnest (not the tutorial winter, not on Peaceful). */
export function wolvesCome(state: WorldState): boolean {
  if (state.settings.threat === 'peaceful') return false;
  return rankAtLeast(state, 'village') || dayIndex(state.tick) >= 24;
}

/** True while a wolf night is on (21:00 to 05:00). */
export function wolfNight(state: WorldState, tick = state.tick): boolean {
  const h = hourOf(tick);
  if (h < WOLF_FROM && h >= WOLF_TO) return false;
  return state.threats.wolves.includes(nightOf(tick));
}

function townHall(state: WorldState): Building | undefined {
  return state.buildings.find((b) => b.def === 'town-hall' && b.stage === 'built');
}

function footprintNear(b: Building, x: number, z: number, r: number): boolean {
  const def = content.buildingById.get(b.def);
  const [w, d] = def ? def.size : [1, 1];
  const ww = b.rot % 2 === 0 ? w : d;
  const dd = b.rot % 2 === 0 ? d : w;
  return x >= b.x - r && x < b.x + ww + r && z >= b.z - r && z < b.z + dd + r;
}

/** Farms and pastures: what wolves come for (a grain farm's fields, a sheep run's flock). */
export function hasAnimals(b: Building): boolean {
  return isFarm(b) || hasTag(b, 'farm');
}

/** True when a farm has a fence, hedge or wall by it (within 2 tiles) or a lantern at its door. */
export function farmGuarded(state: WorldState, b: Building, lit?: Set<number>): boolean {
  if ((lit ?? litTiles(state)).has(frontOf(b))) return true;
  for (const d of state.decor) {
    const tags = content.decorById.get(d.def)?.tags;
    if (!tags || !(tags.includes('fence') || tags.includes('hedge') || tags.includes('wall'))) continue;
    if (footprintNear(b, Math.floor(d.fx / 256), Math.floor(d.fz / 256), 2)) return true;
  }
  for (const w of state.buildings) {
    if (w.stage !== 'built' || !content.buildingById.get(w.def)?.tags?.includes('wall')) continue;
    if (footprintNear(b, w.x, w.z, 2)) return true;
  }
  return false;
}

interface Pack {
  key: string;
  farm: Building | null;
  den: number;
}
const packs = new WeakMap<WorldState, Pack>();

/** Tonight's farm (the most outlying unguarded one) and the forest tile the pack comes from. */
export function packFor(state: WorldState, night = nightOf(state.tick)): Pack {
  const nb = state.buildings.length;
  const nd = state.decor.length;
  const key = `${night}:${nb}:${nb ? state.buildings[nb - 1]!.id : 0}:${nd}:${nd ? state.decor[nd - 1]!.id : 0}`;
  const have = packs.get(state);
  if (have && have.key === key) return have;
  const hall = townHall(state);
  const hx = hall ? hall.x : S >> 1;
  const hz = hall ? hall.z : S >> 1;
  const lit = litTiles(state);
  let farm: Building | null = null;
  let far = -1;
  if (wolvesCome(state)) {
    for (const b of state.buildings) {
      if (b.stage !== 'built' || !hasAnimals(b)) continue;
      const d = Math.abs(b.x - hx) + Math.abs(b.z - hz);
      if (d < OUTLYING || d <= far || farmGuarded(state, b, lit)) continue;
      farm = b;
      far = d;
    }
  }
  const from = farm ? frontOf(farm) : hz * S + hx;
  const pack: Pack = { key, farm, den: nearestForest(state, from) };
  packs.set(state, pack);
  return pack;
}

/** The forest tile nearest a tile (ring by ring), else the nearest map edge. */
function nearestForest(state: WorldState, tile: number): number {
  const x0 = tile % S;
  const z0 = Math.floor(tile / S);
  const t = state.map.terrain;
  for (let r = 1; r < 64; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = x0 + dx;
        const z = z0 + dz;
        if (x < 0 || z < 0 || x >= S || z >= S) continue;
        if (t[z * S + x] === Terrain.forestFloor) return z * S + x;
      }
    }
  }
  const ex = x0 < S - x0 ? 0 : S - 1;
  return z0 * S + ex;
}

/** Hours since 21:00 tonight (0 to 8), in ticks. */
function nightTicks(tick: number): number {
  const h = hourOf(tick);
  const sinceHour = tick % TICKS_PER_HOUR;
  const hours = h >= WOLF_FROM ? h - WOLF_FROM : h + 24 - WOLF_FROM;
  return hours * TICKS_PER_HOUR + sinceHour;
}

/** Where the pack leader stands: at the den at 21:00, the farm at 01:00, the den again at 05:00. */
export function packTile(state: WorldState, tick = state.tick): number {
  const p = packFor(state);
  if (!p.farm) return p.den;
  const to = frontOf(p.farm);
  const half = ((24 - WOLF_FROM + WOLF_TO) * TICKS_PER_HOUR) / 2;
  const t = nightTicks(tick);
  const f = t <= half ? t : 2 * half - t;
  const ax = p.den % S;
  const az = Math.floor(p.den / S);
  const x = ax + Math.floor((((to % S) - ax) * f) / half);
  const z = az + Math.floor(((Math.floor(to / S) - az) * f) / half);
  return z * S + x;
}

/** Hourly on a wolf night (systems/raids): frights, and the Chronicle line in the morning. */
export function wolvesTick(state: WorldState, ctx: TickCtx): void {
  if (state.tick % TICKS_PER_HOUR !== 0) return;
  const h = hourOf(state.tick);
  if (!state.threats.wolves.includes(nightOf(state.tick))) return;
  const come = wolvesCome(state);
  if (h === WOLF_FROM && !come)
    chronicle(state, ctx, 'wolves-howl', { text: [], variant: nightOf(state.tick) });
  if (!come || !wolfNight(state)) {
    if (h === WOLF_TO && come) morning(state, ctx);
    return;
  }
  const at = packTile(state);
  const lit = litTiles(state);
  const ax = at % S;
  const az = Math.floor(at / S);
  for (const r of state.residents) {
    if (r.inside || lit.has(r.tile)) continue;
    const x = r.tile % S;
    const z = Math.floor(r.tile / S);
    if (Math.max(Math.abs(x - ax), Math.abs(z - az)) > WOLF_FRIGHT_RANGE) continue;
    addMoodModifier(state, r.id, { kind: 'fright', value: WOLF_FRIGHT, ticks: 24 * TICKS_PER_HOUR });
  }
}

function morning(state: WorldState, ctx: TickCtx): void {
  const p = packFor(state);
  const place = p.farm
    ? (content.buildingById.get(p.farm.def)?.name.toLowerCase() ?? 'a farm')
    : 'the forest edge';
  const at = p.farm ? frontOf(p.farm) : p.den;
  chronicle(state, ctx, 'wolves', {
    text: [['place', p.farm ? `the ${place}` : place]],
    variant: nightOf(state.tick),
    refs: p.farm ? [p.farm.id] : [],
    snapshot: { focus: [at % S, Math.floor(at / S)], radius: 10 },
  });
}

/** Yield hook: a farm the wolves scared last night makes half as much today. */
export function scaredAnimals(
  state: WorldState,
  b: Building,
  _def: BuildingDef,
  _method: ProductionMethod,
): number {
  if (state.threats.wolves.length === 0 || !hasAnimals(b) || !wolvesCome(state))
    return 1000;
  const last = dayIndex(state.tick) - 1;
  if (hourOf(state.tick) < WOLF_TO || !state.threats.wolves.includes(last)) return 1000;
  return packFor(state, last).farm?.id === b.id ? SCARED_YIELD : 1000;
}
