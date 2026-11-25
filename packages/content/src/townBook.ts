import type { ChronicleTemplate, CustomDef, SpecialtyDef, TownBookTuning } from './types';

// The Town Book (docs/spec/19-evenings.md, The Town Book), written in R3.0. Two kinds of page: a
// specialty (a Treat sold at a place of one pattern, evening after evening) and a custom (a habit
// the town falls into). Three pages of one leaning earn that calling. Every number tunes here; ids
// are stored in saves and never change once shipped. Hints say what to do without giving the page's
// name away, in the Pattern Book's style; `text` is what the page says once found.

export const TOWN_BOOK: TownBookTuning = {
  // A specialty: a Treat sold at one place on three evenings of a season (an evening counts when one
  // customer bought it there), then five more draw for the place. R3X: was ten on four, then four on
  // three; both were out of reach. A Village sells one to three Treats an evening across the whole
  // town, and in the bench's play no Treat reached four customers at one place on more than one
  // evening of a season. One customer on half a season's evenings still means a habit: of about
  // sixteen places and two flavors on a round that sells two or three Treats a night, only a spot
  // where the same Treat keeps selling earns it.
  // A floor for a starved round: raise it as I4E brings Treats to the places (i4-wave-notes.md).
  specialtyCustomers: 1,
  specialtyEvenings: 3,
  specialtyDraw: 5,
  // A custom: a dozen visitors on the same day of three seasons running, then fifteen more draw on its
  // day. R3X: was twenty; the busiest place of a bench Village drew 10 to 19 on its best evening, so
  // a dozen on the same evening three seasons running is a habit, and the twenty was a feast day.
  customVisitors: 12,
  customSeasons: 3,
  customDraw: 15,
  // Renown for a page, as for a pattern.
  pageRenown: 2,
  // Hints shown at once for pages not yet found.
  hints: 3,
  // Pages of one leaning that earn its calling.
  pagesForCalling: 3,
  // Garden Village's day visitors (P1's numbers): pennies per average door charm point and per renown
  // level, capped at 15 coins a day. A small, pleasant village earns 3 to 6 coins.
  visitors: { hour: 15, perCharm: 12, perRenown: 100, cap: 1500, noticeEveryDays: 7 },
};

// --- Specialties --------------------------------------------------------------------------------

export const bridgeCrossingCider: SpecialtyDef = {
  id: 'bridge-crossing-cider',
  pattern: 'bridge-crossing',
  good: 'cider',
  name: 'Bridge Cider',
  leaning: 'industry',
  text: 'Nobody crosses the bridge without a cup of cider now. The cup is optional. The crossing is not much faster for it.',
  hint: 'Folk who stop to watch the water might stop for something to drink while they do it.',
};

export const cornerCafeCordial: SpecialtyDef = {
  id: 'corner-cafe-cordial',
  pattern: 'corner-cafe',
  good: 'cordial',
  name: 'Cafe Cordial',
  leaning: 'industry',
  text: 'The cafe pours a cordial that tastes of an orchard in a good mood. It is pink. Nobody has asked why.',
  hint: 'A corner table, a cool pink drink, and a cafe patient enough to serve it all evening.',
};

export const cornerCafePies: SpecialtyDef = {
  id: 'corner-cafe-pies',
  pattern: 'corner-cafe',
  good: 'pies',
  name: 'Cafe Pie',
  leaning: 'industry',
  text: 'The cafe has a pie on the counter by six, and by seven it has a queue. The pie is not the best in the valley. The queue is.',
  hint: 'Put something warm and sliced on the counter of a cafe, and leave the corner seats full.',
};

export const marketCrossCider: SpecialtyDef = {
  id: 'market-cross-cider',
  pattern: 'market-cross',
  good: 'cider',
  name: 'Market Cross Cider',
  leaning: 'industry',
  text: 'Stallholders at the cross end the day with a cup of cider, and so do the customers. It has become a kind of closing bell.',
  hint: 'Where two roads meet and the stalls crowd in, a drink for the end of the day would go down well.',
};

export const marketCrossPies: SpecialtyDef = {
  id: 'market-cross-pies',
  pattern: 'market-cross',
  good: 'pies',
  name: 'Market Cross Pies',
  leaning: 'industry',
  text: 'A pie at the market cross is how a trip to buy one thing becomes a trip to buy four. The stallholders have noticed, and approve.',
  hint: 'The busiest crossing in town is a fine place to sell something baked and sliceable.',
};

export const smallSquareCider: SpecialtyDef = {
  id: 'small-square-cider',
  pattern: 'small-square',
  good: 'cider',
  name: 'Square Cider',
  leaning: 'industry',
  text: 'Cider in the square, taken standing up, which is the correct way. The pavement has learned the shape of the evening crowd.',
  hint: 'A paved square with somewhere to sit would suit a pressed drink, sold by the cup.',
};

export const townGateMead: SpecialtyDef = {
  id: 'town-gate-mead',
  pattern: 'town-gate',
  good: 'mead',
  name: 'Gatehouse Mead',
  leaning: 'industry',
  text: 'A cup of mead at the gate, for those coming in and those who would rather not go out. The gatekeeper pretends not to have a favorite.',
  hint: 'A gate with lanterns either side is a good place for something golden and strong to be sold.',
};

export const orchardPathCider: SpecialtyDef = {
  id: 'orchard-path-cider',
  pattern: 'orchard-path',
  good: 'cider',
  name: 'Orchard Walk Cider',
  leaning: 'gardens',
  text: 'Cider on the orchard walk, pressed from the very trees overhead. Nothing in the valley travels a shorter distance to be enjoyed.',
  hint: 'A bench under fruit trees is improved by a cup of what the trees are for.',
};

export const orchardPathJam: SpecialtyDef = {
  id: 'orchard-path-jam',
  pattern: 'orchard-path',
  good: 'jam',
  name: 'Orchard Walk Jam',
  leaning: 'gardens',
  text: 'Jam by the jar along the orchard walk, still faintly warm and entirely local. The wasps have taken an interest.',
  hint: 'Along a path through fruit trees, something sweet and spreadable might find a market.',
};

export const pondGardenHoney: SpecialtyDef = {
  id: 'pond-garden-honey',
  pattern: 'pond-garden',
  good: 'honey',
  name: 'Pond Garden Honey',
  leaning: 'gardens',
  text: 'Honey sold by the pond, from bees who drink there. The arrangement is informal, and the honey is excellent.',
  hint: 'Where flowers crowd a quiet pond, the bees have views on what should be sold.',
};

export const windowGardensJam: SpecialtyDef = {
  id: 'window-gardens-jam',
  pattern: 'window-gardens',
  good: 'jam',
  name: '{street} Jam',
  leaning: 'gardens',
  text: 'Every window box on the street has a flower in it, and every doorstep a jar of jam. The neighbors trade them across the fence.',
  hint: 'A street of flowered windows might as well sell something to put on toast.',
};

export const villageGreenPies: SpecialtyDef = {
  id: 'village-green-pies',
  pattern: 'village-green',
  good: 'pies',
  name: 'Pies on the Green',
  leaning: 'gardens',
  text: 'Pies on the green, eaten on the grass with no regard for crumbs. The sparrows have made a schedule.',
  hint: 'An open lawn with homes all round would take well to a pie or two at supper time.',
};

export const pocketParkHoney: SpecialtyDef = {
  id: 'pocket-park-honey',
  pattern: 'pocket-park',
  good: 'honey',
  name: 'Pocket Park Honey',
  leaning: 'gardens',
  text: 'A little park with a little stall and a lot of honey. It is the smallest market in town and one of the happiest.',
  hint: 'A small green room between buildings could sell something sweet from the hive.',
};

export const hedgerowLaneHoney: SpecialtyDef = {
  id: 'hedgerow-lane-honey',
  pattern: 'hedgerow-lane',
  good: 'honey',
  name: 'Hedgerow Honey',
  leaning: 'gardens',
  text: 'Honey from the hedgerow lane, sold from a crate with an honesty tin. The tin is, on the whole, honest.',
  hint: 'A lane with green on both sides, and the bees in it, will want to sell something.',
};

export const lanternWalkHoney: SpecialtyDef = {
  id: 'lantern-walk-honey',
  pattern: 'lantern-walk',
  good: 'honey',
  name: 'Lantern Walk Honey',
  leaning: 'pilgrimage',
  text: 'Honey by lantern light, which makes it look like something more expensive. It is the same honey. It sells for more.',
  hint: 'A path lit end to end, walked in the evening, would suit something golden in a small jar.',
};

export const lanternWalkMead: SpecialtyDef = {
  id: 'lantern-walk-mead',
  pattern: 'lantern-walk',
  good: 'mead',
  name: 'Lantern Walk Mead',
  leaning: 'pilgrimage',
  text: 'A cup of mead for the long way home, and the long way home gets a little longer. The lanterns do not object.',
  hint: 'The best drink for a lit walk in the evening is slow, golden and a little bit strong.',
};

export const promenadeCordial: SpecialtyDef = {
  id: 'promenade-cordial',
  pattern: 'promenade-by-the-water',
  good: 'cordial',
  name: 'Promenade Cordial',
  leaning: 'pilgrimage',
  text: 'Cordial along the promenade, sipped at the rail while the river does its slow impression of a mirror.',
  hint: 'A long walk beside the river wants something cool and fruity to carry along it.',
};

export const wellGatheringCider: SpecialtyDef = {
  id: 'well-gathering-cider',
  pattern: 'well-gathering-place',
  good: 'cider',
  name: 'Wellside Cider',
  leaning: 'pilgrimage',
  text: 'Folk come to the well for water and stay for the cider. The well takes it well. It has heard worse.',
  hint: 'Where people fetch water and linger, a stronger drink might be poured beside it.',
};

export const watchLookoutMead: SpecialtyDef = {
  id: 'watch-lookout-mead',
  pattern: 'watch-lookout',
  good: 'mead',
  name: 'Lookout Mead',
  leaning: 'pilgrimage',
  text: 'Mead at the lookout, for those who have climbed up to see the valley and have decided to stay a while.',
  hint: 'A bench at the foot of a tower, with the whole valley to look over, would suit a long drink.',
};

export const readingNookCordial: SpecialtyDef = {
  id: 'reading-nook-cordial',
  pattern: 'reading-nook',
  good: 'cordial',
  name: 'Reading Nook Cordial',
  leaning: 'pilgrimage',
  text: 'A glass of cordial in the quiet corner, with a book held open and mostly not read. The cordial is read more closely.',
  hint: 'A quiet bench with flowers and a lantern would suit something to sip while pretending to read.',
};

export const sittingWallMead: SpecialtyDef = {
  id: 'sitting-wall-mead',
  pattern: 'sitting-wall',
  good: 'mead',
  name: 'Sitting Wall Mead',
  leaning: 'pilgrimage',
  text: 'Mead on the wall, at the end of the day, with legs dangling. It is a comfortable wall, and it knows it.',
  hint: 'A low wall along a path is made for sitting, and sitting wants a cup to go with it.',
};

// --- Customs ------------------------------------------------------------------------------------

export const buntingSeason: CustomDef = {
  id: 'bunting-season',
  kind: 'supply',
  supply: 'season',
  name: 'the Bunting Season',
  leaning: 'gardens',
  text: 'Every season, before anyone says a word, the bunting goes up, and {place} is dressed for a party that has not been announced yet.',
  hint: 'Keep the festival cloth in good order, season after season, and the town may start to expect it.',
};

export const eveningWalk: CustomDef = {
  id: 'evening-walk',
  kind: 'day',
  pattern: 'lantern-walk',
  name: 'the Evening Walk',
  leaning: 'pilgrimage',
  text: 'On {day}, a turn along the lantern walk has become a thing folk do. Nobody planned it. Everyone dresses a little better for it.',
  hint: 'A lit path, a particular evening, and the same folk turning up again and again.',
};

export const greenEvenings: CustomDef = {
  id: 'green-evenings',
  kind: 'day',
  pattern: 'village-green',
  name: 'Evenings on the Green',
  leaning: 'gardens',
  text: 'On {day}, the green fills up with rugs and baskets and opinions. It is called a picnic, and it is taken seriously.',
  hint: 'An open lawn with a full evening crowd, on the same day, again and again.',
};

export const lanternRound: CustomDef = {
  id: 'lantern-round',
  kind: 'supply',
  supply: 'nightly',
  name: 'the Lantern Round',
  leaning: 'pilgrimage',
  text: 'Every night of the season, every lantern, lit by a patient hand. The lamplighter has worn a path of their own.',
  hint: 'Keep every lantern burning, night after night, for a whole season.',
};

export const longTable: CustomDef = {
  id: 'long-table',
  kind: 'supply',
  supply: 'outlet',
  name: 'the Long Table',
  leaning: 'industry',
  text: 'The tables are set with something to serve, and the cafe has become the long table the whole town sits at. Elbows are permitted.',
  hint: 'Tables are best with a shop beside them that has something sweet on its shelf, all season long.',
};

export const marketNight: CustomDef = {
  id: 'market-night',
  kind: 'day',
  pattern: 'market-cross',
  name: 'Market Night',
  leaning: 'industry',
  text: 'On {day}, the cross turns into a market, and it was never decided. The stalls simply arrived one week and neglected to leave.',
  hint: 'A busy crossing, a crowd of the same size on the same day, week after week.',
};

export const orchardStroll: CustomDef = {
  id: 'orchard-stroll',
  kind: 'day',
  pattern: 'orchard-path',
  name: 'the Orchard Stroll',
  leaning: 'gardens',
  text: 'On {day} the whole town takes a turn under the fruit trees, whether or not the fruit is in. It is considered good for the trees.',
  hint: 'A path through the trees, and the same pleasant crowd on the same day.',
};

export const pondEvening: CustomDef = {
  id: 'pond-evening',
  kind: 'day',
  pattern: 'pond-garden',
  name: 'the Pond Evening',
  leaning: 'gardens',
  text: 'On {day}, the pond is where everyone ends up. The ducks were not consulted and have started to hold opinions about it.',
  hint: 'A planted pond with a seat beside it, and a regular crowd on one evening of the week.',
};

export const promenade: CustomDef = {
  id: 'promenade',
  kind: 'day',
  pattern: 'promenade-by-the-water',
  name: 'the Promenade',
  leaning: 'pilgrimage',
  text: 'On {day} the town walks the river, there and back, nodding to everyone twice. It is the most civilized exercise anyone has had.',
  hint: 'A long riverside walk, and the whole town taking it on the same day.',
};

export const squareNight: CustomDef = {
  id: 'square-night',
  kind: 'day',
  pattern: 'small-square',
  name: 'Square Night',
  leaning: 'industry',
  text: 'On {day}, the square fills up for no reason in particular. Folk leave with a reason, usually a pastry.',
  hint: 'A paved square, an unplanned crowd, and the same night coming round again.',
};

export const tavernNight: CustomDef = {
  id: 'tavern-night',
  kind: 'day',
  host: 'tavern',
  name: 'Tavern Night',
  leaning: 'industry',
  text: 'On {day}, the tavern fills to the rafters. It did not ask for this, and has ordered more chairs.',
  hint: 'A tavern that fills on the same night of the week, season after season.',
};

export const wellGathering: CustomDef = {
  id: 'well-gathering',
  kind: 'day',
  pattern: 'well-gathering-place',
  name: 'the Well Gathering',
  leaning: 'pilgrimage',
  text: 'On {day} the well draws a crowd, and the crowd draws a second crowd. News travels fastest where the water does.',
  hint: 'A well with seats and shade, and a crowd that likes to come back on the same day.',
};

export const winterFires: CustomDef = {
  id: 'winter-fires',
  kind: 'supply',
  supply: 'evening',
  name: 'the Winter Fires',
  leaning: 'pilgrimage',
  text: 'Come the cold months, the fires are lit every evening and the town gathers round. The firewood pile is watched like a pot.',
  hint: 'Keep the fires fed with firewood through the cold months, evening after evening.',
};

// --- Words the sim fills in -----------------------------------------------------------------------

/**
 * The days of a season in the town's voice (one per day of the season, the first to the sixth), filled
 * into a custom's text as {day}. Days of a season have no names, so a custom falls on "the third
 * evening of each season".
 */
export const townBookPhrases = {
  days: [
    'the first evening of each season',
    'the second evening of each season',
    'the third evening of each season',
    'the fourth evening of each season',
    'the fifth evening of each season',
    'the sixth evening of each season',
  ],
  /** A custom with no fixed day (never written by the sim; a safe fallback for {day}). */
  anyDay: 'one evening or another',
  /** {place} when a page's place has no row to name it. */
  anyPlace: 'the town',
  /** The letter for a page ({page}, {place}, {text}). */
  page: 'The Town Book has a new page, and the ink is barely dry: "{page}", at {place}. {text}',
  /** A specialty's name when its own will not do (a repeat, or no street or family to fill): {good}, {place}. */
  at: '{good} at {place}',
};

/** The Chronicle's line for a page found ({page}, {place}, {text}, {credit}). */
export const townBookPage: ChronicleTemplate = {
  kind: 'town-book-page',
  text: [
    'A new page in the Town Book: {page}, at {place}. {text} Credit to {credit}.',
    'The Town Book has a page for {page} now, at {place}. {text} Credit to {credit}.',
    'Into the Town Book goes {page}, at {place}. {text} Credit to {credit}.',
  ],
};
