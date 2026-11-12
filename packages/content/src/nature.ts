import type { HabitatDef, HabitatSource, ModuleDef, WildlifeDef } from './types';

// Nature and the Field Guide, and customization phase 2 (C5C). docs/spec/12-hearth.md, Nature and
// the Field Guide; docs/spec/10-world-and-building.md, Customization. Seasons: 0 spring, 1 summer,
// 2 autumn, 3 winter. Hours are [from, to) and wrap past midnight. Rarity is the chance per hour,
// permille, of a sighting in one suitable watched chunk (more chunks raise it, up to three).
// Resident species (badger, fox, hedgehog, mouse, otter, rabbit, squirrel) never appear here.

// --- Habitats -----------------------------------------------------------------------------------

// prettier-ignore
export const habitats: readonly HabitatDef[] = [
  { id: 'pollinator', name: 'Pollinator', blurb: 'Flowers, orchards, hives and verges: anything worth a bee visiting.' },
  { id: 'wetland', name: 'Wetland', blurb: 'Ponds, reeds and the quiet shallows of the river.' },
  { id: 'hedgerow', name: 'Hedgerow', blurb: 'Hedges and the lanes they line, the motorways of small birds.' },
  { id: 'woodland', name: 'Woodland', blurb: 'Grown and old trees, the older the better.' },
  { id: 'meadow', name: 'Meadow', blurb: 'Long grass nobody has mown, and wildflower verges.' },
  { id: 'garden', name: 'Garden nooks', blurb: 'Low walls, gardens, window boxes and ivy: the snug corners of town.' },
];

/** What scores each habitat, per chunk (16 x 16 tiles), summed and capped at 255. */
// prettier-ignore
export const habitatSources: readonly HabitatSource[] = [
  { habitat: 'garden', from: 'building', ref: 'garden', points: 25 },
  { habitat: 'garden', from: 'custom', ref: 'windowBoxes', points: 10 },
  { habitat: 'garden', from: 'decor', ref: 'birdbath', points: 15 },
  { habitat: 'garden', from: 'decor', ref: 'planter', points: 8 },
  { habitat: 'garden', from: 'decor', ref: 'wall', points: 8 },
  { habitat: 'garden', from: 'module', ref: 'flower-boxes', points: 30 },
  { habitat: 'garden', from: 'module', ref: 'ivy', points: 30 },
  { habitat: 'garden', from: 'site', ref: 'reading-nook', points: 30 },
  { habitat: 'hedgerow', from: 'decor', ref: 'fence', points: 3 },
  { habitat: 'hedgerow', from: 'decor', ref: 'hedge', points: 14 },
  { habitat: 'hedgerow', from: 'site', ref: 'hedgerow-lane', points: 80 },
  { habitat: 'meadow', from: 'decor', ref: 'verge', points: 12 },
  { habitat: 'meadow', from: 'terrain', ref: 'meadow', points: 1 },
  { habitat: 'pollinator', from: 'building', ref: 'hives', points: 40 },
  { habitat: 'pollinator', from: 'building', ref: 'orchard', points: 60 },
  { habitat: 'pollinator', from: 'custom', ref: 'windowBoxes', points: 6 },
  { habitat: 'pollinator', from: 'decor', ref: 'blossom', points: 8 },
  { habitat: 'pollinator', from: 'decor', ref: 'flower', points: 10 },
  { habitat: 'pollinator', from: 'decor', ref: 'fruit', points: 8 },
  { habitat: 'pollinator', from: 'site', ref: 'orchard-path', points: 30 },
  { habitat: 'wetland', from: 'decor', ref: 'reeds', points: 25 },
  { habitat: 'wetland', from: 'decor', ref: 'water-feature', points: 10 },
  { habitat: 'wetland', from: 'site', ref: 'pond-garden', points: 40 },
  { habitat: 'wetland', from: 'water', ref: 'pond', points: 14 },
  { habitat: 'wetland', from: 'water', ref: 'river', points: 3 },
  { habitat: 'wetland', from: 'water', ref: 'riverDeep', points: 1 },
  { habitat: 'woodland', from: 'decor', ref: 'tree', points: 6 },
  { habitat: 'woodland', from: 'tree', ref: 'mature', points: 1 },
];

// --- Wildlife -----------------------------------------------------------------------------------

const ALL_YEAR = [0, 1, 2, 3];
const MILD = [0, 1, 2];

// prettier-ignore
export const blueTit: WildlifeDef = { id: 'blue-tit', name: 'Blue tit', kind: 'bird', habitats: [['garden', 40], ['woodland', 30]], seasons: ALL_YEAR, hours: [8, 16], rarity: 120, effect: [['pests', 250]], flavor: 'Hangs upside down to eat, because the right way up is for amateurs.', hint: 'Gardens with a few trees about, any time of year.' };
// prettier-ignore
export const bumblebee: WildlifeDef = { id: 'bumblebee', name: 'Bumblebee', kind: 'insect', habitats: [['pollinator', 40]], seasons: MILD, hours: [8, 18], rarity: 120, flavor: 'Too round to fly, according to nobody who has watched one try.', hint: 'Flowers by day, from spring to autumn.' };
// prettier-ignore
export const commonBlue: WildlifeDef = { id: 'common-blue', name: 'Common blue', kind: 'insect', habitats: [['meadow', 120]], seasons: [1], hours: [10, 16], rarity: 60, flavor: 'A scrap of summer sky that settled on the clover.', hint: 'Unmown meadow at midday in summer.' };
// prettier-ignore
export const commonFrog: WildlifeDef = { id: 'common-frog', name: 'Common frog', kind: 'amphibian', habitats: [['wetland', 90], ['garden', 30]], seasons: [0, 1], hours: [18, 23], rarity: 100, effect: [['pests', 350]], flavor: 'Eats slugs, sings badly, asks for nothing but a damp corner.', hint: 'A pond near a garden, on spring and summer evenings.' };
// prettier-ignore
export const commonToad: WildlifeDef = { id: 'common-toad', name: 'Common toad', kind: 'amphibian', habitats: [['wetland', 40], ['woodland', 40]], seasons: MILD, hours: [19, 24], rarity: 60, effect: [['pests', 250]], flavor: 'Walks rather than hops, with the air of someone who has seen it all.', hint: 'Water with woods nearby, after dusk.' };
// prettier-ignore
export const dragonfly: WildlifeDef = { id: 'dragonfly', name: 'Dragonfly', kind: 'insect', habitats: [['wetland', 130]], seasons: [1], hours: [10, 17], rarity: 80, flavor: 'Four wings, two speeds: hover and gone.', hint: 'Still water on summer afternoons.' };
// prettier-ignore
export const elephantHawkMoth: WildlifeDef = { id: 'elephant-hawk-moth', name: 'Elephant hawk-moth', kind: 'insect', habitats: [['garden', 70], ['pollinator', 80]], seasons: [1], hours: [21, 3], rarity: 40, flavor: 'Pink and olive, like a moth dressed for a wedding it was not invited to.', hint: 'Flowery gardens on summer nights.' };
// prettier-ignore
export const firefly: WildlifeDef = { id: 'firefly', name: 'Firefly', kind: 'insect', habitats: [['meadow', 80], ['hedgerow', 60]], seasons: [1], hours: [21, 1], rarity: 60, flavor: 'The valley has lanterns, and then it has these.', hint: 'Long grass by a hedge, late on summer nights.' };
// prettier-ignore
export const gardenSnail: WildlifeDef = { id: 'garden-snail', name: 'Garden snail', kind: 'insect', habitats: [['garden', 30]], seasons: [0, 2], hours: [6, 10], rarity: 100, flavor: 'Not an insect, but the Field Guide only came with five tabs.', hint: 'Garden walls on damp spring and autumn mornings.' };
// prettier-ignore
export const glowWorm: WildlifeDef = { id: 'glow-worm', name: 'Glow-worm', kind: 'insect', habitats: [['hedgerow', 80], ['woodland', 60]], seasons: [1], hours: [22, 2], rarity: 40, flavor: 'Not a worm, but it does glow, so half marks.', hint: 'Hedge bottoms near woods, around midnight in summer.' };
// prettier-ignore
export const goldfinch: WildlifeDef = { id: 'goldfinch', name: 'Goldfinch', kind: 'bird', habitats: [['meadow', 80], ['pollinator', 80]], seasons: [1, 2], hours: [9, 16], rarity: 70, flavor: 'A charm of them, which is the correct word and also accurate.', hint: 'Seed heads in a flowery meadow, summer into autumn.' };
// prettier-ignore
export const greatSpottedWoodpecker: WildlifeDef = { id: 'great-spotted-woodpecker', name: 'Great spotted woodpecker', kind: 'bird', habitats: [['woodland', 200]], seasons: ALL_YEAR, hours: [8, 14], rarity: 40, flavor: 'Knocks on trees all morning and never waits for an answer.', hint: 'Deep, old woodland, mornings.' };
// prettier-ignore
export const greyHeron: WildlifeDef = { id: 'grey-heron', name: 'Grey heron', kind: 'bird', habitats: [['wetland', 130], ['meadow', 30]], seasons: ALL_YEAR, hours: [6, 10], rarity: 50, flavor: 'Stands so still the fish forget it, which is the whole plan.', hint: 'Wet ground by long grass, early in the morning.' };
// prettier-ignore
export const honeybee: WildlifeDef = { id: 'honeybee', name: 'Honeybee', kind: 'insect', habitats: [['pollinator', 30]], seasons: MILD, hours: [9, 17], rarity: 150, needs: 'hive', flavor: 'Works for the apiary, answers to nobody, dances to explain.', hint: 'An apiary with flowers around it.' };
// prettier-ignore
export const kingfisher: WildlifeDef = { id: 'kingfisher', name: 'Kingfisher', kind: 'bird', habitats: [['wetland', 170]], seasons: MILD, hours: [7, 11], rarity: 30, flavor: 'A flash of blue over clean water. The river is in good hands.', hint: 'Rich wetland: ponds and reeds beside the river, mornings.' };
// prettier-ignore
export const ladybird: WildlifeDef = { id: 'ladybird', name: 'Ladybird', kind: 'insect', habitats: [['garden', 30], ['pollinator', 20]], seasons: MILD, hours: [8, 18], rarity: 100, effect: [['pests', 200]], flavor: 'Eats aphids by the hundred and still has time to look smart.', hint: 'Gardens with flowers in them, by day.' };
// prettier-ignore
export const mallard: WildlifeDef = { id: 'mallard', name: 'Mallard', kind: 'bird', habitats: [['wetland', 60]], seasons: ALL_YEAR, hours: [7, 19], rarity: 150, flavor: 'Convinced every visitor has bread. Usually right.', hint: 'Any good stretch of water, by day.' };
// prettier-ignore
export const muteSwan: WildlifeDef = { id: 'mute-swan', name: 'Mute swan', kind: 'bird', habitats: [['wetland', 200]], seasons: [0, 2, 3], hours: [9, 16], rarity: 30, flavor: 'Not mute, merely selective about whom it hisses at.', hint: 'A great deal of water, outside high summer.' };
// prettier-ignore
export const peacockButterfly: WildlifeDef = { id: 'peacock-butterfly', name: 'Peacock butterfly', kind: 'insect', habitats: [['pollinator', 60], ['hedgerow', 40]], seasons: [0, 1], hours: [9, 17], rarity: 80, flavor: 'Wears eyes on its wings so nobody looks it in the real ones.', hint: 'Lots of flowers near a hedge, spring and summer.' };
// prettier-ignore
export const perch: WildlifeDef = { id: 'perch', name: 'Perch', kind: 'fish', habitats: [['wetland', 40]], seasons: [1, 2], hours: [10, 16], rarity: 120, needs: 'fisher', flavor: 'Striped, spiny and the fisher\'s favorite argument.', hint: 'A fisher at work on the river, summer or autumn.' };
// prettier-ignore
export const pipistrelle: WildlifeDef = { id: 'pipistrelle', name: 'Pipistrelle', kind: 'mammal', habitats: [['wetland', 30], ['pollinator', 60]], seasons: MILD, hours: [20, 24], rarity: 60, effect: [['pests', 200]], flavor: 'Weighs less than a coin and eats three thousand midges a night.', hint: 'Water and flowers together, at dusk.' };
// prettier-ignore
export const robin: WildlifeDef = { id: 'robin', name: 'Robin', kind: 'bird', habitats: [['garden', 40]], seasons: ALL_YEAR, hours: [7, 17], rarity: 150, flavor: 'Follows the gardener, inspects the work, never helps.', hint: 'A garden nook: low walls, planters, a birdbath.' };
// prettier-ignore
export const roeDeer: WildlifeDef = { id: 'roe-deer', name: 'Roe deer', kind: 'mammal', habitats: [['woodland', 160], ['meadow', 80]], seasons: [0, 2, 3], hours: [5, 8], rarity: 30, flavor: 'There for a heartbeat at the wood\'s edge, then only a white rump and a rumor.', hint: 'Where old woods meet meadow, at first light.' };
// prettier-ignore
export const smoothNewt: WildlifeDef = { id: 'smooth-newt', name: 'Smooth newt', kind: 'amphibian', habitats: [['wetland', 150], ['hedgerow', 20]], seasons: [0, 1], hours: [20, 24], rarity: 50, flavor: 'A small dragon that has made its peace with being small.', hint: 'A well-planted pond with a hedge nearby, spring nights.' };
// prettier-ignore
export const songThrush: WildlifeDef = { id: 'song-thrush', name: 'Song thrush', kind: 'bird', habitats: [['hedgerow', 40], ['garden', 30]], seasons: [0, 1], hours: [5, 9], rarity: 80, effect: [['pests', 300]], flavor: 'Sings every phrase twice, in case you missed it the first time.', hint: 'Hedges by gardens, at the dawn chorus.' };
// prettier-ignore
export const stagBeetle: WildlifeDef = { id: 'stag-beetle', name: 'Stag beetle', kind: 'insect', habitats: [['woodland', 140]], seasons: [1], hours: [19, 23], rarity: 30, flavor: 'Antlers for show, mostly. It is a very gentle beetle.', hint: 'Old woodland on summer evenings.' };
// prettier-ignore
export const stoat: WildlifeDef = { id: 'stoat', name: 'Stoat', kind: 'mammal', habitats: [['hedgerow', 90], ['woodland', 60]], seasons: [2, 3], hours: [8, 15], rarity: 30, flavor: 'Turns white for winter, a little late and a little smug.', hint: 'Thick hedges near woods, autumn and winter.' };
// prettier-ignore
export const swallow: WildlifeDef = { id: 'swallow', name: 'Swallow', kind: 'bird', habitats: [['meadow', 40], ['wetland', 30]], seasons: [1], hours: [8, 20], rarity: 100, effect: [['pests', 250]], flavor: 'Back from somewhere warm with no souvenirs and no regrets.', hint: 'Meadow by water, all summer long.' };
// prettier-ignore
export const tawnyOwl: WildlifeDef = { id: 'tawny-owl', name: 'Tawny owl', kind: 'bird', habitats: [['woodland', 160]], seasons: [2, 3], hours: [20, 4], rarity: 40, flavor: 'One calls twit, another answers woo. It takes two owls to be famous.', hint: 'Old woods on autumn and winter nights.' };
// prettier-ignore
export const trout: WildlifeDef = { id: 'trout', name: 'Brown trout', kind: 'fish', habitats: [['wetland', 50]], seasons: MILD, hours: [6, 12], rarity: 120, needs: 'fisher', flavor: 'Lives in clean, cold water and has opinions about everything else.', hint: 'A fisher at work on a good stretch of river, mornings.' };
// prettier-ignore
export const waterVole: WildlifeDef = { id: 'water-vole', name: 'Water vole', kind: 'mammal', habitats: [['wetland', 140], ['meadow', 40]], seasons: MILD, hours: [7, 12], rarity: 40, flavor: 'Plop. That was it. That was the whole sighting.', hint: 'Reedy banks by long grass, mornings.' };
// prettier-ignore
export const wren: WildlifeDef = { id: 'wren', name: 'Wren', kind: 'bird', habitats: [['hedgerow', 50]], seasons: ALL_YEAR, hours: [7, 17], rarity: 100, effect: [['pests', 300]], flavor: 'The smallest bird with the loudest opinions.', hint: 'Hedgerows, any time of year.' };

// --- Modules (customization phase 2) ------------------------------------------------------------
// Coins are paid when the work is ordered; the goods come by porter, like a home upgrade. A
// module with no goods goes on at once. Stand-in art until C5E draws them (`params.module`).

// prettier-ignore
export const arcade: ModuleDef = { id: 'arcade', name: 'Arcade', slot: 'front', cost: { coins: 20, goods: [['stone', 12], ['timber', 4]] }, charm: [{ category: 'comfort', value: 4, radius: 2 }], art: { kit: 'module', params: { module: 'arcade' } } };
// prettier-ignore
export const balcony: ModuleDef = { id: 'balcony', name: 'Balcony', slot: 'side', cost: { coins: 10, goods: [['timber', 6]] }, charm: [{ category: 'view', value: 2, radius: 1 }], art: { kit: 'module', params: { module: 'balcony' } } };
// prettier-ignore
export const bayWindow: ModuleDef = { id: 'bay-window', name: 'Bay window', slot: 'side', cost: { coins: 10, goods: [['timber', 4], ['stone', 4]] }, charm: [{ category: 'comfort', value: 2, radius: 1 }], art: { kit: 'module', params: { module: 'bay-window' } } };
// prettier-ignore
export const dormer: ModuleDef = { id: 'dormer', name: 'Dormer', slot: 'roof', cost: { coins: 8, goods: [['timber', 6]] }, charm: [{ category: 'comfort', value: 1, radius: 1 }], art: { kit: 'module', params: { module: 'dormer' } } };
/** Cosmetic in I3: it houses nobody extra (docs/spec/10-world-and-building.md). */
// prettier-ignore
export const extraFloor: ModuleDef = { id: 'extra-floor', name: 'Extra floor', slot: 'top', cost: { coins: 25, goods: [['timber', 12], ['brick', 8]] }, art: { kit: 'module', params: { module: 'extra-floor' } } };
// prettier-ignore
export const flowerBoxes: ModuleDef = { id: 'flower-boxes', name: 'Flower boxes', slot: 'wall', cost: { coins: 4, goods: [['timber', 2]] }, charm: [{ category: 'nature', value: 3, radius: 1 }], art: { kit: 'module', params: { module: 'flower-boxes' } } };
// prettier-ignore
export const ivy: ModuleDef = { id: 'ivy', name: 'Ivy', slot: 'wall', cost: { coins: 2 }, charm: [{ category: 'nature', value: 3, radius: 1 }], art: { kit: 'module', params: { module: 'ivy' } } };
// prettier-ignore
export const porch: ModuleDef = { id: 'porch', name: 'Porch', slot: 'front', cost: { coins: 8, goods: [['timber', 6]] }, charm: [{ category: 'comfort', value: 3, radius: 2 }], art: { kit: 'module', params: { module: 'porch' } } };
// prettier-ignore
export const tower: ModuleDef = { id: 'tower', name: 'Tower', slot: 'top', cost: { coins: 30, goods: [['stone', 16], ['timber', 6]] }, charm: [{ category: 'view', value: 4, radius: 3 }], art: { kit: 'module', params: { module: 'tower' } } };
