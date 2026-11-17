# V4C: Tea-break mode (draft)

**Iteration**: V4. **Wave**: parallel. **Branch**: `cycle/v4c-tea-break`, PR into `cycle/v4x-integration`.
**Depends on**: V4.0. **Runs alongside**: V4A, V4B. Draft by V3X; V4.0 finalizes it.

## Goal

After 90 seconds without input (a setting, on by default; never while a tool is in hand or a card is open) the camera follows a resident on their evening round or circles the day's busiest place; any input puts the view back where it was.

## Read

- `docs/build/v4-wave-notes.md`; `17-presentation.md`, Tea-break mode
- `input/camera.ts`, the follow camera, the evening round (`19-evenings.md`), the setting panels

## Tasks

1. The idle timer and the setting, with the tool and card guards.
2. Follow a resident on their round (the existing follow camera) or orbit the day's busiest place, chosen from shared state only.
3. Any input restores the exact view; the camera's moves are slow and never cross a wall.
4. Both seats: each seat's tea break is its own (camera state is never shared).

## Acceptance criteria

- [ ] An e2e: idle 90 s, the camera moves; a key or a click restores the view exactly; a tool in hand or a card open prevents it.
- [ ] A tea break's frames hold the moving budget (it is a moving camera); refinement never runs during it.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Stroll mode (I5).
