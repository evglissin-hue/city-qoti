# R2D: The interface

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2d-interface`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: high.
**Depends on**: R2.0. **Runs alongside**: R2A to R2C, R2E, R2F, and V3's wave. **Ports**: client 5234, relay 8844.

## Goal

Each player can say, from the screen alone, what the other's work did for theirs today. One overlay, Town, in both lenses and on the endpaper map's interface, draws goods routes in ochre and evening footfall in sage; clicking a place opens its card; a resident's inspector shows today's day and draws it on the ground; the evening edition lands at 21:00; gaps show in the left feed and as paper tags; the season report is one spread; the Hearth's strip says how evenings are going; evening streets, names and the lingering evening each have their controls.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md`
- `docs/spec/17-presentation.md`: The redesign's interface [R2] (one map with two inks, places and the round, the evening edition, gaps, the Hearth's strip), Visual direction (what V3 draws)
- `docs/spec/19-evenings.md`: Places, The round, Evening streets, Gaps (the words)
- `docs/spec/16-coop.md`: Gaps, the evening edition, undo for the new commands; `docs/spec/13-ledger.md`: Reports and overlays
- `docs/spec/20-architecture.md`: R2 contracts

## You own

The R2D paths in `r2-wave-notes.md`: `apps/client/src/ui/panels/{PlaceCard,Day,Edition}.tsx` (new, one registry line each in `ui/panels/index.ts`), `ui/panels/{ResidentInspector,SeasonCard,Chapter}.tsx` and the season spread's layout, `ui/topbar/**` (the Hearth's strip: mood, wishes, evenings, gaps), `ui/lenses.ts` (the `town` overlay entry), `ui/cards.ts` (the edition waits its turn like every card), `ui/settings.ts` and `SettingsPanel.tsx` (the lingering evening, the edition as a feed line), `input/tools/{road,plan}.ts` for the evening street brush and rename (new `input/tools/evening.ts`), `state/{mirror,undo}.ts` (R2D adds what the panels need; inverses for `road.setEvening` and renames), and e2e `apps/client/e2e/r2d-*.spec.ts`. The one render exception: the Town overlay's drawing in `render/layers/overlays.ts` and a new `render/overlayTown.ts`, plus the gap tags through the notes layer's API; V3 owns the rest of `render` (check V3.0's brief; if overlays are V3's, draw through the existing `setOverlay` and `highlight` API and ask in your PR).

## You can rely on

- R2.0's views: `places.updated`, `evening.closed`, `gaps.updated`, `LotView`, `AgentView.pose`; the footfall layers read through the Mirror.
- Real content and counts as R2A to R2C land; until then, fixtures and mocks as R1C did (`ui/mocks/`).

## Tasks

1. **Town overlay**: goods routes ochre (the flows overlay as built), evening footfall sage (the evening layer, halved at 04:00), a glint where an outlet sells to the round; the lens decides which ink is stronger; evening streets, gaps and reach rings draw on it. Contrast and the colorblind check as for every overlay.
2. **The place card**: name (renameable), seats, tonight's visitors, what it serves and took, its draw in parts, and what it still wants in words ("a stall would sell to the 14 who come"). A click on a place or its pieces opens it.
3. **A resident's day**: today's day and evening as a short line of stops, drawn on the ground through the highlight API; the evenings need and last score in words.
4. **The evening edition**: at 21:00 a slim card of the lines from `evening.closed`, crediting each seat by name; one at a time like every card; a setting turns it into a feed line.
5. **Gaps**: rows in the left feed of both lenses and paper tags on the ground; each says what would close it; clicking centers the camera.
6. **The season spread**: one report with the cross-lane lines first, then the Hearth page and the Ledger page.
7. **The Hearth's strip**: mood, wishes waiting, how evenings are going (the share out, the average), gaps open; the Ledger's strip is unchanged.
8. **Controls and senders**: the evening street brush on the Ledger's road tool (marked stretches shown; a shed that waits says so), rename in both inspectors, the lingering-evening setting; give `road.setEvening`, `road.rename` and `place.rename` their buttons and take them off `OWED_SENDERS`; undo for each.
9. e2e and shots: a Village evening with places (`r2d-*` screenshots), the card, the day, the edition, the two inks, in both lenses and on a phone-width layout where the app has one.

## Acceptance criteria

- [ ] From the screen alone a player can name what the other's work did for theirs today: the edition, the two inks and a closed gap (a screenshot set and an e2e step).
- [ ] The Town overlay is in both lenses' View lists; a place card opens from a click and shows the draw in parts; a resident's day draws on the ground.
- [ ] `OWED_SENDERS` has no R2D entries; each command has undo.
- [ ] Cards never cover one another; the edition and a season page queue; words are warm, dry, US spelling, no em dashes.
- [ ] e2e, typecheck, lint, unit tests and build pass; the interface holds at 1x with the evening lingering.

## Out of scope

The sim behind any of this (A to C); drawing seats, mugs and lamplit rows (V3); the endpaper map itself (V3D; R2D's overlay is the data it reads, wired by whichever of V3X and R2X lands second); supplies and priorities (R3).

## Notes

- Same rule as R1C: panels read views through the Mirror, never the sim.
- The Town overlay's two inks must stay legible at the endpaper scale: no strokes finer than a tile; check against V3D's interface when V3.0 lands.
