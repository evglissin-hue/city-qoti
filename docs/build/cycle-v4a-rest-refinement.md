# V4A: Rest-frame refinement and its governor (draft)

**Iteration**: V4. **Wave**: parallel. **Branch**: `cycle/v4a-rest-refinement`, PR into `cycle/v4x-integration`.
**Depends on**: V4.0. **Runs alongside**: V4B, V4C. Draft by V3X; V4.0 finalizes it.

## Goal

When the camera rests, the still frame keeps developing for about half a second: jittered pixels (crisp brick and tile), a sun inside a small disc (soft shadows that widen with distance), a lens (true depth of field with round highlights) and, one sample in four, light from the sky (soft shadow in alleys and under eaves). A light step or a small town change folds in fresh samples and never restarts; moving drops back to the plain moving frame at once. A governor skips refinement when moving frames are already slow.

## Read

- `docs/build/v4-wave-notes.md`; `17-presentation.md`, 6. The picture develops when you stop
- `render/cache.ts`, `post.ts`, `shadows.ts`, `resolution.ts`; `22-quality.md` (V4.0's before)

## Tasks

1. Accumulate samples into the still frame (`StillCache`), one a frame, to the preset's count; moving layers drawn over the result as today.
2. The jitters: pixel, sun disc (`shadows.ts`), lens (depth of field from the cached depth in the final pass), sky samples.
3. Never restart on a light step or a small change: fold in a few fresh samples.
4. The governor: no refinement while moving frames run slow; Medium falls back to today's still frame if the measured cost does not fit Kat's laptop.
5. V3's far-camera list as part of the still frame's budget: the shadow pass on far views, Ultra's second still pass for the AO, nature, trees and decor joined by block where it pays (V3C's `ChunkedMeshes` `group`).

## Acceptance criteria

- [ ] At rest the picture settles inside 0.6 s on High; idle frames return to their budget on Medium on Kat's laptop; moving frames cost what they did (`v4-perf.mjs`).
- [ ] A light step or a small change never makes the picture pop (a shot sequence and a test of the fold-in).
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Photo mode's 64 samples and the ink style (V4B); the tea-break camera (V4C).
