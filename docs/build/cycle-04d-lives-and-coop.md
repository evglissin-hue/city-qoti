# C4D: Lives, story characters and co-op tools

**Iteration**: I2. **Wave**: parallel. **Branch**: `cycle/04d-lives-coop`.
**Depends on**: C4.0 merged. **Runs alongside**: C4A to C4C, C4E, C4F.

## Goal

Residents live whole lives (couples, weddings, births, apprenticeships, retiring, moving to the seaside), three story characters arrive with arcs that teach new systems, and the two players get the plans layer and requests that make the lanes need each other.

## Read

- `CLAUDE.md`, `docs/build/i2-wave-notes.md`, `docs/spec/20-architecture.md` (I2 contracts)
- `docs/spec/11-residents.md`: Ages and life events, Story characters
- `docs/spec/16-coop.md`: Plans, Requests; `docs/spec/15-progression.md`: Ranks and Charters (Village)

## You own

`systems/residents/**` (life events), `systems/stories/**`, `systems/plans/**`, `systems/requests/**`, `systems/charter/**`, story content (Pippa Quill, Odette Fenwick, Juniper Reed), the Village Charter, their tests.

## Tasks

1. Couples, weddings (on a festival date or a chosen day, with a Chronicle entry), births, apprenticeships with C4C's school, retiring, moving to the seaside.
2. Story arcs: arrival conditions, 4 to 6 steps with goals and rewards, letters that introduce systems (P6), finales.
3. Plans: ghost proposals (roads, zones, buildings, decor) with comment, tweak, approve; approving submits the real commands.
4. Requests between lanes, tracked, counting toward shared goals.
5. Village Charter goals with progress and the claim; rank-up moment (P40) without the I3 trial.
6. Moving a solo valley online (with C2C's import path: export, then open for two).

## Acceptance criteria

- [ ] Life events tested on the village fixture; nobody ever dies (P15 note in the spec).
- [ ] Each story arc can be completed in a fixture; letters render deterministic text.
- [ ] Plans and requests round trip through the sim and both clients (e2e with two browsers).
- [ ] Definition of done.

## Out of scope

Prices (C4A), zoning (C4B), chains (C4C), visuals (C4E), panels beyond their data (C4F).
