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
        'Before I can improve anything I have to understand it, so this morning I followed a grain of wheat. It went from the field to the windmill, which made it flour, and then to the bakery, which made it bread, and then into a neighbor, which made it a contented sigh. Every good in this valley takes a little journey like that, and every journey can go faster.',
        'I would like to see the whole chain running properly. Forty loaves out of the ovens, say, and I will know the wheels are turning. If a link is missing, click the building and it will tell you what it is waiting for. Buildings are very honest about that.',
        'Hungrily,',
        'Pippa',
      ].join('\n'),
      goal: { count: { what: 'goodProduced', ref: 'bread', atLeast: 40 } },
      reward: { coins: 20, mood: 10 },
      hint: 'Bake 40 loaves: fields of wheat, a windmill and a bakery, with porters between them.',
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
        'A wheel in the river, turning a saw. The river does the work, the sawyers do the thinking, and the planks come out twice as fast. All it needs is a sawpit close to the water, within three tiles of the bank. I will do the rest, and I will do it loudly.',
        'Ideas like this one go in the innovations notebook. Most of them arrive when the town is ready for them. This one arrives when I am, and I am very nearly ready.',
        'Damply,',
        'Pippa',
      ].join('\n'),
      goal: { count: { what: 'byWater', ref: 'sawpit', atLeast: 1 } },
      reward: { innovation: ['water-wheel'], coins: 40, mood: 15 },
      hint: 'A sawpit within three tiles of the river.',
    },
    {
      letter: [
        'Dear both,',
        'The wheel turns! The saw sings! Two sawyers have asked me to make it sing more quietly, which is not how wheels work.',
        "I have been thinking about what comes next. A town that makes things needs a quarter where the making happens: the clatter of a joiner beside the hiss of a kiln, everyone borrowing everyone else's tools. Workshops like company. Once {town} is a village you can zone land for crafts, and workshops will grow there by themselves, which is the most efficient thing I have ever heard of, apart from my wheel.",
        'Six workshops, I think. Then we will talk.',
        'Yours, sawdust and all,',
        'Pippa',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'workshop', atLeast: 6 } },
      reward: { coins: 30, bond: 1 },
      hint: 'Six workshops in town. Bakeries, sawpits, mills and crafts all count.',
    },
    {
      letter: [
        'Dear both,',
        'Six workshops. I walked past all of them twice this morning, just to listen.',
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
        'A market is not a place, it is a promise: whatever you need, somebody has it, at a price you can grumble about. At present your stalls promise very little, very sincerely.',
        'Folk shop where there is choice. Four different goods on the stalls at once and I will call it a market day. Porters carry stock from the storehouses to the stalls, so a stall near a storehouse, with a porter to spare, is a happy stall.',
        'Stock is the root of all commerce,',
        'O. F.',
      ].join('\n'),
      goal: { count: { what: 'goodsAtMarket', atLeast: 4 } },
      reward: { coins: 25, mood: 10 },
      hint: 'Four different goods on the market stalls at once.',
    },
    {
      letter: [
        'To both of you,',
        'Four goods! I bought a little of each, out of professional courtesy.',
        'Now, a word about partnership. The two of you see the valley rather differently. One of you looks at a lane and sees a lovely spot for a bench; the other sees forty planks an hour going the wrong way. Both of you are right, which is maddening.',
        'In my trade we write things down. When one of you needs something from the other, a dozen loaves at the stall by Thursday, say, or a prettier corner by the well, put it in a request. Requests keep score, and goods and charm requests close themselves the moment they are met. Fulfill one for each other and I will believe you are in business together.',
        'Contractually yours,',
        'Odette',
      ].join('\n'),
      goal: { count: { what: 'requestsFulfilled', atLeast: 1 } },
      reward: { bond: 1, mood: 10 },
      hint: 'Fulfill a request between the two of you.',
    },
    {
      letter: [
        'To both of you,',
        'Splendid. Nothing warms a merchant like a debt honestly settled.',
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
        'And now I must be frank. Prices here are whatever the stall minder had for breakfast. A real market needs real prices, and real prices need a village. The County keeps a Charter on the board at the Town Hall: so many residents, so much food put by, so many wishes granted. Meet it, claim it, and {town} becomes a village, with market prices, a Trading Post and folk who wear waistcoats on purpose.',
        'I have already ordered the waistcoat.',
        'Expectantly,',
        'Odette',
      ].join('\n'),
      goal: { count: { what: 'rank', atLeast: 1 } },
      reward: { coins: 40, bond: 1 },
      hint: 'Meet the Village Charter and claim it at the Town Hall.',
    },
    {
      letter: [
        'To the Village of {town} (how well that looks),',
        "Prices! Proper ones, going up when bread is short and down when the bakers get carried away. Watch them on the market page and you can read the whole village's appetite like a book.",
        'Next, the wider world. Millhaven and Stonecross trade with any village that has a Trading Post. They buy what you have too much of and sell what you have too little of, at prices that wander about with the seasons. Build one by a good road and the caravans will do the rest. I have friends in both towns. Some of them still speak to me.',
        'Commercially,',
        'Odette',
      ].join('\n'),
      goal: { count: { what: 'buildings', ref: 'trading-post', atLeast: 1 } },
      reward: { coins: 30, mood: 10 },
      hint: 'Build a Trading Post.',
    },
    {
      letter: [
        'To both of you,',
        'The Trading Post smells of rope and opportunity. I visit it daily.',
        'One last lesson, and then I shall stop teaching and start haggling. A good merchant does not run to the post every morning. She leaves standing orders: keep so much in stock, sell above this, buy below that, and the post sees to it while she sleeps. It is a contract with the world, and the most restful thing in commerce.',
        'Set your first standing order. I will be at the post, pretending not to watch.',
        'With a firm handshake,',
        'Odette',
      ].join('\n'),
      goal: { count: { what: 'standingOrders', atLeast: 1 } },
      reward: { coins: 30 },
      hint: 'Set a standing order at the Trading Post.',
    },
  ],
  finale: {
    letter: [
      'To my partners in {town},',
      'Your first contract! I had it framed. The framer charged me twice the going rate and I paid it, because some things are worth overpaying for, and that is the only time you will ever hear me say so.',
      'When I arrived, your market was one stall and a hopeful look. Now there are prices with opinions, caravans on the road and two people who write each other requests and keep them. That last part is the rarest. Most towns never manage it.',
      'I have drawn up plans for a Market Hall: a roof over the stalls, a clock everybody will argue about and a balcony from which I intend to make announcements. They are yours.',
      'I am staying. I have said that four times before, but this time I bought furniture.',
      'Ever yours, at a very fair price,',
      'Odette Fenwick',
    ].join('\n'),
    unlock: ['market-hall'],
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
    coins: 40,
    bond: 1,
    mood: 20,
  },
};
