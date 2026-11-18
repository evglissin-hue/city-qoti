// R3H: the Ledger hears when a specialized building climbs a level or slides back. The sim writes a
// Chronicle entry for each; the last day's are lines here, several of a kind folded into one.
import { TICKS_PER_DAY } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import type { Alert } from './alerts';

const NUMBER_WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

const KINDS = [
  { kind: 'specialized-grew', tone: 'news', icon: 'market', verb: 'grew a level' },
  { kind: 'specialized-shrank', tone: 'warn', icon: 'status', verb: 'slipped back a level' },
] as const;

export function specializedLevelAlerts(m: Mirror): Alert[] {
  const out: Alert[] = [];
  const now = m.tick.value;
  for (const { kind, tone, icon, verb } of KINDS) {
    const entries = m.chronicle.value.filter((e) => e.kind === kind && now - e.tick < TICKS_PER_DAY);
    if (entries.length === 0) continue;
    const last = entries[entries.length - 1]!;
    const id = last.refs[0];
    const action: Alert['action'] = id === undefined ? undefined : { kind: 'building', id };
    if (entries.length === 1) {
      out.push({ key: `${kind}:${last.id}`, lens: 'ledger', tone, icon, text: last.text, action });
      continue;
    }
    const n = entries.length;
    out.push({
      key: `${kind}:${last.id}:${n}`,
      lens: 'ledger',
      tone,
      icon,
      text: `${NUMBER_WORD[n] ?? String(n)} of the town's buildings ${verb} today.`,
      title: entries.map((e) => e.text).join(' '),
      action,
    });
  }
  return out;
}
