// Debug only (?debug&fixture=hamlet, =village [I2], =winter or =raid [I3]): a solo valley that starts as the sim's
// hamlet or village fixture, so panels can be tried and tested live before the tracks land. With
// &mock, the fixture's missing history (wishes, pages, Chronicle, stocks, budget) is laid over the
// Mirror from the UI mocks, whose ids match the fixture.
import { randomId } from '@qoti/protocol';
import { bytesToBase64, serialize, SIM_VERSION } from '@qoti/sim';
import { LocalRoom } from '../net/local';
import { IdbStorage } from '../net/idb';
import type { Session } from './session';
import { rememberValley, type RecentValley } from './recent';

export const FIXTURE = new URLSearchParams(location.search).get('fixture');
export const MOCK_OVERLAY = new URLSearchParams(location.search).has('mock');

export type FixtureKind = 'hamlet' | 'village' | 'winter' | 'raid';
export const FIXTURE_KINDS: readonly FixtureKind[] = ['hamlet', 'village', 'winter', 'raid'];

/** Writes a new solo valley whose first snapshot is one of the sim's fixtures, and remembers it. */
export async function createFixtureValley(
  townName = 'Thistlecombe',
  kind: FixtureKind = 'hamlet',
): Promise<RecentValley> {
  const state =
    kind === 'winter'
      ? (await import('../../../../packages/sim/test/fixtures/winter')).winterFixture().state
      : kind === 'raid'
        ? (await import('../../../../packages/sim/test/fixtures/threat')).raidAtDusk().state
        : kind === 'village'
          ? (await import('../../../../packages/sim/test/fixtures/village')).villageFixture().state
          : (await import('../../../../packages/sim/test/fixtures/hamlet')).hamletFixture().state;
  state.settings.townName = townName;
  state.settings.valleyName = 'Fixture Vale';
  state.time.connected = [];
  const valleyId = randomId();
  const { token } = await LocalRoom.create(valleyId, { seed: state.seed, settings: state.settings });
  await new IdbStorage(valleyId).putSnapshot({
    t: state.lastTurn,
    simVersion: SIM_VERSION,
    label: null,
    created: Date.now(),
    data: bytesToBase64(serialize(state)),
  });
  const v: RecentValley = { valleyId, seat: 0, token, mode: 'solo', name: townName, lastPlayed: Date.now() };
  rememberValley(v);
  return v;
}

/** Lays the UI mocks' history over a live fixture valley (and answers inspect from them). */
export async function overlayMocks(session: Session): Promise<void> {
  if (FIXTURE === 'village' || FIXTURE === 'winter' || FIXTURE === 'raid')
    return overlayVillageMocks(session);
  const mocks = await import('../ui/mocks/hamlet');
  const { mockInspect } = await import('../ui/mocks/session');
  const m = session.mirror;
  for (const w of mocks.mockWishes) m.wishes.set(w.id, w);
  for (const p of mocks.mockPatterns) m.patterns.set(p.id, p);
  for (const a of mocks.mockAchievements) m.achievements.set(a.id, a);
  for (const r of mocks.mockResidents) {
    const live = m.residents.get(r.id);
    if (live) m.residents.set(r.id, { ...live, wishId: r.wishId, moodBand: r.moodBand, bond: r.bond });
  }
  for (const b of mocks.mockBuildings) {
    const live = m.buildings.get(b.id);
    if (live) m.buildings.set(b.id, { ...live, ...b });
  }
  m.chronicle.value = mocks.mockChronicle;
  m.stocks.value = mocks.mockStocks;
  m.budget.value = mocks.mockBudget;
  m.town.value = mocks.mockTown;
  m.hamletRevision.value++;
  m.revision.value++;
  const live = session.inspect.bind(session);
  session.inspect = (kind, id) => {
    const mock = mockInspect(kind, id);
    return mock ? Promise.resolve(mock) : live(kind, id);
  };
}

/**
 * I2 (C4F): the village mocks over the live village fixture: a story under way with its letters,
 * the couple, a caravan and the trade log, an innovation halfway. With `charter`, an in-progress
 * Charter board (the fixture is already a Village, and no Town Charter exists in I2).
 */
export async function overlayVillageMocks(session: Session, opts: { charter?: boolean } = {}): Promise<void> {
  const v = await import('../ui/mocks/village');
  const m = session.mirror;
  for (const st of v.mockStories) m.stories.set(st.arc, st);
  m.letters.value = [...v.mockLetters];
  for (const i of v.mockInnovations) m.innovations.set(i.id, i);
  m.trade.value = v.mockTrade;
  for (const r of v.mockVillageView.residents ?? []) {
    const live = m.residents.get(r.id);
    if (live && r.partner) m.residents.set(r.id, { ...live, partner: r.partner });
  }
  if (opts.charter) m.charter.value = v.mockCharter;
  m.villageRevision.value++;
  m.hamletRevision.value++;
  const story = v.mockVillageResidentDetail;
  const live = session.inspect.bind(session);
  session.inspect = async (kind, id) => {
    const real = await live(kind, id);
    if (kind === 'resident' && id === story.r.id && real && 'r' in real) {
      return { ...real, story: story.story!, partner: story.partner! };
    }
    return real;
  };
}
