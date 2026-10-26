// Panel registry: one line per panel, in alphabetical order by id. Side 'book' panels open from
// their lens's toolbar, one at a time; 'overlay' panels draw over everything (the away letter);
// 'world' panels [I2] draw on the valley under every other panel (the blueprint layer).
import type { ValleyMode } from '@qoti/content';
import type { Lens } from '@qoti/sim';
import type { FunctionComponent } from 'preact';
import type { Session } from '../../app/session';
import { Blueprints } from '../Blueprints';
import { Minimap } from '../Minimap';
import { AchievementsPanel } from './Achievements';
import { AlertsPanel } from './Alerts';
import { AwayLetterPanel } from './AwayLetter';
import { CharterPanel } from './Charter';
import { ChroniclePanel } from './Chronicle';
import { CustomizePanel } from './Customize';
import { InspectorPanel } from './Inspector';
import { LettersPanel } from './Letters';
import { MarketPanel } from './Market';
import { NotebookPanel } from './Notebook';
import { NotesPanel } from './Notes';
import { PatternBookPanel } from './PatternBook';
import { PlansPanel } from './Plans';
import { PoliciesPanel } from './Policies';
import { RankUpPanel } from './RankUp';
import { ReportsPanel } from './Reports';
import { RequestsPanel } from './Requests';
import { StoryLetterPanel } from './StoryLetter';
import { TradePanel } from './Trade';
import { WishesPanel } from './Wishes';

export interface PanelDef {
  id: string;
  side: 'left' | 'right' | 'book' | 'overlay' | 'world';
  component: FunctionComponent<{ session: Session }>;
  // I1 (C3E): book panels get a toolbar button in their lens.
  /** I2 (C4F): 'shared' books show in both lenses. A book without a lens has no toolbar button. */
  lens?: Lens | 'shared';
  label?: string;
  icon?: string;
  /** Keyboard shortcut that opens and closes it. */
  key?: string;
  /** Valley modes that offer it (default both). */
  modes?: readonly ValleyMode[];
  /** Position among the lens's book buttons, lowest first. */
  order?: number;
  /** Centered and wider than the side column (the Pattern Book spread). */
  wide?: boolean;
  /** I2 (C4F): opens from somewhere other than the toolbar (the top bar, a tool), so no button. */
  hidden?: boolean;
}

const STANDARD = ['standard'] as const;

// prettier-ignore
export const panels: readonly PanelDef[] = [
  { id: 'achievements', side: 'book', component: AchievementsPanel, lens: 'hearth', label: 'Plaques', icon: 'achievements', modes: STANDARD, order: 40 },
  { id: 'alerts', side: 'left', component: AlertsPanel },
  { id: 'away', side: 'overlay', component: AwayLetterPanel },
  { id: 'blueprints', side: 'world', component: Blueprints },
  { id: 'charter', side: 'book', component: CharterPanel, lens: 'shared', label: 'Charter', icon: 'charter', key: 'h', modes: STANDARD, hidden: true },
  { id: 'chronicle', side: 'book', component: ChroniclePanel, lens: 'hearth', label: 'Chronicle', icon: 'chronicle', key: 'c', modes: STANDARD, order: 30 },
  { id: 'customize', side: 'right', component: CustomizePanel },
  { id: 'inspector', side: 'right', component: InspectorPanel },
  { id: 'letters', side: 'book', component: LettersPanel, lens: 'hearth', label: 'Letters', icon: 'letter', key: 'o', modes: STANDARD, order: 35 },
  { id: 'market', side: 'book', component: MarketPanel, lens: 'ledger', label: 'Market', icon: 'market', key: 'm', modes: STANDARD, order: 10 },
  { id: 'minimap', side: 'overlay', component: Minimap },
  { id: 'notebook', side: 'book', component: NotebookPanel, lens: 'shared', label: 'Notebook', icon: 'notebook', key: 'n', modes: STANDARD, order: 60 },
  { id: 'notes', side: 'left', component: NotesPanel },
  { id: 'patterns', side: 'book', component: PatternBookPanel, lens: 'hearth', label: 'Patterns', icon: 'patterns', key: 'b', modes: STANDARD, order: 20, wide: true },
  { id: 'plans', side: 'book', component: PlansPanel, lens: 'shared', label: 'Plans', icon: 'plan', hidden: true },
  { id: 'policies', side: 'book', component: PoliciesPanel, lens: 'ledger', label: 'Policies', icon: 'policies', key: 'p', modes: STANDARD, order: 30 },
  { id: 'rankup', side: 'overlay', component: RankUpPanel },
  { id: 'reports', side: 'book', component: ReportsPanel, lens: 'ledger', label: 'Reports', icon: 'reports', key: 'l', modes: STANDARD, order: 50 },
  { id: 'requests', side: 'left', component: RequestsPanel },
  { id: 'story-letter', side: 'overlay', component: StoryLetterPanel },
  { id: 'trade', side: 'book', component: TradePanel, lens: 'ledger', label: 'Trade', icon: 'trade', modes: STANDARD, order: 20 },
  { id: 'wishes', side: 'book', component: WishesPanel, lens: 'hearth', label: 'Wishes', icon: 'wishes', key: 'j', modes: STANDARD, order: 10 },
];

/** Book panels with a toolbar button for a lens in a valley mode, in toolbar order. */
export function booksFor(lens: Lens, mode: ValleyMode): PanelDef[] {
  return panels
    .filter((p) => p.side === 'book' && !p.hidden && (p.lens === lens || p.lens === 'shared'))
    .filter((p) => !p.modes || p.modes.includes(mode))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/** Opens a book panel, or closes it when it is already open. */
export function toggleBook(session: Session, id: string): void {
  const ui = session.ui;
  ui.panel.value = ui.panel.value === id ? null : id;
  if (ui.panel.value !== 'wishes' && ui.wishFocus.value !== null) {
    ui.wishFocus.value = null;
    session.render?.highlight?.(null);
  }
}
