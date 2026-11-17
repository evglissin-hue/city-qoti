# R3C: The Town Book and earned callings

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3c-town-book`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: high.
**Depends on**: R3.0. **Runs alongside**: R3A, R3B, R3D to R3G, and V4's wave. **Ports**: client 5243, relay 8853.

## Goal

What the town is known for is discovered where a place and a trade keep meeting. A specialty is a Treat sold at a place to 10 or more customers on four evenings of a season: it gets a name and a page ("Orchard Walk Cider"), counts as one more flavor for households whose round passes the place, sells to neighbors at their full price, can go on a festival menu as a dish of its own, and adds 5 to the place's draw. A custom is a habit the town falls into: the same place drawing 20 or more on the same day of the season three seasons running, or a supply kept every night of a season ("the Lantern Round"); on its day the place draws 15 more, and a custom can be a festival's twist. A page credits both seats when the place and the trade were laid by different seats (Made Together) and is worth 2 renown. Each page leans to industry, gardens or pilgrimage, and three pages of one leaning earn the town that calling, with the effects P1 built where they still make sense.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (the rulings on callings and customs)
- `docs/spec/19-evenings.md`: The Town Book (with R3.0's settled notes), Evening trade (R2B's As built: a sale at a stop), Data and budgets, the R3 acceptance
- `docs/spec/15-progression.md`: Callings (the redesign's text and P1's As built), Achievements (Made Together), Ranks ([R3])
- `docs/spec/12-hearth.md`: The Pattern Book (found pages and hints), Festivals ([R3]); `docs/spec/13-ledger.md`: Households (variety)
- `docs/spec/20-architecture.md`: R3 contracts; `docs/spec/22-quality.md`: the R3 budget row, Playability from the redesign [R3]

## You own

The R3C paths in the wave notes: `packages/sim/src/systems/townbook/**`, `systems/callings/**`, `view/townBook.ts`, `systems/festivals/{api,rewards,score}.ts`; content `townBook.ts`, `callings.ts` and a new `customTwists.ts`; tests `packages/sim/test/r3c/**`.

## You can rely on

- R3.0: `TownBookState` (pages, hints, callings), `WorldState.calling`, `PlaceState.customers`, `goodEvenings`, `dayRuns`, `DrawParts.specialty` and `custom` (the draw already adds `placeSpecialty` and `customToday`), `specialtiesOnRound` (the baskets' variety reads it), `townBookSale` (`recordSale` calls it once a sale at a place), `specialtyGood` (the carrier's sale percent asks it), `customFound` and `FestivalTwistDef.custom` (a custom's twist waits for its page), `callingRoom` (wired into `capacityOf`) and `callingLanternCharm` (wired into charm's lit lanterns), `townBookView` (real; fill what it lacks), `CharterView.callings` (real), the `townbook` system (81, 21:20) and `callings` (88, 15:00), the `townBookPages`, `pagesTogether` and `callings` counts, Made Together. Content: 21 specialties and 13 customs with their leanings, words and hints; P1's three callings with `leaning`, `room` (Mill Town: the Windmill and the Sawmill), `visitors`, `festival`, `lanternCharm`, `signature`; `TOWN_BOOK`; `callingPhrases.earned` and the `calling` Chronicle template.
- R2A's places and rows, R2B's sales at stops, R2C's credit helpers (`placeCredit`, `buildingCredit`), the Pattern Book's hints and `addRenown`; R3A's `PlaceState.supplied` and R3B's masters' goods as they land; P1's callings code at the `chains-final` tag (`git show chains-final:packages/sim/src/systems/callings/index.ts` and its kin) for the visitors, the festival draw and the lantern light.

## Tasks

1. **The counts**: `townBookSale` counts customers by good tonight on the place's row; at 21:20 the close turns them into evenings at `specialtyCustomers` or more this season by good (`goodEvenings`, by absolute season index), keeps `dayRuns` (seasons running the place drew `customVisitors`+ on each day of the season; a day lost to weather holds the run) and starts tonight's counts again. Bounded, sorted, per-good arrays by good index.
2. **Specialties**: a pair from `content.specialties` (the place is a site of its pattern, its good sold there on `specialtyEvenings` evenings of a season) gets a page and its name (fill `{street}` and `{family}`; a second of the same name takes the place's). Its effects: one more flavor of its family for a household whose members' round passes the place (`specialtiesOnRound`); sold to neighbors at their full price (`specialtyGood`, which the carrier's `cartPercent` already asks); a festival menu may carry it as a dish of its own (`festivals/api.ts`, `score.ts`); `specialtyDraw` on the place's draw (`placeSpecialty`).
3. **Customs**: a day custom (`dayRuns` reaching `customSeasons` on a day of the season, at a site of its pattern, or its host) or a supply custom (a place's pieces of that kind kept every night of a season, from R3A's `PlaceState.supplied`); a page, `dayOfSeason` for a day custom, `customDraw` on its day (`customToday`); a custom's twist: one FestivalTwistDef with `custom` set for each custom worth a twist, in `customTwists.ts`, scored in `score.ts`.
4. **Credit and reward**: both seats when the place and the trade's zone or specialized building were laid by different seats (Made Together; for a custom, the place's seats), else the one; `pageRenown`; a Chronicle line and a letter in the town's voice; `townBook.updated`.
5. **Hints**: three pages not yet found at a time, as the Pattern Book hints, never one this valley cannot produce (its land, its trades, its rank, its masters' goods); finding one reveals the next.
6. **Callings earned**: three pages of one leaning earn its calling; a town may earn several, in order (`TownBookState.callings`; keep `WorldState.calling` the first). On earning: `callingPhrases.earned` as a County letter, the Chronicle line, the signature piece unlocked, `charter.updated`. Effects (the rulings): Garden Village's day visitors at 15:00 (P1's numbers in `TOWN_BOOK.visitors`, booked as visitors, a weekly line); Pilgrims' Rest's festival draw (a fifth more guests, one more renown at 2 stars; `festivals/api.ts`, `rewards.ts`) and +1 light on lit lanterns (`callingLanternCharm`); Mill Town's room for one more workshop in the reach of each mill (`callingRoom`). No yield line, no style lean (that waits for I4).
7. **Achievable**: no hint, page, menu dish or twist is offered that content or this valley cannot produce; the static check covers every pair and custom (its pattern or host and good exist and some valley can make both). The audit's page kind is R3E's.
8. Tests: a specialty found by example and its four effects; both kinds of custom and the 15 on its day; a day lost to weather holds a run; Made Together only when two seats laid the pair; renown once a page; hints that never name the impossible; three leanings and a calling, then a second; a joining seat reads the same pages and draws; a year hashes the same twice; the close inside the shared 1 ms an hour, by one line in R3E's scene list.

## Acceptance criteria

- [ ] `grep -rn "R3 stand-in (R3C)" packages apps tools --exclude-dir=dist` is empty; Made Together has a setup in `hearth/achievements.test.ts` and leaves `PENDING`.
- [ ] Six Town Book pages can be found by the autoplayer's two seats and one calling is earned (R3E's runs are the evidence; each miss measured for R3X).
- [ ] A specialty adds one flavor to the variety of a household whose round passes its place and 5 to its draw; a custom adds 15 on its day (headless tests).
- [ ] Made Together credits both seats exactly when two seats laid the pair; no hint names a page the valley cannot produce.
- [ ] Budgets hold; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

The Town Book's panel, the Charter board's calling line, the goal pill and the storybook (R3D, R3G); supplies (R3A); masters and their goods (R3B); advisors (R3E); pictures on the pages (V4B through `ui/pictures.ts`).

## Notes

- "Kept like the Pattern Book": found pages, and hints for three not yet found. The Pattern Book's detectors are the model; read their scans, never repeat them, and never scan the town each tick: the close is once an evening.
- Callings come back as saved state with no command: `calling.choose` stays removed, and nothing offers a Calling card.
- A specialty is one more flavor for variety, never a new good for the Ledger to wire (`13-ledger.md`, The five rules). The round sells Treats, so every pair's good is a Treat.
- Write pages and names in the town's voice: warm, dry, US spelling, no em dashes.
- Do not edit `systems/places/**`, `systems/market/**` or `systems/supplies/**`: your effects reach them through R3.0's hooks.
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
