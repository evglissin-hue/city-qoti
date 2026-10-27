import type { ChronicleTemplate } from './types';

// Lives (docs/spec/11-residents.md, Ages and life events): the Chronicle's lines for weddings,
// births and moves to the seaside, the rank-up and story characters, and the shorter lines the
// life.event notice carries for couples, apprenticeships and retirements. Nobody dies in City
// Qoti; elders go to live by the sea. Variants rotate (the sim walks each list before repeating),
// so a village with a dozen weddings never reads the same line twice in a row.
//
// Chronicle params by kind:
//   wedding        {a} {b} {when}        ("at the festival", "on a day of their own choosing")
//   birth          {child} {parents}     ("Clover and Basil Thistledown")
//   seaside        {name}                (one elder, or a pair: "Hilda and Bertram Bramble")
//   rank-up        {proclamation} {rank} {credit}
//   story-arrived  {name}
//   story-finale   {name}

export const birth: ChronicleTemplate = {
  kind: 'birth',
  text: [
    'Welcome, {child}! Born today to {parents}, weighing about as much as a loaf and already louder than one.',
    'A new face in {town}: {child}, born this morning to {parents}. The neighbors have started knitting.',
    "{parents} welcomed {child} into the world today. Everyone is doing well, apart from the household's plans for a full night's sleep.",
    'Born today: {child}, to {parents}. Early reports describe a firm grip and strong opinions about breakfast.',
    'The population of {town} went up by one very small resident this morning: {child}, child of {parents}. Visitors are asked to bring soup and whisper.',
    '{parents} have a new arrival: {child}, already declared the finest baby in the valley by a panel of two very biased judges.',
    '{child} arrived today, to the delight of {parents} and the mild alarm of everyone who shares a wall with them.',
  ],
  notable: true,
};

export const rankUp: ChronicleTemplate = {
  kind: 'rank-up',
  text: [
    "{proclamation} The County's letter was read aloud at the Town Hall twice, the second time with feeling. Credit to {credit}.",
    "{proclamation} The bells rang, the bunting went up and somebody's goat ate a little of it. Credit to {credit}.",
    '{proclamation} The sign at the valley gate has been repainted, with the word {rank} rather larger than strictly necessary. Credit to {credit}.',
  ],
  notable: true,
};

export const seaside: ChronicleTemplate = {
  kind: 'seaside',
  text: [
    '{name} has gone to live by the sea with family, leaving a favorite chair to the neighbors and opinions to everyone.',
    '{name} packed a trunk this morning and set off to live by the sea. Letters are promised, and from {name}, letters arrive.',
    '{name} moved to the seaside today, to a cottage with a view of the water and a grandchild who visits on Sundays.',
    '{town} waved {name} off to the coast this morning. The well will be quieter, and slightly less well informed.',
    '{name} has moved to the seaside to be near family. Asked for parting words: "Mind the roof" and "Water the beans", in that order.',
    'Off to the sea: {name}, with a hamper, a sun hat and directions written out twice. Fair winds, and do write.',
  ],
  notable: true,
};

export const storyArrived: ChronicleTemplate = {
  kind: 'story-arrived',
  text: [
    '{name} arrived today with a handcart of belongings and a reputation that had arrived the week before.',
    'New in town: {name}, who has taken a small house and, from the sound of things, already begun rearranging the valley.',
    '{name} came over the hill this morning and moved in. Neighbors report a great deal of luggage and a great deal of conversation.',
  ],
  notable: true,
};

export const storyFinale: ChronicleTemplate = {
  kind: 'story-finale',
  text: [
    '{name} declared their work in {town} finished today, then announced they were staying anyway. Nobody was surprised and everybody was pleased.',
    'A good day for {name}, who has seen their plans for {town} through from the first letter to the last. They celebrated with tea, and then a second, larger tea.',
    '{name} has done everything they came to {town} to do. Asked what next, they said "more", which the Chronicle takes as a promise.',
  ],
  notable: true,
};

export const wedding: ChronicleTemplate = {
  kind: 'wedding',
  text: [
    '{a} and {b} were married {when}. The vows were short, the speeches were not, and the cake was gone by nine.',
    'Wedding bells in {town}: {a} and {b} tied the knot {when}. A neighbor cried, then blamed the hay.',
    '{a} and {b} are married. They danced first; everyone else danced better, and nobody said so.',
    'Married {when}: {a} and {b}. The guests agree they saw it coming. The guests always do.',
    '{a} and {b} said yes {when}, in front of half the town and a goose who was not invited.',
    'A wedding {when}! {a} and {b} exchanged rings, promises and, after some negotiation, the last slice of cake.',
    'The Chronicle is pleased to announce the marriage of {a} and {b}, {when}. Gifts included three teapots, which will be regifted.',
    '{a} and {b} were married {when}. It rained for exactly one minute, which everyone agreed was lucky, because then it stopped.',
  ],
  notable: true,
};

/** Shorter lines for the life.event notice ({name}, {a}, {b}, {place}). */
export const lifePhrases = {
  /** Wedding {when}. */
  atFestival: 'at the festival',
  onTheirDay: 'on a day of their own choosing',
  /** Two residents become a couple. */
  couple: [
    '{a} and {b} have been seen walking home the long way, together. The neighbors have noticed. The neighbors always notice.',
    '{a} and {b} are a couple. Nobody is surprised except, apparently, {a} and {b}.',
    '{a} and {b} have started sharing an umbrella, which in {town} is practically an engagement.',
    'Word at the well is that {a} and {b} are walking out together. Word at the well is usually right.',
    '{a} has started bringing {b} flowers, and {b} has started pretending to be surprised. It is going well.',
    '{a} and {b} are officially a couple, according to everyone except {a} and {b}, who are being coy about it.',
  ],
  /** Added when the couple set up home together ({place}). */
  movedIn: [
    'They have moved into {place} together, with two of everything.',
    'They have set up home in {place} and are already disagreeing about the curtains, fondly.',
    'They have moved into {place} together. The kettle arrangements are still under negotiation.',
  ],
  /** A couple who could not live together at first find a home ({a}, {b}, {place}). */
  together: [
    '{a} and {b} have found a home of their own: {place}. The handcart made four trips.',
    '{a} and {b} have finally moved in together, into {place}. Their friends helped carry, and then helped eat.',
  ],
  apprentice: [
    '{name} has started an apprenticeship at the {place}. A season to learn the trade, or at least how to look busy in it.',
    '{name} is apprenticed to the {place} for the season. First lesson: where the broom lives.',
    '{name} has taken up an apprenticeship at the {place}, with a new apron and a great many questions.',
    'School taught {name} to read. The {place} will teach them everything else. The apprenticeship starts today.',
    '{name} begins a season as apprentice at the {place}. The old hands are already telling the same stories.',
  ],
  trained: [
    '{name} has finished their apprenticeship at the {place}, and has the calluses to prove it.',
    '{name} finished their apprenticeship today. They can now do the job, explain the job and complain about the job, which is mastery.',
    'Apprenticeship done: {name} knows the {place} inside out and has been trusted with the good tools.',
  ],
  retired: [
    '{name} has retired from the {place}, and plans to sit in the sun telling younger folk how it used to be done.',
    '{name} hung up their apron at the {place} today. They spent the first morning of retirement getting up early anyway.',
    'After many seasons at the {place}, {name} has retired. They promise not to drop by to check on things. They will drop by to check on things.',
    '{name} has stopped working at the {place} and started gardening, which they insist is completely different.',
    '{name} retired from the {place} today, with a cake, a speech and a firm intention to do nothing at all, starting tomorrow.',
  ],
  /** The County's letter when every Charter goal is met ({rank}). */
  charterReady: [
    'A letter from the County Clerk: "Every goal on your Charter is met. Present yourselves at the Town Hall to claim the rank of {rank}, and wipe your feet."',
  ],
  /** Plan approval reports ({who}, {plan}, {applied}, {skipped}). */
  planApproved: '{who} approved "{plan}": all of it is underway.',
  planPartly:
    '{who} approved "{plan}": {applied} done, {skipped} skipped because things had changed since it was drawn.',
  planNone: '{who} approved "{plan}", but nothing in it fits any more. Time for a fresh sketch.',
  /** A request met ({what}). */
  requestDone: 'Request fulfilled: {what}. Somebody deserves a biscuit.',
};
