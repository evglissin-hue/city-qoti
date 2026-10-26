// The Chronicle system: the founding entry on a standard valley's first tick, the season summary
// as each season ends (at midnight, after the economy has closed the season's books) and the
// weekly wishes digest every seventh evening at 19:00. Other entries arrive through chronicle()
// from the systems that witness them.
import { chroniclePhrases, content } from '@qoti/content';
import {
  HOURS_PER_DAY,
  LEDGER_CATEGORIES,
  PENNIES_PER_COIN,
  SEASON_NAMES,
  START_HOUR,
  TICKS_PER_HOUR,
} from '../../constants';
import type { LedgerPeriod, System, TickCtx, WorldState } from '../../contracts';
import { findById } from '../../state/entities';
import { isStandard } from '../../state/hamlet';
import { calendar } from '../clock/calendar';
import { chronicle as write, writeFounding } from './api';
import { fill, listJoin, numberWord, pick } from './text';

export const DIGEST_HOUR = 19;
export const DIGEST_EVERY_DAYS = 7;
/** Examples named in a digest; the rest are "more besides". */
const DIGEST_EXAMPLES = 3;

export const chronicle: System = {
  id: 'chronicle',
  order: 100,
  every: TICKS_PER_HOUR,
  tick(state, ctx) {
    if (!isStandard(state)) return;
    const t = state.tick - 1;
    if (t === 0 && !state.chronicle.some((c) => c.kind === 'founding')) writeFounding(state, ctx);
    const total = Math.floor(t / TICKS_PER_HOUR) + START_HOUR;
    const hour = total % HOURS_PER_DAY;
    const day = Math.floor(total / HOURS_PER_DAY);
    if (hour === 0 && t > 0 && calendar(t).day === 1) writeSeasonSummary(state, ctx, t);
    if (hour === DIGEST_HOUR && day % DIGEST_EVERY_DAYS === DIGEST_EVERY_DAYS - 1) writeDigest(state, ctx);
  },
};

function moneyBalance(p: LedgerPeriod | null): number | null {
  if (!p) return null;
  let income = 0;
  let expense = 0;
  for (let i = 0; i < LEDGER_CATEGORIES.length; i++) {
    const v = p.money[i] ?? 0;
    if (LEDGER_CATEGORIES[i]!.kind === 'income') income += v;
    else expense += v;
  }
  return income === 0 && expense === 0 ? null : income - expense;
}

/** "no wishes", "one page", "nine residents", "40 residents". */
function counted(n: number, one: string, many: string): string {
  return `${numberWord(n)} ${n === 1 ? one : many}`;
}

/** The season that just ended, summed up. `t` is the first tick of the new season. */
export function writeSeasonSummary(state: WorldState, ctx: TickCtx, t: number): void {
  const ended = calendar(t - 1);
  const balance = moneyBalance(state.economy.lastSeason);
  const books =
    balance === null
      ? pick(ctx, chroniclePhrases.booksQuiet)
      : pick(ctx, balance > 0 ? chroniclePhrases.booksSurplus : chroniclePhrases.booksDeficit);
  write(state, ctx, 'season-summary', {
    text: [
      ['season', SEASON_NAMES[ended.season]],
      ['year', String(ended.year)],
      ['people', counted(state.residents.length, 'resident', 'residents')],
      ['coins', String(Math.floor(state.economy.treasury / PENNIES_PER_COIN))],
      ['pages', counted(state.hearth.discovered.length, 'page', 'pages')],
      ['wishes', counted(state.stats.wishesGranted, 'wish', 'wishes')],
      ['books', books],
    ],
    seats: [...state.time.connected],
  });
}

/** The week's granted wishes in one entry; nothing when no wish came true. */
export function writeDigest(state: WorldState, ctx: TickCtx): void {
  const list = state.stats.digest;
  if (list.length === 0) return;
  const examples: string[] = [];
  const refs: number[] = [];
  for (const [residentId, template] of list) {
    if (examples.length >= DIGEST_EXAMPLES) break;
    const r = findById(state.residents, residentId);
    const t = content.wishById.get(template);
    if (!r || !t?.digest?.length) continue;
    examples.push(
      fill(pick(ctx, t.digest), [
        ['name', r.given],
        ['family', r.family],
      ]),
    );
    refs.push(residentId);
  }
  if (examples.length === 0) {
    // Everyone it would name has left the valley; the week passes unremarked.
    list.length = 0;
    return;
  }
  if (list.length > examples.length) examples.push(pick(ctx, chroniclePhrases.digestMore));
  const n = list.length;
  write(state, ctx, 'wishes-digest', {
    text: [
      ['wishes', counted(n, 'wish', 'wishes')],
      ['examples', listJoin(examples)],
    ],
    refs,
  });
  list.length = 0;
}
