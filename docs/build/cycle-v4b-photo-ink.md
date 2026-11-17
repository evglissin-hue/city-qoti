# V4B: Photo mode, ink-and-wash captures and illustrated books (draft)

**Iteration**: V4. **Wave**: parallel. **Branch**: `cycle/v4b-photo-ink`, PR into `cycle/v4x-integration`.
**Depends on**: V4.0. **Runs alongside**: V4A, V4C. Draft by V3X; V4.0 finalizes it.

## Goal

Photo mode saves the developed picture (64 samples, the depth of field slider is the lens), and `capture()` gains an ink style: the developed still, ink lines where depth and facing break, paper grain and a limited wash. The Chronicle, the Pattern Book, the Town Book and the season cards use it, so the books are illustrated by the players' own valley.

## Read

- `docs/build/v4-wave-notes.md`; `17-presentation.md`, Storybook pictures and Photo mode; `12-hearth.md`, The Chronicle
- `renderer.capture()`, the photo panel (C5F), the book pages that take pictures

## Tasks

1. Photo mode saves at 64 samples through V4A's refinement (a stub of V4.0's until V4A lands: the plain still).
2. The ink style in a new `render/ink.ts`: edges from depth and normals, grain, a limited wash from `palette.ts` (append tokens).
3. The books' picture hooks take the ink style; pictures are captured at rest, never per frame.
4. If the owner wants it: the endpaper map's lamplit wash at night (V3D's note; an owner's call).

## Acceptance criteria

- [ ] Photo mode saves the developed picture; the Chronicle, the Pattern Book and the Town Book show ink-and-wash pictures of the valley (shots).
- [ ] A capture never drops a moving frame (it runs at rest) and costs nothing while no book is open.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

The refinement itself (V4A); new book pages or text (R3's).
