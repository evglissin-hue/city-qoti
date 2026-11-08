// Mill Town's yield line (docs/spec/15-progression.md, Callings): workshops, mills, the quarry and
// the sawpits work faster. Registered in the yield hook (systems/production/modifiers).
import type { YieldModifier } from '../production/modifiers';
import { chosenCalling } from './chosen';

export const callingYield: YieldModifier = (state, _b, def) => {
  const boost = chosenCalling(state)?.yieldBoost;
  if (!boost) return 1000;
  if (boost.ids.includes(def.id) || boost.tags.some((t) => def.tags?.includes(t))) return 1000 + boost.permille;
  return 1000;
};
