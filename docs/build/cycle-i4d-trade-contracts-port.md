# I4D: Trade contracts and Port Amberly

**Iteration**: I4 Town, wave one. **Wave**: parallel. **Branch**: `cycle/i4d-trade-port`, from `cycle/i4x-integration`; PR into `cycle/i4x-integration`. **Recommended effort**: high.
**Depends on**: I4.0. **Runs alongside**: I4A to I4C, I4E to I4H, V5A, V5B. **Ports**: client 5274, relay 8884.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

A Town trades further and plans ahead. Each season a neighbor offers contracts (the archive's "deliver 200 wool by Autumn day 5 at 3 coins each"): accepted, the town delivers by the deadline for the price, which rewards planning; short, it pays a fee and loses renown, which is the risk (P31). And Port Amberly, the coast town, opens to the Town: it sells flavors no neighbor in the valley does (tea above all) and buys the town's luxuries, so the Merchants' third Treat can come by trade and a master's good has a buyer far away. Both are new money over the valley's edge, so both are measured before they are tuned.

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (Rulings; Lessons, the money; File ownership I4D; the order of a day)
- `docs/spec/13-ledger.md`: Goods (later flavors), The carrier and trade (with R1A's and R1X's As built), Population tiers; `docs/spec/archive/13-ledger-chains.md`: Trade (neighbors, contracts, the River Dock and commissions as built)
- `docs/spec/15-progression.md`: Renown, Achievements (Contract Kept), the City Charter's "3 contracts kept"; `docs/spec/19-evenings.md`: Masters (masters' goods, none sold by a neighbor)
- `docs/spec/20-architecture.md`: I4 contracts; `tools/bench/src/debt.ts` (how debt is read)

## You own

The I4D paths in the wave notes: a new `packages/sim/src/systems/contracts/**`, `systems/carrier/**`, `systems/trade/**`, `systems/dock/**`, `view/contracts.ts`, the I4 lines of `view/balances.ts`, the `contractsKept` body; content `contracts.ts`, `neighbors.ts`, the numbers of tea and any other traded flavor in `goods.ts`; tests `packages/sim/test/i4d/**`.

## You can rely on

- I4.0: `ContractsState`, `contract.accept` and `contract.decline` (validate and store), `ContractTuning`, `ContractView`, `contracts.updated`, the `contracts` system (83), the `contractsKept` count stubbed, Port Amberly in `neighbors.ts` (not reachable), tea appended, Stonecross's coal line, `neighborReachable` stubbed false and wired into the carrier, the dock and Balances.
- R1A's carrier (rules, reserves, the budget, the County tab, terms by what stands; R1X's load each way and selling at the door first), C5B's River Dock boat and commissions (offers only what the town can meet, deadlines, closing when held), the archive's regional prices and drift (by hash, no stream), R3C's `specialtyGood` (a specialty sells at a neighbor's full price), renown (`addRenown`).

## Tasks

1. **Contracts** (`systems/contracts/**`): from Town rank, offers on days 1 and 4 of a season (as commissions; proposed, R3X draft), two open at most, each a neighbor, a good the town makes, an amount, a price a unit and a deadline (numbers and ranges in `contracts.ts`; amounts sized to what the town made last season). Only what the town can meet is offered, as commissions are. An offer waits 3 days; accepted, the carrier takes the goods with its loads toward the amount (proposed, R3X draft: what stands above the family's reserve, within the load, paid on delivery as exports); at 23:50 on the deadline the remainder is judged: kept (renown, the count) or short (a fee for what is missing, renown off; `15-progression.md` counts kept contracts toward the City). Never what a festival has put by, never under a winter mark.
2. **Port Amberly** (the archive: a coast town that sells tea, salt and fish and buys luxuries): reachable from Town rank (`neighborReachable`); proposed (R3X draft), by the River Dock's boat on its own longer trip, not by the cart; its list in `neighbors.ts` (tea at least; whatever else the master rules) with the regional price, drift and impact as the other neighbors; it buys masters' goods and specialties (the "luxuries") at its prices, so a master's good finally has a buyer outside the valley. A frozen river holds the boat, as now.
3. **The carrier and the Balances book**: coal from Stonecross as any Fuel good (I4B owns why the steam mill wants it); contract loads beside the day's buying and selling; Port Amberly's flavors among what the carrier may bring for a tier that lacks a flavor (R1A's variety first); Balances' lines for Port Amberly's flavors and contract loads, and the carried columns as before.
4. **Deals** (R1A): Port Amberly may offer a season's deal like Millhaven and Stonecross (proposed, R3X draft), on its own families.
5. **Money, measured**: every contract payment, fee and Port Amberly trade books as exports or imports with the invariant intact; with I4H, add `debt.ts` categories for contracts and Port Amberly and report debt per resident against R3X's figure on every bench seed. Report what contracts and the port add to a Town's season, and whether a short contract can push a Town past its credit line (it must not take the County tab: proposed, R3X draft, fees from coins in hand, else owed as a loan).
6. **Tests**: offers only for goods the town makes; an accepted contract delivers with the cart's loads and pays; a short contract charges its fee and renown and nothing else; nothing under a mark or put by for a festival leaves; Port Amberly unreachable before Town rank and reachable after, by the boat, held by ice; its tea reaches a shelf and counts for variety; a master's good sells there; the money invariant through every case; `contractsKept` counts; a year hashes the same twice.

## Acceptance criteria

- [ ] `grep -rn "I4 stand-in (I4D)" packages apps tools --exclude-dir=dist` is empty; Contract Kept has a setup in `hearth/achievements.test.ts` and leaves `PENDING`.
- [ ] A headless Town is offered contracts it can meet, keeps one and misses one with the fee and renown as specified; Port Amberly's tea reaches a Merchants household's variety in a bench Town.
- [ ] Debt per resident on every bench seed is reported beside R3X's with the new categories; the carrier stays under its 0.5 ms a day; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

The contracts card and the Balances lines on screen (I4G); barges and canals (wave two); advisors that accept contracts (I4H); masters' goods themselves (R3B's, as built).

## Notes

- Open: Port Amberly's route and list (I4.0 settles with the master): the boat (proposed) or the cart; tea's family (proposed, R3X draft: Treats); salt fits no family (drop it unless the master finds one); a Wares flavor would help the Patrons in I5.
- Open: whether contracts name a good or a family (commissions name goods; the zones-first Ledger reads families). Proposed (R3X draft): a good, from what the town made last season, since a contract is a promise about stock.
- Open: whether a contract's goods may be bought by the carrier from another neighbor to fill it (arbitrage). Proposed (R3X draft): no, only what the town holds.
- Choose offers by hash of the seed, the day and the neighbor, as drift is chosen; no RNG stream (the wave notes).
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
