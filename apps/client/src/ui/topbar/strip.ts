// Pure readings for the Ledger's top bar strip: what each bar, chip and pip says. The components
// only draw these, so the words and numbers are tested here.
import { content } from '@qoti/content';
import type { BalanceLine, BalancesView, DemandBarView, DemandKind, RankId } from '@qoti/sim';
import type { HandsReading } from '../hands';
import type { SitesReading } from '../sites';
import { rankAtLeast } from '../village';
import { FAMILY_LABEL, RULE_LABEL } from './families';

/** Days of cover at which a chip's bar is full. */
export const COVER_FULL_DAYS = 10;

/** The zone brush each demand bar opens, and its word and one-letter label. */
export const DEMAND_BAR: Record<DemandKind, { zone: string; label: string; letter: string }> = {
  homes: { zone: 'homes-low', label: 'Homes', letter: 'H' },
  shops: { zone: 'shops', label: 'Shops', letter: 'S' },
  workshops: { zone: 'crafts', label: 'Workshops', letter: 'W' },
  farmland: { zone: 'farms', label: 'Farmland', letter: 'F' },
};

/** The hover text of a demand bar: a verdict, then each reason line. */
export function demandTitle(kind: DemandKind, bar: DemandBarView): string {
  const name = DEMAND_BAR[kind].label;
  const verdict = bar.lit
    ? `${name}: the town needs more ${name} zoned.`
    : bar.value > 0
      ? `${name}: a lot is waiting, so growth is on its way.`
      : `${name}: quiet for now.`;
  return [verdict, ...bar.why].join('\n');
}

export function dayWord(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/**
 * Days of cover, as the top bar and the Balances book both read it: a family the town holds but
 * does not use (no use yet) has plenty, so it reads as a full bar and "99+", never as none.
 */
export function coverDays(line: Pick<BalanceLine, 'cover' | 'use' | 'stock'>): number {
  if (line.use <= 0) return line.stock > 0 ? Infinity : 0;
  return Math.max(0, line.cover / 100);
}

/** Whole days of cover for the chip's number: "4", or "99+". */
export function coverNumber(line: Pick<BalanceLine, 'cover' | 'use' | 'stock'>): string {
  const days = Math.floor(coverDays(line));
  return days >= 99 ? '99+' : String(days);
}

export interface ChipReading {
  /** The family's name, shown on the chip. */
  label: string;
  /** The main figure: units in store, compact ("212", "1.2k"). */
  amount: string;
  /** Nothing in store: the figure is a plain warm "0". */
  empty: boolean;
  /** Days of cover as a small second figure ("3 days"); null for an empty store. */
  cover: string | null;
  /** The cover figure turns warm: under two days. */
  coverWarm: boolean;
  /** 0 to 1, how far the bar is filled (full at ten days). */
  fill: number;
  /** 0 to 1 tick positions; null when there is none to draw. */
  reserveAt: number | null;
  markAt: number | null;
  /** Under the reserve: the bar turns warm. */
  low: boolean;
  /** One entry per flavor, true when on offer. */
  pips: boolean[];
  title: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Units, compactly: "950", "1.2k", "12k", "1.1m". */
export function compact(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v < 1000) return String(v);
  const trim = (x: number) => (x >= 10 ? String(Math.floor(x)) : String(Math.floor(x * 10) / 10));
  if (v < 1_000_000) return `${trim(v / 1000)}k`;
  return `${trim(v / 1_000_000)}m`;
}

function carrierSentence(line: BalanceLine): string {
  const hold =
    line.family === 'materials'
      ? `holding ${line.reserve} beyond what sites need`
      : `holding ${dayWord(line.reserve)}`;
  return `The carrier: ${RULE_LABEL[line.rule]}${line.rule === 'never' ? '' : `, ${hold}`}.`;
}

/**
 * What one family's chip draws and says: units in store first, then days of cover as the small
 * second figure. Materials have their own chips (materialReadings).
 */
export function chipReading(line: BalanceLine): ChipReading {
  const days = coverDays(line);
  const onOffer = line.flavors.filter((f) => f.onOffer);
  const name = FAMILY_LABEL[line.family];
  const title = [
    days === Infinity
      ? `${name}: plenty, since nothing uses it yet.`
      : `${name}: ${dayWord(Math.floor(days))} of cover.`,
    `${line.stock} in store, ${line.use} used a day.`,
    `${onOffer.length} of ${line.flavors.length} ${line.flavors.length === 1 ? 'flavor' : 'flavors'} on offer${
      onOffer.length
        ? `: ${onOffer.map((f) => content.goodById.get(f.good)?.label ?? f.good).join(', ')}`
        : ''
    }.`,
    carrierSentence(line),
  ].join(' ');
  const empty = line.stock <= 0;
  const number = coverNumber(line);
  return {
    label: name,
    amount: compact(line.stock),
    empty,
    cover: empty ? null : `${number} ${number === '1' ? 'day' : 'days'}`,
    coverWarm: !empty && days < 2,
    pips: line.flavors.map((f) => f.onOffer),
    markAt: line.mark === null ? null : clamp01(line.mark / COVER_FULL_DAYS),
    fill: clamp01(days / COVER_FULL_DAYS),
    reserveAt: clamp01(line.reserve / COVER_FULL_DAYS),
    low: days < line.reserve,
    title,
  };
}

/** Building materials cannot stand in for each other: one chip each, in this order. */
export const MATERIAL_GOODS = ['timber', 'stone', 'brick'] as const;

const MATERIAL_LABEL: Record<(typeof MATERIAL_GOODS)[number], string> = {
  timber: 'Timber',
  stone: 'Stone',
  brick: 'Brick',
};

export interface MaterialReading {
  good: string;
  label: string;
  /** Units in store, compact: the main figure. */
  amount: string;
  /** Short of what open sites still need: "6 of 42" (in store, still to deliver); otherwise null. */
  of: string | null;
  /** Nothing in store, or short of what sites need: drawn in the warm style. */
  warm: boolean;
  /** 0 to 1: the share of the need the store covers; a calm full bar when nothing is short. */
  fill: number;
  title: string;
}

export interface MaterialInputs {
  /** The Materials balance line (for the carrier sentence and as a stock fallback). */
  line: BalanceLine;
  sites?: Pick<SitesReading, 'goods'>;
  /** Units in store per good, from the stocks view. */
  stockOf?: (good: string) => number | undefined;
  /** The town's rank, for Brick's appearance rule. */
  rank?: RankId;
}

/** The materials in play: Timber and Stone always; Brick once held, needed by a site, or at Village. */
export function materialReadings(inp: MaterialInputs): MaterialReading[] {
  const out: MaterialReading[] = [];
  for (const good of MATERIAL_GOODS) {
    const need = inp.sites?.goods.find((g) => g.good === good)?.need ?? 0;
    const stock = inp.stockOf?.(good) ?? inp.line.flavors.find((f) => f.good === good)?.stock ?? 0;
    if (good === 'brick' && stock <= 0 && need <= 0 && !rankAtLeast(inp.rank, 'village')) continue;
    const label = MATERIAL_LABEL[good];
    const short = need > stock;
    const sites = need > 0 ? `Open sites still need ${need}.` : 'No open site waits on it.';
    out.push({
      good,
      label,
      amount: compact(stock),
      of: short ? `${compact(stock)} of ${compact(need)}` : null,
      warm: short || stock <= 0,
      fill: short ? clamp01(stock / need) : 1,
      title: `${label}: ${stock} in store. ${sites} ${carrierSentence(inp.line)}`,
    });
  }
  return out;
}

export interface FolkReading {
  /** Residents in town, compact: the main figure. */
  amount: string;
  /** "5 jobs open", or null when no job stands open. */
  jobs: string | null;
  /** Workplaces stand with nobody at all: the jobs figure is warm. */
  warm: boolean;
  title: string;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The Folk chip: residents as the figure, open jobs beside it, and the hover in words. */
export function folkReading(
  hands: Pick<HandsReading, 'folk' | 'working' | 'openJobs'> & { empty: readonly unknown[] },
  households: number,
): FolkReading {
  const { folk, working, openJobs } = hands;
  const nobody = hands.empty.length;
  const jobs = openJobs > 0 ? `${openJobs} ${openJobs === 1 ? 'job' : 'jobs'} open` : null;
  let title: string;
  if (folk === 0) {
    title = 'Nobody has moved in yet: families walk in from the valley gate once there are Homes.';
  } else {
    const parts = [`${folk} folk in ${count(households, 'household', 'households')}, ${working} at work.`];
    parts.push(
      openJobs > 0
        ? `${count(openJobs, 'job stands', 'jobs stand')} open${
            nobody > 0 ? `, ${count(nobody, 'workplace', 'workplaces')} with nobody yet` : ''
          }.`
        : 'No job stands open.',
    );
    if (openJobs > 0) parts.push('More Homes bring more folk.');
    title = parts.join(' ');
  }
  return { amount: compact(folk), jobs, warm: nobody > 0, title };
}

export interface WinterReading {
  /** Families that have reached their mark, and how many carry one. */
  atMark: number;
  marked: number;
  fill: number;
  title: string;
}

/** The winter reserve bar: null until some line carries a mark (Summer day 4 to the thaw). */
export function winterReading(b: BalancesView): WinterReading | null {
  const marked = b.lines.filter((l) => l.mark !== null);
  if (marked.length === 0) return null;
  const atMark = marked.filter((l) => l.cover / 100 >= (l.mark ?? 0)).length;
  const parts = marked.map((l) => `${FAMILY_LABEL[l.family]} ${Math.floor(l.cover / 100)} of ${l.mark} days`);
  return {
    atMark,
    marked: marked.length,
    fill: atMark / marked.length,
    title: `Put by for winter: ${parts.join(', ')}.`,
  };
}

// --- R2D: the Hearth's strip ---------------------------------------------------------------------

export interface EveningReading {
  /** "27 of 40 out". */
  out: string;
  /** The average evening in a word. */
  word: string;
  /** The average evening, 0 to 1, for the small bar. */
  fill: number;
  title: string;
}

/**
 * An evening's score runs 0 to 100 and staying in is worth 20 (19-evenings.md); 50, 65 and 80 are
 * what Craftsfolk, Merchants and Patrons ask of their grown-ups, so the words turn there.
 */
export function eveningWord(average: number): string {
  if (average < 35) return 'quiet';
  if (average < 50) return 'modest';
  if (average < 65) return 'fair';
  if (average < 80) return 'lively';
  return 'merry';
}

/** The tier marks an evening's average is read against, for the chip's title. */
const EVENING_ASKS = 'Craftsfolk want 50, Merchants 65, Patrons 80.';

/**
 * The evenings chip, or null when no evening has been tallied yet (nothing to say). R2X: while the
 * evening is under way (`live`) it counts tonight so far and says "so far": an evening is scored at
 * 21:00, and an unscored one once read "quiet" all evening however full the benches were.
 */
export function eveningReading(
  e: { out: number; grownups: number; average: number; live?: boolean } | undefined,
): EveningReading | null {
  if (!e || e.grownups <= 0) return null;
  const word = eveningWord(e.average);
  if (e.live) {
    const last = e.average > 0 ? ` Last evening was ${word} (${Math.round(e.average)} out of 100).` : '';
    return {
      out: `${e.out} of ${e.grownups} out`,
      word: 'so far',
      fill: Math.max(0, Math.min(1, e.average / 100)),
      title:
        `Tonight so far ${e.out} of ${e.grownups} grown-ups are out. The evening is scored at 21:00, ` +
        `as folk head home.${last} ${EVENING_ASKS} Click for the Chronicle.`,
    };
  }
  return {
    out: `${e.out} of ${e.grownups} out`,
    word,
    fill: Math.max(0, Math.min(1, e.average / 100)),
    title:
      `Last evening ${e.out} of ${e.grownups} grown-ups went out, and the average evening was ${word} ` +
      `(${Math.round(e.average)} out of 100). ${EVENING_ASKS} Click for the Chronicle.`,
  };
}

/** The gaps chip, or null with none open. */
export function gapsReading(
  open: readonly { text: string }[] | undefined,
): { label: string; title: string } | null {
  if (!open?.length) return null;
  return {
    label: `${open.length} ${open.length === 1 ? 'gap' : 'gaps'} open`,
    title: `${open.map((g) => g.text).join('\n')}\nClick to see the first.`,
  };
}
