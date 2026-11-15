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
| P2-C | Growth at 01:00 and 13:00 on one day's allowance (save version 7); the bars say where a wanted zone truly stands; the site inspector's honest carrier line; a health kind for a promise never kept | master |
| P2-D | The feed says what the town waits for: sites and their materials, zones wanted, growth on its way or held, hands in one line; waiting markers in the Ledger lens | executor |
| P2-E1 | A gable overhang reads as solid roof: thickness, a dark soffit, a modest verge | executor |
| P2-E2 | The orchard belongs to the valley: no lot rectangle, painted crowns, a shed with surfaces, a window in the gable | executor |
| P2-F | Smoke as soft wisps; close-ups and followed residents drawn sharper under the resolution governor | executor |

After each wave: the quality check, the dead-end hunt (tune and audit on every bench seed, the lanes test, the bench) and the player's chair at 1250 px.

## Acceptance criteria

- [ ] Each of the nine items is fixed or answered, and the As built says how.
- [ ] A test for each fixed bug, and a check for its class: the top bar fits at laptop widths; every roof and every kit stays inside its lot; every demand reason has words; a growth promise is kept or explained (`growth-wait-broken`).
- [ ] R1X's tuning targets (`13-ledger.md`, What holds) still hold on every bench seed with the midday start; the audit runs clean or every flag is explained.
- [ ] A version 6 valley opens (migration 6 to 7, with a test).
- [ ] Typecheck, lint, unit tests, build and bench pass; e2e as far as this machine allows.

## Out of scope

Any change to the shared speed (the owner's call). R2's evening at half speed (`19-evenings.md`). Rows without gaps and joined streets (R2F and V3B). The laptops' Measure tables.

## As built

To be written when the rounds are done.
