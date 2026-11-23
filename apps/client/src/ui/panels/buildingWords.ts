// P3A: what a building or a decor piece says about itself in the inspector. Pure functions, so the
// wording is testable: every def gets a true line of what it does where it stands, and a kind label
// that fits it (a garden bed is no "Service"). The facts come from the Mirror and the inspect detail.
import { content, type BuildingDef, type DecorDef } from '@qoti/content';
import type { BuildingDetail, BuildingView, HouseholdView } from '@qoti/sim';
import { GARDEN_BED_REACH, gardenBedReaches } from '@qoti/sim';
import { CATEGORY_WORD } from '../hamlet';
import { purposeCore } from '../purpose';

/** The kind label on a card: by what the building does first, then its category. */
export function kindWord(def: BuildingDef | undefined, trade?: string): string {
  if (!def) return 'Building';
  if (trade) return 'Business';
  const tags = def.tags ?? [];
  if (tags.includes('garden-bed')) return 'Garden';
  if (tags.includes('well')) return 'Water';
  if (tags.includes('dock')) return 'Waterside';
  if (tags.includes('bell') || tags.includes('watch-house') || tags.includes('tower')) return 'Watch';
  if (tags.includes('trap')) return 'Trap';
  if (tags.includes('wall') || tags.includes('gate')) return 'Defense';
  if (tags.includes('builders') && def.category === 'service') return 'Builders';
  if (tags.includes('market') || tags.includes('outlet') || def.coverage?.some((c) => c.kind === 'food')) {
    // A shop with a flat above is a shop first; the granary and storehouses are stores.
    if (def.category !== 'storage' && def.category !== 'home') return 'Market';
  }
  const cover = def.coverage?.find(
    (c) => c.kind === 'health' || c.kind === 'education' || c.kind === 'social',
  );
  if (cover?.kind === 'health') return 'Health';
  if (cover?.kind === 'education') return 'School';
  if (cover?.kind === 'social') return 'Meeting place';
  return CATEGORY_WORD[def.category] ?? 'Building';
}

/** Facts a "what it does" line may draw on; all optional, since a card can open before the detail. */
export interface DoingFacts {
  detail?: Pick<BuildingDetail, 'served' | 'reach' | 'hp' | 'gate' | 'producedToday'>;
  /** The family living here, for a home. */
  family?: string;
  /** Garden bed: families of the homes within reach, and how many homes there have no family yet. */
  beside?: { families: string[]; empty: number };
  winter?: boolean;
  /** The trade's own blurb, for a business. */
  tradeBlurb?: string;
}

/** "the Thorne family", "the Thorne and Pike families", "the Thorne, Pike and Wren families". */
export function familiesText(names: readonly string[]): string {
  const n = names.length;
  if (n === 0) return 'nobody';
  const list = n === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[n - 1]}`;
  return `the ${list} ${n === 1 ? 'family' : 'families'}`;
}

/**
 * The homes a garden bed gives to: built homes within its reach (the sim's own rule,
 * `gardenBedReaches`, which `gardenFlavors` reads), by the family living there, and the count of
 * homes with no family yet.
 */
export function homesBeside(
  bed: BuildingView,
  buildings: Iterable<BuildingView>,
  households: Iterable<HouseholdView>,
): { families: string[]; empty: number } {
  const family = new Map<number, string>();
  for (const h of households) family.set(h.homeId, h.family);
  const families: string[] = [];
  let empty = 0;
  for (const b of buildings) {
    if (b.stage !== 'built' || b.id === bed.id) continue;
    if (!content.buildingById.get(b.def)?.housing) continue;
    if (!gardenBedReaches(bed, b)) continue;
    const f = family.get(b.id);
    if (f === undefined) empty++;
    else if (!families.includes(f)) families.push(f);
  }
  return { families, empty };
}

function gardenBedLine(def: BuildingDef, facts: DoingFacts): string {
  const radius = def.charm?.[0]?.radius ?? 2;
  const greens = `Its greenery lifts the charm within ${radius} tiles.`;
  const beside = facts.beside ?? { families: [], empty: 0 };
  if (beside.families.length > 0) {
    const who = familiesText(beside.families);
    return facts.winter
      ? `Resting for the winter. Come spring it gives ${who} vegetables with supper again. ${greens}`
      : `Gives ${who} vegetables with supper, spring to autumn; it rests in winter. ${greens}`;
  }
  if (beside.empty > 0)
    return `The home beside it has no family yet. Once one moves in, supper gets vegetables. ${greens}`;
  return `No door within reach. Set it beside a home, within ${GARDEN_BED_REACH} tiles, and supper gets more interesting. ${greens}`;
}

function defenseLine(def: BuildingDef, facts: DoingFacts): string | null {
  const d = def.defense;
  if (!d) return null;
  const hp = facts.detail?.hp;
  const holds = hp ? `${hp.now} of ${hp.max} hit points left` : d.hp ? `${d.hp} hit points` : '';
  if (d.passable === 'gate') {
    const state = facts.detail?.gate
      ? facts.detail.gate.open
        ? ' It stands open now.'
        : ' It is shut now.'
      : '';
    return `Lets folk and carts through while open and holds the line when shut (${holds}).${state}`;
  }
  if (d.blocks)
    return `A wall piece: raiders must break through it (${holds}), and masons mend it between raids.`;
  if (d.trap) return `A trap on the raiders' path. The Watch resets it once it has sprung.`;
  if (d.towerRange) {
    const days = d.warningDays ?? 1;
    return `Sees raiders coming ${days === 1 ? 'a day' : `${days} days`} sooner and steadies the Watch within ${d.towerRange} tiles.`;
  }
  if (def.tags?.includes('bell'))
    return 'When it rings, everyone not on the Watch goes home and stays there.';
  if (def.tags?.includes('watch-house'))
    return 'Where the Watch musters: bonded adults volunteer, serve one day in four, and all turn out on a raid day.';
  return null;
}

/**
 * Buildings whose data would read thinly ("Gathers honey."): their own words, true to what the sim
 * does with them (docs/spec/13-ledger.md, Land and specialized buildings). Numbers come from the def.
 */
const DOING_WORDS: Record<string, (d: BuildingDef) => string> = {
  apiary: () => 'Honey comes in as fast as the flowers around it allow, so plant some.',
  'bath-house': () =>
    'Hot water and gossip, in that order. It looks after health in reach, and in winter the households there feel the cold far less.',
  brickworks: () => 'Fires brick from the clay under it, burning firewood.',
  fishery: () => 'Brings in fish from the water at its door.',
  granary: (d) =>
    `The food store: keeps up to ${d.storage?.toLocaleString('en-US')} food, which spoils half as fast in here. Homes and shops in reach draw on it.`,
  'market-square': (d) =>
    `The town's main outlet: stalls for every family of goods, where the carrier sets out what it brought and market day is held. Homes within ${d.coverage?.[0]?.radius ?? 20} tiles shop here.`,
  quarry: () => 'Cuts stone from the deposit it stands on.',
  'town-hall': () =>
    "The town's heart. Its builders work from here, and it lends a good deal of comfort to the streets around it.",
  'trading-post': () =>
    "The carrier's depot by the valley road: more carried each day, and better terms. It keeps goods too, with porters of its own.",
};

/** The "what it does now" line for a built building. Null only when the data says nothing (tested). */
export function doingLine(def: BuildingDef | undefined, facts: DoingFacts = {}): string | null {
  if (!def) return null;
  if (def.tags?.includes('garden-bed')) return gardenBedLine(def, facts);
  const written = DOING_WORDS[def.id];
  if (written) return written(def);
  if (facts.tradeBlurb) return `${facts.tradeBlurb.replace(/\.$/, '')}.`;
  if (def.housing) {
    const shop = def.coverage?.some((c) => c.kind === 'food')
      ? ' The shop below sells food to homes nearby.'
      : '';
    return facts.family
      ? `The ${facts.family} family lives here.${shop}`
      : `A home with no family in it yet.${shop}`;
  }
  const defense = defenseLine(def, facts);
  if (defense) return defense;
  const core = purposeCore(def);
  if (!core) return null;
  const reach = facts.detail?.reach;
  if (reach && def.enables?.length) return `${core} ${reach.served} of ${reach.capacity} places taken.`;
  return core;
}

/** Words for decor that has no charm, slows or festival role to read one from. Kept explicit. */
export const DECOR_WORDS: Record<string, string> = {
  barrels: 'Stacked for looks. It holds nothing, but it looks as if it might.',
  crates: 'Stacked for looks. It holds nothing, but it looks as if it might.',
  'low-wall': 'A low wall for a boundary. Walkers go around it.',
  signpost: 'Points somewhere helpful, or at least confidently.',
};

const tiles = (r: number) => `${r} ${r === 1 ? 'tile' : 'tiles'}`;
const CHARM_WORD: Record<string, (r: number, night: boolean) => string> = {
  nature: (r) => `Greenery that lifts the charm within ${tiles(r)}.`,
  comfort: (r) => `A comfort to everyone within ${tiles(r)}.`,
  light: (r, night) => `Gives light within ${tiles(r)}${night ? ', and more of it after dark' : ''}.`,
  view: (r) => `Gives the neighbors something to look at within ${tiles(r)}.`,
  noise: (r) => `Makes a racket within ${tiles(r)}.`,
};
/** A lead for pieces whose use is plain from their tags. */
const DECOR_LEAD: [tag: string, words: string][] = [
  ['play', 'Somewhere for children to play.'],
  ['seat', 'Somewhere to sit.'],
];

/** What a decor piece does, from its def: charm, slowing raiders, a festival's short life. */
export function decorLine(def: DecorDef | undefined): string | null {
  if (!def) return null;
  const parts: string[] = [];
  if (def.festival)
    parts.push(
      def.festival.keepable
        ? 'A festival piece. It comes down the morning after unless you keep it.'
        : 'A festival piece. It comes down the morning after.',
    );
  const lead = DECOR_LEAD.find(([tag]) => def.tags.includes(tag));
  if (lead && !def.festival) parts.push(lead[1]);
  const c = def.charm?.[0];
  if (c) {
    const night = c.nightValue !== undefined && Math.abs(c.nightValue) > Math.abs(c.value);
    parts.push(CHARM_WORD[c.category]!(c.radius, night));
  }
  if (def.slows) parts.push(`Raiders crossing it are slowed by ${def.slows} percent.`);
  if (parts.length === 0) {
    const written = DECOR_WORDS[def.id];
    if (written) parts.push(written);
  }
  return parts.length ? parts.join(' ') : null;
}
