# 16. Co-op

One shared town, co-owned, two laptops (P7 to P14). Everything here is designed for exactly two seats; the protocol allows up to four so nothing breaks if a guest ever joins.

## Seats

- A valley has seats 0 and 1. Each seat has a display name, a color (one of 6 palettes), a preferred lens and `lastSeenTick`.
- Seat profile changes go through `seat.setProfile` so both screens agree.
- Each seat joins with a private link containing its seat token. No accounts (P52).

## Creating and joining [I0]

Title screen:

- **New valley**: choose a seed (or random), valley type (river valley in I0), difficulty dials, your name, color and lens, and name the town. Online valleys are created on the server and show an invite link for seat 1 with a copy button.
- **Join**: open the invite link.
- **Continue**: recent valleys stored locally (name, last played, link).
- **Solo offline valley**: runs entirely in the browser with IndexedDB saves. Can be moved online later [I2].

## Presence [I0]

Ephemeral, never part of sim state (`21-networking-and-saves.md`).

- The partner's cursor appears as a small lantern in their color with their name, and their active tool icon.
- "Go to partner" button; partner camera footprint on the minimap [I2].
- **Pings**: Alt+click (or the ping tool): Look here, Help, Build here. A ripple, a soft sound, and an edge arrow when off screen.
- **Emotes** (8): wave, heart, laugh, thinking, thumbs up, celebrate, sleepy, "tea?". Shown above the partner's cursor.

## Notes [I0]

- Pin a note to a tile: up to 200 characters, colored by author, persistent (sim state via `note.pin`).
- Either seat can resolve or remove a note. Unread notes for you show a badge.

## Plans layer [I2]

- A plan is a named set of proposed commands drawn as translucent blueprint ghosts in ink-blue, with its author.
- Actions: comment (a short thread), edit, approve, discard. Approving executes the commands in order where still valid and affordable and reports any that were skipped.
- Either seat may approve, including its own plans; plans the partner has not seen are marked "not yet seen by <partner>". Plans are a tool for talking, not a gate.

## Requests [I2]

- Structured requests between seats: goods (good, quantity, by when, where), charm (an area and a target charm), or free text.
- Tracked in a Requests panel; goods and charm requests complete automatically when met. Fulfilled requests count toward Together achievements.

**As built in I2 (C4D)**:

- Plans hold building commands only (build, decor, fields, notes, roads, terrain, trees, zones). `plan.edit { id, items, name? }` tweaks an open plan and marks it unseen by the partner (`seenBy` becomes the editor alone); `plan.remove` discards. Approving runs each item through its own validation at that moment, records `applied` and `skipped`, and sends both seats a note ("Bo approved "A bench by the well": 3 done, 1 skipped because things had changed since it was drawn."). A daily pass at 03:00 tidies closed plans after 12 days, keeping at most 10. Ghost drawing and the panel are C4F's (and C4E's).
- Requests close themselves hourly at offset 130: goods when the named building holds the quantity (store and output buffer; the whole town when it names none), charm when the average charm over the area reaches the target. "By when" is shown, not enforced: a late delivery still counts. The asker gets a note; `village.requestsFulfilled` counts them for Odette's arc and the Together goals. Open requests carry `progress { value, target }` and send `request.updated` when it moves. Text requests are closed by hand.
- **Moving a solo valley online**: Settings, "Play together", in a solo valley. The current turn is snapshotted and read back through the valley-file path, the relay creates a new online valley from it, this device opens it as seat 0 with the invite for seat 1 showing, and the solo valley leaves the Continue list (moved, not copied).

## Guardrails

- Every entity records `builtBy` (seat) and whether it is handmade (decor, customization, landmarks).
- **Removing the partner's handmade work** [I0] asks for confirmation and an optional reason, then leaves the partner a note: "<name> removed your bench by the mill: making room for the bakery."
- **Undo** [I1]: each client keeps a stack of its own last 30 accepted commands with their inverses (place, remove, paint roads and fields, plant and fell, notes, customize, priority, pause, goods for sale). Ctrl+Z (Cmd+Z) or the toolbar's undo button submits the inverse as a new command. The client first checks that the target still looks the way the command left it and refuses gently (`CHANGED`) if not; the sim rejects the inverse if anything else moved on. Undoing a removal rebuilds the piece fresh (a felled tree comes back as a sapling).
- **Customized buildings are handmade** [I1]: removing one the partner customized asks first and leaves them a note, like decor.
- **Who built this**: shown in every inspector.

## Time and speed [I0]

- The speed (paused, 1x, 2x, 3x) is shared: `time.setSpeed` sets every seat's desired speed, so whoever changes it last decides, and either seat can pause or carry on (P10). State still keeps a desired speed per seat and the effective speed is their minimum over connected seats, so older saves behave.
- The top bar shows the effective speed and, when slowed or paused, who caused it: "Paused by <name>".
- Keys: Space toggles pause, 1, 2 and 3 set speed.
- Time passes only while at least one seat is connected (P10). Valley setting **together only**: time passes only while both seats are connected (P9).

## While you were away [I1]

On connect, if the seat was away for at least one in-game day: a letter summarizing Chronicle entries, notable stats (population, treasury, patterns, wishes) and notes and requests for you since `lastSeenTick`. The client asks the worker for it (`inspect('away', seat)`) as soon as the valley loads and shows it on paper over the valley; Esc or "Back to it" puts it away.

## Lenses [I0 skeleton, grows each iteration]

Local UI state per laptop; Tab toggles (P8). The default comes from the seat profile.

| Lens | Toolbar (grows by iteration) | Overlays | Alerts |
|---|---|---|---|
| Hearth | decor, trees and gardens, customize [I1], Pattern Book [I1], wishes [I1], plaques [I1], festivals [I3], Field Guide [I3], Chronicle [I1] | charm [I1], wishes [I1], habitats [I3] | wishes, pattern hints, thank-you letters, festival prep |
| Ledger | roads, buildings, fields [I1], storehouses [I1], budget and reports [I1], zoning [I2], trade [I2], policies [I2], Watch [I3] | flows [I1], coverage [I1], status [I1], land value [I2], traffic [I2] | shortages, idle buildings, lean times |
| Shared (both) | inspect, erase, notes, plans [I2], requests [I2], Charter board [I2], time | none | threats, Charter progress, partner pings |

## Together moments [I3]

Some cozy moments happen only when both seats are connected: the festival's closing dance, fireworks at a rank-up, an evening stroll event. They never gate progress (P5).
