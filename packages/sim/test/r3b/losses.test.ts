// R3B, losing one (19-evenings.md, Masters): a master retires, or their household is flagged as
// leaving, and the morning writes a Chronicle line and a notice, once. The sign comes down at 23:45;
// a retired master keeps the flag and the title.
import { masterWords } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { ResidentFlags } from '../../src/constants';
import type { SimEvent } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { isMaster, masterTitle } from '../../src/systems/masters/api';
import { lifeMorning } from '../../src/systems/residents/life';
import { createTickCtx } from '../../src/turn';
import { mastersDay, masterWorld, res } from './masterFixture';

function makeMaster(w: ReturnType<typeof masterWorld>, index: number) {
  const r = res(w.state, w.crew[index]!);
  r.flags |= ResidentFlags.master;
  r.mastery = 'baker';
  w.bakery.masterId = r.id;
  return r;
}

function morning(w: ReturnType<typeof masterWorld>): SimEvent[] {
  const ctx = createTickCtx(w.state);
  lifeMorning(w.state, ctx);
  return ctx.events;
}

const lost = (events: SimEvent[]) => events.filter((e) => e.e === 'life.event' && e.kind === 'masterLost');
const lines = (w: ReturnType<typeof masterWorld>) =>
  w.state.chronicle.filter((c) => c.kind === 'master-lost');

describe('losing a master', () => {
  it('a master who retires is announced, keeps the flag and the title, and the sign comes down', () => {
    const w = masterWorld();
    const r = makeMaster(w, 1);
    r.stage = 'elder';
    const events = morning(w);
    expect(r.retired).toBe(true);
    expect(lost(events)).toHaveLength(1);
    expect(lines(w)).toHaveLength(1);
    expect(lines(w)[0]!.text).toContain(r.given);
    expect(lines(w)[0]!.text).toContain('master baker');
    const text = (lost(events)[0] as { text: string }).text;
    expect(text).toContain(r.given);
    expect(text).not.toContain('{');
    expect(w.bakery.masterId).toBe(r.id);
    mastersDay(w.state);
    expect(w.bakery.masterId).toBeUndefined();
    expect(isMaster(r)).toBe(true);
    expect(masterTitle(r)).toBe('master baker');
    // Another morning: nothing more to say.
    expect(lost(morning(w))).toHaveLength(0);
  });

  it('a master whose household is flagged as leaving is announced once, on the morning it is flagged', () => {
    const w = masterWorld();
    const r = makeMaster(w, 1);
    const h = findById(w.state.households, r.householdId)!;
    for (const id of h.members) findById(w.state.residents, id)!.flags |= ResidentFlags.leaving;
    expect(lost(morning(w)).length).toBe(1);
    expect(lines(w)).toHaveLength(1);
    // The household sets off at 09:00 (no home): still on the walk to the gate next morning, not again.
    h.homeId = 0;
    expect(lost(morning(w))).toHaveLength(0);
    expect(lines(w)).toHaveLength(1);
  });

  it('says nothing of a hand who is not a master, or of a story master', () => {
    const w = masterWorld();
    const plain = res(w.state, w.crew[1]!);
    plain.stage = 'elder';
    const story = makeMaster(w, 2);
    story.flags |= ResidentFlags.story | ResidentFlags.leaving;
    expect(lost(morning(w))).toHaveLength(0);
    expect(lines(w)).toHaveLength(0);
  });

  it('uses different words for retiring and for leaving the valley', () => {
    const w = masterWorld();
    const a = makeMaster(w, 1);
    a.stage = 'elder';
    morning(w);
    const retiredText = lines(w)[0]!.text;
    const w2 = masterWorld();
    const b = makeMaster(w2, 1);
    const h = findById(w2.state.households, b.householdId)!;
    for (const id of h.members) findById(w2.state.residents, id)!.flags |= ResidentFlags.leaving;
    morning(w2);
    expect(lines(w2)[0]!.text).not.toBe(retiredText);
    expect(masterWords.whyLeft.some((x) => lines(w2)[0]!.text.includes(x))).toBe(true);
    expect(masterWords.whyRetired.some((x) => retiredText.includes(x))).toBe(true);
  });
});
