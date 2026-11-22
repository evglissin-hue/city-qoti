# V4X: V4 integration

**Iteration**: V4 The developing picture. **Wave**: integration. **Branch**: `cycle/v4x-integration`, made by the master at V4.0's merge commit; the wave's PRs merge into it; one PR into `main`.
**Depends on**: V4A to V4C. **Runs alongside**: R3's wave (R3X merges into `main` as it goes). **Model and effort**: Opus 5.5 at xhigh (integration, perf-critical); Sonnet executors for mechanical parts. **Ports**: client 5264, relay 8874.

## Goal

V4 is merged, tuned and measured on both laptops: the picture develops when the players stop, photo mode and the books show the valley in ink and wash, the endpaper map has its lamplit night, tea-break mode drifts the camera when nobody touches the game, and every budget holds. Nothing in the sim changed.

## Read

- `CLAUDE.md`; `docs/build/v4-wave-notes.md`; the three wave briefs and their As built sections; `docs/spec/30-roadmap.md`, V4; `docs/spec/22-quality.md`

## You own

Everything V4 touched, to merge, fix and tune; and the V4X files in the wave notes' ownership table: `renderer.ts` (the frame loop), `statics.ts`, `gpuTimer.ts`, `lampSequence.ts`, `app/{perf,debug}.ts`, `e2e/{v4-shots,v4-perf}.mjs`.

## Tasks

1. **Merge** V4A, V4B, V4C into `cycle/v4x-integration` (merge commits), `v4-shots.mjs` and `v4-perf.mjs` after each; merge `main` in as R3 and the P3 cycles land.
2. **Wire the hooks the tracks left**: `capture`'s `samples` through V4A's accumulation from the capture camera (`drawSample(jitter, target, camera)`); the pictures seam's one `setPictureSource` call if R3X has landed (else R3X makes it); check that R3F's lamps (once on `main`) fold into a developing picture with no pop, by the `lamps` sequence and by the real lamplighter at 17:30 at 1x and 3x.
3. **Tune** the sample counts per preset against both laptops (Measure this laptop's still column and `?debug&refine=0` against on, on one build); cut Medium back to 0 samples if its sample frames do not fit Kat's laptop.
4. **The player's chair**: rest on the street, the village and the far view at every hour and season; watch for pops on light steps and while lamps light; open every book; take a photo; leave the game alone for two minutes in the evening and by day; both seats at once.
5. **V3's leftovers** that landed here (wave notes, What V3 leaves): the tavern's dressing fit in the grown village's tight spot if R2X's village has not fixed it.
6. **Both laptops' after tables** in `22-quality.md` and `docs/playtests/V4.md` (the owner's and Kat's runs, with and without `?debug&refine=0`); the next iteration's briefs; `17-presentation.md`, `20-architecture.md` As built; the board; `CHANGELOG.md`.

## Acceptance criteria

- [ ] The three lines of `30-roadmap.md`'s V4 acceptance hold, each with a shot, a test or a table: settled inside 0.6 s on High and idle frames back within budget on Medium on Kat's laptop, no pop on a light step or a small change, moving frames costing what they did; photo mode and the three books in ink and wash; Medium's fallback decided by the measured cost.
- [ ] Every hash matches; typecheck, lint, unit, e2e, build and bench pass.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

New book pages or text (R3's); stroll mode (I5); the worldgen rim (I4).
