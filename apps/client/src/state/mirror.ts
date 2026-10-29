import { signal } from '@preact/signals';
import {
  DecorGrid,
  defaultSettings,
  doorFront,
  inBounds,
  reachesTile,
  townReach,
  townSources,
  type Rot4,
  INT32_LAYERS,
  LAYER_NAMES,
  MAP_SIZE,
  pasteRect,
  type AchievementView,
  type ChronicleSnapshot,
  type CommissionView,
  type DockView,
  type FestivalResultView,
  type FestivalView,
  type FieldGuideEntryView,
  type GuideView,
  type RaidResultView,
  type RaidView,
  type RenownView,
  type SeasonCardView,
  type SeasonReportView,
  type ThreatView,
  type TrialView,
  type WatchView,
  type WeatherView,
  type BudgetView,
  type CharterView,
  type InnovationView,
  type LetterView,
  type LeversView,
  type LifeEventKind,
  type LoansView,
  type LotView,
  type MarketView,
  type PlanView,
  type RankId,
  type RequestView,
  type StoryView,
  type TradeView,
  type BuildingView,
  type ChronicleEntryView,
  type ClockView,
  type HouseholdView,
  type PatternView,
  type ResidentView,
  type StocksView,
  type TownView,
  type WishView,
  type DecorView,
  type EntityId,
  type LayerName,
  type MapReader,
  type NoteView,
  type Rect,
  type RejectReason,
  type SeatView,
  type ValleySettings,
  type ViewSnapshot,
  type WorldMeta,
} from '@qoti/sim';
import type { WorkerUpdate } from '../worker/host';

export interface Rejection {
  seat: number;
  seq: number;
  reason: RejectReason;
  detail?: string;
}

/** What changed in one update, so the renderer and UI touch only what they must. */
export interface MirrorChange {
  /** Changed rects per layer (chunk rects from LayerPatches). */
  rects: Map<LayerName, Rect[]>;
  buildings: boolean;
  decor: boolean;
  notes: boolean;
  seats: boolean;
  rejections: Rejection[];
  /** Entities that appeared in this update, as 'building:12' style keys. */
  added: string[];
  full: boolean;
  // I1 (C3.0)
  residents: boolean;
  households: boolean;
  wishes: boolean;
  patterns: boolean;
  /** Wishes granted in this update (residentId), for hops and letters. */
  granted: { id: number; residentId: number }[];
  /** Notify events in this update (letters, thanks, farewells). */
  notices: { kind: string; text: string; seat?: number; at?: [number, number] }[];
  // I2 (C4.0)
  /** Lots, plans, requests, innovations or stories changed. */
  village: boolean;
  /** Story letters that arrived in this update. */
  letters: LetterView[];
  /** Life events in this update (couples, weddings, births...). */
  life: { kind: LifeEventKind; residents: EntityId[]; text: string }[];
  /** The rank-up moment, when it happened in this update. */
  rankUp: { rank: RankId; text: string } | null;
  // I3 (C5.0)
  /** Any I3 signal or map changed (weather, festival, renown, the Watch...). */
  seasons: boolean;
  /** Notable Chronicle entries to photograph (the lowest connected seat captures, C5E and C5F). */
  snapshots: { id: EntityId; snapshot: ChronicleSnapshot }[];
  /** Together moments in this update (the closing dance, fireworks). */
  together: string[];
  /** First sightings in this update. */
  sightings: FieldGuideEntryView[];
  /** Raiders captured in this update, waiting for bandit.decide. */
  captures: { id: EntityId; at: [number, number] }[];
  /** The season card or report, when one arrived in this update. */
  seasonCard: SeasonCardView | null;
  seasonReport: SeasonReportView | null;
  /** A raid ended in this update. */
  raidResult: RaidResultView | null;
}

/** I1 (C3.0): the latest agent frames, for interpolation between turns. */
export interface AgentFrames {
  /** Previous and latest frame (stride AGENT_STRIDE) and when each arrived (performance.now()). */
  prev: Float32Array;
  prevAt: number;
  latest: Float32Array;
  latestAt: number;
  /** Turn of the latest frame. */
  t: number;
}

function emptyChange(full = false): MirrorChange {
  return {
    rects: new Map(),
    buildings: full,
    decor: full,
    notes: full,
    seats: full,
    rejections: [],
    added: [],
    full,
    residents: full,
    households: full,
    wishes: full,
    patterns: full,
    granted: [],
    notices: [],
    village: full,
    letters: [],
    life: [],
    rankUp: null,
    seasons: full,
    snapshots: [],
    together: [],
    sightings: [],
    captures: [],
    seasonCard: null,
    seasonReport: null,
    raidResult: null,
  };
}

const EMPTY_FRAME = new Float32Array(0);

const START_CLOCK: ClockView = { tick: 0, speed: 0, year: 1, season: 0, day: 1, hour: 6, minute: 0 };

/**
 * The client's copy of the view: layers patched by LayerPatch, entity maps, seats, clock and a
 * decor spatial hash. Implements MapReader so the client runs the sim's placement rules on it.
 */
export class Mirror implements MapReader {
  readonly size = MAP_SIZE;
  layers = {} as Record<LayerName, Uint8Array | Int32Array>;
  readonly buildings = new Map<EntityId, BuildingView>();
  readonly decor = new Map<EntityId, DecorView>();
  readonly notes = new Map<EntityId, NoteView>();
  private grid = new DecorGrid<DecorView>(MAP_SIZE);
  meta: WorldMeta = { startArea: [0, 0, 0, 0], valleyGate: [0, 0], flow: 'ns' };
  simVersion = '';

  readonly clock = signal<ClockView>(START_CLOCK);
  readonly tick = signal(0);
  readonly lastTurn = signal(0);
  readonly seats = signal<SeatView[]>([]);
  readonly settings = signal<ValleySettings>(defaultSettings());
  /** Bumps whenever entities change, for UI lists. */
  readonly revision = signal(0);
  // I1 (C3.0): hamlet state, kept from the snapshot and I1 events.
  readonly residents = new Map<EntityId, ResidentView>();
  readonly households = new Map<EntityId, HouseholdView>();
  readonly wishes = new Map<EntityId, WishView>();
  readonly patterns = new Map<string, PatternView>();
  readonly achievements = new Map<string, AchievementView>();
  readonly chronicle = signal<ChronicleEntryView[]>([]);
  readonly stocks = signal<StocksView | null>(null);
  readonly budget = signal<BudgetView | null>(null);
  readonly town = signal<TownView | null>(null);
  /** Bumps whenever residents, households, wishes, patterns or achievements change. */
  readonly hamletRevision = signal(0);
  // I2 (C4.0): village state, kept from the snapshot and I2 events.
  readonly market = signal<MarketView | null>(null);
  readonly levers = signal<LeversView | null>(null);
  readonly loans = signal<LoansView | null>(null);
  readonly trade = signal<TradeView | null>(null);
  readonly charter = signal<CharterView | null>(null);
  readonly lots = new Map<EntityId, LotView>();
  readonly innovations = new Map<string, InnovationView>();
  readonly plans = new Map<EntityId, PlanView>();
  readonly requests = new Map<EntityId, RequestView>();
  readonly stories = new Map<string, StoryView>();
  /** Story letters received this session, oldest first (the story panel keeps the rest in state). */
  readonly letters = signal<LetterView[]>([]);
  /** Bumps whenever lots, plans, requests, innovations or stories change. */
  readonly villageRevision = signal(0);
  // I3 (C5.0): seasons and the Watch, kept from the snapshot and I3 events.
  readonly seasonCard = signal<SeasonCardView | null>(null);
  readonly seasonReport = signal<SeasonReportView | null>(null);
  readonly weather = signal<WeatherView | null>(null);
  readonly festival = signal<FestivalView | null>(null);
  readonly festivalResult = signal<FestivalResultView | null>(null);
  readonly renown = signal<RenownView | null>(null);
  readonly commissions = new Map<EntityId, CommissionView>();
  readonly dock = signal<DockView | null>(null);
  readonly fieldGuide = new Map<string, FieldGuideEntryView>();
  /** Habitat scores per chunk (six, in HABITAT_IDS order), from habitats.updated. */
  readonly habitats = new Map<number, number[]>();
  readonly threat = signal<ThreatView | null>(null);
  readonly watch = signal<WatchView | null>(null);
  readonly raid = signal<RaidView | null>(null);
  readonly raidResult = signal<RaidResultView | null>(null);
  readonly trial = signal<TrialView | null>(null);
  readonly guide = signal<GuideView | null>(null);
  /** Bumps whenever commissions, the Field Guide or habitats change. */
  readonly seasonsRevision = signal(0);
  agents: AgentFrames = { prev: EMPTY_FRAME, prevAt: 0, latest: EMPTY_FRAME, latestAt: 0, t: 0 };
  /** Bumps on every layer patch and snapshot, for caches derived from the map (the town's reach). */
  layerRevision = 0;
  private reachCache: { rev: number; buildings: number; reach: Uint8Array } | null = null;
  private readonly listeners: ((c: MirrorChange) => void)[] = [];

  constructor() {
    for (const name of LAYER_NAMES) {
      this.layers[name] = INT32_LAYERS.has(name)
        ? new Int32Array(MAP_SIZE * MAP_SIZE)
        : new Uint8Array(MAP_SIZE * MAP_SIZE);
    }
  }

  onChange(cb: (c: MirrorChange) => void): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private emit(change: MirrorChange): void {
    for (const cb of this.listeners) cb(change);
  }

  load(view: ViewSnapshot): void {
    for (const name of LAYER_NAMES) this.layers[name] = view.layers[name];
    this.layerRevision++;
    this.buildings.clear();
    this.decor.clear();
    this.notes.clear();
    this.grid = new DecorGrid<DecorView>(MAP_SIZE);
    for (const b of view.buildings) this.buildings.set(b.id, b);
    for (const d of view.decor) {
      this.decor.set(d.id, d);
      this.grid.add(d);
    }
    for (const n of view.notes) this.notes.set(n.id, n);
    this.meta = view.meta;
    this.simVersion = view.simVersion;
    this.seats.value = view.seats;
    this.settings.value = view.settings;
    this.clock.value = view.clock;
    this.tick.value = view.clock.tick;
    this.lastTurn.value = view.lastTurn;
    this.residents.clear();
    this.households.clear();
    this.wishes.clear();
    this.patterns.clear();
    this.achievements.clear();
    for (const r of view.residents ?? []) this.residents.set(r.id, r);
    for (const h of view.households ?? []) this.households.set(h.id, h);
    for (const w of view.wishes ?? []) this.wishes.set(w.id, w);
    for (const p of view.patterns ?? []) this.patterns.set(p.id, p);
    for (const a of view.achievements ?? []) this.achievements.set(a.id, a);
    this.chronicle.value = view.chronicle ?? [];
    this.stocks.value = view.stocks ?? null;
    this.budget.value = view.budget ?? null;
    this.town.value = view.town ?? null;
    this.market.value = view.market ?? null;
    this.levers.value = view.levers ?? null;
    this.loans.value = view.loans ?? null;
    this.trade.value = view.trade ?? null;
    this.charter.value = view.charter ?? null;
    this.lots.clear();
    this.innovations.clear();
    this.plans.clear();
    this.requests.clear();
    this.stories.clear();
    for (const l of view.lots ?? []) this.lots.set(l.id, l);
    for (const i of view.innovations ?? []) this.innovations.set(i.id, i);
    for (const p of view.plans ?? []) this.plans.set(p.id, p);
    for (const r of view.requests ?? []) this.requests.set(r.id, r);
    for (const st of view.stories ?? []) this.stories.set(st.arc, st);
    this.villageRevision.value++;
    this.seasonCard.value = view.seasonCard ?? null;
    this.weather.value = view.weather ?? null;
    this.festival.value = view.festival ?? null;
    this.festivalResult.value = view.festivalResult ?? null;
    this.renown.value = view.renown ?? null;
    this.dock.value = view.dock ?? null;
    this.threat.value = view.threat ?? null;
    this.watch.value = view.watch ?? null;
    this.raid.value = view.raid ?? null;
    this.trial.value = view.trial ?? null;
    this.guide.value = view.guide ?? null;
    this.commissions.clear();
    this.fieldGuide.clear();
    this.habitats.clear();
    for (const c of view.commissions ?? []) this.commissions.set(c.id, c);
    for (const g of view.fieldGuide ?? []) this.fieldGuide.set(g.species, g);
    this.seasonsRevision.value++;
    this.agents = { prev: EMPTY_FRAME, prevAt: 0, latest: EMPTY_FRAME, latestAt: 0, t: view.lastTurn };
    this.revision.value++;
    this.hamletRevision.value++;
    this.emit(emptyChange(true));
  }

  /** I1: a new agent frame from the worker. `now` is performance.now() on arrival. */
  applyAgents(t: number, data: Float32Array, now: number): void {
    this.agents = { prev: this.agents.latest, prevAt: this.agents.latestAt, latest: data, latestAt: now, t };
  }

  apply(u: WorkerUpdate): MirrorChange {
    const change = emptyChange();
    if (u.patches.length) this.layerRevision++;
    for (const p of u.patches) {
      pasteRect(this.layers[p.layer], p.rect, p.data);
      const list = change.rects.get(p.layer) ?? [];
      list.push(p.rect);
      change.rects.set(p.layer, list);
    }
    let seats: SeatView[] | null = null;
    for (const e of u.events) {
      switch (e.e) {
        case 'building.added':
        case 'building.updated':
          if (e.e === 'building.added') change.added.push(`building:${e.b.id}`);
          this.buildings.set(e.b.id, e.b);
          change.buildings = true;
          break;
        case 'building.removed':
          this.buildings.delete(e.id);
          change.buildings = true;
          break;
        case 'decor.added':
          this.decor.set(e.d.id, e.d);
          this.grid.add(e.d);
          change.decor = true;
          change.added.push(`decor:${e.d.id}`);
          break;
        case 'decor.removed': {
          const d = this.decor.get(e.id);
          if (d) this.grid.remove(d);
          this.decor.delete(e.id);
          change.decor = true;
          break;
        }
        case 'note.added':
          this.notes.set(e.n.id, e.n);
          change.notes = true;
          change.added.push(`note:${e.n.id}`);
          break;
        case 'note.removed':
          this.notes.delete(e.id);
          change.notes = true;
          break;
        case 'seat.updated': {
          seats ??= [...this.seats.value];
          const i = seats.findIndex((s) => s.seat === e.s.seat);
          if (i >= 0) seats[i] = e.s;
          else seats.push(e.s);
          seats.sort((a, b) => a.seat - b.seat);
          change.seats = true;
          break;
        }
        case 'settings.updated':
          this.settings.value = e.settings;
          break;
        case 'clock':
          this.clock.value = e.c;
          break;
        case 'command.rejected':
          change.rejections.push(
            e.detail === undefined
              ? { seat: e.seat, seq: e.seq, reason: e.reason }
              : { seat: e.seat, seq: e.seq, reason: e.reason, detail: e.detail },
          );
          break;
        case 'notify':
          change.notices.push(
            e.seat === undefined && e.at === undefined
              ? { kind: e.kind, text: e.text }
              : {
                  kind: e.kind,
                  text: e.text,
                  ...(e.seat !== undefined && { seat: e.seat }),
                  ...(e.at && { at: e.at }),
                },
          );
          break;
        case 'resident.added':
        case 'resident.updated':
          this.residents.set(e.r.id, e.r);
          change.residents = true;
          if (e.e === 'resident.added') change.added.push(`resident:${e.r.id}`);
          break;
        case 'resident.removed':
          this.residents.delete(e.id);
          change.residents = true;
          break;
        case 'household.added':
        case 'household.updated':
          this.households.set(e.h.id, e.h);
          change.households = true;
          break;
        case 'household.removed':
          this.households.delete(e.id);
          change.households = true;
          break;
        case 'stocks.updated':
          this.stocks.value = e.s;
          break;
        case 'budget.updated':
          this.budget.value = e.b;
          break;
        case 'town.updated':
          this.town.value = e.t;
          break;
        case 'wish.added':
          this.wishes.set(e.w.id, e.w);
          change.wishes = true;
          break;
        case 'wish.granted':
          this.wishes.delete(e.id);
          change.wishes = true;
          change.granted.push({ id: e.id, residentId: e.residentId });
          break;
        case 'wish.expired':
          this.wishes.delete(e.id);
          change.wishes = true;
          break;
        case 'pattern.discovered':
        case 'pattern.siteAdded':
        case 'pattern.siteRemoved':
        case 'pattern.updated':
          this.patterns.set(e.p.id, e.p);
          change.patterns = true;
          break;
        case 'chronicle.added':
          this.chronicle.value = [...this.chronicle.value, e.c];
          if (e.snapshot) change.snapshots.push({ id: e.c.id, snapshot: e.snapshot });
          break;
        case 'achievement.unlocked':
          this.achievements.set(e.a.id, e.a);
          change.patterns = true;
          break;
        case 'tiles.changed':
          break;
        // I2 (C4.0)
        case 'market.updated':
          this.market.value = e.m;
          break;
        case 'levers.updated':
          this.levers.value = e.l;
          break;
        case 'loans.updated':
          this.loans.value = e.l;
          break;
        case 'trade.updated':
          this.trade.value = e.t;
          break;
        case 'charter.updated':
          this.charter.value = e.c;
          break;
        case 'rank.up':
          change.rankUp = { rank: e.rank, text: e.text };
          break;
        case 'lot.added':
        case 'lot.updated':
          this.lots.set(e.l.id, e.l);
          change.village = true;
          break;
        case 'lot.removed':
          this.lots.delete(e.id);
          change.village = true;
          break;
        case 'innovation.updated':
        case 'innovation.unlocked':
          this.innovations.set(e.i.id, e.i);
          change.village = true;
          break;
        case 'plan.added':
        case 'plan.updated':
          this.plans.set(e.p.id, e.p);
          change.village = true;
          break;
        case 'plan.removed':
          this.plans.delete(e.id);
          change.village = true;
          break;
        case 'request.added':
        case 'request.updated':
          this.requests.set(e.r.id, e.r);
          change.village = true;
          break;
        case 'story.step':
          this.stories.set(e.s.arc, e.s);
          this.letters.value = [...this.letters.value, e.letter];
          change.letters.push(e.letter);
          change.village = true;
          break;
        case 'life.event':
          change.life.push({ kind: e.kind, residents: e.residents, text: e.text });
          break;
        // I3 (C5.0)
        case 'season.started':
          this.seasonCard.value = e.c;
          this.weather.value = e.c.weather;
          this.threat.value = e.c.threat;
          change.seasonCard = e.c;
          change.seasons = true;
          break;
        case 'season.report':
          this.seasonReport.value = e.r;
          change.seasonReport = e.r;
          change.seasons = true;
          break;
        case 'weather.updated':
          this.weather.value = e.w;
          change.seasons = true;
          break;
        case 'event.forecast':
        case 'event.started':
        case 'event.ended': {
          const w = this.weather.value;
          if (w) {
            const events = w.events.filter((v) => v.id !== e.v.id);
            if (e.e !== 'event.ended') events.push(e.v);
            events.sort((a, b) => a.start - b.start || a.id - b.id);
            this.weather.value = { ...w, events };
          }
          change.seasons = true;
          break;
        }
        case 'festival.updated':
        case 'festival.started':
          this.festival.value = e.f;
          change.seasons = true;
          break;
        case 'festival.ended':
          this.festivalResult.value = e.r;
          change.seasons = true;
          break;
        case 'together.moment':
          change.together.push(e.kind);
          break;
        case 'renown.updated':
          this.renown.value = e.r;
          change.seasons = true;
          break;
        case 'commission.added':
        case 'commission.updated':
          this.commissions.set(e.c.id, e.c);
          change.seasons = true;
          break;
        case 'commission.removed':
          this.commissions.delete(e.id);
          change.seasons = true;
          break;
        case 'dock.updated':
          this.dock.value = e.d;
          change.seasons = true;
          break;
        case 'species.sighted':
          this.fieldGuide.set(e.s.species, e.s);
          change.sightings.push(e.s);
          change.seasons = true;
          break;
        case 'habitats.updated':
          for (const [chunk, scores] of e.chunks) this.habitats.set(chunk, scores);
          change.seasons = true;
          break;
        case 'threat.updated':
          this.threat.value = e.t;
          change.seasons = true;
          break;
        case 'watch.updated':
          this.watch.value = e.w;
          change.seasons = true;
          break;
        case 'raid.started':
        case 'raid.updated':
          this.raid.value = e.r;
          change.seasons = true;
          break;
        case 'raid.ended':
          this.raid.value = null;
          this.raidResult.value = e.r;
          change.raidResult = e.r;
          change.seasons = true;
          break;
        case 'bandit.captured':
          change.captures.push({ id: e.id, at: e.at });
          break;
        case 'trial.updated':
          this.trial.value = e.t;
          change.seasons = true;
          break;
        case 'guide.step':
          this.guide.value = e.g;
          change.seasons = true;
          break;
      }
    }
    if (change.residents || change.households || change.wishes || change.patterns) {
      this.hamletRevision.value++;
    }
    if (change.village) this.villageRevision.value++;
    if (change.seasons) this.seasonsRevision.value++;
    if (seats) this.seats.value = seats;
    if (u.tick !== undefined) this.tick.value = u.tick;
    this.lastTurn.value = u.t;
    if (change.buildings || change.decor || change.notes) this.revision.value++;
    this.emit(change);
    return change;
  }

  /** Effective speed right now (the minimum desired speed over connected seats). */
  get speed(): number {
    return this.clock.value.speed;
  }

  treeCount(): number {
    let n = 0;
    for (const v of this.layers.tree) if (v) n++;
    return n;
  }

  roadCount(): number {
    let n = 0;
    for (const v of this.layers.road) if (v) n++;
    return n;
  }

  private read(name: LayerName, x: number, z: number): number {
    return inBounds(x, z, MAP_SIZE) ? this.layers[name][z * MAP_SIZE + x]! : 0;
  }

  height(x: number, z: number): number {
    return this.read('height', x, z);
  }
  terrain(x: number, z: number): number {
    return this.read('terrain', x, z);
  }
  water(x: number, z: number): number {
    return this.read('water', x, z);
  }
  road(x: number, z: number): number {
    return this.read('road', x, z);
  }
  tree(x: number, z: number): number {
    return this.read('tree', x, z);
  }
  /** Growth stage of the tree on a tile: 0 sapling to 3 mature (0 when there is no tree). */
  treeStage(x: number, z: number): number {
    return this.read('tree', x, z) & 7;
  }
  occupant(x: number, z: number): number {
    return this.read('occupant', x, z);
  }
  deposit(x: number, z: number): number {
    return this.read('deposit', x, z);
  }
  fertility(x: number, z: number): number {
    return this.read('fertility', x, z);
  }
  /** I1: charm 0..100 on a tile (or one of its categories). */
  charm(x: number, z: number, layer: LayerName = 'charm'): number {
    return this.read(layer, x, z);
  }
  parcelUnlocked(x: number, z: number): boolean {
    return inBounds(x, z, MAP_SIZE);
  }
  /**
   * Playtest round three: true when the town can walk to this door (the sim refuses sites it
   * cannot, as CUT_OFF). The flood is cached until the map or the buildings change.
   */
  townReaches(b: { def: string; x: number; z: number; rot: Rot4 }): boolean {
    const n = this.buildings.size;
    if (!this.reachCache || this.reachCache.rev !== this.layerRevision || this.reachCache.buildings !== n) {
      const sources = townSources(this.buildings.values());
      this.reachCache = { rev: this.layerRevision, buildings: n, reach: townReach(this, sources) };
    }
    const reach = this.reachCache.reach;
    if (!reach.some((v) => v === 1)) return true;
    return reachesTile(reach, this, doorFront(b));
  }

  decorNear(fx: number, fz: number, radius: number): DecorView[] {
    return this.grid.near(fx, fz, radius);
  }
}
