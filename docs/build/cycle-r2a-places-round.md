# R2A: Places and the round

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2a-places-round`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: xhigh.
**Depends on**: R2.0. **Runs alongside**: R2B to R2F, and V3's wave. **Ports**: client 5231, relay 8841.

## Goal

Folk have somewhere to go. The sim finds places hourly (pattern sites, sitting spots, porches, hosts), gives each seats, kinds, a draw and what it serves, and every young and adult resident plans an evening of one to three stops, walks the pleasant way, takes a seat or standing room and counts in the footfall layers. A town with no places stays in. Places and streets have names, and either seat may rename them.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md` (all of it: ownership, stand-ins, handshakes)
- `docs/spec/19-evenings.md`: The day in two acts (the clock is R2B's), Places, The round, Data and budgets, the R2 acceptance
- `docs/spec/12-hearth.md`: the [R2] note on Charm; the Pattern Book (sites, `Pattern` kinds)
- `docs/spec/11-residents.md`: the [R2] notes (the round, outings, traits and taste)
- `docs/spec/10-world-and-building.md`: Roads [R2] (street names), Decor [R2, R3] (`seats`)
- `docs/spec/20-architecture.md`: R2 contracts; `docs/spec/22-quality.md`: the R2 budgets

## You own

The R2A paths in `r2-wave-notes.md` (File ownership): new `packages/sim/src/systems/places/**` (the pass, seats, kinds, draw, serves, ids, names), `systems/residents/{outings,schedule,places,friends}.ts` (the planner grows out of `chooseLeisure`; `places.ts` keeps its door index), `systems/movement/{grid,factors,astar,paths}.ts` (the evening cost, footfall counting), `commands/place.ts`, the name half of `commands/road.ts` (`road.rename`; `road.setEvening` is R2B's), content `places.ts` (the draw table, taste tables), `view/places.ts`, and their tests (`test/r2a/**`).

## You can rely on

- R2.0's contracts and stand-ins: `Place`, `state.places`, the footfall layers, `Resident.round`, `places.updated`, the `round` RNG stream, `placesNear`, `recordVisit`, `eveningScore` stubs, `DecorDef.seats` data.
- The pattern pass and `outings.ts` as built; the walk grid's cached routes; charm.

## Tasks

1. **The place pass** (hourly with patterns, and after a Hearth command nearby): pattern sites; sitting spots (seat pieces in no site, grouped within 3 tiles, up to four); porches (2 seats, the street's charm as the draw); hosts (tavern 12, Bath House 8, Market Square and stalls, well, frozen ice, fire, the festival site on its night). Seats and standing room per `19-evenings.md`; kinds; shelter and warmth; what it serves (outlets with Treats within 3 tiles, from R2B's `outletsServing`); the draw by the table (charm up to 70, plus parts, winter penalty for open-air with no fire). Stable ids as R2.0 fixed them. Derived and rebuilt on load.
2. **The planner**: between 17:00 and 17:30 each young and adult resident plans at their own minute (builders and porters at 19:00): score every place in leisure radius (12; Curious 18; Homebody 6) by draw, taste, a friend going, distance, crowd and whim from the `round` stream; under 20 stays in; half take their second best first; a second and third stop within 8 tiles of the last. Shopping first when the pantry is low; the evening at a friend's home as a draw-30 stop; weather as built; children, elders and the unemployed as the spec says.
3. **Arriving**: seats on arrival, then standing room; a full place sends the latecomer to the next choice or home. A stop lasts about an hour; folk set off home at 21:00. Fill `Resident.round` with what happened at each stop (the draw as found, a friend met, standing) for R2B's score, and call `recordVisit`.
4. **Routes and footfall**: the evening cost on the walk grid (whole numbers, never under a tile's ordinary cost; pleasant tiles as they are, plain a quarter more, noise 3+ half more; evening streets via R2B's flag), fixed at 17:00 so cached routes survive lanterns and carts; each step adds to `footfallDay`, steps on the round to `footfallEve`; both halve at 04:00.
5. **Names**: a place is named for what stands there and the nearest family; street names generated from what stands on them; `place.rename` and `road.rename` handlers (validation, length, an empty name restores the generated one).
6. **The round on the ground**: `AgentView.pose` and `carry` set from the stop (the drawing is V3's; keep them in the view so it needs no sim change).
7. Tests: seats and draw by example for every place kind; a town with no places stays in; places fill to their room and no further; the second-best rule spreads arrivals; routes prefer the pleasant way within a quarter longer; footfall halving; names; a year hashes the same twice; the place pass under 1 ms an hour at Village scale and 3 ms at City, the planner under 0.4 ms a tick for 2,000 residents (bench lines in `tools/bench`, added by one line to R2E's scene list).

## Acceptance criteria

- [ ] Every R2A stand-in in the wave notes is gone (`grep -rn "R2 stand-in (R2A)"` is empty).
- [ ] On a fair evening in an autoplayed Village, every grown-up with a place in reach goes out and places fill to their room and no further; a town with no places stays in (headless tests).
- [ ] Footfall counts only steps on the way to or between stops for the evening layer; the walk home does not count.
- [ ] Routes: the same route on two consecutive evenings is not recomputed when only a lantern or a cart changed.
- [ ] Budgets above hold; hashes match in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

Buying Treats, the clock, the evenings need and tiers (R2B); gaps and the edition (R2C); every panel, overlay and card (R2D); advisors (R2E); lots (R2F); supplies and priorities (R3).

## Notes

- R2B's `outletsServing(place)` and `cafeTables(building)` are stubs until R2B lands; write against them (check against R1X's As built for the business fields they read).
- Distance is Manhattan, as `chooseLeisure` measures; do not search a route to choose.
- Do not edit `systems/market/**` or `systems/growth/**`; ask R2B in your PR.
