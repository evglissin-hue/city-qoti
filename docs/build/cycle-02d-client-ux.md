# C2D: Client UX

**Iteration**: I0. **Wave**: parallel. **Branch**: `cycle/02d-client-ux`.
**Depends on**: C1 merged. **Runs alongside**: C2A, C2B, C2C.

## Goal

Controls and UI that feel good on a laptop with a trackpad or a mouse: a camera that glides, tools with honest previews, a clear paper-style UI, both lenses, presence that makes the partner feel near, and gentle guardrails.

## Read

- `CLAUDE.md`
- `docs/spec/16-coop.md` (all)
- `docs/spec/17-presentation.md`: Camera, UI, Accessibility
- `docs/spec/20-architecture.md`: Client, I0 contracts (`Tool`, `RenderApi`, `RoomConnection`)
- `docs/spec/10-world-and-building.md`: Placement feedback, Roads (painting), Decor (linear decor)

## You own

`apps/client/src/app`, `apps/client/src/input`, `apps/client/src/ui`, `apps/client/src/state`.

## You can rely on

C1's tools, Mirror, `RenderApi`, `RoomConnection`, panel and lens registries, placeholder UI.

## Tasks

1. **Camera**: damping, zoom to cursor, pitch and distance limits, trackpad detection (pinch arrives as ctrl+wheel; two-finger scroll pans), Shift+two-finger rotate, keyboard pan, rotate and tilt, focus animation.
2. **Tools**: ghost previews with the validity reason shown near the cursor; drag-to-paint roads with a straight or L route preview (toggle the elbow with a key); R to rotate buildings and decor (Shift+R fine rotation for decor); drag for linear decor; rectangle select for erase; eyedropper (pick the def under the cursor); Esc cancels.
3. **Lenses**: Hearth toolbar (decor, trees and gardens, notes) and Ledger toolbar (roads, buildings); shared tools (inspect, erase, time); Tab toggles; the default from the seat profile.
4. **Theme**: paper panels, ink outlines, Alegreya and Alegreya Sans self-hosted, line-art icons, lens accents.
5. **Top bar**: date, time, season, effective speed with "paused by <name>", connection status chip.
6. **Inspector**: building, decor, tree and note details with "built by"; edit and resolve notes.
7. **Feed**: notes, rejections (gentle wording), alerts; unread badges.
8. **Title screen**: new valley form (town name, seed, dials, your name, color, lens), invite dialog with copy, join, continue list, solo valley.
9. **Presence UI**: partner name labels, "go to partner", the ping tool and Alt+click menu (Look here, Help, Build here), emote wheel (8 emotes), off-screen arrows.
10. **Guardrail**: removing the partner's handmade work asks for confirmation with an optional reason and sends them a note.
11. **Settings**: quality preset, UI scale (80% to 140%), reduced motion, controls help overlay (?), stored in localStorage behind try/catch.
12. **Copy**: all strings in one module, warm and dry, no em dashes.

## Acceptance criteria

- [ ] Every tool works with a mouse and with a trackpad (checklist in the PR, tested on at least one real trackpad if possible, else documented gesture tests).
- [ ] e2e: title → create → copy invite → join in a second context → both see each other's cursor label → ping shows on the other side.
- [ ] e2e: removing the partner's decor shows the confirmation and creates a note for them.
- [ ] Settings persist across reloads and the game still works when localStorage throws.
- [ ] Screenshots of the title screen, both lenses, the inspector and the invite dialog in the PR.
- [ ] Definition of done.

## Out of scope

Rendering internals (C2B; ask for additive `RenderApi` methods if needed), networking internals (C2C), simulation rules (C2A).

## Notes

- Laptop first: nothing may require a middle click or a scroll wheel.
- Keep tools thin: they turn pointer input into commands and ghosts; validation lives in `@qoti/sim/rules`.
