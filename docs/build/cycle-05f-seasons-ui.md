# C5F: Seasons UI

**Iteration**: I3. **Wave**: parallel. **Branch**: `cycle/05f-seasons-ui`.
**Depends on**: C5.0 merged. **Runs alongside**: C5A to C5E. **Ports**: client 5196, relay 8806.

## Goal

Both lanes get the pages and tools I3 needs, with the look of a storybook almanac rather than plain menus: a season card that opens each evening and a two-page season report that closes it, weather and forecast in the top bar, the Field Guide, the festival planner and its result, the Watch panel and defense tools, threat warnings that are clear without being alarming, the raid's few controls and result card, the trial card, renown, commissions and the River Dock, modules in the Customize panel, the threat dial, photo mode, and a Chronicle with pictures (snapshots stored with the valley).

## Read

- `CLAUDE.md`, `docs/build/i3-wave-notes.md`, `docs/spec/20-architecture.md` (I3 contracts, Client)
- `docs/spec/02-game-overview.md`: Loops (the session and the season card)
- `docs/spec/16-coop.md`: Lenses (I3 rows), Together moments
- `docs/spec/17-presentation.md`: UI, Camera (photo mode), Accessibility
- `docs/spec/14-challenge.md`: Telegraphing, Raid resolution (player actions, result card), Difficulty dials
- `docs/spec/12-hearth.md`: Festivals, Nature and the Field Guide, The Chronicle (Snapshots)
- `docs/spec/21-networking-and-saves.md`: Hosting, Security and privacy (for image storage)

## You own

`apps/client/src/ui`, `apps/client/src/input`, `apps/client/src/state`, `apps/client/src/app`; for Chronicle snapshots only: the image messages or routes in `packages/protocol`, the image table and route in `apps/server`, `tools/dev-server`, and `apps/client/src/net`.

## You can rely on

C5.0's views and mocks (`apps/client/src/ui/mocks/seasons.ts`), `?debug&fixture=winter` and `?debug&fixture=raid`, the new commands and their reject reasons, `canPaintWall`; C5E's photo mode and `capture` on `RenderApi`; the I2 panels, books, letters, feed and minimap.

## Tasks

1. **The season**: the season card at the start of each season (Charter steps, festival date, forecast, any telegraphed threat, the trial when one is on), the two-page season report at its end (Hearth page, Ledger page, from `SeasonReportView`), weather, forecast and season in the top bar, renown beside the rank pennant.
2. **Hearth**: the Field Guide book (pages per species with line art, where and when it was first seen, three hints, habitat overlays from its pages); the festival planner (site picking on the map with validity, the menu from stock with what is reserved, music and the twist, a live joy estimate with the breakdown) and a result card with stars; the module picker in the Customize panel with costs and a preview; the pond tool.
3. **Ledger**: the Watch panel (roster, target size, budget, training, morale with its parts, posture as up to 3 guard points placed on the map); wall and gate painting tools with a ghost that refuses enclosures before submitting; defense pieces in the build picker; the River Dock in the trade book (boats, frozen notice); commissions (offers, progress, accept and decline); market day and quiet hours in Policies.
4. **Threats**: the telegraph alert (side as an arrow at the map edge, band, days left, the signs in words), the Hearth lens sees it gently and both lenses see it; during a raid, a small bar with ring the bell, light all lanterns and gates, and the raid's progress; the result card (goods lost, damage, captures, renown, morale) and the captive choice (offer a home or send them off), either seat deciding; wolves' warnings in winter.
5. **Trial and together**: the trial card (what the winter needs, how the town is doing day by day, the seal on success, a kind word and the retry date on failure); a quiet note when a together moment is on ("You are both here: stay for the closing dance").
6. **Settings and new valley**: the threat dial beside the economy dial at creation and in Settings, with the partner notified and a Chronicle line.
7. **Photo mode**: a key and a toolbar entry; hides the UI, free camera, depth of field and time-of-day sliders, save PNG, Esc back.
8. **Chronicle snapshots**: when a `chronicle.added` entry carries `snapshot`, the lowest connected seat's client calls `capture` and uploads the image keyed by valley and entry id (first write wins); the Chronicle shows it. Online: a route on the Worker with the seat token in an `Authorization` header and a DO SQLite table with a per-valley cap and pruning; solo: IndexedDB through the same adapter interface; the dev relay serves the same. Images never enter sim state; `.qoti` export leaves them out in I3 (say so in the spec).
9. **Alerts and inspectors**: cold homes, firewood short for winter, food days at the start of winter, floods forecast, festival prep, a new species, commissions due, a raid telegraphed; warmth and Watch duty in the resident inspector, modules, hp, gates and flooding in the building inspector.
10. Keep the I1 and I2 look and raise it: illustrated headers, small seasonal flourishes, paper that changes tint with the season; screenshots of every new panel at 80%, 100% and 140%.

## Acceptance criteria

- [ ] Every panel works against the mocks (component tests) and a live winter and raid fixture (e2e smoke on your ports).
- [ ] Festival planning, posture, captive choice and the threat dial round trip between two browsers (e2e).
- [ ] Snapshots: an entry gets one image whichever seat captured it, it survives a reload online and solo, and oversized or unauthenticated uploads are refused (protocol and server tests).
- [ ] Wall ghosts agree with the sim's validation (property test, like roads).
- [ ] Screenshots of every new panel at three sizes, in the PR.
- [ ] Definition of done.

## Out of scope

Rendering and photo mode internals (C5E); simulation (C5A to C5D).

## Notes

- The first live playtest called the menus plain. Give the new books character (the Field Guide as a naturalist's notebook, the festival planner as a village poster, the Watch panel as a duty roster pinned to a board) while staying quick to read; get a second opinion from the screenshots before the PR.
- Threat UI must inform without alarming (P3, P36): warm words, clear facts, never red flashing. The Hearth lens shows what the Hearth can do (lanterns, hedges, morale), the Ledger lens what the Ledger can do.
- Read text and numbers from views and content in tests; do not pin copy.
- Image storage is the only new server surface in I3: keep it small, authenticated, capped and documented in `21-networking-and-saves.md`.
- Stand-ins (a fake capture, a stub route) go in the wave notes' stand-ins table with how to remove them.
