# V4B: Photo mode, ink-and-wash captures, illustrated books and the endpaper's night

**Iteration**: V4 The developing picture. **Wave**: parallel. **Branch**: `cycle/v4b-photo-ink`, from `cycle/v4x-integration`; PR into `cycle/v4x-integration`.
**Depends on**: V4.0. **Runs alongside**: V4A, V4C, and R3's wave (R3D builds the books' picture slots and the seam). **Model and effort**: Opus 5.5 at high; Sonnet executors for mechanical parts. **Ports**: client 5262, relay 8872.

## Goal

Photo mode saves the developed picture (64 samples once V4A lands; the depth of field slider is the lens), and `capture()` gains an ink style: the still, ink lines where depth and facing break, paper grain and a limited wash, so the Chronicle, the Pattern Book, the Town Book and the season cards are illustrated by the players' own valley. The endpaper map gains a subtle lamplit wash at night, and its evening footfall ink stops reading heavy and teal over the roofs from 240 tiles.

## Read

- `CLAUDE.md`; `docs/build/v4-wave-notes.md` (Captures, The pictures seam, Photo mode at 64 samples, Stand-ins); `docs/spec/20-architecture.md`, V4 contracts
- `docs/spec/17-presentation.md`: Visual direction, 6 (Storybook pictures), Camera (Photo mode), Palette; `docs/spec/12-hearth.md`, The Chronicle
- `apps/client/src/render/renderer.ts` (`capture`, `photo`, `savePng`), `render/api.ts` (`CaptureOptions`), `app/snapshots.ts`, `ui/panels/{Photo,Chronicle,PatternBook,SeasonCard}.tsx`, `render/endpaper.ts`, `render/layers/endpaper.ts`, `worker/endpaperDraw.ts`

## You own

- New `apps/client/src/render/ink.ts` (the ink pass), `renderer.ts`'s `capture()` and `photo` (`savePng`), new `apps/client/src/app/inkPictures.ts` (the picture source), `app/snapshots.ts`
- The endpaper: `render/endpaper.ts`, `render/layers/endpaper.ts`, `apps/client/src/worker/endpaper*.ts`
- The photo strip (`ui/panels/Photo.tsx`) and the picture slots of the Chronicle, the Pattern Book and the season cards (`ui/panels/{Chronicle,PatternBook,SeasonCard}.tsx`), only where a picture is shown; the Town Book's slot is R3D's panel, filled through the seam
- `packages/art/src/palette.ts`: ink and wash tokens, appended (P3C holds the values; append only, listed in the PR)

Not P3B's files (`ui/{Toolbar,TopBar,GameUI,Minimap,Picker}.tsx`: the camera button moves to a corner cluster by the minimap; the photo strip stays where it is), not V4A's (`cache.ts`, `refine.ts`, `post.ts`).

## You can rely on

- `CaptureOptions { focus, radius, size, style?, samples? }` and `CaptureStyle` (`render/api.ts`); `SeasonRender.capture` takes them
- The governor's `photo` input: with `photo.setPhoto(true)` V4A's `refineGoal` answers `PHOTO_SAMPLES` (64); `RenderStats.samples` and `sampleGoal` say how far the picture has developed (both 0 until V4A lands)
- `LeanFrame.setDepthOfField(amount)`: the slider's one entry (V4A turns it into the lens's aperture at rest)
- R3D's seam, from R3.0 (not on V4's branches until R3X): `ui/pictures.ts` with `PictureRef = { book: 'townBook' | 'patternBook' | 'chronicle'; id: string }`, `pictureFor(ref): Promise<string | null>`, `setPictureSource(fn)`

## Tasks

1. **Photo mode saves the developed picture**: `savePng` draws at rest and waits until `stats.samples >= stats.sampleGoal` (a timeout of about 4 s, then saves what it has), at one and a half times the still frame's resolution as today. With V4.0's stub it saves at once.
2. **The ink style** in `render/ink.ts`: from the capture's color and depth (and normals, from a normal pass or derived from depth): ink lines where depth or facing breaks (thin and warm, never black), paper grain, and a limited wash (the palette's ink and wash tokens, appended to `palette.ts`). One offscreen pass a picture, at rest, never per frame; `capture({ style: 'ink' })` returns it, `'plain'` stays C5E's picture exactly.
3. **The picture source** (`app/inkPictures.ts`): `inkPictureSource(session)` returning `(ref: PictureRef) => Promise<string | null>`: where a Chronicle entry, a Pattern Book page or a Town Book page should look (from shared state: the entry's snapshot focus, the pattern's site, the page's place), captured in ink at the slot's size (480 x 360 for a 240 x 180 CSS slot) and kept (an object URL per ref, captured once). Register it with one `setPictureSource` call at startup in your module; until R3D's `ui/pictures.ts` is on your branch, keep a structural copy of `PictureRef` and leave the call for whichever of R3X and V4X lands second.
4. **The books**: the Chronicle's snapshots and the season cards take the ink style (the Chronicle keeps its column picture; its print is 80 x 60 mm); the Pattern Book's page shows its pattern's picture in a 240 x 180 slot. Print pictures (the storybook: 80 x 60 mm for a Chronicle entry, 60 x 45 mm for a book page) come back at least 1600 x 1200 px: draw them at their own size or in tiles, never through a 3200 x 2400 float read back (123 MB).
5. **The endpaper at night** (the owner's ruling, 2026-11-17): a subtle lamplit wash: a slightly deeper parchment and warm pools where the town's lamps stand, inside the worker's 150 ms budget. Draw the night layer once per town change in the worker (the lamps from shared state) and blend day to night in the final pass by the hour, so the hour never redraws the map.
6. **The footfall ink at 240 tiles** (the owner, 2026-11-17: it reads heavy and teal over the roofs): lighter, warmer, under the roofs rather than over them. Before and after shots from far240 at golden hour and night.
7. Docs: `17-presentation.md` (Storybook pictures, Photo mode: As built), `20-architecture.md`, the board row, `CHANGELOG.md`.

## Acceptance criteria

- [ ] Photo mode saves the developed picture (with V4.0's stub: at once, as today; a test that `savePng` waits on `samples` against a mocked goal).
- [ ] The Chronicle, the Pattern Book and the season cards show ink-and-wash pictures of the valley (shots `v4b-*`); the Town Book's slot gets them through the seam (a test of `inkPictureSource` with the structural `PictureRef`).
- [ ] A capture never runs on a moving frame and costs nothing while no book is open (a test: no capture without a slot shown).
- [ ] The endpaper at night: shots at 11:00, 18:00 and 22:20 from far240; the worker's drawing stays under 150 ms with the night layer (`ENDPAPER_DRAW_BUDGET_MS`'s test).
- [ ] The footfall ink: far240 shots before and after.
- [ ] Every hash matches; `v4-shots.mjs compare before v4b` shows no change outside photo mode, the books and the map.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

The refinement itself (V4A); `capture`'s `samples` (V4X wires them through V4A's accumulation); the book pages, slots, text and the storybook's print layout (R3D's); the lamps on the ground (R3F).

## Notes

- Ink is the books' voice: warm sepia lines, never comic-book black; the wash takes a handful of the palette's tones so a page reads as one book.
- The Chronicle's snapshots are taken by the lowest connected seat and stored keyed by the entry (C5F): an ink snapshot is the same flow with `style: 'ink'`. Keep the plain one for old entries that have one.
- The night wash must read as lamplight on paper, not as a dark filter: keep the parchment legible at 22:00 and the labels' contrast as V3D set it.
