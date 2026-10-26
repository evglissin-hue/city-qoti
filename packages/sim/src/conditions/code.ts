// Named code predicates for the Condition DSL's escape hatch ({ code: 'lanternRoute' }).
// C3.0 contract: the registry shape. C3B fills in lanternRoute and pathRoute.
import type { WorldState } from '../contracts';
import type { Binding } from './index';

export type CodePredicate = (
  state: WorldState,
  bind: Binding,
  params: readonly [string, number][],
) => boolean;

// Registry: one line per predicate, alphabetical.
// prettier-ignore
export const codePredicates: ReadonlyMap<string, CodePredicate> = new Map<string, CodePredicate>([
]);
