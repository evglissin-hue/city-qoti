# C3.0: Hamlet contracts

**Iteration**: I1. **Wave**: serial (short). **Branch**: `cycle/03-0-hamlet-contracts`.
**Depends on**: C2X merged. **Unblocks**: C3A, C3B, C3C, C3D, C3E.

## Goal

Every shared type, state slice, command, event, view, content type and system slot that I1 needs exists, with stubs and test fixtures, so five tracks can build the hamlet in parallel without waiting on each other.

## Read

- `CLAUDE.md`
- `docs/spec/20-architecture.md` (all)
- `docs/spec/11-residents.md`: Data model, Schedules, Movement, Needs
- `docs/spec/12-hearth.md`: Charm (storage), Pattern Book (definition, engine), Wishes (template), Chronicle (entry)
- `docs/spec/13-ledger.md`: Goods, I1 buildings, Construction, Logistics, Budget
- `docs/spec/15-progression.md`: Achievements (I1 rows)
- `docs/spec/31-parallel-development.md`: Contracts policy, Registries

## You own

All contracts files, `packages/sim/src/state` (migration), stubs in every new system folder, `packages/sim/test/fixtures`, `apps/client/src/ui/mocks`.

## Tasks

1. **State slices** (typed, in `WorldState`): `residents`, `households`; building runtime (`workers`, `present`, input and output buffers, production progress, construction `{ needs, delivered, work, workDone, priority }`, `condition`, `paused`); `economy` (treasury in pennies, goods for sale, day and season ledgers by category); `logistics` (jobs, reservations); `hearth` (charm and category layers, pattern sites, discovered patterns); `wishes`; `chronicle`; `achievements`; `seats[].lastSeenTick`; layer `fieldOwner` (Int32).
2. **Per-good quantities** are arrays indexed by good index (content order is append-only) or `[goodIndex, qty]` pairs, never objects iterated by key.
3. **Content types**: `GoodDef`; `ProductionMethod { inputs, outputs, hours, workers }`; `BuildingDef` additions (workers, housing, storage, coverage, methods, construction work, placement rules); `SpeciesDef`, `TraitDef`, name pools; `WishTemplate`, `PatternDef`, `AchievementDef`, Chronicle templates.
4. **Condition DSL**: a small typed JSON language for wish targets and achievements (for example `{ near: { tag: 'bench', of: 'home', within: 3 } }`, `{ count: { what: 'residents', atLeast: 20 } }`, `{ code: 'lanternRoute' }` as an escape hatch to a named predicate). Types only here; C3B implements the evaluator.
5. **Commands**: `build.customize`, `build.setPriority`, `build.setPaused`, `field.paint`, `field.remove`, `ledger.setForSale`. Validate stubs return `null`; apply stubs do nothing yet (owners fill them).
6. **Events and views**: `ResidentView`, `HouseholdView`, building runtime view (`rt` on `building.updated`), `StocksView`, `BudgetView`, `WishView`, `PatternView`, `ChronicleEntryView`, `AchievementView`; events `resident.*`, `household.*`, `stocks.updated`, `budget.updated`, `wish.added|granted|expired`, `pattern.discovered|siteAdded|siteRemoved`, `chronicle.added`, `achievement.unlocked`; charm layers in `LayerName`. Resident updates are coarse (home, job, tier, wish, mood band); full detail comes from a new worker request `inspect { kind, id }` answered by `inspected { data }`.
7. **Agent frames**: `Float32Array`, stride 8: `[id, x, z, y, heading, anim, carryGood + 1, flags]` for every resident outdoors; `anim` 0 idle, 1 walk, 2 carry, 3 hop, 4 work.
8. **Cross-track APIs** (signatures plus stub implementations, owners named in comments):
   - movement (C3A): `requestMove(state, residentId, targetTile, reason)`, `isAt(state, residentId, tile)`;
   - activities (C3A): `Activity` union including `{ kind: 'task', taskId }` for porters and builders driven by C3C;
   - outlets (C3C): `takeFromOutlet(state, buildingId, goodIndex, qty) -> number`, `nearestOutletWithFood(state, tile)`;
   - bonds and mood (C3A): `addMoodModifier(state, residentId, mod)`, `addBond(state, residentId, n)`;
   - chronicle (C3B): `chronicle(state, kind, params)`.
9. **Standard valley**: `createValley(seed, settings)` branches on `settings.mode`; for `standard`, build the starting state from `02-game-overview.md` (residents arrive through C3A's arrival logic; stub until then).
10. **System slots**: register no-op systems at orders 20 construction, 30 production, 40 logistics, 50 residents, 52 movement, 60 economy, 70 charm, 72 patterns, 74 wishes, 90 achievements, 100 chronicle.
11. **Fixtures**: `packages/sim/test/fixtures/hamlet.ts` builds a deterministic small hamlet (buildings with runtime state, 3 households, stocks) for unit tests; `apps/client/src/ui/mocks/` holds matching mock views for UI work.
12. **Migration**: bump `SAVE_VERSION`; I0 valleys gain empty slices and stay sandbox.
13. **Docs**: add an "I1 contracts" section to `20-architecture.md`.

## Acceptance criteria

- [ ] Everything typechecks; stubs are registered; fixtures build; the migration test passes.
- [ ] The golden I0 script still matches after migration (or is regenerated with a note).
- [ ] Each later I1 brief can be started without touching contract files except additively.
- [ ] Definition of done.
