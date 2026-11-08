// The length of a production cycle, shared with the view builders (a leaf module, so views can
// import it without pulling in the systems). Work is counted in percent-worker-ticks.
import type { ProductionMethod } from '@qoti/content';
import { TICKS_PER_HOUR } from '../../constants';

/** Work for one cycle: `hours` of the full crew at 100%, or of one worker for per-worker methods. */
export function cycleWork(method: ProductionMethod): number {
  return method.hours * TICKS_PER_HOUR * 100 * (method.perWorker ? 1 : Math.max(1, method.workers));
}
