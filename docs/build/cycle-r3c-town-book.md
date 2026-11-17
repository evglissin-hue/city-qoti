# R3C: The Town Book and earned callings

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3c-town-book`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: high.
**Depends on**: R3.0. **Runs alongside**: R3A, R3B, R3D, R3E, and V4's wave. **Ports**: client 5243, relay 8853.

## Goal

What the town is known for is discovered where a place and a trade keep meeting. A specialty is a flavor sold at one place to 10 or more customers on four evenings of a season: it gets a name and a page ("Orchard Walk Cider"), counts as one more flavor for households whose round passes the place, sells to neighbors at their full price, can go on a festival menu as a dish of its own, and adds 5 to the place's draw. A custom is a habit the town falls into: the same place drawing 20 or more on the same day of three seasons running, or a supply kept every night of a season ("the Lantern Round"); on its day the place draws 15 more, and a custom can be a festival's twist. A page credits both seats when the place and the trade were laid by different seats (Made Together) and is worth 2 renown. Each page leans to industry, gardens or pilgrimage, and three pages of one leaning earn the town that calling.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md`
- `docs/spec/19-evenings.md`: The Town Book, Evening trade (and R2B's As built: what a sale at a stop records), Data and budgets, the R3 acceptance
- `docs/spec/15-progression.md`: Callings (from the redesign, and P1's As built: the effects and the signature pieces), Achievements (Made Together), Ranks ([R3]: pages and a calling in the later Charters)
- `docs/spec/12-hearth.md`: The Pattern Book (found pages and hints), Festivals ([R3]: a specialty on the menu, a custom as the twist); `docs/spec/13-ledger.md`: Households (variety: a specialty counts one more)
- `docs/spec/20-architecture.md`: R3 contracts; `docs/spec/22-quality.md`: the R3 budget row, Playability from the redesign [R3] (a page content cannot produce)

## You own

The R3C paths in `r3-wave-notes.md`: new `packages/sim/src/systems/townbook/**` (the counts at an evening's close, detection, pages, hints, credit, the `api.ts` bodies: `specialtiesOnRound`, `placeSpecialty`, `customToday`), `systems/callings/**` (back, earned), the specialty dish and the custom twist in `systems/festivals/**` as the wave notes split it, content `townBook.ts` (the pairs, customs, leanings and name patterns) and `callings.ts` (P1's three, earned), `view/townBook.ts`, and their tests (`packages/sim/test/r3c/**`).

## You can rely on

- R3.0's contracts and stubs: `state.townBook` (pages, hints), callings earned, the place rows' counts (customers by good, evenings at 10+ this season by good, visitors by day of the season), `DrawParts.specialty` and `custom` (the draw reads your stubs), `specialtiesOnRound` (the baskets' variety reads it), the Town Book and callings content shapes, `townBook.updated` and `TownBookView`, the `townbook` and `callings` slots, the `CountWhat`s for pages and callings, Made Together with its condition.
- R2A's places and rows (`recordVisit`, `recordSale`), R2B's sales at stops by good, R2C's credit helpers (a piece credits its `builtBy`; a business grown on a lot credits the seats in the Ledger lens), the Pattern Book's hints, `addRenown`; R3A's supplies (a supply kept every night, by place) and R3B's masters' goods as they land; P1's callings, effects and signature pieces in git (the `chains-final` tag holds `content/callings.ts`).

## Tasks

1. **The counts** at each evening's close: customers by good at each place (from the sales R2B records), evenings at 10+ this season by good, visitors by day of the season over three seasons; bounded, sorted, per-good arrays by good index; a season's turn rolls them.
2. **Specialties**: a flavor sold at a place to 10+ customers on four evenings of a season, where the pair is in the table (about 20 pairs of pattern and good), gets a page and a name from the place and the good ("Orchard Walk Cider": cider at an Orchard Path). Its effects: one more flavor of its family for a household whose round passes the place (`specialtiesOnRound`, read by the baskets' variety); it sells to neighbors at their full price (through the hook the wave notes name); a festival menu may carry it as a dish of its own; and 5 on the place's draw.
3. **Customs**: the same place drawing 20 or more on the same day of three seasons running, or a supply kept every night of a season (R3A's counts); a page and a name; 15 on the place's draw on its day; a festival may take it as its twist.
4. **Credit and reward**: both seats when the place and the trade's zone or specialized building were laid by different seats ("Made Together"), else the one; 2 renown a page; a Chronicle line and a letter in the town's voice.
5. **Hints**: three pages not yet found at a time, as the Pattern Book hints, never one this valley cannot produce (its land, its trades, its rank); finding one reveals the next.
6. **Callings earned**: each page's leaning; three pages of one leaning earn the town that calling, and a town may earn more than one. Its name on the Charter board, its signature piece unlocked (and for valleys already past it), its effects as P1 built them (Garden Village's day visitors, Pilgrims' Rest's festival draw and lantern light) and Mill Town's room for one more workshop in the reach of each mill in place of P1's yield line (no calling is a percentage); the style lean as the rulings say (P1 built it as style weights on the lots that pick their style from the land; I4 brings districts).
7. **Counts and feats**: pages and callings for the later Charters (two pages for Town, six for Market Town, a calling for City; those Charters come in I4 and I5); Made Together.
8. **Achievable**: no hint, page, menu dish or twist is offered that content or this valley cannot produce; the static check covers every pair (its pattern and good exist and some valley can make both), and the audit's page kind is R3E's to run.
9. Tests: a specialty found by example and its four effects; both kinds of custom and the 15 on its day; Made Together only when two seats laid the pair; renown once a page; hints that never name the impossible; three leanings and a calling, then a second; a joining seat reads the same pages; a year hashes the same twice; the Town Book's close inside the shared 1 ms an hour, added by one line to R3E's scene list.

## Acceptance criteria

- [ ] `grep -rn "R3 stand-in (R3C)" packages apps tools --exclude-dir=dist` is empty.
- [ ] Six Town Book pages can be found by the autoplayer's two seats and one calling is earned (R3E's runs are the evidence; each miss measured for R3X).
- [ ] A specialty adds one flavor to the variety of a household whose round passes its place and 5 to its draw; a custom adds 15 on its day (headless tests).
- [ ] Made Together credits both seats exactly when two seats laid the pair; no hint names a page the valley cannot produce.
- [ ] Budgets hold; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

The Town Book's panel, the Charter board's calling line and the storybook (R3D); supplies (R3A); masters and their goods (R3B); advisors (R3E); pictures on the pages (V4B).

## Notes

- "Kept like the Pattern Book": found pages, and hints for three not yet found. The Pattern Book's detectors are the model; read their scans, never repeat them.
- Callings come back as saved state with no command: `calling.choose` stays removed, and nothing offers a Calling card.
- A specialty is one more flavor for variety, never a new good for the Ledger to wire (`13-ledger.md`, The five rules).
- Write pages and names in the town's voice: warm, dry, US spelling, no em dashes.
- Do not edit `systems/places/**`, `systems/market/**` or `systems/supplies/**`: your effects reach them through R3.0's stubs.
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
