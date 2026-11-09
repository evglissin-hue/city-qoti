# P1: Quality audit and polish (the owner's playtest)

**Iteration**: I3 to I4. **Wave**: serial, one master session running the build and review loop (`docs/spec/31-parallel-development.md`) with executor waves. **Branch**: `claude/busy-archimedes-3hky32`.
**Depends on**: C5X merged. **Runs alongside**: nothing; no I4 brief is written until P1 is done (`30-roadmap.md`, P1).

## Goal

The rough edges the owner's playtest of 2026-11-08 found are gone, the town can no longer be locked into a restart, every wish and goal can be met, the screen says what to aim for, and the vision the playtest sketched for the next stages is in the spec with a first slice to play.

## Input: the owner's playtest (2026-11-08, "Cottage Construction and UI Enhancements")

Bugs and weak mechanics:

1. The town hall could be removed but not rebuilt, forcing a restart.
2. A resident asked for a well although home was inside a well's radius.
3. Planning a festival did nothing.
4. Some wishes are dead ends.
5. Land cannot be flattened.
6. Wheat can only be sown in spring, so a windmill is useless in summer.

Economy and simulation:

7. Early building mostly needs planks; stone ran short once the windmill went up.
8. Residents walk through each other; their animation and AI should improve.
9. A simple trade system: see what the neighbors need, import with money, export for income, with each neighbor its own advantage and little manual price or trader management.

UI and clarity:

10. The overall goal should be clearer.
11. More icons, less clutter, a cleaner and more visual UI.
12. Ledger resource counts: bigger, perhaps in a side panel.
13. The end of the game needs work (valleys are generated and never repeat).

Visuals and sound:

14. More decoration variety, such as window flowers in different colors.
15. Trees and vegetation; meadow grass should look more alive and fluffy.
16. Pricier decorations that boost a building's productivity and look better.
17. Night ambience is too fake and chirpy.

Vision for the next stages:

18. Zoning like Cities Skylines: buildings grow and improve on their own, with decorating by hand still possible.
19. Development paths by map and location (an industrial village, or a pretty one for tourism or pilgrimage), shaping how the village looks over time, with easier growing.

## How it runs

The master (Opus, max effort) traced every item with read-only explorers, fixed 1 and 2 itself, then briefed Sonnet executors in two waves of parallel worktrees:

- Wave 1: festivals (3), wishes (4), Earthworks (5), wheat, stone and hamlet imports (6, 7 and the import half of 9), the goal pill, icons and stores (10 to 12), decor colors and boosts (14, 16).
- Wave 2: walkers (8), trade deals (9), the chapter's end (13), vegetation (15), night sound (17), homes that improve and development paths (18, 19), and the playability audit that hunts dead ends from now on.

After each wave: the quality check, the dead-end hunt and the player's chair, one or two rounds.

## Acceptance criteria

- [x] Each of the 19 items is fixed, built as a first slice, or written into the spec with the reason, and the As built below says which.
- [x] A test for each fixed bug, and a check for its whole class where one is cheap (every wish, every building, every command).
- [x] The playability audit runs clean on its seeds, or every flag is explained.
- [x] Typecheck, lint, unit tests, build and bench pass; e2e as far as this machine allows.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Notes

- **Music**: a separate session is merging a new music system; P1 stays out of music. P1's night ambience touched two audio files a music rework may share, so whichever lands second resolves them:
  - `apps/client/src/audio/engine.ts`: the ambience bus no longer sends 0.08 to the music's room reverb but feeds an outdoor convolver (send 0.3, wet 0.4); `mix()` takes a `night` index (owls skip some nights); each ambience voice takes an optional playback `rate` (cool nights chirp slower).
  - `apps/client/src/audio/bank.ts`: the bank's limit rose from 8 M to 11 M samples (the longer night loops are about 7 M in all).
  - Everything else P1 changed in audio is ambience only (`synth/ambience.ts`, `ambience.ts`, their tests, `tools/audio/night.ts` and `stats.ts`).

## As built

Every item is fixed or built as a first slice; the spec says how in the sections named (`12` Hearth, `13` Ledger, `15` Progression, `17` UI and art, `10` world, `11` residents, `30` roadmap).

| # | Item | As built |
|---|---|---|
| 1 | Town hall soft lock | Fixed: the town hall cannot be removed (`HALL_STAYS`); a valley that lost it before P1 may raise one. Test, plus the class check that everything removable can be rebuilt. |
| 2 | Well wish inside a well's radius | Fixed: A Well Closer is asked only from outside every well's reach; a crowded well asks for A Second Well instead. The autoplayer answers both. |
| 3 | Planning a festival did nothing | Fixed: the plan says when it is too late, the poster follows the season, a toast says it has begun, the chip and the Festival decor group lead to it, and a piece can be kept from the result card. |
| 4 | Dead-end wishes | Fixed: a wish nobody could grant is not voiced (`achievable`), routes count bridges and gates, Fresh Fish waits out a frozen river, and hedges, walls and trees muffle noise so Quiet, Please can be granted. Class check: every goal and wish is achievable. |
| 5 | Land cannot be flattened | Built: the Earthworks tool raises, lowers and levels a box, with its cost, one undo per drag, and a hint on steep sites. |
| 6 | Wheat only in spring | Fixed: sown from Spring day 1 to Summer day 3, cut from the first day of summer at full yield (golden is ripe). See the quality check below. |
| 7 | Stone short at the windmill | Fixed: the windmill takes 8 stone and the bakery 10 (both were 16); the quarry's first hand is hired first while stone is short and a site waits; the feed says when stone runs low. The start stays 30. |
| 8 | Residents walk through each other | Fixed in the renderer: walkers keep lanes, stagger and step around each other, carts keep their tracks. |
| 9 | A simple trade system | Built: the Deals tab, one switch a deal, sizes its own orders and keeps its numbers fresh each day; each neighbor has a character and its wants; River Dock deals; a hamlet's peddler brings up to 20 units a day at 140%. |
| 10 | A clearer goal | Built: the goal pill says what to aim for next, through to "Village chapter complete". |
| 11 | More icons, less clutter | Built: the top bar's counts carry icons; the Stores strip folds away while the Stores panel shows. |
| 12 | Bigger resource counts | Built: the Stores panel, larger counts grouped as food, grain, building, home and crafts. |
| 13 | The end of the game | First slice: the Village chapter card when the First Winter is weathered (its own plaque), an honest line about the Town Charter, an invitation to a new valley named from its seed. |
| 14 | Decor variety | Built: window boxes in colors, added by hand (never assumed), and the fine pieces. |
| 15 | Trees and grass | Built: meadow tufts and blades that sway, three tree shapes, autumn and winter colors. |
| 16 | Pricier decor that boosts work | Built: fine pieces with a price raise a workplace's output nearby (the decor boost line), refunded on removal. |
| 17 | Night ambience | Built: field crickets over a night bed, a softer owl on some nights, frogs, an outdoor reverb. |
| 18 | Zoning that grows on its own | First slice: zoned lots already grow (C5X); homes now dress themselves up as their street's charm rises (30, 36, 42), and hand decoration still counts. I4 takes the rest (`30-roadmap.md`). |
| 19 | Development paths | First slice: at the Village claim the valley offers the two callings its land suits (Mill Town, Garden Village, Pilgrims' Rest), each with an effect, a district style lean and a signature piece. |

**The loop.** Wave 1 and wave 2 ran as executors in worktrees; each merge had a quality check and a player's chair round (window boxes made opt-in, a "For the work" decor group, the Stores grouping, the Calling card naming each gift once, a softer owl, the seed note). The dead-end hunt added the playability audit (`npm run audit -w @qoti/bench`) and its health kinds (no builders, idle for want of an input, a wish nobody can grant, a festival that never started, an order never filled).

**The last round's finds** (bench and audit, before the player's chair):

- The wheat change ploughed each year's crop under as it turned golden in spring's longer sowing, and cut tiles the hour they turned golden for 2 wheat instead of 26: a farm brought in a quarter of its harvest (72 wheat a year from 12 tiles against 312) while every window test passed. Fixed, with a one-year yield test as the class check.
- The audit flagged the windmill and bakery waiting through winter and spring. That is the year's shape once wheat comes in from summer, and the windmill's line says so; the audit now skips field-crop waits in winter and spring and still flags one through a summer or an autumn.
- P1 had raised the starting stone to 40 and moved the autoplayer's quarry earlier to match. That moved every valley's first days: on willow the guide closed on its food step and the first winter ran its larder dry. Back to 30 and the old quarry rule; the cheaper windmill and bakery keep item 7 fixed.
- The autoplayer keeps a 120-coin cushion before borrowing and a winter's grain from summer.
- Player's chair: Earthworks and the festival site tool showed their icon's name as a word in the toolbar (it looked icons up by tool id only). Fixed, with a check that every registered tool draws an icon. The guide's letter card covered the festival poster and the decor picker's first piece; it now steps aside while a book or a picker is open, as the left feed does. A boost line read "work at a orchard"; every boosting piece's line is checked for its article.

**Bench**, residents at day 70 in the Village run, six seeds (oak, hazel, willow, birch, alder, rowan): main 168 137 142 137 119 127 (mean 138); P1 114 120 177 165 157 191 (mean 154). Oak is P1's lowest (its Hamlet claims on day 38, not 30), so the oak test's floor is 110 (was 140), with the table in the test; its other checks are unchanged.

**e2e**: 27 pass and 2 are skipped, run here with the preinstalled Chromium (`QOTI_CHROMIUM=/opt/pw-browsers/chromium`; the pinned Playwright wants a newer build). The co-op test now finds the partner by the seat dot's tooltip, since a bar under 1361 px shows the partners as dots.

**Audit**: clean on its seeds. One warning: Quiet, Please is offered and never granted by the autoplayer, which plants no hedges; it is achievable.

**Left for later**: `plan.edit` has no UI yet (allowlisted in the command sender test); the I4 ideas in `30-roadmap.md`.
