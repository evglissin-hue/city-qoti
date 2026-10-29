// Playtest round three regression: two people in a fresh standard valley place what new players
// place (homes and a farm first, the sawpit late, from the second seat too) and do nothing else.
// Every site must be finished within a few game days, and the health checks must stay quiet: no
// site sitting with its materials in, no builder idle beside work, no material nobody can make.
import { content } from '@qoti/content';
import { HealthWatch, TICKS_PER_DAY, TICKS_PER_HOUR, type HealthIssue } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { command, findSpot, runTicks, startingTown } from './hamlet';

const FIRST_EVENING = [
  'cottage',
  'vegetable-plot',
  'farmhouse',
  'cottage',
  'cottage',
  'market-stall',
  'well',
  'quarry',
  'sawpit',
  'woodcutter',
];

describe('two new players, one evening', { timeout: 120_000 }, () => {
  for (const seed of ['kat-1', 'kat-2', 'willow']) {
    it(`finishes everything they place in ${seed}, with nothing stuck`, () => {
      const h = startingTown(seed, { standIn: false });
      const w = h.world;
      w.time.connected = [0, 1];
      runTicks(h, 2 * TICKS_PER_HOUR);
      FIRST_EVENING.forEach((def, i) => {
        const spot = findSpot(w, def);
        expect(spot, def).not.toBeNull();
        const [ok] = command(
          h,
          [{ t: 'build.place', def, x: spot![0], z: spot![1], rot: spot![2] }],
          (i % 2) as 0 | 1,
        );
        expect(ok, def).toBe(true);
      });
      const watch = new HealthWatch();
      const issues = new Map<string, HealthIssue>();
      for (let hour = 0; hour < 6 * 24; hour++) {
        runTicks(h, TICKS_PER_HOUR);
        for (const i of watch.check(w)) issues.set(i.kind + i.id, i);
        if (!w.buildings.some((b) => b.stage === 'construction')) break;
      }
      const left = w.buildings
        .filter((b) => b.stage === 'construction')
        .map((b) => `${b.def} ${b.rt!.construction!.workDone}/${b.rt!.construction!.work}`);
      expect(left.join(', '), `day ${Math.floor(w.tick / TICKS_PER_DAY)}`).toBe('');
      expect([...issues.values()].map((i) => i.text).join('\n')).toBe('');
      for (const def of FIRST_EVENING) expect(content.buildingById.has(def)).toBe(true);
    });
  }
});
