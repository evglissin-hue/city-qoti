# V5A: The Steam kit on buildings

**Iteration**: V5 Age of Steam, inside I4 wave one (`31-parallel-development.md`: V5 runs inside I4's contracts cycle and wave). **Wave**: parallel. **Branch**: `cycle/v5a-steam-buildings`, from `cycle/i4x-integration`; PR into `cycle/i4x-integration`. **Recommended effort**: xhigh, on Opus.
**Depends on**: I4.0. **Runs alongside**: I4A to I4H, V5B. **Ports**: client 5279, relay 8889.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

A Town in the Age of Steam reads as a picture-book canal town of the 1800s (`18-eras.md`): brick and stucco, slate and mansards, sash windows in a regular grid, cast iron railings and balconies, chimney stacks, terraces of two to four floors, standing beside the Old Age core it grew from. On the V1 material an era is a parameter set, not a rewrite (`i4-visual-planning-notes.md`): the same kits draw both eras, two levels each, and a restyle rebuilds a building through its kit key. The era's new buildings (the steam mill with its stack, the Glassworks, the Printing Press, the clinic, the library, the theater, the post office, the inn, and the Lighthouse if I4E builds it) each get a silhouette of their own. The B concept's Steam stills are the target; every budget holds.

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (File ownership V5A; Panels and the views they read: what V5A reads)
- `docs/build/i4-visual-planning-notes.md` (the V3 part: era beside style, new surfaces, new kits, what the sim gives)
- `docs/spec/18-eras.md` (The three eras, Rules, Data); `docs/spec/17-presentation.md`: Visual direction (both passes), Palette, Style kit (eras), the budgets' references
- `docs/spec/20-architecture.md`: Rendering, Lean renderer, V1 contracts, V3 contracts (rows, floors by tier), I4 contracts; `docs/spec/22-quality.md`: the budgets by preset, the redesign's budgets
- The B concept's Steam stills (`docs/build/screenshots/v0-b-steam-*.jpg`, `v0-lean-b-steam-*.jpg`); V1B's and R3H's briefs for how kits carry levels and detail

## You own

The V5A paths in the wave notes: in `packages/art/src`, `kits/{parts,roofs,details,style,district,grown,rows,buildings,business,workplaces,workshops,services,specialized,village,modules}.ts`, the new surfaces' generators in `patterns.ts` and values in `surface.ts`, `materials.ts` values, palette additions by append (shared with V5B); in the client, `render/layers/buildings.ts` and `render/kitGeometry.ts`; the gallery's Steam section (`apps/gallery`); tests beside the files; shots `docs/build/screenshots/v5a-*`.

## You can rely on

- I4.0: `KitBuildOptions.era` (read and ignored until you), `BuildingView.era`, `style` and `district`, `StyleDef.era`, the surfaces appended flat (`ironwork`, `stucco`, `setts`), the new buildings' defs with stand-in kits, `?debug&era=steam` (draws every building as Steam on the client, for before and after on one build), `v5-shots.mjs` and `v5-perf.mjs` with the Steam scene and the `v5-before-*` set.
- V1's kit material, surfaces and pattern array, V1B's detail kit and two levels from one path (`ShapeBuilder`'s `detail`, `nearOnly`, `essential`, `proxy`), joined facades and party walls; V3B's rows, corners and floors by tier from R2F's lot fields; palette 2.0's Steam swatches (`stuccos`, `bricks`, `slates`, `zinc`, `copper`, `flatRoof`, `chimney`, `shopfronts`, `awnings`); R1E's and R3H's trade and level looks; C4E's district styles in `kits/district.ts`; V4's rest-frame refinement (a restyle is a `content` change that folds in, never a restart).

## Tasks

1. **The era as a parameter set** on the shared parts (walls, roofs, windows, doors, chimneys, details): taller floors, sash windows in a regular grid, a mansard or a shallow slate pitch, stone or stucco dressings, cast iron railings and balconies, chimney stacks, the Steam swatches and surfaces. An Old Age cottage and a Steam townhouse share parts; the era chooses proportions. Revivals (an older era's style chosen on purpose) draw the older era.
2. **The new surfaces** (generators in `patterns.ts`, values in `surface.ts`): `ironwork` (dark painted metal with a fine highlight), `stucco` (smoother than plaster, with ashlar lines), `setts` (granite setts between cobble and flags, if a street style wants them). `canal` stays reserved for wave two.
3. **The Steam district styles** with I4C (names and swatches are open; propose two together and the master rules), keyed by era in `kits/district.ts` and `kits/style.ts`.
4. **The era's buildings**: the steam mill with its stack (proposed, R3X draft: the stack's top is the anchor V5B's plume rises from, exposed in the kit's anchors), the Glassworks with its cone or furnace, the Printing Press, the clinic, the library, the theater, the post office, the inn (with a sign), the Lighthouse if I4E builds it; each with near and far levels and its trade or level look where R1E and R3H give one.
5. **Restyle and selection** (`render/layers/buildings.ts`, `render/kitGeometry.ts`): kit selection by era and style from `BuildingView`; the kit key includes the era, so a finished restyle rebuilds that building alone (a `content` still change, shadow pass only if a caster changed); rows join across eras where V3B's rules allow (proposed, R3X draft: a Steam terrace beside an Old Age cottage steps its roofline, never floats).
6. **The gallery**: a Steam section with each era's parts side by side, the new buildings, a terrace of 20 at both levels.
7. **Shots and numbers**: `v5-shots.mjs v5a` on the grown village and the town showcase drawn as Steam (`?debug&era=steam`) and on I4H's Town fixture once it lands, by day, golden hour and night, default camera and street zoom, beside `v5-before-*` and the B concept's Steam stills; `v5-perf.mjs` moving and idle on every preset against the before.

## Acceptance criteria

- [ ] `grep -rn "I4 stand-in (V5A)" packages apps tools --exclude-dir=dist` is empty.
- [ ] A Steam street reads as the B concept's from the default camera and close up, and an Old Age core inside Steam rings reads as one town grown over time (shots; the owner's and Kat's eyes at the playtest evening).
- [ ] Every budget in `22-quality.md` holds on Medium, moving and idle: draws and triangles from `v5-perf.mjs`; a terrace of 20 far homes about 2,000 triangles as V1B's budget says; GPU columns from both laptops' Measure this laptop runs, or the owner's word defers one.
- [ ] Nothing reads the sim; nothing in the sim changes; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests, build and e2e pass.

## Out of scope

Lamps, smoke plumes, street furniture, the era moment's grade and fireworks, clothing and the era's Hearth pieces (V5B); canals, locks, barges and the rim (wave two's V5C); the horse tram (I5).

## Notes

- Open (`i4-visual-planning-notes.md`): whether a restyle ever changes a footprint (proposed, R3X draft, with I4C: never; a mansard adds no tiles); how a Steam terrace meets an Old Age neighbor in one row.
- The cozy ceiling: four floors at most outside landmarks (`18-eras.md`).
- A kit change must never pop the still frame: go through `ctx.invalidate()`, and keep a restyle to one building's rebuild.
- Never merge another wave cycle's branch into yours; merge `cycle/i4x-integration` when you need what has landed.
- Runs as the build and review loop (`31-parallel-development.md`): one or two rounds of quality check and player's chair (shots in every scene and hour, not only yours) before the PR.
