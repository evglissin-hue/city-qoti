// R2X: who arrives never depends on what residents do. R2A's round drew grown-ups' evenings from its
// own stream, which changed how often the shared `residents` stream was drawn and so reshuffled the
// households that walked in (hazel's first families came smaller). Arrivals now draw from a
// generator of their own per wave (arrivalsRng), seeded from the valley's seed and the tick.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import { streamIndex, StreamRng } from '../../src/rng/streams';
import { deserialize, serialize } from '../../src/state/serialize';
import { createWorld, defaultSettings } from '../../src/state/create';
import { arrivalsRng, residentsTick } from '../../src/systems/residents';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import type { WorldState } from '../../src/contracts';

function arrived(s: WorldState) {
  return s.households.map((h) => ({
    family: h.family,
    home: h.homeId,
    members: h.members.map((id) => {
      const r = s.residents.find((x) => x.id === id)!;
      return [r.given, r.family, r.species, r.stage, [...r.traits]];
    }),
  }));
}

describe('arrivals draw from their own generator', () => {
  it('is a pure function of the seed and the tick', () => {
    const a = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
    const b = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
    b.tick = a.tick;
    expect(arrivalsRng(a).next()).toBe(arrivalsRng(b).next());
    b.tick += 1;
    expect(arrivalsRng(a).next()).not.toBe(arrivalsRng(b).next());
  });

  it('brings the same households whatever the residents stream drew before', () => {
    const a = hamletFixture().state;
    // Empty one cottage so the 08:00 wave has a home to offer, and make the valley welcoming.
    const leaving = a.households.pop()!;
    a.residents = a.residents.filter((r) => !leaving.members.includes(r.id));
    a.stats.attractiveness = 100;
    a.tick = Math.floor(a.tick / TICKS_PER_DAY) * TICKS_PER_DAY + 8 * TICKS_PER_HOUR;
    const b = deserialize(serialize(a));
    // Residents in b have thought differently: their stream is drawn a few dozen times more.
    const residents = new StreamRng(b.rng, streamIndex('residents') * 4);
    for (let i = 0; i < 37; i++) residents.next();
    residentsTick(a, createTickCtx(a));
    residentsTick(b, createTickCtx(b));
    expect(a.households.length).toBeGreaterThan(2);
    expect(arrived(b)).toEqual(arrived(a));
  });
});
