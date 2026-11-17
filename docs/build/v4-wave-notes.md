# V4 wave notes: how the tracks meet (draft)

Draft by V3X (2026-11-17) for V4.0 to finalize, as V3.0 wrote V3's. Read with your brief. V4 is "The developing picture" (`30-roadmap.md`, V4; `17-presentation.md`, Visual direction, 6. The picture develops when you stop): the picture gets better when the players stop to look, and the books are illustrated by the valley itself. Like V3, V4 changes no sim state: every hash stays the same.

## Rules for the wave

- **The look is the point, and the frame budget is the floor.** Refinement costs nothing while moving and nothing once settled. If the measured cost does not fit Medium on Kat's laptop, Medium keeps today's still frame and refinement is High's and Ultra's alone (the roadmap's third acceptance line).
- **Measure before building.** V4.0 records the before on both laptops with Measure this laptop, and V3's laptop tables first if they are still missing (`22-quality.md`, V3's headroom: the laptop columns were left open at V3X).
- **Contracts additive, names append-only**; registries one sorted line each; no em dashes; every static change through `ctx.invalidate()`.
- **Build and review loop** (`31-parallel-development.md`), each track opening its PR into `cycle/v4x-integration`.

## Ownership by file (to be fixed by V4.0)

| Owner | Files |
|---|---|
| V4A rest-frame refinement | `render/cache.ts` (`StillCache`: the accumulation), `render/post.ts` (the refined still's resolve and the lens from cached depth), `render/shadows.ts` (the jittered sun disc), the refinement's governor beside `render/resolution.ts` (P2-F's, additive) |
| V4B photo mode, ink and books | `renderer.capture()` (`style: 'ink'`), a new `render/ink.ts`, the photo panel in `ui/` (with R's say: `ui` is R's path), the Chronicle, Pattern Book and Town Book picture hooks |
| V4C tea-break mode | `input/camera.ts` (the tea-break camera, `20-architecture.md`), a setting, the idle timer |
| V4X | `renderer.ts` (but a track's named lines), `perf.ts`, `debug.ts`, the shots and perf scripts |

## What V3 leaves (V3X's list)

| Item | Where it goes | Why |
|---|---|---|
| The laptops' GPU tables for V3 (both laptops, before and after; Medium must hold 12 ms GPU moving and 4 ms idle on Kat's laptop) | V4.0's first task, if still open | V4's budgets are judged against them |
| The far camera's remaining cost: the shadow pass re-rendered on far views, Ultra's second still pass (the AO normal pass, GTAO), nature, trees and decor drawn per chunk | V4A, as part of the still frame's budget (V3C's list, measured inside budgets at V3X) | V4's subject is the still frame; joining by block (V3C's `ChunkedMeshes` `group`) is the known tool |
| A valley that slopes out into the hills instead of a cliff ring (worldgen, new valleys only) | **R3 or I4, not V4**: it needs a sim cycle (worldgen changes the map and every new valley's hash) | V3X drew the existing rim as a slope (`surface.ts`, `rimLevel`); the valley's rocky upland just inside the rim still shows from far200 |
| The tavern's dressing fits in isolation but not in the grown village's tight spot | a small fix in V4X or R2X's regrown village (it may fit on R2's lots) | V3X's six rules for undressed buildings |
| The endpaper map's tint at night (the same parchment at every hour today) | **an open owner's call**; V4B if the owner wants it (a lamplit wash fits ink-and-wash) | V3D's note |
| The inks (goods routes, evening footfall) and street names on the map | R2X (not V4) | R2's data |

## Stand-ins at the start of V4

None new. V3's stand-ins that R2X retires are in `v3-wave-notes.md` (Stand-ins).
