# C4A: Market and money

**Iteration**: I2. **Wave**: parallel. **Branch**: `cycle/04a-market-money`.
**Depends on**: C4.0 merged. **Runs alongside**: C4B to C4F.

## Goal

Money circulates: workplaces pay wages, households buy from needs baskets at market prices that follow supply and demand, taxes return a share, and the only money entering or leaving the valley is trade, loans and the peddler's successor. The money invariant holds in every test.

## Read

- `CLAUDE.md`, `docs/build/i2-wave-notes.md`, `docs/spec/20-architecture.md` (I2 contracts)
- `docs/spec/13-ledger.md`: Market and prices, Budget, Trade, Levers (I2 rows), Reports (I2)

## You own

`packages/sim/src/systems/{market,trade,loans}/**`, changes to `systems/economy/**` for wages and taxes, needs baskets and neighbor content, their tests and economy scenarios in `tools/bench` (extend the autoplayer).

## Tasks

1. Wages per job tier from the treasury to households daily; the wage lever (80% to 120%).
2. Needs baskets per tier with substitution (Thrifty weighs price more); households buy with savings; unmet quantity lowers that need's satisfaction (C3A's needs read it).
3. Daily prices from demand and cover with the spec's multiplier curve and smoothing, clamped 0.4x to 3x.
4. Income tax lever (0% to 20%) replacing the I1 flat tax; price caps and subsidies per food.
5. Trading Post: Millhaven and Stonecross with regional prices (seasonal factor, drift, impact), buy 1.2x and sell 0.85x, standing orders and the daily caravan (carts from C4C). Retire the I1 peddler for valleys with a Trading Post.
6. Loans (County Bank) with interest per season and the credit limit.
7. Profit per building (report), price history views.

## Acceptance criteria

- [ ] Money invariant tested across a 10-day headless run with wages, purchases, taxes, trade and loans.
- [ ] Prices move as specified under shortage and glut (tests per curve point).
- [ ] The autoplayer reaches Village rank conditions within its target (with C4X) and never deadlocks on money.
- [ ] Bench: market pass under 2 ms per day at 150 residents.
- [ ] Definition of done.

## Out of scope

Zoning and growth (C4B), new chains and services (C4C), UI (C4F).
