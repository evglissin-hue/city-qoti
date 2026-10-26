// Debug only (?debug&fixture=hamlet, or =village [I2]): a solo valley that starts as the sim's
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

/** Writes a new solo valley whose first snapshot is the hamlet (or village) fixture, and remembers it. */
export async function createFixtureValley(
  townName = 'Thistlecombe',
  kind: 'hamlet' | 'village' = 'hamlet',
): Promise<RecentValley> {
  const state =
    kind === 'village'
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
