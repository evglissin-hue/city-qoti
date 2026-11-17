# R3A: Supplies and the lamplighter

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3a-supplies-lamplighter`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: xhigh.
**Depends on**: R3.0. **Runs alongside**: R3B to R3E, and V4's wave. **Ports**: client 5241, relay 8851.

## Goal

Places come alive when supplied. From Village rank lanterns burn candles, fires firewood, festival cloth fades and fountains want a well; a piece without its supply rests: it stays, costs nothing and loses only what the table says. Places draw after homes and businesses, only above the town's reserves and winter marks, unless the Ledger lets the carrier buy for them. At 17:30 the lamplighter takes the night's candles and walks the lanterns, the places kept first; for the rules they are lit from 18:00 sharp, and out at 07:00. A home with a candle lights every window until bedtime. The Hearth chooses what to keep alive tonight (`place.setPriority`), and a place short two nights running posts the fourth gap.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (all of it: ownership, stand-ins, the order of an evening, the rulings)
- `docs/spec/19-evenings.md`: Supplies, Gaps (the R3 row, and R2C's As built), Places (Draw, and As built: Determinism), Data and budgets, the R3 acceptance
- `docs/spec/13-ledger.md`: Goods (Fuel, Wares: candles), Households, The carrier and trade (rules, reserves, the budget, the County tab), The season plan (the winter marks)
- `docs/spec/14-challenge.md`: the lantern line [R3]; `docs/spec/12-hearth.md`: Nature (hives want flowers), the Apiary; `docs/spec/15-progression.md`: Achievements (The Lamplighter's Round)
- `docs/spec/17-presentation.md`: The world carries what it can, Residents on screen [R3] (what your views must carry for whoever draws them)
- `docs/spec/20-architecture.md`: R3 contracts; `docs/spec/22-quality.md`: the R3 budget row, Playability from the redesign [R3]

## You own

The R3A paths in `r3-wave-notes.md`: new `packages/sim/src/systems/supplies/**` (supply by piece, the 17:30 settling, the lamplighter's walk, resting, household candles, the fourth gap's rule, the `api.ts` bodies R3.0 stubbed), the `place.setPriority` handler in `commands/place.ts`, buying for places in `systems/carrier/**`, the lamplighter's hours where the wave notes put them in the residents' schedule, `view/supplies.ts` and the supplies lines of `view/balances.ts`, content `supplies.ts` (or its section of `places.ts`), the `supply` data on decor, the `shortOfSupplies` words in `gaps.ts`, and their tests (`packages/sim/test/r3a/**`).

## You can rely on

- R3.0's contracts and stubs: the lit bits, reach ticks and rest counts, `DecorDef.supply`, the supply numbers in content, `place.setPriority` (validate and store; `PlaceState.priority`, absent reads `normal`), the carrier's places switch, `decorLit` and `pieceRests` (or the names R3.0 gave them) with their readers already wired (charm's night values, the threats' deterrence and lit tiles, the place draw's lit and warm parts), `supplyGapAchievable` and `supplyGapClosable` wired into `gaps/achievable.ts` and `view/health.ts`, the Lamplighter's Round's `CountWhat`.
- R2A's places (`placeIndex`, `placeById`, members, the `lit` part), R2C's `openGap`, `closeGap`, `findGap` and credit helpers, R1A's carrier (reserves, the day's budget, the County tab, the winter marks from Summer day 4), R2B's baskets (Wares at 18:00), C5D's threats and raids, the charm system's lantern recompute at 18:00 and 07:00.

## Tasks

1. **Supply by piece** (the Supplies table; every number in content): lanterns, hanging lanterns and lamp posts burn a candle a night for every 4 (unlit: day charm only, no night draw, no deterrence); a bonfire or brazier burns one firewood on an evening someone comes, autumn to the thaw (cold: its place is not warm); cafe and trestle tables take from the outlet beside them (bare: seats only); bunting, a flower arch, a maypole or a festival stage take 2 cloth when put up, once a season (faded: half its charm); a fountain or birdbath wants a well within 8 tiles (dry: half its charm); the bandstand as the rulings say. From Village rank; in a Hamlet every piece is supplied for nothing.
2. **Who is served first**: homes, then businesses, then places. A place draws only on what the town holds above the family's reserve and winter mark, so a fire never takes a home's firewood; the carrier buys for places only when the Ledger has switched it on for that family, within the day's budget and never on the County tab. Keep what places drew each night, by family, for the Balances line.
3. **The lamplighter**: a job at the Town Hall for every 40 lanterns. At 17:30 settle which lanterns get a candle from stock and priority (keep, then as it comes, then rest; nearest first within each; ties by id), take the candles from the nearest storehouse, and walk them, giving each lamp the tick he reaches it so a client lights it as he arrives. For charm, the draw and raiders every settled lantern counts as lit from 18:00 sharp, so a raid at dusk never finds a town half lit; all go out at 07:00. A seat joining mid-walk sees the same lit set and the same reach ticks.
4. **The readers** (the bodies behind R3.0's stubs): a lantern's night charm counts only when it is lit, so the 18:00 recompute marks only lit lanterns; deterrence and the lantern line count only lit lanterns (`14-challenge.md`); a place's `lit` part needs a lit lantern among its members; a cold fire leaves its place unwarmed, so winter's penalty applies; faded and dry pieces count half their charm. Supplies enter the place index the way R3.0 decided (a moving part, never cached between ticks).
5. **Windows**: a household's candle (bought within its Wares, as the rulings say) lights every window of its home until bedtime and lasts five nights; a home without one keeps today's share of lit windows, so no home ever goes dark. Put it on the home's view for whoever draws it.
6. **Priorities**: keep first, as it comes, let it rest; the lamplighter, the fires and the cloth read the place's priority; a piece in no place counts as "as it comes".
7. **The fourth gap** (`shortOfSupplies`, from Village rank): opens when a place's pieces rested two nights running, closes when it was supplied two nights running; its words say what it wants a night and what the town makes ("The Lantern Walk wants 6 candles a night; the town makes 2.") and what would close it, with `closed` and `closedQuiet` lines like R2C's. `supplyGapAchievable`: the good can be made in this valley or bought from a neighbor under some rule. `supplyGapClosable`: some command could close it where it stands (a Workshops lot where a chandler could grow with honey in reach, a carrier rule, a lower reserve, a priority). Credit as the rulings say.
8. **The Lamplighter's Round**: count seasons in which every lantern was lit every night (from Village rank, unless the rulings say otherwise).
9. Tests: candles for half the lanterns (the places kept first lit, the rest resting, nothing broken); a Hamlet lit for nothing; no home's firewood and nothing under a winter mark to a place; the carrier's switch; lit from 18:00 sharp, out at 07:00; a joining seat mid-walk matches its partner hour by hour to 22:00; the fourth gap opens, closes and credits; a year hashes the same twice; bench lines for the settling and the walk at City scale, by one line in R3E's scene list.

## Acceptance criteria

- [ ] `grep -rn "R3 stand-in (R3A)" packages apps tools --exclude-dir=dist` is empty.
- [ ] A lantern round lights along the lamplighter's walk (reach ticks in walking order, a headless test; on screen as the rulings assign). With candles for half the lanterns the places kept first are lit and the rest rest; nothing breaks.
- [ ] No fire takes a home's firewood; places draw only above reserves and winter marks; the Balances view says what places drew last night.
- [ ] The fourth gap opens, closes and credits in a headless run; the audit raises neither `gap-unmeetable` nor `gap-dead-end` for it on a sensible 70-day run.
- [ ] `npm run lanes -w @qoti/bench` still passes on every bench seed, and R2's Craftsfolk lines hold or each miss is measured for R3X; supplies stay inside the shared 1 ms an hour; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

Masters (R3B); the Town Book, including a custom such as "the Lantern Round" (R3C reads your counts); the priority control, supplies on the place card and the Balances line on screen (R3D); drawing lamps, the lamplighter, windows or resting pieces (as the rulings assign); advisors (R3E).

## Notes

- Supplies feed growth. Since R2X, past 20 households homes come only as fast as fair evenings send folk out (`quietEvenings`), so dark lanterns and cold fires slow a town. Tune in content, and run the lanes test after every change.
- Candles are Wares, whose reserve is one day from Village rank, and the winter marks hold from Summer day 4 to the thaw: measure how many lanterns a Village lights in winter and whether a brazier ever burns, and report it for R3X.
- Never draw from the `residents` stream; settling is by priority, distance and id. Arrivals have had their own generator since R2X; the schedule has not.
- The walk is there to be watched; the rules never wait for it.
- Your rules live in your own files behind R3.0's stubs: never edit `view/health.ts`, `gaps/rules.ts` or `places/draw.ts` beyond what the wave notes give you.
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
