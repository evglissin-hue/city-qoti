import { signal } from '@preact/signals';
import type { AwayLetter, LetterView, Lens, PlanItem, RankId } from '@qoti/sim';
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
export type TradeTab = 'neighbors' | 'orders' | 'caravans';

/** A plan being sketched: commands the tools would have sent, kept here until proposed. */
export interface Sketch {
  items: PlanItem[];
  /** A plan being added to (its items come first), or null for a new one. */
  basedOn: number | null;
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
    /** The Pattern Book page on display (a pattern id), or null for the contents. */
    bookPage: signal<string | null>(null),
    /** Building being customized. */
    customize: signal<number | null>(null),
    /** Farmhouse whose fields the field tool paints. */
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
  };
}

export type UiState = ReturnType<typeof createUiState>;
