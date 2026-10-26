// Resident inspector detail (C3A): what they are doing and where, a mood breakdown in plain words,
// needs, friends, family, a short bio and their history. View code: nothing here feeds back.
import { content } from '@qoti/content';
import { DAYS_PER_YEAR, MAP_SIZE, NEED_IDS, NEED_WEIGHTS, TILE_FP } from '../constants';
import type { Building, EntityId, HistoryItem, Resident, ResidentDetail, WorldState } from '../contracts';
import { findById } from '../state/entities';
import { worldIndex } from '../state/worldIndex';
import { treeStage, TREE_MATURE } from '../map/layers';
import { modifierValue } from '../systems/residents/api';
import { describeHome } from '../systems/residents/desirability';
import { cheerfulFriendBonus, needPoints } from '../systems/residents/needs';
import { dayIndex } from '../systems/residents/time';
import { doorOf } from '../systems/residents/places';
import { nameOf, residentView, wishView } from './hamlet';
import { storyView } from './village';

function buildingName(b: Building | undefined): string {
  return (b && content.buildingById.get(b.def)?.name.toLowerCase()) ?? 'somewhere';
}

function placeName(state: WorldState, id: EntityId): string {
  return buildingName(findById(state.buildings, id));
}

/** What a leisure spot is, from the feature they came for. */
function spotText(state: WorldState, feature: number, here: boolean): string {
  const x = feature % MAP_SIZE;
  const z = (feature - x) / MAP_SIZE;
  const decor = worldIndex(state)
    .decorGrid.near(x * TILE_FP + 128, z * TILE_FP + 128, 200)
    .sort((a, b) => a.id - b.id);
  for (const d of decor) {
    const tags = content.decorById.get(d.def)?.tags ?? [];
    if (tags.includes('bench') || tags.includes('seat'))
      return here ? 'Sitting on a bench' : 'Off to sit on a bench';
    if (tags.includes('birdbath'))
      return here ? 'Watching the birds at the birdbath' : 'Off to see the birds';
    if (tags.includes('flower')) return here ? 'Admiring the flowers' : 'Off to see the flowers';
    if (tags.includes('tree')) return here ? 'Resting under a tree' : 'Off to find some shade';
    if (tags.includes('hedge')) return here ? 'Inspecting a hedge' : 'Off to inspect a hedge';
    if (tags.includes('lantern')) return here ? 'Lingering by a lantern' : 'Off to the lanterns';
    if (tags.includes('mooring'))
      return here ? 'Watching the boats that are not there yet' : 'Off to the mooring';
  }
  const occupant = state.buildings.find((b) => doorOf(state, b.id) === feature);
  if (occupant) {
    const tags = content.buildingById.get(occupant.def)?.tags ?? [];
    if (tags.includes('well')) return here ? 'Chatting by the well' : 'Off to the well';
    if (tags.includes('market')) return here ? 'Browsing the market' : 'Off to the market';
    if (tags.includes('bakery'))
      return here ? 'Breathing in the bakery' : 'Following their nose to the bakery';
  }
  const tv = state.map.tree[feature] ?? 0;
  if (tv && treeStage(tv) >= TREE_MATURE) return here ? 'Resting under a tree' : 'Off to find a good tree';
  return here ? 'Enjoying the view of the water' : 'Off to the water';
}

function doingText(state: WorldState, r: Resident): string {
  const a = r.activity;
  const walking = !!r.move;
  switch (a.kind) {
    case 'arrive':
      return 'Arriving in the valley, with luggage';
    case 'home':
      return 'At home';
    case 'sleep':
      return 'Asleep';
    case 'commute':
      return `On the way to work at the ${placeName(state, a.to)}`;
    case 'work':
      return r.inside === a.at
        ? `At work at the ${placeName(state, a.at)}`
        : `Heading back to the ${placeName(state, a.at)}`;
    case 'shop': {
      if (a.carrying > 0 && r.carry) {
        const g = content.goods[r.carry[0]];
        return `Carrying ${r.carry[1]} ${g?.label ?? 'things'} home`;
      }
      return `Off to the ${placeName(state, a.outlet)} for groceries`;
    }
    case 'leisure':
      return spotText(state, a.tile, !walking);
    case 'visit': {
      const name = nameOf(state, a.friend) || 'a friend';
      return walking ? `On the way to see ${name}` : `Having tea with ${name}`;
    }
    case 'play':
      return 'Playing near home';
    case 'stroll':
      return r.species === 'hedgehog' ? 'Doing the evening rounds of the hedges' : 'Out for a stroll';
    case 'goHome':
      return 'Walking home';
    case 'stuck':
      return 'Lost, and too proud to ask';
    case 'leave':
      return 'Leaving the valley';
    case 'task': {
      if (r.carry)
        return `Carrying ${r.carry[1]} ${content.goods[r.carry[0]]?.label ?? 'things'} for the town`;
      return 'On an errand for the town';
    }
  }
}

const NEED_WORDS: readonly (readonly [min: number, text: string])[][] = [
  [
    [85, 'Fed well, with some variety'],
    [60, 'Fed, if a little plainly'],
    [35, 'Skipping the odd meal'],
    [0, 'Hungry, and saying so'],
  ],
  [
    [85, 'Water close by'],
    [50, 'A fair walk for water'],
    [0, 'Short of water'],
  ],
  [
    [85, 'A roof of their own'],
    [0, 'No roof to speak of'],
  ],
  [
    [85, 'Among friends'],
    [60, 'A friend or two'],
    [40, 'Still making friends'],
    [0, 'A bit lonely'],
  ],
  [
    [80, 'A lovely spot to live'],
    [55, 'A pleasant enough lane'],
    [35, 'Could do with some flowers'],
    [0, 'Rather drab, frankly'],
  ],
];

const MODIFIER_TEXT: readonly [kind: string, text: string][] = [
  ['wish-granted', 'Wish granted'],
  ['new-friend', 'Made a new friend'],
  ['fresh-start', 'New in town'],
  ['lean-times', 'Lean times'],
  ['lost', 'Got lost'],
];

function needText(i: number, value: number): string {
  for (const [min, text] of NEED_WORDS[i] ?? []) if (value >= min) return text;
  return NEED_IDS[i] ?? 'need';
}

function modifierText(kind: string): string {
  for (const [k, text] of MODIFIER_TEXT) if (k === kind) return text;
  const words = kind.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ROLE_TEXT: Record<string, string> = {
  worker: 'Started work at the',
  builder: 'Started as a builder at the',
  porter: 'Started as a porter at the',
  vendor: 'Started minding the',
};

function historyText(state: WorldState, r: Resident, item: HistoryItem): string {
  const ref = item.ref ?? 0;
  switch (item.kind) {
    case 'arrived': {
      const h = findById(state.households, r.householdId);
      return h && h.members.length > 1 ? 'Arrived in the valley with the family' : 'Arrived in the valley';
    }
    case 'moved-in':
    case 'moved': {
      const b = findById(state.buildings, ref);
      const where = b ? describeHome(state, b) : 'a new home';
      return item.kind === 'moved' ? `Moved house to ${where}` : `Moved into ${where}`;
    }
    case 'job': {
      const b = findById(state.buildings, ref);
      if (!b) return 'Started a job somewhere that is no longer there';
      const role = content.buildingById.get(b.def)?.jobs?.role ?? 'worker';
      return `${ROLE_TEXT[role] ?? ROLE_TEXT.worker} ${buildingName(b)}`;
    }
    case 'job-lost':
      return 'Lost their job when the workplace came down';
    case 'friend':
    case 'friend-3':
    case 'friend-4':
    case 'friend-5': {
      const name = nameOf(state, ref) || 'a neighbor who has since moved away';
      const how =
        item.kind === 'friend-5'
          ? 'Became best friends with'
          : item.kind === 'friend-4'
            ? 'Became close friends with'
            : item.kind === 'friend-3'
              ? 'Became good friends with'
              : 'Became friends with';
      return `${how} ${name}`;
    }
    case 'stuck':
      return 'Got lost on the way somewhere and pretended otherwise';
    case 'grew-young':
      return 'Grew up a bit, and grew taller about it';
    case 'grew-adult':
      return 'Came of age';
    case 'grew-elder':
      return 'Became an elder, with opinions to match';
    default: {
      const words = item.kind.split('-').join(' ');
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

function bioText(r: Resident): string {
  const sp = content.speciesById.get(r.species);
  const traits = r.traits.map((t) => {
    const def = content.traitById.get(t);
    return def ? (def.adjective ?? def.name.toLowerCase()) : t;
  });
  const who = `${traits.join(', ')} ${sp?.name.toLowerCase() ?? 'resident'}`;
  const article = /^[aeiou]/.test(who) ? 'An' : 'A';
  const bios = sp?.bios ?? [];
  const line = bios.length > 0 ? ` ${bios[r.look % bios.length]!.split('{name}').join(r.given)}` : '';
  return `${article} ${who}.${line}`;
}

export function residentDetail(state: WorldState, id: EntityId): ResidentDetail | null {
  const r = findById(state.residents, id);
  if (!r) return null;
  const h = findById(state.households, r.householdId);
  const ageDays = dayIndex(state.tick) - r.bornDay;
  const wish = r.wishId ? state.wishes.find((w) => w.id === r.wishId) : undefined;
  // I2 (C4.0): needs that weigh nothing yet (the tier needs, until C4A and C4C weigh them) stay out
  // of the inspector.
  const shown = NEED_IDS.map((_, i) => i).filter((i) => (NEED_WEIGHTS[i] ?? 0) > 0);
  const moodLines: { label: string; value: number }[] = shown.map((i) => ({
    label: needText(i, r.needs[i] ?? 0),
    value: Math.round(needPoints(r, i)),
  }));
  for (const t of r.traits) {
    const def = content.traitById.get(t);
    for (const [name, value] of def?.effects ?? []) {
      if (name === 'mood' && value) moodLines.push({ label: def!.name, value });
    }
  }
  const cheer = cheerfulFriendBonus(state, r);
  if (cheer) moodLines.push({ label: 'A cheerful friend', value: cheer });
  for (const m of r.modifiers) {
    const value = modifierValue(m, state.tick);
    if (value) moodLines.push({ label: modifierText(m.kind), value });
  }
  const detail: ResidentDetail = {
    r: residentView(state, r),
    mood: r.mood,
    needs: shown.map((i) => [NEED_IDS[i]!, r.needs[i] ?? 0]),
    moodLines,
    friends: r.friends
      .filter((f) => f.level > 0)
      .sort((a, b) => b.points - a.points || a.id - b.id)
      .map((f) => ({ id: f.id, name: nameOf(state, f.id), level: f.level })),
    householdMembers: (h?.members ?? [])
      .filter((m) => m !== r.id)
      .map((m) => ({ id: m, name: nameOf(state, m) })),
    doing: doingText(state, r),
    bio: bioText(r),
    history: r.history.map((item) => ({ ...item, text: historyText(state, r, item) })),
    age: { years: Math.max(0, Math.floor(ageDays / DAYS_PER_YEAR)), stage: r.stage },
  };
  if (wish) detail.wish = wishView(state, wish);
  addLives(state, r, detail);
  return detail;
}

/** I2 (C4.0): partner, parents, children, apprenticeship, retiring, story, savings. */
function addLives(state: WorldState, r: Resident, detail: ResidentDetail): void {
  if (r.partner) {
    detail.partner = { id: r.partner, name: nameOf(state, r.partner), married: (r.marriedDay ?? 0) > 0 };
  }
  if (r.parents?.length) detail.parents = r.parents.map((id) => ({ id, name: nameOf(state, id) }));
  const children = state.residents.filter((c) => c.parents?.includes(r.id));
  if (children.length > 0) detail.children = children.map((c) => ({ id: c.id, name: nameOf(state, c.id) }));
  if (r.apprentice) detail.apprenticeship = { ...r.apprentice };
  if (r.retired) detail.retired = true;
  const story = r.story ? state.stories.find((s) => s.arc === r.story) : undefined;
  if (story) detail.story = storyView(state, story);
  const h = findById(state.households, r.householdId);
  if (h?.savings) detail.savings = h.savings;
}
