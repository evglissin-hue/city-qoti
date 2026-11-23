// R3.0 stand-ins (docs/build/r3-wave-notes.md): the supplies, masters, Town Book and threads systems and
// views behave as fixed until R3A to R3D replace them. When one of them lands, the matching test here
// is rewritten by that cycle, not deleted.
import { describe, expect, it } from 'vitest';
import { LEANINGS, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { createWorld, defaultSettings } from '../../src/state/create';
import { mastersCount } from '../../src/systems/masters/api';
import { bumpPlaceInputs } from '../../src/systems/places/inputs';
import { decorLit, decorLitTonight, pieceRests } from '../../src/systems/supplies/api';
import { advanceTo, createTickCtx, type SimCtx } from '../../src/turn';
import { suppliesView } from '../../src/view/supplies';
import { threadView } from '../../src/view/threads';
import { townBookView } from '../../src/view/townBook';
import { decor } from '../hearth/helpers';

/** The absolute tick of `hour`:00 on day index `day` (the clock's day starts at START_HOUR). */
const tickAt = (day: number, hour: number): number =>
  day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR;

function freshWithLanterns(): { s: WorldState; ids: number[] } {
  const s = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
  s.time.connected = [0, 1];
  const ids = [decor(s, 'lantern', 50, 50), decor(s, 'lantern', 52, 50), decor(s, 'lantern', 54, 50)].sort(
    (a, b) => a - b,
  );
  bumpPlaceInputs(s);
  return { s, ids };
}

describe('the supplies stand-ins on a fresh standard valley', () => {
  it(
    'light every lantern from 18:00 to 07:00, rest nothing, list the lamps, open no fourth gap',
    { timeout: 120_000 },
    () => {
      const { s, ids } = freshWithLanterns();
      const ctx: SimCtx = createTickCtx(s);
      const lantern = s.decor.find((d) => d.id === ids[0])!;
      const at = (day: number, hour: number): void => {
        // A turn can carry more than one tick (speed), so step a turn at a time up to the hour.
        while (s.tick < tickAt(day, hour)) advanceTo(s, s.lastTurn + 1, ctx);
        expect(s.tick - tickAt(day, hour)).toBeLessThan(TICKS_PER_HOUR / 2);
      };
      const checkGaps = (): void => {
        for (const g of [...s.gaps.open, ...s.gaps.closed]) expect(g.kind).not.toBe('shortOfSupplies');
      };
      for (let day = 0; day < 3; day++) {
        if (tickAt(day, 12) > s.tick) at(day, 12);
        expect(decorLit(s, lantern), `day ${day} 12:00`).toBe(false);
        at(day, 18);
        expect(decorLit(s, lantern), `day ${day} 18:00`).toBe(true);
        at(day, 19);
        expect(decorLit(s, lantern), `day ${day} 19:00`).toBe(true);
        expect(decorLitTonight(s, lantern)).toBe(true);
        for (const d of s.decor) expect(pieceRests(s, d)).toBeNull();
        const v = suppliesView(s);
        expect(v.night).toBe(day);
        expect(v.lamps.map((l) => l.id)).toEqual(ids);
        for (const l of v.lamps) {
          expect(l.reach).toBe(tickAt(day, 18));
          expect(l.out).toBe(tickAt(day + 1, 7));
        }
        expect(v.resting).toEqual([]);
        expect(v.lamplighters.held).toEqual([]);
        checkGaps();
        // Before 07:00 the view still reads the night just past, and its lamps are due out at 07:00.
        at(day + 1, 6);
        const morning = suppliesView(s);
        expect(morning.night).toBe(day);
        expect(morning.lamps.every((l) => l.out === tickAt(day + 1, 7))).toBe(true);
        expect(morning.resting).toEqual([]);
        at(day + 1, 7);
        expect(decorLit(s, lantern), `day ${day + 1} 07:00`).toBe(false);
        checkGaps();
      }
    },
  );

  it('answers the other stand-ins honestly', () => {
    const { s } = freshWithLanterns();
    const subject = { kind: 'good', good: 'cider' } as const;
    const t = threadView(s, subject);
    // R3D replaced the stand-in: with no counts yet, the Thread says so (test/r3d/threadView.test.ts).
    expect(t).toEqual({ subject, text: 'Nobody has bought any cider lately.', refs: [], route: [] });
    const book = townBookView(s);
    expect(book.pages).toEqual([]);
    expect(book.hints).toEqual([]);
    expect(book.callings).toEqual([]);
    expect(book.leanings).toEqual(LEANINGS.map(() => 0));
    expect(mastersCount(s)).toBe(0);
    expect(mastersCount(s, 'baker')).toBe(0);
  });
});

describe('the stand-in comments', () => {
  // Every source file of the sim, as text (Vite reads them; the sim's tests may not import node:fs).
  const sources = (import.meta as unknown as { glob: (p: string, o: object) => Record<string, string> }).glob(
    '../../src/**/*.ts',
    { query: '?raw', import: 'default', eager: true },
  );

  it('each `// R3 stand-in` names one of R3A to R3H', () => {
    let n = 0;
    // A test reading file text, not sim state: the order of the files does not matter.
    // eslint-disable-next-line no-restricted-properties
    const files = Object.entries(sources);
    for (const [file, text] of files) {
      text.split('\n').forEach((line, i) => {
        if (!/\/\/ R3 stand-in/.test(line)) return;
        n++;
        expect(line, `${file}:${i + 1}`).toMatch(/\/\/ R3 stand-in \(R3[A-H]\)/);
      });
    }
    expect(files.length).toBeGreaterThan(100);
    // The scan sees the markers while the wave's stand-ins remain (each cycle removes its own: R3.0
    // left more than 20, R3B and R3C together leave 17). R3X, with none left, drops this line.
    expect(n).toBeGreaterThan(0);
  });
});
