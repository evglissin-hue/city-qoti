# R1D: The Hearth's tools and the first days

**Iteration**: R1 Zones first. **Wave**: parallel. **Branch**: `cycle/r1d-hearth-first-days`, from `cycle/r1x-integration`; PR into `cycle/r1x-integration`. **Recommended effort**: high.
**Depends on**: R1.0. **Runs alongside**: R1A to R1C, R1E, R1F, and V2's wave. **Ports**: client 5224, relay 8834.

## Goal

The Hearth composes places in a few gestures (seats that face what is worth looking at, runs that space themselves and meet roads gracefully, a flower brush, moving decor and hand-placed buildings), and the first days, the story arcs, wishes, festival menus and achievements all speak the zones-first Ledger's language: every one of them can be met in a fresh valley.

## Read

- `CLAUDE.md`; `docs/build/r1-wave-notes.md` (File ownership: R1C and R1D split `ui` and `input` by file)
- `docs/spec/12-hearth.md`: Decorating that composes itself [R1]; the [R1] notes in Patterns (detectors by trade, the garden bed), Wishes, Festivals, Nature (the Apiary)
- `docs/spec/02-game-overview.md`: The first days guide (the letters "from R1"), Standard valley from R1
- `docs/spec/11-residents.md`: the [R1] notes on the story arcs
- `docs/spec/15-progression.md`: the [R1] notes (Village goals, achievements and the new feats)
- `docs/spec/10-world-and-building.md`: From the redesign (Moving)
- `docs/spec/16-coop.md`: the [R1] notes (moving the partner's handmade work asks first; undo of move)

## You own

The R1D paths in `r1-wave-notes.md`: the composing helpers and move tools in `apps/client/src/input`, the Hearth's panels (Pattern Book, Wishes, Festival, Guide), `commands/move.ts` and the moves' validators, `systems/{hearth,stories,guide,festivals,achievements}`, the wishes and their achievable check, `conditions/**`, and content `guide`, `stories`, `herbalist`, `stonemason`, `wishes`, `festivals`, `achievements`, `seasonsAchievements`, the pattern files and decor files.

## You can rely on

- R1.0's `decor.move { id, fx, fz, rot }` and `build.move { id, x, z, rot }` shapes (refused until you build them), `hasTag` (a business answers to its trade id, so "a baker within 12 tiles" works), the stand-ins listed for R1D in the wave notes (the guide's food and timber steps, Pippa's, Mother Thornbury's and Odette's steps, A Garden Plot, the Kitchen Garden, the Pie Contest).
- R1A's `flavorsOnOffer` and R1B's businesses (stubs until they land); the placement validators (`rules/`).

## Tasks

1. **Move**: `decor.move` and `build.move` run the placing validators at the new spot with the piece itself left out of the collision test; a piece keeps its identity, builder and customizing; a building is taken down and raised again by the builders for a third of its work and no materials; moving the partner's handmade work asks first, as removing it does; undo. The client's move tool (pick up, set down). Take both off `OWED_SENDERS`.
2. **Composing helpers** (12-hearth.md, Decorating that composes itself): seats face water within 4 tiles, else the open side, else the path (R still turns); lantern runs every third tile on alternating sides; flowers along a wall or path; hedges leave an arch where they cross a path, fences and walls a gate; the flower brush as one `decor.placeRun`; a pattern page's "Lay it out" ghost once discovered. Every result is an ordinary command.
3. **The garden bed**: the Hearth piece the vegetable plot and herb garden become (4 timber beside a home), giving that home vegetables as a flavor through the growing seasons (variety, not volume), counting for charm, wishes (A Garden Plot) and habitats as the plots did; the Kitchen Garden detector reads it.
4. **The first days guide's letters** (02-game-overview.md, "From R1"): a lane to the valley gate; homes zoned along it and the first two built; farmland zoned on good soil; a Forester's Lodge by the woods; a wish granted; a fishery or a farmstead at work and three days of Food in store; the first workshop the town opened by itself (design note (c): its letter names the windmill, since a baker needs one; R1B's need term makes sure the first workshop can grow); the first Pattern Book page; a day in the black; a plan approved (or a gap closed, R2).
5. **Story arcs** (11-residents.md, [R1]): Pippa Quill (a baker in a windmill's reach; a Forester's Lodge by the river, her letter bringing the Water Wheel and the Sawmill at once; three kinds of workshop), Odette Fenwick (three flavors on a stall, the Market Square, a Trading Post, a season's deal; her finale roofs the square into the Market Hall), Mother Thornbury and Barnaby Ashcombe in the new goods; Juniper Reed as built.
6. **Wishes, twists, menus, achievements**: a wish naming a workplace names its trade and is voiced only where it can be met (the achievable check); Fresh Fish wants fish on a shelf in reach; festival menus are up to four flavors of Food and Treats; a twist naming a good the town cannot make is not offered (the Pie Contest waits for R3, the Costume Parade asks cloth); Plank by Plank is the first timber cut; Market Day is every base flavor of Food on the stalls at once; A Winter Without Imports (the carrier brought no Food or Fuel and nobody went short); the new feats A Town That Builds Itself and Porridge No More (new `CountWhat` members, additive); the Village goal "5 days of Food with 3 flavors" (with R1A).
7. **Static checks** for the dead-end hunt: every wish template, twist, guide step and story step can be met from a fresh standard valley's content (extend `p1/every-goal-is-achievable` style tests to all of them); R1F's audit runs them too.
8. Tests for each helper, move (validators, identity, the partner's work, undo), the garden bed's flavor, the guide's steps completing in a headless run.

## Acceptance criteria

- [ ] Every R1D stand-in and every R1D entry in `OWED_SENDERS` is gone.
- [ ] Every wish, twist, guide step and story step can be met (the static check passes; a headless run of the guide completes every step by its last day on two bench seeds).
- [ ] Every new line of text read in place in the player's chair: warm, dry, never babyish, no em dashes, US spelling.
- [ ] Typecheck, lint, unit tests, build and e2e pass (the guide spec back on; R1.0 skipped the steps your letters change).

## Out of scope

The Ledger's books and top bar (R1C); what businesses grow (R1B); the carrier (R1A); art (R1E); the evening round (R2).

## Notes

- Moving goes through the same validators as placing; the client's ghost must match the sim's answer.
- The guide never pays coins or goods.
