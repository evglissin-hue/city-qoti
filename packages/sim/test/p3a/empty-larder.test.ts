// P3A (systems/residents/schedule.ts, think): a grown-up whose goal is home (the morning or the
// wind-down block), on their own slot's hour turn, with the household's pantry at 0 and nobody out
// shopping, goes shopping, whatever the round planned. Driven through `think` itself.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import type { Resident, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { slotTurned, think, THINK_EVERY } from '../../src/systems/residents/schedule';
import { foodIndexes, pantryFood } from '../../src/systems/residents/needs';
import { Block, blockOf, MORNING_START, scheduleClock } from '../../src/systems/residents/time';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { resident } from '../residents/helpers';

/** The first tick of day 3 on which the resident is in `block` on their slot's hour turn. */
function turnIn(r: Resident, block: number): number {
  const day = 3 * TICKS_PER_DAY;
  for (let t = day; t < day + TICKS_PER_DAY; t += THINK_EVERY) {
    if (blockOf(scheduleClock(r, t)) === block && slotTurned(r, t)) return t;
  }
  throw new Error('no such tick');
}

/** An adult at home, jobless, the hamlet's granary full, the pantry as given, at tick `t`. */
function setup(block: number, pantry: number) {
  const f = hamletFixture();
  const s: WorldState = f.state;
  const r = resident(s, f.residents[0]![0]!);
  const h = findById(s.households, r.householdId)!;
  r.stage = 'adult';
  r.jobId = 0;
  r.activity = { kind: 'home' };
  r.move = null;
  s.tick = turnIn(r, block);
  h.pantry.fill(0);
  if (pantry > 0) for (const g of foodIndexes()) h.pantry[g] = pantry;
  // Nobody else of the household is out.
  for (const id of h.members) if (id !== r.id) resident(s, id).activity = { kind: 'home' };
  return { s, r, h };
}

describe('an empty larder is fetched for', () => {
  for (const [name, block] of [
    ['before bed (the wind-down)', Block.windDown],
    ['at dawn (the morning)', Block.morning],
  ] as const) {
    it(`starts shopping ${name}`, () => {
      const { s, r } = setup(block, 0);
      think(s, createTickCtx(s), createTickCtx(s).rng('residents'), r);
      expect(r.activity.kind).toBe('shop');
    });

    it(`does not start shopping ${name} when the pantry holds food`, () => {
      const { s, r } = setup(block, 4);
      think(s, createTickCtx(s), createTickCtx(s).rng('residents'), r);
      expect(r.activity.kind).not.toBe('shop');
    });
  }

  it('sends nobody when a housemate is already out shopping', () => {
    const { s, r, h } = setup(Block.windDown, 0);
    const other = resident(
      s,
      h.members.find((id) => id !== r.id && resident(s, id).stage !== 'child')!,
    );
    other.activity = { kind: 'shop', outlet: 0, carrying: 0 };
    think(s, createTickCtx(s), createTickCtx(s).rng('residents'), r);
    expect(r.activity.kind).not.toBe('shop');
  });

  it('waits for the resident’s slot turn', () => {
    const { s, r } = setup(Block.windDown, 0);
    for (let t = s.tick + 1; t < s.tick + 60; t++) {
      if (slotTurned(r, t)) continue;
      s.tick = t;
      break;
    }
    expect(slotTurned(r, s.tick)).toBe(false);
    think(s, createTickCtx(s), createTickCtx(s).rng('residents'), r);
    expect(r.activity.kind).not.toBe('shop');
  });
});

describe('the dawn errand leaves at dawn', () => {
  /** An adult at home on the first think of the morning block, which is not their hour turn. */
  function atDawn() {
    const f = hamletFixture();
    const s: WorldState = f.state;
    const r = resident(s, f.residents[0]![0]!);
    const h = findById(s.households, r.householdId)!;
    r.stage = 'adult';
    r.jobId = 0;
    r.activity = { kind: 'home' };
    r.move = null;
    const day = 3 * TICKS_PER_DAY;
    let t = -1;
    for (let k = day; k < day + TICKS_PER_DAY; k += THINK_EVERY) {
      const c = scheduleClock(r, k);
      if (blockOf(c) === Block.morning && c < MORNING_START + THINK_EVERY && !slotTurned(r, k)) {
        t = k;
        break;
      }
    }
    if (t < 0) throw new Error('this resident turns their hour at dawn');
    s.tick = t;
    h.pantry.fill(0);
    for (const id of h.members) if (id !== r.id) resident(s, id).activity = { kind: 'home' };
    return { s, r, h };
  }

  it('starts at the first think of the morning, not at the resident’s hour turn', () => {
    const { s, r } = atDawn();
    think(s, createTickCtx(s), createTickCtx(s).rng('residents'), r);
    expect(r.activity.kind).toBe('shop');
  });

  it('goes when the pantry is short of a unit a mouth, not only when it is empty', () => {
    const { s, r, h } = atDawn();
    h.pantry[foodIndexes()[0]!] = Math.max(0, h.members.length - 1);
    expect(pantryFood(h)).toBeLessThan(h.members.length);
    think(s, createTickCtx(s), createTickCtx(s).rng('residents'), r);
    expect(r.activity.kind).toBe('shop');
  });

  it('stays home when the pantry covers every mouth', () => {
    const { s, r, h } = atDawn();
    h.pantry[foodIndexes()[0]!] = h.members.length;
    think(s, createTickCtx(s), createTickCtx(s).rng('residents'), r);
    expect(r.activity.kind).not.toBe('shop');
  });
});
