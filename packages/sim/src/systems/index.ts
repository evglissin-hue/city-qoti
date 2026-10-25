// System registry: one line per system, in alphabetical order. The tick pipeline runs them
// by `order`, not by their place in this list.
import type { System } from '../contracts';
import { clock } from './clock';
import { trees } from './trees';

// prettier-ignore
export const systems: readonly System[] = [
  clock,
  trees,
];

/** Systems in pipeline order (stable for equal orders, which never happens in practice). */
export const pipeline: readonly System[] = [...systems].sort(
  (a, b) => a.order - b.order || (a.id < b.id ? -1 : 1),
);
