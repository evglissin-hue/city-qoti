import type { ChronicleTemplate } from './types';

// The Chronicle (docs/spec/12-hearth.md): the town's history, written like a small-town gazette
// as it happens. One variant is picked with the sim's 'misc' stream, so both laptops print the same
// words. {placeholders} come from the caller's params (and {town} and {valley} from settings).
//
// Params by kind:
//   founding            {season} {founders}
//   household-arrived   {family} {place}            (C3A)
//   household-left      {family} {place}            (C3A)
//   first-of            {good}                      (C3C)
//   pattern-discovered  {pattern} {place} {credit} {flavor}
//   achievement         {achievement} {description} {credit}
//   wishes-digest       {wishes} {examples}         ("three wishes", "a bench by the river for Clover and ...")
//   season-summary      {season} {year} {people} {coins} {pages} {wishes} {books}
//                       ("nine residents", "one page", "no wishes")
//
// {credit} reads like "Ada" or "Ada and Bo, between them", so it always ends a sentence.

export const achievement: ChronicleTemplate = {
  kind: 'achievement',
  text: [
    'A new plaque went up in the Town Hall: {achievement}. {description} Credit to {credit}.',
    'The plaque-maker was sent for. {achievement}: {description} Hung with pride by {credit}.',
    '{town} has earned {achievement}. {description} Everyone pretended not to be pleased, especially {credit}.',
    'Notice is hereby given that {town} has achieved {achievement}. {description} With thanks to {credit}.',
  ],
  notable: true,
};

export const firstOf: ChronicleTemplate = {
  kind: 'first-of',
  text: [
    'The first {good} of {town} arrived today. Someone kept a little aside, just to look at.',
    'A historic day: {town} produced its very first {good}. Small crowd, large opinions.',
    'First {good}, {town} edition. It was inspected, admired and then put straight to work.',
    'Our correspondent reports the first {good} in {town}. Everyone agrees it is the best so far.',
  ],
  notable: true,
};

export const founding: ChronicleTemplate = {
  kind: 'founding',
  text: [
    "{town} was founded in {valley} on a {season} morning, with mud on everyone's boots and plans in {founders}'s pockets.",
    'First edition. {founders} unrolled a map of {valley} on a {season} morning and declared it {town}. The map has since been folded wrong.',
    'On a {season} morning, {founders} drove the first stake into the soil of {valley}. {town} has been growing around it ever since.',
  ],
  notable: true,
};

export const householdArrived: ChronicleTemplate = {
  kind: 'household-arrived',
  text: [
    'The {family} family arrived through the valley gate and moved into {place}.',
    'New in town: the {family} family, who have taken {place} and already rearranged the furniture twice.',
    'The {family} family came over the hill with a handcart and a kettle and settled into {place}.',
    'Welcome to the {family} family, now of {place}. The neighbors have been informed, mostly by the neighbors.',
  ],
  notable: true,
};

export const householdLeft: ChronicleTemplate = {
  kind: 'household-left',
  text: [
    "The {family} family packed up and left {town}. They said it wasn't personal. It was a little personal.",
    'The {family} family have left {place} and the valley. The door was closed gently, which somehow made it worse.',
    'Farewell to the {family} family, who found {town} not quite the place for them. We will try harder.',
  ],
  notable: true,
};

export const patternDiscovered: ChronicleTemplate = {
  kind: 'pattern-discovered',
  text: [
    'New in the Pattern Book: {pattern}, found {place}. {flavor} Credit to {credit}.',
    'Something worth writing down was noticed {place}. The Pattern Book calls it {pattern}. {flavor} Noticed by {credit}.',
    'A page was added to the Pattern Book today. {pattern}, {place}. {flavor} With thanks to {credit}.',
    'It has a name now: {pattern}. Found {place}, credited to {credit}. {flavor}',
  ],
  notable: true,
};

export const seasonSummary: ChronicleTemplate = {
  kind: 'season-summary',
  text: [
    '{season} of year {year} is behind us: {people}, {coins} coins in the treasury, {wishes} granted so far and {pages} in the Pattern Book. {books}',
    'Looking back on {season}, year {year}: {town} counts {people}, the treasury holds {coins} coins and the Pattern Book has {pages}. {books}',
    'So ends {season} of year {year}. The count stands at {people} and {coins} coins, with {wishes} granted to date. {books}',
  ],
  notable: true,
};

export const wishesDigest: ChronicleTemplate = {
  kind: 'wishes-digest',
  text: [
    'This week in {town}, {wishes} came true: {examples}.',
    'The week in wishes: {examples}. That makes {wishes}, and a great many thank-you letters.',
    'Our weekly tally of granted wishes stands at {wishes}, namely {examples}.',
  ],
};

/**
 * Short phrases the Chronicle and letters stitch into templates, chosen by the sim. Each list is
 * picked from with the 'misc' stream, like the templates. Placeholders as noted.
 */
export const chroniclePhrases = {
  /** Season summary {books}, when the season ended with more income than expenses. */
  booksSurplus: [
    'The books balanced, with a little left over for a rainy day.',
    'The ledger closed in the black. Somebody allowed themselves a second biscuit.',
    'Income outran expenses, and the treasurer was seen humming.',
  ],
  /** Season summary {books}, when it did not. */
  booksDeficit: [
    'The ledger closed in the red. Belts will be tightened, though not unkindly.',
    'Expenses won the season by a nose. There is always next season.',
    'The treasury came out lighter than it went in. Noted, sighed at, filed.',
  ],
  /** Season summary {books} when there was no money moving at all. */
  booksQuiet: ['The books were quiet, which is its own kind of good news.'],
  /** Number words for counts in prose, index = count. */
  numbers: [
    'no',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
  ],
  /** Credit when both seats placed pieces: {a} and {b} are seat names. */
  together: ['{a} and {b}, between them', '{a} and {b} together'],
  /** Pattern discovery notice for both seats: {pattern}, {unlocks}. */
  patternNotice: ['A new page in the Pattern Book: {pattern}. {unlocks}'],
  /** Appended to the notice when the pattern unlocks pieces: {pieces}. */
  unlocksNotice: ['Unlocked: {pieces}.'],
  /** Achievement notice for both seats: {achievement}. */
  achievementNotice: ['A plaque for the Town Hall: {achievement}.'],
  /** The end of a digest's examples when more wishes came true than it names. */
  digestMore: ['more besides', 'a few others'],
  /** Thank-you letter sign-offs: {name} (given name), {family}. */
  letterSignoff: ['Yours, {name}', 'Warmly, {name}', 'With thanks, {name} {family}', 'Gratefully, {name}'],
  /** A curious resident's thank-you letter ends with a hint: {hint} (lowercase start). */
  curiousPostscript: [
    'P.S. Something I keep noticing: {hint}',
    'P.S. A thought I had on my walk: {hint}',
    'P.S. Not that anyone asked, but {hint}',
  ],
  /** While-you-were-away letter. {seat} the reader, {days} "three days", {news} a list, {partner} the other seat. */
  awayGreeting: ['Dear {seat},'],
  awayDays: ['You were away for {days}.', 'It has been {days} since you last looked in.'],
  awayNews: ['While you were gone, {news}.', 'In your absence, {news}.'],
  awayQuiet: [
    'It was a quiet spell. The valley mostly got on with being lovely.',
    'Not much happened, which in a valley like this is a kind of news.',
  ],
  awayPartner: [
    '{partner} held the fort.',
    '{partner} kept the kettle warm.',
    '{partner} kept an eye on things.',
  ],
  awayArrived: ['one household moved in', '{n} households moved in'],
  awayLeft: ['one household moved away', '{n} households moved away'],
  awayPatterns: ['the Pattern Book gained a page', 'the Pattern Book gained {n} pages'],
  awayWishes: ['one wish came true', '{n} wishes came true'],
  awayAchievements: ['a new plaque went up in the Town Hall', '{n} new plaques went up in the Town Hall'],
  /** Place names: {building} is a building name in lowercase, {family} a family name. */
  atBuilding: ['at the {building}', 'by the {building}'],
  atHome: ["outside the {family} family's {building}", 'by the {family} {building}'],
  nearHome: ["a few steps from the {family} family's {building}", 'near the {family} {building}'],
  nearBuilding: ['near the {building}', 'not far from the {building}'],
  alongLane: ['along the lane', 'on the lane'],
  alongPath: ['along the path', 'on the footpath'],
  byWater: ['by the river', 'down by the water'],
  inTheOpen: ['out in the valley', 'somewhere out past the last house'],
} as const;

/** I3 (C5.0): either seat changed the threat dial (docs/spec/14-challenge.md, Difficulty dials). */
export const threatDial: ChronicleTemplate = {
  kind: 'threat-dial',
  text: [
    '{who} set the threat dial to {dial}. The Watch made a note of it.',
    'By order of {who}, the threat dial now reads {dial}. The crows were informed.',
    'The threat dial turned to {dial}, on the say-so of {who}. Somewhere in the woods, a bandit sighed.',
  ],
};
