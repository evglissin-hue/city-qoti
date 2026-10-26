// Lens toolbar registry: one line per lens, in alphabetical order. Each lens shows its own
// tools plus the shared ones; Tab switches lenses.
import type { Lens } from '@qoti/sim';
import type { Tool } from '../input/tool';

export interface LensDef {
  id: Lens;
  label: string;
  accent: string;
  blurb: string;
}

// prettier-ignore
export const lenses: readonly LensDef[] = [
  { id: 'hearth', label: 'Hearth', accent: '#7f9c6c', blurb: 'Homes, decor and nature' },
  { id: 'ledger', label: 'Ledger', accent: '#c48a3f', blurb: 'Roads, storage and trade' },
];

export function toolsForLens(tools: readonly Tool[], lens: Lens): Tool[] {
  return tools.filter((t) => t.lane === 'shared' || t.lane === lens);
}

/** I1 (C3E): overlay toggles in each lens's toolbar (render OverlayKind ids), alphabetical. */
export interface OverlayDef {
  id: string;
  lens: Lens;
  label: string;
  icon: string;
  hint: string;
}

// prettier-ignore
export const overlays: readonly OverlayDef[] = [
  { id: 'charm', lens: 'hearth', label: 'Charm', icon: 'charm', hint: 'Where the valley feels lovely, and where it could' },
  { id: 'coverage', lens: 'ledger', label: 'Wells', icon: 'coverage', hint: 'Which homes a well reaches' },
  { id: 'flows', lens: 'ledger', label: 'Flows', icon: 'flows', hint: 'Where the porters carry things' },
  { id: 'status', lens: 'ledger', label: 'Status', icon: 'status', hint: 'Buildings that want attention' },
];
