// Callings (playtest item 19, first slice; docs/spec/15-progression.md, Callings): the offer scored
// from the map at the Village claim, the once-only choice (together in a valley for two), and what
// each calling does: yield, visitors' pennies, festival guests and renown, lanterns, district styles.
import { callingTuning, content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { CHUNKS_PER_SIDE, CHUNK_SIZE, LEDGER_CATEGORIES, MAP_SIZE, TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { Terrain } from '../../src/map/layers';
import { createWorld, defaultSettings } from '../../src/state/create';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { startCharter } from '../../src/state/village';
import { ensureOffer, makeOffer } from '../../src/systems/callings/api';
import { callings } from '../../src/systems/callings';
import { callingYield } from '../../src/systems/callings/yield';
import { doorCharm, visitorPennies } from '../../src/systems/callings';
import { scoreCallings } from '../../src/systems/callings/score';
import { yieldPermille } from '../../src/systems/production/modifiers';
import { attendChance } from '../../src/systems/festivals/api';
import { grantFestival } from '../../src/systems/festivals/rewards';
import { recomputeChunk } from '../../src/systems/hearth/charm/compute';
import { pickStyle } from '../../src/systems/growth/desirability';
import { createTickCtx } from '../../src/turn';
import { feastFixture } from '../festivals/helpers';
import { addDecorAt } from '../fixtures/seasonsPlace';
import { villageFixture } from '../fixtures/village';
import { rejection, run, S } from '../helpers';

/** A village valley whose Charter is ready, claimed through the real command. */
function claimed(): { s: WorldState; events: ReturnType<typeof run>['events'] } {
  const s = villageFixture().state;
  s.charter = { ...startCharter('hamlet'), ready: true };
  const ctx = run(s, { t: 'charter.claim' });
  return { s, events: ctx.events };
}

const VISITORS = LEDGER_CATEGORIES.findIndex((c) => c.id === 'visitors');

function choose(s: WorldState, id: string): WorldState {
  expect(rejection(run(s, { t: 'calling.choose', id }))).toBeUndefined();
  expect(s.calling!.chosen).toBe(id);
  return s;
}

/** Pins the offer so a test can pick any calling without caring what the fixture's map suggests. */
function offerAll(s: WorldState): void {
  s.calling = { offered: ['garden-village', 'mill-town', 'pilgrims-rest'], reasons: ['a', 'b', 'c'], chosen: null, day: 0 };
}

describe('the offer', () => {
  it('scores the map the same way every time, best first, ties by id', () => {
    const w = createWorld('callings-a', { ...defaultSettings(), mode: 'standard' });
    const a = scoreCallings(w);
    expect(scoreCallings(w)).toEqual(a);
    expect(a.map((x) => x.id).sort()).toEqual(['garden-village', 'mill-town', 'pilgrims-rest']);
    for (let i = 1; i < a.length; i++) expect(a[i - 1]!.score).toBeGreaterThanOrEqual(a[i]!.score);
    for (const x of a) {
      expect(x.score).toBeGreaterThanOrEqual(0);
      expect(x.score).toBeLessThanOrEqual(1000);
      expect(Number.isInteger(x.score)).toBe(true);
    }
  });

  it('gives different seeds different pairs, and every calling is offered somewhere', () => {
    const pairs = new Set<string>();
    const offered = new Set<string>();
    for (let n = 0; n < 24; n++) {
      const w = createWorld(`valley-${n}`, { ...defaultSettings(), mode: 'standard' });
      const o = makeOffer(w);
      expect(o.offered).toHaveLength(callingTuning.offered);
      expect(o.reasons.every((r) => /^Your .+\.$/.test(r))).toBe(true);
      pairs.add([...o.offered].sort().join('+'));
      for (const id of o.offered) offered.add(id);
    }
    expect(pairs.size).toBeGreaterThanOrEqual(2);
    expect(offered.size).toBe(3);
  });

  it('is made at the Village claim, written up by the County, and never changes', () => {
    const f = villageFixture().state;
    f.charter = { ...startCharter('hamlet'), ready: true };
    expect(f.calling).toBeUndefined();
    const { s, events } = claimed();
    expect(s.charter.rank).toBe('village');
    const c = s.calling!;
    expect(c.offered).toHaveLength(2);
    expect(c.reasons).toHaveLength(2);
    expect(c.chosen).toBeNull();
    const letter = events.find((e) => e.e === 'notify' && e.kind === 'letter' && e.text.includes('Calling card'));
    expect(letter && letter.e === 'notify' && letter.text).toContain(content.callingById.get(c.offered[0]!)!.name);
    expect(letter && letter.e === 'notify' && letter.text).toContain(c.reasons[1]!);
    // The map changes, the County is asked again: nothing moves.
    const before = JSON.stringify(c);
    for (let i = 0; i < S * S; i++) s.map.terrain[i] = Terrain.meadow;
    ensureOffer(s, null);
    run(s, { t: 'time.setSpeed', speed: 1 });
    expect(JSON.stringify(s.calling)).toBe(before);
    // And it shows on the Charter view the card reads.
    const view = run(s, { t: 'calling.choose', id: c.offered[0]! }).events.find((e) => e.e === 'charter.updated');
    expect(view && view.e === 'charter.updated' && view.c.calling?.chosen).toBe(c.offered[0]);
  });
});

describe('saving', () => {
  it('keeps the offer and the choice through a save, and states without one hash as before', () => {
    const { s } = claimed();
    run(s, { t: 'calling.choose', id: s.calling!.offered[0]! });
    const back = deserialize(serialize(s));
    expect(back.calling).toEqual(s.calling);
    expect(hashState(back)).toBe(hashState(s));
    const plain = villageFixture().state;
    const withKey = JSON.stringify(deserialize(serialize(plain)).calling);
    expect(withKey).toBeUndefined();
    const before = hashState(plain);
    plain.calling = { offered: ['mill-town'], reasons: ['x'], chosen: null, day: 0 };
    expect(hashState(plain)).not.toBe(before);
  });
});

describe('calling.choose', () => {
  it('is not allowed before there is an offer (a Hamlet), nor for what was not offered', () => {
    const s = villageFixture().state;
    s.charter = startCharter('hamlet');
    expect(rejection(run(s, { t: 'calling.choose', id: 'mill-town' }))).toBe('NOT_ALLOWED');
    const { s: v } = claimed();
    const other = content.callings.find((c) => !v.calling!.offered.includes(c.id))!;
    expect(rejection(run(v, { t: 'calling.choose', id: other.id }))).toBe('INVALID');
    expect(rejection(run(v, { t: 'calling.choose', id: 'nonsense' }))).toBe('INVALID');
    expect(v.calling!.chosen).toBeNull();
  });

  it('chooses once: the Chronicle, a letter and the signature piece follow', () => {
    const { s } = claimed();
    const id = s.calling!.offered[1]!;
    const def = content.callingById.get(id)!;
    expect(s.hearth.unlocked).not.toContain(def.signature);
    const ctx = run(s, { t: 'calling.choose', id });
    expect(s.calling!.chosen).toBe(id);
    expect(s.hearth.unlocked).toContain(def.signature);
    expect(s.chronicle.some((c) => c.kind === 'calling' && c.text.includes(def.name))).toBe(true);
    expect(ctx.events.some((e) => e.e === 'notify' && e.kind === 'letter' && e.text.includes(def.name))).toBe(true);
    // Once only, whichever it was.
    expect(rejection(run(s, { t: 'calling.choose', id: s.calling!.offered[0]! }))).toBe('NOT_ALLOWED');
    expect(s.calling!.chosen).toBe(id);
  });

  it('waits for both seats in a valley for two, and lets a solo valley choose alone', () => {
    const { s } = claimed();
    const id = s.calling!.offered[0]!;
    s.time.connected = [0];
    expect(rejection(run(s, { t: 'calling.choose', id }))).toBe('TOGETHER_ONLY');
    expect(s.calling!.chosen).toBeNull();
    s.time.connected = [0, 1];
    expect(rejection(run(s, { t: 'calling.choose', id }))).toBeUndefined();
    const { s: solo } = claimed();
    solo.seats = [solo.seats[0]!];
    solo.time.connected = [0];
    expect(rejection(run(solo, { t: 'calling.choose', id: solo.calling!.offered[0]! }))).toBeUndefined();
  });
});

describe('Mill Town', () => {
  it('works workshops, mills, the quarry and the sawpits 10% faster, and nothing else', () => {
    const f = villageFixture();
    const s = f.state;
    offerAll(s);
    const method = (_id: string) => content.buildingById.get('windmill')!.methods![0]!;
    const buildingOf = (id: string) => s.buildings.find((b) => b.def === id)!;
    const gain = (id: string) => callingYield(s, buildingOf(id), content.buildingById.get(id)!, method(id));
    expect(gain('windmill')).toBe(1000);
    const mill = buildingOf('windmill');
    const millDef = content.buildingById.get('windmill')!;
    const before = yieldPermille(s, mill, millDef, method(''));
    choose(s, 'mill-town');
    expect(gain('windmill')).toBe(1100);
    expect(yieldPermille(s, mill, millDef, method(''))).toBe(Math.floor((before * 1100) / 1000));
    expect(gain('sawpit')).toBe(1100);
    expect(gain('bakery')).toBe(1100);
    expect(gain('cottage')).toBe(1000);
    const quarry = content.buildingById.get('quarry')!;
    expect(callingYield(s, buildingOf('windmill'), quarry, method(''))).toBe(1100);
  });

  it('is not applied under another calling', () => {
    const s = villageFixture().state;
    offerAll(s);
    choose(s, 'garden-village');
    const b = s.buildings.find((x) => x.def === 'windmill')!;
    const def = content.buildingById.get('windmill')!;
    expect(callingYield(s, b, def, def.methods![0]!)).toBe(1000);
  });
});

describe('Garden Village visitors', () => {
  const tickAtThree = (s: WorldState): ReturnType<typeof createTickCtx> => {
    const ctx = createTickCtx(s);
    callings.tick(s, ctx);
    return ctx;
  };

  it('spend each afternoon in proportion to charm and renown, booked as visitors', () => {
    const s = villageFixture().state;
    offerAll(s);
    choose(s, 'garden-village');
    s.map.charm.fill(30);
    expect(doorCharm(s)).toBe(30);
    const t = callingTuning.visitors;
    expect(visitorPennies(s)).toBe(30 * t.perCharm);
    s.renown.level = 2;
    expect(visitorPennies(s)).toBe(30 * t.perCharm + 2 * t.perRenown);
    const before = s.economy.treasury;
    const booked = s.economy.today.money[VISITORS]!;
    tickAtThree(s);
    expect(s.economy.treasury - before).toBe(visitorPennies(s));
    expect(s.economy.today.money[VISITORS]! - booked).toBe(visitorPennies(s));
    // About 3 to 15 coins a day for a small village.
    expect(visitorPennies(s)).toBeGreaterThanOrEqual(300);
    expect(visitorPennies(s)).toBeLessThanOrEqual(1500);
  });

  it('are capped, and come to nothing in a town with no charm and no homes', () => {
    const s = villageFixture().state;
    offerAll(s);
    choose(s, 'garden-village');
    s.map.charm.fill(100);
    s.renown.level = 5;
    expect(visitorPennies(s)).toBe(callingTuning.visitors.cap);
    expect(callingTuning.visitors.cap).toBeLessThanOrEqual(1500);
    s.households = [];
    expect(visitorPennies(s)).toBe(0);
  });

  it('only come to a Garden Village, and the County mentions them at most once a week', () => {
    const s = villageFixture().state;
    offerAll(s);
    s.map.charm.fill(30);
    const before = s.economy.treasury;
    tickAtThree(s);
    expect(s.economy.treasury).toBe(before);
    choose(s, 'mill-town');
    tickAtThree(s);
    expect(s.economy.treasury).toBe(before);

    const g = villageFixture().state;
    offerAll(g);
    choose(g, 'garden-village');
    g.map.charm.fill(30);
    let notices = 0;
    const days = callingTuning.visitors.noticeEveryDays * 3;
    for (let d = 0; d < days; d++) {
      g.tick = 5000 + d * TICKS_PER_DAY;
      const ctx = tickAtThree(g);
      notices += ctx.events.filter((e) => e.e === 'notify' && e.kind === 'visitors').length;
    }
    expect(notices).toBeGreaterThanOrEqual(2);
    expect(notices).toBeLessThanOrEqual(3);
  });
});

describe("Pilgrims' Rest", () => {
  it('draws about a fifth more festival guests', () => {
    const f = feastFixture(6, 11);
    const s = f.state;
    const r = s.residents.find((x) => x.stage === 'adult')!;
    r.mood = 60;
    const base = attendChance(s, r);
    offerAll(s);
    choose(s, 'garden-village');
    expect(attendChance(s, r)).toBe(base);
    s.calling!.chosen = null;
    choose(s, 'pilgrims-rest');
    const more = attendChance(s, r);
    expect(more).toBeGreaterThan(base);
    expect(Math.abs(more - Math.trunc((base * 1200) / 1000))).toBeLessThanOrEqual(1);
  });

  it('gives one more renown at 2 stars or better, and nothing extra at 1', () => {
    const points = (calling: string | null, stars: number): number => {
      const f = feastFixture(6, 22);
      const s = f.state;
      if (calling) {
        offerAll(s);
        choose(s, calling);
      }
      const plan = s.festival.plan!;
      const outcome = { attendance: 3, joy: { site: 50, variety: 50, menu: 50, music: 50, twist: 0 }, stars };
      const before = s.renown.points;
      grantFestival(s, createTickCtx(s), plan, [51, 52, 57, 58], outcome, []);
      return s.renown.points - before;
    };
    for (const stars of [2, 3, 5]) expect(points('pilgrims-rest', stars)).toBe(points(null, stars) + 1);
    expect(points('pilgrims-rest', 1)).toBe(points(null, 1));
    expect(points('mill-town', 3)).toBe(points(null, 3));
  });

  it('lights lanterns a little brighter at night, and leaves the day alone', () => {
    const light = (calling: string | null, night: boolean): number => {
      const s = villageFixture().state;
      s.map.charmLight.fill(0);
      if (calling) {
        offerAll(s);
        choose(s, calling);
      }
      addDecorAt(s, 'lantern', 140.5, 140.5);
      const chunk = Math.floor(140 / CHUNK_SIZE) * CHUNKS_PER_SIDE + Math.floor(140 / CHUNK_SIZE);
      recomputeChunk(s, chunk, night, null);
      return s.map.charmLight[140 * MAP_SIZE + 140]!;
    };
    const plain = light(null, true);
    expect(plain).toBeGreaterThan(0);
    expect(light('pilgrims-rest', true)).toBeGreaterThan(plain);
    expect(light('mill-town', true)).toBe(plain);
    expect(light('pilgrims-rest', false)).toBe(light(null, false));
  });
});

describe('district styles', () => {
  /** How many of 120 lots standing alone on open land the land hands to each style. */
  function shares(calling: string | null): Map<string, number> {
    const s = villageFixture().state;
    s.lots = [];
    if (calling) {
      offerAll(s);
      choose(s, calling);
    }
    const out = new Map<string, number>();
    for (let id = 1; id <= 120; id++) {
      const lot = {
        id,
        zone: 1 + (id % 4),
        x: 120 + (id % 10) * 5,
        z: 120 + Math.floor(id / 10) * 5,
        w: 2,
        d: 2,
        rot: 0 as const,
        frontage: 0,
        desirability: 50,
        style: '',
        buildingId: 0,
        tick: 0,
      };
      const style = pickStyle(s, lot);
      out.set(style, (out.get(style) ?? 0) + 1);
    }
    return out;
  }

  it('lean toward the calling, and never invent a style', () => {
    const none = shares(null);
    const garden = shares('garden-village');
    const mill = shares('mill-town');
    const pilgrim = shares("pilgrims-rest");
    const known = new Set(content.styles.map((x) => x.id));
    for (const m of [none, garden, mill, pilgrim]) for (const id of m.keys()) expect(known.has(id)).toBe(true);
    expect(garden.get('plaster') ?? 0).toBeGreaterThan(none.get('plaster') ?? 0);
    expect(mill.get('brick') ?? 0).toBeGreaterThan(none.get('brick') ?? 0);
    expect(pilgrim.get('stone') ?? 0).toBeGreaterThan(none.get('stone') ?? 0);
  });
});

describe('the signature pieces', () => {
  it('are locked decor with a charm, one per calling, until the calling unlocks them', () => {
    expect(content.callings).toHaveLength(3);
    for (const c of content.callings) {
      const piece = content.decorById.get(c.signature)!;
      expect(piece, c.id).toBeDefined();
      expect(piece.locked, c.id).toBe(true);
      expect(piece.lane, c.id).toBe('hearth');
      expect(piece.charm?.length, c.id).toBeGreaterThan(0);
      const s = villageFixture().state;
      offerAll(s);
      expect(s.hearth.unlocked).not.toContain(c.signature);
      choose(s, c.id);
      expect(s.hearth.unlocked).toContain(c.signature);
      for (const other of content.callings) if (other.id !== c.id) expect(s.hearth.unlocked).not.toContain(other.signature);
    }
  });
});
