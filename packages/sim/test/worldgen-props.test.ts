import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '../src/constants';
import { Deposit, Flags } from '../src/map/layers';
import { DEPOSIT_REACH, generateValley, PARCEL_COUNT, valleyNameFor } from '../src/map/worldgen';
import { defaultSettings } from '../src/state/create';

const S = MAP_SIZE;
// 200 seeds take about 20 s on a shared 2-CPU box, so the default run checks 24 and CI or a
// curious human can set QOTI_WORLDGEN_SEEDS=200 for the full property sweep.
const COUNT = Number(process.env['QOTI_WORLDGEN_SEEDS'] ?? 24);

describe('worldgen properties', () => {
  it(`holds over ${COUNT} seeds`, () => {
    generateValley('warm-up', defaultSettings()); // JIT warm-up, so the timing below is honest
    const times: number[] = [];
    for (let n = 0; n < COUNT; n++) {
      const seed = `prop-${n}`;
      const t0 = process.hrtime.bigint();
      const { map, meta } = generateValley(seed, defaultSettings());
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      times.push(ms);

      // The river spans the map along its flow axis: water on both edges.
      let first = false;
      let last = false;
      for (let k = 0; k < S; k++) {
        const a = meta.flow === 'ns' ? k : k * S;
        const b = meta.flow === 'ns' ? (S - 1) * S + k : k * S + S - 1;
        if (map.water[a]) first = true;
        if (map.water[b]) last = true;
      }
      expect(first && last, seed).toBe(true);

      // Start area exists and is flat within 2.
      const [x0, z0, x1, z1] = meta.startArea;
      let hMin = 99;
      let hMax = -1;
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const h = map.height[z * S + x]!;
          hMin = Math.min(hMin, h);
          hMax = Math.max(hMax, h);
        }
      }
      expect(hMax - hMin, seed).toBeLessThanOrEqual(2);

      // Stone and clay within reach of the start area.
      let stone = 0;
      let clay = 0;
      for (let z = Math.max(0, z0 - DEPOSIT_REACH); z <= Math.min(S - 1, z1 + DEPOSIT_REACH); z++) {
        for (let x = Math.max(0, x0 - DEPOSIT_REACH); x <= Math.min(S - 1, x1 + DEPOSIT_REACH); x++) {
          const d = map.deposit[z * S + x];
          if (d === Deposit.stone) stone++;
          if (d === Deposit.clay) clay++;
        }
      }
      expect(stone, seed).toBeGreaterThanOrEqual(24);
      expect(clay, seed).toBeGreaterThan(0);

      // Gate on the edge, flagged, on a lane; parcels in range and parcel 0 holds the start center.
      const gate = meta.valleyGate[1] * S + meta.valleyGate[0];
      expect(map.flags[gate]! & Flags.valleyGate, seed).toBeTruthy();
      expect(map.road[gate], seed).toBeGreaterThan(0);
      expect(map.parcel[((z0 + z1 + 1) >> 1) * S + ((x0 + x1 + 1) >> 1)], seed).toBe(0);
      for (let i = 0; i < S * S; i += 97) expect(map.parcel[i]!).toBeLessThan(PARCEL_COUNT);
    }
    // Budget: under 300 ms each. Judged on the median so one descheduled run on a busy CI box
    // does not fail the build; the slowest is still bounded.
    times.sort((a, b) => a - b);
    expect(times[times.length >> 1]!).toBeLessThan(300);
    expect(times[times.length - 1]!).toBeLessThan(900);
  });

  it('names valleys from the word lists, deterministically', () => {
    expect(valleyNameFor('alpha')).toBe(valleyNameFor('alpha'));
    expect(valleyNameFor('alpha')).toMatch(/^[A-Z][a-z]+$/);
  });
});
