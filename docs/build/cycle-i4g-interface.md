# I4G: The Town's interface

**Iteration**: I4 Town, wave one. **Wave**: parallel. **Branch**: `cycle/i4g-interface`, from `cycle/i4x-integration`; PR into `cycle/i4x-integration`. **Recommended effort**: xhigh.
**Depends on**: I4.0. **Runs alongside**: I4A to I4F, I4H, V5A, V5B. **Ports**: client 5277, relay 8887.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

Everything wave one adds can be seen, read and used from the screen, in both lenses, as R3D was R3's interface. The Charter board shows the Town's goals and its trial; the era moment comes as a title card on both screens; the Ledger draws districts and sets their policies and the Hearth styles and restyles them; a contract is offered, accepted and followed on a card; Port Amberly's flavors and contract loads show in Balances; the new buildings explain themselves in their inspectors; guests show on the place card and in the evening edition; smoke has an overlay; the picker offers the era's pieces when the era arrives and keeps the older ones. Every new command has a sender and an undo.

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (Panels and the views they read; the era moment's proposed timing; File ownership I4G)
- `docs/spec/17-presentation.md`: The redesign's interface (books, cards that wait their turn, the feed, the highlight's outline), UI; R2D's and R3D's As built (`docs/build/cycle-r2d-interface.md`, `cycle-r3d-follow-the-thread.md`)
- `docs/spec/18-eras.md`: The era moment, Rules (older pieces stay buildable); `docs/spec/15-progression.md`: Ranks and Charters, the rank-up moment
- `docs/spec/13-ledger.md`: Districts, Levers, Reports; `docs/spec/12-hearth.md`: District styles; `docs/spec/16-coop.md` (guardrails, undo, lenses)
- `docs/spec/20-architecture.md`: I4 contracts

## You own

The I4G paths in the wave notes: `apps/client/src/input/tools/district.ts` (one registry line), `ui/panels/Districts.tsx` (a line on P3B's Books shelf), `ui/panels/EraMoment.tsx`, the contracts card (a line in `ui/cards.ts` and its panel), the I4 lines in `ui/panels/{Charter,Trial,RankUp,Chronicle,Balances,BuildingInspector,ResidentInspector,PlaceCard,Edition,SeasonPlan}.tsx` and `ui/GoalPill.tsx`, `ui/Picker.tsx` (by era), the smoke overlay (`ui/lenses.ts` one line, its ramp in `render/layers/overlays.ts`), `state/mirror.ts`, `state/undo.ts`, `worker/messages.ts` (additive); e2e `apps/client/e2e/i4g-*.spec.ts`; shots `docs/build/screenshots/i4g-*`.

## You can rely on

- I4.0: `EraView` and `era.changed`, the Town's `CharterView` lines and the raid trial's view, `DistrictView` and `districts.updated` with the district commands (validate and store; owed to you), `ContractView` and `contracts.updated` with `contract.accept` and `contract.decline` (owed to you), `TourismView` and `tourism.updated`, `PlaceView.guests`, `DrawParts.show`, `BuildingView.era`, `style`, `district` and `smoke`, `WeatherView.wind`, `season.setPlan`'s district field, the content `eras` on every def. Real data as I4A to I4F land; until then mocks, as R2D's `ui/mocks/evening.ts` did.
- R1C's books and cards, R2D's Mirror, place card, evening edition and highlight API, R3D's inspectors and Town Book, P3B's bottom bar and Books shelf, C4F's zone tool (the district brush's model), C5F's trial and raid cards, C4D's rank-up moment, R3G's storybook (chapters).

## Tasks

Where a task says how a thing looks, reads or is dismissed and names no spec section, it is proposed (R3X draft).

1. **The Town Charter and its trial**: the Charter board's Town goals with their lane icons and progress (the master and pages from R3 among them), the claim, the trial card for a raid (the day, the side and band as the telegraph reveals them, what helps: walls, towers, lanterns, the Watch), the result and what it sealed. The goal pill leads to the next step.
2. **The era moment** (`18-eras.md`; proposed timing, R3X draft): when `era.changed` arrives, a title card across both screens ("The Age of Steam"), dismissed by each seat for itself; the Chronicle's chapter title page; the Charter board's list of what the era opens in both lanes. V5B's fireworks, grade and brass band follow at that dusk; check the two meet in place.
3. **Districts**: the Ledger's district brush (paint, rename, remove; a ghost of the district's edge as C4F's zones), a Districts book in both lenses listing each district with its policy (the Ledger's control), its style and era (the Hearth's control), and a restyle under way (how far, what it waits on). Policies and styles say what they do in one line each. Undo for every district command; the partner's guardrail as for removing their work (`16-coop.md`).
4. **Contracts and Port Amberly**: an offer as a card that waits its turn (neighbor, good, amount, price, deadline, the fee if short, whether the town holds it now), accepted or declined from it with undo while it waits; an accepted contract's progress; the result in the feed. Port Amberly in Balances' neighbors (its flavors, its terms, the boat's days) and contract loads in the carried columns.
5. **The new buildings and folk**: the steam works' coal and smoke and the trade they make room for; the Glassworks and Printing Press; the inn (rooms, tonight's guests), the theater and bandstand (the next show night), the library, the post office (as I4E builds it), the clinic's reach; a home's Next tier line for Merchants; a building's era and style; the place card's guests and show; the evening edition's guests line. Each line short, warm and dry.
6. **The picker by era** (`18-eras.md`, Rules): older pieces stay; later pieces appear when their era arrives; a piece of the era carries a small mark.
7. **The smoke overlay**: on the Ledger's overlays, smoke by tile from the views (the wind's arrow shown), one line in `ui/lenses.ts`.
8. **Senders and checks**: take every I4 command off `OWED_SENDERS` and `OWED_FIELDS`; no two feed lines read the same; cards never cover one another; the storybook prints the Town's chapter (R3G's chapter runs to the next sealed Charter: check it).
9. **e2e and shots**: the Town claimed and its trial card; the title card on both seats; a district drawn, a policy set, a style set and a restyle under way, each undone; a contract accepted and kept; guests on a summer evening; the smoke overlay; both lenses, by day and lamplight, at 1250 px.

## Acceptance criteria

- [ ] `OWED_SENDERS` and `OWED_FIELDS` hold no I4 entry; each command has undo; words are warm, dry, US spelling, no em dashes.
- [ ] The e2e specs above pass with two browsers; the title card shows on both screens once; the shots are in the PR.
- [ ] Panels read the Mirror, never the sim; typecheck, lint, unit tests, build and e2e pass.

## Out of scope

The rules behind every line (I4A to I4F); every look and the era's grade, fireworks and music (V5A, V5B); advisors (I4H).

## Notes

- Open: whether the Districts book is a book on the shelf or a lens toolbar entry (P3B keeps the bottom bar to six or seven named tools); proposed (R3X draft): a book, with the brush in the Ledger's zone tool group.
- Open: who may set a district's style when both seats are present (P22: the Hearth assigns or edits it); proposed (R3X draft): either seat, with the Hearth lens's control, as the composing tools are.
- From R2D and R3D: keep lines inside the inspector's width at 1250 px; selections draw an inked outline, never a filled block.
- Say in the PR what the interface cost and what you cut, so I4X knows.
- Runs as the build and review loop (`31-parallel-development.md`): one or two rounds of quality check, dead-end hunt and player's chair (read every new line in place, in both lenses) before the PR.
