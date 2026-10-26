// Mock I2 views for UI work (C4.0), built from the sim's village fixture
// (packages/sim/test/fixtures/village.ts) with the sim's own view builders, so ids, names and
// numbers match the live fixture exactly. On top: a little history the fixture does not have yet
// (a trade log and a caravan, an innovation halfway, a story under way with its letters, a couple
// and a profit line). Panels build against these first, then wire to the live Mirror.
import {
  buildingDetail,
  buildView,
  charterView,
  inspect,
  residentDetail,
  type BuildingDetail,
  type CharterView,
  type InnovationView,
  type LetterView,
  type LeversView,
  type LoansView,
  type LotView,
  type MarketView,
  type PlanView,
  type RequestView,
  type ResidentDetail,
  type StoryView,
  type TradeView,
  type InspectKind,
  type InspectResult,
  type ViewSnapshot,
} from '@qoti/sim';
import { villageFixture } from '../../../../../packages/sim/test/fixtures/village';

const DAY = 4800;
const fixture = villageFixture();
const s = fixture.state;

// History the fixture lacks: progress toward the next goals, a couple, a trade under way.
const [a, b] = fixture.residents;
s.residents.find((r) => r.id === a)!.partner = b!;
s.residents.find((r) => r.id === b)!.partner = a!;
s.residents.find((r) => r.id === a)!.marriedDay = 2;
s.residents.find((r) => r.id === b)!.marriedDay = 2;
const wheel = s.innovations.find((i) => i.id === 'wheelbarrows')!;
wheel.progress = 66;
wheel.counter = 2;
s.trade.caravans.push({
  id: 9001,
  neighbor: 'stonecross',
  selling: [[5, 20]],
  buying: [[9, 12]],
  departTick: 2 * DAY + 400,
  returnTick: 5 * DAY + 400,
});
s.trade.log.push(
  { tick: DAY + 400, neighbor: 'millhaven', good: 1, qty: -20, pennies: 5100 },
  { tick: DAY + 400, neighbor: 'millhaven', good: 10, qty: 8, pennies: -2160 },
);

const view: ViewSnapshot = buildView(s);

export const villageIds = {
  residents: fixture.residents,
  households: fixture.households,
  craftsfolk: fixture.craftsfolk,
  buildings: fixture.b,
  lots: fixture.lots,
  plan: fixture.plan,
  request: fixture.request,
  loan: fixture.loan,
};

export const mockMarket: MarketView = view.market!;
export const mockLevers: LeversView = view.levers!;
export const mockLoans: LoansView = view.loans!;
export const mockLots: LotView[] = view.lots!;
export const mockTrade: TradeView = view.trade!;
export const mockInnovations: InnovationView[] = view.innovations!;
export const mockPlans: PlanView[] = view.plans!;
export const mockRequests: RequestView[] = view.requests!;

/** The Charter at Village rank has no next board yet (Town arrives in I4); this shows one in progress. */
export const mockCharter: CharterView = {
  ...charterView(s),
  rank: 'hamlet',
  next: 'village',
  charter: 'village',
  goals: [
    { id: 'residents', text: '30 residents', lane: 'shared', value: 60, target: 30, done: true },
    { id: 'patterns', text: '3 patterns discovered', lane: 'hearth', value: 2, target: 3, done: false },
    { id: 'wishes', text: '5 wishes granted', lane: 'hearth', value: 5, target: 5, done: true },
    { id: 'food', text: '5 days of food in stock', lane: 'ledger', value: 3, target: 5, done: false },
    { id: 'surplus', text: 'A season ended in surplus', lane: 'ledger', value: 1, target: 1, done: true },
  ],
  ready: false,
  history: [],
};

/** A story under way: the content arcs arrive with C4D, so these name Pippa Quill by hand. */
export const mockStories: StoryView[] = [
  {
    arc: 'pippa-quill',
    name: 'Pippa Quill',
    species: 'mouse',
    residentId: a!,
    step: 1,
    steps: 5,
    hint: 'A sawpit within three tiles of the river.',
  },
];

export const mockLetters: LetterView[] = [
  {
    arc: 'pippa-quill',
    from: 'Pippa Quill',
    residentId: a!,
    text: 'Dear neighbors,\nI have moved into the end cottage with a crate of springs and a head full of ideas.\nPlease ignore any small explosions.',
    tick: DAY + 1200,
    step: -1,
  },
  {
    arc: 'pippa-quill',
    from: 'Pippa Quill',
    residentId: a!,
    text: 'Dear neighbors,\nThe river could be doing so much more than looking pretty.\nPut a sawpit near it and I will show you.',
    tick: 2 * DAY + 800,
    step: 1,
  },
];

export const mockVillageResidentDetail: ResidentDetail = {
  ...residentDetail(s, a!)!,
  story: mockStories[0]!,
};

export const mockVillageBuildingDetail: BuildingDetail = buildingDetail(s, fixture.b.bakery)!;
export const mockGrownBuildingDetail: BuildingDetail = buildingDetail(s, fixture.b.grown)!;

/** The whole village snapshot (with the history above), for the live-fixture overlay and stories. */
export const mockVillageView: ViewSnapshot = view;

/** I2 (C4F): inspect answers from the fixture itself, with the story character's detail on top. */
export function villageInspect(kind: InspectKind, id: number): InspectResult {
  if (kind === 'resident' && id === a) return mockVillageResidentDetail;
  return inspect(s, kind, id);
}
