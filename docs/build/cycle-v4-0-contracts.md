# V4.0: The developing picture contracts (draft)

**Iteration**: V4 The developing picture. **Wave**: serial. **Branch**: `cycle/v4-0-contracts`, one PR into `main`.
**Depends on**: V3X merged. **Runs alongside**: R3's wave (other paths). Draft by V3X; V4.0 finalizes this brief and its wave notes.

## Goal

V4's tracks can start in parallel: the refinement's interface in the still-frame cache, the ink capture's options, the tea-break camera's hooks and the governor's inputs are fixed as types with stubs that change nothing on screen; both laptops' before numbers are recorded; the wave notes and V4A to V4X briefs are final.

## Read

- `CLAUDE.md`, `docs/build/v4-wave-notes.md` (this wave's draft)
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

- [ ] Nothing on screen changes (`v4-shots.mjs before` equals the after of a no-op); every hash matches.
- [ ] Both laptops' before tables are in `22-quality.md`, or the owner's word defers one.
- [ ] The four briefs and the wave notes are final and on the board.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

The refinement itself, the ink style, the tea-break camera's motion (V4A to V4C).
