// Playtest round three regression: two people in a fresh standard valley place what new players
// place (homes first, from the second seat too) and do nothing else. Round six: what the first
// evening opens comes second. Every site must be finished within a few game days, and the health
// checks must stay quiet: no site sitting with its materials in, no builder idle beside work, no
// material nobody can make.
// R1.0: the first evening is homes, a stall, a well, a quarry and a Forester's Lodge (the plots,
// sawpit and woodcutter are gone); the windmill and a granary come second. No fishery: on kat-1
// and willow the river is out of the starting storehouse's porter reach (22 tiles).
import { content } from '@qoti/content';
import { HealthWatch, TICKS_PER_DAY, TICKS_PER_HOUR, type HealthIssue } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { command, findSpot, runTicks, startingTown } from './hamlet';

const FIRST_EVENING = ['cottage', 'cottage', 'cottage', 'market-stall', 'well', 'quarry', 'foresters-lodge'];
/** Placed once the first evening's sites are done. */
const NEXT = ['windmill', 'granary'];

describe('two new players, one evening', { timeout: 120_000 }, () => {
  it('places only buildings content has, and no business by hand', () => {
    for (const def of [...FIRST_EVENING, ...NEXT]) {
      const d = content.buildingById.get(def);
      expect(d, def).toBeDefined();
      expect(
        content.trades.some((t) => t.building === def),
        def,
      ).toBe(false);
    }
  });

  for (const seed of ['kat-1', 'kat-2', 'willow']) {
    it(`finishes everything they place in ${seed}, with nothing stuck`, () => {
      const h = startingTown(seed, { standIn: false });
      const w = h.world;
      w.time.connected = [0, 1];
      runTicks(h, 2 * TICKS_PER_HOUR);
      const watch = new HealthWatch();
      const issues = new Map<string, HealthIssue>();
      const place = (defs: string[]) =>
        defs.forEach((def, i) => {
          const spot = findSpot(w, def);
          expect(spot, def).not.toBeNull();
          const [ok] = command(
            h,
            [{ t: 'build.place', def, x: spot![0], z: spot![1], rot: spot![2] }],
            (i % 2) as 0 | 1,
          );
          expect(ok, def).toBe(true);
        });
      const settle = () => {
        for (let hour = 0; hour < 6 * 24; hour++) {
          runTicks(h, TICKS_PER_HOUR);
          for (const i of watch.check(w)) issues.set(i.kind + i.id, i);
          if (!w.buildings.some((b) => b.stage === 'construction')) break;
        }
        const left = w.buildings
          .filter((b) => b.stage === 'construction')
          .map((b) => `${b.def} ${b.rt!.construction!.workDone}/${b.rt!.construction!.work}`);
        expect(left.join(', '), `day ${Math.floor(w.tick / TICKS_PER_DAY)}`).toBe('');
      };
      place(FIRST_EVENING);
      settle();
      place(NEXT);
      settle();
      // R1F: these two place buildings and never zone, so a lit demand bar going unanswered is
      // their choice, not a dead end (the autoplayer's runs check it).
      const stuck = [...issues.values()].filter((i) => i.kind !== 'demand-unanswered');
      expect(stuck.map((i) => i.text).join('\n')).toBe('');
    });
  }
});
