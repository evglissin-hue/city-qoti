// What a demand bar says, in words: the brush cards of the Build picker read these (the top bar's
// bars say the same things in their hover text).
import type { DemandBarView } from '@qoti/sim';

/** The one sentence for a bar's state: lit (the town needs land), quiet with a lot waiting, or still. */
export function demandSentence(bar: DemandBarView | undefined, zoneName: string): string {
  if (!bar) return 'Quiet for now.';
  if (bar.lit) return `The town needs more ${zoneName} zoned.`;
  if (bar.value > 0 || bar.reasons.some((r) => r.code === 'lotWaiting'))
    return 'A lot is waiting, so growth is on its way.';
  return 'Quiet for now.';
}

/** Hover text: the sentence, then each reason the view worded. */
export function demandTitle(bar: DemandBarView | undefined, zoneName: string): string {
  return [`${zoneName}: ${demandSentence(bar, zoneName)}`, ...(bar?.why ?? [])].join(' ');
}
