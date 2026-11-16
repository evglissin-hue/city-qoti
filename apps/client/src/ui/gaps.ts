// R2D: gaps in the left feed and as paper tags on the ground (docs/spec/19-evenings.md, Gaps). One
// line per open gap, in both lenses: what it reads like, and under it what would close it. A gap
// closed today shows once, quiet, crediting whoever built the piece that closed it.
import { MAP_SIZE, TICKS_PER_DAY, type GapView } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import type { Alert, AlertContext } from './alerts';
import { seatList } from './format';

/** A gap's tile as the ground point to center on (its middle). */
export function gapSpot(g: Pick<GapView, 'tile'>): { x: number; z: number } {
  return { x: (g.tile % MAP_SIZE) + 0.5, z: Math.floor(g.tile / MAP_SIZE) + 0.5 };
}

/** The ledger's gaps are about goods and takings (warm ink), the hearth's about evenings (rose). */
export function gapTone(g: Pick<GapView, 'lane'>): Alert['tone'] {
  return g.lane === 'ledger' ? 'warn' : 'news';
}

/** The words on a gap's tag: its text, kept short at a word. */
export function gapLabel(g: Pick<GapView, 'text'>, max = 30): string {
  const text = g.text.replace(/\.$/, '');
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 12 ? cut.slice(0, space) : cut).replace(/[ ,;:]+$/, '')}…`;
}

/** Both lenses' rows for the open gaps and the ones closed today. */
export function gapAlerts(m: Mirror, who: AlertContext): Alert[] {
  const view = m.gaps.value;
  if (!view) return [];
  const today = Math.floor(m.tick.value / TICKS_PER_DAY);
  const seats = m.seats.value;
  const out: Alert[] = [];
  const both = (a: Omit<Alert, 'lens'>): void => {
    out.push({ ...a, lens: 'hearth' }, { ...a, lens: 'ledger' });
  };
  for (const g of view.open) {
    const { x, z } = gapSpot(g);
    both({
      key: `gap-${g.id}`,
      tone: gapTone(g),
      icon: g.lane === 'ledger' ? 'market' : 'lantern',
      text: g.text,
      note: g.closes,
      title: `${g.text}\n${g.closes}`,
      action: { kind: 'place', x, z },
    });
  }
  for (const g of view.closed) {
    if (g.closedDay !== today) continue;
    const { x, z } = gapSpot(g);
    const by = g.closers?.length ? seatList(seats, g.closers, who.seat) : '';
    both({
      key: `gap-closed-${g.id}`,
      tone: 'quiet',
      icon: 'check',
      text: by ? `Closed by ${by}: ${g.text}` : `Closed: ${g.text}`,
      action: { kind: 'place', x, z },
    });
  }
  return out;
}
