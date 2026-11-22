# V4.0: The developing picture contracts

**Iteration**: V4 The developing picture. **Wave**: serial. **Branch**: `cycle/v4-0-contracts`, one PR into `main`.
**Depends on**: V3X merged. **Runs alongside**: R3's wave (other paths) and the P3 playtest cycles on `main`. **Ports**: client 5260, relay 8870. Drafted by V3X; finalized by V4.0 (2026-11-17).

## Goal

V4's tracks can start in parallel: the refinement's interface in the still-frame cache, the ink capture's options, the tea-break camera's hooks and the governor's inputs are fixed as types with stubs that change nothing on screen; both laptops' before numbers are ready to take; the wave notes and V4A to V4X briefs are final.

## Read

- `CLAUDE.md`, `docs/build/v4-wave-notes.md`
- `docs/spec/17-presentation.md`: Visual direction, 6. The picture develops when you stop; Storybook pictures; Tea-break mode
- `docs/spec/30-roadmap.md`: V4; `docs/spec/22-quality.md`: the budgets and V3's headroom table
- `apps/client/src/render/cache.ts` (`StillCache`), `post.ts` (`LeanFrame`), `renderer.ts` (`drawLean`, `capture`), `resolution.ts` (P2-F's governor)

## Tasks

1. **The before**: V3's laptop tables if still open, then both laptops at rest on every preset (Measure this laptop), and the still frame's cost in draws and GPU ms per preset. Write them into `22-quality.md`.
2. **Refinement interface**: `StillCache` gains a sample count and a `refine(n)` step (a stub that adds nothing), `QualityPreset.refineSamples` (Low 0, Medium 8, High 16, Ultra 32; *tune*), and the governor's inputs (moving frame time, the preset). No change on screen.
3. **Capture**: `renderer.capture({ style: 'ink' | 'plain', samples? })` typed, `'ink'` a stub returning the plain capture.
4. **Tea-break**: the idle timer's contract (90 s, a setting, never while a tool is in hand or a card is open) and the camera's follow and orbit hooks in `input/camera.ts`, stubbed.
5. **Ownership and scenes**: the wave notes' ownership table, ports, a `v4-shots.mjs` (rest at 0, 0.3 and 0.6 s on the street and village cameras) and `v4-perf.mjs` (moving, settling, settled).
6. Docs: `20-architecture.md` (V4 contracts), the board, `CHANGELOG.md`.

## Acceptance criteria

- [x] Nothing on screen changes (`v4-shots.mjs before` equals the after of a no-op); every hash matches.
- [ ] Both laptops' before tables are in `22-quality.md`, or the owner's word defers one. *Ready for the owner and Kat; see As built.*
- [x] The four briefs and the wave notes are final and on the board.
- [x] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

The refinement itself, the ink style, the tea-break camera's motion (V4A to V4C).

## As built (V4.0, 2026-11-17)

**Contracts** (`docs/spec/20-architecture.md`, V4 contracts): `QualityPreset.refineSamples`; the still key by part (`StillKeyParts`, `stillKeyOf`) with `StillChange`, `stillChange` and `restartsDevelopment`, so a still frame says whether it was a view change (restart) or a light step, a lamp or a small change (fold in); `StillCache.samples`, `goal`, `lastChange`, `developing(key)` and `refine(n, ctx)` (adds nothing) with `RefineContext`; `refine.ts` (new) with the jitter sequence (pure Halton points, tested), `RefineGovernorInput` (moving frame ms and resolution step from P2-F's `DynamicResolution`, which gained `movingMs` and `stepIndex`; GPU ms; sample GPU ms; photo mode; `?debug&refine=0`) and `refineGoal` (0); the renderer's hook (a `sample` mode, `samples`, `sampleGoal` and `stillChange` in `RenderStats`, `drawSample` taking a camera); `CaptureStyle` and `CaptureOptions` in `render/api.ts`; `input/teaBreak.ts` (new: `TEA_BREAK_AFTER_MS`, `IdleTimer`, `TeaBreakGuards`, `TeaBreakPlan`, `chooseTeaBreak` returning null), `CameraController.saveView`, `restoreView` (exact), `orbit` and `setDrift` (stubs), `UiSettings.teaBreak` (on by default). V4A's test scene for R3F's lamplighter: `render/lampSequence.ts` and `__qoti.lampSequence()`.

Two contract details went beyond the draft, because the briefs needed them: the governor takes `photo`, so V4B's Save PNG asks for 64 samples through the contract rather than a second path; and `drawSample` takes a camera, so V4X can develop `capture`'s pictures through V4A's accumulation.

**The laptops** (task 1): V3's tables were still open, and the build container has no GPU, so both runs are the owner's and Kat's. Instructions went to the master the moment they were ready: on the live link, Settings, Measure this laptop, paste into `docs/playtests/V3.md` (that run is also V4's before for moving and idle frames, since V4.0 changes nothing on screen). Measure this laptop gained the still frame's own cost (a 3 s still part a row, every frame drawing the still frame again; the table's last column), so a run after V4.0 merges is V4's real before, pasted into `docs/playtests/V4.md`. `?debug&refine=0` lets V4X take before and after on one build later.

**Nothing on screen changes**: `v4-shots.mjs` against `main` (8d00cb7, served from a worktree) and this branch, with the sim paused at load, the animation clock frozen and the smoke hidden (`QOTI_SMOKE=0`; its clock is the effects layer's own): all nine street shots (day, golden hour, night, at 0, 0.3 and 0.6 s of rest) are identical to the pixel. The village shots differ in 0.2 to 0.6 % of pixels, all of them moving things on clocks of their own (the windmill's sails, critters, a few residents walking a turn further before the pause); two runs of this branch differ in the same places by the same amounts (0.2 to 0.6 %). No static pixel differs. No sim file changed, so every hash matches (the determinism and golden tests pass).

**The scripts** (an executor, reviewed): `v4-shots.mjs` (rest sequences, the `lamps` scene, `compare`) and `v4-perf.mjs` (moving, settling, settled, the still frame). The master's round made the shots repeatable: the sim paused the moment the valley is live, the animation clock stopped at one time for each shot, `QOTI_SMOKE=0`. In software a screenshot takes one to three seconds, so the shot "at 0 s of rest" is taken 1.5 to 3 s after the still frame; the table records the actual time, mode, samples and goal of each shot.
