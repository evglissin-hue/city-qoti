import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/constants';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { run } from '../helpers';
import { everyoneToWork, ticks, untilHour, withoutStall } from './helpers';

describe('a busy hamlet in a save', () => {
  it('resumes mid-trip and mid-build exactly as if it never stopped', () => {
    const f = withoutStall();
    run(f.state, { t: 'build.place', def: 'cottage', x: 52, z: 51, rot: 2 });
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticks(f.state, 26);
    expect(f.state.logistics.jobs.length).toBeGreaterThan(0);
    const copy = deserialize(serialize(f.state));
    expect(hashState(copy)).toBe(hashState(f.state));
    ticks(f.state, 5 * TICKS_PER_HOUR);
    ticks(copy, 5 * TICKS_PER_HOUR);
    expect(hashState(copy)).toBe(hashState(f.state));
    expect(copy.buildings.find((b) => b.def === 'cottage' && b.x === 52)!.stage).toBe('built');
  });
});
