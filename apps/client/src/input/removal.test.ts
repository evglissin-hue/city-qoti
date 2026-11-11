import type { Command, SeatView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import type { Mirror } from '../state/mirror';
import { moveWithCare, removalRequest } from './removal';

function env(seat: 0 | 1) {
  const sent: Command[] = [];
  const seats = [
    { seat: 0, name: 'Ada' },
    { seat: 1, name: 'Bo' },
  ] as SeatView[];
  return {
    sent,
    env: {
      mirror: { seats: { value: seats } } as unknown as Mirror,
      seat,
      submit: (c: Command) => sent.push(c),
    },
  };
}

const move: Command = { t: 'decor.move', id: 3, fx: 700, fz: 700, rot: 0 };

describe('moveWithCare', () => {
  it('moves your own piece at once, with no question and no note', async () => {
    const { env: e, sent } = env(0);
    await expect(
      moveWithCare(e, { builtBy: 0, handmade: true, thing: 'bench', x: 2, z: 2 }, move),
    ).resolves.toBe(true);
    expect(sent).toEqual([move]);
  });

  it("asks before moving the partner's piece, then leaves a note at the old spot", async () => {
    const { env: e, sent } = env(0);
    const done = moveWithCare(e, { builtBy: 1, handmade: true, thing: 'bench', x: 2, z: 3 }, move);
    expect(sent).toEqual([]);
    const ask = removalRequest.value!;
    expect(ask.title).toBe("Move Bo's bench?");
    expect(ask.body).toBe(
      'They placed it by hand. Say why, if you like, and a note will be left where it stood.',
    );
    expect(ask.ok).toBe('Move it');
    expect(ask.cancel).toBe('Leave it');
    ask.resolve('the path needed the room');
    await expect(done).resolves.toBe(true);
    expect(sent[0]).toEqual(move);
    expect(sent[1]).toEqual({
      t: 'note.pin',
      x: 2,
      z: 3,
      text: 'Ada moved your bench: the path needed the room',
    });
  });

  it('leaves it alone when the player says so, and words a building and a bare note', async () => {
    const { env: e, sent } = env(0);
    const no = moveWithCare(
      e,
      { builtBy: 1, handmade: true, thing: 'bakery', x: 5, z: 5, building: true },
      { t: 'build.move', id: 4, x: 9, z: 9, rot: 0 },
    );
    expect(removalRequest.value!.title).toBe('Move the bakery Bo built?');
    removalRequest.value!.resolve(null);
    await expect(no).resolves.toBe(false);
    expect(sent).toEqual([]);

    const yes = moveWithCare(e, { builtBy: 1, handmade: true, thing: 'bench', x: 1, z: 1 }, move);
    removalRequest.value!.resolve('');
    await yes;
    expect(sent[1]).toMatchObject({ t: 'note.pin', text: 'Ada moved your bench.' });
  });
});
