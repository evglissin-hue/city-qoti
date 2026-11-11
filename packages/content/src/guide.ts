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
        'Zone a stretch along the lane for homes. You need not draw a single cottage: families choose their own lots and the builders raise the roofs. Two new ones, and I will tell the inn to send the others up.',
        'Tobias Merriweather',
      ].join('\n'),
      goal: { code: 'guideHomes', params: [['built', 2]] },
      hint: 'Homes zoned beside a road, and two homes built on their lots.',
      point: { tool: 'zone', tile: 'start' },
    },
    {
      id: 'farmland',
      lens: 'ledger',
      letter: [
        'Dear both,',
        'Soil is not all alike, whatever the County maps pretend. Some of yours is dark and crumbly and would grow a walking stick if you planted one; some of it is mostly opinion.',
        'Zone a patch of the good stuff for Farmland, and farmsteads will take it up as the town gets hungry. The soil map shows which is which, if you squint less than I do.',
        'Tobias Merriweather',
      ].join('\n'),
      goal: { code: 'guideFarmland', params: [['tiles', 9]] },
      hint: 'Farmland zoned on rich soil, enough for a farmstead (nine tiles or so).',
      point: { overlay: 'resources' },
    },
    {
      id: 'timber',
      lens: 'both',
      letter: [
        'Dear both,',
        'Every building in this valley is made of timber, and the timber the County lent you will not last the week. Fortunately, trees are the part the valley already has.',
        "A Forester's Lodge, then, at the edge of a good stand of woods. Foresters fell what they need and leave the rest standing, which is more than can be said for most of us. One of you choose the trees to keep and the other the trees to fell; it saves arguments later.",
        'Tobias Merriweather',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'foresters-lodge', atLeast: 1 } },
      hint: "A Forester's Lodge built beside the woods, where a dozen grown trees stand close by.",
      point: { tool: 'building' },
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
        'The County sent grain and vegetables with the deeds, and the County, I am sorry to say, will not be sending more. The carrier will sell you food at carrier prices, which come with a face.',
        'A fishery at the river or a farmstead on your Farmland, with someone at work in it, and three days of Food put by for everyone. Then nobody counts the porridge at supper.',
        'Tobias Merriweather',
      ].join('\n'),
      goal: {
        all: [{ code: 'guideFoodWorked' }, { count: { what: 'foodDays', atLeast: 3 } }],
      },
      hint: 'A fishery or a farmstead with a worker, and three days of Food in town for everyone.',
      point: { tool: 'building', tile: 'storehouse' },
    },
    {
      id: 'first-workshop',
      lens: 'ledger',
      letter: [
        'Dear both,',
        'Here is the trick of a valley that works: you do not pick the trades. Zone a little land for Workshops, and whoever the town is short of moves in and hangs a sign.',
        'Bread is usually first, since everyone notices when there is none. A baker only opens within reach of a windmill, so put one up near your Workshops land and see who knocks.',
        'Tobias Merriweather',
      ].join('\n'),
      goal: { count: { what: 'businesses', ref: 'workshop', atLeast: 1 } },
      hint: 'A workshop the town opened by itself on a Workshops lot. A windmill close by lets a baker open.',
      point: { tool: 'zone' },
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
      hint: "Yesterday's takings above its running costs (upkeep, wages and the like), on the budget page of the reports.",
      point: { panel: 'reports' },
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
    '{surveyor} wrote the last line in the County survey of {town}: "Lane, homes, soil, timber, a wish, food, a workshop, charm, books and a partnership. Will do nicely."',
  ],
};
