# R2D: The interface

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2d-interface`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: high.
**Depends on**: R2.0. **Runs alongside**: R2A to R2C, R2E, R2F, and V3's wave. **Ports**: client 5234, relay 8844.

## Goal

Each player can say, from the screen alone, what the other's work did for theirs today. One overlay, Town, in both lenses, draws goods routes in ochre and evening footfall in sage; clicking a place opens its card; a resident's inspector shows today's round and draws it on the ground; the evening edition lands at 21:00; gaps show in the left feed and as paper tags; the season report is one spread; the Hearth's strip says how evenings are going; evening streets, renames and the lingering evening each have their controls.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md` (Panels and the views they read)
- `docs/spec/17-presentation.md`: The redesign's interface [R2] (one map, two inks; places and the round; the evening edition; gaps; the Hearth's strip)
- `docs/spec/19-evenings.md`: Places, The round, Evening streets, Gaps (the words); `docs/spec/16-coop.md`: Gaps, the evening edition
- `docs/spec/20-architecture.md`: R2 contracts; `packages/sim/src/contracts/evenings.ts`

## You own

The R2D paths in `r2-wave-notes.md`: `apps/client/src/ui/panels/{PlaceCard,Day,Edition}.tsx` (new, registry lines), `ui/panels/{ResidentInspector,SeasonCard,Chapter}.tsx`, `ui/topbar/**`, `ui/lenses.ts`, `ui/cards.ts`, `ui/settings.ts`, `ui/SettingsPanel.tsx`, `input/tools/road.ts` and new `input/tools/evening.ts`, `state/mirror.ts`, `state/undo.ts`, `render/layers/overlays.ts` and new `render/overlayTown.ts` (the one render path), and e2e `apps/client/e2e/r2d-*.spec.ts`.

## You can rely on

- R2.0's views and events: `ViewSnapshot.places` (`PlacesView`), `.gaps` (`GapsView`), `.evening` (`EveningView | null`), `.streets` (`StreetView[]`), `.footfall` (`FootfallView`, Uint16 copies; the footfall layers never come as layer patches); `places.updated`, `evening.closed`, `gaps.updated`, `streets.updated`, `footfall.updated`; `TownView.evenings`; `ResidentDetail.round` (`RoundStopView`) and `.evening`; `Flags.evening` in the `flags` layer (patched as today); `settings.eveningLingers` (absent means on; `valley.setSettings` accepts it); `LotView`'s lot fields; `agentPose` and `AgentAnim.sit` (V3 draws them).
- The commands `road.setEvening { tiles, on }`, `road.rename { id, name }`, `place.rename { id, name }` (validate and store; an empty name restores the generated one), owed to you on `OWED_SENDERS`.
- Real content and counts as R2A to R2C land; until then fixtures and mocks as R1C did (`ui/mocks/`).

## Tasks

1. **The Mirror**: places, gaps, streets, the evening and footfall from the snapshot and their events; a revision signal for each; footfall kept as the two arrays, replaced whole.
2. **Town overlay**: goods routes ochre (the flows overlay as built), evening footfall sage (`footfall.eve`), a glint where an outlet sells to the round (`PlaceView.serves`); the lens decides which ink is stronger; evening streets (the flags layer), gaps and reach draw on it; contrast and the colorblind check as for every overlay. No stroke finer than a tile, so it reads on the endpaper map (V3D's interface; R2X or V3X wires it).
3. **The place card**: name (rename), seats and standing, tonight's visitors and who is there, what it serves and took, its draw in parts (`parts`), what it still wants (`wants`). A click on a place's tiles or pieces opens it.
4. **A resident's day**: today's round as a short line of stops, drawn on the ground through the highlight API; the evenings need and last score in words.
5. **The evening edition**: at 21:00 a slim card of `EveningView.lines`, crediting each seat by name; one at a time like every card (`ui/cards.ts`); a setting turns it into a feed line.
6. **Gaps**: rows in the left feed of both lenses and paper tags on the ground (through the notes layer's API); each says what would close it; a click centers the camera. While in the feed, fold identical alerts into one counted line: P2's feed lists "Forester's lodge: no mature trees in reach." once per lodge, which reads as a duplicate (`docs/build/screenshots/p2-feed-markers.png`); it should read "2 Forester's lodges: no mature trees in reach.", with a test that no two feed lines read the same.
7. **The season spread**: one report with the cross-lane lines first, then the Hearth page and the Ledger page.
8. **The Hearth's strip**: mood, wishes waiting, how evenings are going (`TownView.evenings`: the share out, the average), gaps open; the Ledger's strip unchanged.
9. **Controls and senders**: the evening street brush on the Ledger's road tool (marked stretches shown; a shed that waits says so), street and place rename in the inspectors, the lingering evening in Settings; send `road.setEvening`, `road.rename`, `place.rename` and take them off `OWED_SENDERS`; undo for each.
10. e2e and shots: a Village evening with places (`r2d-*` screenshots), the card, the day, the edition, the two inks, in both lenses.

## Acceptance criteria

- [x] From the screen alone a player can name what the other's work did for theirs today: the edition, the two inks and a closed gap (a screenshot set and an e2e step).
- [x] The Town overlay is in both lenses' View lists; a place card opens from a click and shows the draw in parts; a resident's day draws on the ground.
- [x] `OWED_SENDERS` has no R2D entries; each command has undo.
- [x] Cards never cover one another; the edition and a season page queue; no two feed lines read the same (identical alerts fold into one counted line); words are warm, dry, US spelling, no em dashes.
- [x] e2e, typecheck, lint, unit tests and build pass; the interface holds at 1x with the evening lingering.

## Out of scope

The sim behind any of this (R2A to R2C); drawing seats, mugs, lamplit rows and street labels on buildings (V3); the endpaper map itself (V3D: R2D's overlay data is what it reads).

## Notes

- Panels read views through the Mirror, never the sim (as R1C).
- `render/` is V3's but for the two files above; if V3's wave notes claim `overlays.ts`, draw through `setOverlay` and `highlight` and ask in the PR.
- From P2 (wave notes, Starting after P2): the Ledger's strip is its own row at laptop widths and cards sit under the bar; the Hearth's strip sits beside it and follows its layout; P2's feed lines (waiting sites, wanted zones, waiting lots) set the style gap rows follow; `overlays.ts` already draws P2's waiting-site markers in the Ledger lens.
- A place id is a string (`seats:12`, `host:40`); keep it a string in the client.

## As built

Built as the build and review loop: the master wrote the Mirror and the mock evening, five executors built the rest in parallel worktrees (the Town overlay; the place card, a resident's day and rename; the edition, settings and the season spread; gaps, the feed fold and the Hearth strip; the evening street brush and undo), and the master merged, played it at 1250 px by day and lamplight, and fixed what read wrong.

- **The Mirror** (`state/mirror.ts`) keeps `places` (by string id), `gaps`, `evening`, `streets` and `footfall` from the snapshot and their events, each replaced whole, with `placesRevision` and `streetsRevision`; `placeAt(tile)`, `placeOf(member)`, `streetAt(tile)` and `eveningStreet(x, z)` index them. `MirrorChange` gains `places`, `gaps`, `streets`, `footfall` and `evening` (the edition, when `evening.closed` arrived).
- **Mocks**: `?debug&fixture=village&mock&evening` lays a mock evening over any fixture (`ui/mocks/evening.ts`: hosts, seat pieces and porches as places, footfall walked along the roads, two open gaps and one closed today by Bo, named streets, store-to-door flows, the edition crediting both seats, a resident's round through inspect). Every R2D shot and e2e step reads them until R2A to R2C land.
- **Town overlay**: `render/overlayTown.ts` (`townInk`, three-free and unit-tested: what V3D's endpaper reads) and `render/overlayTownDraw.ts` (the drawing; a second new R2D render file, split so the data tests in node), dispatched from `render/layers/overlays.ts` as `town:hearth` and `town:ledger`; `Toolbar.tsx` sends `town:<lens>` so one View entry stays on across a lens switch.
- **Senders**: `road.setEvening` (the Evening streets tool, `input/tools/evening.ts`), `road.rename` (the street block of the tile inspector) and `place.rename` (the place card); `OWED_SENDERS` is empty. Undo inverts all three.
- **Contract**: none of R2D's own. The spread reads `SeasonReportView.together` (R2C's contract commit, cherry-picked unchanged so R2X merges clean; an earlier `cross` member R2D had added for the same lines was dropped in its favor), first on the spread.
- **The player's chair** (1250 x 800, day and lamplight) found and fixed: gap tags cut from the feed's sentence read "The well by the Featherston..." (now they say what the gap is: "Nothing to sell here"); the cursor hint ran off the right edge (it flips to the cursor's other side); with an overlay named on the View button the Hearth's last tool was cut to "Era" (a little less air per tool under 1360 px); P2's line "Granary: nobody works here yet. 0 jobs are open" (no job count when there are none); the Ledger's Town showed no ochre on a fixture whose porters had carried nothing (the mocks lay flows); the mock edition named one stall twice and took "0 coins".
- **Outside the owned paths** (small, listed in the PR): `input/context.ts` (the `place` selection), `ui/panels/Inspector.tsx` and `BuildingInspector.tsx`, `ui/alerts.ts` and `panels/Alerts.tsx` (gap rows, the fold, the edition line, the jobs wording), `ui/format.ts` (`pluralName`), `ui/TopBar.tsx`, `ui/state.ts`, `ui/GameUI.tsx`, `ui/icons.tsx`, `ui/theme.css`, `ui/hamlet.css`, `ui/copy.ts`, `input/copy.ts`, `input/hint.ts`, `input/tools/index.ts`, `app/fixture.ts`, `app/debug.ts`, `app/seasonsHook.ts`, `ui/mocks/seasons.ts`, `e2e/helpers.ts`, `test/every-command-has-a-sender.test.ts`, and the registries and toolbar tests' expected lists.
- **Left for others**: the place card, the day, the edition and the gaps read real data once R2A to R2C fill the views; the brush's "will wait for its carts" names buildings whose door is on the stretch, not ones with a delivery pending (R2B's logistics could say so); the edition's first line and the spread's cross lines are R2C's words.

