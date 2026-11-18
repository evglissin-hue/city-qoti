# R3F: Lamplight and resting pieces

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3f-lamplight`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: xhigh, on Opus (the R1E and R2D precedent: R3's look).
**Depends on**: R3.0. **Runs alongside**: R3A to R3E, R3G, and V4's wave (V4A's rest-frame refinement above all). **Ports**: client 5246, relay 8856.

## Goal

The world carries what the supplies do (`17-presentation.md`, The world carries what it can). At dusk the lamplighter walks his round with his pole and a light, and each lantern comes on as he reaches it, so a lit street is something the players watch happen; a lantern the town has no candle for stays dark. A home with a candle lights every window until bedtime, so a well supplied street is visibly brighter and a short one dims home by home, and no home ever goes dark. A resting piece looks at rest: a cold fire, a bare table, faded cloth, a dry fountain, an unlit lamp. None of it pops the still frame, and none of it costs a moving frame more than it did.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (the rulings: R3's look; File ownership, R3F; Panels and the views they read: what R3F reads)
- `docs/spec/17-presentation.md`: Visual direction, The world carries what it can, Residents on screen ([R3]: the lamplighter), night and the lamplit rooms (V2A)
- `docs/spec/19-evenings.md`: Supplies (the table and the windows)
- `docs/spec/20-architecture.md`: Rendering, Lean renderer, V2 contracts (the light map), V4 in the Redesign outline, R3 contracts; `docs/spec/22-quality.md`: the budgets (Night with the light map, Rest-frame refinement)
- V4's wave notes and briefs once they are on `main` (`docs/build/v4-wave-notes.md`, `cycle-v4*.md`): what V4A does to the still frame and the light

## You own

`apps/client/src/render/lightMap.ts`, `render/lighting.ts`, `render/material.ts`, `render/layers/{lights,decor,agents,buildings}.ts`; in `packages/art/src/kits`: `residents.ts` (the pole), `props.ts`, `decor.ts` (the lantern), `garden.ts` (the hanging lantern, the birdbath), `fineDecor.ts` (the lamp post, the maypole, the fountain, the cafe table), `festival.ts` (the bonfire, bunting, the flower arch, the stage, the festival table), and a brazier kit of its own; tests beside them; shots `docs/build/screenshots/r3f-*`. If time allows: the master's sign (one line in content `dressingRules.ts`) and the looks for R3B's carved stone and ornamental trees. V4 claims `render/{cache,post,shadows,resolution,ink}.ts`, `renderer.capture()`, `input/camera.ts`, and for V4X `renderer.ts`, `perf.ts`, `debug.ts`: take none of them.

## You can rely on

- R3.0's views, read through the Mirror and the agent frame, never the sim: `SuppliesView` (`supplies.updated` and the snapshot): `lamps` (each lantern with a candle tonight, the tick `reach` it lights and `out` at 07:00; a lantern not listed is unlit), `resting` (`{ id, kind }`, `kind` one of `unlit`, `cold`, `bare`, `faded`, `dry`), `candles` (homes lit until `candleUntil`); the agent row's `AgentFlags.lamplighter` (8192: his pole and light) and `AgentAnim.lightLamp` (9: lighting one); `BuildingView.master` (the sign). On R3.0's stand-ins every lantern is listed with `reach` at 18:00 and nothing rests, so you can draw against the shape from day one; R3A's real walk lands in the same wave.
- V2A's light map (`render/lightMap.ts`, the lights layer, `windowLit` and the window share by the hour, the lamplit rooms), V1's kits and surfaces, V3A's dressing layer (the master's sign as a rule), C5E's festival pieces and seasons, the agents layer and its playback.

## Tasks

1. **Lamps by reach tick**: the lights layer lights a lantern when the clock passes its `reach` and puts it out at `out`; an unlisted lantern stays dark at night, its kit drawn unlit (no flame, no glow on the glass). Lamps reached in the same tick change the light map once: batch them, so the light map's one redraw a change holds during the walk (`22-quality.md`, Night with the light map: under 2 ms, one instanced draw, only when a light changes).
2. **The still frame does not pop** (the handshake with V4A): every static change goes through `ctx.invalidate()`, and a lamp coming on between 17:30 and 18:00 is a light map change the rest frame takes in its stride; test it beside V4A's settle once V4A has landed (or say what you measured without it).
3. **The lamplighter**: a resident row with `AgentFlags.lamplighter` carries a pole with a small light at its tip; `AgentAnim.lightLamp` raises it to the lamp. Keep him to the residents kit's budget (one extra part, instanced).
4. **Candle-lit homes**: a home in `candles` lights every window from dusk until `candleUntil` (the window test with a per-building override, in `lighting.ts`, `material.ts` and the lights layer's window discs), others keep the window share by the hour; no home ever goes dark.
5. **Resting pieces** (`render/layers/decor.ts` and the kits): a cold fire (no flame, no smoke, ash), a bare table (no cloth, no plates), faded cloth (the bunting's and the arch's colors washed toward the paper), a dry fountain or birdbath (no water surface), an unlit lamp (task 1). A piece's rest changes redraw that piece only.
6. **If time allows**: the master's sign (a dressing rule reading `BuildingView.master`, a painted board over the door), and looks for the carved stone and ornamental tree pieces R3B adds (else they keep the existing kits R3B pointed them at).
7. **Shots**: a street at 17:40 with the lamplighter halfway along it (some lamps lit, some not), the same street at 19:00 with candles for half its lanterns (the kept place lit, the rest dark), a candle-lit row beside a plain one, each resting piece by day and by lamplight, at 1250 px and on Medium.

## Acceptance criteria

- [ ] A lantern lights as the lamplighter reaches it (its `reach` tick) and goes out at 07:00; an unlit lantern reads unlit; a candle home lights every window until bedtime; each resting kind reads at a glance by day and by lamplight (shots).
- [ ] The light map redraws once a tick at most during the walk, inside its 2 ms; moving frames cost what they did (`npm run bench` and the V2/V3 perf scripts on the grown village, before and after); the still frame does not pop.
- [ ] Nothing reads the sim; nothing in the sim changes; a year hashes the same in Node and a browser worker.
- [ ] Typecheck, lint, unit tests, build and e2e pass.

## Out of scope

The rules behind the lamps, the walk, the candles and the rests (R3A); the panels (R3D); V4's rest-frame refinement, photo mode and ink captures; the endpaper map's night tint (V4B's, the owner's ruling).

## Notes

- Read the light map's code before you design: V2A built it to redraw only when a light changes; a walk of 40 lamps over half an hour is 40 small changes, and batching by tick is the whole budget.
- Prefer kit params to new geometry (an unlit lantern is the lit one with its flame part off and its glass dark); keep every new part opaque and instanced.
- P3C (on `main`, beside the wave) patches `render/lighting.ts` for the night and adds small surface lines in kits you own: merge `main` first and start from P3C's `lighting.ts`. R3H shares `render/layers/buildings.ts` (the kit selection by a specialized building's level): your lines there are the candle windows.
- From V2X and V3X: read every look in place from the default camera, by day, at golden hour and by lamplight; the screenshots are the evidence.
- Runs as the build and review loop (`31-parallel-development.md`): one or two rounds of quality check and the player's chair (play an evening from 17:00 to 19:00 watching one street) before the PR.
