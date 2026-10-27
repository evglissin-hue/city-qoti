# C5D: Threats, defenses and the Watch

**Iteration**: I3. **Wave**: parallel. **Branch**: `cycle/05d-threats-watch`.
**Depends on**: C5.0 merged. **Runs alongside**: C5A to C5C, C5E, C5F. **Ports**: client 5194, relay 8804.

## Goal

A light, fair defense layer (P35, P36): pressure grows with the town's wealth, not the clock, and a raid is always telegraphed two days ahead (tracks in the snow, crows gathering, a scout's letter) with its side and strength. The Ledger builds palisades, gates, a watchtower, a bell tower and traps and keeps a volunteer Watch; the Hearth's fences, hedges and lanterns slow and dishearten raiders; at dusk the raid plays out on its own, in view, and nobody is hurt. Winter wolves prowl the forest edge on winter nights and only frighten. Captured bandits can be offered a home. Barnaby Ashcombe, a stonemason, arrives to teach walls and the Watch.

## Read

- `CLAUDE.md`, `docs/build/i3-wave-notes.md`, `docs/spec/20-architecture.md` (I3 contracts)
- `docs/spec/14-challenge.md` (all)
- `docs/spec/01-principles.md`: P3, P35 to P37, P39
- `docs/spec/11-residents.md`: Mood (raid fright), Bond (Watch volunteers), Story characters (Barnaby Ashcombe)
- `docs/spec/12-hearth.md`: Lantern Walk, Hedgerow Lane (night safety, hedgerows), later patterns (Town Gate, Watch Lookout)
- `docs/spec/13-ledger.md`: Services (Watch House), Levers (Watch size and budget, gate rules)
- `docs/spec/15-progression.md`: Achievements (The Gate Held)

## You own

`packages/sim/src/systems/{threats,watch,raids,defenses}/**`; the `wall.*`, `gate.set`, `watch.*` and `bandit.decide` commands; wall and gate rules in `src/rules` (with `canPaintWall` for the client) and gates in movement through C5.0's passable flag; your walk and schedule hook registrations; content for threats, defense pieces, the Watch House, the Reformed trait, Town Gate and Watch Lookout patterns, The Gate Held, the `stonemason` story arc (Barnaby Ashcombe) and your Chronicle kinds; `view/season/threat.ts`; your tests, `tools/bench/src/advisors/watch.ts` and `tools/bench/src/raids.bench.ts`.

## You can rely on

C5.0's threat, watch, raid and trial state, the `threats` stream, the threat fixture and `raidAtDusk()`, agent flags, the walk and schedule hooks; C3A's movement and A* (`networkVersion`), mood and bonds; C3B's Lantern Walk and Hedgerow Lane sites; C3C's condition and repairs; C5A's `forecast` (fog) and `seasonNow`; C5B's `festivalMorale` and `addRenown`.

## Tasks

1. **Pressure** (80, 00:40): wealth `W` as in the spec, pressure rising by `W / k(rank) x dial` and falling with deterrence (wall coverage of storehouses and the market, tower coverage, lantern lines, Watch strength). On day 1 of each season above the threshold, schedule one raid for day 3 to 5 at dusk with strength from pressure; never before Village rank; Peaceful has none; Fierce lowers the threshold to 0.6x and raises strength 1.5x. Write `k`, the threshold and the deterrence weights into `14-challenge.md`.
2. **Telegraphing**: signs two days ahead (tracks in snow in winter, crows gathering, a scout's or merchant's letter), the approach side and band (Small, Medium, Large) in `ThreatView` and an alert; a watchtower adds a day; fog shortens it as the wave notes decide, never below one evening of warning. A raid is never a surprise.
3. **Defenses**: palisade (blocks, 100 hp, logs) and stone wall (400 hp, stone; unlocked by Barnaby's arc in I3) painted as runs with `wall.paint`; gates (passable for residents and carts while open, close when the bell rings, `gate.set`, gate rules lever); watchtower (crew of 1 or 2, morale loss in 6 tiles, +1 day warning); bell tower; pit and net traps (one shot); fences and hedges slow raiders (`DecorDef.slows`) and wolves avoid fenced farms; lantern lines (lit tiles) hold off night threats, doubled on a Lantern Walk. Walls must never cut a home, workplace or storehouse off from the valley gate (`WOULD_ENCLOSE`), so nothing can deadlock residents or porters.
4. **The Watch** (82): adults with bond 2+ volunteer once a Watch House stands, up to the Ledger's target; members spend 1 day in 4 on duty (away from their job) and all turn out on a raid day; strength = members x training (1.0 to 1.6, raised over time with the Watch budget) x morale (town mood, `festivalMorale`, friendships among members, past victories); posture: up to 3 guard points. The budget pays members a stipend with `pay()` so the coins stay in the valley.
5. **Raid resolution** (84 and 86, every tick while a raid runs): the spec's seven steps exactly (spawn at the telegraphed edge at dusk, morale 10 and 8 units each, paths to valuable targets, walls broken by hp over time, towers and the Watch draining morale, flee at 0 or captured with 2+ Watch adjacent, take up to 8 of the most valuable goods and 20% condition, recover goods from captives, end at dawn). Player actions: ring the bell (everyone indoors, gates shut), light all lanterns, open or close gates, pause and watch. Residents caught outside get a fright (-10 mood); nobody is ever hurt; shaken Watch members rest a day.
6. **After**: the result card's data (goods lost, damage, captures, renown if repelled through `addRenown`, morale change), a Chronicle entry marked for a snapshot, The Gate Held, and for each captive `bandit.decide`: a home (a new household with the Reformed trait and bond 0; some become the best workers, +10%, with a small story line) or send them off (renown +1). Goods stolen leave the valley as goods only; no money moves.
7. **Winter wolves**: on a few winter nights (howling the evening before), wolves come from the forest edge, avoid lit tiles and fenced farms, frighten residents still outdoors, and at an unfenced, unlit outlying farm scare the animals (that building's output drops for a day); they flee at dawn. In the first Hamlet winter they only howl at the forest edge (the tutorial); on Peaceful they only howl.
8. **Patterns**: Town Gate (a gate in a wall run with lanterns and a dressed wall beside it) and Watch Lookout (a watchtower with a bench and a view over a lane or the river); rules written into `12-hearth.md`, unlocks, fixtures. Dressed walls count for charm through C5C's modules (P37).
9. **Barnaby Ashcombe** (`stonemason` arc, badger): arrives once the Village has a quarry and a raid has been telegraphed (or as the wave notes decide); 4 to 6 steps that teach the palisade, the Watch House, posture, a stone wall dressed by the Hearth and a proper bridge; finale: the Stone Bridge landmark.
10. **Season report**: fill `view/season/threat.ts` (pressure band, deterrence, raids and wolves).
11. **Autoplayer**: an advisor that builds a Watch House at Village rank, sets a modest target, rings the bell when a raid starts, rings a palisade with a gate round the main storehouse when a raid is telegraphed, sets posture on the most valuable store, and offers captives a home when the town has room. It never takes more volunteers than the labor budget allows.

## Acceptance criteria

- [ ] Pressure, deterrence and scheduling tested per term; no raid before Village rank or on Peaceful; at most one a season; Fierce follows the dial.
- [ ] Every raid is telegraphed at least one evening ahead in every weather (property test over seeds and fog).
- [ ] Raid resolution is deterministic: the threat fixture's raid replays to the same hash twice and in a browser worker (extend `determinism.spec.ts`); each step of the spec has a test (walls, gates, towers, traps, contact, flee, capture, theft, recovery, dawn).
- [ ] Walls never enclose a home, workplace or storehouse (property test); residents route through open gates; the bell sends everyone indoors.
- [ ] Watch volunteering, duty, training, morale and posture tested; the stipend keeps the money invariant across a season and a raid.
- [ ] Wolves, the Hamlet tutorial, both patterns, The Gate Held and Barnaby's arc tested in fixtures.
- [ ] Autoplayer with every system on: the first Village raid on seeds willow and hazel is telegraphed, the town loses no more than a fifth of the targeted store and recovers within a season, and labor never starves (report losses, Watch size and jobs filled in the PR).
- [ ] Bench: a Large raid (12 raiders, 8 Watch) adds under 0.5 ms per tick at 150 residents; the daily threat pass under 1 ms.
- [ ] Definition of done.

## Out of scope

Seasons, fog and snow (C5A); festivals and renown rules (C5B); module dressing on walls (C5C); raiders, wolves, walls and the Watch on screen (C5E); the Watch panel, threat alerts and result card (C5F); bandit camps, expeditions, the great owl and river raiders (I4).

## Notes

- **Cozy, with real stakes, never cruel** (P3, P35, P36): every raid fair and telegraphed, no unit control, nobody hurt, every loss recoverable. When in doubt, choose the gentler rule and write it into the spec.
- **Labor**: the Watch takes people off their jobs one day in four and all on raid days. In I2, four tracks each added building logic to the autoplayer and together they overbuilt and starved labor. Check jobs filled with your systems on, and keep your advisor's wants inside the planner's labor budget.
- **Money**: the Watch budget is `pay(treasury, household)`; training gear, if any, is a small `book('watch')`; walls and towers book their construction as usual. No new cost may drain a Village with no external income (an I2 dead end).
- Walls change walkability: bump `networkVersion` and keep path caches honest. A wall that strands a porter is a deadlock; test it.
- Isolate unit tests with `withoutSystems`, and do not assume other systems are absent (C5B's festival and your bell meet in C5X: the bell wins).
- Do not pin exact texts or numbers where content can be read (raider counts per band, letters).
- Stand-ins (a forced raid date, a fixed strength) go in the wave notes' stand-ins table with how to remove them.
