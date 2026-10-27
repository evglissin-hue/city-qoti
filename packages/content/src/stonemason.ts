import type { StoryArc } from './types';

// Barnaby Ashcombe, the stonemason (docs/spec/11-residents.md, Story characters). C5.0 stub: C5D
// writes his arc (walls, the Watch, and stone walls early for the town that listens). Until then
// he never arrives.

export const stonemason: StoryArc = {
  id: 'stonemason',
  character: {
    given: 'Barnaby',
    family: 'Ashcombe',
    species: 'badger',
    traits: ['practical', 'grumpy', 'sporty'],
    stage: 'adult',
    bio: 'A stonemason who talks to walls, and claims the good ones answer.',
  },
  arrival: { count: { what: 'rank', atLeast: 99 } },
  hello: '',
  steps: [],
  finale: { letter: '' },
};
