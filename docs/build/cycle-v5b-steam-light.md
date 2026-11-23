# V5B: The era's light, smoke, pieces and moment

**Iteration**: V5 Age of Steam, inside I4 wave one. **Wave**: parallel. **Branch**: `cycle/v5b-steam-light`, from `cycle/i4x-integration`; PR into `cycle/i4x-integration`. **Recommended effort**: xhigh, on Opus.
**Depends on**: I4.0. **Runs alongside**: I4A to I4H, V5A. **Ports**: client 5280, relay 8890.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

The Age of Steam arrives on screen as a moment and stays as a mood (`18-eras.md`, The era moment). On the evening after the trial is weathered, fireworks go up at dusk, the evening's grade warms, and a brass band joins the music. Over the next season clothing follows, a few households a day: waistcoats, bonnets and boaters. Lamps of the era burn gas, so the town's light changes color district by district as districts are restyled. Works smoke from their stacks, thicker by output and drifting with the day's wind. The era's Hearth pieces (cast iron benches and railings, the gas lamp post, the bandstand) and the eight new pages' unlock pieces get their looks. None of it pops the still frame or costs a moving frame more than the budgets allow.

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (File ownership V5B; the era moment's proposed timing; what V5B reads)
- `docs/build/i4-visual-planning-notes.md` (the V3 part: gas lamps, smoke, the era moment)
- `docs/spec/18-eras.md` (Age of Steam, The era moment); `docs/spec/17-presentation.md`: Visual direction, night and the light map (V2A), Residents on screen, Audio
- `docs/spec/20-architecture.md`: V2 contracts (the light map), R3 contracts (R3F's lamplight, as built), V4 contracts (still changes), I4 contracts; `docs/spec/22-quality.md`: the budgets (Night with the light map, Rest-frame refinement)
- R3F's and C5G's briefs (`docs/build/cycle-r3f-lamplight.md`, `cycle-05g-audio.md`) for the lights layer and the synthesized band

## You own

The V5B paths in the wave notes: in the client, `render/lightMap.ts`, `render/lighting.ts`, `render/layers/{lights,effects,street,festivalFx,agents,decor}.ts`, `render/look.ts`; and, as a carve-out like V4C's file under `input/`, `apps/client/src/audio/**` for the brass band. In `packages/art/src/kits`: `residents.ts`, `decor.ts`, `fineDecor.ts`, `garden.ts`, `festival.ts`, `props.ts`, `lamplight.ts`; palette additions by append (shared with V5A). Tests beside the files; shots `docs/build/screenshots/v5b-*`.

## You can rely on

- I4.0: `EraView` and `era.changed`, `DistrictView` (each district's style and era), `BuildingView.smoke` and the stack anchor V5A exposes, `WeatherView.wind`, the household's era look on the agent row (`eraLookOf`), the new pieces' defs with stand-in kits (the bandstand from I4E, the unlock pieces from I4F and I4C), `?debug&era=steam`, `v5-shots.mjs` and `v5-perf.mjs`.
- V2A's light map and lamp colors by era (`?debug&era`), R3F's lamps by reach tick, candle windows and resting pieces, V3B's street furniture by district (`render/layers/street.ts`), C5E's rank-up fireworks, V2C's ribbon smoke, V4's still changes (a lamp is `lamps`, folding in; never a restart), C5G's synthesized band.

## Tasks

1. **Gas light by district**: a lamp's light follows the era of its district's style, else the valley's era (proposed, R3X draft; the wave notes' call), through V2A's lamp colors by era; a restyle finishing changes the light of that district's lamps once, batched, one light map redraw. R3F's walk keeps working: lamps still light at their reach tick. Proposed (R3X draft): every lamp still burns candles in I4; only its light and look change (the Gas Lamps innovation is I5's).
2. **Smoke plumes** (`render/layers/effects.ts`): from each works' stack anchor, thickness by `BuildingView.smoke`, leaning and drifting with `WeatherView.wind`, so the plume shows what the sim's smoke does to the land; a moving layer; on Low a static plume card, no particles (`i4-visual-planning-notes.md`'s question; proposed, R3X draft).
3. **The era moment** (proposed timing, R3X draft): on the first dusk after `era.changed`, C5E's fireworks and a warmer grade for that evening in `look.ts` (no new pass); I4G's title card shows at the morning's change, so check the two meet. The brass band joins C5G's band from the era's turn (`18-eras.md`: acoustic for the Old Age, a brass band joining in the Age of Steam), synthesized as the rest of the score is.
4. **Clothing follows**: waistcoats, bonnets and boaters on residents whose household's era look has turned (`eraLookOf`, a few households a day over the season), inside the residents kit's budget (instanced, no new draw per resident).
5. **The era's pieces**: the gas lamp post, cast iron benches and railings, the bandstand (I4E's piece), Old Town's heritage plaque and lantern (I4C), the eight pages' unlock pieces (I4F), each with near and far levels; street furniture by district style and era (V3B's lamps, benches and bollards take the district's era).
6. **Shots and numbers**: the fireworks evening, a street at 18:30 half restyled (gas light on one side, candle light on the other), a mill quarter with plumes by day and at golden hour on two winds, clothing on a street a week after the era, each new piece by day and lamplight; `v5-perf.mjs` moving and idle on every preset against the before, with the plumes on; R3F's walk with V4A's refinement and the gas color (no pop).

## Acceptance criteria

- [ ] `grep -rn "I4 stand-in (V5B)" packages apps tools --exclude-dir=dist` is empty.
- [ ] The era moment, the gas light by district, the plumes by output and wind, clothing following over the season and each new piece read at a glance (shots; the owner's and Kat's eyes at the playtest evening).
- [ ] The light map's redraw holds its 2 ms, once a change; moving frames on Medium hold the 12 ms GPU and 300 draw budgets with plumes on; idle frames return to budget; the still frame never pops (`v5-perf.mjs`, both laptops' runs or the owner's word).
- [ ] Nothing reads the sim; nothing in the sim changes; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests, build and e2e pass.

## Out of scope

Buildings and their era parameters (V5A), the title card and every panel (I4G), smoke's rules (I4B), canals, barges and the rim (wave two), electric light (V6).

## Notes

- Open: how a lamp outside any district changes color after the era turns (proposed above: the valley's era), and whether the gas lamp post draws gas light in a district still styled Old Age.
- Open: how loud and how often the brass band plays (C5G's director decides the mix by hour and season; propose with the owner's ears).
- From R3F: lamps that change in one tick batch into one light map redraw; every static change goes through `ctx.invalidate()`.
- Never merge another wave cycle's branch into yours; merge `cycle/i4x-integration` when you need what has landed.
- Runs as the build and review loop (`31-parallel-development.md`): one or two rounds of quality check and player's chair (look at every scene and hour, not only yours) before the PR.
