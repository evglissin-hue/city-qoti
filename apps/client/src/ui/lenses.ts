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
  { id: 'hearth', label: 'Hearth', accent: '#c8693a', blurb: 'Homes, decor and nature' },
  { id: 'ledger', label: 'Ledger', accent: '#4f8a5b', blurb: 'Roads, storage and trade' },
];

export function toolsForLens(tools: readonly Tool[], lens: Lens): Tool[] {
  return tools.filter((t) => t.lane === 'shared' || t.lane === lens);
}
