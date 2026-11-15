import type { DecorDef } from './types';

// The three signature pieces of the P1 callings. R1 took the Calling card away (callings come back
// earned, from the Town Book's pages, in R3: docs/spec/15-progression.md, Callings), so nothing
// unlocks these pieces until R3 does; they stay in content, locked, so their art and ids keep.

export const millstoneBench: DecorDef = {
  id: 'millstone-bench',
  name: 'Millstone bench',
  lane: 'hearth',
  radius: 40,
  onRoad: true,
  tags: ['seat', 'millstone', 'calling'],
  art: { kit: 'millstone-bench' },
  charm: [{ category: 'comfort', value: 6, radius: 2 }],
  locked: true,
};

export const roseArch: DecorDef = {
  id: 'rose-arch',
  name: 'Rose arch',
  lane: 'hearth',
  radius: 40,
  onRoad: true,
  tags: ['arch', 'flower', 'calling'],
  art: { kit: 'rose-arch' },
  charm: [
    { category: 'nature', value: 6, radius: 2 },
    { category: 'view', value: 2, radius: 2 },
  ],
  locked: true,
};

export const waysideShrine: DecorDef = {
  id: 'wayside-shrine',
  name: 'Wayside shrine',
  lane: 'hearth',
  radius: 36,
  onRoad: true,
  tags: ['shrine', 'light', 'calling'],
  art: { kit: 'wayside-shrine' },
  charm: [
    { category: 'comfort', value: 3, radius: 2 },
    { category: 'light', value: 1, radius: 2, nightValue: 4 },
  ],
  locked: true,
};
