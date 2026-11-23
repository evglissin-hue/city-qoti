# P3D: The front door

**Iteration**: P3 (the owner's polish requests). **Wave**: serial. **Branch**: `cycle/p3d-front-door`.
**Depends on**: P3A, P3B, P3C (on `main`). **Runs alongside**: the R3 gameplay wave and the V4 look wave, on their own branches (stay out of their files; V4's tea-break camera and photo mode are not on `main` and are not reused here).

## Goal

The owner, 2026-11-23: "it would be great to also improve main menu and make it nicer". Visual quality comes first, above speed. When this cycle is done the first thing either player sees already looks like the game and makes the next step obvious: the real renderer shows a small lived-in valley behind a menu of clear choices, and the form for making a valley waits until the player has chosen to make one.

## Read

- `CLAUDE.md`
- `docs/spec/16-coop.md`: Creating and joining
- `docs/spec/21-networking-and-saves.md`: the old valleys rule (version 6 refuses older valleys; they stay listed, grayed, with "Save its file")
- `docs/spec/17-presentation.md`: UI (the paper, the type, lamplight)
- `apps/client/src/app/{Title,App,GameView,fixture,recent,invite,oldValley,quality}.ts(x)`, `ui/SettingsPanel.tsx`, `ui/settings.ts`, `ui/copy.ts` (the `title` block), `ui/theme.css` (the `.title-*` rules)
- `apps/client/e2e/{r1c-title,ui-shots,hamlet,coop,c4d-coop,solo}.spec.ts`: the specs that walk the title

## You own

- `apps/client/src/app/Title.tsx` and `apps/client/src/app/title/**` (the menu, its steps, the backdrop host, the painted fallback, their css), the title strings in `ui/copy.ts`, the dead `.title-*` rules in `ui/theme.css`
- new e2e specs and shot scripts `apps/client/e2e/p3d-*`; shots `docs/build/screenshots/p3d-*`
- this brief, the board row, a CHANGELOG line, As built notes in `docs/spec/16-coop.md` and `17-presentation.md`
- `.github/workflows/ci.yml`, copied byte for byte from `origin/cycle/r3x-integration` (the end-to-end suite in three parallel jobs)

Outside these paths: only small, necessary edits, listed in the PR (a renderer option, an export from the settings panel, a line in the session that keeps the recent list's season and partner current, selectors in the existing e2e specs that walk the title). No sim, content or protocol change; no saved state change (the recent list is this device's own record, not a save).

## You can rely on

- `Renderer(container, mirror, quality)`, its `rig` (`saveView`, `restoreView`, `snap`), `setQuality`, `photo.setTimeOfDay` (C5E) and `dispose`; `SimHost` and `Mirror` as the session uses them
- the grown village (`app/fixtures/grown.qoti`, read by `fixture.ts`), the stored snapshots of solo valleys (`IdbStorage.latestSnapshot`)
- `initialQuality()` and the quality key, `loadSettings()` (Calm motion), `prefers-reduced-motion`

## What is on screen (before)

A flat painted sky with a sun, two clouds and two hills, and one card that is a form straight away: your name, six color swatches, the town name, "New valley for two", "A quiet solo valley", the Creative and first-days guide checkboxes, and "More" (seed, the Economy and Threats dials, open a valley file). The recent valleys list sits below ("Pick up where you left off"), with old valleys grayed. See `c3e-live-title.png` and `c3e-live-title-more.png`.

## Tasks

1. **A living backdrop.** Behind the menu the real renderer shows a lived-in valley: the most recent solo valley from its stored snapshot when it is not old and has grown past a hamlet, else the grown village. Lit at a flattering hour (a golden afternoon, or dusk with the lamps lit when the player's clock says evening; `?titleLight=` pins it), with a slow camera drift and the town's own motion (folk, smoke, lamps). The painted backdrop shows at once and the live one fades in over it when its first frame is drawn; the menu never waits for it. It starts on the gentlest preset unless the player has a saved choice, and follows the title's settings card live. Calm motion and `prefers-reduced-motion` hold the camera still. No WebGL keeps the painted backdrop (improved: layered hills, a village with lit windows at dusk, a sky without banding). Leaving the title disposes the renderer, the worker and every timer (`backdropStats` in `title/shared.ts` counts them). Online valleys have no local snapshot, so they show the grown village (say so in the PR).
2. **A menu before a form.** The first view is the wordmark, one line of welcome and the choices: Continue (the most recent valley by name, its season and day, who it is shared with, when it was last played; the other valleys one step away), New valley for two, A quiet solo valley, Join when an invite is in the URL or pasted, and a quiet row for Settings (picture quality, sound, interface size, Calm motion: the settings panel's own pieces) and Open a valley file. Name, color, town name, Creative, the guide and the dials are the second step of making a valley, with a way back. A returning player is two clicks from the town; Continue is one. Old valleys keep their rule and their words, in the list.
3. **The look.** The game's paper and type (the books, P3B's bar): a wordmark set with care, generous spacing, nothing that reads as a web form; lamplight on the paper when the backdrop is at dusk. Holds at 1250 x 680, 1366 x 768, 1440 x 900 and 1728 x 1000 and stays usable in a narrow window. Tab order is sane, Enter takes the primary action, Escape steps back.
4. **Two candidates first.** Build two layouts quickly, shoot both over the same backdrop at 1366 x 768 by day and at dusk (`p3d-candidate-*`), pick one with reasons, then finish it.
5. **Words.** Every string read in place. "Two players, one valley, no rush." stays unless something better turns up. No exclamation marks, no em dashes.
6. **Boot numbers.** Time to an interactive menu and time to the backdrop's first frame, before and after, from a production build (`e2e/p3d-boot.mjs`).

## Acceptance criteria

- [ ] A new player reaches a playing solo valley and a two-seat valley, and a returning player their last valley, each by the obvious path; joining by invite link works; opening a valley file and the old valleys list work. Every existing e2e spec that walks the title passes, updated only where the flow changed, never loosened.
- [ ] New e2e: the menu is interactive before the backdrop is ready; Continue opens the most recent valley; the two-step new valley flow and its way back; Escape and Enter; no WebGL falls back to the painted backdrop; leaving the title disposes the backdrop.
- [ ] Shots before and after: the first view by day and at dusk at the four sizes, the second step, Continue with one and with several valleys, old valleys, the no-WebGL fallback, the narrow window. Every shot looked at in full; nothing clipped, no card over the prettiest part of the picture, no backdrop of empty grass, no banding.
- [ ] Boot numbers before and after; the backdrop does no work once the game has started.
- [ ] Typecheck, lint, unit tests, build, e2e and bench pass; spec and CHANGELOG updated; the board row names the PR.

## Out of scope

- Anything inside a valley once it is open (the bars, the books, the settings panel's valley half).
- Tea-break mode and photo mode (V4).
- Any sim, content or protocol change; any change to saved valleys.
