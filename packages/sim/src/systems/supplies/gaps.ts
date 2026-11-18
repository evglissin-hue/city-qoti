// The fourth gap's rule (R3A; docs/spec/19-evenings.md, Gaps: a place short of supplies): opens when a
// place's pieces rested two nights running, closes when it was supplied two nights running. The gaps
// pass (systems/gaps/index.ts) calls keepSupplyGaps at 21:10 on a fair evening from Village rank,
// after R2's three rules, with the same pass and achievable check; credit as the R3 wave notes rule
// (the seat whose priority or carrier switch was set last while the gap was open).
import type { GapKind } from '@qoti/content';
import type { GapPass } from '../gaps/rules';

/** Reads the fourth gap's rule over the evening just closed. */
export function keepSupplyGaps(_pass: GapPass, _achievable: (kind: GapKind) => boolean): void {
  // R3 stand-in (R3A): the fourth gap never opens.
}
