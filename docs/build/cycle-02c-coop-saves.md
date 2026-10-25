# C2C: Co-op and saves

**Iteration**: I0. **Wave**: parallel. **Branch**: `cycle/02c-coop-saves`.
**Depends on**: C1 merged. **Runs alongside**: C2A, C2B, C2D.

## Goal

Online valleys you can trust: the Cloudflare room with durable storage, snapshots and seasonal backups, export and import, desync recovery, version changes without loss, reconnects after a laptop sleeps, solo valleys that persist, and a documented deploy.

## Read

- `CLAUDE.md`
- `docs/spec/21-networking-and-saves.md` (all)
- `docs/spec/20-architecture.md`: Serialization, hashing, versions; I0 contracts (`RoomConnection`, worker messages)
- `docs/spec/16-coop.md`: Seats, Creating and joining, Time and speed
- `docs/spec/22-quality.md`: Tests, CI

## You own

`packages/protocol`, `apps/server`, `tools/dev-server`, `apps/client/src/net`, `packages/sim/src/state` (serialize, hash, migrations).

## You can rely on

C1's RoomCore, messages, MemoryStorage, dev server, OnlineRoom, LocalRoom, worker snapshot and hash messages.

## Tasks

1. **Storage contract suite**: one shared test suite run against MemoryStorage, the IndexedDB adapter (fake-indexeddb in Node) and the Durable Object SQLite adapter (Miniflare or `wrangler` test tooling if available; otherwise a SQLite-backed fake with the same SQL).
2. **Snapshots**: the full policy (every 300 turns from the longest-connected seat, on pause, on `bye` and `visibilitychange`), pruning, retention (latest 20 plus one named backup per in-game season), restore from a backup.
3. **Export and import**: `.qoti` format, server routes, client APIs; round trip keeps the hash identical.
4. **Desync recovery**: the full flow (hash mismatch, snapshot from the longest-connected seat, `resync`), debug dumps downloadable from the debug overlay, the "this is a bug" notice after 3 in an hour. Add a `?debug` hook that corrupts local state for tests.
5. **Version changes**: the flow in "Version changes", tested in RoomCore with two fake `simVersion`s; the client handles `reloadRequired` with a friendly prompt.
6. **Reconnects**: exponential backoff, seat replacement on a second connection, resume with catch-up; status signal states.
7. **Solo valleys**: LocalRoom persistence across reloads, multiple solo valleys, delete.
8. **Security and limits**: token from the link fragment into localStorage and cleared from the address bar; token only inside `hello`; size and rate limits; 5 s hello timeout.
9. **Timer fallback**: heartbeat-driven turns behind a flag, tested.
10. **Deploy**: `npm run deploy` working with `wrangler`; a GitHub Actions deploy job on `main` that runs only when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets exist; `docs/ops/deploy.md` with the one-time human steps. If credentials are present in your environment, deploy and put the URL in the PR.

## Acceptance criteria

- [ ] Storage contract suite passes for all adapters.
- [ ] e2e: corrupt one client, it resyncs, hashes match again.
- [ ] e2e: drop the network for 10 s on one client, it reconnects and catches up.
- [ ] Export then import gives the same hash; a seasonal backup restores.
- [ ] RoomCore tests for version change, limits, hello timeout and the heartbeat fallback.
- [ ] `docs/ops/deploy.md` is clear enough for a non-developer.
- [ ] Definition of done.

## Out of scope

UI beyond a small Valley panel (backups, export, import) registered through the panel registry; the rest of the UI is C2D. Rendering, worldgen, content.

## Notes

- Never break the lockstep: anything that changes sim state must arrive as a command inside a turn.
- Keep RoomCore free of platform APIs; adapters wrap platform details.
