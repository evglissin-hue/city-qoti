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
import type {
  ChronicleSnapshot,
  CommissionView,
  DockView,
  FestivalResultView,
  FestivalView,
  FieldGuideEntryView,
  GuideView,
  RaidResultView,
  RaidView,
  RenownView,
  SeasonCardView,
  SeasonReportView,
  ThreatView,
  TrialView,
  WatchView,
  WeatherEventView,
  WeatherView,
} from './seasonViews';

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
  /** I3 (C5.0): notable entries carry a snapshot for the lowest connected seat's client to capture. */
  | { e: 'chronicle.added'; c: ChronicleEntryView; snapshot?: ChronicleSnapshot }
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
  | { e: 'life.event'; kind: LifeEventKind; residents: EntityId[]; text: string }
  // I3 (C5.0). docs/build/i3-wave-notes.md lists who emits each.
  /** The first evening of a season (00:02, C5A). */
  | { e: 'season.started'; c: SeasonCardView }
  /** The last evening of a season, after the festival (C5A composes view/season/). */
  | { e: 'season.report'; r: SeasonReportView }
  | { e: 'weather.updated'; w: WeatherView }
  | { e: 'event.forecast'; v: WeatherEventView }
  | { e: 'event.started'; v: WeatherEventView }
  | { e: 'event.ended'; v: WeatherEventView }
  | { e: 'festival.updated'; f: FestivalView }
  | { e: 'festival.started'; f: FestivalView }
  | { e: 'festival.ended'; r: FestivalResultView }
  /** Something that happens only while both seats are connected (the closing dance, fireworks). */
  | { e: 'together.moment'; kind: string }
  | { e: 'renown.updated'; r: RenownView }
  | { e: 'commission.added'; c: CommissionView }
  | { e: 'commission.updated'; c: CommissionView }
  | { e: 'commission.removed'; id: EntityId }
  | { e: 'dock.updated'; d: DockView }
  /** A first sighting: a new Field Guide page for both seats. */
  | { e: 'species.sighted'; s: FieldGuideEntryView }
  /** Habitat scores per chunk changed: [chunk index, six scores in HABITAT_IDS order]. */
  | { e: 'habitats.updated'; chunks: [chunk: number, scores: number[]][] }
  | { e: 'threat.updated'; t: ThreatView }
  | { e: 'watch.updated'; w: WatchView }
  | { e: 'raid.started'; r: RaidView }
  | { e: 'raid.updated'; r: RaidView }
  | { e: 'raid.ended'; r: RaidResultView }
  /** A raider was captured: either seat decides with bandit.decide. */
  | { e: 'bandit.captured'; id: EntityId; at: [number, number] }
  | { e: 'trial.updated'; t: TrialView }
  /** The first days guide moved on (C5H). */
  | { e: 'guide.step'; g: GuideView };

export interface LayerPatch {
  layer: LayerName;
  rect: Rect;
  /** Row-major copy of the rect, (x1 - x0 + 1) * (z1 - z0 + 1) entries. */
  data: Uint8Array | Int32Array;
}
