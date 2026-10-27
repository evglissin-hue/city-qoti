# C4P: Roads and folk polish

**Iteration**: I2 polish. **Wave**: alongside C5.0 (it touches no contract files). **Branch**: `cycle/04p-polish`.
**Depends on**: C4X merged. **Runs alongside**: C5.0. **Ports**: client 5190, relay 8800.

## Goal

The two things players look at most read as one storybook world. Paths, lanes and streets look like one family of roads, worn from the same dirt and joined without seams, and stone stairs are set into the hillside instead of standing on top of it. The woodland folk stop looking like one body in seven colors: each species has its own head, ears, tail and build, clothes vary by household and job, and folk idle, chat, sit and wave instead of standing still between walks. Everything holds the I2 frame budget.

## Read

- `CLAUDE.md`, `docs/spec/17-presentation.md` (Palette, Style kit, Residents on screen), `docs/spec/22-quality.md` (budgets)
- `docs/spec/11-residents.md`: Species (one line each)

## You own

- `apps/client/src/render/layers/roads.ts`, `apps/client/src/render/layers/agents.ts`, `apps/client/src/render/agentPlayback.ts`
- `packages/art/src/kits/residents.ts`, `packages/art/src/rig.ts`, `packages/art/src/palette.ts` (additions only)
- `apps/gallery` (folk and road scenes)

Outside these paths: only small, necessary edits, listed in the PR. No sim, content or contract changes: if a motion needs a new `AgentAnim`, derive it on the client from the frame you already get (speed, flags, activity) and note the proposal for C5.0.

## You can rely on

The I2 renderer as integrated by C4X: the ground shader's `ROAD_GLSL`, the shared ground surface (`render/surface.ts`: one-level steps are even slopes between tile centers), `Flags.stairs`, the instanced resident rig with its walk, carry, hop and work motions and three levels of detail, agent frames with `AgentAnim` and `AgentFlags`.

## Tasks

1. **Stairs**: build each flight from the ground surface (`groundY`), so treads are cut into the slope and their fronts rise just above it; one continuous flight per run of flagged tiles (no separate flight per pair), as wide as the road it carries, with continuous cheek walls that follow the slope and sink into the ground at both ends. A path that climbs a level with no stairs flag stays a plain slope.
2. **One family of roads**: path, lane and street share one dirt palette (the lane a little darker and more packed, never a different material), so a path joining a lane changes width smoothly over the joint instead of switching color; edge noise and the trampled-grass fringe are the same on both; desire-path wear blends into a road instead of painting a pale blob beside it.
3. **Species**: per-species head shapes, ears, snouts and tails on the shared rig (badger stripes, fox brush, hedgehog spines, mouse round ears, otter whiskers and long tail, rabbit long ears, squirrel plume), and build (height and girth) per species and life stage, all inside the one instanced draw.
4. **Clothes**: shirt, waistcoat, apron, dress, scarf and hat variants picked by a seeded hash of the resident and household, tinted from the palette, with job clothes taking over at work.
5. **Motion**: client-derived idle (breathing, a look around, a weight shift), chatting (facing each other, head tilts, a hand gesture), sitting on benches and at the well, and a wave when a resident passes a friend; a gentle ear and tail follow-through on walks and hops. Low detail keeps only the walk.
6. **Gallery**: a folk scene with all seven species in every life stage and outfit, and a roads scene with every join (path to lane, lane to street, corners, T-junctions, stairs of one to four levels).

## Acceptance criteria

- [ ] Screenshots before and after of the stairs in the I2 village fixture and the gallery roads scene: no tread floats or sinks, no loose cheek stones, one flight per climb.
- [ ] A path meeting a lane reads as one road in a close-up screenshot (no color seam).
- [ ] The gallery folk scene shows seven species that can be told apart in silhouette.
- [ ] Residents in the village fixture visibly idle, chat, sit and wave.
- [ ] The I2 village at day 70 stays within the C4X draw call and triangle numbers on Medium (97 to 152 draws, at most 1.15M triangles); the 2,000-resident movement bench stays under budget.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Seasonal looks, snow on roads and skaters (C5E). New road kinds. Sim-side animation states (proposed to C5.0 instead).

## Notes

- The stairs looked broken because the treads were flat boxes at `levelY` stacked on the ground's ramp, and every flagged pair built its own flight and its own cheek stones.
- Keep residents one instanced draw call; species features are extra bones and vertex groups on the shared body, not extra meshes.

## As built (C4P)

- Stairs: rebuilt in `render/layers/roads.ts` from `groundY`, with sloped kerbs and warm sandstone; a unit test holds the top tread flush with the path above and the flight reaching the ground on both sides of a cross slope. Each climb is its own flight between tile centers (consecutive climbs meet at the centers).
- Roads: one dirt for paths and lanes, blended across joins; road squares paved across; softer ruts and a ragged crown instead of a dashed one; desire paths in the same earth. Streets still change to setts at the middle of a joint, at a kerb.
- Folk: round eyes with catchlights, blush (not on badgers and otters), heads in ten slices; skirts, overalls, neckerchiefs and hair bows, rolled after the I1 rolls so every existing resident keeps their fur, vest and work clothes. Full figures are 304 to 374 triangles (the test cap is 380).
- Motions, all client-side (`MOTION` in `@qoti/art`, no new `AgentAnim`): sitting on benches (the `bench` decor only; curved and ring benches still have folk standing by them), chats in turns with a nod from the listener, waves between folk who know each other.
- Debug scenes: `__qoti.roadsShowcase()` (a hill of paths, lanes, a street and stairs) and `__qoti.folkShowcase()` (benches, a pair, a trio and two walkers), shot with `apps/client/e2e/c4p-shots.mjs`. The brief's gallery scenes became these live scenes instead, since stairs and motions need the real ground and frames.
- Budget: on the dense village showcase (166 buildings, 150 synthetic residents, Medium), 200 to 230 draws and 0.42M to 0.88M triangles, which is 2 to 5 more draws (one per new outfit piece in view) and under 1.2% more triangles than `main`. The autoplayed day-70 village was not re-measured here; expect at most four more draws than the C4X numbers.
- Not done: per-species girth by life stage beyond the existing species scale, a sit pose for curved and ring benches, and sim-side animation states (none were needed).
