// What the place index is built from, as one 64-bit hash (two 32-bit lanes). The index rebuilds when
// this changes, so a place is always a pure function of saved state when read (the determinism rule
// on `Place` in contracts/evenings.ts): every input of buildPlaces is mixed in here, and nothing that
// only moves the draw (charm, the hour, the season) is, since draw.ts recomputes that part each tick.
import { content } from '@qoti/content';
import type { WorldState } from '../../contracts';
import { cafeTables } from '../growth/cafes';
import { sellsTreats } from '../market/round';

const DECOR_INDEX = new Map(content.decor.map((d, i) => [d.id, i]));
const BUILDING_INDEX = new Map(content.buildings.map((b, i) => [b.id, i]));
const PATTERN_INDEX = new Map(content.patterns.map((p, i) => [p.id, i]));
const FESTIVAL_INDEX = new Map(content.festivals.map((f, i) => [f.id, i]));

let a = 0;
let b = 0;

function mix(v: number): void {
  const w = v | 0;
  a = Math.imul(a ^ w, 0x01000193);
  b = Math.imul((b ^ w) + (a >>> 13), 0x5bd1e995);
}

/** The structural signature: decor, buildings and their trade with the round, homes, sites, the ice, the festival. */
export function placeSignature(state: WorldState): [number, number] {
  a = 0x9e3779b9;
  b = 0x85ebca6b;
  mix(state.networkVersion);
  mix(state.decor.length);
  for (const d of state.decor) {
    mix(d.id);
    mix(DECOR_INDEX.get(d.def) ?? -1);
    mix(d.fx);
    mix(d.fz);
  }
  mix(state.buildings.length);
  for (const bl of state.buildings) {
    mix(bl.id);
    mix(BUILDING_INDEX.get(bl.def) ?? -1);
    mix(bl.x);
    mix(bl.z);
    mix(bl.rot);
    if (bl.stage !== 'built') {
      mix(-1);
      continue;
    }
    mix(bl.level ?? 0);
    let porch = 0;
    const modules = bl.rt?.modules;
    if (modules) for (const [, m] of modules) if (m === 'porch') porch = 1;
    mix(porch | (sellsTreats(state, bl) ? 2 : 0));
    mix(cafeTables(state, bl));
  }
  mix(state.households.length);
  for (const h of state.households) {
    mix(h.id);
    mix(h.homeId);
  }
  const sites = state.hearth.sites;
  mix(sites.length);
  for (const s of sites) {
    mix(PATTERN_INDEX.get(s.pattern) ?? -1);
    mix(s.anchor);
    mix(s.members.length);
    for (const m of s.members) mix(m);
    mix(s.tiles.length);
    for (const t of s.tiles) mix(t);
  }
  const river = state.weather.river;
  mix(river.frozen ? 1 : 0);
  mix(river.frozenTick ?? 0);
  const f = state.festival;
  if (f.live && f.plan) {
    mix(1);
    mix(FESTIVAL_INDEX.get(f.plan.festival) ?? -1);
    const site = f.plan.site;
    if (!site) mix(-1);
    else if ('rect' in site) for (const v of site.rect) mix(v);
    else {
      mix(PATTERN_INDEX.get(site.pattern) ?? -1);
      mix(site.anchor);
    }
  } else mix(0);
  return [a >>> 0, b >>> 0];
}
