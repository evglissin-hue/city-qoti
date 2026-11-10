# 16. Co-op

One shared town, co-owned, two laptops (P7 to P14). Everything here is designed for exactly two seats; the protocol allows up to four so nothing breaks if a guest ever joins.

**The redesign (owner, 2026-11-10)**: the two players play on their own laptops, online, in a browser; that is the only setup the game is designed for. The co-op now runs through the town itself: goods and folk are two flows the lanes own, and the game says in words what each did for the other (`19-evenings.md`). Notes tagged [R1] to [R3] below.

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
- *As built since 2026-10-28*: the Requests panel, the ask form and the ping tool left the interface after a playtest; the sim kept the commands.
- **Gaps** [R2, R3]: requests return without a form. The town itself posts a gap when one lane's work is waiting on the other's (a place with nothing to sell, a shop nobody passes, households with nowhere to go, a place short of supplies), shows it to both lenses, says what would close it, closes it by itself and credits the seat who closed it (`19-evenings.md`, Gaps). `request.*` stays for free-text asks, which show as notes do.

**As built in I2 (C4D)**:

- Plans hold building commands only (build, decor, fields, notes, roads, terrain, trees, zones). `plan.edit { id, items, name? }` tweaks an open plan and marks it unseen by the partner (`seenBy` becomes the editor alone); `plan.remove` discards. Approving runs each item through its own validation at that moment, records `applied` and `skipped`, and sends both seats a note ("Bo approved "A bench by the well": 3 done, 1 skipped because things had changed since it was drawn."). A daily pass at 03:00 tidies closed plans after 12 days, keeping at most 10. Ghost drawing and the panel are C4F's (and C4E's).
- Requests close themselves hourly at offset 130: goods when the named building holds the quantity (store and output buffer; the whole town when it names none), charm when the average charm over the area reaches the target. "By when" is shown, not enforced: a late delivery still counts. The asker gets a note; `village.requestsFulfilled` counts them for Odette's arc and the Together goals. Open requests carry `progress { value, target }` and send `request.updated` when it moves. Text requests are closed by hand.
- **Moving a solo valley online**: Settings, "Play together", in a solo valley. The current turn is snapshotted and read back through the valley-file path, the relay creates a new online valley from it, this device opens it as seat 0 with the invite for seat 1 showing, and the solo valley leaves the Continue list (moved, not copied).

## Guardrails

- Every entity records `builtBy` (seat) and whether it is handmade (decor, customization, landmarks).
- **Removing the partner's handmade work** [I0] asks for confirmation and an optional reason, then leaves the partner a note: "<name> removed your bench by the mill: making room for the bakery."
- **Undo** [I1]: each client keeps a stack of its own last 30 accepted commands with their inverses (place, remove, paint roads and fields, plant and fell, notes, customize, priority, pause, goods for sale; from R1 zones, the carrier's rules and the season plan in place of goods for sale, and move). Ctrl+Z (Cmd+Z) or the toolbar's undo button submits the inverse as a new command. The client first checks that the target still looks the way the command left it and refuses gently (`CHANGED`) if not; the sim rejects the inverse if anything else moved on. Undoing a removal rebuilds the piece fresh (a felled tree comes back as a sapling).
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
| Hearth | decor, trees and gardens, customize [I1], Pattern Book [I1], wishes [I1], plaques [I1], festivals [I3], Field Guide [I3], Chronicle [I1]. [R1] move and the composing helpers; [R2] places and their names; [R3] which places to keep supplied, and the Town Book | charm [I1], wishes [I1], habitats [I3]; [R2] Town (the two inks) | wishes, pattern hints, thank-you letters, festival prep; [R2] gaps, the evening's book |
| Ledger | roads, buildings, fields [I1], storehouses [I1], budget and reports [I1], zoning [I2], trade [I2], policies [I2], Watch [I3]. [R1] zones, specialized buildings and streets; the Balances, Purse and Businesses books; the season plan | flows [I1], coverage [I1], status [I1], land value [I2], traffic [I2]; [R1] reach; [R2] Town (the two inks) | shortages, idle buildings, lean times; [R1] a demand bar that needs zoned land, the winter reserve; [R2] gaps |
| Shared (both) | inspect, erase, notes, plans [I2], requests [I2], Charter board [I2], time | none | threats, Charter progress, partner pings |

## Together moments [I3]

Some cozy moments happen only when both seats are connected: the festival's closing dance, fireworks at a rank-up, an evening stroll event. They never gate progress (P5).

[R2] **The evening edition** is the daily together moment for a pair who are not in the same room: at 21:00 both seats get the same short page about the day across both lanes, with each seat credited by name for what its work did for the other's (`17-presentation.md`, The redesign's interface). The stroll of day 3 becomes a walk along the evening round's busiest route.

*As built (C5B)*: the sim emits `together.moment { kind }` only while `time.connected` holds both seats, and counts each kind in `seasons.together`; nothing waits on one and nothing else changes (a one-seat valley runs to the same state but for the counter and the seats named on that evening's Chronicle line). The rules: **dance** at 21:00 on the festival evening, while the festival is live (the guests on the site dance in the agent frame for the last hour); **fireworks** at 21:00 on the evening after a rank-up or a sealed Charter (a `rank-up` or `trial-passed` Chronicle entry in the day before); **stroll** at 20:00 on day 3 of each season when the weather is clear or cloudy (a fair evening midway between two festivals, for the pair to walk the town together). C5E draws them.
