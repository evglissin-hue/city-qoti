import type { StoryArc } from './types';

// Story characters (docs/spec/11-residents.md, Story characters). Each arc is a handful of letters
// from one resident, and each letter teaches a system by asking for something (P6: teach through
// residents). Goals are Conditions bound to the character: 'home' is their home, 'nearestMarket'
// the market stall nearest it. Letters use {town}; lines are split by \n. Hints never use
// placeholders.
//
// Arc ids name the character's calling, so the registry order (alphabetical) puts the inventor
// first: the Water Wheel innovation's condition names arc 0.

export const inventor: StoryArc = {
  id: 'inventor',
  character: {
    given: 'Pippa',
    family: 'Quill',
    species: 'mouse',
    traits: ['curious', 'practical', 'night-owl'],
    stage: 'young',
    bio: 'An inventor of twenty-two inventions, four of which work. She keeps a pencil behind each ear and, for emergencies, a third one in her boot.',
  },
  arrival: {
    all: [
      { count: { what: 'residents', atLeast: 14 } },
      { count: { what: 'foodDays', atLeast: 1 } },
      { count: { what: 'buildings', ref: 'workshop', atLeast: 2 } },
    ],
  },
  hello: [
    'Dear both of you,',
    'I have taken the little house with the crooked chimney. I hope that is all right. I have already measured it.',
    'My name is Pippa Quill, and I invent things. Mostly they are improvements on other things, and now and then they are improvements on my improvements. I came because I heard {town} has a river that does nothing all day but run downhill. That seems a terrible waste of a river.',
    'I will send a proper letter once I have found where the kettle lives.',
    'Yours, with ink on most things,',
    'Pippa Quill',
  ].join('\n'),
  steps: [
    {
      letter: [
        'Dear both,',
        'Before I can improve anything I have to understand it, so this morning I followed a grain. It went from the field past the windmill to the baker, who made it bread, and then into a neighbor, which made it a contented sigh. Every good in this valley takes a little journey like that, and every journey can be shorter.',
        'I would like to see the short one: a baker within reach of a windmill, so the grain does not have to hike. Zone a little Workshops land near the mill and a baker will hang out a sign once the town wants bread, which in my experience is always.',
        'Hungrily,',
        'Pippa',
      ].join('\n'),
      goal: { count: { what: 'businesses', ref: 'baker', atLeast: 1 } },
      reward: { coins: 20, mood: 10 },
      hint: "A baker at work on a Workshops lot within a windmill's reach.",
    },
    {
      letter: [
        'Dear both,',
        'The bread is excellent and so, I am pleased to say, is the system. I have drawn a diagram of it. It is mostly arrows.',
        'A small, practical request. I do my best thinking after dark, and my worst falling over things after dark. Could someone put a lantern near my door? Light makes a lane feel friendlier, and folk linger where it is friendly. You can see it on the charm overlay, too: lanterns glow brightest there at night.',
        'In anticipation of not tripping,',
        'Pippa',
      ].join('\n'),
      goal: { near: { tag: 'lantern', of: 'home', within: 3 } },
      reward: { unlock: ['hanging-lantern'], bond: 1 },
      hint: "A lantern within three tiles of Pippa's home.",
    },
    {
      letter: [
        'Dear both,',
        'Thank you for the lantern. I have been up until all hours under it, and while I was there I worked out how to hang a lantern from a bracket, so you may have those now too. I have also sketched the most important thing I have ever sketched.',
        "A wheel in the river, turning a saw. The river does the work, the sawyers do the thinking, and carpenters come to work beside it. All it needs is a Forester's Lodge close to the water, within three tiles of the bank, to keep it in timber. I will do the rest, and I will do it loudly.",
        'Ideas like this one go in the innovations notebook. Most of them arrive when the town is ready for them. This one arrives when I am, and I am very nearly ready.',
        'Damply,',
        'Pippa',
      ].join('\n'),
      goal: { count: { what: 'byWater', ref: 'foresters-lodge', atLeast: 1 } },
      reward: { innovation: ['water-wheel'], coins: 40, mood: 15 },
      hint: "A Forester's Lodge within three tiles of the river.",
    },
    {
      letter: [
        'Dear both,',
        'The wheel turns! The saw sings! Two sawyers have asked me to make it sing more quietly, which is not how wheels work.',
        "I have been thinking about what comes next. A town that makes things needs a quarter where the making happens: a carpenter beside a chandler beside a cider press, everyone borrowing everyone else's tools. Workshops like company, and they like it varied. Give them land and something to work with and they choose their own trades, which is the most efficient thing I have ever heard of, apart from my wheel.",
        'Three different trades at work, I think. Then we will talk.',
        'Yours, sawdust and all,',
        'Pippa',
      ].join('\n'),
      goal: { count: { what: 'businessTrades', ref: 'workshop', atLeast: 3 } },
      reward: { coins: 30, bond: 1 },
      hint: 'Workshops of three different trades. A trade opens where its raw good is in town and, for some, a mill is in reach.',
    },
    {
      letter: [
        'Dear both,',
        'Three trades under one sky. I walked past every door twice this morning, just to listen.',
        'My notebook is filling up, and not only with my ideas. Good ideas turn up wherever folk are working hard at something: porters run off their feet start dreaming of wheelbarrows, and a quarry busy enough starts talking about cobbles. Keep the town busy in interesting ways and the notebook fills itself.',
        'When there are three new ideas in it, I will have something to show you. It is large, it has a great many letters in it, and that is all I am saying.',
        'Mysteriously,',
        'Pippa',
      ].join('\n'),
      goal: { count: { what: 'innovations', atLeast: 3 } },
      reward: { mood: 10 },
      hint: 'Three innovations unlocked in the notebook.',
    },
  ],
  finale: {
    letter: [
      'Dear both,',
      'Three innovations, a water wheel, a quarter full of workshops and a lantern by my door that I have not walked into once. I came to {town} to give a lazy river a job, and instead the whole valley gave me one.',
      'So here is my thank-you, which is also my next idea: a printing press. It will print the Chronicle properly, on paper, with headlines, so every resident can read about themselves over breakfast and be insufferable about it. The drawings are finished. The press will take a little longer, because I keep improving it.',
      'I am staying, of course. Somebody has to oil the wheel.',
      'With love and a slightly inky thumbprint,',
      'Pippa Quill',
    ].join('\n'),
    unlock: ['printing-press'],
    renown: 5,
    coins: 50,
    bond: 1,
    mood: 20,
  },
};

export const merchant: StoryArc = {
  id: 'merchant',
  character: {
    given: 'Odette',
    family: 'Fenwick',
    species: 'fox',
    traits: ['cheerful', 'thrifty', 'early-bird'],
    stage: 'adult',
    bio: 'A traveling merchant who has stopped traveling. She can price a cabbage at forty paces and talk you into a second one at twenty.',
  },
  arrival: {
    all: [
      { count: { what: 'residents', atLeast: 20 } },
      { count: { what: 'goodsAtMarket', atLeast: 2 } },
      { count: { what: 'foodDays', atLeast: 1 } },
    ],
  },
  hello: [
    'To the management of {town},',
    'Odette Fenwick, merchant, at your service. I have sold wool in Millhaven, cheese in Stonecross and, once, a sweater to a very confused goat. I have retired from the road three times before. This is the fourth, and I mean it.',
    'I noticed your market stall on the way in. It has potential. I noticed it the way a gardener notices a weed: fondly, and with plans.',
    'I am unpacking my scarves. Expect a letter shortly.',
    'Briskly,',
    'Odette Fenwick',
  ].join('\n'),
  steps: [
    {
      letter: [
        'To the management,',
        'A market is not a place, it is a promise: whatever you fancy, somebody has it, at a price you can grumble about. At present your stall promises porridge, very sincerely.',
        'Folk shop where there is choice. Three kinds of Food on my nearest stall at once (fish, bread, cabbages, I am not fussy) and I will call it a market. Porters carry stock from the granary to the stalls, so a stall near the granary, with a porter to spare, is a happy stall.',
        'Stock is the root of all commerce,',
        'O. F.',
      ].join('\n'),
      goal: { code: 'stallFlavors', params: [['flavors', 3]] },
      reward: { coins: 25, mood: 10 },
      hint: "Three kinds of Food in stock at once on the market stall nearest Odette's home.",
    },
    {
      letter: [
        'To both of you,',
        'Three kinds of Food! I bought a little of each, out of professional courtesy.',
        'Now, a word about partnership. The two of you see the valley rather differently. One of you looks at a lane and sees a lovely spot for a bench; the other sees forty loads of timber an hour going the wrong way. Both of you are right, which is maddening.',
        'In my trade we call that a partnership. Make me one corner of the valley with both your hands in it: a pattern from the Pattern Book where one of you set the bench and the other the flowers, say. Do that and I will believe you are in business together.',
        'Contractually yours,',
        'Odette',
      ].join('\n'),
      goal: { count: { what: 'togetherSites', atLeast: 1 } },
      reward: { bond: 1, mood: 10 },
      hint: 'A pattern site with pieces placed by each of you.',
    },
    {
      letter: [
        'To both of you,',
        'Splendid. Two pairs of hands on one corner of the valley: that is a firm I would invest in.',
        'A confession: I have spent my life selling things in drafty squares to folk in a hurry. Folk in a hurry buy one thing. Folk who linger buy three, and come back for a fourth. Give them somewhere to sit by the market and something nice to look at, and they will stay long enough to remember they needed string.',
        'A seat and a couple of flower beds by the stall would do it. Charm, my dear partners, is just good business in a nicer hat.',
        'Lingeringly,',
        'Odette',
      ].join('\n'),
      goal: {
        all: [
          { near: { tag: 'seat', of: 'nearestMarket', within: 3 } },
          { near: { tag: 'flower', of: 'nearestMarket', within: 3, atLeast: 2 } },
        ],
      },
      reward: { unlock: ['planter-wall'], coins: 20 },
      hint: "A seat and two flower beds or planters within three tiles of the market stall nearest Odette's home.",
    },
    {
      letter: [
        'To both of you,',
        'I sat by the flowers for an hour yesterday and sold a scarf to a passing squirrel without even trying. You see? Business.',
        'Now I must be frank. I have spent my life crying my wares down drafty lanes, and a good merchant does no such thing: she sets out her stalls in one place, everything a household wants under one sky, and lets the town come to her. That wants a Market Square, and a square wants a village. The County keeps a Charter on the board at the Town Hall: so many residents, so much food put by, so many wishes granted. Claim it, then build the square on a lane or a street.',
        'I have already ordered the waistcoat. I will be at the square early, pretending not to watch.',
        'Expectantly,',
        'Odette',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'market-square', atLeast: 1 } },
      reward: { coins: 40, bond: 1, mood: 10 },
      hint: 'Claim the Village Charter at the Town Hall, then build a Market Square on a lane or a street.',
    },
    {
      letter: [
        'To both of you,',
        'The square is everything I hoped: loud, crowded and full of people pretending they only came for one thing.',
        'Next, the wider world. Millhaven and Stonecross trade with any village that has a Trading Post. They buy what you have too much of and sell what you have too little of, at prices that wander about with the seasons, and the carrier gets better terms with a post to work from. Build one by the valley road. I have friends in both towns. Some of them still speak to me.',
        'With a firm handshake,',
        'Odette',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'trading-post', atLeast: 1 } },
      reward: { coins: 30 },
      hint: 'Build a Trading Post.',
    },
    {
      letter: [
        'To both of you,',
        'The Trading Post smells of rope and opportunity. I visit it daily.',
        "One last lesson, and then I shall stop teaching and start haggling. At the start of every season the neighbors send their terms: cheap timber from one, a good price for your cheese at another. Take one on the season card. A deal is only a promise, but a season of promises kept is how a village gets its name into other towns' ledgers.",
        'Shrewdly,',
        'Odette',
      ].join('\n'),
      goal: { code: 'seasonDeal' },
      reward: { coins: 30, bond: 1 },
      hint: "A neighbor's deal taken on the season card.",
    },
  ],
  finale: {
    letter: [
      'To my partners in {town},',
      'A square full of stalls, a deal on the books and a Trading Post that smells of rope. When I arrived, your market was one stall and a hopeful look. Now there are prices with opinions, neighbors who know your name and two people who build things together and mean it. That last part is the rarest. Most towns never manage it.',
      'So I have drawn up plans to put a roof over the square: the Market Hall, with a clock everybody will argue about and a balcony from which I intend to make announcements. They are yours. Rain is very bad for haggling.',
      'I am staying. I have said that four times before, but this time I bought furniture.',
      'Ever yours, at a very fair price,',
      'Odette Fenwick',
    ].join('\n'),
    unlock: ['market-hall'],
    renown: 5,
    coins: 80,
    bond: 1,
    mood: 20,
  },
};

export const musician: StoryArc = {
  id: 'musician',
  character: {
    given: 'Juniper',
    family: 'Reed',
    species: 'rabbit',
    traits: ['artistic', 'romantic', 'night-owl'],
    stage: 'young',
    bio: 'A musician who plays the fiddle, the flute and, when nobody is looking, the spoons. She believes every town has a tune, and that most of them are played too fast.',
  },
  arrival: {
    all: [
      { count: { what: 'residents', atLeast: 26 } },
      { count: { what: 'foodDays', atLeast: 1 } },
      { count: { what: 'patternsDiscovered', atLeast: 2 } },
    ],
  },
  hello: [
    'Hello, {town}!',
    'I followed the sound of your valley over the hill. It was mostly hammering, with some birds, and one resident who whistles the same four notes on the way to work every morning. I would love to meet them, and to teach them a fifth.',
    'I am Juniper Reed, and I play things. I have taken a little house and a great many liberties with its acoustics. If you hear a fiddle at midnight, do not worry. That is just me, working out what you sound like.',
    'Tra la,',
    'Juniper',
  ].join('\n'),
  steps: [
    {
      letter: [
        'Dear both,',
        'I have been playing on my doorstep in the evenings and the audience is growing. Last night it was three residents, a hedgehog who said he was only passing, and a moth.',
        'Music carries better somewhere lovely. Flowers, trees, a bench or two, a lantern for the evenings: the charm overlay shows how lovely a place is, from bare to blooming. If the lane by my house were properly charming I would play there every night, and I am told the neighbors would be thrilled, or at least awake.',
        'Hopefully, in three-four time,',
        'Juniper',
      ].join('\n'),
      goal: { charm: { of: 'home', radius: 3, atLeast: 25 } },
      reward: { unlock: ['ring-bench'], mood: 10 },
      hint: "Charm of 25 or more around Juniper's home.",
    },
    {
      letter: [
        'Dear both,',
        'Thank you! The lane is so pretty now that I played a slow piece and two residents held hands. I am not saying it was the music. I am not not saying it.',
        'I have an idea, and it is a big one, so it needs both of you. I dream of a green where the whole village gathers on festival evenings. But a green is a decision, and in {town} decisions are made by two. So sketch something together. A plan is drawn in blue ghosts; either of you can comment on it and tweak it until it is right, and when one of you approves it, it gets built. It does not have to be a green. It only has to be something you both said yes to.',
        'Harmoniously,',
        'Juniper',
      ].join('\n'),
      goal: { count: { what: 'plansApproved', atLeast: 1 } },
      reward: { bond: 1, coins: 20 },
      hint: 'Draw a plan, talk it over and approve it.',
    },
    {
      letter: [
        'Dear both,',
        'You made a plan together and it worked. Do you know how rare that is? I have been in bands.',
        'About those two residents holding hands: it has happened again, with different residents, on a different evening. Friends become close friends in {town}, and close friends sometimes become rather more than that. When they do, they marry at the next festival, or on a day of their own choosing if they are too romantic to wait. I would dearly love to play at a wedding. Benches, gardens and pleasant places to meet are how it starts. I am only the band.',
        'Sentimentally,',
        'Juniper',
      ].join('\n'),
      goal: { count: { what: 'weddings', atLeast: 1 } },
      reward: { coins: 20, mood: 15 },
      hint: 'A wedding in town. Friendships grow where residents meet: benches, gardens, a tavern.',
    },
    {
      letter: [
        'Dear both,',
        'I played at the wedding. I cried during my own solo, which is unprofessional, and so did the happy couple, which was lovely.',
        'Here is something I have noticed: some places in {town} rhyme. A ring of trees round a well. Lanterns down a lane home. Folk feel it even when they cannot say why. The Pattern Book is where those rhymes are written down, and each one you find unlocks new pieces to build more. I would like to find four. Music is mostly patterns too, with feelings in between.',
        'Rhythmically,',
        'Juniper',
      ].join('\n'),
      goal: { count: { what: 'patternsDiscovered', atLeast: 4 } },
      reward: { unlock: ['wildflower-verge'], bond: 1 },
      hint: 'Four patterns discovered in the Pattern Book.',
    },
    {
      letter: [
        'Dear both,',
        'Four patterns. I have written a little tune for each. One of them is mostly tuba.',
        'Last thing, I promise, and then I will stop asking and start playing. I want to give evening concerts for the whole village, the kind where folk stay out past their bedtime and pretend they meant to. For that we need light: four lanterns around my end of town, so nobody has to find their way home by the sound of my fiddle.',
        'Brightly,',
        'Juniper',
      ].join('\n'),
      goal: { near: { tag: 'lantern', of: 'home', within: 6, atLeast: 4 } },
      reward: { mood: 10 },
      hint: "Four lanterns within six tiles of Juniper's home.",
    },
  ],
  finale: {
    letter: [
      'Dear both,',
      'Last night I played until the lanterns burned low, and half the village stayed. A badger danced. I have it on good authority that he has never danced before, and he is now insufferable about it.',
      'When I came over the hill, {town} sounded like hammering. It still does, a little, in the mornings. But in the evenings it sounds like folk talking on benches, a couple who met by the well, and two people who plan things together and mostly agree. That is the tune of a place, and I think it is a good one.',
      'I have written out plans for a bandstand on a green, with room for a choir. The festivals will never sound the same. I am staying, obviously. Somebody has to get that whistler to his fifth note.',
      'With all my heart and most of my strings,',
      'Juniper Reed',
    ].join('\n'),
    unlock: ['bandstand-green', 'festival-music'],
    renown: 5,
    coins: 40,
    bond: 1,
    mood: 20,
  },
};
