import type { SpeciesDef } from './types';

// The seven woodland folk of I1 (docs/spec/11-residents.md). Species shape tastes, never ability.
// Tastes feed home desirability, leisure spots and the beauty of home; each one is measured by the
// sim (packages/sim/src/systems/residents/desirability.ts) as a presence from 0 to 1 times its
// weight. An `absent` taste counts when the thing is missing. Given names: 200 across species.

export const badger: SpeciesDef = {
  id: 'badger',
  name: 'Badger',
  plural: 'badgers',
  likes: [
    { kind: 'tag', what: 'workshop', within: 8, weight: 6 },
    { kind: 'tag', what: 'wall', within: 3, weight: 4 },
    { kind: 'charm', what: 'comfort', within: 3, weight: 4 },
  ],
  dislikes: [{ kind: 'crowd', within: 4, weight: -6 }],
  // prettier-ignore
  givenNames: [
    'Agatha', 'Barnaby', 'Bertram', 'Brock', 'Cuthbert', 'Dorcas', 'Edmund', 'Elspeth', 'Gideon',
    'Godfrey', 'Hilda', 'Humphrey', 'Ida', 'Jasper', 'Mabel', 'Magnus', 'Mildred', 'Morwen',
    'Percival', 'Prudence', 'Reginald', 'Rosamund', 'Silas', 'Thaddeus', 'Tobias', 'Ursula',
    'Walter', 'Winifred',
  ],
  bios: [
    '{name} believes most problems can be solved with a sturdy wall and a cup of tea.',
    "{name} once built a shed so solid it has outlived two of the neighbors' houses.",
    '{name} likes a home with thick walls and a workshop within earshot.',
    '{name} says crowds are fine in principle and exhausting in practice.',
  ],
  art: { kit: 'resident', params: { species: 'badger' } },
};

export const fox: SpeciesDef = {
  id: 'fox',
  name: 'Fox',
  plural: 'foxes',
  likes: [
    { kind: 'tag', what: 'market', within: 10, weight: 8 },
    { kind: 'crowd', within: 4, weight: 4 },
    { kind: 'tag', what: 'storehouse', within: 10, weight: 3 },
  ],
  dislikes: [{ kind: 'crowd', within: 6, weight: -6, absent: true }],
  // prettier-ignore
  givenNames: [
    'Amber', 'Basil', 'Cassius', 'Celeste', 'Copper', 'Dashiell', 'Ember', 'Felix', 'Ginger',
    'Isadora', 'Juno', 'Lysander', 'Marigold', 'Monty', 'Odette', 'Ottilie', 'Reynard', 'Roux',
    'Rufus', 'Russet', 'Saffron', 'Scarlett', 'Sienna', 'Sterling', 'Tawny', 'Vesper', 'Vivian',
    'Wilhelmina',
  ],
  bios: [
    '{name} can price a basket of apples from across the square.',
    '{name} likes a busy street, a good haggle and the last word.',
    '{name} has never once paid full price, and says so often.',
    '{name} finds quiet lanes suspicious. Where is everybody?',
  ],
  art: { kit: 'resident', params: { species: 'fox' } },
};

export const hedgehog: SpeciesDef = {
  id: 'hedgehog',
  name: 'Hedgehog',
  plural: 'hedgehogs',
  likes: [
    { kind: 'tag', what: 'hedge', within: 4, weight: 8 },
    { kind: 'tag', what: 'garden', within: 4, weight: 4 },
    { kind: 'tag', what: 'flower', within: 3, weight: 3 },
    { kind: 'quiet', within: 4, weight: 3 },
  ],
  dislikes: [
    { kind: 'charm', what: 'light', within: 2, weight: -4 },
    { kind: 'crowd', within: 3, weight: -3 },
  ],
  // prettier-ignore
  givenNames: [
    'Bracken', 'Bramble', 'Briony', 'Burdock', 'Burnet', 'Conker', 'Dewberry', 'Fennel', 'Gorse',
    'Hawthorn', 'Hettie', 'Hob', 'Holly', 'Mallow', 'Mugwort', 'Nettle', 'Pennywort', 'Prickle',
    'Quince', 'Sage', 'Sloe', 'Sorrel', 'Spindle', 'Teasel', 'Thornbury', 'Tuppence', 'Twig',
    'Yarrow',
  ],
  bios: [
    '{name} does the evening rounds of every hedge in town, and has notes.',
    '{name} keeps late hours and a very small lantern.',
    '{name} prefers a garden gate to a front door.',
    '{name} is prickly on the outside and mostly prickly on the inside, but kind.',
  ],
  art: { kit: 'resident', params: { species: 'hedgehog' } },
};

export const mouse: SpeciesDef = {
  id: 'mouse',
  name: 'Mouse',
  plural: 'mice',
  likes: [
    { kind: 'tag', what: 'bakery', within: 10, weight: 8 },
    { kind: 'crowd', within: 4, weight: 6 },
  ],
  dislikes: [{ kind: 'crowd', within: 3, weight: -6, absent: true }],
  // prettier-ignore
  givenNames: [
    'Bea', 'Biscuit', 'Button', 'Clementine', 'Crumb', 'Dot', 'Fig', 'Flora', 'Hattie', 'Kit',
    'Lettice', 'Lottie', 'Maisie', 'Millie', 'Muffin', 'Nell', 'Nibs', 'Peg', 'Pippa', 'Poppy',
    'Posy', 'Sixpence', 'Smidge', 'Sprout', 'Tansy', 'Teacake', 'Thimble', 'Tilly', 'Wren',
  ],
  bios: [
    '{name} can tell what the bakery is making from three streets away.',
    '{name} likes neighbors close enough to borrow sugar from without a coat.',
    '{name} finds open fields frankly too much sky.',
    '{name} keeps a pocketful of crumbs for emergencies. Every day is an emergency.',
  ],
  art: { kit: 'resident', params: { species: 'mouse' } },
};

export const otter: SpeciesDef = {
  id: 'otter',
  name: 'Otter',
  plural: 'otters',
  likes: [
    { kind: 'water', within: 4, weight: 10 },
    { kind: 'tag', what: 'mooring', within: 4, weight: 4 },
    { kind: 'charm', what: 'view', within: 3, weight: 4 },
  ],
  dislikes: [{ kind: 'water', within: 12, weight: -6, absent: true }],
  // prettier-ignore
  givenNames: [
    'Barnacle', 'Brook', 'Coral', 'Cove', 'Delphine', 'Eddy', 'Finn', 'Gully', 'Isla', 'Kelp',
    'Lochlan', 'Marina', 'Marlow', 'Moira', 'Nerys', 'Ondine', 'Osric', 'Pebble', 'Perch', 'Purl',
    'Rill', 'Ripple', 'Sedge', 'Skipper', 'Tamsin', 'Tarn', 'Wade', 'Wendell', 'Willa',
  ],
  bios: [
    '{name} measures distances in how far it is to the river.',
    '{name} swims before breakfast and talks about it after.',
    '{name} likes a window with a view of moving water, or failing that, a puddle.',
    '{name} has strong opinions about fish and stronger ones about where to catch them.',
  ],
  art: { kit: 'resident', params: { species: 'otter' } },
};

export const rabbit: SpeciesDef = {
  id: 'rabbit',
  name: 'Rabbit',
  plural: 'rabbits',
  likes: [
    { kind: 'tag', what: 'garden', within: 4, weight: 6 },
    { kind: 'tag', what: 'flower', within: 3, weight: 6 },
    { kind: 'charm', what: 'nature', within: 3, weight: 4 },
    { kind: 'quiet', within: 4, weight: 4 },
  ],
  dislikes: [{ kind: 'charm', what: 'noise', within: 3, weight: -8 }],
  // prettier-ignore
  givenNames: [
    'Barley', 'Bluebell', 'Bramley', 'Bunting', 'Buttercup', 'Campion', 'Cicely', 'Clover', 'Daisy',
    'Dill', 'Fern', 'Fleur', 'Hazel', 'Heather', 'Honey', 'Ivy', 'Juniper', 'Lavender', 'Linnet',
    'Meadow', 'Mint', 'Parsley', 'Pip', 'Primrose', 'Rosie', 'Rue', 'Sweetpea', 'Thyme', 'Violet',
    'Wilbur',
  ],
  bios: [
    '{name} has named every flower in the front garden, some twice.',
    '{name} likes a quiet lane and a loud vegetable patch.',
    '{name} can hear a sawpit from a mile off and would rather not.',
    '{name} keeps a bunch of something fresh on the windowsill, always.',
  ],
  art: { kit: 'resident', params: { species: 'rabbit' } },
};

export const squirrel: SpeciesDef = {
  id: 'squirrel',
  name: 'Squirrel',
  plural: 'squirrels',
  likes: [
    { kind: 'trees', within: 4, weight: 8 },
    { kind: 'tag', what: 'fruit', within: 6, weight: 4 },
    { kind: 'height', weight: 4 },
  ],
  dislikes: [{ kind: 'trees', within: 6, weight: -6, absent: true }],
  // prettier-ignore
  givenNames: [
    'Acorn', 'Alder', 'Almond', 'Aspen', 'Bartholomew', 'Beech', 'Cedar', 'Chestnut', 'Cinnamon',
    'Cobnut', 'Filbert', 'Hickory', 'Larch', 'Linden', 'Maple', 'Myrtle', 'Nutkin', 'Nutmeg',
    'Oakley', 'Pippin', 'Rowan', 'Rusty', 'Scamper', 'Spruce', 'Sycamore', 'Tufty', 'Whisk',
    'Willow',
  ],
  bios: [
    '{name} has buried snacks all over town and remembers about half of them.',
    '{name} likes a home with a tree outside and a better tree behind it.',
    '{name} thinks a street without trees is just a corridor.',
    '{name} prefers the high ground, for the view and for the feeling of being right.',
  ],
  art: { kit: 'resident', params: { species: 'squirrel' } },
};
