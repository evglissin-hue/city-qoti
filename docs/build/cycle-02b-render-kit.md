# C2B: Render and art kit

**Iteration**: I0. **Wave**: parallel. **Branch**: `cycle/02b-render-kit`.
**Depends on**: C1 merged. **Runs alongside**: C2A, C2C, C2D.

## Goal

The storybook miniature look (P44 to P47): soft-lit terrain and water, roads that join nicely, charming procedural buildings, props and trees, day and night with glowing windows and lanterns, tilt-shift, and quality presets that hold 60 fps on the weaker laptop.

## Read

- `CLAUDE.md`
- `docs/spec/17-presentation.md` (all except Audio)
- `docs/spec/20-architecture.md`: Rendering, I0 contracts (`RenderApi`), Content pipeline (I0 content)
- `docs/spec/10-world-and-building.md`: Units, Map layers, Roads (bridges), Decor, Trees
- `docs/spec/22-quality.md`: Performance budgets

## You own

`packages/art`, `apps/gallery`, `apps/client/src/render`.

## You can rely on

C1's `RenderApi`, Mirror (layers, entities, signals), layer registry, placeholder renderer, I0 content ids.

## Tasks

1. **Palette and kit material**: palette tokens from the spec; the shared kit material with season tint, snow and wind-sway hooks (season and snow can be stubbed to Spring); an emissive variant.
2. **Terrain**: chunk meshes with smooth slopes between levels and soft cliff faces at 2+; blended terrain colors; sand banks; mountain border; rebuild a dirty chunk within 2 frames, at most 2 per frame.
3. **Water**: stylized river surface with gentle waves and bank foam.
4. **Roads**: path and lane looks with joins and corners from neighbors; plank bridges.
5. **Buildings**: modular part library (walls, roofs, windows, shutters, boxes, doors, chimneys with smoke) and generators for cottage, house, well, shed, windmill (turning sails) and town hall; foundations; custom fields read from `BuildingView.custom` with sensible defaults; `BatchedMesh` for buildings.
6. **Props**: every I0 decor def (bench, lantern, flower bed, planter, fence, low wall, hedge, signpost, barrels, crates, apple tree, cherry tree); `InstancedMesh` per def.
7. **Trees**: oak, birch, pine with 4 growth stages and a low-detail version; instanced.
8. **Lighting and time of day**: the phase table; window glow on a seeded share of windows at night; lanterns emissive with bloom and a soft ground glow decal.
9. **Post**: tone mapping, bloom, tilt-shift, vignette; MSAA where available.
10. **Quality presets**: Low, Medium, High per the table, auto-detect, `setQuality`.
11. **Picking, ghosts, presence**: accurate heightfield picking; ghosts using real kit meshes tinted valid or invalid; the partner's lantern marker with name label anchor; ping ripple.
12. **Gallery**: every generator with parameter sliders, a day and night slider, a turntable; Playwright screenshots of each at fixed seeds uploaded as CI artifacts.
13. **Load test scene**: a debug route that fills the valley with 300 buildings and 3,000 decor in view.

## Acceptance criteria

- [ ] Gallery screenshots (day and night) of every generator in the PR.
- [ ] Load scene on Medium: 300 or fewer draw calls and 1.5 M or fewer triangles (assert via `renderer.info` in a Playwright test); measured fps and frame time on the dev machine reported in the PR.
- [ ] Chunk rebuild under 4 ms (measured).
- [ ] Picking hits the correct tile on slopes and cliffs (unit test on the ray march).
- [ ] `RenderApi` changed only additively.
- [ ] Definition of done.

## Out of scope

Seasons and weather visuals beyond hooks (I3), residents (I1), overlays (I1), UI (C2D), simulation rules (C2A).

## Notes

- Charm comes from small details and good light, not polygons. Lean on vertex colors and baked vertex AO; avoid textures except tiny shared ones.
- Keep generators deterministic from parameters and seed so both laptops show the same town.
- The human will judge the look from screenshots; include a few wide and close shots of a sample village.
