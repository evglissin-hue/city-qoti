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
