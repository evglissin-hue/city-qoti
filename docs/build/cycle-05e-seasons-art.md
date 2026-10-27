# C5E: Seasons art and rendering

**Iteration**: I3. **Wave**: parallel. **Branch**: `cycle/05e-seasons-art`.
**Depends on**: C5.0 merged. **Runs alongside**: C5A to C5D, C5F. **Ports**: client 5195, relay 8805.

## Goal

The valley changes with the year and looks lovelier for it: blossom in spring, deep green summer, falling leaves in autumn, snow on roofs and pines and a frozen river with skaters in winter, rain, fog and snow sized for the miniature. Festivals glow with bunting, stalls, lanterns and a bonfire; the Watch, walls, gates and towers look like they belong in a storybook, and a raid at dusk reads clearly without being grim. Ponds, the apiary, the new trades, modules and about 30 kinds of ambient critters fill the town with detail. Photo mode and Chronicle thumbnails come from here. All of it holds the frame budget on the weaker laptop and on a Retina screen.

## Read

- `CLAUDE.md`, `docs/build/i3-wave-notes.md`, `docs/spec/20-architecture.md` (I3 contracts, Rendering)
- `docs/spec/17-presentation.md` (all; Seasons and weather visuals, Critters, Camera (photo mode), Quality presets)
- `docs/spec/14-challenge.md`: Defenses, Raid resolution (what must read on screen)
- `docs/spec/12-hearth.md`: Festivals, Nature and the Field Guide; `docs/spec/10-world-and-building.md`: Customization (Phase 2), ponds
- The C3D, C4E PR notes and the I1 playtest polish line in `CHANGELOG.md` (what the renderer does and what players flagged)

## You own

`packages/art`, `apps/gallery`, `apps/client/src/render`.

## You can rely on

C5.0's views and agent flags (`cold`, `watch`, `raider`, `wolf`, `festival`, `skating`, `visitor`; `run` and `dance`), `WeatherView`, `isFrozen`, flooded tiles, `rt.modules`, `rt.hp` and `rt.open`, habitat patches, the winter and raid fixtures (`?debug&fixture=winter`, `?debug&fixture=raid`); the shared kit material's season, snow and sway hooks; the C3D-1 seasonal grade (`post.ts`, Spring only until now).

## Tasks

1. **Seasons**: grass and foliage tints per season from the palette, blossom on fruit trees, autumn colors with falling leaves, bare deciduous trees and snow-capped pines, the seasonal grade for all four seasons, seasonal clothing (scarves and hats in winter), smooth transitions across a day rather than a snap at midnight.
2. **Winter**: a snow cover shader on upward-facing surfaces (roofs, ground, props), snow drifts against walls, the frozen river and frozen ponds (the `ice` token, cracks and skate marks), skaters, breath and chimney smoke thicker in the cold, warm windows that read even cozier.
3. **Weather**: rain, snow and fog particles sized for the miniature, storm wind in trees, a darker sky and gentle lightning glow without flashing (accessibility), heat shimmer kept subtle; flood water over floodplain tiles that rises and falls; a dry, yellowed look in drought.
4. **Festivals**: festival pieces (stalls with goods from the menu, bunting runs, festival lanterns, a stage, tables, a bonfire), the crowd, the dance for the together moment, fireworks for a rank-up or sealed Charter, the circus tent and visitors on a green.
5. **Defense and the Watch**: palisades, stone walls (with ivy and flower box modules), gates open and shut, a wooden watchtower, the Watch House, bell tower, traps; Watch members with gentle gear (slings, staffs, nets, lanterns); raiders as a hooded gang of any species with sacks of loot; wolves at the forest edge; telegraph signs (tracks in the snow, crows gathering); broken wall pieces and condition damage that builders mend. A raid at dusk must read from the default camera (who is where, what is being taken) and stay storybook, not menacing.
6. **Buildings and nature**: the Bath House, River Dock with boats, apiary with skeps, pie shop, chandler, tailor, carpenter, the Herbalist's Cottage, the Stone Bridge; ponds with reeds and lily pads; modules (porch, dormer, bay window, extra floor, balcony, tower, arcade) that fit the district styles; ambient critters near qualifying habitat (butterflies, bees, ducks, frogs, fireflies, a kingfisher, swans, a heron, and the rest of the Field Guide where they can be shown), counts by quality preset.
7. **Overlays**: habitats (one per habitat, colorblind-safe), floodplain, threat (deterrence and Watch coverage), warmth (cold homes).
8. **Photo mode and thumbnails**: `RenderApi` additions for photo mode (free camera beyond the play clamp, depth of field, a time-of-day override that never touches the sim, a high-resolution PNG) and `capture({ focus, radius, size })` returning a small image for Chronicle snapshots, rendered offscreen without a visible hitch.
9. **Performance and feel**: a 150-building Village in winter with snow falling, a festival with 80 residents and a raid with 12 raiders all within budget on Medium (300 draws, 1.5 M triangles, 12 ms main thread); particles and critters instanced; dynamic resolution still steps in on a Retina laptop. Check the motion, not just the stills: walking must not look floaty (the I1 playtest flagged it), every lantern and festival light must actually light, and the bonfire and snowfall must not stutter.

## Acceptance criteria

- [ ] Gallery: every new generator and module by style, and the whole set in all four seasons, day and night (screenshots).
- [ ] Winter and raid fixtures: wide, close, dusk and night screenshots that read as one coherent storybook valley; a short clip each of snowfall, the festival evening and a raid (in the PR).
- [ ] Render budget numbers at village scale in winter, during a festival and during a raid, on Medium at device pixel ratio 1 and 2 (draw calls, triangles, frame ms, the resolution step reached).
- [ ] Photo mode saves a PNG; `capture` returns a thumbnail in under 50 ms of main thread time.
- [ ] Accessibility: no flashing effects; overlays pass the colorblind check (`apps/client/e2e/colorblind.py`).
- [ ] Definition of done.

## Out of scope

Simulation (C5A to C5D); panels, the photo mode UI and image storage (C5F).

## Notes

- **Visual quality is the owner's top priority**: coziness, quaintness, detail and diversity. A season should feel like a different evening in the same beloved place. Prefer fewer, better details over many cheap ones, and review with the owner's eyes: would this make someone want to stay in this town in winter?
- The first live playtest flagged floaty walking, lag on a Retina laptop, plain menus and half-lit lanterns. Your track owns the first, second and fourth: check each in motion with snow, crowds and a raid on screen, and put the numbers in the PR.
- Snow and weather go through the shared material's hooks and the post grade, not per-kit forks, so every kit gets them for free.
- Critters are cosmetic and client-side; the sim's sightings decide the Field Guide. Never draw a resident species as wildlife.
- Do not pin exact colors or counts in tests where the palette or content can be read.
- Stand-in art for pieces another track adds late goes through stand-in defs (`render/defs.ts`) and the wave notes' stand-ins table.
