import { signal } from '@preact/signals';
import type {
  AwayLetter,
  FestivalResultView,
  LetterView,
  Lens,
  PlanItem,
  RaidResultView,
  RankId,
  SeasonCardView,
  SeasonReportView,
} from '@qoti/sim';
import type { Selection } from '../input/context';

export interface Toast {
  id: number;
  text: string;
  x: number;
  y: number;
}

export type Dialog =
  | { kind: 'confirm'; text: string; ok: string; cancel: string; resolve(v: boolean): void }
  | { kind: 'prompt'; title: string; placeholder: string; max: number; resolve(v: string | null): void };

/** A letter or notice from the valley (thank-you letters, farewells), kept for the feed. */
export interface Letter {
  key: number;
  kind: string;
  text: string;
  at?: [number, number];
  tick: number;
}

export type ReportTab = 'stocks' | 'workforce' | 'budget' | 'buildings';

// I2 (C4F)
export type MarketTab = 'prices' | 'profit';
export type TradeTab = 'neighbors' | 'log' | 'dock' | 'commissions';

/** A plan being sketched: commands the tools would have sent, kept here until proposed. */
export interface Sketch {
  items: PlanItem[];
  /** A plan being added to (its items come first), or null for a new one. */
  basedOn: number | null;
}

/** I3 (C5F): the almanac page on the desk: the card that opens a season or the report closing it. */
export type Almanac =
  { kind: 'card'; view: SeasonCardView } | { kind: 'report'; view: SeasonReportView; page: 0 | 1 };

/** I3 (C5F): the festival planner's working copy. */
export interface FestivalDraft {
  site: { rect: [number, number, number, number] } | { pattern: string; anchor: number } | null;
  menu: [good: string, qty: number][];
  twist: string;
  music: 'none' | 'resident' | 'bandstand';
}

export function createUiState() {
  return {
    lens: signal<Lens>('hearth'),
    selection: signal<Selection | null>(null),
    toasts: signal<Toast[]>([]),
    dialog: signal<Dialog | null>(null),
    inviteOpen: signal(false),
    notesOpen: signal(true),
    helpOpen: signal(false),
    emoteOpen: signal(false),
    /** Recent emotes from either seat, shown as small bubbles. */
    emotes: signal<{ key: number; seat: number; id: string }[]>([]),
    /** Partner cursors in world tiles, by seat, for name labels and off-screen arrows. */
    cursors: signal<Map<number, { x: number; z: number; tool?: string }>>(new Map()),
    settingsOpen: signal(false),
    // I1 (C3E)
    /** The open book panel (wishes, patterns, chronicle, achievements, reports); one at a time. */
    panel: signal<string | null>(null),
    reportTab: signal<ReportTab>('stocks'),
    /** R1C: the family the Balances book has open (a GoodFamily id), or null. */
    balancesFamily: signal<string | null>(null),
    /** The Pattern Book page on display (a pattern id), or null for the contents. */
    bookPage: signal<string | null>(null),
    /** Building being customized. */
    customize: signal<number | null>(null),
    /** The grain farm whose fields the field tool paints. */
    farm: signal<number | null>(null),
    /** Overlay shown by the lens toolbar toggles. */
    overlay: signal<string | null>(null),
    /** Resident the camera follows. */
    following: signal<number | null>(null),
    /** Wish whose target area is highlighted. */
    wishFocus: signal<number | null>(null),
    /** The while-you-were-away letter, while it is open. */
    letter: signal<AwayLetter | null>(null),
    /** Letters and notices that arrived this visit, newest last. */
    letters: signal<Letter[]>([]),
    /** Alert keys the player waved away. */
    dismissed: signal<ReadonlySet<string>>(new Set()),
    alertsOpen: signal(true),
    // I2 (C4F)
    marketTab: signal<MarketTab>('prices'),
    /** The good whose price history the market page draws large. */
    marketGood: signal<string | null>(null),
    tradeTab: signal<TradeTab>('neighbors'),
    /** The story letter on the desk, while it is open. */
    storyLetter: signal<LetterView | null>(null),
    /** Story letters already opened this visit (arc and step), so the feed stops waving them. */
    lettersRead: signal<ReadonlySet<string>>(new Set()),
    /** The plan being sketched (tools add to it instead of building), or null. */
    sketch: signal<Sketch | null>(null),
    /** The plan whose blueprint is drawn on the valley. */
    planFocus: signal<number | null>(null),
    /** The plans the blueprint layer draws: 'focus' (one), 'open' (every open plan) or none. */
    blueprints: signal<'focus' | 'open'>('focus'),
    /** The request form in the feed, while it is open. */
    asking: signal(false),
    requestsOpen: signal(true),
    minimapOpen: signal(true),
    /** The rank-up moment, while it is on screen. */
    rankUp: signal<{ rank: RankId; text: string } | null>(null),
    /** P1: the Village chapter card, while it is open. */
    chapter: signal(false),
    // I3 (C5F)
    /** The season card or the season report on the desk, while it is open. */
    almanac: signal<Almanac | null>(null),
    /** The raid's result card, while it is open. */
    raidCard: signal<RaidResultView | null>(null),
    /** The festival's result card, while it is open. */
    festivalCard: signal<FestivalResultView | null>(null),
    /** A quiet note while a together moment is on, or null. */
    together: signal<string | null>(null),
    /** Photo mode: the interface hidden, the camera free. */
    photo: signal(false),
    /** Field Guide page on display (a species id), or null for the contents. */
    guidePage: signal<string | null>(null),
    /** The festival planner's draft until it is sent. */
    festivalDraft: signal<FestivalDraft | null>(null),
    /** The Watch's guard points while they are being placed, before they are sent. */
    postureDraft: signal<[number, number][] | null>(null),
    /** Chronicle snapshots this device has fetched or taken: entry id to an object URL. */
    snapshots: signal<ReadonlyMap<number, string>>(new Map()),
  };
}

export type UiState = ReturnType<typeof createUiState>;
