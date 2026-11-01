# C5A: Seasons, weather and the first winter

**Iteration**: I3. **Wave**: parallel. **Branch**: `cycle/05a-seasons-weather`.
**Depends on**: C5.0 merged. **Runs alongside**: C5B to C5F. **Ports**: client 5191, relay 8801.

## Goal

The year turns and it matters: wheat is sown in spring and brought in in autumn, the river freezes from Winter day 2, every household burns firewood to stay warm, the weather changes the day (rain, storms, fog, snow, heat), floods, droughts, early frosts, cold snaps and a travelling circus arrive with fair warning, and the first winter after the Village Charter is the trial that seals it. Mother Thornbury moves in before that winter and teaches the town to get through it. Prepared, winter is the coziest season; unprepared, folk are cold and a few move away, and nothing worse.

## Read

- `CLAUDE.md`, `docs/build/i3-wave-notes.md`, `docs/spec/20-architecture.md` (I3 contracts)
- `docs/spec/14-challenge.md`: Seasons, Weather and events, Difficulty dials
- `docs/spec/11-residents.md`: Needs (Warmth), Mood (cold), Story characters (Mother Thornbury)
- `docs/spec/13-ledger.md`: Goods (`spoilsDays`), Services (Bath House), Wheat fields (I1 details)
- `docs/spec/15-progression.md`: Ranks and Charters (Trials), Innovations (Barometer, Seed Drill), Achievements (Warm Hearths)
- `docs/spec/10-world-and-building.md`: trees in winter, `Flags.floodplain`

## You own

`packages/sim/src/systems/{seasons,weather,warmth,trials}/**`; the seasonal parts of fields and crops in `systems/production/**` (tending, sowing, ripening, harvest) and your registrations in the yield, walk and schedule hooks; spoilage; content for seasons, weather, events, the Bath House, the Barometer and Seed Drill, Warm Hearths, the `herbalist` story arc (Mother Thornbury) and your Chronicle kinds; `view/season/weather.ts`; your tests, `tools/bench/src/advisors/seasons.ts` and `tools/bench/src/seasons.bench.ts`.

## You can rely on

C5.0's state, hooks, fixtures (`winter.ts`) and the year view in the tuner; the I2 chopping shed (logs to firewood, no rank needed), Craftsfolk baskets with firewood, C4A's `buy()` and baskets (`NeedGroup.season`), C3C's fields and fisher's hut, C4C's water sawmill and pattern sites, C4D's stories and Charter claim.

## Tasks

1. **Seasons** (00:02): the season table drives sowing (spring days 1 to 3) and harvest (autumn days 1 to 4), fallow winter fields, vegetables growing spring to autumn, orchards by season, no tree growth in winter (`10-world-and-building.md`), and the river freezing from Winter day 2 (and thawing on Spring day 1). Frozen: no fishing, the water sawmill falls back to its hand method at sawpit rate (it must not stop planks), no boats (C5B reads `isFrozen`), and the bank beside the ice becomes a skating leisure spot with a little comfort charm (skating is an outing on the ice by the bank, not a new route across the river).
2. **Farming through the year**: make a year of wheat feed a year of bread. Tune sowing, growth and harvest so a field's annual output matches what it gave in I2, held as wheat and flour in the storehouses (neither spoils), so bakeries bake all winter from stock. A farm placed after the sowing window grows vegetables (or lies ready) until next spring, and its inspector says so plainly. Early frost cuts unharvested wheat by half; Seed Drill (3 farms and a smithy) adds 20%.
3. **Warmth** (07:30): from Winter day 1 each household burns 1 firewood a day (2 in a cold snap) from its pantry; firewood joins every tier's winter basket so Hamlets take it free and Villages buy it with `buy()`. A household without it is cold: the warmth need drops, the cold modifier (-15 while cold), the cold bubble (`AgentFlags.cold`), and the herbalist and Bath House soften it (warmth and health in winter). Autumn's basket stockpiles: households keep up to 4 days of firewood once the leaves turn. Counts feed `warmthReport` and the trial.
4. **Weather** (00:04): daily from season odds on the `weather` stream, forecast 1 day ahead (2 with the Barometer: a Watch House and a bell tower). Effects through the hooks: rain farms +10% and outdoor leisure halved; storm some roofs lose condition (builders mend as usual); fog for C5D's warnings; snow walking and carts -30%; heat wells -20%.
5. **Events**: flood (spring; floodplain tiles under water 1 to 2 days, buildings there lose condition and some stored goods unless on a raised foundation, `isFlooded` for art and paths), drought (summer; farms -40% unless near a well), early frost (autumn days 1 to 3), cold snap (winter; warmth x2 for 2 days), travelling circus (summer, Village rank, needs a Village Green site: visitors walk in for an evening, mood +, a few coins booked as `visitors`). Each is forecast with a letter and an alert, frequency follows the dial in the wave notes, and none happens twice in a row.
6. **Spoilage**: fish 2 days, bread 3, milk 2. Use a cheap rule without per-batch ages (for example, each night a pile loses the share above what fresh supply and a few days of eating need, halved in storehouses); write it into `13-ledger.md`. It must never empty a pantry overnight or starve a town that was fed in I2.
7. **Trials** (95): generic machinery for `CharterDef.trial` (announce, prepare, run, judge, retry next time; Chronicle and letters; `trial.updated`). The Village trial is the first winter after the claim, decided as recorded in the wave notes; weathered, it seals the Charter (a County letter, a plaque, renown through `addRenown`); failed, it returns next winter. Write the kinds so I4's raid trial and I5's flood fit without new contracts.
8. **Bath House**: a Village service building (warmth and health in winter) with its numbers and coverage; it pays its way at base prices, and its upkeep flows like other upkeep.
9. **Mother Thornbury** (`herbalist` arc, hedgehog): arrives in the first autumn at Village rank (or with two vacant homes, whichever is later); 4 to 6 steps that teach herb gardens, firewood stock, the Bath House, cold snaps and the herbalist; finale: the Herbalist's Cottage (a special home with module slots) and plans for the clinic (the clinic itself is I4). Letters in content, warm and dry.
10. **Season report and card lines**: fill `view/season/weather.ts` (forecast, events, warmth, harvest, frozen days); Chronicle kinds for flood, cold snap, first frost, the first winter, the circus, the trial; Warm Hearths (a winter where nobody was cold).
11. **Autoplayer**: an advisor that stockpiles firewood in autumn (chopping sheds by need, not by habit), keeps wheat and flour for winter, builds a Bath House when the Village can afford it, and stays away from the floodplain once a flood is forecast. It proposes wants to the one planner; it does not place buildings itself.

## Acceptance criteria

- [ ] Each season's rules tested on the flat test world: sowing window, harvest, fallow winter, frozen river and thaw, the water sawmill's winter method, trees resting in winter.
- [ ] Warmth tested on the winter fixture: firewood burned, cold households, the modifier and bubble, cold snaps, the Bath House and herbalist effects; money invariant holds across a winter with firewood bought at the till.
- [ ] Every weather kind and event has a test for its effect and its forecast lead; event frequency follows the dial.
- [ ] The Village trial: weathered and failed cases in fixtures; a failed trial retries the next winter and loses nothing else.
- [ ] Thornbury's arc completes in a fixture; letters render deterministic text.
- [ ] Autoplayer, with every system on: seeds willow and hazel play a standard valley from founding through two full years without famine, deadlock or a spiral of departures; the town eats through each winter on stored wheat; every Village winter after the first has no cold household. Report the cold household-days, food days at the start of each winter and departures per season in the PR.
- [ ] Bench: seasons, weather and warmth passes under 1 ms per in-game day at 150 residents; the Village tick budget unchanged.
- [ ] Definition of done.

## Out of scope

Festivals, renown, commissions and the dock (C5B); habitats and wildlife (C5C); threats, wolves and the Watch (C5D); snow, ice and weather art (C5E); the season card, forecast and trial pages (C5F).

## Notes

- **Seasonal farming is the biggest economy change in I3.** Wheat once a year, no fish in winter and no vegetables in winter means a Hamlet that ate well in I1 can starve in its first winter if nothing changes. The first winter of a new valley lands around the third evening, often still at Hamlet rank. Tune until the standard start gets through it with ordinary play, and make the danger visible early (an autumn letter, a winter food-days line in the season card). Trade (Millhaven sells wheat) is an escape for a Village, not for a Hamlet.
- **No dead ends**: firewood must be makeable at Hamlet rank from logs (it is); a farm built late must not sit useless for a year without saying why; a water sawmill must not stop planks in winter; a flood must not wipe the only storehouse's food (cap the loss). In I2, a Trading Post needing bricks before the kiln existed, and upkeep draining a Village with no external income, were both dead ends found only in integration. Look for yours before C5X does.
- **Money**: firewood bought at the till is `buy()`; circus coins are `book('visitors')`; the County's firewood gift is `book('grants')`. Every economy test takes `moneySnapshot` and ends with `expectMoneyInvariant`.
- Isolate unit tests with `withoutSystems`, and do not assume other systems are absent (C5C's pollinators and C5D's wolves will run beside yours in C5X).
- Do not pin exact texts or numbers where content can be read: read the season table, the weather odds and letter variants from content in tests.
- The autoplayer stays one coherent player: in I2 four tracks each added their own building logic and together they overbuilt and starved labor. Add wants to your advisor; let the planner decide.
- Stand-ins you add (a fixed weather sequence, a firewood gift) go in the wave notes' stand-ins table with how to remove them.

## As built

Done on `claude/stoic-gauss-cshmwm`. Seasons (00:02, report at 23:02), the frozen river (fishers rest, the water sawmill saws by hand, skating), seasonal wheat (sown in spring, golden by autumn, brought in as room allows, the field as granary, late farms grow vegetables), seasonal gardens and orchards, warmth (autumn stock, winter burn, cold modifier and shiver, the Bath House and herbalist), weather and the five events through the hooks, spoilage, the trial machinery and the first winter, the season report and card lines, Barometer and Seed Drill, Mother Thornbury's arc and cottage, and the seasons advisor. Autoplayer, every system on, willow and hazel from founding to the third winter: no departures in any season; food days at the start of each winter (food, wheat and flour a resident) willow 6, 7 and hazel 6, 8, 7; the first (Hamlet) winter ate the larder to nothing by the thaw in both; cold household-days in the Hamlet winter willow 0, hazel 80 (no chopping shed staffed in time), in the first Village winter 0 for both (the trial weathered), and 1 so far in hazel's third. Bench: 0.83 ms an in-game day of seasons, weather, warmth and trials at 150 residents (budget 1 ms). Finished after the bug hunt (merged with `main`): circus visitors walking in for the evening (view only, see `14-challenge.md`), +3 comfort charm on the ice by the skating spots while it holds, and the planner keeping new buildings off the floodplain from a flood's forecast until it drains (`Planner.keepOffFloodplain`, set by the seasons advisor). The two-year report per seed is in the PR. Found while measuring it: the autoplayer's `untilHour` counts turns as ticks, so since playtest round five's night hurry (three ticks a turn at night) each day's last stop lands at 01:00 and a Village day runs about three calendar days between advisor visits; the Village-phase numbers above and the bench's I2 thresholds were measured that way. Fixing it (by the clock) is a follow-up for C5X, with the bench thresholds and the winter food retuned against it; the first Hamlet winter still eats the larder to nothing by the thaw on both seeds. Since fixed on the same branch (the autoplayer runs by the clock): with arrivals weighing the winter, the jobs putting the gardens and sheds first, and the advisors putting food and firewood by, both seeds feed and warm every household through two winters and the bench's thresholds hold unchanged (numbers in the PR; rules in `14-challenge.md`). See the spec's As built notes in `13-ledger.md`, `14-challenge.md` and `15-progression.md`.
