// Panel registry: one line per panel, in alphabetical order by id. Side 'book' panels open from
// their lens's toolbar, one at a time; 'overlay' panels draw over everything (the away letter).
import type { ValleyMode } from '@qoti/content';
import type { Lens } from '@qoti/sim';
import type { FunctionComponent } from 'preact';
import type { Session } from '../../app/session';
import { AchievementsPanel } from './Achievements';
import { AlertsPanel } from './Alerts';
import { AwayLetterPanel } from './AwayLetter';
import { ChroniclePanel } from './Chronicle';
import { CustomizePanel } from './Customize';
import { InspectorPanel } from './Inspector';
import { NotesPanel } from './Notes';
import { PatternBookPanel } from './PatternBook';
import { ReportsPanel } from './Reports';
import { WishesPanel } from './Wishes';

export interface PanelDef {
  id: string;
  side: 'left' | 'right' | 'book' | 'overlay';
  component: FunctionComponent<{ session: Session }>;
  // I1 (C3E): book panels get a toolbar button in their lens.
  lens?: Lens;
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
}

const STANDARD = ['standard'] as const;

// prettier-ignore
export const panels: readonly PanelDef[] = [
  { id: 'achievements', side: 'book', component: AchievementsPanel, lens: 'hearth', label: 'Plaques', icon: 'achievements', modes: STANDARD, order: 40 },
  { id: 'alerts', side: 'left', component: AlertsPanel },
  { id: 'away', side: 'overlay', component: AwayLetterPanel },
  { id: 'chronicle', side: 'book', component: ChroniclePanel, lens: 'hearth', label: 'Chronicle', icon: 'chronicle', key: 'c', modes: STANDARD, order: 30 },
  { id: 'customize', side: 'right', component: CustomizePanel },
  { id: 'inspector', side: 'right', component: InspectorPanel },
  { id: 'notes', side: 'left', component: NotesPanel },
  { id: 'patterns', side: 'book', component: PatternBookPanel, lens: 'hearth', label: 'Pattern Book', icon: 'patterns', key: 'b', modes: STANDARD, order: 20, wide: true },
  { id: 'reports', side: 'book', component: ReportsPanel, lens: 'ledger', label: 'Reports', icon: 'reports', key: 'l', modes: STANDARD, order: 50 },
  { id: 'wishes', side: 'book', component: WishesPanel, lens: 'hearth', label: 'Wishes', icon: 'wishes', key: 'j', modes: STANDARD, order: 10 },
];

/** Book panels for a lens in a valley mode, in toolbar order. */
export function booksFor(lens: Lens, mode: ValleyMode): PanelDef[] {
  return panels
    .filter((p) => p.side === 'book' && p.lens === lens && (!p.modes || p.modes.includes(mode)))
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
