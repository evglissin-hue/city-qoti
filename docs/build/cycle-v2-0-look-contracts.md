# V2.0: Look contracts and measuring

**Iteration**: V2 Light and green. **Wave**: serial. **Branch**: `cycle/v2-0-look-contracts`, from `claude/funny-noether-28i3x9` (main plus the redesign's spec and these briefs).
**Depends on**: P1 (merged). **Unblocks**: V2A, V2B, V2C. **Runs alongside**: R1.0 (it owns sim, content and bench paths; nothing here touches them). **Ports**: client 5210, relay 8820.

## Goal

Every shared piece the three V2 tracks need exists, with stubs that change nothing on screen, so night (V2A), green (V2B) and what V1 left half-wired (V2C) can run in parallel without editing each other's files; and the game can measure the laptop it runs on, so the owner and Kat can record both laptops' before tables before any V2 art lands. A perfect no-op on screen plus a working Measure this laptop is a success.

## Read

- `CLAUDE.md`
- `docs/spec/17-presentation.md`: Visual direction, second pass (items 1 to 3), Quality presets (the V2 rows)
- `docs/spec/22-quality.md`: Performance budgets, The redesign: measuring first, then budgets
- `docs/spec/20-architecture.md`: Lean renderer [V1], Redesign outline (the V2 paragraph)
- `docs/spec/30-roadmap.md`: The redesign (Order of work, V2 Light and green)
- `docs/spec/31-parallel-development.md`: the V1 ownership table and the redesign's pairs paragraph
- `docs/build/v1-wave-notes.md` (the shape of wave notes and the V1 before numbers)

## You own

`apps/client/src/app/perf.ts`, a new Settings entry for Measure this laptop (`apps/client/src/ui`, the settings panel and one new panel file), `apps/server/src` and `tools/dev-server/src` for the perf endpoint only, `apps/client/src/render/env.ts` (additive), `apps/client/src/render/layers/lights.ts` (the light map's writer interface), `packages/art/src/{surface,patterns}.ts` (appended ids and layers, flat), a new `packages/art/src/dabs.ts` (interface and stub), `apps/client/src/app/debug.ts` (the grown village scene), new `apps/client/e2e/{v2-shots,v2-perf}.mjs`, new `docs/build/v2-wave-notes.md`, the briefs `docs/build/cycle-v2{a,b,c,x}-*.md`, a "V2 contracts" section in `docs/spec/20-architecture.md`, `docs/playtests/V1.md` (the measuring section).

Outside these paths: only small, necessary edits (registry lines, exports), listed in the PR. Never `packages/sim`, `packages/content` (beyond an additive type, if one is truly needed) or `tools/bench`: R1.0 owns them right now.

## You can rely on

The game on `main` after P1: the lean renderer (V1D) with its still-frame cache and static and moving layers, `__qoti.perf()` and `v1-perf.mjs`, `v1-shots.mjs`, the village and town showcases, `MAX_GROUND_LIGHTS` and the ground's 32-light loop, the surface table (ids 0 to 18, noise layer 19), `createPatternArray`, `groundAo.ts`, the agents layer's `setBubbles`, the server's `/api/valleys` routes and Durable Object storage.

## Tasks

1. **Measure this laptop** (`17-presentation.md`; `22-quality.md`, Measuring the laptops): a Settings entry that runs the perf script on each preset in the valley on screen, then in the village and town showcases, then puts the valley back exactly as it was (the showcases live in this client's Mirror, never the sim; reload the Mirror from the sim when done). It shows the table (moving and idle, frame ms average and 95th percentile, GPU ms where the browser has the timer, draws, triangles) and offers Copy (Markdown). A run takes a few minutes: say so before it starts, show progress, and let Escape stop it cleanly.
2. **Where tables are kept**: `PUT` and `GET /api/valleys/:id/perf` in the Worker and the dev relay, outside sim state: the last three runs for each seat, each with the browser, the screen size and pixel ratio, the GPU string where WebGL gives one, and the build id. A solo valley keeps its runs on the device. Unit tests for the routes (dev relay) and the trimming to three.
3. **The light map's interface** (`env.ts`, `layers/lights.ts`): `env.lightMap` (a render target sized by preset: 2, 4, 6 and 8 texels a tile on Low to Ultra, so 384 to 1,536 square on the 192-tile valley) and `env.lightMapRevision`; a writer API the lights layer and any other layer can feed (a soft disc: world x and z, radius, color, intensity) and a redraw request that is a static-layer event (`ctx.invalidate()`). The stub keeps the map black and the 32-light loop in charge, so nothing changes. Write down in the wave notes who writes into it (lanterns and lamps, window spill, oven doors, fires, festival lights, shop fronts) and who reads it (ground, walls, trees and hedges, folk and carts, smoke, water), and which file each reader lives in.
4. **Surfaces and room layers** (`surface.ts`, `patterns.ts`): append surface ids for wood grain, painted wood, wrought iron, terracotta and cloth, and eight room layers, without moving the noise layer's index (it is read by number in shaders; give the new layers indices after it and update `PATTERN_LAYERS`). Flat layers, so nothing changes. Tests for the count and that existing ids keep their numbers.
5. **The dab kit's interface** (`packages/art/src/dabs.ts`): one helper V2B builds and trees, hedges, reeds and ivy all use: input is a set of blobs (center, radii, soft normal source) and options (dab count, size, tint spread, sky lightening, gaps, a season thinning factor); output is geometry written through `ShapeBuilder` with surface leaf. The stub returns nothing and no kit calls it yet. Document the signature in the wave notes.
6. **A grown village scene**: beside the showcases, a scene that is a real town grown by the autoplayer (about 150 residents, Village rank, a festival's worth of decor), loadable as `?debug&fixture=grown`. Make it **regenerable** by a script (the bench's autoplayer, a seed and a day, then a snapshot): R1 replaces the economy and starts every valley fresh (`21-networking-and-saves.md`, The fresh start), so a snapshot taken today will be refused after R1X merges, and R1X must be able to grow a new one with one command. Note this in the wave notes.
7. **Shots and perf scripts** (`v2-shots.mjs`, `v2-perf.mjs`): V1's scenes plus the grown village, each by day, golden hour and night (night matters most this wave), saving `docs/build/screenshots/v2-<stage>-<scene>-<shot>.png`. Take the `before` set and the headless numbers.
8. **Wave notes and briefs**: `docs/build/v2-wave-notes.md` (ownership by file, the handshakes below, the static-layer events, a stand-ins table, ports V2A 5211 and 8821, V2B 5212 and 8822, V2C 5213 and 8823, V2X 5214 and 8824, the before numbers) and the four briefs V2A night, V2B green, V2C what V1 left half-wired, V2X integration, each about two pages, from `_template.md`, with the acceptance lines of `30-roadmap.md` (V2) split among them.
9. **Measuring section** in `docs/playtests/V1.md`: what the owner and Kat do (open Settings, Measure this laptop, paste the table here), with an empty table for each laptop.

**Ownership in the pair** (`31-parallel-development.md`): V2 owns `packages/art/src/{materials,patterns,surface,palette}.ts`, the kits `nature`, `trees`, `props`, `decor`, `vehicles` and `residents`, the new `dabs.ts`, and `apps/client/src/render` but `layers/buildings.ts`. R1E owns every other kit in `packages/art/src/kits/` and `render/layers/buildings.ts`. `geometry.ts`, `shapes.ts`, `rig.ts` and `render/kitGeometry.ts` are shared: additive edits only, listed in the PR. The bubbles toggle is one line in `apps/client/src/ui/lenses.ts` (V2C). Split V2's paths among V2A, V2B and V2C file by file in the wave notes.

**Handshakes the wave notes must fix**: the light map (V2A owns it and every reader shader; V2C's ribbon smoke and V2B's trees read it through the uniform V2A defines, so V2A lands the uniform first or the stub already declares it); the dab kit (V2B builds it; V2B also owns hedges, reeds and ivy); surfaces on props, vehicles and residents (V2C writes the new ids; V2A's material draws them); cache invalidation (every static change goes through `ctx.invalidate()`); the meadow carpet's ground color source (V2B reads the ground texture V1C built; no ground shader edit outside V2B's files without a note).

## Acceptance criteria

- [ ] The game looks exactly as before: `v2-before-*` shots from `main` and from this branch match by eye; gallery screenshots unchanged.
- [ ] Measure this laptop runs end to end in the dev build (headless numbers are fine), shows and copies the table, restores the valley, and the run is stored and listed per seat through the dev relay; route tests pass.
- [ ] Unit tests: appended surface and layer indices, a flat new layer, the light map sized by preset, the dab stub's signature.
- [ ] `?debug&fixture=grown` loads, and the script that regrows it is documented and runs.
- [ ] The wave notes and the V2A, V2B, V2C and V2X briefs are written.
- [ ] Typecheck, lint, unit, e2e, build and bench pass; hashes unchanged (no sim edits).
- [ ] Definition of done in `docs/spec/22-quality.md`; a line in `CHANGELOG.md`; your rows in `docs/build/README.md`.

## Out of scope

Any change to how the game looks (V2A to V2C), every sim, content and bench change (R1), the laptops' own timings (the owner and Kat run Measure this laptop once this is live).

## Notes

- The human part of V2.0 is the owner's and Kat's before tables. The waves may be built before those exist, but V2X cannot ship without them, and a row that fails on Kat's laptop on Medium is cut back (P50).
- V2 merges to `main` as it goes (it touches no sim state). Open the PR into `main`. The V2 wave branches from this branch's tip so it does not wait for the merge.
- Keep every index append-only: surface ids and pattern layers show up in shaders, tests and gallery screenshots.
- Run the build and review loop (`31-parallel-development.md`). For this round the owner asked for Opus executors (model `opus`) rather than the Sonnet executor default.
