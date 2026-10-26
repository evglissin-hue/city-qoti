import { content } from '@qoti/content';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { AGENT_STRIDE, CHUNKS_PER_SIDE, MAP_SIZE, START_TREASURY } from '../src/constants';
import { defaultSettings, createValley } from '../src/state/create';
import { findById } from '../src/state/entities';
import { hashState } from '../src/state/hash';
import { deserialize, serialize } from '../src/state/serialize';
import { SAVE_VERSION } from '../src/state/version';
import { markCharmDirty } from '../src/systems/hearth/charm/dirty';
import { addBond, addMoodModifier, modifierValue } from '../src/systems/residents/api';
import { doorTile, isAt, requestMove } from '../src/systems/movement/api';
import { movement } from '../src/systems/movement';
import { nearestOutletWithFood, takeFromOutlet } from '../src/systems/economy/outlets';
import { chronicle } from '../src/systems/chronicle/api';
import { createTickCtx } from '../src/turn';
import { buildView } from '../src/view';
import { agentFrame } from '../src/view/agents';
import { inspect } from '../src/view/inspect';
import { hamletFixture } from './fixtures/hamlet';
import { flatWorld, rejection, run } from './helpers';

const standard = () => ({ ...defaultSettings(), mode: 'standard' as const });

describe('hamlet fixture', () => {
  it('builds the same town every time', () => {
    const a = hamletFixture();
    const b = hamletFixture();
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.state.residents).toHaveLength(9);
    expect(a.state.households).toHaveLength(3);
    expect(a.state.buildings.every((x) => x.rt && x.stage === 'built')).toBe(true);
  });

  it('round trips through serialize with the same hash', () => {
    const { state } = hamletFixture();
    const back = deserialize(serialize(state));
    expect(hashState(back)).toBe(hashState(state));
    expect(back.residents[0]!.needs).toEqual(state.residents[0]!.needs);
  });

  it('gives every resident a home door and every job a worker list', () => {
    const f = hamletFixture();
    const th = findById(f.state.buildings, f.b.townHall)!;
    expect(th.rt!.workers).toHaveLength(2);
    for (const r of f.state.residents) {
      const h = findById(f.state.households, r.householdId)!;
      expect(r.tile).toBe(doorTile(findById(f.state.buildings, h.homeId)!));
    }
  });
});

describe('standard valley', () => {
  it('starts with the town from the spec, deterministically', () => {
    const a = createValley('meadow', standard());
    const b = createValley('meadow', standard());
    expect(hashState(a)).toBe(hashState(b));
    const defs = a.buildings.map((x) => x.def).sort();
    expect(defs).toEqual(['cottage', 'cottage', 'storehouse', 'town-hall', 'well']);
    expect(a.economy.treasury).toBe(START_TREASURY);
    const store = a.buildings.find((x) => x.def === 'storehouse')!.rt!.store;
    expect(store[content.goodIndex.get('planks')!]).toBe(30);
    expect(a.buildings.every((x) => x.stage === 'built')).toBe(true);
  });

  it('leaves sandbox valleys without runtime or money', () => {
    const w = createValley('meadow', defaultSettings());
    expect(w.buildings).toHaveLength(0);
    expect(w.economy.treasury).toBe(0);
  });

  it('places buildings as construction sites with runtime', () => {
    const w = flatWorld();
    w.settings.mode = 'standard';
    run(w, { t: 'build.place', def: 'cottage', x: 60, z: 60, rot: 0 });
    const b = w.buildings[0]!;
    expect(b.stage).toBe('construction');
    expect(b.rt!.construction!.needs[content.goodIndex.get('planks')!]).toBe(20);
  });

  it('refuses to switch a valley between sandbox and standard', () => {
    const w = flatWorld();
    expect(rejection(run(w, { t: 'valley.setSettings', settings: { mode: 'standard' } }))).toBe(
      'NOT_ALLOWED',
    );
  });

  it('keeps Pattern Book pieces locked until unlocked, in standard valleys only', () => {
    const w = flatWorld();
    w.settings.mode = 'standard';
    const cmd = { t: 'decor.place', def: 'ring-bench', fx: 60 * 256, fz: 60 * 256, rot: 0 } as const;
    expect(rejection(run(w, cmd))).toBe('LOCKED');
    w.hearth.unlocked.push('ring-bench');
    expect(rejection(run(w, cmd))).toBeUndefined();
    const sandbox = flatWorld();
    expect(rejection(run(sandbox, cmd))).toBeUndefined();
  });
});

describe('save version 2', () => {
  it('migrates an I0 save into an empty sandbox hamlet', () => {
    const w = flatWorld();
    run(w, { t: 'build.place', def: 'cottage', x: 60, z: 60, rot: 0 });
    const v2 = JSON.parse(strFromU8(gunzipSync(serialize(w)))) as Record<string, unknown>;
    // Rebuild what an I0 client saved: no I1 slices or layers, version 1.
    const map = { ...(v2.map as Record<string, string>) };
    for (const name of [
      'charm',
      'charmNature',
      'charmComfort',
      'charmLight',
      'charmView',
      'charmNoise',
      'fieldOwner',
      'crop',
    ]) {
      delete map[name];
    }
    const v1: Record<string, unknown> = { ...v2, map, saveVersion: 1 };
    for (const key of [
      'residents',
      'households',
      'economy',
      'logistics',
      'hearth',
      'wishes',
      'chronicle',
      'achievements',
      'stats',
      'networkVersion',
    ]) {
      delete v1[key];
    }
    const migrated = deserialize(gzipSync(strToU8(JSON.stringify(v1))));
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
    expect(migrated.settings.mode).toBe('sandbox');
    expect(migrated.residents).toEqual([]);
    expect(migrated.buildings[0]!.rt).toBeUndefined();
    expect(migrated.map.fieldOwner).toBeInstanceOf(Int32Array);
    w.saveVersion = SAVE_VERSION;
    expect(hashState(migrated)).toBe(
      hashState({ ...w, networkVersion: 0, hearth: { ...w.hearth, dirtyChunks: [] } }),
    );
  });
});

describe('ledger levers', () => {
  it('pauses buildings, raises sites and marks goods for sale', () => {
    const f = hamletFixture();
    run(f.state, { t: 'build.setPaused', id: f.b.bakery, paused: true });
    expect(findById(f.state.buildings, f.b.bakery)!.rt!.paused).toBe(true);
    expect(rejection(run(f.state, { t: 'build.setPriority', id: f.b.bakery, priority: true }))).toBe(
      'NOT_ALLOWED',
    );
    run(f.state, { t: 'ledger.setForSale', good: 'planks', forSale: true });
    expect(f.state.economy.forSale[content.goodIndex.get('planks')!]).toBe(true);
    expect(rejection(run(f.state, { t: 'ledger.setForSale', good: 'gold', forSale: true }))).toBe('INVALID');
  });
});

describe('cross-track API stubs', () => {
  it('walks residents to a target and reports arrival (C3A)', () => {
    const f = hamletFixture();
    const id = f.residents[0]![0]!;
    const target = 52 * MAP_SIZE + 60;
    expect(requestMove(f.state, id, target, 'schedule')).toBe('walking');
    expect(isAt(f.state, id, target)).toBe(false);
    const ctx = createTickCtx(f.state);
    for (let i = 0; i < 400 && !isAt(f.state, id, target); i++) movement.tick(f.state, ctx);
    expect(isAt(f.state, id, target)).toBe(true);
    expect(requestMove(f.state, id, target, 'schedule')).toBe('arrived');
  });

  it('serves food from the nearest outlet', () => {
    const f = hamletFixture();
    const outlet = nearestOutletWithFood(f.state, 50 * MAP_SIZE + 70);
    expect(outlet).toBe(f.b.stall);
    expect(takeFromOutlet(f.state, outlet, content.goodIndex.get('bread')!, 4)).toBe(4);
    expect(takeFromOutlet(f.state, outlet, content.goodIndex.get('bread')!, 40)).toBe(6);
  });

  it('decays mood modifiers and clamps bonds', () => {
    const f = hamletFixture();
    const id = f.residents[1]![0]!;
    addMoodModifier(f.state, id, { kind: 'wish-granted', value: 15, ticks: 100 });
    const r = findById(f.state.residents, id)!;
    expect(modifierValue(r.modifiers[0]!, f.state.tick + 50)).toBe(7);
    addMoodModifier(f.state, id, { kind: 'wish-granted', value: 10, ticks: 100 });
    expect(r.modifiers).toHaveLength(1);
    addBond(f.state, id, 9);
    expect(r.bond).toBe(3);
    addBond(f.state, id, 9, 'other');
    expect(r.bond).toBe(5);
  });

  it('writes Chronicle entries from templates', () => {
    const f = hamletFixture();
    const ctx = createTickCtx(f.state);
    chronicle(f.state, ctx, 'household-arrived', {
      text: [
        ['family', 'Fernsby'],
        ['place', 'Mill Lane'],
      ],
    });
    expect(f.state.chronicle[0]!.text).toBe(
      'The Fernsby family arrived through the valley gate and moved into Mill Lane.',
    );
    expect(ctx.events.some((e) => e.e === 'chronicle.added')).toBe(true);
  });

  it('marks charm chunks dirty, sorted and unique', () => {
    const w = flatWorld();
    markCharmDirty(w, [15, 15, 17, 17]);
    markCharmDirty(w, [0, 0, 1, 1]);
    expect(w.hearth.dirtyChunks).toEqual([0, 1, CHUNKS_PER_SIDE, CHUNKS_PER_SIDE + 1]);
  });
});

describe('views, frames and inspect', () => {
  it('builds every I1 view in the snapshot', () => {
    const { state } = hamletFixture();
    const view = buildView(state);
    expect(view.residents).toHaveLength(9);
    expect(view.patterns).toHaveLength(8);
    expect(view.achievements).toHaveLength(10);
    expect(view.stocks!.lines.find((l) => l.good === 'bread')!.stock).toBe(26);
    expect(view.buildings.find((b) => b.def === 'bakery')!.rt!.input).toEqual([['flour', 4]]);
  });

  it('writes stride-8 rows for residents outdoors only', () => {
    const f = hamletFixture();
    expect(agentFrame(f.state)).toHaveLength(0);
    const r = f.state.residents[0]!;
    r.inside = 0;
    r.move = {
      path: [r.tile + 1],
      step: 0,
      progress: 128,
      target: r.tile + 1,
      reason: 'schedule',
      version: 1,
    };
    const frame = agentFrame(f.state);
    expect(frame).toHaveLength(AGENT_STRIDE);
    expect(frame[0]).toBe(r.id);
    expect(frame[1]).toBeCloseTo((r.tile % MAP_SIZE) + 1, 5);
    expect(frame[5]).toBe(1);
  });

  it('answers inspect for residents, buildings and the away letter', () => {
    const f = hamletFixture();
    const detail = inspect(f.state, 'resident', f.residents[0]![0]!);
    expect(detail && 'r' in detail && detail.r.given).toBe('Clover');
    const b = inspect(f.state, 'building', f.b.cottages[0]);
    expect(b && 'household' in b && b.household?.family).toBe('Thistledown');
    run(f.state, { t: 'sys.seatLeft', seat: 1 });
    const letter = inspect(f.state, 'away', 1);
    expect(letter && 'stats' in letter && letter.stats[0]).toEqual(['Residents', 9, 9]);
  });
});
