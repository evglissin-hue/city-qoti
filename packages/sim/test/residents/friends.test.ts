import { describe, expect, it } from 'vitest';
import { MAX_FRIENDS, TICKS_PER_DAY } from '../../src/constants';
import type { Resident } from '../../src/contracts';
import {
  befriend,
  canBefriend,
  dailyFriendships,
  FRIEND_LEVELS,
  hourlyFriendships,
  levelFor,
  pairPoints,
} from '../../src/systems/residents/friends';
import { settleHousehold } from '../../src/systems/residents/lifecycle';
import { compatibility } from '../../src/systems/residents/traits';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { placeBuilding, resident } from './helpers';

function fixture() {
  const f = hamletFixture();
  const [th, ub, qu] = f.residents;
  const get = (id: number) => resident(f.state, id);
  return {
    f,
    clover: get(th![0]!), // cheerful, green-fingered
    hazel: get(th![1]!), // shy, bookish
    pip: get(th![2]!), // curious, sporty (child)
    wendell: get(ub![0]!), // grumpy, practical
    marina: get(ub![1]!), // romantic, night owl
    finn: get(ub![2]!), // sporty, cheerful
    pippa: get(qu![0]!), // curious, practical
    tansy: get(qu![1]!), // sweet tooth, homebody
    crumb: get(qu![2]!), // early bird, generous
  };
}

function friendOf(a: Resident, b: Resident) {
  return a.friends.find((x) => x.id === b.id);
}

describe('friendships', () => {
  it('weighs compatibility: matching traits x1.5, clashes x0.5', () => {
    const { clover, finn, wendell, hazel, tansy } = fixture();
    expect(compatibility(clover, finn)).toBe(150); // cheerful befriends cheerful
    expect(compatibility(clover, wendell)).toBe(50); // cheerful clashes with grumpy
    expect(compatibility(hazel, tansy)).toBe(100);
    expect(pairPoints(clover, finn, 2)).toBe(3);
    expect(pairPoints(clover, wendell, 2)).toBe(1);
    // Shy halves the rate; generous speeds it up a little.
    expect(pairPoints(hazel, tansy, 4)).toBe(3);
  });

  it('levels up at 10, 30, 60, 100 and 150 points, symmetrically, with a mood lift for new friends', () => {
    const { f, clover, finn } = fixture();
    expect(FRIEND_LEVELS).toEqual([10, 30, 60, 100, 150]);
    expect([0, 9, 10, 29, 30, 60, 99, 100, 150, 400].map(levelFor)).toEqual([0, 0, 1, 1, 2, 3, 3, 4, 5, 5]);
    befriend(f.state, clover, finn, 9);
    expect(friendOf(clover, finn)!.level).toBe(0);
    expect(friendOf(finn, clover)!.points).toBe(9);
    befriend(f.state, clover, finn, 1);
    expect(friendOf(clover, finn)!.level).toBe(1);
    expect(friendOf(finn, clover)!.level).toBe(1);
    for (const r of [clover, finn]) {
      expect(r.modifiers.some((m) => m.kind === 'new-friend')).toBe(true);
      expect(r.history.some((h) => h.kind === 'friend')).toBe(true);
    }
    befriend(f.state, clover, finn, 60);
    expect(friendOf(clover, finn)!.level).toBe(3);
    expect(clover.history.some((h) => h.kind === 'friend-3')).toBe(true);
  });

  it('keeps five friends at most: a new face replaces the weakest acquaintance only', () => {
    const { f, clover } = fixture();
    const ctx = createTickCtx(f.state);
    const others: Resident[] = [];
    for (let i = 0; i < 7; i++) {
      const home = placeBuilding(f.state, 'cottage', 20 + 3 * i, 80);
      const h = settleHousehold(f.state, ctx, home.id, 'badger', ['adult']);
      others.push(resident(f.state, h.members[0]!));
    }
    for (let i = 0; i < 5; i++) befriend(f.state, clover, others[i]!, 2 + i);
    expect(clover.friends).toHaveLength(MAX_FRIENDS);
    // The weakest (2 points) makes way.
    befriend(f.state, clover, others[5]!, 1);
    expect(clover.friends).toHaveLength(MAX_FRIENDS);
    expect(friendOf(clover, others[0]!)).toBeUndefined();
    expect(friendOf(others[0]!, clover)).toBeUndefined();
    expect(friendOf(clover, others[5]!)).toBeDefined();
    // Five real friends: nobody new gets in.
    for (const fr of clover.friends) {
      befriend(f.state, clover, resident(f.state, fr.id), 20);
    }
    befriend(f.state, clover, others[6]!, 5);
    expect(friendOf(clover, others[6]!)).toBeUndefined();
    expect(clover.friends.map((x) => x.id)).toEqual(
      [...clover.friends.map((x) => x.id)].sort((a, b) => a - b),
    );
  });

  it('decays a point a day apart, Shy friendships every other day, and ends at zero', () => {
    const { f } = fixture();
    const ctx = createTickCtx(f.state);
    // Four loners far apart from each other, so no neighborly waving tops the points up.
    const loners = [20, 60, 120, 160].map((x, i) => {
      const home = placeBuilding(f.state, 'cottage', x, 120 + 20 * (i % 2));
      return resident(f.state, settleHousehold(f.state, ctx, home.id, 'fox', ['adult']).members[0]!);
    });
    const [a, b, c, d] = loners as [Resident, Resident, Resident, Resident];
    a.traits = ['cheerful', 'artistic'];
    b.traits = ['cheerful', 'practical'];
    c.traits = ['shy', 'bookish'];
    d.traits = ['grumpy', 'thrifty'];
    befriend(f.state, a, b, 4);
    befriend(f.state, c, d, 4);
    const points = () => [friendOf(a, b)?.points ?? 0, friendOf(c, d)?.points ?? 0];
    const days: number[][] = [];
    for (let day = 0; day < 5; day++) {
      f.state.tick += TICKS_PER_DAY;
      dailyFriendships(f.state);
      days.push(points());
    }
    // Met on day 0: day 1 still counts as recent, then a point a day; Shy only every other day.
    expect(days.map((p) => p[0])).toEqual([4, 3, 2, 1, 0]);
    expect(days[4]![1]).toBeGreaterThan(0);
    expect(friendOf(b, a)).toBeUndefined();
    expect(friendOf(d, c)?.points).toBe(days[4]![1]);
  });

  it('counts an hour together at work, but not family, and children only with children', () => {
    const { f, clover, wendell, hazel, pip } = fixture();
    // Clover and Wendell both build at the town hall; put them inside together.
    for (const r of [clover, wendell]) r.inside = f.b.townHall;
    hourlyFriendships(f.state);
    expect(friendOf(clover, wendell)!.points).toBe(1); // work 1 point, x0.5 clash rounds up to 1
    expect(canBefriend(clover, hazel)).toBe(false);
    expect(canBefriend(clover, pip)).toBe(false);
  });

  it('makes neighbors acquainted day by day', () => {
    const { f, clover } = fixture();
    dailyFriendships(f.state);
    expect(clover.friends.length).toBeGreaterThan(0);
  });
});
