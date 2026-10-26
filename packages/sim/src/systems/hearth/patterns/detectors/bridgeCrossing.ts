// Bridge Crossing: a bridge (road tiles over water, `span` or more) whose two ends, the road tiles
// on dry land beside it, each have a lantern within `lanternReach` tiles, with a bench within
// `benchReach` tiles of an end. Anchored on the bridge's smallest tile.
import { MAP_SIZE } from '../../../../constants';
import type { EntityId } from '../../../../contracts';
import { tileGap2, within } from '../../../../conditions/geo';
import { components, type Detector, param, type SiteCandidate, taggedIn, tileOf } from '../shared';

const S = MAP_SIZE;

export const bridgeCrossing: Detector = (state, def) => {
  const span = param(def, 'span', 1);
  const lanternReach = param(def, 'lanternReach', 1);
  const benchReach = param(def, 'benchReach', 3);
  const { road, water } = state.map;
  const deck: number[] = [];
  for (let i = 0; i < road.length; i++) if (road[i] && water[i]) deck.push(i);
  if (deck.length === 0) return [];
  const out: SiteCandidate[] = [];
  for (const comp of components(deck)) {
    if (comp.length < span) continue;
    const inDeck = new Set(comp);
    const ends: number[] = [];
    for (const t of comp) {
      const x = t % S;
      for (const n of [t - S, t + S, x > 0 ? t - 1 : -1, x < S - 1 ? t + 1 : -1]) {
        if (n < 0 || n >= road.length || inDeck.has(n) || !road[n] || water[n]) continue;
        if (!ends.includes(n)) ends.push(n);
      }
    }
    if (ends.length < 2) continue;
    const near = (tag: string, end: number, reach: number): EntityId[] => {
      const x = end % S;
      const z = (end - x) / S;
      return taggedIn(state, [x - reach, z - reach, x + reach, z + reach], tag)
        .filter((d) => {
          const t = tileOf(d);
          return within(tileGap2(t % S, (t - (t % S)) / S, [x, z, x, z]), reach);
        })
        .map((d) => d.id);
    };
    const lanterns = new Set<EntityId>();
    let lit = 0;
    for (const end of ends) {
      const here = near('lantern', end, lanternReach);
      if (here.length > 0) lit++;
      for (const id of here) lanterns.add(id);
    }
    if (lit < 2) continue;
    const benches = new Set<EntityId>();
    for (const end of ends) for (const id of near('bench', end, benchReach)) benches.add(id);
    if (benches.size === 0) continue;
    out.push({ anchor: comp[0]!, members: [...lanterns, ...benches], tiles: comp });
  }
  return out;
};
