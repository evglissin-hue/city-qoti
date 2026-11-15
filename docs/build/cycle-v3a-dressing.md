# V3A: Dressing

**Iteration**: V3 Yards, streets and the long view. **Wave**: parallel. **Branch**: `cycle/v3a-dressing`, from `main` after V3.0 has merged (V3.0's tip is `cycle/v3-0-contracts`); PR into `cycle/v3x-integration`.
**Depends on**: V3.0. **Runs alongside**: V3B, V3C, V3D (and the R2 wave, which owns sim, content, bench and UI paths). **Recommended effort**: high. **Ports**: client 5231, relay 8841.

## Goal

A street of a grown Village tells you who lives and works there without a panel. Each home and business dresses its own plot from what the Mirror already knows: nets at the fishery, loaves on the baker's sill, dyed cloth on the weaver's frame, a half-made chair at the carpenter's, skeps by the hives; a woodpile under the eaves as big as the household's firewood, washing on a line once there is cloth, a pram after a birth, boots by the door, now and then a cat; a painted sign and goods out front at level 2, an awning and a bigger yard at level 3; sacks and barrels piling up at granaries and storehouses as they fill. Between the buildings the ground reads as walked on: worn paths from door to road, cobble aprons at shop doors, puddles a day after rain, leaves and petals gathering where snow drifts. Yard lamps join the night. All of it is instanced, static and inside 0.3 M triangles and 12 draws on Medium.

## Read

- `CLAUDE.md`, `docs/build/v3-wave-notes.md` (all of it: ownership, the carve-out table, handshakes, static-layer events, the Mirror audit, stand-ins)
- `docs/spec/17-presentation.md`: Visual direction, second pass, 4. Yards, doorsteps and goods you can see; Quality presets (the "Dressing [V3]" row)
- `docs/build/cycle-v3-0-contracts.md`: Tasks 1 to 3 (anchors, the rules as data, the layer's stub) and the headroom table
- `docs/spec/20-architecture.md`: V3 contracts

## You own

The V3A row of the wave notes' ownership table: `packages/content/src/dressingRules.ts` (the table; not `dressing.ts` beside it, the P1 ladder), `packages/art/src/dressing.ts` (the resolver), `apps/client/src/render/layers/dressing.ts` (`dressingLayer`, `dressingSubject`, `lotBox`, `DRESSING_BUDGET`, `DRESSING_SEED`), `apps/client/src/render/ground.ts` (the ground between; V3C keeps a carve-out there for the rim's mist), `packages/art/src/kits/props.ts`, and new `kits/yard.ts` and `kits/goods.ts` pieces (`goods.ts` already holds `GOOD_SHAPES`; append).

Outside these paths: only small, necessary edits (registry lines, exports, additive fields), listed in the PR. The yard lamps are written by the dressing layer itself; `layers/lights.ts` stays V3X's. No `packages/sim`.

## You can rely on

V3.0: `anchorsFor(kit, { size, entrance, params, lot })` and `ANCHOR_NAMES` (`door`, `yard`, `walls`, `sills`, `front`, `garden`, `eaves`); `DressingRule`, `DressingCount`, `DRESSING_STATS` (`births`, `cloth`, `fill`, `firewood`, `level`, `members`, `stock`, `workers`), `DRESSING_MAX_PER_RULE` (24); `resolveDressing`, `subjectKey`, `rulesFor`, `validateDressingRules` and `Placement`; `QualityPreset.dressing` and `env.dressing` (`'some'` on Low, rules marked `low`); the dressing layer's stub (static, shadowless, `frame()` returns true only when some placements change); `env.lightWriter` and the light map (V2A). V2: `InstanceField` and `KeyedBatch` as `layers/decor.ts` uses them, `patchKitShader`'s lamp option, `QualityPreset.decorDistance`.

## Tasks

1. **Subjects** (`dressingSubject`, built in V3.0): keep it reading shared state only, per the wave notes' audit table; extend it (and `DRESSING_STATS`, appended) if a rule needs a number the Mirror already carries. Stand-ins until R2X: firewood is the household's members, doubled in autumn and winter; cloth is the tier above settler (0 to 3); place is unset. No sim edit; the gaps stay on R2X's list.
2. **The table** (`dressingRules.ts`): grouped by who it dresses, ids append-only, seeds unique. By trade (check `content/trades.ts` for the real ids: `baker`, `weaver`, `carpenter`, `chandler`, `cider-maker`, `hives`, `dairy`, `sheep-run`, `shop`; the fishery is a building def, not a trade, so its nets use `who.def: ['fishery']`); by household (`kind: ['home']`, counts from `firewood`, `cloth`, `births`, `members`; boots and the cat by tier with a `chance`); by level (`minLevel` 2 and 3); by stock (`def: ['granary', 'storehouse']`, count from `fill`). Mark signs and stock piles `low: true`. Every rule passes `validateDressingRules` in CI and the test that bad rules fail stays. A rule names a registered kit (`kitById`), so a piece is a kit: wrap the existing prop helpers in `kits/props.ts` (`firewood`, `netFrame`, `dryingRack`, `flowerPot`, `wallLantern`; they draw into a `ShapeBuilder`, they are not kits) in small kits in `kits/yard.ts`, reuse decor kits where they fit (`barrels`, `crates`, `bench`, `planter`), and add new ones in `kits/yard.ts` and `kits/goods.ts` (loaf tray, cloth frame, half-made chair, skep, pram, boots, cat, washing line, sacks, painted sign, awning), each with a near and far level like every kit.
3. **The layer**: resolve a building's placements through `resolveDressing(subject, rulesFor(env.dressing, dressingRules), anchorsFor(...), DRESSING_SEED)`, cache them by `subjectKey` (and the lot and preset), and draw each piece family in one instanced draw (`InstanceField` or `KeyedBatch`, as `layers/decor.ts` does) within the decor distance. `frame()` returns true only when some building's placements differ. Shadowless; a piece taller than a tile that should cast goes in a second, casting layer, your call, said in the PR. The free yard comes from V3B's `lots.ts` (`yardOf`, once it exists) passed as `anchorsFor`'s `lot`; until then the building's whole lot (wave notes, Stand-ins).
4. **Anchor overrides**: where a derived anchor is wrong for a kit (a shop front under an awning line, sills under a bay), write the row into the wave notes' override table (kit, anchor, why, the place it wants) at once, so V3B can land it in the kit's `anchors()`; or take that kit's `anchors()` body as a carve-out with V3B's yes. A PR note alone is not enough.
5. **The ground between** (`ground.ts`): a worn path from each door to its road, cobble aprons at shop doors, puddles in the hollows for a day after rain, leaves and petals where snow drifts (the ground AO's enclosure term). In the ground shader and the ground's small textures (one texel a tile), built at rest on a static-layer event; no new pass. The ground's doorstep wear already exists (`ground.ts`, the doorstep fan): build on it.
6. **Yard lamps**: discs for a lamp in a yard, a sill lamp and a lit shop front's goods, written with `env.lightWriter.set('yards', discs)` (never real lights), following the lamplighter's hours; `drawLightMap` redraws once that frame with no shadow render.
7. **Gallery and notes**: a yards view beside the trades view (`?scene=trades`) so each piece shows per trade and level. Fill your rows in the wave notes' stand-ins table and add your As built lines to `20-architecture.md` (V3 contracts).

## Acceptance criteria

- [ ] Standing in a street of the grown village, each trade and level reads from the doorstep (`v3-shots.mjs v3a street`, day, golden hour and night, beside `v3-before-*`); the owner's and Kat's eyes at V3X's playtest evening.
- [ ] A household's woodpile is as big as its firewood: a unit test that the count follows the stat (and the stand-in's season doubling), and that the same input gives the same placements for both seats.
- [ ] Budget: dressing within 0.3 M triangles and 12 draws on Medium, within the decor distance (`__qoti.layerTriangles()` and the draw count at the village and street shots, in the PR); Low draws signs and stock piles only; moving frames add no full-screen pass and draws stay inside the V2X headroom table in `cycle-v3-0-contracts.md`; the idle frame stays within 4 ms GPU on Medium.
- [ ] Unit tests: every shipped rule passes `validateDressingRules`; bad rules fail; counts bounded; a granary's sacks grow with `fill`; Low keeps only `low` rules; an unchanged building returns the same placements and `frame()` stays false.
- [ ] The game looks unchanged outside the dressed plots and the ground between (`v3-shots.mjs`, every scene and hour); hashes unchanged; nothing in the sim changes.
- [ ] Typecheck, lint, unit, e2e, build and bench pass; definition of done in `docs/spec/22-quality.md`.

## Out of scope

Rows, gardens, corners, storeys and street furniture (V3B), the horizon and haze (V3C), the endpaper map (V3D), real firewood, cloth and place stats (R2X's list), any sim or bench change, one-off pieces for landmarks.

## Notes

- Cozy first: a yard is a few well chosen things, not clutter; warm, a little dry. The owner's complaint is that nothing but lanterns and pots makes a town look full, so vary by trade and level before adding more of the same.
- Keep every name append-only: rule ids, seeds, anchor names, the `yards` source.
- Run the build and review loop (`31-parallel-development.md`) with Sonnet executors; the lead tunes the look and checks the budget on Medium, not only High.
- Compare with `node apps/client/e2e/v3-shots.mjs v3a`, every scene and hour, and report `v3-perf.mjs` numbers per preset.
