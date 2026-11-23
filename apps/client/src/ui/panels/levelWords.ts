// The road to the next level, in words: what a business needs to climb (and how far along it is),
// and what a home still wants for its next tier. Pure, so the inspectors only print the lines.
import { content, type TradeDef } from '@qoti/content';
import { LEVEL_DOWN_DAYS, LEVEL_UP_DAYS, SHOP_CUSTOMERS } from '@qoti/sim';
import type { BusinessView, ResidentDetail } from '@qoti/sim';
import { goodName } from '../format';
import { TIER_WORD } from '../hamlet';

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth'];

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function list(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What the next level asks of the ground: a lane or street at the door, or free Farmland for hands. */
function roomWords(trade: TradeDef, to: number): string {
  if (trade.zone === 'farms') {
    const added = trade.crew[to - 1]! - trade.crew[to - 2]!;
    const hands = added === 1 ? `a ${ORDINAL[trade.crew[to - 1]!] ?? 'new'} hand` : `${added} more hands`;
    return `free Farmland nearby for ${hands}`;
  }
  return `${to >= 3 ? 'a street' : 'a lane'} at the door`;
}

/**
 * One or two short sentences on a business's climb: the days so far, what a good day is, and the
 * room it wants. Null when the trade is unknown. Numbers come from the sim's own constants.
 */
export function nextLevelLine(
  view: Pick<BusinessView, 'level' | 'levelDays'>,
  trade: TradeDef | undefined,
): string | null {
  if (!trade) return null;
  const { level, levelDays } = view;
  if (levelDays < 0) {
    const left = Math.max(1, LEVEL_DOWN_DAYS + levelDays);
    return `A poor day: ${left} more in a row and it shrinks to level ${level - 1}.`;
  }
  if (level >= 3) return 'Level 3, the top of its trade.';
  // R3B: level 3 is held by a master of the trade on the crew; a trade whose masters bring no
  // level 3 tops out at 2.
  const masterLifts = content.masterByOf.get(trade.id)?.level3 === true;
  if (level >= 2 && !masterLifts) return 'Level 2, the top of its trade.';
  const to = level + 1;
  const so = levelDays > 0 ? `${levelDays} so far` : 'none yet';
  const head = `Level ${to} after ${plural(LEVEL_UP_DAYS, 'good day', 'good days')} running: ${so}.`;
  let good: string;
  if (trade.method) {
    const raw = trade.from.map((g) => goodName(g).toLowerCase());
    good = `A good day sells four fifths of what it makes${raw.length ? `, never runs short of ${list(raw)}` : ''}`;
  } else {
    good = `A good day brings ${plural(SHOP_CUSTOMERS[level - 1]!, 'customer', 'customers')}`;
  }
  const keeper = to >= 3 ? ', and a master of the trade on its crew' : '';
  return `${head} ${good}, with ${roomWords(trade, to)}${keeper}.`;
}

/**
 * A home's road to its next tier: "1 of 3 days toward a craftsfolk home. Still wants: ...". Null
 * when there is no progress to report (top tier, or nothing counting and nothing missing).
 */
export function homeProgressLine(p: ResidentDetail['tierProgress']): string | null {
  if (!p) return null;
  const word = `a ${(TIER_WORD[p.next] ?? p.next).toLowerCase()} home`;
  const wants = p.missing && p.missing.length > 0 ? p.missing.join(', ') : null;
  if (p.days > 0) {
    return `${p.days} of ${p.needed} days toward ${word}.${wants ? ` Still wants: ${wants}.` : ''}`;
  }
  return wants ? `Toward ${word}: still wants ${wants}.` : null;
}
