// The five families of goods, by word and icon: one helper so the top bar, the Balances book and
// the season card all say them the same way. Order is GOOD_FAMILIES order.
import type { GoodFamily } from '@qoti/content';

export const FAMILY_ORDER: readonly GoodFamily[] = ['food', 'fuel', 'materials', 'wares', 'treats'];

/** The family's name as the Ledger says it. */
export const FAMILY_LABEL: Record<GoodFamily, string> = {
  food: 'Food',
  fuel: 'Fuel',
  materials: 'Materials',
  wares: 'Wares',
  treats: 'Treats',
};

/** A good icon id (see goodIcons.tsx) standing for each family. */
export const FAMILY_ICON: Record<GoodFamily, string> = {
  food: 'bread',
  fuel: 'firewood',
  materials: 'timber',
  wares: 'cloth',
  treats: 'honey',
};

/** The carrier's rule words. */
export const RULE_LABEL = { always: 'Always', essentials: 'Essentials only', never: 'Never' } as const;
