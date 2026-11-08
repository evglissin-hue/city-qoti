// P1 (playtest): a resident asked for "a well closer to home" while home sat inside a well's radius.
// The wish wanted a well within 4 steps; the well serves homes within 8, the radius its overlay draws.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/conditions';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { generateWishes } from '../../src/systems/hearth/wishes';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';

const wellWishes = ['a-well-closer', 'a-second-well'].map((id) => content.wishById.get(id)!);

describe('water wishes follow the well radius', () => {
  it('asks nobody for a well from inside a well radius with room', () => {
    const f = hamletFixture();
    const quills = findById(f.state.households, f.households[2])!;
    const bind = { residentId: quills.members[0]!, home: quills.homeId };
    // The playtest case: the old target (a well within 4 steps) was unmet for the Quills...
    expect(evaluate(f.state, { near: { building: 'well', of: 'home', within: 4 } }, bind)).toBe(false);
    // ...yet they already draw water from the well six tiles away.
    expect(evaluate(f.state, { code: 'waterServed' }, bind)).toBe(true);
    expect(evaluate(f.state, { code: 'wellInReach' }, bind)).toBe(true);
    expect(generateWishes(f.state, createTickCtx(f.state), wellWishes)).toBe(0);
  });

  it('asks for a closer well out of reach, and a second well inside a full one', () => {
    const f = hamletFixture();
    const quills = findById(f.state.households, f.households[2])!;
    const [closer, second] = wellWishes as [(typeof wellWishes)[0], (typeof wellWishes)[0]];
    const near = { residentId: quills.members[0]!, home: quills.homeId };
    expect(evaluate(f.state, closer.when, near)).toBe(false);
    expect(evaluate(f.state, second.when, near)).toBe(true);
    // A cottage far across the valley: no well's radius reaches it.
    const far = insertBuilding(f.state, null, content.buildingById.get('cottage')!, 140, 140, 0, 0, {
      site: false,
    });
    const away = { residentId: quills.members[0]!, home: far.id };
    expect(evaluate(f.state, closer.when, away)).toBe(true);
    expect(evaluate(f.state, second.when, away)).toBe(false);
  });
});
