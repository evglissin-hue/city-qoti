// R1 views (R1.0): demand bars, the five balances and the businesses. The builders moved to their
// owners' files on the wave's first day: view/balances.ts (R1A), view/demand.ts and
// view/businesses.ts (R1B). This file re-exports them. Views may use floats freely: nothing here
// feeds state.

export { balancesView } from './balances';
export { businessesView, businessView, isBusinessLike } from './businesses';
export { demandView, demandWhy } from './demand';
