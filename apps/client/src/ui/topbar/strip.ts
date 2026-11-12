// Pure readings for the Ledger's top bar strip: what each bar, chip and pip says. The components
// only draw these, so the words and numbers are tested here.
import { content } from '@qoti/content';
import type { BalanceLine, BalancesView, DemandBarView, DemandKind } from '@qoti/sim';
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
  /** The number beside the bar. */
  days: string;
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

/** What one family's chip draws and says. Materials hold units beyond site needs, not days. */
export function chipReading(line: BalanceLine): ChipReading {
  const days = coverDays(line);
  const isMaterials = line.family === 'materials';
  const onOffer = line.flavors.filter((f) => f.onOffer);
  const name = FAMILY_LABEL[line.family];
  const hold = isMaterials
    ? `holding ${line.reserve} beyond what sites need`
    : `holding ${dayWord(line.reserve)}`;
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
    `The carrier: ${RULE_LABEL[line.rule]}${line.rule === 'never' ? '' : `, ${hold}`}.`,
  ].join(' ');
  return {
    days: coverNumber(line),
    fill: clamp01(days / COVER_FULL_DAYS),
    reserveAt: isMaterials ? null : clamp01(line.reserve / COVER_FULL_DAYS),
    markAt: line.mark === null ? null : clamp01(line.mark / COVER_FULL_DAYS),
    low: isMaterials ? days < 1 : days < line.reserve,
    pips: line.flavors.map((f) => f.onOffer),
    title,
  };
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
