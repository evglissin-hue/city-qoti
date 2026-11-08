// Words for the Village systems (C4C): tier notices and what the inspector says is missing.
// {family} is the household's family name, {home} the old home's name, {tier} the tier's name.

export const villagePhrases = {
  /** A home upgrade starts (materials on their way). */
  upgradeStarted: [
    'The {family}s have outgrown the {home}. Bricks are on their way.',
    'The {family}s are going up in the world, one brick at a time.',
    'Plans are drawn at the {family}s: a townhouse, if the porters oblige.',
  ],
  /** The household reached the next tier (the home swapped, or was already fine). */
  tierUp: [
    'The {family}s are {tier} now, and the chimney has never looked smarter.',
    'A new brass knocker at the {family}s. {tier}, if you please.',
    'The {family}s count themselves {tier} these days, and so does the whole lane.',
  ],
  /** The household slid back after days of going without. */
  tierDown: [
    'The {family}s have tightened their belts. Settlers again, for now.',
    'Lean days at the {family}s. They are making do, and they will be back.',
  ],
  /** Tier names for those lines, in TIERS order. */
  tierNames: ['Settlers', 'Craftsfolk', 'Merchants', 'Patrons'],
  /** What a household still lacks for the next tier, by need (inspector). */
  missing: {
    food: 'bread and another kind of food',
    savings: 'a little more put by',
    charm: 'a prettier street',
    social: 'a tavern nearby',
    health: 'a herbalist nearby',
    education: 'a school nearby',
    home: 'a home that can grow',
  } as Readonly<Record<string, string>>,
} as const;
