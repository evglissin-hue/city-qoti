import type { StoryArc } from './types';

// Mother Thornbury, the herbalist (docs/spec/11-residents.md, Story characters). C5.0 stub: C5A
// writes her arc (she moves in before the first Village winter and teaches the town to get through
// it). Until then she never arrives.

export const herbalist: StoryArc = {
  id: 'herbalist',
  character: {
    given: 'Mother',
    family: 'Thornbury',
    species: 'hedgehog',
    traits: ['green-fingered', 'generous', 'early-bird'],
    stage: 'elder',
    bio: 'An herbalist who has a remedy for everything except other people, and is working on that.',
  },
  arrival: { count: { what: 'rank', atLeast: 99 } },
  hello: '',
  steps: [],
  finale: { letter: '' },
};
