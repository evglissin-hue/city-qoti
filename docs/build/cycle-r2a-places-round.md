# R2A: Places and the round

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2a-places-round`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: xhigh.
**Depends on**: R2.0. **Runs alongside**: R2B to R2F, and V3's wave. **Ports**: client 5231, relay 8841.

## Goal

Folk have somewhere to go. The sim finds places (pattern sites, sitting spots, porches, hosts), gives each seats, standing room, kinds, a draw and its outlets, and every young and adult resident plans an evening of one to three stops, walks the pleasant way, takes a seat or standing room and counts in the footfall layers. A town with no places stays in. Places and streets have names, and either seat may rename them.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md` (all of it: ownership, stand-ins, handshakes, the order of an evening, the determinism rule for derived places)
- `docs/spec/19-evenings.md`: Places, The round (with Footfall), Data and budgets, the R2 acceptance (the clock is R2B's)
- `docs/spec/20-architecture.md`: R2 contracts; `packages/sim/src/contracts/evenings.ts`
- `docs/spec/12-hearth.md`: the [R2] note on Charm, the Pattern Book's sites; `docs/spec/11-residents.md`: the [R2] notes (the round, outings, traits and taste); `docs/spec/10-world-and-building.md`: Roads [R2] (street names)
- `docs/spec/22-quality.md`: the R2 budgets (the place pass, planning the round)

## You own

The R2A paths in `r2-wave-notes.md`: `packages/sim/src/systems/places/**`, `systems/residents/{round,outings,schedule,places,friends}.ts`, `systems/movement/**`, `commands/place.ts` and the `road.rename` handler in `commands/road.ts`, `view/places.ts`, `view/agents.ts`, the seats and host data in content and the place and round sections of `content/places.ts`, and their tests (`packages/sim/test/r2a/**`).

## You can rely on

- R2.0's contracts and stubs: `Place`, `PlaceState` (`state.places`, sorted by string id), `RoundStop` and `Resident.round`, `EveningsState.tonight`, `Street` (`state.streets`), the footfall layers (`map.footfallDay`, `map.footfallEve`, Uint16, never in layer patches), `Flags.evening`, the `round` RNG stream, `content.places` (`PLACES`), `DecorDef.seats`, `childSeats`, `standing`, `warm`, `BuildingDef.host`; the place id helpers and `placeState`, `newPlaceState`, `startPlaceEvening`, `cleanName` in `state/evenings.ts`; `placeIndex`, `placesNear`, `placeById`, `placeDraw`, `placeServes`, `recordVisit`, `recordSale` (`systems/places`); `startEvening` (`residents/round.ts`, called at 17:00); `pathFor` (`movement/paths.ts`); `AgentAnim.sit` and `agentPose`; `places.updated`, `streets.updated`, `footfall.updated`; `place.rename` and `road.rename` (validate and store, events wired).
- R2B's stubs you read: `sellsTreats` and `treatsOnShelf` (`market/round.ts`), `cafeTables` (`growth/cafes.ts`).
- The pattern pass, `outings.ts` (`chooseLeisure`), the walk grid and its cached routes, charm, as built.

## Tasks

1. **The place pass** (`places`, order 73, hourly after patterns; `invalidatePlaces` after a Hearth command nearby): pattern sites; sitting spots (seat pieces in no site, grouped within `spotRadius`, up to `spotMaxPieces`); porches (`porchSeats`, the street's charm as the draw, the household only); hosts (`BuildingDef.host`, the skating ice, a fire's `standing`, the festival site on its night). Seats, child seats, standing (`standingShare`, `standingMin`, a walk's strollers), kinds, shelter and warmth, `outlets` (built buildings within `serveRadius` where `sellsTreats`, plus cafe tables' seats from `cafeTables`), the draw and its `parts`. Stable ids from the helpers. The index obeys the determinism rule: a pure function of saved state when read, rebuilt when an input changes, nothing cached that moves between those.
2. **The saved rows**: a new place gets a row named for what stands there and the nearest family ("the bench by the Underbank cottage"); `seenDay` each pass; a row the pass has not found for `forgetDays` days goes. At 17:00 `startEvening` rolls `evenings.tonight` into `history` (keep PLACE_EVENINGS) with a fresh tally for today, and pushes a fresh evening onto every row (`startPlaceEvening`). Emit `places.updated` when something changed and at 21:00.
3. **The planner**: between `eveningHour` and `planMinutes` later each young and adult resident plans at their own minute (builders and porters at `latePlanHour`): score every place within their radius (`radius`, `curiousRadius`, `homebodyRadius`) by draw (`placeDraw`), taste (`tasteMin` to `tasteMax`), a friend going, Manhattan distance, crowd beyond room, and a whim from the `round` stream; under `minScore` stays in (count `tonight.nowhere`); `secondBestPercent` take their second best first (by id and day); further stops within `nextStopRadius`, up to `maxStops`. Shopping first when the pantry is low (`shop:<id>`); an evening at a friend's home (`home:<household id>`, `visitDraw`); weather as built (`rainSkipPercent`, a storm keeps everyone in); children, elders and the unemployed as the spec says. Fill `Resident.round` and `tonight.grownups`, `out`.
4. **Arriving**: seats on arrival, then standing room; a full place sends the latecomer on or home. Set RoundFlags (`arrived`, `seated`, `standing`, `turnedAway`, `friend`), the draw as found, `arrived`; call `recordVisit`; count `tonight.stood` and friendships made. A stop lasts `stopMinutes`; home at `homeHour` (`festivalHomeHour` on a festival night). A seated resident's agent row shows `AgentAnim.sit`.
5. **Routes and footfall**: `pathFor`'s `'round'` cost (whole numbers, never under a tile's ordinary cost: `pleasantCharm` and evening streets as they are, plain tiles `plainCostPercent`, noise `noisyNoise`+ `noisyCostPercent`), fixed at 17:00 so lanterns and carts never throw cached routes away; `'barrow'` keeps porters with barrows off `Flags.evening` tiles from 17:00 to 21:00 (null when no other way). Each step adds to `footfallDay`, round steps to `footfallEve` instead (the walk home counts for the day), saturating at FOOTFALL_MAX; both halve at `FOOTFALL_HALVE_HOUR`; `footfall.updated` hourly 17:00 to 21:00 and after halving.
6. **Streets**: decide what a run is (the cutter's frontage runs are the model), name each once from what stands on it ("Mill Lane", "Underbank Row"), keep `state.streets` in step as roads change (a row whose run is gone goes), fill `streetTiles`; emit `streets.updated`.
7. **Views**: `placeView`'s `present` and `wants` (short clauses: "a stall would sell to the 14 who come"), a resident's round.
8. Tests: seats and draw by example for every place source; a town with no places stays in; places fill to their room and no further; the second-best rule spreads arrivals; routes prefer the pleasant way within a quarter longer; the round's routes are not recomputed when only a lantern or a cart changed; footfall counts only round steps for the evening layer and halves; names; a joining seat (serialize, deserialize mid-evening) plans exactly what the partner plans; a year hashes the same twice; bench lines for the place pass (1 ms an hour at Village scale, 3 ms at City) and planning (0.4 ms a tick for 2,000 residents), added by one line to R2E's scene list.

## Acceptance criteria

- [ ] `grep -rn "R2 stand-in (R2A)" packages apps tools` is empty.
- [ ] On a fair evening in an autoplayed Village every grown-up with a place in reach goes out; places fill to their room and no further; a town with no places stays in (headless tests).
- [ ] Footfall counts only steps on the way to or between stops for the evening layer; the walk home does not.
- [ ] A seat joining from a snapshot mid-evening sees the same places and plans (a test).
- [ ] Budgets above hold; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

Buying Treats, the clock, the score, the evenings need and tiers (R2B); gaps and the edition (R2C); every panel, overlay and card (R2D); advisors (R2E); lots (R2F); supplies and priorities (R3); drawing anything (V3).

## Notes

- Distance is Manhattan, as `chooseLeisure` measures; never search a route to choose.
- Never cache stock in the index; `placeServes` and `placeDraw` read shelves live.
- Do not edit `systems/market/**`, `systems/growth/**` or `residents/{evening,needs}.ts`; ask R2B in your PR.
- Steps on a round are many: keep the footfall add a typed-array increment with a cap, nothing more, in the movement step.
