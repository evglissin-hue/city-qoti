import type { GuideDef } from './types';

// The first days guide (C5H writes the letters, hints and goals). docs/build/cycle-05h-first-days.md.
// C5.0 fixes the step ids and lanes; goals stay unreachable (rank 99) until C5H fills them, so the
// stub never shows anything.

const NEVER = { count: { what: 'rank', atLeast: 99 } } as const;

export const firstDays: GuideDef = {
  id: 'first-days',
  from: {
    given: 'Tobias',
    family: 'Merriweather',
    species: 'otter',
    traits: ['practical', 'cheerful', 'early-bird'],
    stage: 'adult',
    bio: 'The County surveyor, who has measured every valley in the shire and liked about half of them.',
  },
  steps: [
    { id: 'lane-to-gate', lens: 'ledger', letter: '', goal: NEVER, hint: '' },
    { id: 'first-homes', lens: 'ledger', letter: '', goal: NEVER, hint: '' },
    { id: 'first-wish', lens: 'hearth', letter: '', goal: NEVER, hint: '' },
    { id: 'food-in-store', lens: 'ledger', letter: '', goal: NEVER, hint: '' },
    { id: 'planks', lens: 'both', letter: '', goal: NEVER, hint: '' },
    { id: 'first-pattern', lens: 'hearth', letter: '', goal: NEVER, hint: '' },
    { id: 'in-the-black', lens: 'ledger', letter: '', goal: NEVER, hint: '' },
    { id: 'together', lens: 'both', letter: '', goal: NEVER, hint: '' },
  ],
};
