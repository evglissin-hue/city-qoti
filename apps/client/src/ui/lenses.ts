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
  /** I2 (C4E): shown from the Village rank on (zones, lots, traffic and the like). */
  village?: boolean;
}

// prettier-ignore
export const overlays: readonly OverlayDef[] = [
  { id: 'charm', lens: 'hearth', label: 'Charm', icon: 'charm', hint: 'Where the valley feels lovely, and where it could' },
  { id: 'coverage', lens: 'ledger', label: 'Wells', icon: 'coverage', hint: 'Which homes a well reaches' },
  { id: 'flows', lens: 'ledger', label: 'Flows', icon: 'flows', hint: 'Where the porters carry things' },
  { id: 'land', lens: 'ledger', label: 'Land value', icon: 'land', hint: 'Which lots folk would most like to live on', village: true },
  { id: 'needs', lens: 'ledger', label: 'Needs', icon: 'needs', hint: 'How content each home is, ringed by its tier', village: true },
  { id: 'resources', lens: 'ledger', label: 'Soil and stone', icon: 'land', hint: 'Rich soil, clay and stone across the valley (the Ledger shows it until you pick another)' },
  { id: 'status', lens: 'ledger', label: 'Status', icon: 'status', hint: 'Buildings that want attention' },
  { id: 'traffic', lens: 'ledger', label: 'Traffic', icon: 'traffic', hint: 'Where the carts crowd the roads', village: true },
  { id: 'zones', lens: 'ledger', label: 'Zones', icon: 'zones', hint: 'Zoned land and the lots cut from it', village: true },
];
