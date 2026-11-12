import type { ChronicleTemplate, GuideDef } from './types';

// The first days guide (C5H; docs/build/cycle-05h-first-days.md). For the first days of a new
// standard valley a County surveyor writes to both players, one short letter a step, and each step
// asks for one thing that teaches one system. Each step names its lane, so both players have
// something to do and need each other once. Letters are split by \n: a salutation, two or three
// lines, a signature. Hints are the P.S.; they say what counts, never which button to press (the
// arrow shows that). Goals are Conditions, checked hourly by the guide system; nothing here pays.

export const firstDays: GuideDef = {
  id: 'first-days',
  from: {
    given: 'Tobias',
    family: 'Merriweather',
    species: 'otter',
    traits: ['practical', 'cheerful', 'early-bird'],
    stage: 'adult',
    bio: 'The County surveyor, who has measured every valley in the shire and liked about half of them.',
  },
  steps: [
    {
      id: 'lane-to-gate',
      lens: 'ledger',
      letter: [
        'Dear both,',
        'The County has signed {town} over to you, and the County lane runs from the gate to your door and stops, as lanes do when nobody tells them otherwise.',
        'Carts, porters and newcomers all come in at that gate, and none of them will cross a meadow if they can help it. Wherever the first work is going to be, take the lane there.',
        'I will be about for a few days with my chain and my opinions.',
        'Tobias Merriweather, County Surveyor',
      ].join('\n'),
      goal: { code: 'guideLane' },
      hint: 'A workplace (a quarry, a fishery, anything with jobs) with its door on a lane or path that runs back to the valley gate.',
      point: { tool: 'lane', tile: 'gate' },
    },
    {
      id: 'first-homes',
      lens: 'ledger',
      letter: [
        'Dear both,',
        'Two families came with the deeds, and two more are already asking about the valley at the coaching inn. Nobody moves anywhere to admire a lane.',
        'Put up two more homes near the start, on the lane, and the next families will be along. They bring hands, and hands are what everything else is waiting for.',
        'Tobias Merriweather',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'home', atLeast: 4 } },
      hint: 'Four homes built in town. The builders at the town hall raise them from timber and stone.',
      point: { tool: 'building', tile: 'start' },
    },
    {
      id: 'first-wish',
      lens: 'hearth',
      letter: [
        'Dear both,',
        'Residents want things. Not grand things, as a rule: a bench, a tree they can see from the window, a little peace from the sawing. They will tell you, if you ask.',
        'Grant one wish and watch what it does to a face. I have surveyed for forty years and it still does something to mine.',
        'Tobias Merriweather',
      ].join('\n'),
      goal: { count: { what: 'wishesGranted', atLeast: 1 } },
      hint: 'One wish granted. A wish is granted the hour its target is true, and the thank-you comes by post.',
      point: { panel: 'wishes' },
    },
    {
      id: 'food-in-store',
      lens: 'ledger',
      letter: [
        'Dear both,',
        'The County sent grain and vegetables with the deeds, and the County, I am sorry to say, will not be sending more. Food has to come from the valley now.',
        'A fishery at the river, or a farm on land you have zoned for it, with someone working it, and a couple of days of food in store. Then nobody counts the porridge at supper.',
        'Tobias Merriweather',
      ].join('\n'),
      goal: {
        all: [{ code: 'guideFoodWorked' }, { count: { what: 'foodDays', atLeast: 2 } }],
      },
      // R1 stand-in (R1D): R1D rewrites the letters for the new first days (02-game-overview.md).
      hint: 'A fishery or a farm with a worker, and two days of food in store for everyone.',
      point: { tool: 'building', tile: 'storehouse' },
    },
    {
      id: 'timber',
      lens: 'both',
      letter: [
        'Dear both,',
        'Every building in this valley is made of timber, and the timber the County lent you will not last the week. Timber comes from trees, and trees are the part the valley already has.',
        "A Forester's Lodge by a good stand of woods, then, and the first timber out of it. One of you choose the trees to keep and the other the trees to fell; it saves arguments later.",
        'Tobias Merriweather',
      ].join('\n'),
      goal: {
        all: [
          { count: { what: 'buildings', ref: 'foresters-lodge', atLeast: 1 } },
          { count: { what: 'goodProduced', ref: 'timber', atLeast: 4 } },
        ],
      },
      hint: "A Forester's Lodge built, and the first timber cut.",
      point: { tool: 'building' },
    },
    {
      id: 'first-pattern',
      lens: 'hearth',
      letter: [
        'Dear both,',
        'I measure valleys, but the ones I remember are the ones that were pleasant to stand in. A bench by a door, flowers along a path, a tree where a tree ought to be.',
        'Put a little decor near the homes until the charm there warms, and see what the Pattern Book makes of it. It notices arrangements that folk have always liked.',
        'Tobias Merriweather',
      ].join('\n'),
      goal: { count: { what: 'patternsDiscovered', atLeast: 1 } },
      hint: 'The first page of the Pattern Book: decor, trees and homes arranged the way folk like.',
      point: { overlay: 'charm' },
    },
    {
      id: 'in-the-black',
      lens: 'ledger',
      letter: [
        'Dear both,',
        'The County will want to know whether {town} pays its way. I have told them it is far too early to ask, and they have asked anyway.',
        'One day, please, where what comes in beats what it costs to keep the town running. Building does not count against you; that is an investment, and I wrote so in the margin.',
        'Tobias Merriweather',
      ].join('\n'),
      goal: { code: 'guideInBlack' },
      hint: "Yesterday's takings above its running costs (upkeep, wages and the like), on the Budget tab of the Purse.",
      point: { panel: 'purse' },
    },
    {
      id: 'together',
      lens: 'both',
      letter: [
        'Dear both,',
        'My last request, and the one I care about most. A valley is never built by one pair of hands, and the good ones are built by two people who answer each other.',
        'One of you sketch a plan for the other to approve, and watch it go up between you. Then I can write to the County that {town} has a partnership.',
        'Tobias Merriweather',
      ].join('\n'),
      goal: {
        any: [
          { count: { what: 'plansApproved', atLeast: 1 } },
          { count: { what: 'requestsFulfilled', atLeast: 1 } },
        ],
      },
      hint: 'A plan approved by the partner who did not draw it.',
      point: { tool: 'plan' },
    },
  ],
  farewell: [
    'Dear both,',
    'That is everything the County asked me to look at, and rather more than it expected. I have filed {town} under the half I liked.',
    'A young inventor called Pippa Quill has been writing to the County about your river. Once the town has a few more folk and a couple of workshops, I expect she will turn up with a pencil behind each ear.',
    'Tobias Merriweather, County Surveyor',
  ].join('\n'),
  farewellAfterPippa: [
    'Dear both,',
    'That is everything the County asked me to look at, and rather more than it expected. I have filed {town} under the half I liked.',
    'I see Pippa Quill found you before I finished. Her letters will take it from here; read them, and keep her away from the river on wash days.',
    'Tobias Merriweather, County Surveyor',
  ].join('\n'),
};

// Chronicle kind for the guide's end (one line in the registry):
//   guide-done   {surveyor}
export const guideDone: ChronicleTemplate = {
  kind: 'guide-done',
  text: [
    '{surveyor}, the County surveyor, rolled up the maps and left {town} in the hands of its founders, with a note to the County that it would do.',
    'The County surveyor, {surveyor}, signed off on {town} this hour and took the coach home. The chain and the opinions went too.',
    '{surveyor} wrote the last line in the County survey of {town}: "Lane, homes, food, timber, wishes, charm, books and a partnership. Will do nicely."',
  ],
};
