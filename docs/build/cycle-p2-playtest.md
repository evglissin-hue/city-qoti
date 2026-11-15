# P2: The R1 playtest (what the town is waiting for)

**Iteration**: R1 to R2. **Wave**: serial, one master session running the build and review loop (`docs/spec/31-parallel-development.md`) with executor waves. **Branch**: `claude/great-maxwell-rlok0k`.
**Depends on**: R1X merged (#40), V2X (#41). **Runs alongside**: R2.0 and V3.0, in another session (`cycle/r2-0-evenings-contracts`, `cycle/v3-0-contracts`); R2.0 runs in parallel in another session and merges P2 when it lands. Save version 7 is P2's (the 6 to 7 migration with the day's growth starts); R2 takes version 8 on top of it.

## Goal

A newcomer on the zones-first Ledger can see, without opening a panel, what the town has, what it lacks, what it wants zoned and why nothing is going up yet. Land zoned in the morning is taken up the same day. The visual defects the owner screenshotted are gone.

## Input: the owner's playtest with Kat (2026-11-15, the R1 build on the live link)

From the recording and five screenshots (a MacBook window about 1250 px wide, Spring day 3 to 5, top speed):

1. "There wasn't very much building happening. Maybe I didn't have enough resources, but I didn't have a way to see that clearly in the UX."
2. "It was hard to read the top bar, couldn't make sense of what I have and don't have." The Charter pill read "Village Charter: ..." with "0 of 5 goals" spilling out of it; the bars read H S W F; the chips were an icon and a bare number.
3. The feed listed "Granary: nobody works here yet", "Market stall: nobody works here yet", "Orchard: nobody works here yet", with no hint what to do.
4. He ran the game at top speed to wait it out, which rushed Kat's decorating ("a bit of a disconnect"). She would like a more laid-back flow.
5. A thatched farmhouse whose roof looked broken: a loose slab hanging off the gable.
6. Neighbors' roofs cutting into each other along a dense street.
7. "The orchard looked quite off, given how the green parts of it look and blend": a pale rectangle on the meadow, faceted trees, a flat red shed, a blank dark gable.
8. Chimney smoke as straight translucent bands, thin white arcs at dusk.
9. A resident seen close up looked soft.

## The owner's calls (asked at the start of the session)

- Speed stays as it is (shared, the last click decides). Fix the waiting instead.
- Fix all four groups of screenshot defects.
- Growth: show the rhythm, and add a midday start on the same two a day; re-run the tuning.
- After P2: nothing more in this session. R2.0 and V3.0 run in another session (the owner's note, the same evening); P2 ends with one PR into `main`, reviewed and merged by that session's master.

## What the trace found

- The four bars say what the town wants zoned, and a lit bar (the dot) means no usable lot waits. Several were lit in both screenshots: the town was asking for land in a way nobody could read.
- Zoned lots started once a day, at 01:00, two a day, three sites at once, and only with half their materials in store or the carrier allowed to buy. A lot more than a storehouse's reach (24 tiles) from every storehouse never starts, and the bar said "the town needs more zoned land" all the same. The R1X autoplayer builds a storehouse toward such lots; a player was never told.
- A waiting site says what it lacks only in its inspector, or under the Status overlay. Nothing town-wide says "building waits for timber". Its line promised "the carrier brings some at ten" even with an empty treasury, when the carrier buys a site's materials with coins in hand only.
- "Nobody works here yet" is a shortage of residents. Jobs fill by themselves as folk move in; the player's lever is Homes.
- Below 1400 px the Charter pill was capped at 8rem.
- The loose slab is the far slope's gable overhang: a paper-thin sheet with a pale underside past the wall.
- Farm lots lay an opaque floor over the whole lot; orchard trees and the shed never took V1's surfaces or V2B's dabs.
- On a Retina screen Medium draws moving frames at half the native resolution, and following a resident keeps the frame moving.

## Tasks

| Id | Task | Owner |
|---|---|---|
| P2-A | Roofs keep to their own lot; no fascia above the eave line | executor |
| P2-B | Top bar at laptop width: the Charter pill in two lines, words on bars and chips, a fit check end to end | executor |
| P2-B2 | The Ledger's strip leads with amounts: Folk and open jobs, Food, Fuel, Timber and Stone against what sites need, on its own row at laptop widths | executor |
| P2-C | A second growth pass at 13:00 on one day's allowance (save version 7), measured against R1X's targets; the bars say where a wanted zone truly stands; the site inspector's honest carrier line; a health kind for a promise never kept | master |
| P2-D | The feed says what the town waits for: sites and their materials, zones wanted, growth on its way or held, hands in one line; waiting markers in the Ledger lens | executor |
| P2-E1 | A gable overhang reads as solid roof: thickness, a dark soffit, a modest verge | executor |
| P2-E2 | The orchard belongs to the valley: no lot rectangle, painted crowns, a shed with surfaces, a window in the gable | executor |
| P2-F | Smoke as soft wisps; close-ups and followed residents drawn sharper under the resolution governor | executor |

After each wave: the quality check, the dead-end hunt (tune and audit on every bench seed, the lanes test, the bench) and the player's chair at 1250 px.

## Acceptance criteria

- [x] Each of the nine items is fixed or answered, and the As built says how.
- [x] A test for each fixed bug, and a check for its class: the top bar fits at laptop widths; every roof and every kit stays inside its lot; every demand reason has words; a growth promise is kept or explained (`growth-wait-broken`).
- [x] R1X's tuning targets (`13-ledger.md`, What holds) hold on every bench seed, and the audit runs clean. With the midday start they did not, so it ships switched off (As built); as shipped, the six seeds' 70 days match `main` figure for figure.
- [x] A version 6 valley opens (migration 6 to 7, with a test).
- [x] Typecheck, lint, unit tests, build and bench pass; e2e as far as this machine allows (As built).

## Out of scope

Any change to the shared speed (the owner's call). R2's evening at half speed (`19-evenings.md`). Rows without gaps and joined streets (R2F and V3B). The laptops' Measure tables.

## As built

| # | Item | As built |
|---|---|---|
| 1 | Could not see why nothing was building | The Ledger's feed says it, each line with something to click: sites waiting for a material ("3 sites need 42 timber, 10 stone; 6 and 4 in store. A Forester's lodge cuts timber."), the carrier's part when it cannot buy, sites waiting for a builder, the zones the town wants ("The town wants more Homes zoned."), a lot that waits and when it starts or what holds it. The zone bars' last reason is the true one (`needsLand`, `noRoad`, `outOfReach`, `unsuitable` with the site want, `materials`, `sitesBusy`, `lotWaiting` with the hour). A waiting site shows its marker in the Ledger lens without the Status overlay, and no longer promises the carrier with an empty treasury or a closed pass. |
| 2 | Could not read the top bar | The Charter pill is two lines and never cuts the goal. In the Ledger the strip is its own row: Folk and open jobs, then a chip a family with its name, the amount in store and days of cover, Timber, Stone and Brick each on their own ("6 of 42" while open sites need more than the stores hold), then Homes, Shops, Workshops, Farmland in words. Cards and side panels sit under it. |
| 3 | "Nobody works here yet", three times | One line: "3 workplaces have nobody yet. 5 jobs are open; more Homes bring more folk." The names are in its hover; a building idle for another reason keeps a line for that reason. The Folk chip shows the same count. |
| 4 | Speed and Kat's pace | Left alone, the owner's call. The waiting it came from is items 1 to 3. |
| 5 | The loose slab on a thatched roof | It was the far slope's verge: a thin sheet with a pale underside past the gable. The verge is now the slab's own edge on both slopes (a barge board on tile, slate and shingle), the soffit is dark, and a gable overhangs 0.05 tiles on both sides. |
| 6 | Roofs cutting into neighbors | Every grown and business kit keeps its roof inside its own lot on sides that are not party walls (`ShellSpec.lot`), with a test over every kit, style, level and 24 seeds. Rows that join are unchanged. Streets without gaps stay R2F's and V3B's. |
| 7 | The orchard's greens | No farm look draws a lot floor any more: the meadow shows through, with soft earth only where ground is worked (beds, a mulch ring by each trunk, the yard by the door). Orchard trees have painted, dabbed crowns in the valley's greens, blossom in spring, fruit in summer and autumn, bare in winter. The shed has board walls, a shingle roof, a door and a window; the farmhouse has a window in its free gable. |
| 8 | Smoke as bands, pale arcs at dusk | The arcs were the smoke: ribbons turned about their own lean collapsed into slivers where it lined up with the view. Ribbons now face the camera, taper and break up toward the top, sway more, show less by day and never go white at dusk. |
| 9 | A resident soft in close-up | Under 20 tiles (off again over 24) or while following a resident, moving frames aim halfway between the preset's moving and still pixel ratios (Medium on a Retina screen: 1.5 in place of 1), still under the dynamic resolution governor and the device's ratio. Low is unchanged. The laptops' Measure tables are the real check of its cost. |

**The midday growth pass: built, measured, switched off.** The owner asked for a second start at 13:00 on the same two a day, on condition that R1X's tuning held. It did not, in any of three forms, over 70 days on the six bench seeds (`npm run tune -w @qoti/bench 70 <seed>`):

| Seed | `main` and P2 as shipped: Village day, residents on day 70, lean days | Midday in an idle town | Midday in an idle town, homes only |
|---|---|---|---|
| oak | 34, 171, 0 | 40, 119, 4 | 42, 133, 0 |
| hazel | 17, 106, 0 | 17, 134, 1 | 16, 52, 0 |
| willow | 29, 113, 0 | 36, 128, 0 | not run |
| birch | 31, 91, 0 | 36, 104, 0 | not run |
| alder | 14, 94, 2 | 14, 88, 2 | not run |
| rowan | 15, 92, 0 | 15, 109, 1 | not run |

The first form, a midday start every day, did not get that far: in the twelve-day audit it left hazel's one builder with seven sites and five of them stalled two days. Sites started half a day sooner cost upkeep sooner, and the Charter's season in surplus slips a season on three seeds. With the pass off, the autoplayer plays the same year command for command (`packages/sim/test/golden/r1-year.json` is unchanged from `main`; only its hash moved, with the new state). The pass, its shared allowance (`state.demand.starts`) and its tests stay in the code behind `GROWTH_MIDDAY` in `packages/sim/src/constants.ts`, for a tuning round that can retune upkeep with it. What ships: growth at 01:00 as before, and a screen that says so ("Building starts at 1:00").

**The loop.** Two waves of executors in worktrees (roofs and the top bar first; then the top bar's second pass, the feed, the verge, the orchard, and smoke with close-ups), the sim work by the master. What the rounds found:

- The first roof executor could not reproduce the slab and fixed a neighbor of it (a fascia above the eave line). The master found it in a gallery close-up and briefed the verge.
- The verge at the far level took three kits a few triangles past their far budgets; the far level draws none.
- The top bar's first pass named everything and still showed days, not amounts; the owner's second note ("what I have and don't have") made the second pass.
- The dead-end hunt caught the midday pass twice (stalled sites on hazel; the tuning above) and the new health kind caught a real case on willow: workshops waiting three nights behind homes and farms while their bar promised a start. That wait now reads `sitesBusy`.
- The trace found a stall no check had: lots zoned beyond every storehouse's porters never grow, and the bar said "the town needs more zoned land". The R1X autoplayer builds a storehouse toward such lots, so the audit never saw it. It now reads `outOfReach`, in the bar and the feed.
- Player's chair at 1250 by 680: the feed said "food for about a day" beside a Food chip saying three (two sources; both read the Balances line now), and cards covered the new strip (they sit under the bar now).

**Contracts** (all additive): `packages/sim/src/contracts/zones.ts`: `DemandReasonCode` gains `noRoad`, `outOfReach`, `unsuitable`, `materials`, `sitesBusy`; `lotWaiting` carries the next pass's hour in `value`; `DemandReason.want?` (a trade's unmet site want: `fertility`, `pollinators`, `fields`, `households`, `reach:<def id>`); `DemandState.starts: { day, n }`. `apps/client/src/render/api.ts`: `RenderApi.setSiteMarkers?(on)`.

**Saves**: `SAVE_VERSION` 7. The migration 6 to 7 adds `demand.starts = { day: -1, n: 0 }` and changes nothing else; a version 6 valley opens and hashes as a fresh version 7 one (`packages/sim/test/r1/saves.test.ts`). R2 takes 8.

**Art and render files touched** (V3 builds on them): `packages/art/src/kits/roofs.ts` (verge, soffit, the fascia guard, `VERGE_OVERHANG`, `soffitOf`), `buildings.ts` (`ShellSpec.lot` and the clamp in `shell()`, the verge), `grown.ts` (`lot` on its shells; the side garden's tree through `orchardTree`), `workshops.ts` (`lot` on its shell), `farms.ts` (no lot floor, `earthPatch`, the shed, the gable window, `lot` on its shells), `village.ts` (`orchardTree`); `apps/client/src/render/layers/effects.ts` (the smoke shader), `layers/overlays.ts` (waiting markers in the Ledger lens), `quality.ts` and `renderer.ts` (the close-up pixel ratio, `setSiteMarkers`), `api.ts`.

**Checks**: typecheck, lint and build pass. Unit tests: 2,230 pass and 3 are skipped; timing budgets (the meadow chunk, ground AO, pattern generation) fail only while other work loads the machine and pass alone. Bench: every line inside its budget on a quiet machine (growth night 1.56 ms median against 1.50 on `main`; the carrier lines 0.30 and 0.34 ms). Audit: no dead-end flags on willow, hazel, oak and birch over a year, nor on hazel through the Village chapter. e2e: see the PR.

**Left for later**: the midday pass, for a tuning round. A zone brush that shows where the porters reach, so land is not zoned out of it in the first place. The Hearth's strip keeps its one row. Rows without gaps (R2F, V3B). The laptops' Measure tables for the close-up ratio.
