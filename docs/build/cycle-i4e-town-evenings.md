# I4E: The Town's evenings

**Iteration**: I4 Town, wave one. **Wave**: parallel. **Branch**: `cycle/i4e-town-evenings`, from `cycle/i4x-integration`; PR into `cycle/i4x-integration`. **Recommended effort**: xhigh (it hooks the round's planner).
**Depends on**: I4.0. **Runs alongside**: I4A to I4D, I4F to I4H, V5A, V5B. **Ports**: client 5275, relay 8885.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

A Town's evenings grow: the library, the theater, the inn, the post office and the bandstand join the round as places, each with its own reason to go (`19-evenings.md`: the bandstand waits for I4 with the theater and the inn). The inn brings guests: visitors who arrive in the afternoon, take a room, walk the evening round, buy their Treats on the way and leave in the morning, so a good town earns from outside by being a good town (tourism). Captain Wendell Rook, a retired river captain, comes to a Town that has a promenade, moorings and a riverside inn, and Juniper Reed, who drew the bandstand on a green long ago, finally has one to play.

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (Rulings; Lessons, the money and hot paths; File ownership I4E; Handshakes; the order of a day)
- `docs/spec/19-evenings.md`: Places, The round, Evening trade, Good evenings, the bandstand ruling, Masters (story characters), Data and budgets
- `docs/spec/11-residents.md`: Traits (Bookish), Story characters (Captain Wendell Rook, Juniper Reed); `docs/spec/12-hearth.md`: Festivals (music)
- `docs/spec/15-progression.md`: Renown (visitors and tourism coins), Callings (Garden Village's day visitors); `docs/spec/14-challenge.md`: Seasons (visitors arrive in summer), As built C5A (the circus's visitors, view only)
- `docs/spec/22-quality.md`: the lanes test, the round's planning budget; `docs/spec/20-architecture.md`: R2 contracts, I4 contracts

## You own

The I4E paths in the wave notes: a new `packages/sim/src/systems/tourism/**` (with `shows.ts`), `systems/market/round.ts` (a guest's purchase), `systems/stories/**`, `hasBandstand` in `systems/festivals/api.ts`, `view/tourism.ts`; content `eveningBuildings.ts`, `tourism.ts`, Rook's arc and Juniper's mastery in `stories.ts`, Bookish's library wish in `wishes.ts`; tests `packages/sim/test/i4e/**`.

## You can rely on

- I4.0: the library, theater, post office and inn as hosts with seats and shelter (already places on the round), the bandstand as a piece with standing room, rooms on the inn, `TourismState`, `TourismTuning`, `TourismView`, `tourism.updated`, `PlaceView.guests`, `DrawParts.show`, the hooks `guestsTonight` and `guestStops` (called by the planner after residents plan) and `hostShow` (called by the draw), the `tourism` system (85), Rook's arc id, Juniper's mastery field.
- R2A's places and planner (`residents/round.ts`, seats and standing room, `waitPerHour`, the tally), R2B's evening trade (Treats at stops, `recordSale`, `Building.roundSales`), R3A's tavern pouring as its shelf, C5A's circus visitors (agent rows from 2^23, never saved), R3C's Garden Village visitors (outside money booked as `visitors`), C4D's story arcs and letters, R3B's story masters (`StoryArc.mastery`).

## Tasks

1. **The hosts' reasons** (numbers in `eveningBuildings.ts`): the **library** a quiet, sheltered sitting place open in the evening, which Bookish residents favor (their taste) and wish for (a wish template: "a library within N tiles of home", voiced only where one could be built); the **theater** a sheltered host whose show nights add to its draw (`hostShow`; proposed, R3X draft: two nights a season); the **bandstand** a standing place whose band nights add to its draw (`18-eras.md`'s brass band Sundays; proposed, R3X draft: the last day of each season) and which makes `hasBandstand` true for festival music when one stands; the **inn** a host with a common room and rooms for guests; the **post office** as the master rules (open, below). Each serves Treats only as the tavern does if it has an outlet's stock (R3A); proposed (R3X draft): only the inn pours.
2. **Guests** (`systems/tourism/**`; the shape proposed, R3X draft, on `15-progression.md`'s "visitors and tourism coins" and `14-challenge.md`'s summer visitors): from Town rank with an inn standing, guests arrive at the valley gate at 16:00 (how many from renown's level, rooms free, the season with summer most (`14-challenge.md`), and an Old Town standing (I4C, `18-eras.md`)), each takes a room for one to three nights, and leaves at 09:00. Saved rows (I4.0's `TourismState`); drawn as agent rows like the circus's.
3. **Guests on the round** (`guestStops`, called by the planner after residents plan): proposed (R3X draft), each guest plans one to three stops from what room is left, scored as residents score (draw, distance from the inn, crowd), never taking a seat a resident planned; they buy Treats at stops through the same sale path (`market/round.ts`), money from outside booked as `visitors`, and pay for the room (booked the same way). The tally counts guests apart from residents, so the lanes test and the evening goal read the town's own folk.
4. **Captain Wendell Rook** (`11-residents.md`): his arc rewritten for the zones-first town (the R1 rewrite's manner): arrival at Town rank (proposed, R3X draft) and steps that ask for a Promenade by the Water, moorings (the Mooring Post), and an inn within a few tiles of the river; his finale unlocks the Lighthouse landmark (proposed, R3X draft: a fixed building now, which wave two's block builder may rebuild). Letters in his voice: warm, dry, a man who misses the water.
5. **Juniper Reed's mastery** (`19-evenings.md`: "Juniper Reed waits for I4"): open (below); propose to the master what she is master of and what her mastery brings, then build it.
6. **Money, measured**: guests are new outside income. With I4H, add a `debt.ts` category for them and report debt per resident and what guests bring a Town a summer season on every bench seed.
7. **Tests**: each host is a place with its seats and its show nights; a Bookish resident favors the library; guests arrive only with an inn and rooms, more in summer and with an Old Town, stay their nights and leave; guests never take a resident's seat (a full-house test); their purchases book as outside money with the invariant intact; Rook arrives, his steps are met, the Lighthouse unlocks; the planning line with a full inn stays inside 0.4 ms a tick at 2,000 residents; a seat joining at 18:30 reads its partner's guests and stops hour by hour to 22:00; a year hashes the same twice.

## Acceptance criteria

- [ ] `grep -rn "I4 stand-in (I4E)" packages apps tools --exclude-dir=dist` is empty.
- [ ] A headless summer evening in a bench Town with an inn: guests arrive, walk the round, buy Treats and leave; no resident lost a seat to one; the lanes test and the evening goal pass on both profiles with guests on.
- [ ] Every story arc step can be met (the static achievable check); the round's planning line holds its budget with a full inn; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

The new buildings' looks and the bandstand's (V5A, V5B); the inspectors, place card and evening edition lines (I4G); the eight patterns, Bandstand Green among them (I4F); Old Town's rule (I4C); advisors (I4H).

## Notes

- Open: what the post office does. The roadmap names it in I4's scope and the spec says nothing more. Candidates for the master and the owner, none decided: a host on the round; where the County's and story letters arrive; the "postcards" idea from the redesign's unscheduled list (a picture from photo mode sold to guests). Build nothing for it beyond a host until ruled.
- Open: whether guests are saved rows (proposed above, since they take seats and buy, which the sim must agree on) or derived like the circus's visitors.
- Open: Juniper Reed's mastery (masters are of a trade or a specialized building; she is a musician). And whether the theater takes tickets, and whether the chapel and guest house (P1's tourism and pilgrim buildings) belong here: the roadmap's scope does not list them.
- Open: when the library, theater, post office and inn unlock (the owner's call, wave notes 2); proposed (R3X draft): Town rank.
- `residents/round.ts` and `systems/places/**` are nobody's in this wave: I4.0 wired your hooks; keep `guestStops` cheap and return at once with no guests.
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
