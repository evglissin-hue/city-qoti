// Follow the thread's view (R3.0; R3D writes the body): one sentence of where a thing came from and
// where it goes, across both lanes, and the route's tiles for the highlight while it is open
// (docs/spec/17-presentation.md, Follow the thread). Read from the thread counts (state.threads), the
// flows, the places and the names; never from what moves between ticks. Pure.
import type { ThreadSubject, ThreadView, WorldState } from '../contracts';

/** The Thread for an inspector's subject, or null when the subject is gone. */
export function threadView(_state: WorldState, subject: ThreadSubject): ThreadView | null {
  // R3 stand-in (R3D): an honest line until the counts exist.
  return { subject, text: 'Nobody has followed this thread yet.', refs: [], route: [] };
}
