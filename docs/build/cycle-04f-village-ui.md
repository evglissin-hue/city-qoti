# C4F: Village UI

**Iteration**: I2. **Wave**: parallel. **Branch**: `cycle/04f-village-ui`.
**Depends on**: C4.0 merged. **Runs alongside**: C4A to C4E.

## Goal

Both lanes get the tools and pages the Village needs: zoning and lots, the market and trade pages, wages and taxes, loans, the Charter board, plans and requests, innovations, story letters, life events in the inspector, and a minimap.

## Read

- `CLAUDE.md`, `docs/build/i2-wave-notes.md`, `docs/spec/20-architecture.md` (I2 contracts, Client)
- `docs/spec/16-coop.md`: Lenses, Plans, Requests; `docs/spec/17-presentation.md`: UI, Accessibility
- `docs/spec/13-ledger.md`: Reports (I2), Levers (I2)

## You own

`apps/client/src/ui`, `apps/client/src/input`, `apps/client/src/state`, `apps/client/src/app`.

## Tasks

1. Ledger: zone painting tool with lot preview, market page (prices, history charts, profit per building), trade page (standing orders, caravans, neighbors), wages and taxes levers, loans.
2. Hearth: story letters (a proper letter view), couples and families in the resident inspector, district style picker (data from C4B and C4C).
3. Shared: Charter board with lane-tagged goals, plans layer (sketch, comment, approve), requests panel, innovations notebook, minimap (bottom right).
4. Alerts for prices, shortages by tier, story steps, requests addressed to you.
5. Keep the I1 look; screenshots of every new panel at 80%, 100% and 140%.

## Acceptance criteria

- [ ] Every panel works against mocks (component tests) and a live village (e2e smoke).
- [ ] Plans and requests round trip between two browsers (e2e, with C4D).
- [ ] Screenshots of every panel in the PR.
- [ ] Definition of done.

## Out of scope

Rendering (C4E), simulation (C4A to C4D).
