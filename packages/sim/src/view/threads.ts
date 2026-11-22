// Follow the thread's view (R3D): one sentence of where a thing came from and where it goes, across
// both lanes, its names a click opens, and the route's tiles for the highlight while it is open
// (docs/spec/17-presentation.md, Follow the thread). Read from the thread counts (state.threads), the
// buildings, the places and the names; never from what moves between ticks. Pure: it builds nothing
// it keeps, and asks the walkers' path cache only for the route.
//
// A thread is a chain of doors for one good, the strongest pair at each step: where it was grown,
// where it was made (rule 2: a made good is never an input, so a chain makes at most one thing), the
// stores it passed through, the outlet it was sold at, and who had it (folk at a place, households
// taking it home). A door whose sales to homes and places outweigh what it sends on ends the chain
// there (a storehouse is an outlet too). Stores in the middle are walked in the route but left out
// of the words, which say no more than the counts do.
import { content, type GoodDef } from '@qoti/content';
import { MAP_SIZE, THREAD_PAIRS_PER_DOOR } from '../constants';
import type {
  Building,
  EntityId,
  PlaceId,
  ThreadPair,
  ThreadSubject,
  ThreadView,
  WorldState,
} from '../contracts';
import { findById } from '../state/entities';
import { placeState, shownName } from '../state/evenings';
import { isStorage, isStorehouse } from '../systems/logistics/stores';
import { doorTile } from '../systems/movement/api';
import { pathBetween } from '../systems/movement/paths';
import { placeIndex } from '../systems/places';
import { pairsFrom } from '../systems/threads/api';
import { capitalized, outletName } from './gaps';

/** How a made good was made, by good id ("pressed on Mill Lane"). */
const MADE: ReadonlyMap<string, string> = new Map([
  ['bread', 'baked'],
  ['brick', 'fired'],
  ['candles', 'dipped'],
  ['cider', 'pressed'],
  ['cloth', 'woven'],
  ['coats', 'sewn'],
  ['cordial', 'steeped'],
  ['furniture', 'built'],
  ['jam', 'boiled'],
  ['mead', 'brewed'],
  ['pies', 'baked'],
  ['smoked-fish', 'smoked'],
  ['soap', 'boiled'],
  ['toys', 'whittled'],
]);

/** How a raw good came off the land, by good id ("picked at the Hollins orchard"). */
const GROWN: ReadonlyMap<string, string> = new Map([
  ['butter', 'churned'],
  ['cheese', 'made'],
  ['firewood', 'cut'],
  ['fish', 'caught'],
  ['fruit', 'picked'],
  ['grain', 'grown'],
  ['honey', 'gathered'],
  ['stone', 'cut'],
  ['timber', 'felled'],
  ['vegetables', 'grown'],
  ['wool', 'shorn'],
]);

/** A Treat had at a place, by good id: how much of it and how ("14 mugs drunk"). */
const HAD: ReadonlyMap<string, [measure: string, one: string, verb: string]> = new Map([
  ['cider', ['mugs', 'mug', 'drunk']],
  ['cordial', ['glasses', 'glass', 'drunk']],
  ['honey', ['pots', 'pot', 'eaten']],
  ['jam', ['jars', 'jar', 'eaten']],
  ['mead', ['mugs', 'mug', 'drunk']],
  ['pies', ['pies', 'pie', 'eaten']],
]);

/** Goods named in the plural ("these candles"). */
const PLURAL: ReadonlySet<string> = new Set(['candles', 'coats', 'pies', 'toys', 'vegetables']);

/** A door's part on a chain: grew it, made it, kept it, sold it, took it home, or used it up (a site). */
type Role = 'source' | 'maker' | 'store' | 'outlet' | 'home' | 'use';

/** One door on the chain and the good it handled there. */
interface Step {
  id: EntityId;
  good: number;
  role: Role;
}

/** Who had the good at the chain's last door. */
interface End {
  from: EntityId;
  good: number;
  /** The place most of it was had at, and how much. */
  place: { id: PlaceId; units: number } | null;
  /** Households that took it home (distinct homes among the pairs). */
  homes: number;
  /** Those homes (building ids), in key order, for the route. */
  homeIds: EntityId[];
  /** The door kept as many pairs of the good as it may: there may have been more. */
  capped: boolean;
}

interface Chain {
  good: number;
  steps: Step[];
  end: End | null;
}

/** A piece of the sentence: words, or a name a click opens. */
type Piece = string | { name: string; ref: string };

/** What the view reads, gathered once a call. */
interface Ctx {
  state: WorldState;
  pairs: readonly ThreadPair[];
  /** Homes (building ids) to their household. */
  homes: Map<EntityId, EntityId>;
}

function ctxOf(state: WorldState): Ctx {
  const homes = new Map<EntityId, EntityId>();
  for (const h of state.households) {
    // A keeper living over the shop: the door is the shop's on a thread.
    const b = findById(state.buildings, h.homeId);
    if (b && content.buildingById.get(b.def)?.tags?.includes('outlet')) continue;
    homes.set(h.homeId, h.id);
  }
  return { state, pairs: state.threads.pairs, homes };
}

const goodOf = (g: number): GoodDef | undefined => content.goods[g];
const goodWord = (g: number): string => (goodOf(g)?.name ?? 'goods').toLowerCase();
const plural = (g: number): boolean => PLURAL.has(goodOf(g)?.id ?? '');
const building = (ctx: Ctx, id: EntityId): Building | undefined => findById(ctx.state.buildings, id);

/** The good indexes a building makes (its trade's or its own method's outputs, and its master's good). */
function outputsOf(b: Building): number[] {
  const out: number[] = [];
  const add = (id: string | null | undefined): void => {
    const i = id ? content.goodIndex.get(id) : undefined;
    if (i !== undefined && !out.includes(i)) out.push(i);
  };
  const trade = b.trade ? content.tradeById.get(b.trade) : undefined;
  if (trade) {
    add(trade.makes);
    for (const [g] of trade.method?.outputs ?? []) add(g);
  }
  for (const m of content.buildingById.get(b.def)?.methods ?? []) for (const [g] of m.outputs) add(g);
  for (const m of content.masters) if (m.of === b.trade || m.of === b.def) add(m.good);
  return out;
}

/** The good indexes a building makes things from. */
function inputsOf(b: Building): number[] {
  const out: number[] = [];
  const add = (id: string): void => {
    const i = content.goodIndex.get(id);
    if (i !== undefined && !out.includes(i)) out.push(i);
  };
  const trade = b.trade ? content.tradeById.get(b.trade) : undefined;
  if (trade) {
    for (const g of trade.from) add(g);
    for (const [g] of trade.method?.inputs ?? []) add(g);
  }
  for (const m of content.buildingById.get(b.def)?.methods ?? []) for (const [g] of m.inputs) add(g);
  return out;
}

/** Pairs of good `g` leaving door `from`, in key order. */
function outPairs(ctx: Ctx, from: EntityId, g: number): ThreadPair[] {
  const [start, end] = pairsFrom(ctx.pairs, from);
  const out: ThreadPair[] = [];
  for (let i = start; i < end; i++) if (ctx.pairs[i]!.good === g) out.push(ctx.pairs[i]!);
  return out;
}

/** Pairs of good `g` (any good with -1) arriving at building `to`, in key order. */
function inPairs(ctx: Ctx, to: EntityId, g: number): ThreadPair[] {
  return ctx.pairs.filter((p) => p.to === to && (g < 0 || p.good === g));
}

/** The pair with the most units; of equals the first in key order. */
function strongest(pairs: readonly ThreadPair[]): ThreadPair | null {
  let best: ThreadPair | null = null;
  for (const p of pairs) if (!best || p.units > best.units) best = p;
  return best;
}

function roleAt(ctx: Ctx, id: EntityId, g: number): Role {
  if (ctx.homes.has(id)) return 'home';
  const b = building(ctx, id);
  if (b && outputsOf(b).includes(g)) return goodOf(g)?.raw ? 'source' : 'maker';
  const def = b ? content.buildingById.get(b.def) : undefined;
  if (def?.tags?.includes('outlet')) return 'outlet';
  if (isStorage(def)) return 'store';
  return 'use';
}

const stepAt = (ctx: Ctx, id: EntityId, g: number): Step => ({ id, good: g, role: roleAt(ctx, id, g) });

/** The doors before `id` on the chain of good `g`, source first. */
function before(ctx: Ctx, id: EntityId, g: number, seen: Set<string>, depth: number): Step[] {
  if (depth > 6) return [];
  const b = building(ctx, id);
  if (!b) return [];
  let best: ThreadPair | null = null;
  if (outputsOf(b).includes(g)) {
    // Made here: follow the input it took most of.
    for (const r of inputsOf(b)) {
      for (const p of inPairs(ctx, id, r)) {
        if (!seen.has(`${p.from}:${r}`) && (!best || p.units > best.units)) best = p;
      }
    }
  } else {
    best = strongest(inPairs(ctx, id, g).filter((p) => !seen.has(`${p.from}:${g}`)));
  }
  if (!best) return [];
  seen.add(`${best.from}:${best.good}`);
  return [...before(ctx, best.from, best.good, seen, depth + 1), stepAt(ctx, best.from, best.good)];
}

/** The doors after `id` on the chain of good `g`, and who had it at the last one. */
function after(
  ctx: Ctx,
  id: EntityId,
  g: number,
  seen: Set<string>,
  depth: number,
): { steps: Step[]; end: End | null } {
  if (depth > 6) return { steps: [], end: null };
  const out = outPairs(ctx, id, g);
  let had = 0;
  let place: End['place'] = null;
  const homeIds: EntityId[] = [];
  const onward: ThreadPair[] = [];
  for (const p of out) {
    if (p.to === 0) {
      had += p.units;
      if (p.place && (!place || p.units > place.units)) place = { id: p.place, units: p.units };
    } else if (ctx.homes.has(p.to)) {
      had += p.units;
      homeIds.push(p.to);
    } else if (!seen.has(`${p.to}:${g}`)) onward.push(p);
  }
  const next = strongest(onward);
  if (had > 0 && (!next || had >= next.units)) {
    return {
      steps: [],
      end: {
        from: id,
        good: g,
        place,
        homes: homeIds.length,
        homeIds,
        capped: out.length >= THREAD_PAIRS_PER_DOOR,
      },
    };
  }
  if (!next) return { steps: [], end: null };
  seen.add(`${next.to}:${g}`);
  const nb = building(ctx, next.to);
  if (nb && inputsOf(nb).includes(g)) {
    // Made into something there: the chain goes on with what it made, the one it sent most of.
    const made = outputsOf(nb);
    let product = made[0] ?? -1;
    let most = -1;
    for (const m of made) {
      const units = outPairs(ctx, next.to, m).reduce((s, p) => s + p.units, 0);
      if (units > most) {
        most = units;
        product = m;
      }
    }
    if (product < 0) return { steps: [stepAt(ctx, next.to, g)], end: null };
    const rest = after(ctx, next.to, product, seen, depth + 1);
    return { steps: [{ id: next.to, good: product, role: 'maker' }, ...rest.steps], end: rest.end };
  }
  const rest = after(ctx, next.to, g, seen, depth + 1);
  return { steps: [stepAt(ctx, next.to, g), ...rest.steps], end: rest.end };
}

/** The whole chain of good `g` through door `id`. */
function chainThrough(ctx: Ctx, id: EntityId, g: number): Chain {
  // Doors are walked once a good: a storehouse takes the fruit in and sends the cider out.
  const seen = new Set<string>([`${id}:${g}`]);
  const up = before(ctx, id, g, seen, 0);
  const down = ctx.homes.has(id) ? { steps: [], end: null } : after(ctx, id, g, seen, 0);
  return { good: g, steps: [...up, stepAt(ctx, id, g), ...down.steps], end: down.end };
}

/** Units of each good that passed a door, in and out (the door's main good is the most). */
function goodsAt(ctx: Ctx, id: EntityId, dir: 'in' | 'out' | 'both'): number[] {
  const units = new Array<number>(content.goods.length).fill(0);
  if (dir !== 'in') {
    const [start, end] = pairsFrom(ctx.pairs, id);
    for (let i = start; i < end; i++) units[ctx.pairs[i]!.good]! += ctx.pairs[i]!.units;
  }
  if (dir !== 'out') for (const p of inPairs(ctx, id, -1)) units[p.good]! += p.units;
  return units;
}

/** The index of the largest count, or -1 when all are 0 (ties to the lower index). */
function most(units: readonly number[]): number {
  let best = -1;
  for (let i = 0; i < units.length; i++)
    if (units[i]! > 0 && (best < 0 || units[i]! > units[best]!)) best = i;
  return best;
}

// --- Words ---------------------------------------------------------------------------------------

/** A door's name in a sentence: "the Hollins orchard", "the storehouse", "the Fenwick home". */
function doorName(ctx: Ctx, id: EntityId): string {
  const b = building(ctx, id);
  if (!b) return 'a door long gone';
  const hid = ctx.homes.get(id);
  const h = hid !== undefined ? findById(ctx.state.households, hid) : undefined;
  if (h) return `the ${h.family} home`;
  return outletName(ctx.state, b);
}

/** The named street a door opens on, or null (the run through its door tile holds a street's anchor). */
function streetOf(ctx: Ctx, id: EntityId): string | null {
  const b = building(ctx, id);
  if (!b || ctx.state.streets.length === 0) return null;
  const door = doorTile(b);
  const road = ctx.state.map.road;
  if (door < 0 || door >= road.length || road[door]! <= 0) return null;
  const x = door % MAP_SIZE;
  const z = (door - x) / MAP_SIZE;
  let x0 = x;
  let x1 = x;
  while (x0 > 0 && road[z * MAP_SIZE + x0 - 1]! > 0) x0--;
  while (x1 < MAP_SIZE - 1 && road[z * MAP_SIZE + x1 + 1]! > 0) x1++;
  let z0 = z;
  let z1 = z;
  while (z0 > 0 && road[(z0 - 1) * MAP_SIZE + x]! > 0) z0--;
  while (z1 < MAP_SIZE - 1 && road[(z1 + 1) * MAP_SIZE + x]! > 0) z1++;
  for (const s of ctx.state.streets) {
    const ax = s.anchor % MAP_SIZE;
    const az = (s.anchor - ax) / MAP_SIZE;
    if ((az === z && ax >= x0 && ax <= x1) || (ax === x && az >= z0 && az <= z1)) return shownName(s);
  }
  return null;
}

function placeName(ctx: Ctx, id: PlaceId): string {
  const row = placeState(ctx.state, id);
  return row ? shownName(row) : 'a place';
}

const bref = (ctx: Ctx, id: EntityId): Piece => ({ name: doorName(ctx, id), ref: `building:${id}` });

/** How the chain's doors read, given the subject's door (said "here") and whose words they are. */
interface Voice {
  /** The subject's door: its step reads "here". */
  here: EntityId | null;
  /** A resident's workplace: named, not "here". */
  work: EntityId | null;
  /** The chain ends at the subject's home: its outlet reads "bought at". */
  home: EntityId | null;
  /** The subject is the place where the end's Treats were had: "here". */
  place: PlaceId | null;
}

/** The words for one step, or null when it is walked but not said (a store in the middle). */
function stepWords(ctx: Ctx, chain: Chain, i: number, voice: Voice): Piece[] | null {
  const s = chain.steps[i]!;
  const last = i === chain.steps.length - 1;
  const here = s.id === voice.here;
  const good = goodOf(s.good);
  const homeNext = voice.home !== null && chain.steps[i + 1]?.id === voice.home;
  switch (s.role) {
    case 'source': {
      const verb = GROWN.get(good?.id ?? '') ?? 'made';
      if (here) return [`${verb} here`];
      // Sold at its own gate to the home the thread is about.
      if (homeNext) return [`${verb} and bought at `, bref(ctx, s.id)];
      // The thread's own good: "picked at the Hollins orchard"; an input: "fruit from the Hollins orchard".
      return s.good === chain.good
        ? [`${verb} at `, bref(ctx, s.id)]
        : [`${goodWord(s.good)} from `, bref(ctx, s.id)];
    }
    case 'maker': {
      const verb = MADE.get(good?.id ?? '') ?? 'made';
      const into = s.good === chain.good ? '' : ` into ${goodWord(s.good)}`;
      if (here) return [`${verb}${into} here`];
      if (homeNext) return [`${verb} and bought at `, bref(ctx, s.id)];
      if (s.id !== voice.work) {
        const street = streetOf(ctx, s.id);
        if (street) return [`${verb}${into} on `, { name: street, ref: `building:${s.id}` }];
      }
      return [`${verb}${into} at `, bref(ctx, s.id)];
    }
    case 'store':
    case 'outlet': {
      const ends = chain.end?.from === s.id;
      // A storehouse keeps; a stall or a shop has it on the shelf.
      const def = content.buildingById.get(building(ctx, s.id)?.def ?? '');
      const kept = isStorehouse(def) || def?.id === 'granary' ? 'kept' : 'on the shelf';
      if (here) return [ends ? 'sold here' : last ? `${kept} here` : 'kept here'];
      if (homeNext) return ['bought at ', bref(ctx, s.id)];
      if (ends) return ['sold at ', bref(ctx, s.id)];
      if (last || s.id === voice.work) return [`${kept} at `, bref(ctx, s.id)];
      return null;
    }
    case 'use': {
      if (here) return ['used here'];
      const b = building(ctx, s.id);
      return [b?.stage === 'construction' ? 'built into ' : 'used at ', bref(ctx, s.id)];
    }
    case 'home':
      return null;
  }
}

/** Who had it at the end: "14 mugs drunk at the Promenade and taken home by 9 households". */
function endWords(ctx: Ctx, end: End, voice: Voice): Piece[] {
  const out: Piece[] = [];
  const good = goodOf(end.good);
  if (end.place) {
    const [many, one, verb] = HAD.get(good?.id ?? '') ?? ['', '', 'bought'];
    const n = end.place.units;
    const measure = many ? ` ${n === 1 ? one : many}` : '';
    const where: Piece[] =
      end.place.id === voice.place
        ? [' here']
        : [' at ', { name: placeName(ctx, end.place.id), ref: end.place.id }];
    out.push(`${n}${measure} ${verb}`, ...where);
  }
  if (end.homes > 0) {
    const who = `${end.capped ? 'at least ' : ''}${end.homes} ${end.homes === 1 ? 'household' : 'households'}`;
    out.push(end.place ? ` and taken home by ${who}` : `taken home by ${who}`);
  }
  return out;
}

/**
 * Joins the pieces into the view's text and refs. Two doors of one name ("the storehouse") are told
 * apart by their streets, where they have one.
 */
function compose(
  ctx: Ctx,
  lead: string,
  parts: Piece[][],
  tail: string,
): { text: string; refs: ThreadView['refs'] } {
  let text = lead;
  const refs: ThreadView['refs'] = [];
  const named = new Map<string, string>();
  parts.forEach((pieces, i) => {
    if (i > 0) text += ', ';
    for (const p of pieces) {
      if (typeof p === 'string') {
        text += p;
        continue;
      }
      let name = p.name;
      const other = named.get(name);
      if (other !== undefined && other !== p.ref && p.ref.startsWith('building:')) {
        const street = streetOf(ctx, Number(p.ref.slice(9)));
        if (street) name = `${name} on ${street}`;
      }
      named.set(p.name, p.ref);
      text += name;
      refs.push({ name, ref: p.ref });
    }
  });
  return { text: `${text}${tail}.`, refs };
}

/** The chain as one sentence after its lead ("This cider: "). */
function chainSentence(
  ctx: Ctx,
  lead: string,
  chain: Chain,
  voice: Voice,
): { text: string; refs: ThreadView['refs'] } {
  const parts: Piece[][] = [];
  chain.steps.forEach((_, i) => {
    const w = stepWords(ctx, chain, i, voice);
    if (w) parts.push(w);
  });
  if (chain.end) {
    const w = endWords(ctx, chain.end, voice);
    if (w.length) parts.push(w);
  }
  const lastStep = chain.steps[chain.steps.length - 1];
  const stops = !chain.end && lastStep?.role !== 'home' && lastStep?.role !== 'use' && voice.home === null;
  // Stone and timber are built with, not bought.
  const building = goodOf(chain.good)?.family === 'materials';
  const tail = building ? ', and no site has needed any lately' : ', and nobody has bought any lately';
  return compose(ctx, lead, parts, stops ? tail : '');
}

/** "This cider", "These candles", "Hazel's bread", "The bread here". */
function leadFor(g: number, who: 'this' | 'home' | 'place' | 'good' | string): string {
  const word = goodWord(g);
  if (who === 'good') return `${capitalized(word)}: `;
  if (who === 'this') return `${plural(g) ? 'These' : 'This'} ${word}: `;
  if (who === 'home' || who === 'place') return `The ${word} here: `;
  return `${who}'s ${word}: `;
}

// --- The route ------------------------------------------------------------------------------------

/** Door to door along the walkers' paths; a leg with no path is its two ends. Capped for the wire. */
const ROUTE_CAP = 2000;

/**
 * Door to door along the walkers' paths, in order, then from the last door out to the place and to
 * each home it was taken to. A leg with no path is its two ends. Capped for the wire.
 */
function routeOf(ctx: Ctx, chain: Chain, placeTile: number | null): number[] {
  const doorOf = (id: EntityId): number => {
    const b = building(ctx, id);
    return b ? doorTile(b) : -1;
  };
  const doors = chain.steps.map((s) => doorOf(s.id)).filter((d) => d >= 0);
  const route: number[] = [];
  const leg = (a: number, b: number): void => {
    if (route.length >= ROUTE_CAP) return;
    const path = a === b ? [] : pathBetween(ctx.state, a, b);
    if (path) route.push(...path);
    else route.push(b);
  };
  doors.forEach((d, i) => (i === 0 ? route.push(d) : leg(doors[i - 1]!, d)));
  const last = doors[doors.length - 1];
  if (last !== undefined) {
    if (placeTile !== null) leg(last, placeTile);
    for (const h of chain.end?.homeIds ?? []) {
      const d = doorOf(h);
      if (d >= 0) leg(last, d);
    }
  }
  return route.slice(0, ROUTE_CAP);
}

function placeTileOf(ctx: Ctx, chain: Chain): number | null {
  const id = chain.end?.place?.id;
  return id ? (placeIndex(ctx.state).byId.get(id)?.tile ?? null) : null;
}

// --- Subjects -------------------------------------------------------------------------------------

const NOBODY_YET = (g: number): string =>
  `Nobody has bought ${plural(g) ? 'these' : 'this'} ${goodWord(g)} lately.`;

function view(ctx: Ctx, subject: ThreadSubject, lead: string, chain: Chain, voice: Voice): ThreadView {
  const { text, refs } = chainSentence(ctx, lead, chain, voice);
  return { subject, text, refs, route: routeOf(ctx, chain, placeTileOf(ctx, chain)) };
}

const thin = (subject: ThreadSubject, text: string): ThreadView => ({ subject, text, refs: [], route: [] });

const NO_VOICE: Voice = { here: null, work: null, home: null, place: null };

function buildingThread(ctx: Ctx, subject: ThreadSubject & { kind: 'building' }): ThreadView | null {
  const b = building(ctx, subject.id);
  if (!b) return null;
  const isHome = ctx.homes.has(b.id);
  const asked = subject.good !== undefined ? content.goodIndex.get(subject.good) : undefined;
  // A maker's thread is what it makes (the one it sent most of, else its trade's first), never its
  // larger input; a home's what came in most; any other door's what passed it most.
  const made = isHome ? [] : outputsOf(b);
  let g = asked ?? -1;
  if (asked === undefined && made.length) {
    const sent = goodsAt(ctx, b.id, 'out');
    g = made.reduce((a, m) => (sent[m]! > sent[a]! ? m : a), made[0]!);
    if (sent[g] === 0 && goodsAt(ctx, b.id, 'in').every((u, i) => u === 0 || !inputsOf(b).includes(i)))
      g = -1;
  } else if (asked === undefined) g = most(goodsAt(ctx, b.id, isHome ? 'in' : 'both'));
  if (g < 0) {
    if (isHome) return thin(subject, 'Nothing has come home here lately.');
    const def = content.buildingById.get(b.def);
    if (made.length) {
      const first = made[0]!;
      const verb = (goodOf(first)?.raw ? GROWN : MADE).get(goodOf(first)?.id ?? '') ?? 'made';
      return thin(subject, `Nothing ${verb} here has gone anywhere lately.`);
    }
    if (def?.tags?.includes('outlet')) return thin(subject, 'Nobody has bought anything here lately.');
    if (isStorage(def)) return thin(subject, 'Nothing has passed through here lately.');
    // A building goods never pass through (the Town Hall, a well): no thread to follow.
    return thin(subject, '');
  }
  const chain = chainThrough(ctx, b.id, g);
  if (chain.steps.length === 1 && !chain.end)
    return thin(subject, isHome ? 'Nothing has come home here lately.' : NOBODY_YET(g));
  const voice: Voice = { ...NO_VOICE, here: isHome ? null : b.id, home: isHome ? b.id : null };
  return view(ctx, subject, leadFor(g, isHome ? 'home' : 'this'), chain, voice);
}

function residentThread(ctx: Ctx, subject: ThreadSubject & { kind: 'resident' }): ThreadView | null {
  const r = findById(ctx.state.residents, subject.id);
  if (!r) return null;
  const given = r.given;
  // Their work first, where goods pass through it; else what comes home to them.
  const work = r.jobId ? building(ctx, r.jobId) : undefined;
  if (work && !ctx.homes.has(work.id)) {
    const units = goodsAt(ctx, work.id, 'both');
    const made = outputsOf(work).filter((g) => units[g]! > 0);
    const g = made.length ? made.reduce((a, b) => (units[b]! > units[a]! ? b : a)) : most(units);
    if (g >= 0) {
      const chain = chainThrough(ctx, work.id, g);
      if (chain.steps.length > 1 || chain.end) {
        return view(ctx, subject, leadFor(g, given), chain, { ...NO_VOICE, work: work.id });
      }
    }
  }
  const h = findById(ctx.state.households, r.householdId);
  const home = h ? h.homeId : -1;
  const g = home >= 0 ? most(goodsAt(ctx, home, 'in')) : -1;
  if (g >= 0) {
    const chain = chainThrough(ctx, home, g);
    return view(ctx, subject, leadFor(g, given), chain, { ...NO_VOICE, home });
  }
  // A resident with no thread to follow says nothing: the same thin line on every inspector in town is
  // noise (the player's chair). Their workplace and home say it for themselves.
  return thin(subject, '');
}

function placeThread(ctx: Ctx, subject: ThreadSubject & { kind: 'place' }): ThreadView | null {
  const id = subject.id;
  const known = placeIndex(ctx.state).byId.has(id) || placeState(ctx.state, id) !== undefined;
  if (!known) return null;
  const units = new Array<number>(content.goods.length).fill(0);
  const from = new Map<number, ThreadPair>();
  for (const p of ctx.pairs) {
    if (p.place !== id) continue;
    units[p.good]! += p.units;
    const best = from.get(p.good);
    if (!best || p.units > best.units) from.set(p.good, p);
  }
  const g = most(units);
  if (g < 0) return thin(subject, 'Nobody has had a Treat here lately.');
  const outlet = from.get(g)!;
  const seen = new Set<string>([`${outlet.from}:${g}`]);
  const up = before(ctx, outlet.from, g, seen, 0);
  const chain: Chain = {
    good: g,
    steps: [...up, stepAt(ctx, outlet.from, g)],
    end: {
      from: outlet.from,
      good: g,
      place: { id, units: units[g]! },
      homes: 0,
      homeIds: [],
      capped: false,
    },
  };
  return view(ctx, subject, leadFor(g, 'place'), chain, { ...NO_VOICE, place: id });
}

function goodThread(ctx: Ctx, subject: ThreadSubject & { kind: 'good' }): ThreadView | null {
  const g = content.goodIndex.get(subject.good);
  if (g === undefined) return null;
  // Start where most of it left a door that did not take it in: where it was grown or made.
  const sent = new Map<EntityId, number>();
  const took = new Set<EntityId>();
  for (const p of ctx.pairs) {
    if (p.good !== g) continue;
    sent.set(p.from, (sent.get(p.from) ?? 0) + p.units);
    if (p.to !== 0) took.add(p.to);
  }
  let start: EntityId | null = null;
  let best = 0;
  let fallback: EntityId | null = null;
  let fallbackUnits = 0;
  for (const [id, n] of [...sent].sort((a, b) => a[0] - b[0])) {
    if (n > fallbackUnits) {
      fallback = id;
      fallbackUnits = n;
    }
    if (!took.has(id) && n > best) {
      start = id;
      best = n;
    }
  }
  const at = start ?? fallback;
  if (at === null) return thin(subject, `Nobody has bought any ${goodWord(g)} lately.`);
  const chain = chainThrough(ctx, at, g);
  return view(ctx, subject, leadFor(g, 'good'), chain, NO_VOICE);
}

/** The Thread for an inspector's subject, or null when the subject is gone. */
export function threadView(state: WorldState, subject: ThreadSubject): ThreadView | null {
  const ctx = ctxOf(state);
  switch (subject.kind) {
    case 'building':
      return buildingThread(ctx, subject);
    case 'resident':
      return residentThread(ctx, subject);
    case 'place':
      return placeThread(ctx, subject);
    case 'good':
      return goodThread(ctx, subject);
  }
}
