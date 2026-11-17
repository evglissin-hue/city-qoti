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
