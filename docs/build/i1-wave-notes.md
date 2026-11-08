# I1 wave notes: how the tracks meet

Read this with your brief. C3.0 fixed the types and signatures (`docs/spec/20-architecture.md`, "I1 contracts"); these notes fix the runtime handshakes between tracks, so the pieces fit when C3X merges them. If something here is wrong for your track, do the sensible thing, keep it additive, and say so in your report.

## Who drives a resident

- **C3A owns every resident's `activity`, `move`, `inside`, `tile`** and the movement system that advances walks (A* plus walking, replacing the teleport stub in `systems/movement/api.ts`).
- **Jobs**: C3A assigns residents to `rt.workers` (any `jobs.role`: worker, builder, porter, vendor), releases them when a building disappears, and keeps `rt.present` equal to the workers inside the building.
- **Work hours** (08:00 to 17:00, shifted by Early Bird and Night Owl): C3A walks workers to their workplace door (`doorTile`) and puts them inside (`enterBuilding`).
- **Porters and builders** (C3C): during work hours C3C may take a worker of role `porter` or `builder` who is present (inside its workplace or at its door, not walking) and set `activity = { kind: 'task', taskId }`. From then on **C3C** moves them with `requestMove` and checks arrival with `isAt`; C3A's schedule leaves a `task` resident alone. C3C sets `activity` back to `{ kind: 'work', at }` and walks them back (or simply releases them at the work door) when the task ends. At 17:00 C3C finishes the current trip (no new jobs after 17:00) and releases; C3A then sends them home. A porter carries goods in `r.carry` (`[goodIndex, qty]`) so the renderer shows bundles.
- **Builders** working a site stand at the site's door tile with `anim` work (activity `task`); C3C adds work per present builder per tick.
- **Removed buildings**: `build.remove` does not touch residents. C3A notices missing homes and workplaces on its next tick (rehouse or leave, release jobs); C3C's `refundRemoval` cancels porter jobs touching the building.

## Food

- Pantry capacity 8 food units (`PANTRY_CAPACITY`). Each resident eats 1 food at 07:00 (C3A), preferring variety (`recentFoods`), and books it in `economy.today.consumed` and `economy.season.consumed`.
- Shopping (C3A) uses `nearestOutletWithFood(state, tile)` and `takeFromOutlet` (C3C owns these; the C3.0 baseline works). Market stalls are restocked by porters to `STALL_RESTOCK_TARGET` (C3C).
- Kitchen Garden's +1 food per day (C3B pattern) goes into the household pantry directly.

## Mood, bonds and wishes

- C3B grants wishes through `addMoodModifier(state, id, { kind: 'wish-granted', value: reward.mood, ticks: 3 * TICKS_PER_DAY })` and `addBond` (C3A enforces the 3-heart cap for wish bonds inside `addBond`'s rules if needed; keep the signature).
- On grant C3B sets `ResidentFlags.hop` on the resident and emits `wish.granted` and a `notify` of kind `'letter'` with the thank-you text; C3A clears the hop flag after one in-game hour.
- Lean times mood (-5 while active) is C3C's call: `addMoodModifier(..., { kind: 'lean-times', value: -5, ticks: 0 })` on start and `removeMoodModifier` on end, for every resident.
- Mood tax factor: C3C reads `moodTaxPercent` (C3A may refine it).
- Charm: C3A reads `state.map.charm*` layers (zero until C3B lands) for the beauty need, home desirability and leisure spots.

## Events (who emits what)

| Event | Emitted by |
|---|---|
| `resident.added`, `resident.updated` (only when the coarse view changes: home, job, tier, wish, mood band, bond, flags), `resident.removed`, `household.*` | C3A (C3B emits `resident.updated` when it sets or clears a wish) |
| `building.updated` with `rt` | C3C, throttled: on construction stage or status changes, and at most once per in-game hour per building otherwise |
| `building.updated` (customize) | C3B |
| `stocks.updated`, `budget.updated` | C3C (daily at 00:00, and hourly when anything changed) |
| `town.updated` | C3C daily and on treasury changes; C3A after arrivals and departures |
| `wish.*`, `pattern.*`, `achievement.unlocked`, `chronicle.added` | C3B (chronicle.added through `chronicle()`) |

## Chronicle calls

| Kind | Caller | Params |
|---|---|---|
| `founding` | C3B (chronicle system, first tick of a standard valley with an empty Chronicle) | season |
| `household-arrived`, `household-left` | C3A | family, place |
| `first-of` | C3C, when `economy.everProduced[good]` goes from 0 | good |
| `pattern-discovered`, `achievement`, `wishes-digest`, `season-summary` | C3B | see `packages/content/src/chronicle.ts` |

## Schedules and offsets

Heavy daily and hourly work uses offsets so it does not pile onto one tick: residents' daily pass at 06:00, wishes at 07:00, peddler at 10:00, taxes and upkeep at 00:00, charm hourly at offset 50, patterns hourly at offset 100, achievements hourly at offset 150. Use `calendar(state.tick)` or tick arithmetic with `TICKS_PER_HOUR` and `START_HOUR` (tick 0 is 06:00).

## Testing and benches

- `packages/sim/test/fixtures/hamlet.ts` is shared. Add helpers next to it in your own files rather than editing it; if you must change it, keep existing ids and positions.
- Bench scenarios go in `tools/bench/src/` as new files with one registration line each in `bench.ts`.
- Unique ports for e2e and dev servers per track (see your brief) so parallel checkouts never collide: `QOTI_CLIENT_PORT=<n> QOTI_RELAY_PORT=<m> npx playwright test -c apps/client/playwright.config.ts <spec>`.

## Registries

One alphabetical line per entry in every registry (commands, systems, content, render layers, tools, lenses, panels, art kits). Goods are the exception: append-only order.
