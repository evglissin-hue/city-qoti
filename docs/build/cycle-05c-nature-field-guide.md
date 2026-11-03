# C5C: Nature, the Field Guide and Hearth craft

**Iteration**: I3. **Wave**: parallel. **Branch**: `cycle/05c-nature-field-guide`.
**Depends on**: C5.0 merged. **Runs alongside**: C5A, C5B, C5D to C5F. **Ports**: client 5193, relay 8803.

## Goal

Wildlife you invite: gardens, hedgerows, ponds, orchards and old woods build six habitat scores, about 30 species are sighted when the habitat, season and hour are right, and each first sighting fills a Field Guide page for both seats. Nature has real effects (bees raise orchard and farm yields, songbirds and frogs keep summer pests off the crops, a kingfisher marks a clean river). The Hearth can dig ponds, keep bees and give special homes and landmarks modules (porch, dormer, bay window, extra floor, balcony, tower, arcade, and ivy or flower boxes on walls), and four new patterns join the Pattern Book.

## Read

- `CLAUDE.md`, `docs/build/i3-wave-notes.md`, `docs/spec/20-architecture.md` (I3 contracts)
- `docs/spec/12-hearth.md`: Nature and the Field Guide, Pattern Book (engine, I1 and I2 tables, the I3 list), Charm
- `docs/spec/10-world-and-building.md`: Ponds, Customization (Phase 2), Decor
- `docs/spec/15-progression.md`: Achievements (The River Runs Clean, Field Notes)
- `docs/spec/13-ledger.md`: Goods (Honey); `docs/spec/11-residents.md`: name targets
- `docs/spec/01-principles.md`: P19, P20, P24

## You own

`packages/sim/src/systems/{nature,modules}/**`; `terrain.pond` and `build.setModule`; four pattern detectors in `systems/hearth/patterns/detectors/` (Orchard Path, Children's Corner, Reading Nook, Pond Garden) with their rules written into `12-hearth.md`; your yield hook registrations (pollinators, pests); content for habitats, wildlife (about 30 species), the apiary and honey, modules, the four patterns and their unlocks, the two achievements, and the name pools (to 400 given and 150 family names); `view/season/nature.ts`; your tests, `tools/bench/src/advisors/nature.ts` and `tools/bench/src/nature.bench.ts`.

## You can rely on

C5.0's `nature` state and stream, `moduleSlots` and `ModuleDef`, `rt.modules`, the yield hook and the winter fixture's two entries; C3B's charm layers, pattern engine and sites (Hedgerow Lane gives hedgerow habitat); C4B's terraforming rules; C4C's orchards and the upgrade-by-porter flow (`rt.upgrade`), which modules copy; C5A's `seasonNow`; C5D's wall pieces (for dressing).

## Tasks

1. **Habitats** (76, 02:00): per chunk, daily, the six scores from the map and decor: pollinator (flower pieces, orchards, wildflower verges, herb gardens), wetland (ponds, reedy banks, the river's quiet stretches), hedgerow (hedges, shrubs, Hedgerow Lane sites), woodland (mature forest, old trees), meadow (unmown meadow tiles), garden nooks (low walls, gardens, window boxes, ivy). Only chunks that changed (or a rolling sixth of the map a day) are recomputed; send chunk patches for the overlay.
2. **Wildlife** (78, hourly): about 30 species as content (insects, birds, amphibians, fish, a few small mammals; examples in the spec), each with habitat thresholds, seasons, hours and rarity. Sightings from the `nature` stream by habitat score near residents and paths; trout and perch are sighted by fishers; the honeybee needs a hive (the apiary). The first sighting adds a Field Guide entry (`species.sighted`, both seats, credit to the seat whose pieces made the habitat, like pattern credit), with three hints for undiscovered species at a time. No resident species ever appears as wildlife.
3. **Effects**: pollinator score raises orchard and farm yields up to +20%; summer pests take 0 to 15% of farm yields, cut by songbirds and frogs nearby; a kingfisher sighting marks a healthy river (The River Runs Clean); Field Notes at 10 species. Register them with the yield hook, never by editing production.
4. **Ponds**: `terrain.pond` digs fertile low tiles (height 1 or less, not floodplain-critical paths, up to a size cap) down to level 0 and fills them (`water` 3), with a coin cost, walkability and `networkVersion` updated, charm as water, and wetland habitat. Ponds freeze with the river in winter (`isFrozen`).
5. **Apiary**: a small Hearth or shared building making honey (good index from C5.0) with yields tied to pollinator score; honeybees need it.
6. **Modules** (customization phase 2): slots on special homes (townhouses, the Herbalist's Cottage, the Town Hall, the tavern) and wall pieces: porch, dormer, bay window, extra floor, balcony, tower, arcade, ivy and flower boxes. `build.setModule` asks for materials that porters bring (as an upgrade does), then the module appears, marks the building handmade and adds its charm (garden nooks for ivy and boxes). Write which defs offer which slots into `10-world-and-building.md`; an extra floor stays cosmetic in I3 unless you can show it does not unbalance housing.
7. **Patterns** (with C3B's engine, looked for from Village rank): Orchard Path (a path through or beside an orchard with a bench), Children's Corner (play pieces within sight of 3+ homes with children), Reading Nook (a bench in a quiet, enclosed garden nook with a lantern), Pond Garden (a pond with planting, a seat and a path). Write each rule, bonus and unlock; positive and negative fixtures for each.
8. **Names**: grow the pools to 400 given and 150 family names (content only), keeping the tone (woodland, storybook, never silly).
9. **Season report**: fill `view/season/nature.ts` (new species, habitat changes, yields from bees).
10. **Autoplayer**: an advisor for the Hearth hand: hedges along a lane, a pond near homes once affordable, flowers by the orchard, a module on a townhouse now and then, all through the one planner's money budget.

## Acceptance criteria

- [ ] Each habitat has positive and negative fixtures; the pass recomputes only what changed.
- [ ] Every species can be sighted in a fixture built for it (a generated test per content row, reading thresholds from content); none outside its season or hours; the Field Guide credits seats correctly.
- [ ] Pollinator and pest effects tested through the yield hook beside C5A's registrations; The River Runs Clean and Field Notes unlock.
- [ ] Ponds: placement rules, walkability, charm, freezing; modules: slots, materials by porter, charm, handmade guardrail; money invariant holds for both.
- [ ] Each new pattern has positive and negative fixtures and the patterns pass stays under 1 ms on the village fixture.
- [ ] Autoplayer with every system on: 10+ species in the first Village year on seeds willow and hazel; no labor or money starvation from Hearth spending.
- [ ] Bench: habitats under 3 ms per day; wildlife under 0.5 ms per hour at 150 residents.
- [ ] Definition of done.

## Out of scope

Seasons and weather (C5A); festivals (C5B); Town Gate and Watch Lookout patterns and the walls themselves (C5D); critters, ponds and module art (C5E); the Field Guide book and module UI (C5F).

## Notes

- Wildlife is cosmetic in the renderer (ambient critters near qualifying habitat) but the sim decides sightings deterministically; keep the two apart (`12-hearth.md`).
- A Field Guide page is a small reward for a place made well (P24): favor rules a player can read from the hint, not hidden thresholds.
- **Money**: ponds and modules cost coins through `chargePlacement` style booking (`book`), materials from the storehouses; tests end with `expectMoneyInvariant`.
- Isolate unit tests with `withoutSystems`, and do not assume other systems are absent (C5A's drought and your pollinators both touch farm yields; test them together once).
- Do not pin exact texts or numbers where content can be read (species names, thresholds, flavor).
- The autoplayer stays one coherent player; the Hearth advisor proposes, the planner decides.
- Stand-ins (for example a decor piece standing in for a hive) go in the wave notes' stand-ins table.

## As built

Done on `cycle/05c-nature-field-guide`. Rules and numbers are in the spec's As built notes (`12-hearth.md`, Nature and the Field Guide and the I3 Hearth patterns; `10-world-and-building.md`, Ponds and Customization phase 2).

- **Where it lives**: the two C5.0 system slots (`systems/habitats`, `systems/wildlife`) call into `systems/nature/{habitats,wildlife,effects}.ts`; modules in `systems/modules`; the commands in `commands/{pond,module}.ts`; the four detectors in `systems/hearth/patterns/detectors/`; content in `packages/content/src/{nature,natureDecor}.ts`.
- **Additive contract changes**: `NatureState.dirty?` (chunks waiting for the habitats pass, absent when none), `BuildingRuntime.moduleNext?` (the module waiting for its goods), `BuildingView.modules?`, `BuildingDetail.moduleWork?`, `ViewSnapshot.fieldGuideHints?` and `.habitats?`, `FieldGuideHintView`; content `HabitatDef`, `HabitatSource`, `Content.habitats` and `.habitatSources`, `WildlifeDef.hint?`. All optional and absent until used, inside the unreleased save version 4, so no version bump; a migrated valley scores every chunk on its first pass. `FieldGuideEntry.seats` now means the credited seats (its comment says so).
- **Edits outside my paths**: `hearth/charm/dirty.ts` (marks the habitat chunk with the charm's), `hearth/charm/{sources,compute}.ts` (module charm), `logistics/index.ts` (module goods by porter, beside the upgrade's), `production/modifiers.ts` (two registry lines), `view/{index,inspect,seasons}.ts`, `sim/src/index.ts` (exports), content defs (module slots on the townhouse, tavern, town hall and Herbalist's Cottage; the apiary's numbers; honey's seasons), the client contract test (two snapshot fields), the village chains test (skips the apiary, whose honey follows the flowers), the I2 migration hash test (drops `nature.dirty` before comparing) and the C5.0 pond baseline test (fertile low ground).
- **Nature opens at Village rank**: sightings, bees and pests begin with the Village (the habitats are scored from the first day). With bees from the first day the autoplayer reached Village a season later on five seeds of eight (eight-seed mean, day 32.6 against main's 28.5); with sightings in the Hamlet every first sighting's Chronicle line (an entity id) and the Field Notes achievement (the shared dice) reshuffled the runs and broke the I2 autoplay thresholds. Gated, a Hamlet plays exactly as on main (willow Village on day 19, hazel 31, as main). First-sighting lines take their words from the nature stream.
- **Autoplayer** (every system on, the nature advisor proposing; `NATURE_PLAY=1 npx tsx src/nature.bench.ts`): first Village year, willow 20 species and hazel 25 (target 10), no lean times, lowest treasury willow -21 coins (as without the advisor) and hazel +3. The advisor spends only from the season's surplus with 150 coins in hand above the planner's reserve.
- **Bench**: habitats 0.74 ms a day scoring the whole synthetic map (budget 3 ms), wildlife 0.07 to 0.19 ms an hour at 150 residents (budget 0.5 ms); the village patterns pass 0.96 ms with the four new detectors (main 1.09 ms on the same machine, so the 1 ms line is within noise either way).
