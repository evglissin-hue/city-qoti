# I4C: Districts, policies and styles

**Iteration**: I4 Town, wave one. **Wave**: parallel. **Branch**: `cycle/i4c-districts`, from `cycle/i4x-integration`; PR into `cycle/i4x-integration`. **Recommended effort**: xhigh, on Opus (it crosses zoning, growth, construction, traffic and the patterns).
**Depends on**: I4.0. **Runs alongside**: I4A, I4B, I4D to I4H, V5A, V5B. **Ports**: client 5273, relay 8883.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

From Town rank the Ledger draws districts and gives each a policy in place of new chains, and the Hearth gives each a style (P22). A market quarter favors shops and evening streets, a mill quarter lets its workshops work late and its carts go first, a garden quarter grows no workshops, an old town keeps its era. Grown buildings in a district take its style; a district restyled to the Age of Steam is rebuilt by the builders over time, a building at a time, for paint and materials, and a revival of an older look costs the same. A cluster of older buildings kept around a gathering place is an Old Town, a pattern of its own, and redeveloping one of its buildings always breaks it. With no style chosen, a district leans toward the town's calling, as R3C left for this cycle.

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (Rulings; File ownership I4C; Handshakes; the order of a day)
- `docs/spec/13-ledger.md`: Districts, Levers, The season plan (where to build first), Zoning and growth (as the archive keeps it); `docs/spec/19-evenings.md`: Evening streets
- `docs/spec/12-hearth.md`: District styles; `docs/spec/18-eras.md`: Rules (eras layer; restyling; revivals), Old Town
- `docs/spec/15-progression.md`: Callings (style weights; the R3C As built); `docs/spec/10-world-and-building.md`: Customization (district styles), Moving
- `docs/spec/20-architecture.md`: I4 contracts

## You own

The I4C paths in the wave notes: a new `packages/sim/src/systems/districts/**`, `systems/zoning/**`, `systems/growth/**`, `systems/construction/**`, `systems/traffic/**`, `systems/hearth/patterns/detectors/oldTown.ts` and its registry line, `view/districts.ts`, the late shift's one line in `residents/overrides.ts`; content `districts.ts`, `styles.ts`, the `styleWeights` reading of `callings.ts`, Old Town's pattern def and its two unlock pieces; tests `packages/sim/test/i4c/**`.

## You can rely on

- I4.0: the `district` map layer, `DistrictState` rows, `district.paint`, `setPolicy`, `setStyle` (with `restyle`), `rename` and `remove` (validate and store), `DistrictPolicyDef`, `StyleDef.era`, `Building.era` and `restyled`, `valleyEra`, `districtAt` (real), the policies' API stubbed and wired (growth's trade choice and desirability, zoning's style pick, traffic, the late shift's override written and left unregistered), `season.setPlan`'s district field, `DistrictView`, `districts.updated`, the `districts` system (25).
- C4B's lots, styles and growth by desirability and demand; R1B's trades and how they are chosen; R2's evening streets (`road.setEvening`) and footfall; R2F's rows, corners and floors by tier; R1's construction sites and builders; C5C's modules; R3C's callings with `styleWeights` (kept in content, unread until now); R1D's Move.

## Tasks

1. **Drawing districts**: painted tiles (the Ledger's brush, sent by I4G), named from what stands there (as places are named) and renamed by either seat; a tile in one district at most; up to the number I4.0 fixed (proposed, R3X draft: 15). A district exists from Town rank (the Charter's unlock).
2. **Policies as data** (`districts.ts`), one a district, each read where it applies:
   - **market quarter**: Shops lots desirability up (`policyDesirability`), and its streets offered as evening streets (proposed, R3X draft: the Ledger still decides each with `road.setEvening`);
   - **mill quarter**: workshops work late (`shiftEnd`, through the late shift's override, which returns at once for anyone not working there) and carts go first on its roads (`cartsFirst` in traffic); `18-eras.md`'s factory rows;
   - **garden quarter**: no workshop trade grows there (`policyAllows`);
   - **old town**: proposed (R3X draft), growth never redevelops or restyles a building there.
   A policy that changes nothing where it is set is the audit's case (I4H): say in the PR how each shows its effect.
3. **Styles** (`12-hearth.md`): a district's style sets the defaults its grown buildings take (`styleFor` in zoning, reading `StyleDef`); a district with no style leans by the town's calling (`CallingDef.styleWeights`, as P1 built for lots with no neighbors), else C4B's pick. Styles are keyed by era: the four Old Age starters and the Steam styles I4.0 adds (names open, below).
4. **Restyling** (`district.setStyle` with `restyle`): proposed (R3X draft) for `12-hearth.md`'s "paint and materials, applied by builders over time": the 06:10 pass hands the builders restyle jobs, a building a day per district (*tune*), each costing paint (coins) and the style's materials (brick, stone or glass by era), carried as a site's are; when done the building takes the style and the style's era (`Building.era`; a revival sets an older one) and `restyled`. Grown and hand-placed buildings alike; landmarks and the Town Hall keep theirs (proposed, R3X draft). Restyling never changes a footprint (`i4-visual-planning-notes.md`'s question; proposed, R3X draft: a mansard adds no tiles).
5. **Old Town** (`18-eras.md`; its rule is I4's to write, proposed here from the spec's line): six or more buildings of an era earlier than the valley's, close together, none restyled, around a gathering place (a square, a well, a fountain); site bonus charm +6 within its radius, more guests for I4E (through the site's existence, read by `guestsTonight`'s count; coordinate the field in your PR); unlocks the heritage plaque and the old town lantern (stand-in looks until V5B). A redevelopment or restyle of a member breaks the site. Before the era turns no Old Town can exist.
6. **The season plan's district**: "where to build first" may name a district, whose sites the builders take first.
7. **Tests**: a district painted, renamed, removed; each policy changes what it says and nothing else (shops' desirability, a late shift with more output and those workers out of the evening, carts first, no workshop in a garden quarter, no redevelopment in an old town); grown buildings take the district's style, else the calling's lean; a restyle to Steam rebuilds one building a day for its paint and materials and turns its era; Old Town found and broken; a seat joining mid-restyle reads the same; a year hashes the same twice; bench lines for the restyle pass and the policies' readers in growth's night, by one line each in I4H's scene list.

## Acceptance criteria

- [ ] `grep -rn "I4 stand-in (I4C)" packages apps tools --exclude-dir=dist` is empty.
- [ ] Each policy and a restyle visibly change a headless Town as specified; Old Town is found after the era turns and broken by a redevelopment.
- [ ] Growth's night stays inside its 2 ms budget at City scale with districts and policies; the late shift's override costs the planning line nothing measurable for residents outside a mill quarter; the lanes test passes on both profiles (a mill quarter's late shift takes folk out of the evening: measure it).
- [ ] A year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

The district tool, the Districts book and policy and style pickers on screen (I4G); drawing styles and eras (V5A) and lamps and street furniture by district (V5B); the advisors (I4H); parcels (wave two).

## Notes

- Open: the Steam era's district styles (names, swatches, materials); `12-hearth.md` lists only the four Old Age starters. Propose two with V5A, who draws them, and the master rules.
- Open: whether a whole row can be restyled as one or house by house (`i4-visual-planning-notes.md`); proposed above: building by building, a district at a time.
- Open: what "carts first" means in traffic (cart passes ahead of walkers at a tile's capacity, or the porters' job order); propose and measure.
- Open: whether district policies follow the calling (`15-progression.md`, Later: "district policies by calling"); proposed (R3X draft): no, the calling only leans the style.
- The late shift is a schedule override: every override is called for every resident on every schedule decision (R3.0, R3A). Return at once for anyone not on a mill quarter's workshop crew.
- `Building.era` changes only by restyling (`18-eras.md`); never set it anywhere else.
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
