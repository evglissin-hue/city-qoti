import { buildView, createWorld, defaultSettings, type ResidentView, type WishView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { Mirror } from '../state/mirror';
import { alertsForLens, computeAlerts, foldWishes } from './alerts';

// R2D: the same wish from several residents reads as one line, never twice word for word.
function town(names: string[]): Mirror {
  const m = new Mirror();
  m.load(buildView(createWorld('r2d-wishes', defaultSettings())));
  names.forEach((given, i) =>
    m.residents.set(100 + i, { id: 100 + i, given, family: 'Alderley' } as ResidentView),
  );
  return m;
}

function wish(id: number, residentId: number, template: string, text: string): WishView {
  return {
    id,
    template,
    residentId,
    text,
    lane: 'hearth',
    homeId: 0,
    area: null,
    createdTick: 0,
    expiresTick: 9e9,
  };
}

const BENCH = '{name} would like a bench near home. Their knees have been very clear about it.';
const bench = (id: number, r: number, name: string) => wish(id, r, 'bench', BENCH.replace('{name}', name));

describe('same wishes fold', () => {
  it('names every wisher once when the verb reads for several', () => {
    const m = town(['Paprika', 'Bluebell', 'Fern']);
    const out = foldWishes(m, [bench(1, 100, 'Paprika'), bench(2, 101, 'Bluebell'), bench(3, 102, 'Fern')]);
    expect(out).toEqual([
      {
        ids: [1, 2, 3],
        text: 'Paprika, Bluebell and Fern would like a bench near home. Their knees have been very clear about it.',
      },
    ]);
  });

  it('adds "too" where the verb would need changing, and keeps different wishes apart', () => {
    const m = town(['Paprika', 'Bluebell']);
    const out = foldWishes(m, [
      wish(1, 100, 'boots', 'Paprika has wet feet again.'),
      wish(2, 101, 'boots', 'Bluebell has wet feet again.'),
      wish(3, 100, 'bench', BENCH.replace('{name}', 'Paprika')),
    ]);
    expect(out.map((g) => g.text)).toEqual([
      'Paprika has wet feet again. Bluebell too.',
      BENCH.replace('{name}', 'Paprika'),
    ]);
  });

  it('leaves the Hearth feed with no two wish lines that differ only by a name', () => {
    const m = town(['Paprika', 'Bluebell']);
    m.wishes.set(1, bench(1, 100, 'Paprika'));
    m.wishes.set(2, bench(2, 101, 'Bluebell'));
    const lines = alertsForLens(computeAlerts(m), 'hearth', new Set()).filter((a) => a.icon === 'wishes');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toMatch(/^Paprika and Bluebell would like/);
  });
});
