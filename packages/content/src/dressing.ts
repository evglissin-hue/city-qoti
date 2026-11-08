import type { DressingStep } from './types';

// The ladder homes climb on their own (P1, docs/spec/13-ledger.md, Zoning and growth). A home with a
// household whose street is pleasant (the charm around its door) and whose people are content takes
// the next step every few days: window boxes, then a porch, then ivy. A home a player has ever
// customized or fitted a module on is left alone. Thresholds ascend; ids never change once shipped.
// Add a rung by adding a line in its place in the order (they are tried top to bottom).
export const dressingSteps: readonly DressingStep[] = [
  {
    id: 'boxes',
    kind: 'custom',
    ref: 'windowBoxes',
    charm: 30,
    rank: 'hamlet',
    notice: 'The {family} family put up window boxes. The street approves.',
  },
  {
    id: 'porch',
    kind: 'module',
    ref: 'porch',
    charm: 36,
    rank: 'village',
    notice:
      'The {family} family built themselves a porch. Somewhere, a rocking chair is already being planned.',
  },
  {
    id: 'ivy',
    kind: 'module',
    ref: 'ivy',
    charm: 42,
    rank: 'village',
    notice: 'Ivy has been let loose on the {family} family wall. It was hardly asked twice.',
  },
];
