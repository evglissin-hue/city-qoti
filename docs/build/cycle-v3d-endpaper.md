# V3D: The endpaper map

**Iteration**: V3 Yards, streets and the long view. **Wave**: parallel. **Branch**: `cycle/v3d-endpaper`, from `main` after V3.0 merges; PR into `cycle/v3x-integration`.
**Depends on**: V3.0. **Runs alongside**: V3A, V3B, V3C and the R2 wave. **Ports**: client 5234, relay 8844.

## Goal

Pull the camera back past 200 tiles and the valley cross-fades into its own map, like the endpaper of a storybook, complete at 240 tiles: parchment, the river lettered with the valley's name, woods as little trees, fields hatched, roads by class, roofs in rows, the names of places and streets where the Mirror has them, plans in blueprint ink. While it shows in full the 3D scene is not drawn at all, so the far view becomes the cheapest frame in the game. The map is drawn in a worker only when the town changes and never per frame.

## Read

- `CLAUDE.md`, `docs/build/v3-wave-notes.md` (Handshakes: the endpaper map and the scene skip; Static-layer events: The endpaper map; Stand-ins; Decisions V3.0 made)
- `docs/spec/17-presentation.md`: Visual direction, second pass, 5. The long view (the endpaper bullet); The redesign's interface, "One map, two inks"; Quality presets, row "Endpaper map [V3]"
- `docs/spec/22-quality.md`: The redesign: measuring first, then budgets (the Endpaper map row)

## You own

The V3D row of the wave notes: `apps/client/src/render/endpaper.ts`, `render/layers/endpaper.ts`, `apps/client/src/worker/endpaper.worker.ts` (and their tests), and one line in `render/renderer.ts` (skip the scene pass on `env.skipScene`).

Outside these paths: only small, necessary edits (an export, a registry line, palette tokens appended), listed in the PR. Fields appended to `EndpaperInput` are yours to define for your own needs; V3B and V3C append theirs.

## You can rely on

V3.0: `EndpaperMap` (`texture`, `revision`, `size`, `cover`), `endpaperCover(distance)`, `ENDPAPER_NEAR` and `ENDPAPER_FULL` (200 and 240), `ENDPAPER_ON` (off), `EndpaperInput` and `endpaperInput(mirror, inks)`, `EndpaperInks { goods?, footfall? }` and `InkLayer { tiles, color }`, `EndpaperWriter` (`townChanged`, `due`, `tick`, `lastMs`, `asked`, `drawn`, `dispose`), `ENDPAPER_DEBOUNCE_MS` (2 s), `ENDPAPER_DRAW_BUDGET_MS` (150), `PARCHMENT`, `env.endpaper`, `env.skipScene`, `QualityPreset.endpaperSize` (1024 on Low, 2048 elsewhere), the stub layer (`endpaperLayer`, `townChanged`, `cameraDistance`) and worker (`drawEndpaper`), `v3-shots.mjs` scenes `far200` and `far240`, `v3-perf.mjs`.

## Tasks

1. **Draw the map** in `drawEndpaper` (the worker) on its `OffscreenCanvas`, from `EndpaperInput` only: parchment with a faint grain and a hand-drawn border; the river as an inked band lettered with the valley's name along its course (`EndpaperLabel` kind `valley`); woods as little trees from `woods`; fields hatched from `fields`; roads by class from `roads` (width and line style by class, through `@qoti/content`'s road table); roofs in rows from `roofs`; `plans` in blueprint ink; place and street labels where `labels` has them, along their angle with a halo so they stay legible. Colors are paper and ink tokens appended to `palette.ts`. No residents, no clock, nothing private to one seat.
2. **Show it** (`layers/endpaper.ts`): one full-screen quad sampling `env.endpaper.texture` with opacity `cover`, so the valley cross-fades from 200 to 240 tiles. Decide where it draws (a mesh in the scene's last layer, or the final pass's overlay if that is cheaper) and say which in the PR. Turn `ENDPAPER_ON` on. Below `cover` 0 nothing is added to any frame.
3. **Skip the scene** at `cover` 1: the renderer's one line (`if (env.skipScene)` before the lean frame's scene pass, with the shadow pass and the still-frame work). At `cover` 1 the frame is the quad alone: assert the draw count.
4. **Redraw only on the event**: the writer's flow as built (town changed, 2 s quiet, only while `cover` is above 0, one in flight, the first show draws at once). Add to `townChanged` anything the map draws that it misses (plans, lots, names). A drawing takes under `ENDPAPER_DRAW_BUDGET_MS` in the worker on the grown village and the town at 2048; measure with `writer.lastMs` and show it in the `?debug` overlay. If a drawing runs over, cut detail (labels, grain), not the budget.
5. **Safari and no OffscreenCanvas**: decide and write it in the PR: stay parchment (V3.0's default), or a main-thread canvas on Low only (a drawing still blocks a frame, so it would draw once, with the camera resting). Either way the skip must not blank the view when no map was ever drawn: skip the scene only once `env.endpaper.revision` is above 0.
6. **The inks stay unwired.** Draw `inks.goods` (ochre) and `inks.footfall` (sage) when present, so the day they are wired they show; test with synthetic `InkLayer`s. Do not read the flows overlay or R2's `map.footfallEve`: whichever of V3X and R2X lands second wires them (`30-roadmap.md`, The redesign, Order of work).
7. **Take V3B's rows and V3C's river**: when their functions exist (they land in this wave), call them from `endpaperInput` through fields appended to `EndpaperInput`; until then roofs are plain footprints and water comes from `water`. Test with fake inputs for both.
8. **Shots**: `node apps/client/e2e/v3-shots.mjs v3d far120 far200 far240` (the map is the same at every hour by design; say so), plus a winter valley's map. Fill your stand-ins rows and add As built lines to `20-architecture.md` (V3 contracts).

## Acceptance criteria

- [ ] At 200 tiles the map begins to show, at 240 it covers the view and no scene draws: `far240` reports a handful of draws and `far200` a blend (screenshots and `v3-perf.mjs`).
- [ ] The map holds everything in the goal on the grown village, and labels read; no seat-private data is drawn (test that `endpaperInput` ignores a seat's lens).
- [ ] A redraw takes under 150 ms in the worker and never lands on the main thread (fake-worker test; the real timing in the PR); at rest with the town unchanged nothing is redrawn and no still frame is dropped (a `v2-rest.mjs` style check).
- [ ] The map is `QualityPreset.endpaperSize` square (1024 on Low, 2048 elsewhere); the Safari decision is written and tested for the no-bitmap case.
- [ ] Nothing changes below 200 tiles (shots by eye); hashes unchanged; typecheck, lint, unit, e2e, build and bench pass; definition of done in `docs/spec/22-quality.md`.

## Out of scope

The horizon, haze and river (V3C); wiring the two inks (V3X or R2X, whichever lands second); R2's street names and place kinds (the labels carry the valley's name until R2X); a clickable or zoomable map; any sim change.

## Notes

- It should feel like a keepsake: ink a little uneven, trees tiny and kind, labels in the title font. Cozy before clever.
- `EndpaperInput` stays additive: V3B and V3C append to it, so rebase on them before the PR and never reorder.
- Open the PR into `cycle/v3x-integration`; if that branch does not exist yet, into `main` as V3.0 left it, and say so.
