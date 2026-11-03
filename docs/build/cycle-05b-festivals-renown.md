# C5B: Festivals, renown, commissions and the River Dock

**Iteration**: I3. **Wave**: parallel. **Branch**: `cycle/05b-festivals-renown`.
**Depends on**: C5.0 merged. **Runs alongside**: C5A, C5C to C5F. **Ports**: client 5192, relay 8802.

## Goal

Every season ends in a festival the two players plan together (a site, stalls and bunting, a menu from the workshops, music, a rotating twist) and the town turns out for it on day 6 from 18:00 to 22:00; its stars lift moods, bonds, renown and the Watch's morale. Renown grows from festivals, repelled raids, patterns and story finales and opens better trade and notable visitors with commissions. Boats call at a River Dock until the ice comes. The new trades (pies, candles, coats, furniture) give festivals their menu and the Craftsfolk something to make, market days and quiet hours join the levers, and some moments (the closing dance, fireworks at a rank-up) happen only when both of you are there.

## Read

- `CLAUDE.md`, `docs/build/i3-wave-notes.md`, `docs/spec/20-architecture.md` (I3 contracts)
- `docs/spec/12-hearth.md`: Festivals
- `docs/spec/15-progression.md`: Renown, Achievements (Five Stars)
- `docs/spec/13-ledger.md`: Goods (I3 rows), Market Square (market days), Trade (River Dock, Commissions), Levers (I3 rows)
- `docs/spec/16-coop.md`: Together moments; `docs/spec/11-residents.md`: traits (Generous), Ages and life events (Opening a shop, Weddings)
- `docs/spec/01-principles.md`: P2, P5, P23, P31

## You own

`packages/sim/src/systems/{festivals,renown,commissions,dock}/**`; changes to `systems/trade/**` for renown terms and boats; the festival, commission and policy commands (`festival.*`, `commission.*`, `ledger.setMarketDay`, `ledger.setQuietHours`); `systems/residents/shops.ts` (opening a shop) and your schedule override registration; content for festivals, twists, festival pieces, the I3 trades (tailor, carpenter, pie shop, chandler and their goods), the River Dock, commissions, renown levels, Five Stars and your Chronicle kinds; `view/season/festival.ts`; your tests, `tools/bench/src/advisors/festivals.ts` and `tools/bench/src/festivals.bench.ts`.

## You can rely on

C5.0's festival, renown, commission and dock state, the `festival` RNG stream, the schedule hook, the winter fixture's planned feast; C3B's pattern sites and charm; C4A's trade (regional prices, caravans, standing orders) and `buy()`; C4D's weddings on the festival day and Juniper Reed's `festival-music` unlock; C5A's `weatherToday` and `isFrozen`; C5C's honey (apiary).

## Tasks

1. **Planning**: from the season's first day either seat plans with `festival.plan`: a site (a pattern site or an open area of 6x6+ tiles, validated), up to 4 menu goods with quantities, music (a musician resident such as Juniper Reed, or a bandstand) and the season's twist (rotating, never the same twice running: pie contest, lanterns on the water, costume parade, harvest display, snow sculptures). Festival pieces (stalls, bunting as linear decor, lanterns, a stage, tables, a bonfire in autumn and winter) are decor flagged `festival`, placed with the ordinary decor tool and removed at 04:00 the next morning unless kept with `festival.keepPiece` where the def allows.
2. **The evening**: menu goods are reserved at noon on day 6 (`reserveMenu`; porters are not needed, the stock is set aside) and eaten at the festival; residents within walking reach go to the site from 18:00 through your schedule override, at a priority below the bell (C5D) and above leisure; weddings due that day happen there.
3. **Outcome**: attendance (reach x mood x weather) and joy (site charm, piece variety, menu variety and sufficiency per guest, music, twist bonus) give 1 to 5 stars with a breakdown the result card can show. Rewards: town mood +5 to +15 for 2 days, bond +1 for guests (capped per season), renown, `festivalMorale` for the Watch, a Chronicle entry marked for a snapshot, unlocks at the first 3, 4 and 5 stars, Five Stars. A poor festival only yields less; an unplanned day 6 is a quiet evening, never a penalty.
4. **Together moments**: when both seats are connected, the festival closes with a dance (`together.moment { kind: 'dance' }`, residents' `dance` anim) and a rank-up or sealed Charter ends with fireworks; an evening stroll moment if you find a clear rule for it (write it in `16-coop.md`). They never gate progress (P5) and never change the outcome.
5. **Renown** (91): points from festivals, repelled raids and send-offs (C5D calls `addRenown`), discovered patterns, story finales (`Reward.renown`), commissions and the sealed Village Charter; levels 0 to 5 with thresholds in content. Effects: better trade terms (+2% per level on the post's and dock's prices), a little more pull for arrivals, notable visitors who bring commissions. `renown.updated` on every change.
6. **Commissions** (93): offers from Millhaven, Stonecross and notable visitors (rank and renown gated), asking for goods delivered by a date or a thing built (as a `Condition`), with decor, unlock or renown rewards. Accept or decline; progress and completion are automatic like C4D's requests; a missed deadline only closes the offer.
7. **River Dock** (68): a riverbank building at Village rank and renown 1 (as the wave notes decide); boats carry bigger, cheaper loads than caravans to Millhaven downstream on the dock's own standing orders, with a few days' round trip; frozen in winter (`isFrozen`), and the trade page says so. Money through `book('exports' | 'imports')` as C4A does.
8. **New trades**: pie shop (flour and apples or honey to pies), chandler (candles, from what you choose and write into `13-ledger.md`), tailor (cloth to coats), carpenter (planks to furniture), each paying its way at base prices; pies and candles are festival and treat goods, coats and furniture sell to the neighbors and appear in commissions until the Merchants want them in I4.
9. **Levers**: market day (a day per season, 1 to 5, at the Market Square or stalls: more shopping capacity, a little charm and a small fee paid by households to the treasury with `pay()`), quiet hours (as decided in the wave notes; less night noise, a little less output).
10. **Lives**: opening a shop (an adult with savings, a fitting trait and a vacant shop lot opens a named shop with its own sign text, through `growLot`); Generous residents donate a little to the festival menu.
11. **Autoplayer**: an advisor that picks a site and menu each season from what is in stock, places a few pieces, asks the planner for a pie shop once the menu runs thin, accepts commissions it can meet and builds a dock when the river and renown allow. It never spends the town's last food on a festival.

## Acceptance criteria

- [ ] Planning validation, piece removal and keeping, menu reservation and the evening are tested on the winter fixture; residents attend and go home afterward.
- [ ] Stars follow the formula: tests per factor (site, variety, menu, music, twist, weather) that read the weights from content rather than pinning them.
- [ ] Renown levels, trade terms and every source tested; commissions offered, met, missed and declined; the dock trades, freezes and thaws; money invariant holds across a season with festivals, market days, commissions and boats.
- [ ] Each new building produces at full and partial staffing; each chain runs end to end in a fixture.
- [ ] Together moments fire only with both seats connected, and a run with one seat reaches the same state hash apart from them.
- [ ] Autoplayer with every system on: each season holds a festival; at least one reaches 3 stars in the first Village year; the menu never causes a food shortage.
- [ ] Bench: festival outcome under 3 ms; renown, commissions and dock passes under 1 ms per day at 150 residents.
- [ ] Definition of done.

## Out of scope

Weather and seasons (C5A); the apiary, honey and wildlife (C5C); the Watch and raids (C5D); festival art, the dance and fireworks (C5E); the festival planner and result card (C5F).

## Notes

- A festival is the moment the lanes need each other (P2): the Ledger makes the pies and candles, the Hearth lays out the green. Keep both halves visible in the outcome breakdown.
- **Money**: menu goods are the town's own stock (no money moves); market day fees are `pay(household, 'treasury', ..., 'fees')`; dock trade and commission coins cross the valley's edge with `book()`. Every economy test ends with `expectMoneyInvariant`.
- **No dead ends**: a festival must be plannable with Hamlet-era goods (bread, vegetables, fish); the dock must not be the only buyer of anything; commissions must never require something the town cannot yet build.
- Isolate unit tests with `withoutSystems`, and do not assume other systems are absent: C5D's bell will ring over your festival in C5X.
- Do not pin exact texts or numbers where content can be read (twist names, star thresholds, renown levels).
- The autoplayer stays one coherent player: your advisor proposes wants; the planner decides within its labor and money budgets. In I2 four tracks each built on their own and starved labor.
- Stand-ins (for example a fixed twist, a fake musician) go in the wave notes' stand-ins table with how to remove them.

## As built

Done on `cycle/05b-festivals-renown`. Festivals: planning with validated sites (open ground or a pattern site standing now), menus, rotating twists with goals (code predicates) and music; festival pieces through the ordinary decor tool, taken down at 04:00 the morning after unless kept; the menu put by at noon on day 6 (never food below a unit a resident) with the Generous residents' gifts; guests chosen at 18:00 by reach x mood x weather and walked to the site by the `festival` schedule override (50) until 22:00; the outcome from content weights (`festivalTuning`) with turnout; rewards (mood for those who came, a bond heart, renown, the Watch's morale, a snapshot Chronicle entry, the 3, 4 and 5 star unlocks, Five Stars). Together moments: the dance, fireworks after a rank-up or a sealed Charter, and an evening stroll on day 3 (rule in `16-coop.md`). Renown: the curve, every source (patterns, story finales, commissions, festivals; raids and the trial through their owners' calls), trade terms at the post and the dock, a little more pull for arrivals, notable visitors. Commissions: seven, offered only when the town can meet them, accepted, met, missed, declined or lapsed. The River Dock: boats to Millhaven on the dock's own orders, frozen in winter. The trades: pie shop, chandler (rushlights from herbs, beeswax from honey), tailor, carpenter. Levers: market day and quiet hours. Opening a shop. The festivals advisor, the festivals bench and the season report's festival lines. Spec notes in `12-hearth.md`, `13-ledger.md`, `15-progression.md`, `16-coop.md`, `11-residents.md` and `20-architecture.md`; the I3 wave notes have C5B's stand-ins and an As built section.

Numbers (autoplay, every system on, 60 days): hazel claims the Village on day 37 and willow on day 31; a festival every season on both; stars by season hazel 2 2 2 4 3 2 2 3 (the last eight), willow 2 2 2 2 2 2 3 3; at least one festival of three stars or more in the first Village year on both; the larder after every festival evening holds at least 2.7 days a resident. The advisor proposes the pie shop and the dock but in these runs planks never run spare enough for either (the high street's homes come first), and no commission was accepted (none met from surplus); both are follow-ups for C5X's tuning. Bench at 150 residents: 0.48 ms a festival's outcome (budget 3 ms), 0.15 ms a day of renown, commissions and the dock (budget 1 ms).

The autoplayer's knife-edge seeds moved with the festival evenings (guests walking to the green change every later dice roll): willow's third evening ends one household short of the old mark, oak claims the Village bigger and adds fewer after it, and hazel's claim lands in autumn. The tests say so where they changed (`autoplay.test.ts`, `village.test.ts`).
