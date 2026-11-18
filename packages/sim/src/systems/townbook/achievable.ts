// Can the town earn this page yet? (docs/spec/19-evenings.md, The Town Book: hints.) A hint never
// names a page whose pattern is unknown or whose good the town cannot make, the way a wish is only
// offered when its target is something the town can build (hearth/wishes/achievable.ts). Pure and
// cheap: reads saved state and content only, so the hints pass can ask at every close.
import { content, type CustomDef, type SpecialtyDef, type TradeDef } from '@qoti/content';
import type { WorldState } from '../../contracts';
import { isMasterGood } from '../../state/masters';
import { rankAtLeast } from '../../state/village';
import { goodMakeable } from '../festivals/twists';
import { placeableNow, targetAvailable, tradeAvailable } from '../hearth/wishes/achievable';

/** The highest fertility on a map, cached by the layer's array (the map's fertility does not fall). */
const fertilityMax = new WeakMap<Uint8Array, number>();

function maxFertility(state: WorldState): number {
  const layer = state.map.fertility;
  let m = fertilityMax.get(layer);
  if (m === undefined) {
    m = 0;
    for (let i = 0; i < layer.length; i++) if (layer[i]! > m) m = layer[i]!;
    fertilityMax.set(layer, m);
  }
  return m;
}

/** The pattern is discovered, or its hint is showing in the Pattern Book. */
export function patternKnown(state: WorldState, id: string): boolean {
  for (const d of state.hearth.discovered) if (d.pattern === id) return true;
  return state.hearth.hints.includes(id);
}

/** A trade is open to the town and its lot can be found on this map. */
function tradeOpen(state: WorldState, t: TradeDef): boolean {
  if (!tradeAvailable(state, t)) return false;
  const f = t.wants.fertility;
  return f === undefined || maxFertility(state) >= f;
}

/** Some open trade makes the good (a raw one: nothing else is needed). */
function someTradeMakes(state: WorldState, good: string, rawsToo: boolean): boolean {
  for (const t of content.trades) {
    if (t.makes !== good || !tradeOpen(state, t)) continue;
    if (!rawsToo) return true;
    if (t.from.every((r) => someTradeMakes(state, r, false))) return true;
  }
  return false;
}

/**
 * The good (by index) can be had: made now, or (a base good) its trade is open with every raw it
 * takes made by an open trade, or a building that makes it can be placed. A master's good only
 * counts while a master makes it (goodMakeable).
 */
export function goodPossible(state: WorldState, g: number): boolean {
  const def = content.goods[g];
  if (!def) return false;
  if (goodMakeable(state, def.id)) return true;
  if (isMasterGood(g)) return false;
  if (someTradeMakes(state, def.id, true)) return true;
  return content.buildings.some(
    (b) => b.methods?.some((m) => m.outputs.some(([o]) => o === def.id)) === true && placeableNow(state, b),
  );
}

/** A specialty can be earned: its pattern is known and its good can be had. */
export function specialtyPossible(state: WorldState, def: SpecialtyDef): boolean {
  const g = content.goodIndex.get(def.good);
  return g !== undefined && patternKnown(state, def.pattern) && goodPossible(state, g);
}

/** A custom can be earned: its pattern is known (or its host can be had), or a piece of its supply can be set. */
export function customPossible(state: WorldState, def: CustomDef): boolean {
  if (def.kind === 'day') {
    if (def.pattern !== undefined) return patternKnown(state, def.pattern);
    if (def.host !== undefined) return targetAvailable(state, { building: def.host });
    return true;
  }
  if (def.supply === 'nightly' && !rankAtLeast(state, 'village')) return false;
  return content.decor.some((d) => d.supply?.kind === def.supply && targetAvailable(state, { decor: d.id }));
}

/** A page's content id (a specialty or a custom) can be earned now. */
export function defPossible(state: WorldState, id: string): boolean {
  const s = content.specialtyById.get(id);
  if (s) return specialtyPossible(state, s);
  const c = content.customById.get(id);
  return c !== undefined && customPossible(state, c);
}
