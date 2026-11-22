// R2E: the places advisor composes somewhere to go: benches in rows, seats near a quarter of the
// grown-ups, the tavern in the Hearth's lane, none of it in a Hearth-off run.
import { content } from '@qoti/content';
import { TILE_FP, type WorldState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay } from '../autoplay';
import { advisors } from '.';
import { Planner } from '../planner';
import { grownups, places, seatCount, townSeats } from './places';

const S = 128;

describe('the places advisor', () => {
  it('is a Hearth-lane advisor that plays unless the Hearth is off', () => {
    const def = advisors.find((a) => a.id === 'places')!;
    expect(def.lane).toBe('hearth');
    expect(def.slot).toBe(62);
    expect(def.plays({}, {} as WorldState)).toBe(true);
    expect(def.plays({ hearth: false }, {} as WorldState)).toBe(false);
  });

  it('counts seats from decor (not child seats) and built hosts, grown-ups by stage', () => {
    const bench = content.decorById.get('bench')!.seats!;
    const swing = [...content.decorById.values()].find((d) => d.childSeats);
    const at = (def: string, x: number, z: number) => ({
      id: x,
      def,
      fx: x * TILE_FP,
      fz: z * TILE_FP,
      rot: 0,
      builtBy: 0 as const,
    });
    const w = {
      decor: [at('bench', 10, 10), at('bench', 12, 10), ...(swing ? [at(swing.id, 14, 10)] : [])],
      buildings: [
        { id: 1, def: 'tavern', x: 20, z: 20, rot: 0, stage: 'built' },
        { id: 2, def: 'tavern', x: 40, z: 40, rot: 0, stage: 'construction' },
      ],
      residents: [{ stage: 'child' }, { stage: 'young' }, { stage: 'adult' }, { stage: 'elder' }],
    } as unknown as WorldState;
    expect(seatCount(w)).toBe(2 * bench + content.buildingById.get('tavern')!.host!.seats);
    expect(townSeats(w).filter((s) => s.host)).toHaveLength(1);
    expect(grownups(w)).toBe(2);
  });

  it('sites the tavern in the Hearth lane and keeps seats near a quarter of the grown-ups', () => {
    const run = autoplay('willow', 25, {
      village: true,
      villageDay: 6,
      onDay: (w) => {
        // A funded town: decor is charged, and the treasury is the economy's business, not this test's.
        if (w.economy.treasury < 50000) w.economy.treasury = 50000;
      },
    });
    const w = run.hamlet.world;
    const mine = run.decisions.filter((r) => r.advisor === 'places' && r.ok);
    expect(mine.length).toBeGreaterThan(0);
    const taverns = run.decisions.filter(
      (r) => r.cmd.t === 'build.place' && (r.cmd as { def: string }).def === 'tavern',
    );
    expect(taverns.length, run.actions.join('\n')).toBeGreaterThan(0);
    // The tavern is the places advisor's (the Hearth lane's), never the village advisor's.
    expect(taverns.every((r) => r.advisor === 'places' && r.lane === 'hearth')).toBe(true);
    // Seats stay near a quarter of the grown-ups: the Hearth's wish benches may pass it, this advisor adds none then.
    const homesSeated = seatCount(w);
    expect(homesSeated).toBeGreaterThan(0);
    for (const r of mine.filter((m) => m.label.startsWith('bench') && m.label.includes('near a home')))
      expect(r.day).toBeGreaterThan(0);
  }, 180_000);

  it('a Hearth-off run builds no tavern; a visit after it lays benches in rows near bare homes', () => {
    const run = autoplay('willow', 20, {
      village: true,
      villageDay: 6,
      hearthOffFrom: 1,
      onDay: (w) => {
        if (w.economy.treasury < 50000) w.economy.treasury = 50000;
      },
    });
    expect(run.decisions.filter((r) => r.lane === 'hearth' && r.ok)).toEqual([]);
    expect(run.hamlet.world.buildings.some((b) => b.def === 'tavern')).toBe(false);
    // Now the Hearth comes: homes with nothing to sit on get a row, at most three commands a visit.
    const w = run.hamlet.world;
    const planner = new Planner(run.hamlet);
    planner.advisor = { id: 'places', lane: 'hearth' };
    const advisor = places.create(planner);
    // R2X: a Village with no tavern gets its tavern first, which can take a whole visit; the rows
    // come on the next. P3A: a shop that can be a Corner Cafe is dressed first and that takes a
    // visit too, now that a visit keeps to its three commands (it used to dress two shops at once).
    let sent: typeof planner.decisions = [];
    for (let v = 0; v < 3; v++) {
      if (w.economy.treasury < 50000) w.economy.treasury = 50000;
      const before = planner.decisions.length;
      advisor.visit({ afternoon: false });
      const visit = planner.decisions.slice(before);
      expect(visit.length, visit.map((r) => `${r.kind} ${r.label}`).join('\n')).toBeLessThanOrEqual(3 + 2);
      sent = visit;
      if (visit.some((r) => r.ok && r.label.startsWith('bench in a row'))) break;
    }
    // The row's benches (a Corner Cafe's pieces by a shop, sent in the same visit, keep their own rule).
    const benches = sent.filter(
      (r) => r.ok && r.cmd.t === 'decor.place' && /^bench (in a row|near a home)/.test(r.label),
    );
    expect(benches.length, planner.actions.join('\n')).toBeGreaterThanOrEqual(2);
    const spot = content.places.spotRadius;
    const pts = benches.map((r) => [
      (r.cmd as { fx: number }).fx / TILE_FP,
      (r.cmd as { fz: number }).fz / TILE_FP,
    ]);
    for (const [x, z] of pts)
      expect(
        pts.filter(([ox, oz]) => (ox! - x!) ** 2 + (oz! - z!) ** 2 <= spot * spot).length,
      ).toBeGreaterThanOrEqual(2);
    for (const [x, z] of pts) {
      const i = Math.floor(z!) * S + Math.floor(x!);
      expect(w.map.road[i] || (w.map.zone[i] && !w.map.occupant[i])).toBeFalsy();
    }
  }, 180_000);
});
