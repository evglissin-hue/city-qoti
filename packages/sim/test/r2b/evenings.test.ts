// R2B: good evenings (docs/spec/19-evenings.md, Good evenings): the score, the need, the bond heart
// and the mood weights. Rounds are filled by hand (R2A's planner is a stand-in).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { NEED_IDS, RoundFlags, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { LifeStage, Resident, RoundStop, TierId, WorldState } from '../../src/contracts';
import { EVENINGS_NEED } from '../../src/state/evenings';
import { closeEvening, eveningScore } from '../../src/systems/residents/evening';
import { dayIndex } from '../../src/systems/residents/time';
import { serviceNeedWords, weightRow } from '../../src/systems/services/weights';
import { createTickCtx } from '../../src/turn';
import { flatWorld } from '../helpers';

const P = content.places;
const F = RoundFlags;
/** 21:00 of day 0 (the world starts at 06:00), and 19:00. */
const NINE = 15 * TICKS_PER_HOUR;
const SEVEN = 13 * TICKS_PER_HOUR;

function stop(kind: RoundStop['kind'], draw: number, flags = 0, arrived = SEVEN): RoundStop {
  return { place: `${kind}:1`, kind, tile: 0, draw, flags: F.arrived | flags, arrived };
}

function grownup(s: WorldState, round: RoundStop[], stage: LifeStage = 'adult', need = 50): Resident {
  const r = {
    id: s.nextId++,
    stage,
    tier: 'settler',
    bond: 0,
    needs: NEED_IDS.map(() => 100),
    round,
  } as unknown as Resident;
  r.needs[EVENINGS_NEED] = need;
  s.residents.push(r);
  return r;
}

function at21(): WorldState {
  const s = flatWorld();
  s.tick = NINE;
  return s;
}

describe('the evening score', () => {
  const score = (round: RoundStop[], stage: LifeStage = 'adult') => {
    const s = at21();
    return eveningScore(s, grownup(s, round, stage));
  };

  it('stays in at stayInScore, with no round at all too', () => {
    expect(score([])).toBe(P.stayInScore);
    const s = at21();
    expect(eveningScore(s, {} as Resident)).toBe(P.stayInScore);
    expect(score([{ ...stop('eat', 90), flags: F.turnedAway }])).toBe(P.stayInScore);
    expect(score([{ ...stop('eat', 90), arrived: -1 }])).toBe(P.stayInScore);
  });

  it('takes the best draw', () => {
    expect(score([stop('eat', 40), stop('shop', 55)])).toBe(55);
  });

  it("adds a friend met, but not at a friend's home", () => {
    expect(score([stop('eat', 50, F.friend)])).toBe(50 + P.friendScore);
    expect(score([stop('visit', 30, F.friend)])).toBe(30);
  });

  it('adds a treat, including one bought passing on a stop not yet reached', () => {
    expect(score([stop('eat', 50, F.treat)])).toBe(50 + P.treatScore);
    const ahead: RoundStop = { place: 'x', kind: 'eat', tile: 0, draw: 0, flags: F.treat, arrived: -1 };
    expect(score([stop('eat', 50), ahead])).toBe(50 + P.treatScore);
  });

  it('adds a second kind of stop, but a shop is no kind', () => {
    expect(score([stop('eat', 50), stop('sit', 30)])).toBe(50 + P.secondKindScore);
    expect(score([stop('eat', 50), stop('shop', 30)])).toBe(50);
    expect(score([stop('eat', 50), stop('eat', 30)])).toBe(50);
  });

  it('takes standing off the stop, floors at stayInScore and caps at 100', () => {
    expect(score([stop('eat', 50, F.standing)])).toBe(50 - P.standingPenalty);
    expect(score([stop('eat', 50, F.standing), stop('sit', 45)])).toBe(45 + P.secondKindScore);
    expect(score([stop('eat', 22, F.standing)])).toBe(P.stayInScore);
    expect(score([stop('eat', 98, F.friend | F.treat)])).toBe(100);
  });

  it("ignores yesterday's stops", () => {
    const s = at21();
    s.tick = NINE + TICKS_PER_DAY;
    const r = grownup(s, [stop('eat', 80, F.treat | F.friend)]);
    expect(dayIndex(r.round![0]!.arrived)).not.toBe(dayIndex(s.tick));
    expect(eveningScore(s, r)).toBe(P.stayInScore);
  });

  it('counts a treat on a stop not yet reached only when they got somewhere tonight', () => {
    const ahead: RoundStop = { place: 'x', kind: 'sit', tile: 0, draw: 0, flags: F.treat, arrived: -1 };
    expect(score([ahead])).toBe(P.stayInScore);
  });
});

describe('closing the evening', () => {
  it('moves the need a third of the way: 50 toward 80 gives 60', () => {
    const s = at21();
    const r = grownup(s, [stop('eat', 80)]);
    closeEvening(s, createTickCtx(s));
    expect(r.needs[EVENINGS_NEED]).toBe(60);
    expect(r.evening).toMatchObject({ score: 80, day: 0, good: 1 });
  });

  it('leaves everything on a stormy evening', () => {
    const s = at21();
    s.weather.today = 'storm';
    const r = grownup(s, [stop('eat', 80)]);
    closeEvening(s, createTickCtx(s));
    expect(r.needs[EVENINGS_NEED]).toBe(50);
    expect(r.evening).toBeUndefined();
  });

  it('adds scoreSum only when tonight is today, and notes the weather then', () => {
    const s = at21();
    grownup(s, [stop('eat', 80)]);
    grownup(s, []);
    closeEvening(s, createTickCtx(s));
    expect(s.evenings.tonight.scoreSum).toBe(0);
    s.evenings.tonight.day = 0;
    s.weather.today = 'rain';
    closeEvening(s, createTickCtx(s));
    expect(s.evenings.tonight.scoreSum).toBe(80 + P.stayInScore);
    expect(s.evenings.tonight.weather).toBe('rain');
  });

  it('does not score children, nor elders who stayed in', () => {
    const s = at21();
    const kid = grownup(s, [stop('eat', 90)], 'child');
    const homebody = grownup(s, [], 'elder');
    const out = grownup(s, [stop('sit', 80)], 'elder');
    closeEvening(s, createTickCtx(s));
    expect(kid.needs[EVENINGS_NEED]).toBe(50);
    expect(kid.evening).toBeUndefined();
    expect(homebody.needs[EVENINGS_NEED]).toBe(50);
    expect(out.needs[EVENINGS_NEED]).toBe(60);
  });

  it('gives one bond heart per season for four good evenings, up to five, and starts again', () => {
    const s = at21();
    const r = grownup(s, [stop('eat', 60)]);
    r.bond = 2;
    for (let d = 0; d < 6; d++) {
      s.tick = NINE + d * TICKS_PER_DAY;
      r.round = [stop('eat', 60, 0, SEVEN + d * TICKS_PER_DAY)];
      closeEvening(s, createTickCtx(s));
      expect(r.bond).toBe(d >= P.goodForHeart - 1 ? 3 : 2);
    }
    expect(r.evening!.heart).toBe(true);
    // A new season counts from nothing.
    const next = 28 * TICKS_PER_DAY;
    s.tick = NINE + next;
    r.round = [stop('eat', 60, 0, SEVEN + next)];
    closeEvening(s, createTickCtx(s));
    expect(r.evening).toMatchObject({ good: 1 });
    expect(r.evening!.heart).toBeUndefined();
    expect(r.bond).toBe(3);
  });

  it('gives no heart past the hearts maximum', () => {
    const s = at21();
    const r = grownup(s, [stop('eat', 60)]);
    r.bond = P.heartsMax;
    r.evening = { score: 60, day: -1, good: P.goodForHeart - 1, season: 4 };
    closeEvening(s, createTickCtx(s));
    expect(r.bond).toBe(P.heartsMax);
    expect(r.evening!.heart).toBe(true);
  });
});

describe('mood weights', () => {
  it('weigh beauty 0, evenings needWeight and social 0, for every tier and stage', () => {
    const stages: LifeStage[] = ['child', 'young', 'adult', 'elder'];
    for (const tier of ['settler', 'craftsfolk'] as TierId[]) {
      for (const stage of stages) {
        for (const market of [false, true]) {
          const w = weightRow(tier, stage, market).w;
          expect(w[NEED_IDS.indexOf('beauty')]).toBe(0);
          expect(w[EVENINGS_NEED]).toBe(P.needWeight);
          expect(w[NEED_IDS.indexOf('social')]).toBe(0);
        }
      }
    }
  });

  it('has words for the evenings need', () => {
    expect(serviceNeedWords(EVENINGS_NEED).length).toBeGreaterThan(0);
    expect(serviceNeedWords(EVENINGS_NEED).some(([min]) => min === 0)).toBe(true);
  });
});
