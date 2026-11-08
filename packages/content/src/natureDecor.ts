import type { ChronicleTemplate, DecorDef } from './types';

// I3 decor and Chronicle lines for nature (C5C): a swing for Children's Corner, and the four pieces
// the I3 Hearth patterns unlock. Each names an existing decor kit as a stand-in and the kit C5E
// should draw in `params.kit`.

export const arborSeat: DecorDef = {
  id: 'arbor-seat',
  name: 'Arbor seat',
  lane: 'hearth',
  radius: 72,
  blocksWalking: true,
  tags: ['bench', 'seat', 'flower'],
  art: { kit: 'bench', params: { kit: 'arbor-seat', roses: true } },
  charm: [
    { category: 'comfort', value: 4, radius: 2 },
    { category: 'nature', value: 3, radius: 2 },
  ],
  locked: true,
};

export const pearTree: DecorDef = {
  id: 'pear-tree',
  name: 'Pear tree',
  lane: 'hearth',
  radius: 96,
  blocksWalking: true,
  tags: ['tree', 'fruit', 'blossom'],
  art: { kit: 'apple-tree', params: { kit: 'pear-tree' } },
  charm: [{ category: 'nature', value: 5, radius: 2 }],
  locked: true,
};

export const reedBed: DecorDef = {
  id: 'reed-bed',
  name: 'Reed bed',
  lane: 'hearth',
  radius: 64,
  onWater: true,
  tags: ['reeds'],
  art: { kit: 'wildflower-verge', params: { kit: 'reed-bed' } },
  charm: [{ category: 'nature', value: 3, radius: 1 }],
  locked: true,
};

export const seeSaw: DecorDef = {
  id: 'see-saw',
  name: 'See-saw',
  lane: 'hearth',
  radius: 80,
  blocksWalking: true,
  tags: ['play'],
  art: { kit: 'bench', params: { kit: 'see-saw' } },
  charm: [{ category: 'comfort', value: 3, radius: 2 }],
  locked: true,
};

export const swing: DecorDef = {
  id: 'swing',
  name: 'Swing',
  lane: 'hearth',
  radius: 72,
  blocksWalking: true,
  tags: ['play'],
  art: { kit: 'signpost', params: { kit: 'swing' } },
  charm: [{ category: 'comfort', value: 3, radius: 2 }],
};

// Params: {species} {place} {credit}
export const firstSighting: ChronicleTemplate = {
  kind: 'first-sighting',
  text: [
    'A {species} was seen {place} for the first time, and the Field Guide has a new page. Credit to {credit}.',
    'First {species} of {town}, spotted {place}. Somebody fetched the Field Guide; somebody else fetched a better pencil.',
    'The {species} has found {town}, {place}. Nobody invited it, exactly, but it was made very welcome by {credit}.',
  ],
  notable: true,
};
