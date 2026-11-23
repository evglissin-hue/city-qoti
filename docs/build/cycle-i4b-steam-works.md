# I4B: Steam works, coal and smoke

**Iteration**: I4 Town, wave one. **Wave**: parallel. **Branch**: `cycle/i4b-steam-works`, from `cycle/i4x-integration`; PR into `cycle/i4x-integration`. **Recommended effort**: xhigh.
**Depends on**: I4.0. **Runs alongside**: I4A, I4C to I4H, V5A, V5B. **Ports**: client 5272, relay 8882.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

The Age of Steam changes how the Ledger plays (`18-eras.md`, Age of Steam, from the redesign). Once the Steam Engine is invented, the Ledger can site a steam mill: more workshops of one kind can set up in its reach, and it works through a frozen winter, but it burns coal and makes smoke. Smoke drifts downwind and lowers charm there, and with it the draw of every place and the pull of every home it reaches, so where industry goes is an argument between the lanes (P2). The Glassworks makes glass on the river's sand; the Printing Press opens with a library. Coal is the one new raw good, joining Fuel; in this wave it comes by the cart from Stonecross (proposed, R3X draft).

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (The split; Rulings; File ownership I4B; Handshakes)
- `docs/spec/18-eras.md`: Rules (the era opens the palette, innovations bring the machines), Age of Steam (with the redesign's note)
- `docs/spec/13-ledger.md`: Goods, Land and specialized buildings, The carrier and trade, The season plan, Population tiers (the Merchants' upgrade)
- `docs/spec/15-progression.md`: Innovations (the R1 note: rows open specialized buildings, never a percentage); `docs/spec/12-hearth.md`: Charm (sources, the chunk recompute)
- `docs/spec/19-evenings.md`: Places (the draw is mostly charm); `docs/spec/20-architecture.md`: R3 contracts (`BuildingDef.levels`), I4 contracts

## You own

The I4B paths in the wave notes: a new `packages/sim/src/systems/steam/**`, `systems/production/**`, `systems/specialized/**`, `systems/innovations/**`, `view/steam.ts`; content `steam.ts`, `steamBuildings.ts`, the coal and glass numbers in `goods.ts`, the three rows in `innovations.ts`; tests `packages/sim/test/i4b/**`.

## You can rely on

- I4.0: coal (Fuel, raw) and glass (Materials) in the goods, Stonecross's coal from Town rank, the steam mill, Glassworks and Printing Press defs with stand-in numbers, the three innovations with conditions that never hold, `SteamTuning`, the `steam` system (61), `smokeAt` wired into charm's compute, `buildingSmoke` into `BuildingView.smoke`, `steamRoom` into `capacityOf`, `windOf(state)` (real), `valleyEra`.
- R1's specialized buildings (reach, `capacity`, `enables`, the site rules), `build.pinRecipe` (a pinned trade), R1A's carrier (essentials: a raw good a business rests for; Fuel's reserve and winter mark), C5A's frozen river (water wheels stop), the charm system's chunk recompute and `markChunks`, R3H's `BuildingDef.levels`.

## Tasks

1. **The Steam Engine** (proposed, R3X draft, for the smithy the old row names: Town rank, coal in stock and a Brickworks standing): unlocks the steam mill. The era alone opens nothing to build (`18-eras.md`: the morning after, builders know brick and slate; the first steam mill waits for its innovation).
2. **The steam mill**: a specialized building with a reach along the roads as R1 built them, pinned to one trade when sited (proposed, R3X draft: through `build.pinRecipe`) and making room for more workshops of that trade in its reach (`steamRoom`, added in `capacityOf` beside R3B's `masterRoom` and R3C's `callingRoom`); it burns coal by the day's work (numbers in `steam.ts`) and keeps working through a frozen river, where a water wheel stops. Without coal it rests, and (proposed, R3X draft) the carrier buys coal for it as a raw good a business rests for (R1A's essentials) under the Fuel family's rule. Levels through R3H's `levels` if the master wants them.
3. **Smoke** (`systems/steam/**`; the shape proposed, R3X draft): at 06:00 each works' smoke for the day from yesterday's coal burned; `smokeAt(state, i)` is a pure function of the works' saved smoke and `windOf` (a plume running downwind some tiles, fading; numbers in `steam.ts`), never a cached field; it lowers charm there (charm calls it per tile in its compute). Mark the charm chunks under the plume when a works' smoke or the wind changes (`markChunks`). `buildingSmoke` feeds `BuildingView.smoke` for V5B's plume and I4G's overlay.
4. **The Glassworks** (`15-progression.md`: sand and a brick kiln): proposed (R3X draft), a specialized building sited on the river's sand (a `NEEDS_SAND` site rule on the `sand` terrain beside the water, since sand deposits are wave two's) once the Brickworks stands; it makes glass from firewood or coal, and smokes like a works if it burns coal. Glass is a Materials good for the Merchants' upgrade (I4.0's call) and the era's pieces.
5. **The Printing Press** (`15-progression.md`: "library and paper mill"; I4's planning names what stands in): proposed (R3X draft), a library standing and a Sawmill. What it does is open (below).
6. **Coal by the cart**: confirm the carrier buys coal from Stonecross from Town rank with its Fuel rule and reserve, that the winter's marks count coal in Fuel, and that the closed pass stops it like any import (so a steam town puts coal by for winter). Measure what coal costs a Town a season with `tools/bench/src/debt.ts` (the wave notes' lessons): it is a new sink.
7. **Tests**: the Steam Engine unlocks on its condition and not before; a steam mill makes room for one trade's workshops in its reach and none outside it; it burns coal, rests without it, and works through a frozen river; smoke lowers charm downwind by the wind of the day and not upwind, and a place under the plume draws less (through charm); `smokeAt` equals a full rebuild at every hour of an autoplayed Town year with smoke (a seat joining reads the same); the Glassworks sites only on sand by the water; the money invariant through coal bought and glass made; a year hashes the same twice; bench lines for the smoke settling and `smokeAt` at City scale, by one line in I4H's scene list.

## Acceptance criteria

- [ ] `grep -rn "I4 stand-in (I4B)" packages apps tools --exclude-dir=dist` is empty.
- [ ] A headless Town builds a steam mill after the Steam Engine, grows extra workshops of its trade in its reach, burns coal the carrier brings, works through a frozen winter and smokes downwind; a place under its plume draws less than the same place upwind.
- [ ] The smoke settling stays under its budget (I4.0's row, proposed 1 ms a day at City scale) and charm's chunk recompute stays inside its own; a year hashes the same in Node and a browser worker; the lanes test passes on both profiles; typecheck, lint, unit tests and build pass.

## Out of scope

Coal pits and seams, coal by barge (wave two), the mill quarter's late shift (I4C), drawing works, stacks and plumes (V5A, V5B), the smoke overlay and inspector lines (I4G), advisors that site works (I4H).

## Notes

- Smoke works through charm only (the wave notes' proposed call): do not add a second hook to the draw or desirability. Read R2's place index rule before touching anything a place reads: charm is a moving part of the draw.
- Keep `smokeAt` cheap: charm calls it per tile in every chunk it recomputes. A works list sorted by tile and a bounded plume, never a scan of the town.
- Open: whether households may burn coal as a Fuel flavor in winter, and whether a home's coal smokes (I4.0 settles). Until it rules, keep coal off households' Fuel purchases.
- Open: what the Printing Press does in a zones-first town, where an unlock is a capability and never a percentage (P6); the old row says "newspaper: +bond, +renown". Bring the master a proposal; do not build an effect the spec does not name.
- Open: whether a steam mill's "more workshops of one kind" means one trade chosen at siting (proposed above) or every workshop trade in its reach.
- Every number is *(tune)* and lives in `steam.ts` and `steamBuildings.ts`.
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
