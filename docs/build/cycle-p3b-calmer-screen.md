# P3B: A calmer screen

**Iteration**: P3 (the owner's playtest of R2 and V3). **Wave**: parallel. **Branch**: `cycle/p3b-calmer-screen`.
**Depends on**: R2X, V3X (on `main`). **Runs alongside**: P3A (the economy half of the playtest).

## Goal

The owner, 2026-11-17, after playing `main`: "also ui/ux is too cluttered, ESPECIALLY bottom panel." Visual quality is his top priority, and he plays on a laptop (design at 1250 to 1440 px wide, check 1366 x 768). When this cycle is done the screen reads at a glance: the valley is the picture, and the interface is a few quiet, well-grouped controls. The bottom bar first. Nothing a player can do today is lost or more than two clicks away, and both lenses keep their character (`17-presentation.md`, The redesign's interface).

## Read

- `CLAUDE.md`
- `docs/spec/17-presentation.md`: UI, The redesign's interface (the calmer top bar, the Build picker's shelves, Books, cards that wait their turn, paper by lamplight; R1C's and R2D's As built)
- `docs/spec/22-quality.md`: Definition of done, the accessibility lines
- `docs/build/cycle-p2-playtest.md`: As built (the top bar and the feed)
- `apps/client/src/ui/{Toolbar,TopBar,GameUI,Minimap,Picker}.tsx`, `ui/lenses.ts`, `ui/topbar/**`, `ui/panels/Alerts.tsx`, `ui/theme.css`

## You own

- `apps/client/src/ui/{Toolbar,TopBar,GameUI,Minimap,Picker}.tsx`, `ui/topbar/**`, `ui/lenses.ts`, `ui/panels/Alerts.tsx` (the feed's layout), the css beside them and `ui/theme.css`, their tests
- the e2e specs they break; shots `docs/build/screenshots/p3b-*`

Outside these paths: only small, necessary edits (registry lines, exports, additive contract changes), listed in the PR.

## You can rely on

- The tool registry (`input/tools/index.ts`) and the `Tool` contract (`input/tool.ts`), the panel registry and `booksFor` (`ui/panels/index.ts`), the overlay registry (`ui/lenses.ts`)
- The debug hooks (`window.__qoti.setLens`, `setHour`, `selectTool`) and the fixtures (`?debug&fixture=hamlet`, `=grown`)

## What is on screen (before)

- The bottom bar holds, in one strip: the Hearth and Ledger switch, ten labeled tools (Ledger: Cart lane, Street, Evening streets, Build, Walls, Earthworks, Move, Note, Plans, Erase; the Hearth has its own twelve), a divider, six or seven book icons with no labels, the View or Town toggle, undo and the camera. About twenty controls of four kinds in one row.
- The top bar is two rows: the valley, coins, the flag, the County, day, clock and speed, then eight stocks with meters and four zone bars.
- The left feed shows five cards and "and 4 more"; the minimap sits bottom right over the bar's end.

## Tasks

1. **Look and count.** Run the game at 1250, 1366 and 1440 px in both lenses, by day and by lamplight, in a fresh hamlet and a grown village (`?debug&fixture=grown`). Take before shots (`p3b-before-*`). List every control on screen by kind, how often a player needs it, and what competes with what.
2. **The bottom bar.** Design it down to one job: the tools in hand. Group tools that are one idea (the road tools as one Roads tool with its kinds on a small shelf; Walls and Earthworks as one; Note and Plans as one), so each lens shows about six or seven tools; move the books out of the tool row into one labeled Books control that opens a shelf (every book named, the unread ones marked); move View, undo and the camera to a small corner cluster away from the tools; keep the lens switch as the bar's anchor. Keyboard shortcuts stay and show in the tips. The bar must not grow taller, must not sit under the minimap, and must read by lamplight.
3. **The rest of the frame, with a lighter hand.** The top bar's second row shows what needs attention and lets the rest sit quiet, without hiding anything a player steers by. The feed: three lines at rest, the gaps first, the rest folded, as R2X ordered it. The minimap and the bar never overlap at any of the three widths. Cards still wait their turn and never cover one another.
4. **Draw two candidates before building one** (shots at 1250 px in both lenses), send them to the master with the pick and why, early. Then build the pick and play it: the first hour as a newcomer in each lens, a busy village evening, both seats at once. Read every label in place. Ask what a newcomer would not find.
5. **Keep what works working**: every command keeps a sender, every tool, lens entry, book and panel stays reachable (a test walks the registries and finds each one in the new layout), the e2e specs follow the new selectors, focus order and keyboard use still work.

## Acceptance criteria

- [ ] In each lens the bottom bar holds one row of named tools (about seven or fewer) beside the lens switch; books open from one named control; nothing on screen is an unlabeled icon without at least a tip, and the books are named.
- [ ] At 1250, 1366 and 1440 px, by day and lamplight, nothing overlaps and the frame covers less of the valley than before (the covered area before and after).
- [ ] Every tool, lens entry, book and panel is reachable in two clicks or one key (the registry walk test); every command has a sender; e2e, typecheck, lint, unit tests and build pass.
- [ ] Before and after shots of both lenses at the three widths, a fresh hamlet and the grown village, by day and by lamplight; `17-presentation.md` updated where the layout differs; a CHANGELOG line, the board row, As built.
- [ ] Definition of done in `docs/spec/22-quality.md`

## Out of scope

- Words in `ui/{copy,alerts,demandWords,hands}.ts` and new inspector lines (P3A's).
- The insides of the inspectors, the place card, Balances and the Charter board (R3D adds lines there later); R3D's Town Book and storybook join the books registry as one line each and show on the shelf with no change here.
- Any sim change (hashes stay the same) and any render path.

## Notes

- Tools merge in the layout, not in the registry: no tool id is renamed or removed (`ui/toolGroups.ts` is the layout's own registry).
- Known CI noise: the bench line "growth night R1B" swings around its 2 ms budget; `street.test.ts` "runs in well under 2 ms" failed once at 6.06 ms against 6.
- Ports for this checkout: client 5251, relay 8861.

## As built (P3B, 2026-11-18)

**Look and count** (task 1). Before, the bottom bar held 22 to 24 controls of four kinds in one strip (the lens switch, 10 to 12 tools, 6 or 7 unlabeled book icons, View, undo and the camera), the Ledger's second row of the top bar carried eight stocks with a meter and a count of days each, and the feed showed five cards. Shots `p3b-before-*`, measures `p3b-before-measures.md`.

**Candidates** (task 4). A: the books on paper of their own in the bottom left corner. B: the books at the bar's end after a hairline. Both: grouped tools and a view corner. Shots `p3b-candidate-*`. The pick, B, agreed by the master: the books belong to the lens and change with its switch, so they stay on the lens's bar in its accent, and the bottom edge is two pieces rather than three.

**The bottom bar** (task 2).
- Tools that are one idea share a button with a small caret: Ledger Roads (Cart lane, Street, Evening streets), Build, Land (Earthworks, Walls, Fields once there is a grain farm), Move, Plans (Plans, Note), Erase: 6. Hearth Footpath, Build, Decor (Pieces, Fences, Dress up), Nature (Flowers, Trees, Pond), Move, Plans (Plans, Note, Lay it out while a layout is chosen), Erase: 7. The group's button takes out the kind used last, so every tool is one click, or two the first time; its tip names the kinds. The kinds sit on a slim shelf over the bar, or lead the tool's own row when it has one (the Decor picker's head, the Earthworks and Walls variants, the Fields line), so the stack over the bar never grows by a row.
- `ui/toolGroups.ts` is the layout's own registry (one sorted line a group). Tool ids are unchanged; a tool no group names keeps its own button, and a group with one tool showing is just that tool.
- One Books button with a count of what waits; its shelf names every book of the lens with its key and marks "2 new" letters, "7 waiting" wishes and "3 hinted" Pattern Book pages (`ui/bookMarks.ts`, one line a mark; a new book in the panel registry shows on the shelf with no line here). The button names the book while it is open. A new `books` glyph.
- View, undo and the camera are a small cluster in the bottom right corner, the minimap above it; the bar is capped clear of both.

**The rest of the frame** (task 3).
- The Ledger's row draws a store with ten days or more in hand (and above its reserve) quiet: soft ink, no bar, no count of days, the room kept so the row never changes height. A material with no site short of it is quiet too. The Hearth's "no wishes waiting" sits quiet.
- The feed shows three lines at rest in R2X's order; "and N more" unfolds the rest in place. At the master's note it rests as its title and count when nothing in it is new (half a game day after a line first showed), opens again when a line arrives, and its plus peeks.
- At the master's note (the owner's shots): the ground's hover line ("Grass. Soil 91 (rich).") waits 1.6 s of rest; a building's still says itself after 0.45 s (`input/tools/inspect.ts`).
- The first-days guide points at the group's button or the Books button while the thing it names is folded away (`ui/guide.ts`).

**Measures** (`p3b-compare.md`; 768 px tall, day and lamplight the same). The frame covers 21.7 to 28.6% of the screen, down from 24.2 to 33.8% (the grown Ledger at 1250 px: 33.8% to 28.6%); the bar has 9 or 10 buttons, down from 22 to 24, the corner 2 to 4; nothing overlaps at 1250, 1366 or 1440 px. Shots `p3b-after-*` (both lenses, three widths, the hamlet and the grown village, day and lamplight) and `p3b-after-play-*` (the shelves, the pickers and the Books list by day and lamplight).

**Keeping what works** (task 5). A unit test walks the tool, overlay and book registries and finds each one on the bar, a group's shelf, the View list, the Books shelf, a key or a named opener (`toolbar.test.ts`, "everything stays in reach"); the e2e specs use `takeTool` and `openBook` (`e2e/helpers.ts`). Group buttons, kinds and book entries carry `aria-pressed`, `aria-expanded` or `aria-current`; Esc closes a shelf before it puts a tool away.

**Outside the owned paths** (small, listed in the PR): `ui/icons.tsx` (the books glyph), `ui/guide.ts` and its test (group and Books targets), `input/tools/inspect.ts` (the ground's dwell), `ui/village.css` (the minimap's place), `ui/hamlet.css` (the feed's fold line), the e2e specs and helpers.
