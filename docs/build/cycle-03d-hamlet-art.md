# C3D: Hamlet art and rendering

**Iteration**: I1. **Wave**: parallel. **Branch**: `cycle/03d-hamlet-art`.
**Depends on**: C3.0 merged. **Runs alongside**: C3A, C3B, C3C, C3E.

## Goal

The hamlet comes alive on screen: woodland folk walking, carrying and hopping; every I1 building with its own character; construction you can watch; overlays that make Charm and logistics readable.

## Read

- `CLAUDE.md`
- `docs/spec/17-presentation.md`: Style kit, Residents on screen, Quality presets, Palette
- `docs/spec/11-residents.md`: Species
- `docs/spec/13-ledger.md`: I1 buildings, Construction (stages)
- `docs/spec/20-architecture.md`: Rendering, I1 contracts (agent frames)

## You own

`packages/art`, `apps/gallery`, `apps/client/src/render`.

## You can rely on

C3.0 contracts and mock views; C2B's kit, renderer and budgets.

## Tasks

1. **Residents**: the parametric body with species parts for all 7 species, fur and clothing palettes, tier details; vertex-shader walk, carry and hop; instanced with three detail levels; interpolation of agent frames between turns; follow-camera target support.
2. **Bubbles**: wish, happy, unhappy and sleepy icons above heads, toggleable.
3. **I1 buildings**: builder's yard, woodcutter's hut, forester's lodge, sawpit, quarry, farmhouse, wheat field (growth stages), windmill (working), bakery (warm window glow, oven smoke), vegetable plot (crop stages), fisher's hut (racks, little boat), storehouse (visible stock piles), market stall (goods on display), town hall details.
4. **Construction stages**: staked plot, foundation, frame, roof.
5. **Carried goods**: bundles per good on porters; cart placeholder for I2.
6. **Overlays**: charm (colorblind-safe ramp), well coverage, logistics flows (animated arrows weighted by deliveries), building status icons.
7. **Customization rendering**: swatches, roof materials, window boxes, shutters, chimney, sign text.
8. **Gallery**: every new generator and all 7 species, day and night.

## Acceptance criteria

- [ ] Gallery screenshots of all species and buildings, day and night, in the PR.
- [ ] 2,000 synthetic residents on screen on Medium within the frame budget (Playwright `renderer.info` plus measured frame time).
- [ ] Overlays readable in a colorblind simulation screenshot.
- [ ] Definition of done.

## Out of scope

Panels and HUD (C3E), simulation (C3A to C3C).
