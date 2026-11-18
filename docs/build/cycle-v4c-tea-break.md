# V4C: Tea-break mode

**Iteration**: V4 The developing picture. **Wave**: parallel. **Branch**: `cycle/v4c-tea-break`, from `cycle/v4x-integration`; PR into `cycle/v4x-integration`.
**Depends on**: V4.0. **Runs alongside**: V4A, V4B, and R3's wave. **Model and effort**: Opus 5.5 at high; Sonnet executors for mechanical parts. **Ports**: client 5263, relay 8873.

## Goal

After 90 seconds without input (a setting, on by default; never while a tool is in hand or a card is open) the camera follows a resident on their evening round or slowly circles the day's busiest place; any input puts the view back exactly where it was. Each seat's tea break is its own.

## Read

- `CLAUDE.md`; `docs/build/v4-wave-notes.md` (Tea break and the camera); `docs/spec/20-architecture.md`, V4 contracts
- `docs/spec/17-presentation.md`: Visual direction, 6 (Tea-break mode), Camera; `docs/spec/19-evenings.md`: the evening round
- `apps/client/src/input/{teaBreak,camera,manager}.ts`, `render/renderer.ts` (`follow`, `followStep`), `ui/settings.ts`, `ui/SettingsPanel.tsx`, `ui/state.ts`

## You own

- `apps/client/src/input/{teaBreak,camera}.ts`; `renderer.ts`'s `follow` and `followStep` (additively: a slower glide while a tea break follows)
- The wiring: a new `apps/client/src/app/teaBreakHost.ts` and one line where the session starts it; the setting's row in `ui/SettingsPanel.tsx` and its text in `ui/copy.ts`

Not P3B's files (`ui/{Toolbar,TopBar,GameUI,Minimap,Picker}.tsx`).

## You can rely on

- `TEA_BREAK_AFTER_MS` (90 s), `IdleTimer { poke, idleFor, due(now, guards) }`, `TeaBreakGuards { enabled, toolInHand, cardOpen, busy }`, `TeaBreakPlan` (`follow` a resident or `orbit` a place), `chooseTeaBreak(mirror)` (a stub returning null) in `input/teaBreak.ts`
- `CameraController.saveView()`, `restoreView(v)` (an exact snap), `orbit(around | null)` and `setDrift(on)` (stubs), `CameraView`, `CameraOrbit` in `input/camera.ts`
- `UiSettings.teaBreak` (on by default; read by `loadSettings`), `ToolManager.active` (`'inspect'` is empty hands), UiState's open-card signals, `ui.photo`, `ui.following`

## Tasks

1. **The host** (`app/teaBreakHost.ts`): pokes the timer from every key, click, drag, wheel and touch on the window; checks `due` a few times a second (not every frame); builds the guards from the setting, `ToolManager.active`, UiState's open cards and `busy` (photo mode, Measure this laptop, a resident followed by hand).
2. **The choice** (`chooseTeaBreak`): in the evening (from the round's start to bedtime) a resident on their evening round, else the day's busiest place (the place or building with the most footfall or visits today), from the Mirror only; null when the valley has nobody out and nothing busy (no tea break then).
3. **The camera**: `orbit` circles slowly (a full turn in about two minutes) at the play camera's pitch and a mid distance, never through a wall (keep the pitch and distance inside the play clamp; a building in the way is fine from above at 45 degrees); `setDrift` lengthens the glide so following looks like a slow walk beside them. Reduced motion: no orbit, a still follow at most, or none (your call; say it in the spec).
4. **Restore**: any input calls `restoreView(saved)` before the input acts, so a key or a click lands on the view the player left. Starting a tea break saves the view; ending one restores it exactly.
5. **The setting**: a row in the settings panel ("Tea break: after a minute and a half of quiet the camera wanders the valley"; warm, dry, no exclamation), on by default.
6. Docs: `17-presentation.md` (Tea-break mode, As built), `20-architecture.md`, the board row, `CHANGELOG.md`.

## Acceptance criteria

- [ ] An e2e: idle 90 s (a clock the test controls, not a real wait), the camera moves; a key or a click restores the view exactly (`saveView` equal before and after); a tool in hand or a card open prevents it; the setting off prevents it.
- [ ] Both seats: one seat's tea break moves neither the other's camera nor anything shared (an e2e with two browsers, or a test that no command and no network message is sent).
- [ ] A tea break's frames hold the moving budget (it is a moving camera: `v4-perf.mjs` or the overlay's mode reads `moving`), and refinement never runs during one.
- [ ] Unit tests for `chooseTeaBreak` (evening, day, empty valley) and the orbit's limits.
- [ ] Every hash matches. Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Stroll mode (I5); the refinement (V4A); photo mode (V4B).

## Notes

- A tea break must never feel like the game took the controls: the first input of any kind ends it at once and lands where the player left off.
- The followed resident may go indoors: the follow camera waits at the door (it does today); after a while of nothing, switch to the busiest place rather than stare at a door.
