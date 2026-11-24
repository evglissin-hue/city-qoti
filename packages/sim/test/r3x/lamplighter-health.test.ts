// R3X: the lamplighter-unhired health kind (view/health.ts), the class of the chair's round 2 finding:
// willow's Village kept its lamplighter's job open all evening while hands worked below its rank, so
// the round R3F draws never walked. The look is at 19:00, after the settling and the 18:00 job pass.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR, START_HOUR } from '../../src/constants';
import { assignJobs, LAMPLIGHTER_RANK, shortages, slotPriority } from '../../src/systems/residents/jobs';
import { lamplighterJobs } from '../../src/systems/supplies/lamplighter';
import { createTickCtx } from '../../src/turn';
import { HealthWatch, LAMP_LOOK_HOUR } from '../../src/view/health';
import { villageFixture } from '../fixtures/village';
import { decor } from '../hearth/helpers';

const at = (day: number, hour: number) => day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR;

function town() {
  const { state: s } = villageFixture();
  s.charter.rank = 'village';
  decor(s, 'lantern', 50, 50);
  assignJobs(s, createTickCtx(s));
  const short = shortages(s);
  let below = 0;
  for (const b of s.buildings)
    for (let k = 0; k < (b.rt?.workers.length ?? 0); k++)
      if (slotPriority(content.buildingById.get(b.def)!, k, short) > LAMPLIGHTER_RANK) below++;
  return { s, below };
}

describe('lamplighter-unhired', () => {
  it('flags the job open at the 19:00 look on two evenings running while hands work below its rank', () => {
    const { s, below } = town();
    expect(lamplighterJobs(s)).toBeGreaterThan(0);
    expect(below, 'the fixture has hands below the lamplighter').toBeGreaterThan(0);
    // The hire failed (as willow's did): nobody holds the job.
    s.supplies.lamplighters = [];
    const w = new HealthWatch();
    const issues = (day: number, hour = LAMP_LOOK_HOUR) => {
      s.tick = at(day, hour);
      return w.check(s).filter((i) => i.kind === 'lamplighter-unhired');
    };
    expect(issues(4, 18), 'no look before 19:00').toEqual([]);
    expect(issues(4), 'one evening is not yet a pattern').toEqual([]);
    const second = issues(5);
    expect(second).toHaveLength(1);
    expect(second[0]!.text).toMatch(
      /^the lamplighter's job stood open two evenings running while [1-9]\d* hands worked below its rank$/,
    );
  });

  it('stays quiet while someone holds the job, and starts its count again after', () => {
    const { s } = town();
    const w = new HealthWatch();
    const issues = (day: number) => {
      s.tick = at(day, LAMP_LOOK_HOUR);
      return w.check(s).filter((i) => i.kind === 'lamplighter-unhired');
    };
    const held = s.supplies.lamplighters.length > 0 ? [...s.supplies.lamplighters] : [s.residents[0]!.id];
    s.supplies.lamplighters = held;
    expect(issues(4)).toEqual([]);
    s.supplies.lamplighters = [];
    expect(issues(5)).toEqual([]);
    s.supplies.lamplighters = held;
    expect(issues(6)).toEqual([]);
    s.supplies.lamplighters = [];
    expect(issues(7)).toEqual([]);
    expect(issues(8)).toHaveLength(1);
  });
});
