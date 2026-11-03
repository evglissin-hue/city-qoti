# C5H: The first days guide

**Iteration**: I3. **Wave**: parallel. **Branch**: `cycle/05h-first-days`.
**Depends on**: C5.0 merged. **Runs alongside**: C5A to C5G. **Ports**: client 5198, relay 8808.

## Goal

A new standard valley is not a blank page. For the first three in-game days a County surveyor writes to both players, one short letter at a time, and each letter asks for one thing that teaches one system: a lane to the gate, homes for the first families, a food chain, planks, a wish granted, a pattern found, a day in the black, and a plan or a request your partner answers. Each step names its lane, so the Hearth and the Ledger player each have something to do and need each other once. Small arrows point at the tool, panel or spot that matters. It can be skipped at New valley or at any time from Settings, by each player for themselves, and it hands over to Pippa Quill's letters when it ends.

## Read

- `CLAUDE.md`, `docs/build/i3-wave-notes.md` (guide handshakes), `docs/spec/01-principles.md` (P6: teach through residents)
- `docs/spec/11-residents.md`: Story characters (the letter voice); `docs/spec/16-coop.md`: Lenses, Requests, Pings
- `packages/content/src/stories.ts` (how story letters are written and checked)

## You own

- `packages/sim/src/systems/guide/**`, `packages/sim/src/commands/guide.ts` (behind C5.0's stubs), `packages/content/src/guide.ts`
- `apps/client/src/ui/panels/Guide.tsx`, `apps/client/src/ui/guide.ts` (arrows and highlights)
- The "Show the founding guide" checkbox at New valley and the Settings line

Outside these paths: only small, necessary edits (a `CountWhat` kind the Condition DSL lacks, an id on a toolbar button so an arrow can find it), listed in the PR.

## You can rely on

C5.0's guide contracts: `GuideDef` and `GuideStep` in content types, `WorldState.guide`, `ValleySettings.guide?`, the `guide.setHidden` command, the `guide.step` event and `GuideView`, and the system slot. The Condition DSL and its evaluator, the story letter sheet (`StoryLetter.tsx`) to borrow the look from, and the alert feed.

## Tasks

1. **Content**: one `GuideDef` from a County surveyor (a name and species from the existing lists, not one of the cast) with eight steps, each `{ id, lens, letter, goal, hint, point? }`, in this order unless play shows a better one: (1) Ledger: a lane from the start to the valley gate; (2) Ledger: two homes, so the first families can move in; (3) Hearth: grant a resident's wish; (4) Ledger: a vegetable plot or a fisher's hut worked, two days of food in store; (5) both: a woodcutter and a sawpit making planks, and a building finished by the builders; (6) Hearth: decor near homes until charm rises there, then the first Pattern Book page; (7) Ledger: a day that ends with more coins than it began (the hint points at the budget report); (8) together: a plan your partner approves or a request they fill (in a solo valley the step is skipped). Letters are short (four to six lines), warm and dry like Pippa's, and never explain a button the arrow already shows.
2. **Sim**: the guide system checks the open step's goal every hour (and on the commands that can complete it), opens the next step with a `guide.step` event, writes a Chronicle line at the end, and never gives coins or goods (the I2 tune numbers must not move). It runs only in standard valleys with `settings.guide` on, and stops for good after the last step or on day 6, whichever is first.
3. **Arrows**: `point` names a tool, a panel, an overlay, or a tile (the start, the gate, the storehouse); the client draws a soft inked arrow and a pulsing outline, gone once the step is done or the panel is opened.
4. **UI**: the guide sheet (a letter with the step's hint as a P.S., like story letters), a small card in the corner with the open step and its lane color, and the per-seat hide toggle (Settings, and a "skip the guide" line on the first letter). Hiding is per seat (`guide.setHidden`); progress is shared.
5. **New valley**: a "Show the founding guide" checkbox, on by default for standard valleys.
6. **Handover**: when the guide ends, Pippa's arrival letter is next; if she is already here, the last letter says so.
7. **Autoplayer**: an advisor that does not follow the guide (it must not change the I2 tune numbers), and a test that it completes every step anyway by day 6 on seeds willow and hazel.

## Acceptance criteria

- [ ] Each step's goal has a fixture test that passes and one that does not; the whole guide finishes by day 6 in an autoplayed willow and hazel valley.
- [ ] e2e: a new standard valley shows the first letter and its arrow; finishing a step opens the next on both screens; hiding on one seat leaves it on the other; a valley made with the box unticked shows nothing.
- [ ] A migrated I2 valley never shows the guide (C5.0's migration marks it done).
- [ ] The I2 tune numbers for willow and hazel are unchanged.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Camera and control tips (one line each on the title screen's "How to play" is enough), sandbox and creative valleys, a voice-over.

## Notes

- Teach through residents (P6): the surveyor is a person with opinions, not a manual. One joke per letter at most.
- The guide must never block play: every step can be done in any order, and doing a later one early simply ticks it when its turn comes.

## As built

- **Content** (`packages/content/src/guide.ts`): Tobias Merriweather (otter, from the existing name lists) writes eight letters of four or five lines in the brief's order, each with a P.S. hint and an arrow point, plus `farewell` and `farewellAfterPippa` (additive `GuideDef` fields) and the `guide-done` Chronicle kind (three variants).
- **Step 1 changed**: worldgen already paints the valley road from the gate to the start as a lane, so "a lane from the start to the gate" held at founding. The step now asks for the next stretch: a workplace (anything with jobs, not civic, not a storehouse; a site counts) whose door is on a road that runs back to the gate (`guideLane`). Same id, same lane.
- **Goals**: two new named predicates beside `guideLane` in `systems/guide/goals.ts`, registered in `conditions/code.ts`: `guideFoodWorked` (a built plot or fisher's hut with a worker) and `guideInBlack` (yesterday's income above its running costs; construction, roads, fields and terraforming are left out as investment, since a growing hamlet spends more than it takes in for its first week). The rest use existing `CountWhat`s: `buildings` (home 4; woodcutter, sawpit), `wishesGranted`, `foodDays`, `goodProduced` (planks 4), `patternsDiscovered`, `plansApproved`, `requestsFulfilled`. No new `CountWhat`.
- **System** (`systems/guide/index.ts`): hourly at offset 190; one step an hour at most, so a goal met early ticks when its turn comes; the together step counts as done when fewer than two seats have ever joined (a solo valley); on day index 6 (`GUIDE_LAST_DAY`) it closes quietly. It is not run from commands: an in-game hour is twenty seconds at speed 1, and checking from the guide's own slot keeps every other track's command handlers untouched.
- **No butterflies**: the guide never pays, never draws from an RNG stream (the Chronicle variant goes by the day) and never takes an entity id. One `nextId++` for its Chronicle entry shifted every later id and moved the willow tune from day 4 on, so the entry takes the half step below the next id (`next - 0.5`): unique, in order when a load sorts the Chronicle by id, and the hash is the same live and loaded (tested). `npm run tune -w @qoti/bench -- 12 willow` and `... hazel` print exactly what they printed on `main`.
- **Autoplayer**: `advisors/guide.ts` (slot 90) notes each new letter in the action log and proposes nothing. `advisors/guide.test.ts`: willow and hazel finish all eight steps by day 6 as the autoplayer plays them (one person, so the together step is skipped as in a solo valley), and hazel with two seats joined earns the together step with a filled request by day 6. Willow with two seats fills its first request on day 7, one day late; the together step is covered there by the unit fixtures.
- **Client**: `ui/guide.ts` (copy, arrow targets and when an arrow is done) and `ui/panels/Guide.tsx` with `guide.css` (the corner card with the lane color and step dots, the letter on the story letter sheet with the hint as a P.S. and "Skip the guide" on the first letter, inked arrows with a pulsing outline at the tool, book or overlay, or the other lens's switch when it is not in this lens, and a ring on the start, gate or storehouse). The first letter and the farewell open by themselves; the others wait on the card. A browser remembers that it read the farewell (localStorage, per valley).
- **Small edits outside the owned paths**: one panel registry line (`ui/panels/index.ts`); one line and an import in `ui/SettingsPanel.tsx` (the per-seat checkbox); the New valley checkbox in `app/Title.tsx`; `normalizeSettings` in `packages/protocol/src/valley.ts` passes `guide` through (it was dropped, so the box could never turn the guide off); two debug hooks in `app/debug.ts` (`findRoadSpot`, `guide`); the code predicate lines in `conditions/code.ts`; the Chronicle registry line in `packages/content/src/index.ts` and its params in `hearth.test.ts`; the guide farewell in `view/seasons.ts`'s `guideView`; the advisor line and the slot order in `advisors/index.ts` and `index.test.ts`.
- **End to end**: `e2e/c5h-guide.spec.ts` (the first letter and its arrow on both seats, the next step on both screens after a woodcutter on the lane, hiding on one seat only, nothing with the box unticked). The first letter sits over the valley, so `?noguide` starts the New valley box unticked and `HAMLET_QUERY` in `e2e/helpers.ts` carries it; `GUIDE_QUERY` is the default New valley. Screenshots: `docs/build/screenshots/c5h-*.png`.
