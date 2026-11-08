// Story arcs (docs/spec/11-residents.md, Story characters; C4D). Hourly at offset 120 in standard
// valleys: an arc whose arrival condition holds moves its character in (a household of one in the
// best vacant home, walking in from the valley gate; arrival waves hold a home back for them) and sends the hello letter; a few hours later
// the first step opens; each step's goal met (and no sooner than STEP_GAP after its letter) closes
// it through storyStep, which pays the reward and sends the next letter, until the finale. The post
// comes by day, one letter an hour across all arcs, so two characters never talk over each other.
import { content, type StoryArc } from '@qoti/content';
import { NEED_IDS, ResidentFlags, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../constants';
import type { Household, Resident, StoryState, System, TickCtx, WorldState } from '../../contracts';
import { evaluate, type Binding } from '../../conditions';
import { findById } from '../../state/entities';
import { goodsArray } from '../../state/hamlet';
import { storyLetter, storyView } from '../../view/village';
import { chronicle } from '../chronicle/api';
import { bindFor } from '../hearth/wishes';
import { moveResident } from '../movement/api';
import { homeDesirability } from '../residents/desirability';
import { ageDaysFor } from '../residents/generate';
import { gateTile } from '../residents/lifecycle';
import { doorOf, vacantHomes } from '../residents/places';
import { announceHousehold, announceResident, announceTown } from '../residents/records';
import { dayIndex, tickOfDay } from '../residents/time';
import { storyStep } from './api';

/** Hours between the hello letter and the first step's letter. */
export const SETTLE_TICKS = 4 * TICKS_PER_HOUR;
/** The least time a step stays open, so letters never pile up even when goals are already met. */
export const STEP_GAP = 12 * TICKS_PER_HOUR;
/**
 * Vacant homes a character needs before moving in. Playtest round five: with families arriving
 * every two hours, two empty homes were rare, so arrival waves now keep one back for a character
 * who is ready (residents/lifecycle.ts, storyWaiting) and the character needs only that one.
 */
export const STORY_VACANCIES = 1;
/** The post comes between these hours. */
export const POST_HOURS = [7, 21] as const;

export const stories: System = {
  id: 'stories',
  order: 96,
  every: TICKS_PER_HOUR,
  offset: 120,
  tick(state, ctx) {
    if (state.settings.mode !== 'standard') return;
    const hour = Math.floor(tickOfDay(state.tick) / TICKS_PER_HOUR);
    if (hour < POST_HOURS[0] || hour >= POST_HOURS[1]) return;
    advanceStories(state, ctx);
  },
};

/** One pass over the arcs: at most one letter goes out. Returns the arc that moved, or null. */
export function advanceStories(state: WorldState, ctx: TickCtx): string | null {
  for (const s of state.stories) {
    const arc = content.storyById.get(s.arc);
    if (!arc) continue;
    if (!s.residentId) {
      if (evaluate(state, arc.arrival, {}) && arrive(state, ctx, arc, s)) return s.arc;
      continue;
    }
    if (s.step >= arc.steps.length) continue;
    const r = findById(state.residents, s.residentId);
    if (!r) continue;
    if (s.step < 0) {
      if (state.tick - s.stepTick >= SETTLE_TICKS && storyStep(state, ctx, s.arc)) return s.arc;
      continue;
    }
    const step = arc.steps[s.step]!;
    if (state.tick - s.stepTick < STEP_GAP || !evaluate(state, step.goal, storyBinding(state, r))) continue;
    if (!storyStep(state, ctx, s.arc)) continue;
    if (s.step >= arc.steps.length) {
      chronicle(state, ctx, 'story-finale', {
        text: [['name', `${r.given} ${r.family}`]],
        refs: [r.id],
        seats: [...state.time.connected],
      });
    }
    return s.arc;
  }
  return null;
}

/** The places a story goal is measured from: the character's home, work and nearest market. */
export function storyBinding(state: WorldState, r: Resident): Binding {
  return bindFor(state, r);
}

/**
 * Moves a story character in: a household of one in the best vacant home for their species, walking
 * in from the gate, with a Chronicle line and the hello letter. False when no home is free.
 */
export function arrive(state: WorldState, ctx: TickCtx, arc: StoryArc, s: StoryState): boolean {
  const c = arc.character;
  const vacant = vacantHomes(state);
  if (vacant.length < STORY_VACANCIES) return false;
  let home = null;
  let best = -Infinity;
  for (const v of vacant) {
    const score = homeDesirability(state, v.building, c.species);
    if (score > best) {
      best = score;
      home = v.building;
    }
  }
  if (!home) return false;
  const today = dayIndex(state.tick);
  const gate = gateTile(state);
  const h: Household = {
    id: state.nextId++,
    family: c.family,
    members: [],
    homeId: home.id,
    pantry: goodsArray(),
    recentFoods: [],
    savings: 0,
    tier: home.rt?.tier ?? 'settler',
    arrivedDay: today,
    lowMoodDays: 0,
  };
  // A welcome hamper, as every newcomer gets: a loaf.
  const bread = content.goodIndex.get('bread');
  if (bread !== undefined) h.pantry[bread] = 1;
  const r: Resident = {
    id: state.nextId++,
    given: c.given,
    family: c.family,
    species: c.species,
    stage: c.stage,
    bornDay: today - ageDaysFor(c.stage, ctx.rng('misc')),
    traits: [...c.traits],
    householdId: h.id,
    jobId: 0,
    tier: h.tier,
    mood: 75,
    needs: NEED_IDS.map((n) => (n === 'belonging' ? 50 : 75)),
    modifiers: [{ kind: 'fresh-start', value: 10, from: state.tick, until: state.tick + 2 * TICKS_PER_DAY }],
    bond: 1,
    friends: [],
    activity: { kind: 'arrive' },
    move: null,
    tile: gate,
    inside: 0,
    carry: null,
    wishId: 0,
    history: [{ day: today, kind: 'arrived' }],
    flags: ResidentFlags.story,
    look: ctx.rng('misc').next() >>> 0,
    story: arc.id,
  };
  h.members.push(r.id);
  state.households.push(h);
  state.residents.push(r);
  moveResident(state, r, doorOf(state, home.id), 'arrive');
  s.residentId = r.id;
  s.stepTick = state.tick;
  announceResident(state, ctx, r);
  announceHousehold(state, ctx, h.id, true);
  announceTown(state, ctx);
  chronicle(state, ctx, 'story-arrived', {
    text: [['name', `${c.given} ${c.family}`]],
    refs: [r.id, home.id],
  });
  ctx.events.push({ e: 'story.step', s: storyView(state, s), letter: storyLetter(state, s, -1) });
  return true;
}
