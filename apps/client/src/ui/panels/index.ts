// Panel registry: one line per panel, in alphabetical order by id.
import type { FunctionComponent } from 'preact';
import type { Session } from '../../app/session';
import { InspectorPanel } from './Inspector';
import { NotesPanel } from './Notes';

export interface PanelDef {
  id: string;
  side: 'left' | 'right';
  component: FunctionComponent<{ session: Session }>;
}

// prettier-ignore
export const panels: readonly PanelDef[] = [
  { id: 'inspector', side: 'right', component: InspectorPanel },
  { id: 'notes', side: 'left', component: NotesPanel },
];
