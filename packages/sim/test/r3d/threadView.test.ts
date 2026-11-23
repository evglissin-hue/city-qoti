// R3D: Follow the thread's sentence (view/threads.ts). Every Thread in an autoplayed Village agrees
// with the saved door pairs: its names come in the order the text gives them and open real things,
// its counts are the pairs' counts, each named door reaches the next through the pairs, and the route
// passes every named door. Then the brief's cider, built from counts, and the honest thin lines.
import { content } from '@qoti/content';
import { beforeAll, describe, expect, it } from 'vitest';
import { THREAD_PAIRS_PER_DOOR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { EntityId, ThreadPair, ThreadSubject, ThreadView, WorldState } from '../../src/contracts';
import { base64ToBytes } from '../../src/state/base64';
import { findById } from '../../src/state/entities';
import { placeState } from '../../src/state/evenings';
import { hashState } from '../../src/state/hash';
import { deserialize } from '../../src/state/serialize';
import { doorTile } from '../../src/systems/movement/api';
import { placeIndex } from '../../src/systems/places';
import { recordThread } from '../../src/systems/threads/api';
import { advanceTo, createTickCtx } from '../../src/turn';
import { outletName } from '../../src/view/gaps';
import { threadView } from '../../src/view/threads';
import v8 from '../golden/v8-willow-day70.json';

function runTicks(state: WorldState, ticks: number): void {
  state.time.connected = [0, 1];
  const ctx = createTickCtx(state);
  const target = state.tick + ticks;
  while (state.tick < target) advanceTo(state, state.lastTurn + 1, ctx);
}

function willow(): WorldState {
  return deserialize(base64ToBytes(v8.save));
}

/** Homes as the Thread counts them: a keeper over the shop is the shop's door. */
function homesOf(state: WorldState): Set<EntityId> {
  const out = new Set<EntityId>();
  for (const h of state.households) {
    const b = findById(state.buildings, h.homeId);
    if (b && !content.buildingById.get(b.def)?.tags?.includes('outlet')) out.add(h.homeId);
  }
  return out;
}

/** The good a sentence is about, from its lead ("This fish:", "Corrie's fish:", "The fish here:"). */
function leadGood(text: string): number | undefined {
  const lead = text.slice(0, text.indexOf(':'));
  const word = lead
    .replace(/^(This|These|The) /, '')
    .replace(/ here$/, '')
    .replace(/^[^ ]+'s /, '')
    .toLowerCase();
  return content.goods.findIndex((g) => g.name.toLowerCase() === word);
}

/** Whether door `a` reaches door `b` through the pairs in at most `hops` steps (any good). */
function reaches(pairs: readonly ThreadPair[], a: EntityId, b: EntityId, hops = 3): boolean {
  let frontier = new Set([a]);
  for (let i = 0; i < hops; i++) {
    const next = new Set<EntityId>();
    for (const p of pairs) if (frontier.has(p.from) && p.to !== 0) next.add(p.to);
    if (next.has(b)) return true;
    frontier = next;
  }
  return false;
}

/** Checks one Thread against the pairs; returns what failed, or ''. */
function disagreement(state: WorldState, subject: ThreadSubject, v: ThreadView): string {
  const t = v.text;
  if (t === '') return v.refs.length || v.route.length ? 'empty text with refs or a route' : '';
  if (t.includes('—')) return 'an em dash';
  if (!t.endsWith('.')) return 'no full stop';
  // Names in order, each a real thing.
  let at = 0;
  for (const r of v.refs) {
    const i = t.indexOf(r.name, at);
    if (i < 0) return `ref "${r.name}" not in order`;
    at = i + r.name.length;
    if (r.ref.startsWith('building:')) {
      if (!findById(state.buildings, Number(r.ref.slice(9)))) return `no building ${r.ref}`;
    } else if (r.ref.startsWith('resident:')) {
      if (!findById(state.residents, Number(r.ref.slice(9)))) return `no resident ${r.ref}`;
    } else if (!placeState(state, r.ref)) return `no place ${r.ref}`;
  }
  const pairs = state.threads.pairs;
  const homes = homesOf(state);
  const g = leadGood(t);
  // Each named door reaches the next named door through the pairs.
  const doors = v.refs.filter((r) => r.ref.startsWith('building:')).map((r) => Number(r.ref.slice(9)));
  for (let i = 1; i < doors.length; i++) {
    if (!reaches(pairs, doors[i - 1]!, doors[i]!)) return `${doors[i - 1]} does not reach ${doors[i]}`;
  }
  // The seller: the last door named before the households or the place, else the subject's own door.
  const seller = (phraseAt: number): EntityId | undefined => {
    let last: EntityId | undefined;
    let cursor = 0;
    for (const r of v.refs) {
      const i = t.indexOf(r.name, cursor);
      cursor = i + r.name.length;
      if (i < phraseAt && r.ref.startsWith('building:')) last = Number(r.ref.slice(9));
    }
    if (/(sold|kept|on the shelf) here/.test(t) && subject.kind === 'building') return subject.id;
    return last;
  };
  const households = /taken home by (at least )?(\d+) households?/.exec(t);
  if (households) {
    const from = seller(households.index);
    if (from === undefined || g === undefined || g < 0) return 'households with no seller or good';
    const out = pairs.filter((p) => p.from === from && p.good === g);
    const n = out.filter((p) => homes.has(p.to)).length;
    if (n !== Number(households[2])) return `households ${households[2]} but the pairs have ${n}`;
    if (!!households[1] !== out.length >= THREAD_PAIRS_PER_DOOR) return 'at least, or not';
  }
  const had = /(\d+)(?: [a-z]+)? (drunk|eaten|bought) (here|at )/.exec(t);
  if (had && g !== undefined && g >= 0) {
    const atPlace = (p: ThreadPair, id: string): boolean => p.place === id && p.good === g;
    let units: number;
    if (subject.kind === 'place') {
      units = pairs.filter((p) => atPlace(p, subject.id)).reduce((n, p) => n + p.units, 0);
    } else {
      const place = v.refs.find((r) => !r.ref.startsWith('building:') && !r.ref.startsWith('resident:'));
      const from = seller(had.index);
      units = pairs.find((p) => p.from === from && place && atPlace(p, place.ref))?.units ?? -1;
    }
    if (Number(had[1]) !== units) return `had ${had[1]} but the pairs say ${units}`;
  }
  // The route passes every named door.
  for (const id of doors) {
    const b = findById(state.buildings, id)!;
    if (!v.route.includes(doorTile(b))) return `route misses ${id}`;
  }
  return '';
}

describe('the Thread in an autoplayed Village', () => {
  let state: WorldState;
  beforeAll(() => {
    state = willow();
    runTicks(state, 3 * TICKS_PER_DAY + 13 * TICKS_PER_HOUR);
  }, 120_000);

  it('agrees with the saved pairs for every building, resident, place and good', () => {
    const subjects: ThreadSubject[] = [
      ...state.buildings.map((b) => ({ kind: 'building', id: b.id }) as const),
      ...state.residents.map((r) => ({ kind: 'resident', id: r.id }) as const),
      ...placeIndex(state).places.map((p) => ({ kind: 'place', id: p.id }) as const),
      ...content.goods.map((g) => ({ kind: 'good', good: g.id }) as const),
    ];
    const wrong: string[] = [];
    let said = 0;
    for (const s of subjects) {
      const v = threadView(state, s);
      expect(v, JSON.stringify(s)).not.toBeNull();
      const why = disagreement(state, s, v!);
      if (why) wrong.push(`${JSON.stringify(s)}: ${v!.text} (${why})`);
      if (v!.refs.length) said++;
    }
    expect(wrong).toEqual([]);
    // Most of the town has a thread to follow, not just thin lines.
    expect(said).toBeGreaterThan(subjects.length / 3);
  });

  it('is pure: asking changes nothing that is saved or hashed, and asking again says the same', () => {
    const before = hashState(state);
    const a = threadView(state, { kind: 'good', good: 'fish' });
    const b = threadView(state, { kind: 'good', good: 'fish' });
    expect(b).toEqual(a);
    expect(hashState(state)).toBe(before);
  });

  it('says null for a subject that is gone', () => {
    expect(threadView(state, { kind: 'building', id: 9_999_999 })).toBeNull();
    expect(threadView(state, { kind: 'resident', id: 9_999_999 })).toBeNull();
    expect(threadView(state, { kind: 'place', id: 'site:nowhere:1' })).toBeNull();
    expect(threadView(state, { kind: 'good', good: 'moonbeams' })).toBeNull();
  });
});

describe("the brief's cider", () => {
  it('follows fruit from the orchard through the press to the folk who drank it', () => {
    const s = willow();
    const bld = (pred: (def: string, trade?: string) => boolean): EntityId =>
      s.buildings.find((b) => b.stage === 'built' && pred(b.def, b.trade ?? undefined))!.id;
    const orchard = bld((_, t) => t === 'orchard');
    const press = bld((_, t) => t === 'weaver');
    findById(s.buildings, press)!.trade = 'cider-maker';
    const store = bld((d) => d === 'storehouse');
    const stall = bld((d) => d === 'market-stall');
    const homes = [...homesOf(s)];
    const place = placeIndex(s).places.find((p) => placeState(s, p.id))!;
    const g = (id: string): number => content.goodIndex.get(id)!;
    s.threads.pairs = [];
    recordThread(s, orchard, store, g('fruit'), 10);
    recordThread(s, store, press, g('fruit'), 8);
    recordThread(s, press, store, g('cider'), 6);
    recordThread(s, store, stall, g('cider'), 6);
    recordThread(s, stall, place.id, g('cider'), 14);
    recordThread(s, stall, homes[0]!, g('cider'), 2);
    const name = (id: EntityId): string => outletName(s, findById(s.buildings, id)!);
    const placeName = placeState(s, place.id)!.custom ?? placeState(s, place.id)!.name;

    const v = threadView(s, { kind: 'building', id: press, good: 'cider' })!;
    expect(v.text).toBe(
      `This cider: fruit from ${name(orchard)}, pressed here, sold at ${name(stall)}, 14 mugs drunk at ${placeName} and taken home by 1 household.`,
    );
    expect(v.refs.map((r) => r.ref)).toEqual([`building:${orchard}`, `building:${stall}`, place.id]);
    expect(v.route[0]).toBe(doorTile(findById(s.buildings, orchard)!));
    expect(v.route).toContain(place.tile);

    const atPlace = threadView(s, { kind: 'place', id: place.id })!;
    expect(atPlace.text).toMatch(
      new RegExp(
        `^The cider here: fruit from ${name(orchard)}, pressed (on|at) .+, sold at ${name(stall)}, 14 mugs drunk here\\.$`,
      ),
    );
    const good = threadView(s, { kind: 'good', good: 'cider' })!;
    expect(good.text).toMatch(
      /^Cider: fruit from .+, pressed (on|at) .+, sold at .+, 14 mugs drunk at .+ and taken home by 1 household\.$/,
    );
    const fruit = threadView(s, { kind: 'building', id: orchard, good: 'fruit' })!;
    expect(fruit.text).toMatch(
      /^This fruit: picked here, pressed into cider (on|at) .+, sold at .+, 14 mugs drunk at .+\.$/,
    );
    const home = threadView(s, { kind: 'building', id: homes[0]! })!;
    expect(home.text).toMatch(/^The cider here: fruit from .+, pressed (on|at) .+, bought at .+\.$/);
  });
});

describe('thin threads say so', () => {
  it('in words that are honest and short', () => {
    const s = willow();
    s.threads.pairs = [];
    const home = [...homesOf(s)][0]!;
    const chandler = s.buildings.find((b) => b.trade === 'chandler');
    const hall = s.buildings.find((b) => b.def === 'town-hall')!;
    // A home's purchase may be a single unit, halved away by morning: with nothing counted it says nothing.
    expect(threadView(s, { kind: 'building', id: home })!.text).toBe('');
    if (chandler) {
      expect(threadView(s, { kind: 'building', id: chandler.id })!.text).toBe(
        'Nothing dipped here has gone anywhere lately.',
      );
    }
    expect(threadView(s, { kind: 'building', id: hall.id })!.text).toBe('');
    expect(threadView(s, { kind: 'good', good: 'candles' })!.text).toBe(
      'Nobody has bought any candles lately.',
    );
    // A place says nobody had a Treat only when its own evenings agree (a single sale halves away).
    for (const p of placeIndex(s).places) {
      const sold = (placeState(s, p.id)?.sold ?? []).some((n) => n > 0);
      expect(threadView(s, { kind: 'place', id: p.id })!.text).toBe(
        sold ? '' : 'Nobody has had a Treat here lately.',
      );
    }
  });
});
