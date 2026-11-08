// The while-you-were-away letter (docs/spec/16-coop.md).
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import { inspect } from '../../src/view/inspect';
import type { AwayLetter } from '../../src/contracts';
import { createTickCtx } from '../../src/turn';
import { chronicle } from '../../src/systems/chronicle/api';
import { hamletFixture } from '../fixtures/hamlet';
import { run } from '../helpers';
import { runHours } from './helpers';

function away() {
  const f = hamletFixture();
  const s = f.state;
  runHours(s, 1);
  run(s, { t: 'sys.seatLeft', seat: 0 }, 0, 1);
  return { f, s };
}

describe('awayLetter', () => {
  it('sums up entries, stats and notes since the seat left', () => {
    const { s } = away();
    s.tick += 3 * TICKS_PER_DAY;
    const ctx = createTickCtx(s);
    chronicle(s, ctx, 'household-arrived', {
      text: [
        ['family', 'Fernsby'],
        ['place', 'Mill Lane'],
      ],
    });
    chronicle(s, ctx, 'wishes-digest', {
      text: [
        ['wishes', 'two wishes'],
        ['examples', 'this and that'],
      ],
    });
    s.stats.wishesGranted += 4;
    s.notes.push({ id: s.nextId++, x: 50, z: 50, text: 'Bench by the well?', by: 1, tick: s.tick });
    run(s, { t: 'sys.seatJoined', seat: 0 }, 0, 2);
    const letter = inspect(s, 'away', 0) as AwayLetter;
    expect(letter.days).toBe(3);
    expect(letter.entries.map((e) => e.kind)).toEqual(['household-arrived']);
    expect(letter.more).toBe(0);
    expect(letter.stats.find(([label]) => label === 'Wishes granted')).toEqual(['Wishes granted', 0, 4]);
    expect(letter.notes.map((n) => n.text)).toEqual(['Bench by the well?']);
    const [greeting, body] = letter.opening!.split('\n');
    expect(greeting).toBe('Dear Ada,');
    expect(body).toMatch(/three days/);
    expect(body).toMatch(/one household moved in/);
    expect(body).toMatch(/four wishes came true/);
    expect(body).toMatch(/Bo /);
    expect(letter.opening).not.toMatch(/[{}]/);
  });

  it('a quiet spell says so, and long absences keep the newest entries', () => {
    const { s } = away();
    s.tick += TICKS_PER_DAY;
    run(s, { t: 'sys.seatLeft', seat: 1 }, 1, 2);
    const quiet = inspect(s, 'away', 0) as AwayLetter;
    expect(quiet.days).toBe(1);
    expect(quiet.opening).toMatch(/a day/);
    expect(quiet.opening).not.toMatch(/Bo /);
    const ctx = createTickCtx(s);
    for (let i = 0; i < 15; i++)
      chronicle(s, ctx, 'household-arrived', {
        text: [
          ['family', `F${i}`],
          ['place', 'x'],
        ],
      });
    const busy = inspect(s, 'away', 0) as AwayLetter;
    expect(busy.entries).toHaveLength(12);
    expect(busy.more).toBe(3);
    expect(busy.entries.at(-1)!.text).toContain('F14');
    expect(busy.opening).toMatch(/15 households moved in/);
    expect(inspect(s, 'away', 3)).toBeNull();
  });
});
