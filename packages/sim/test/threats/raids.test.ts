// C5D: raid resolution, step by step (14-challenge.md, Raid resolution), and its determinism.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, RAIDER_CARRY, TICKS_PER_HOUR } from '../../src/constants';
import type { Raider, WorldState } from '../../src/contracts';
import { evaluate } from '../../src/conditions';
import { findById } from '../../src/state/entities';
import { hashState } from '../../src/state/hash';
import { defenseTick, PIT_MORALE } from '../../src/systems/defenses';
import { raiderGrid } from '../../src/systems/raids/grid';
import { RAID_TICKS, raidTick, startRaid, towerCrews, UNIT } from '../../src/systems/raids/run';
import { frontOf, raidStartTick } from '../../src/systems/threats/api';
import { createTickCtx, runTick } from '../../src/turn';
import { townStock } from '../../src/view/hamlet';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { placeFree, tickAt } from '../fixtures/seasonsPlace';
import { raidAtDusk, threatFixture } from '../fixtures/threat';

const S = MAP_SIZE;

function raider(s: WorldState, k = 0): Raider {
  return s.raid!.raiders[k]!;
}

/** Puts a raider on a tile, standing (or walking a path). */
function put(r: Raider, x: number, z: number, path: number[] | null = null): void {
  r.tile = z * S + x;
  r.move = path
    ? { path, step: 0, progress: 0, target: path[path.length - 1]!, reason: 'task', version: 0 }
    : null;
}

/** Stands a resident outdoors on a tile. */
function stand(s: WorldState, id: number, x: number, z: number): void {
  const r = findById(s.residents, id)!;
  r.inside = 0;
  r.move = null;
  r.tile = z * S + x;
}

/** Everyone else off the board, so one raider's story can be told alone. */
function alone(s: WorldState, keep = 1): void {
  for (const r of s.raid!.raiders.slice(keep)) r.state = 'gone';
}

describe('1. spawn', () => {
  it('raiders come at dusk at the telegraphed edge, morale 10, empty-handed; pressure resets', () => {
    const f = threatFixture();
    const s = f.state;
    s.tick = raidStartTick(s.threats.scheduled!);
    const ctx = createTickCtx(s);
    runTick(s, ctx);
    expect(s.raid).not.toBeNull();
    expect(s.raid!.raiders).toHaveLength(6);
    for (const r of s.raid!.raiders) {
      expect(Math.floor(r.tile / S)).toBeLessThan(8);
      expect(r.load).toEqual([]);
    }
    expect(s.raid!.raiders.every((r) => r.morale <= 10 && r.morale > 9)).toBe(true);
    expect(s.threats.pressure).toBe(0);
    expect(ctx.events.some((e) => e.e === 'raid.started')).toBe(true);
    // A bell tower rings itself.
    const g = threatFixture();
    placeFree(g.state, 'bell-tower', 120, 40);
    g.state.tick = raidStartTick(g.state.threats.scheduled!);
    startRaid(g.state, createTickCtx(g.state));
    expect(g.state.raid!.bell).toBe(true);
  });
});

describe('2. walls and gates', () => {
  it('a raider breaks a wall piece by its hit points over time; the breach is walkable', () => {
    const d = raidAtDusk();
    const s = d.state;
    alone(s);
    const wall = s.buildings.find((b) => b.def === 'palisade' && b.x === 40 && b.z === 45)!;
    const t = 45 * S + 40;
    expect(raiderGrid(s).cost[t]).toBeGreaterThan(10);
    put(raider(s), 40, 44, [t, 46 * S + 40]);
    const ctx = createTickCtx(s);
    defenseTick(s, ctx);
    expect(wall.rt!.hp).toBe(99);
    for (let i = 0; i < 99; i++) defenseTick(s, ctx);
    expect(wall.rt!.hp).toBe(0);
    expect(raiderGrid(s).cost[t]).toBeLessThan(10);
    // Residents still cannot walk through the stump until it is mended.
    expect(s.map.occupant[t]).toBe(wall.id);
  });

  it('the bell shuts every gate; open gates are ground to raiders, shut ones a wall', () => {
    const d = raidAtDusk();
    const s = d.state;
    const gate = findById(s.buildings, d.gate)!;
    const g = gate.z * S + gate.x;
    s.raid!.bell = false;
    gate.rt!.open = true;
    expect(raiderGrid(s).cost[g]).toBeLessThan(10);
    s.raid!.bell = true;
    defenseTick(s, createTickCtx(s));
    expect(gate.rt!.open).toBe(false);
    expect(raiderGrid(s).cost[g]).toBeGreaterThan(10);
  });
});

describe('3. towers', () => {
  it('a crewed tower lowers the morale of raiders in range, by crew and training', () => {
    const d = raidAtDusk();
    const s = d.state;
    alone(s, 2);
    expect(towerCrews(s)).toHaveLength(1);
    put(raider(s, 0), 60, 40);
    put(raider(s, 1), 60, 20);
    defenseTick(s, createTickCtx(s));
    expect(raider(s, 0).morale).toBeLessThan(10);
    expect(raider(s, 1).morale).toBe(10);
    const one = 10 - raider(s, 0).morale;
    s.watch.training = 160;
    defenseTick(s, createTickCtx(s));
    expect(10 - one - raider(s, 0).morale).toBeGreaterThan(one);
  });
});

describe('traps', () => {
  it('a net catches a raider, a pit costs morale and time; each springs once', () => {
    const d = raidAtDusk();
    const s = d.state;
    alone(s, 2);
    const net = placeFree(s, 'net-trap', 120, 30);
    const pit = placeFree(s, 'pit-trap', 122, 30);
    put(raider(s, 0), 120, 30);
    put(raider(s, 1), 122, 30, [31 * S + 122]);
    const ctx = createTickCtx(s);
    defenseTick(s, ctx);
    expect(raider(s, 0).state).toBe('captured');
    expect(s.threats.captives).toContain(raider(s, 0).id);
    expect(raider(s, 1).morale).toBeCloseTo(10 - PIT_MORALE, 5);
    expect(raider(s, 1).move!.progress).toBeLessThan(0);
    expect(net.rt!.hp).toBe(0);
    expect(pit.rt!.hp).toBe(0);
    raider(s, 1).morale = 10;
    defenseTick(s, ctx);
    expect(raider(s, 1).morale).toBe(10);
  });
});

describe('4. contact, flight and capture', () => {
  it('each side loses morale by the other side`s strength', () => {
    const d = raidAtDusk();
    const s = d.state;
    alone(s);
    s.watch.posture = [];
    put(raider(s), 60, 38, [38 * S + 61]);
    stand(s, d.watch[0]!, 59, 38);
    const w = s.raid!.watch[0]!;
    raidTick(s, createTickCtx(s));
    expect(raider(s).morale).toBeLessThan(10);
    expect(w.morale).toBeLessThan(10);
  });

  it('a raider at 0 is captured with two of the Watch beside, and flees with one', () => {
    for (const helpers of [1, 2]) {
      const d = raidAtDusk();
      const s = d.state;
      alone(s);
      put(raider(s), 60, 38, [38 * S + 61]);
      raider(s).morale = 1 / UNIT;
      for (let k = 0; k < helpers; k++) stand(s, d.watch[k]!, 59, 37 + k);
      const ctx = createTickCtx(s);
      const r = raider(s);
      raidTick(s, ctx);
      if (helpers === 2) {
        expect(r.state).toBe('captured');
        expect(ctx.events.some((e) => e.e === 'bandit.captured')).toBe(true);
      } else expect(r.state).toBe('flee');
    }
  });

  it('a Watch member at 0 is shaken, goes home and rests a day; nobody is hurt', () => {
    const d = raidAtDusk();
    const s = d.state;
    alone(s);
    put(raider(s), 60, 38, [38 * S + 61]);
    const res = findById(s.residents, d.watch[0]!)!;
    res.watch = { dutyDay: 0, shakenUntil: 0 };
    stand(s, res.id, 59, 38);
    s.raid!.watch[0]!.morale = 1 / UNIT;
    raidTick(s, createTickCtx(s));
    expect(s.raid!.watch[0]!.state).toBe('shaken');
    expect(res.watch.shakenUntil).toBeGreaterThan(s.tick);
    expect(s.residents.find((r) => r.id === res.id)).toBeTruthy();
  });
});

describe('5. theft and recovery', () => {
  it('takes up to 8 of the most valuable goods and 20% of the condition, then runs', () => {
    const d = raidAtDusk();
    const s = d.state;
    alone(s);
    const store = findById(s.buildings, raider(s).target)!;
    const front = frontOf(store);
    put(raider(s), front % S, Math.floor(front / S));
    const cond = store.rt!.condition;
    const before = townStock(s).slice();
    raidTick(s, createTickCtx(s));
    const r = raider(s);
    const took = r.load.reduce((a, [, n]) => a + n, 0);
    expect(took).toBeGreaterThan(0);
    expect(took).toBeLessThanOrEqual(RAIDER_CARRY);
    expect(store.rt!.condition).toBe(cond - Math.floor((cond * 20) / 100));
    expect(r.state).toBe('flee');
    // The most valuable first: nothing left behind dearer than the cheapest taken.
    const cheapest = Math.min(...r.load.map(([g]) => content.goods[g]!.basePrice));
    const after = townStock(s);
    for (let g = 0; g < after.length; g++) {
      if (content.goods[g]!.basePrice > cheapest && took < RAIDER_CARRY)
        expect(after[g]).toBe(before[g]! - (r.load.find((l) => l[0] === g)?.[1] ?? 0));
    }
  });

  it('goods carried by a captured raider are recovered', () => {
    const d = raidAtDusk();
    const s = d.state;
    alone(s);
    const bread = content.goodIndex.get('bread')!;
    const before = townStock(s)[bread]!;
    put(raider(s), 60, 38, [38 * S + 61]);
    raider(s).load = [[bread, 6]];
    raider(s).state = 'flee';
    raider(s).morale = 1 / UNIT;
    stand(s, d.watch[0]!, 59, 38);
    stand(s, d.watch[1]!, 60, 39);
    const r = raider(s);
    raidTick(s, createTickCtx(s));
    expect(r.state).toBe('captured');
    expect(townStock(s)[bread]).toBe(before + 6);
  });
});

describe('7. the end, and after', () => {
  it('ends at dawn: the result card, history, the schedule cleared', () => {
    const d = raidAtDusk();
    const s = d.state;
    s.tick = s.raid!.startTick + RAID_TICKS;
    const bread = content.goodIndex.get('bread')!;
    raider(s, 0).load = [[bread, 5]];
    const ctx = createTickCtx(s);
    raidTick(s, ctx);
    expect(s.raid).toBeNull();
    expect(s.threats.scheduled).toBeNull();
    const rec = s.threats.history.at(-1)!;
    expect(rec.stolen).toBe(5);
    const card = ctx.events.find((e) => e.e === 'raid.ended');
    expect(card).toMatchObject({ r: { stolen: [['bread', 5]], band: 'medium', side: 'n' } });
    const entry = s.chronicle.at(-1)!;
    expect(entry.kind).toMatch(/^raid-/);
    expect(entry.snapshot).toBeTruthy();
    // The gates the bell shut are open again.
    expect(findById(s.buildings, d.gate)!.rt!.open).toBe(true);
  });

  it('The Gate Held: repelled with nothing stolen, renown through addRenown', () => {
    const d = raidAtDusk();
    const s = d.state;
    for (const r of s.raid!.raiders) r.state = 'captured';
    const renown = s.renown.points;
    const morale = s.watch.morale;
    const ctx = createTickCtx(s);
    raidTick(s, ctx);
    expect(s.seasons.raidsHeld).toBe(1);
    expect(s.renown.points).toBe(renown + 3);
    expect(s.watch.morale).toBe(morale + 5);
    expect(evaluate(s, content.achievementById.get('the-gate-held')!.condition)).toBe(true);
    expect(s.chronicle.at(-1)!.kind).toBe('raid-held');
    expect(ctx.events.find((e) => e.e === 'raid.ended')).toMatchObject({
      r: { repelled: true, renown: 3, captured: 6 },
    });
  });
});

describe('the whole raid', () => {
  function play(): { s: WorldState; hashes: string[] } {
    const f = threatFixture();
    const s = f.state;
    s.tick = tickAt(0, 2, 4, 17);
    const ctx = createTickCtx(s);
    const hashes: string[] = [];
    for (let i = 0; i < 14 * TICKS_PER_HOUR; i++) {
      runTick(s, ctx);
      if (i % TICKS_PER_HOUR === 0) hashes.push(hashState(s));
      if (i > 2 * TICKS_PER_HOUR && !s.raid) break;
    }
    hashes.push(hashState(s));
    return { s, hashes };
  }

  it('replays to the same hash twice, keeps the money, and hurts nobody', () => {
    const before = moneySnapshot(threatFixture().state);
    const a = play();
    const b = play();
    expect(a.hashes).toEqual(b.hashes);
    expect(a.s.raid).toBeNull();
    expect(a.s.threats.history).toHaveLength(1);
    const ids = new Set(a.s.residents.map((r) => r.id));
    for (const r of threatFixture().state.residents) expect(ids.has(r.id)).toBe(true);
    expectMoneyInvariant(before, a.s);
  }, 180000);
});

describe('the view', () => {
  it('raiders ride in the agent frame; the season report tells both pages', async () => {
    const { agentFrame } = await import('../../src/view/agents');
    const { threatLines } = await import('../../src/view/season/threat');
    const { AGENT_STRIDE, AgentFlags } = await import('../../src/constants');
    const d = raidAtDusk();
    const frame = agentFrame(d.state);
    let raiders = 0;
    for (let o = 0; o < frame.length; o += AGENT_STRIDE) if (frame[o + 7]! & AgentFlags.raider) raiders++;
    expect(raiders).toBe(6);
    d.state.threats.history.push({ tick: d.state.tick, band: 'medium', side: 'n', stolen: 4, captured: 2, repelled: true });
    const lines = threatLines(d.state);
    expect(lines.hearth.length).toBeGreaterThan(0);
    expect(lines.ledger.some((l) => l.value === 4)).toBe(true);
    // The Hearth's page never shows raw pressure (P36).
    expect(lines.hearth.some((l) => l.value === d.state.threats.pressure)).toBe(false);
  });
});
