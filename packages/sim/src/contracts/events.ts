// I0 contract (docs/spec/20-architecture.md). Additive changes only during parallel waves.
import type { RejectReason } from './commands';
import type { EntityId, LayerName, Rect, SeatId } from './ids';
import type { ValleySettings } from './settings';
import type {
  AchievementView,
  BudgetView,
  BuildingView,
  CharterView,
  ChronicleEntryView,
  ClockView,
  DecorView,
  HouseholdView,
  InnovationView,
  LetterView,
  LeversView,
  LifeEventKind,
  LoansView,
  LotView,
  MarketView,
  NoteView,
  PatternView,
  PlanView,
  RequestView,
  ResidentView,
  SeatView,
  StocksView,
  StoryView,
  TownView,
  TradeView,
  WishView,
} from './views';
import type { RankId } from './village';

export type SimEvent =
  | { e: 'tiles.changed'; rect: Rect; layers: LayerName[] }
  | { e: 'building.added'; b: BuildingView }
  | { e: 'building.updated'; b: BuildingView }
  | { e: 'building.removed'; id: EntityId }
  | { e: 'decor.added'; d: DecorView }
  | { e: 'decor.removed'; id: EntityId }
  | { e: 'note.added'; n: NoteView }
  | { e: 'note.removed'; id: EntityId }
  | { e: 'seat.updated'; s: SeatView }
  | { e: 'settings.updated'; settings: ValleySettings }
  /** On speed change and each in-game hour. */
  | { e: 'clock'; c: ClockView }
  | { e: 'command.rejected'; seat: SeatId; seq: number; reason: RejectReason; detail?: string }
  | { e: 'notify'; kind: string; text: string; seat?: SeatId; at?: [number, number] }
  // I1 (C3.0). Resident updates are coarse (home, job, tier, wish, mood band); detail comes from
  // the worker's inspect request.
  | { e: 'resident.added'; r: ResidentView }
  | { e: 'resident.updated'; r: ResidentView }
  | { e: 'resident.removed'; id: EntityId }
  | { e: 'household.added'; h: HouseholdView }
  | { e: 'household.updated'; h: HouseholdView }
  | { e: 'household.removed'; id: EntityId }
  /** Daily and when stock moves by a meaningful amount (at most hourly). */
  | { e: 'stocks.updated'; s: StocksView }
  | { e: 'budget.updated'; b: BudgetView }
  | { e: 'town.updated'; t: TownView }
  | { e: 'wish.added'; w: WishView }
  | { e: 'wish.granted'; id: EntityId; residentId: EntityId }
  | { e: 'wish.expired'; id: EntityId }
  | { e: 'pattern.discovered'; p: PatternView }
  | { e: 'pattern.siteAdded'; p: PatternView }
  | { e: 'pattern.siteRemoved'; p: PatternView }
  /** Hints and unlocks changed. */
  | { e: 'pattern.updated'; p: PatternView }
  | { e: 'chronicle.added'; c: ChronicleEntryView }
  | { e: 'achievement.unlocked'; a: AchievementView }
  // I2 (C4.0). docs/build/i2-wave-notes.md lists who emits each. Traffic, wear, lot and zone
  // tiles travel as layer patches (tiles.changed plus dirty chunks), never as events.
  /** Daily after the price pass, and when a lever changes prices. */
  | { e: 'market.updated'; m: MarketView }
  | { e: 'levers.updated'; l: LeversView }
  | { e: 'loans.updated'; l: LoansView }
  /** Orders, caravans and the log. */
  | { e: 'trade.updated'; t: TradeView }
  | { e: 'lot.added'; l: LotView }
  | { e: 'lot.updated'; l: LotView }
  | { e: 'lot.removed'; id: EntityId }
  | { e: 'charter.updated'; c: CharterView }
  /** The rank-up moment (P40). */
  | { e: 'rank.up'; rank: RankId; text: string }
  | { e: 'innovation.updated'; i: InnovationView }
  | { e: 'innovation.unlocked'; i: InnovationView }
  | { e: 'plan.added'; p: PlanView }
  | { e: 'plan.updated'; p: PlanView }
  | { e: 'plan.removed'; id: EntityId }
  | { e: 'request.added'; r: RequestView }
  | { e: 'request.updated'; r: RequestView }
  /** A story arc moved on (arrival, a step done, the finale), with the letter to show. */
  | { e: 'story.step'; s: StoryView; letter: LetterView }
  /** Couples, weddings, births, apprenticeships, retiring, moving to the seaside. */
  | { e: 'life.event'; kind: LifeEventKind; residents: EntityId[]; text: string };

export interface LayerPatch {
  layer: LayerName;
  rect: Rect;
  /** Row-major copy of the rect, (x1 - x0 + 1) * (z1 - z0 + 1) entries. */
  data: Uint8Array | Int32Array;
}
