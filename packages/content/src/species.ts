import type { SpeciesDef } from './types';

// The seven woodland folk of I1 (docs/spec/11-residents.md). Species shape tastes, never ability.
// Name lists grow to 200 given names across species in C3A.

export const badger: SpeciesDef = {
  id: 'badger',
  name: 'Badger',
  plural: 'badgers',
  likes: [
    { kind: 'tag', what: 'workshop', within: 8, weight: 6 },
    { kind: 'charm', what: 'comfort', within: 3, weight: 4 },
  ],
  dislikes: [{ kind: 'crowd', within: 4, weight: -6 }],
  givenNames: ['Barnaby', 'Morwen', 'Tobias'],
  art: { kit: 'resident', params: { species: 'badger' } },
};

export const fox: SpeciesDef = {
  id: 'fox',
  name: 'Fox',
  plural: 'foxes',
  likes: [
    { kind: 'tag', what: 'market', within: 10, weight: 8 },
    { kind: 'crowd', within: 4, weight: 4 },
  ],
  dislikes: [{ kind: 'quiet', within: 6, weight: -6 }],
  givenNames: ['Odette', 'Rufus', 'Saffron'],
  art: { kit: 'resident', params: { species: 'fox' } },
};

export const hedgehog: SpeciesDef = {
  id: 'hedgehog',
  name: 'Hedgehog',
  plural: 'hedgehogs',
  likes: [
    { kind: 'tag', what: 'hedge', within: 4, weight: 8 },
    { kind: 'tag', what: 'garden', within: 4, weight: 4 },
  ],
  dislikes: [{ kind: 'charm', what: 'light', within: 2, weight: -4 }],
  givenNames: ['Bramble', 'Prickle', 'Thornbury'],
  art: { kit: 'resident', params: { species: 'hedgehog' } },
};

export const mouse: SpeciesDef = {
  id: 'mouse',
  name: 'Mouse',
  plural: 'mice',
  likes: [
    { kind: 'tag', what: 'bakery', within: 10, weight: 8 },
    { kind: 'crowd', within: 4, weight: 4 },
  ],
  dislikes: [{ kind: 'quiet', within: 6, weight: -4 }],
  givenNames: ['Pippa', 'Crumb', 'Tansy'],
  art: { kit: 'resident', params: { species: 'mouse' } },
};

export const otter: SpeciesDef = {
  id: 'otter',
  name: 'Otter',
  plural: 'otters',
  likes: [
    { kind: 'water', within: 4, weight: 10 },
    { kind: 'charm', what: 'view', within: 3, weight: 4 },
  ],
  dislikes: [{ kind: 'water', within: 12, weight: -6 }],
  givenNames: ['Wendell', 'Marina', 'Finn'],
  art: { kit: 'resident', params: { species: 'otter' } },
};

export const rabbit: SpeciesDef = {
  id: 'rabbit',
  name: 'Rabbit',
  plural: 'rabbits',
  likes: [
    { kind: 'charm', what: 'nature', within: 3, weight: 8 },
    { kind: 'quiet', within: 4, weight: 4 },
  ],
  dislikes: [{ kind: 'charm', what: 'noise', within: 3, weight: -8 }],
  givenNames: ['Clover', 'Hazel', 'Pip', 'Juniper'],
  art: { kit: 'resident', params: { species: 'rabbit' } },
};

export const squirrel: SpeciesDef = {
  id: 'squirrel',
  name: 'Squirrel',
  plural: 'squirrels',
  likes: [
    { kind: 'trees', within: 4, weight: 8 },
    { kind: 'height', weight: 4 },
  ],
  dislikes: [{ kind: 'trees', within: 6, weight: -6 }],
  givenNames: ['Acorn', 'Nutmeg', 'Rowan'],
  art: { kit: 'resident', params: { species: 'squirrel' } },
};
