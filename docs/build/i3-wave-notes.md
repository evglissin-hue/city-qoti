# I3 wave notes: how the tracks meet

Read this with your brief. C5.0 fixed the types and signatures (`docs/spec/20-architecture.md`, "I3 contracts"); these notes fix the runtime handshakes between tracks, so the pieces fit when C5X merges them. The I1 and I2 notes still hold for everything they cover. If something here is wrong for your track, do the sensible thing, keep it additive, and say so in your report.

## Lessons from I1 and I2 (read first)

- Unit tests that assumed other systems were absent broke once real systems ran beside them. Isolate with `withoutSystems([...])`, but never assume a system is missing: write the test so it still holds when every system runs.
- Four tracks' autoplayer logic overbuilt and starved labor in I2. There is now one planner (`tools/bench/src/planner.ts`) with one build queue, one labor budget and one money reserve. Your track adds an advisor in `tools/bench/src/advisors/<area>.ts` (one registration line in `advisors/index.ts`) that proposes wants with a priority and a cost; it never builds by itself.
- Dead ends surfaced only at integration. Before you finish, play your system from the standard start with the autoplayer (`npm run tune -w @qoti/bench`) and look at the year view.

## The season (C5A sets it; everyone reads it)

- Read the season through `seasonNow(state)` (`systems/seasons/api.ts`), never the calendar: season index 0 to 3, year index from 0, day 1 to 6. `seasonAt(tick)` is the same arithmetic for a given tick.
- C5A's seasons system (12, 00:02) turns the season over: it emits `season.started` with the `SeasonCardView` on day 1 and `season.report` (from `view/season/`) on the last evening after the festival. It freezes the river on Winter day 2 (`RIVER_FREEZE_DAY`) at 00:02 and thaws it on Spring day 1.
- Who reads the river: fishers (no fishing while frozen; C5A registers a yield modifier), the water sawmill (C5A, same), the River Dock (C5B: no boats, `FROZEN` on dock commands), skating (C5A schedule override, C5E draws skaters by `AgentFlags.skating`), wolves (C5D, winter nights only), art (C5E ice).
- Farming becomes seasonal: C5A sows wheat on spring days 1 to 3 and harvests on autumn days 1 to 4 (content `SeasonDef.sow` and `.harvest`), and fields lie fallow in winter. Crops already growing in a migrated valley keep growing to harvest.

## The three hooks (written once in C5.0)

- **Yield** (`systems/production/modifiers.ts`): one line per source in `yieldModifiers`, each `(state, building, def, method) => permille`; they multiply; felling and planting are never touched. C5A: weather (rain +10% on farms), drought, early frost, frozen river, Seed Drill. C5C: pollinators, pests. Production and the inspector's rates both apply it.
- **Walk** (`systems/movement/factors.ts`): one line per source in `walkFactors`, each `(state, mover, tile) => permille of tile ticks`; `mover.kind` is `resident`, `cart` or `raider`. C5A: snow -30% (1300). C5D: fences 20% and hedges 30% slower, for raiders only (`DecorDef.slows`).
- **Schedule** (`systems/residents/overrides.ts`): one entry per override in `scheduleOverrides`, each with a priority and `pick(state, resident, hour) => Activity | null`. The highest priority with an answer wins and the day table is skipped for that think. Acted on: `home` and `sleep` (go home), `work` (go in at `at`), `leisure` (walk to `tile` and stay). Proposed priorities: bell 100, Watch turn-out 90, storm 80, festival 50, Watch duty 40, skating 20. The bell beats the festival.

## Money (C4A's rules still hold)

Every new flow keeps the invariant (`treasury + savings - external`):

| Flow | Call | Category |
|---|---|---|
| Festival supplies bought in, prizes | `book` | `festival` |
| Festival takings at stalls (households to the town) | `pay({ household }, 'treasury')` | `sales` |
| River Dock trade | `book` | `dock` (exports and imports stay for the Trading Post) |
| Commission rewards | `book` (or `pay('outside', 'treasury')` through `grantReward`) | `commissions` |
| Watch training and gear (the budget) | `book` | `watch` |
| Circus visitors' spending | `book` | `visitors` |
| Market day stall fees, bath house fees (households to the town) | `pay({ household }, 'treasury')` | `fees` |
| Firewood bought for warmth | the market's `buy()` as now | `sales` |

## Who computes what

- **Warmth** (C5A): the warmth system (59, 07:30) burns `WARMTH_PER_HOUSEHOLD` firewood a household each winter day from the pantry, then the market (twice in a cold snap), sets `Household.warmth` (absent outside winter) and counts `state.warmth`. "Everyone warm" for the trial: no household cold for a whole day in the trial's winter, with a day's grace for households that arrived during it.
- **Watch morale** (C5D computes it): mood (C3A's average), `festivalMorale(state)` from C5B (-10 to +10 from the last two festivals' stars), friendships among members (C3A's friends), victories (`state.threats.history`). C5D owns `state.watch.morale`.
- **Renown** (C5B owns `addRenown`): festivals (C5B), repelled raids and send-offs (C5D calls `addRenown(state, ctx, n, 'raid' | 'send-off')`; `bandit.decide` already does the send-off), patterns (C5B, on `pattern.discovered`), story finales (through `Reward.renown`, already wired in `grantReward`), commissions (C5B).
- **Festival attendance and weather** (C5B reads `weatherToday`): rain and storms cut attendance; C5A's weather never cancels a festival, it only thins the crowd.
- **The circus** (C5A schedules it, summer, Village+): it needs a Village Green; C5A reads C3B's pattern sites (`state.hearth.sites` where `pattern === 'village-green'`) and pitches there; no green, no circus that summer (the forecast says it went elsewhere).
- **Fog and warnings** (C5D): a raid's signs appear two days before (`telegraphTick`), three with a watchtower (`DefenseDef.warningDays`), one fewer on a foggy day (`WeatherDef` fog `warning` 500).
- **Lantern lines** (C5D reads C3B's sites): `lanternLit(state, tile)` is the baseline; a Lantern Walk site (C3B) doubles the morale loss for raiders and keeps wolves away from its tiles.
- **Wall dressing** (C5C modules on C5D's walls): stone walls declare `moduleSlots: [['wall', 1]]`; C5C writes the ivy and flower box modules for the `wall` slot; C5D draws nothing of them (C5E does).
- **The Chronicle snapshot**: the sim marks notable entries with `ChronicleParams.snapshot` (festival, raid, trial, first sighting, flood, rank-up, first winter; each track for its own kinds). The client of the lowest connected seat captures a picture with C5E's `capture`, and C5F stores it with the valley. `MirrorChange.snapshots` lists them.
- **Together moments**: the sim emits `together.moment { kind }` only while both seats are connected (`state.time.connected.length >= 2`) and counts them in `state.seasons.together`. Nothing ever waits on one (never gating).
- **Sound** (C5G): C5G maps sim events to sounds itself (`season.started`, `festival.*`, `raid.*`, `species.sighted`, `rank.up`...). Other tracks call `audio().cue(id)` only for things with no event, from client code. The sim never touches audio.
- **The guide** (C5H): goals are Conditions, checked hourly by the guide system (99, offset 190); the guide never pays coins or goods, so autoplayer numbers do not move.

## Events (who emits what)

| Event | Emitted by |
|---|---|
| `season.started`, `season.report`, `weather.updated`, `event.*`, `trial.updated` | C5A |
| `festival.*`, `renown.updated`, `commission.*`, `dock.updated`, `together.moment` | C5B (`renown.updated` from `addRenown`, any caller) |
| `species.sighted`, `habitats.updated` | C5C |
| `threat.updated`, `watch.updated`, `raid.*`, `bandit.captured` | C5D (the commands already emit theirs) |
| `guide.step` | C5H (and `guide.setHidden`) |

## Schedules and offsets

Daily (`every: TICKS_PER_DAY`, `offset: dailyOffset(hour, extra)`): 00:02 seasons, 00:04 weather, 00:06 renown, 00:08 trials, 00:10 market (I2), 00:40 threat pressure and scheduling, 02:00 habitats, 04:00 festival tidy, 05:30 Watch roster, 07:30 warmth, 08:00 dock boats (after the I2 caravans). Hourly (offset in ticks): 140 wildlife, 180 commissions, 190 guide. Every tick: raids and defenses (returning at once outside a raid). A festival evening may add its own hourly pass (C5B), registered as its own system.

## Decisions on the spec gaps

- **The Village trial and the rank**: the claim still grants the Village rank as in I2, so the I2 pace holds; the first winter after it is the trial that seals the Charter and opens the Town Charter board. A failed winter simply returns next winter. (`15-progression.md` updated by C5A.)
- **What "everyone warm" measures**: no household cold for a whole day in the trial's winter, with a day's grace for households that arrived during it.
- **Unlock ranks**: palisade, gate, wooden watchtower, bell tower, traps and the Watch House at Village rank; the River Dock at Village rank and renown 1; stone walls unlocked early by Barnaby's arc and for everyone at Town.
- **The Barometer's "Town Hall upgrade"**: read as a Watch House and a bell tower.
- **Weather event frequency in the dials**: follows the economy dial (gentle x0.7, standard x1, thoughtful x1.3).
- **Wolves and the Peaceful dial**: Peaceful has no raids, and wolves only howl.
- **Habitats in state**: a plain `number[]` (6 x 144), not a `Uint8Array`, so the slice saves and hashes as JSON like the others.
- **Captured bandits** wait in `state.threats.captives`, not in the live raid, because the decision may come after dawn.
- **Migrated valleys and the gift of firewood**: goods, not coins (six a household, into pantries), so the money invariant is untouched.

## Stand-ins (every track fills its row before its PR)

| Track | Stand-in it relies on until the owner lands | Owner |
|---|---|---|
| C5B | weather is always clear (`weatherToday`); C5A's weather is in (00:04), so this stand-in is gone | C5A |
| C5C | seasons from `seasonNow` only; no pests until C5C itself (C5A's seasonal growth for gardens and orchards is a yield modifier, `seasonal`, beside yours) | C5A |
| C5D | Watch morale without festivals (`festivalMorale` is 0 with no history) | C5B |
| C5E | the winter and raid fixtures for every visual | C5A, C5D |
| C5F | the mocks in `apps/client/src/ui/mocks/seasons.ts` | C5A to C5D |
| C5G | the silent `audio()` stub until its engine lands | C5G |
| C5H | goals use existing `CountWhat`s; new ones are added additively | C5H |

## Testing and benches

- Fixtures: `packages/sim/test/fixtures/winter.ts` and `threat.ts` (with `raidAtDusk()`) are shared. Add helpers next to them in your own files; keep existing ids and positions (the UI mocks are built from them). `seasonsPlace.ts` has `placeFree`, `tickAt` and `addDecorAt`.
- `packages/sim/test/seasons-contracts.test.ts` shows each hook used with a dummy registration (`withYieldModifiers`, `withWalkFactors`, `withScheduleOverrides`).
- Money: every economy test still takes `moneySnapshot` first and ends with `expectMoneyInvariant`.
- The tune prints a year view after the I2 output (season, weather, cold households, festival stars, threat band, raid result). Fill your columns by filling the state; `tools/bench/src/yearRow.ts` reads it.
- Ports, so parallel checkouts never collide: C4P 5190 and 8800, C5A 5191 and 8801, C5B 5192 and 8802, C5C 5193 and 8803, C5D 5194 and 8804, C5E 5195 and 8805, C5F 5196 and 8806, C5G 5197 and 8807, C5H 5198 and 8808 (`QOTI_CLIENT_PORT=<n> QOTI_RELAY_PORT=<m> npx playwright test -c apps/client/playwright.config.ts <spec>`; `QOTI_CHROMIUM=/opt/pw-browsers/chromium` in sandboxes).

## C5A as built (read if you meet these)

- The seasons system is hourly at minute 2: it turns the season at 00:02 and sends `season.report` at 23:02 on the season's last day (after the festival), so report builders in `view/season/` read the closing season (`economy.season` still holds it).
- The latest of each weather event stays in `weather.events` after it ends (for "never twice in a row" and the report); `weatherView` shows only those to come or on. Use `runningEvent(state, id)` and `eventEffect(state, id, name)` from `systems/weather/effects.ts` rather than scanning the list.
- Snow's `walk` effect in content is permille of tile ticks (1300), as the walk hook reads it.
- Warmth is a held `cold` mood modifier (no new need). `isCold` and `warmthReport` read `Household.warmth`, set at 07:30 each winter day.
- Gardens, orchards and herb gardens gather by `GoodDef.seasons` (yield modifier `seasonal`); a test that counts a gatherer's full rate picks a season where its table reads 1000.
- `BuildingDef.requires.story`: a building only a story unlocks (Mother Thornbury's cottage); `meetsRequires` takes the def id.

## Registries

One alphabetical line per entry in every registry (commands, systems, content, hooks, advisors, render layers, tools, lenses, panels, art kits, sound cues). Goods and story arcs are append-only. Nobody is ever hurt (P3, P35): no state for injuries or destroyed homes; losses are goods, condition, mood and morale, all recoverable.
