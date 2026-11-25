# R3G: The storybook

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3g-storybook`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: high. Client only.
**Depends on**: R3.0. **Runs alongside**: R3A to R3F, and V4's wave (V4B's illustrated books meet this cycle at one seam). **Ports**: client 5248, relay 8858.

## Goal

When a chapter closes (a sealed Charter; today the Village chapter), "Print the storybook" lays the chapter out for the browser's own print dialog, to paper or a file: the valley's endpaper map on the cover, the chapter's Chronicle entries with their pictures, the Pattern Book and Town Book pages found, and the residents' portraits. It is made on the client from what the valley already stores; nothing about it is sim state. Pictures come through one seam, so V4B's ink-and-wash captures drop in when they land.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (R3.0's calls: the picture seam; Panels and the views they read)
- `docs/spec/12-hearth.md`: the Chronicle (Snapshots), The storybook of the valley; `docs/spec/17-presentation.md`: Books, Visual direction (the endpaper); `docs/spec/21-networking-and-saves.md`: Chronicle snapshots
- `docs/spec/30-roadmap.md`: V4 (illustrated books); `docs/spec/20-architecture.md`: V3 contracts (the endpaper map), R3 contracts

## You own

A new `apps/client/src/ui/panels/Storybook.tsx` (one registry line), a print stylesheet `ui/storybook.css`, the "Print the storybook" line where a chapter closes (`ui/panels/Chapter.tsx`, one line), the endpaper still for print (one method appended to `render/api.ts` and implemented in `render/endpaper.ts`, which neither V4 nor R3F claims), e2e `apps/client/e2e/r3g-*.spec.ts`, shots `docs/build/screenshots/r3g-*`.

## You can rely on

- R3.0's picture seam `apps/client/src/ui/pictures.ts` (`PictureRef`, `pictureFor`, `setPictureSource`; slots landscape 4:3: a Chronicle entry's picture at half the text width, 80 x 60 mm, a book page's 60 x 45 mm; a source returns at least 1600 x 1200 px). Its shape is fixed, and only V4B calls `setPictureSource` (whichever of R3X and V4X lands second wires it).
- The Mirror's Chronicle entries and C5F's snapshots, the Pattern Book, `TownBookView` (`townBook.updated`; R3C fills it, R3D shows it), the Charter's history (which chapter closed when), residents and the Portrait, V3D's endpaper map (`render/endpaper.ts`, drawn in a worker).

## Tasks

1. **Where it starts**: a "Print the storybook" line on a sealed chapter (the Chapter panel), opening the Storybook panel for that chapter; the panel is a registry line on the Books shelf (P3B's, on `main`: merge it first).
2. **The layout**: the cover with the valley's name and the endpaper map (a still of it at print resolution through the one render API method you add); the chapter's Chronicle entries in order with their pictures (`pictureFor({ book: 'chronicle', id })`; a snapshot where one exists, else none); the Pattern Book and Town Book pages found in the chapter, each with its picture slot; the residents' portraits. Paper sizes A4 and Letter, margins for a home printer, page breaks that never split an entry from its picture; the browser's print dialog does the rest (`window.print()`, `@media print`).
3. **The fallback**: when `pictureFor` gives null, a Chronicle entry prints its own snapshot where one exists (the panel's fallback, not a registered source), so the storybook prints the valley's own pictures before V4B lands.
4. **e2e and shots**: a sealed Village chapter printed to PDF with `page.pdf` (the file has the cover map, at least one entry with its picture, a Town Book page slot); shots of the panel at 1250 px and of the PDF's first pages.

## Acceptance criteria

- [ ] A chapter's storybook prints from the browser with the valley's own pictures (the e2e writes a PDF; shots).
- [ ] V4B's source plugs in with one `setPictureSource` call and nothing else changes (a unit test with a fake source).
- [ ] Words are warm, dry, US spelling, no em dashes; nothing reads the sim beyond the Mirror; typecheck, lint, unit tests, build and e2e pass.

## Out of scope

The Town Book panel (R3D); the ink-and-wash pictures (V4B); the endpaper map itself (V3D's) and its night tint (V4B's).

## Notes

- The endpaper is drawn in a worker on an OffscreenCanvas (V3D's As built); ask it for a still rather than drawing a second map.
- Keep the print stylesheet scoped to the storybook, so printing anything else is unchanged.
- Runs as the build and review loop (`31-parallel-development.md`): one round of quality check and the player's chair (print a real chapter of an autoplayed Village to PDF and read it) before the PR.
