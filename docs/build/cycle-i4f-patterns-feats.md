# I4F: The eight patterns and the feats

**Iteration**: I4 Town, wave one. **Wave**: parallel. **Branch**: `cycle/i4f-patterns-feats`, from `cycle/i4x-integration`; PR into `cycle/i4x-integration`. **Recommended effort**: high.
**Depends on**: I4.0. **Runs alongside**: I4A to I4E, I4G, I4H, V5A, V5B. **Ports**: client 5276, relay 8886.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

The Pattern Book gains the Town's eight pages (`12-hearth.md`, I4: Arcade Street, Quiet Lane, Festival Ground, Allotments, Riverside Steps, Rooftop Garden, Bandstand Green, Old Tree Sanctuary), each a place on the evening round with seats and a kind of its own (every pattern site is a place since R2), each with a rule a player can read and meet, a site bonus, an unlock and a hint; and the achievements grow by the Town's feats, never "build 100 roads" (P42).

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (File ownership I4F; Handshakes)
- `docs/spec/12-hearth.md`: Charm, the Pattern Book (the I1 to I3 tables and their As built: how a rule is written, measured and hinted; playtest round six's closest attempt), Decorating that composes itself (layouts); `docs/spec/18-eras.md`: Age of Steam (the era's patterns)
- `docs/spec/19-evenings.md`: Places (kinds: sit, eat, view, play, meet, walk), The Town Book (each page pairs a pattern and a Treat)
- `docs/spec/15-progression.md`: Achievements (the I4 rows), Callings; `docs/spec/22-quality.md`: the patterns pass budget, Playability (the achievable check)

## You own

The I4F paths in the wave notes: `packages/sim/src/systems/hearth/patterns/detectors/{arcadeStreet,quietLane,festivalGround,allotments,riversideSteps,rooftopGarden,bandstandGreen,oldTreeSanctuary}.ts` and their registry lines, `conditions/i4.ts` (the bodies of `oldFriends`, `reformedBond`, `fifteenMinuteTown`); content `townPatterns.ts`, `townDecor.ts`, `townAchievements.ts`; tests `packages/sim/test/i4f/**`.

## You can rely on

- I4.0: the eight pattern ids with their unlock piece ids (never detected), the feats' ids in `PENDING`, the counts stubbed and wired into conditions, the bandstand piece and the new hosts' ids (I4E builds them), `Building.era` (for any rule that reads it).
- C3B's patterns engine, detectors, discovery credit, Built Together and hints; playtest round six's progress words (`patterns/progress.ts`); R1D's layouts (Lay it out); R2A's places from every site; R3C's Town Book pairs (a new pattern may pair with a Treat: say so to the master, who decides whether `content.specialties` gains a page); C5C's modules (the arcade), R1D's garden bed (allotments), C4B's stairs (riverside steps).

## Tasks

1. **The rules** (`townPatterns.ts`; `12-hearth.md` says rules are written in their iteration's planning cycle, and the spec gives only the names): write each rule in the manner of the I2 and I3 tables (a few countable conditions on pieces, roads, water and buildings, readable in one sentence, with its closest attempt in words), and send the eight to the master before building detectors. The spec gives only the names, so these starting points (proposed, R3X draft) are read from each name and the nearest line the spec has; each is an idea for the master to accept or rewrite, not a rule:
   - **Arcade Street**: a street run with three or more shops side by side carrying the arcade module (C5C), with lamps along it (`18-eras.md`'s Shopping Arcade).
   - **Quiet Lane**: a lane run of some length with homes along it, low noise along all of it, and seats.
   - **Festival Ground**: an open space of a size where the festival has been held, with seats and the festival's pieces.
   - **Allotments**: several garden beds together with a path among them, a shed and a water source.
   - **Riverside Steps**: stairs down to the water by a path, with a seat and a lantern.
   - **Rooftop Garden**: open (below).
   - **Bandstand Green**: a bandstand (I4E's piece) on a lawn with seats around it and trees (`18-eras.md`'s Victorian Park with a bandstand; Juniper Reed's finale named "bandstand on a green").
   - **Old Tree Sanctuary**: a mature tree of great age with no building within some tiles, seats and wildflowers around it.
2. **Detectors** (one file each): positive and negative fixtures; the closest attempt for the Pattern Book; hints in `hintOrder` after the I3 ones, looked for from Town rank (each pattern's `rank`); layouts for those that suit Lay it out. Detectors scan only the pieces their rule names (as C4C and C5C did), so the whole patterns pass, with I4C's Old Town, stays under its budget (I4.0's row, proposed 1 ms an hour at Village scale).
3. **Site bonuses and unlocks**: charm by kind and radius as the tables give; each unlock a piece in `townDecor.ts` with an existing kit until V5B draws it; any piece added to an unlock list a valley may already hold needs R2.0's migration lesson (say so in the PR if it applies).
4. **Each a place**: check that each site, as a place, gets seats and a kind from its pieces (R2A's rules) and a draw a resident would walk to; a site with no seats is a page no evening uses: say so for the master.
5. **The feats** (`townAchievements.ts`): the I4 rows of `15-progression.md` (The 15-Minute Town: every home within 15 walking minutes of food, work and a green; Contract Kept: 5 contracts, counted by I4D; Reformed: a former bandit at bond 5; Old Friends: two residents friends at level 5 for 2 years) and the master's additions (proposed, R3X draft: A Town Now, beside A Village Now; I4A writes its setup). Bodies of the counts in `conditions/i4.ts`, each cheap (no route search for The 15-Minute Town on every hour: reuse R2's reach or the carrier's distances).
6. **Tests**: each detector's fixtures; every new page and hint can be met (the static achievable check); each site is a place with seats; each feat unlocks once with a setup and leaves `PENDING` (Contract Kept's setup is I4D's); the patterns pass budget; a year hashes the same twice.

## Acceptance criteria

- [ ] `grep -rn "I4 stand-in (I4F)" packages apps tools --exclude-dir=dist` is empty; `PENDING` holds no feat of yours.
- [ ] The eight pages are found in headless fixtures and, on some bench seed or a scripted scene, in an autoplayed Town; each reads its closest attempt in words.
- [ ] The patterns pass with nine new detectors stays under its budget; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

Old Town (I4C), the bandstand and the new hosts themselves (I4E), the unlock pieces' looks (V5B), the Pattern Book's panel (it reads content; I4G checks it in place), advisors following the hints (I4H).

## Notes

- Open: Rooftop Garden is in `12-hearth.md`'s I4 list and in `18-eras.md`'s Bright Age list, and nothing in the game has a roof anyone can stand on. The owner's call (wave notes, For the owner to confirm, 5); if it stays in I4, propose a rule that needs no new building shape.
- Open: whether `18-eras.md`'s Glasshouse and Canal Promenade (Steam patterns) are later pages (the Canal Promenade needs wave two's canals).
- Open: whether any of the eight pairs with a Treat in the Town Book (R3C); proposed (R3X draft): the master decides after the rules.
- Every rule and number is *(tune)*; write the final rules into `12-hearth.md` (an I4 table, as C4C and C5C did) in the PR.
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
