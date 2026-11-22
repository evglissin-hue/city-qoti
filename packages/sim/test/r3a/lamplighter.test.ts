// R3A: the lamplighter (docs/spec/19-evenings.md, Supplies): the walk's reach ticks, the job, the round.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Resident, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { worldIndex } from '../../src/state/worldIndex';
import { assignJobs, auditJobs, release } from '../../src/systems/residents/jobs';
import { scheduleOverrides } from '../../src/systems/residents/overrides';
import {
  lamplighterJobs,
  lamplighterPose,
  lamplighterRound,
  walkLamps,
  type LitLantern,
} from '../../src/systems/supplies/lamplighter';
import { Rank, pieceTile } from '../../src/systems/supplies/pieces';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { decor } from '../hearth/helpers';

const S = content.supplies;
const WALK = S.walkTicks!;
const tickAt = (day: number, hour: number, minute = 0): number =>
  day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR + Math.floor((minute * TICKS_PER_HOUR) / 60);
const T = (x: number, z: number): number => z * MAP_SIZE + x;
const NIGHT = 3;
const settle = tickAt(NIGHT, S.settleHour, S.settleMinute);
const lit = tickAt(NIGHT, S.litHour);

function row(n: number, rank: number = Rank.normal, gap = 2): LitLantern[] {
  return Array.from({ length: n }, (_, i) => ({ id: 100 + i, tile: T(50 + gap * i, 50), rank }));
}

function findLamp(lamps: { id: number; reach: number }[], id: number): { id: number; reach: number } {
  return lamps.find((l) => l.id === id)!;
}

describe('walkLamps', () => {
  it('lights every lamp at litHour with no `by` when nobody holds the job', () => {
    const lamps = walkLamps(row(5), [], NIGHT);
    expect(lamps).toHaveLength(5);
    for (const l of lamps) {
      expect(l.reach).toBe(lit);
      expect(l.by).toBeUndefined();
    }
    expect(lamps.map((l) => l.id)).toEqual([100, 101, 102, 103, 104]);
  });

  it('reaches lamps in walking order from where he stands, nearest first, all within [settle, litHour]', () => {
    const lamps = walkLamps(row(3), [{ id: 7, tile: T(48, 50) }], NIGHT);
    expect(lamps[0]!.reach).toBe(settle + S.lightTicks + 2 * WALK);
    for (let i = 1; i < lamps.length; i++)
      expect(lamps[i]!.reach - lamps[i - 1]!.reach).toBe(2 * WALK + S.lightTicks);
    for (const l of lamps) {
      expect(l.by).toBe(7);
      expect(l.reach).toBeGreaterThanOrEqual(settle);
      expect(l.reach).toBeLessThanOrEqual(lit);
    }
  });

  it('sets out from his own tile', () => {
    // He stands at x 56, beside the fourth lamp: it comes on at once, the first lamp last.
    const lamps = walkLamps(row(4), [{ id: 7, tile: T(56, 50) }], NIGHT);
    expect(findLamp(lamps, 103).reach).toBe(settle + S.lightTicks);
    expect(findLamp(lamps, 100).reach).toBeGreaterThan(findLamp(lamps, 101).reach);
  });

  it('walks the kept lanterns first, even when they stand farther off', () => {
    const near = { id: 1, tile: T(50, 50), rank: Rank.normal };
    const far = { id: 2, tile: T(58, 50), rank: Rank.keep };
    const lamps = walkLamps([near, far], [{ id: 7, tile: T(48, 50) }], NIGHT);
    expect(findLamp(lamps, 2).reach).toBeLessThan(findLamp(lamps, 1).reach);
  });

  it('lights what he can reach by 18:00 on the way, and the rest of a long round comes on at 18:00', () => {
    const dense = Array.from({ length: 130 }, (_, i) => ({
      id: 100 + i,
      tile: T(20 + (i % 65), 50 + Math.floor(i / 65)),
      rank: Rank.normal as number,
    }));
    const lamps = walkLamps(dense, [{ id: 7, tile: T(19, 50) }], NIGHT);
    for (const l of lamps) {
      expect(l.reach).toBeGreaterThanOrEqual(settle);
      expect(l.reach).toBeLessThanOrEqual(lit);
    }
    // Along the row, one lamp after another, then the town's hour for the rest.
    const before = lamps.filter((l) => l.reach < lit).sort((a, b) => a.reach - b.reach);
    expect(before.length).toBeGreaterThan(3);
    expect(before.map((l) => l.id)).toEqual([...before.map((l) => l.id)].sort((a, b) => a - b));
    expect(lamps.filter((l) => l.reach === lit).length).toBe(130 - before.length);
  });

  it('lamps on one tile come on in the same tick', () => {
    const pair = [
      { id: 1, tile: T(52, 50), rank: Rank.normal },
      { id: 2, tile: T(52, 50), rank: Rank.normal },
    ];
    const lamps = walkLamps(pair, [{ id: 7, tile: T(48, 50) }], NIGHT);
    expect(lamps[0]!.reach).toBe(settle + S.lightTicks + 4 * WALK);
    expect(lamps[1]!.reach).toBe(lamps[0]!.reach);
  });

  it('sends each of two lamplighters to the lamps nearest him, none taken twice', () => {
    const lamps = walkLamps(
      row(5),
      [
        { id: 7, tile: T(48, 50) },
        { id: 9, tile: T(56, 50) },
      ],
      NIGHT,
    );
    expect(lamps.map((l) => l.by)).toEqual([7, 7, 7, 9, 9]);
    // Lamp 103 stands at x 56, where the second lamplighter stands.
    expect(findLamp(lamps, 103).reach).toBe(settle + S.lightTicks);
    expect(findLamp(lamps, 104).reach).toBe(settle + 2 * S.lightTicks + 2 * WALK);
    expect(findLamp(lamps, 100).reach).toBe(settle + S.lightTicks + 2 * WALK);
  });
});

// The village fixture: a Town Hall and about sixty housed residents.
function valley(rank: 'hamlet' | 'village'): WorldState {
  const s = villageFixture().state;
  s.charter.rank = rank;
  for (const r of s.residents) if (r.activity.kind === 'arrive') r.activity = { kind: 'home' };
  return s;
}

const hall = (s: WorldState) => s.buildings.find((b) => b.def === 'town-hall')!;

describe('lamplighter jobs', () => {
  it('has none in a Hamlet, one from Village rank once a lantern stands, even before a settling', () => {
    const s = valley('hamlet');
    decor(s, 'lantern', 50, 50);
    expect(lamplighterJobs(s)).toBe(0);
    s.charter.rank = 'village';
    expect(lamplighterJobs(s)).toBe(1);
    expect(lamplighterJobs(valley('village'))).toBe(0);
  });

  it('is the ceiling of lamps over the per-lamplighter number', () => {
    const s = valley('village');
    const id = decor(s, 'lantern', 50, 50);
    for (const n of [0, 1, 40, 41, 80, 81]) {
      s.supplies.lamps = Array.from({ length: n }, (_, i) => ({ id: id + i, reach: lit }));
      expect(lamplighterJobs(s)).toBe(Math.max(1, Math.ceil(n / S.lanternsPerLamplighter)));
    }
  });

  it('hires a seeker outside the Town Hall books, keeps the list clean, and releases him', () => {
    const s = valley('village');
    decor(s, 'lantern', 50, 50);
    const ctx = createTickCtx(s);
    const th = hall(s);
    assignJobs(s, ctx);
    expect(s.supplies.lamplighters).toHaveLength(1);
    const id = s.supplies.lamplighters[0]!;
    const r = findById(s.residents, id)!;
    expect(r.jobId).toBe(th.id);
    expect(th.rt!.workers).not.toContain(id);
    assignJobs(s, ctx);
    expect(s.supplies.lamplighters).toEqual([id]);
    release(s, r, false, ctx);
    expect(s.supplies.lamplighters).toEqual([]);
    // A lamplighter whose resident is gone is dropped by the next pass.
    assignJobs(s, ctx);
    const again = s.supplies.lamplighters[0]!;
    s.residents.splice(
      s.residents.findIndex((x) => x.id === again),
      1,
    );
    auditJobs(s, ctx);
    assignJobs(s, ctx);
    expect(s.supplies.lamplighters).not.toContain(again);
  });

  it('lets the job go when the lanterns do', () => {
    const s = valley('village');
    const lamp = decor(s, 'lantern', 50, 50);
    const ctx = createTickCtx(s);
    assignJobs(s, ctx);
    const id = s.supplies.lamplighters[0]!;
    const i = s.decor.findIndex((d) => d.id === lamp);
    worldIndex(s).decorGrid.remove(s.decor[i]!);
    s.decor.splice(i, 1);
    assignJobs(s, ctx);
    expect(s.supplies.lamplighters).toEqual([]);
    expect(findById(s.residents, id)!.jobId).toBe(0);
  });
});

describe('the lamplighter override', () => {
  function round(): { s: WorldState; r: Resident; a: number; b: number } {
    const s = valley('village');
    const a = decor(s, 'lantern', 50, 50);
    const b = decor(s, 'lantern', 60, 50);
    const r = s.residents.find((x) => x.stage === 'adult')!;
    s.supplies.night = NIGHT;
    s.supplies.lamps = [
      { id: a, reach: settle + 20, by: r.id },
      { id: b, reach: settle + 80, by: r.id },
    ];
    s.supplies.lamplighters = [r.id];
    return { s, r, a, b };
  }

  it('is registered between the festival and the rain, priority 60', () => {
    const ids = scheduleOverrides.map((o) => o.id);
    expect(scheduleOverrides.find((o) => o.id === 'lamplighter')!.priority).toBe(60);
    expect(ids).toEqual([...ids].sort());
  });

  it('returns null for anyone not a lamplighter, and with nobody in the job', () => {
    const { s, r } = round();
    const other = s.residents.find((x) => x.id !== r.id)!;
    s.tick = settle + 5;
    expect(lamplighterRound(s, other, 17)).toBeNull();
    expect(lamplighterPose(s, other)).toBe(0);
    s.supplies.lamplighters = [];
    expect(lamplighterRound(s, r, 17)).toBeNull();
  });

  it('walks a lamplighter lamp to lamp and stops once the round is done', () => {
    const { s, r, a, b } = round();
    const tile = (id: number): number => pieceTile(s.decor.find((d) => d.id === id)!);
    s.tick = settle - 1;
    expect(lamplighterRound(s, r, 17)).toBeNull();
    s.tick = settle;
    expect(lamplighterRound(s, r, 17)).toEqual({ kind: 'leisure', tile: tile(a) });
    s.tick = settle + 20 + S.lightTicks;
    expect(lamplighterRound(s, r, 17)).toEqual({ kind: 'leisure', tile: tile(b) });
    s.tick = settle + 80 + S.lightTicks - 1;
    expect(lamplighterRound(s, r, 17)).toEqual({ kind: 'leisure', tile: tile(b) });
    r.move = null;
    r.tile = T(0, 0);
    expect(lamplighterPose(s, r)).toBe(1);
    r.tile = tile(b);
    expect(lamplighterPose(s, r)).toBe(2);
    s.tick = settle + 80 + S.lightTicks;
    expect(lamplighterRound(s, r, 17)).toBeNull();
    expect(lamplighterPose(s, r)).toBe(0);
  });

  it('never sets out for a lamp left to come on at 18:00 with the town', () => {
    const { s, r, a, b } = round();
    s.supplies.lamps = [
      { id: a, reach: settle + 20, by: r.id },
      { id: b, reach: lit, by: r.id },
    ];
    s.tick = settle + 20 + S.lightTicks;
    expect(lamplighterRound(s, r, 17)).toBeNull();
    s.supplies.lamps = [{ id: b, reach: lit, by: r.id }];
    s.tick = settle;
    expect(lamplighterRound(s, r, 17)).toBeNull();
  });
});
