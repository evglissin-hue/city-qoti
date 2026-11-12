// The Specialized shelf says where each building may stand, in a few words, from its own site
// rules (`BuildingDef.placement`). One entry per rule kind, so a new kind fails the typecheck until
// it has words; a content test walks every specialized def.
import type { BuildingDef, PlacementRule } from '@qoti/content';

type RuleWords = { [K in PlacementRule['kind']]: (rule: Extract<PlacementRule, { kind: K }>) => string };

const DEPOSIT_WORD: Record<string, string> = {
  clay: 'On clay',
  stone: 'On a stone deposit',
  coal: 'On a coal deposit',
  sand: 'On sand',
};

const WORDS: RuleWords = {
  waterEdge: () => "At the water's edge",
  deposit: (r) => DEPOSIT_WORD[r.deposit] ?? `On a ${r.deposit} deposit`,
  fertility: () => 'On good soil',
  height: () => 'On level enough ground',
  woods: (r) => `Beside woods (${r.trees} grown trees)`,
  river: () => 'On the river bank',
  openGround: () => 'On open ground',
  road: (r) => (r.roads ? 'Beside a lane or street' : 'Beside a road'),
  valleyRoad: () => 'Near the valley road',
};

/** One rule in words. */
export function siteRuleWords(rule: PlacementRule): string {
  return (WORDS[rule.kind] as (r: PlacementRule) => string)(rule);
}

/** All of a def's site rules in a line ("Beside a road"), or null when it may stand anywhere. */
export function siteRuleLine(def: BuildingDef): string | null {
  const words = (def.placement ?? []).map(siteRuleWords);
  return words.length ? words.join(', ') : null;
}
