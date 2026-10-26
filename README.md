# City Qoti

A cozy two-player town builder for the browser. Two players on two laptops grow a hamlet in a storybook river valley into a lively little city: one lane for the heart of the town (residents, decorating, festivals, nature), one for its ledger (zoning, logistics, markets, budget), and a light defense layer for real stakes.

Status: cycle C1 (foundation) done. Two tabs share one generated valley through a local relay; paths, lanes, cottages, decor and trees stay identical on both sides. Visuals are placeholders until C2B.

- Spec: [docs/spec/README.md](docs/spec/README.md) (start with the [principles](docs/spec/01-principles.md))
- Build board and cycle briefs: [docs/build/README.md](docs/build/README.md)
- Agent guide: [CLAUDE.md](CLAUDE.md)

## Quick start

You need Node 22 or newer (`.nvmrc` says 22).

```sh
npm ci          # install (also generates the sim version file)
npm run dev     # local relay on :8787 and the client on http://localhost:5173
```

Open http://localhost:5173 and pick a valley:

- **Two-tab co-op, locally.** Click **New online valley**. The invite dialog shows a link; open it in a second tab, another browser profile or a laptop on the same network (use your machine's address instead of `localhost`). The second player clicks **Join the valley**. Each tab is one seat.
- **Solo.** Click **New solo valley**. It runs entirely in the browser (IndexedDB), works with the relay stopped and survives a reload.
- **Continue.** Recent valleys are listed on the title screen; the seat tokens stay in this browser only.

Controls: left click uses the current tool, right drag rotates, middle drag (or left drag with Inspect) pans, the wheel zooms. Keys: WASD or arrows pan, Q and E rotate, T and G tilt, + and - zoom, R rotates the piece you are placing, Space pauses, 1 to 3 set speed, Tab switches between the Hearth and Ledger lenses, Escape goes back to Inspect.

Add `?debug` to the URL for the dev overlay and the `window.__qoti` test hook.

## Checks

```sh
npm run typecheck   # tsc in every workspace
npm run lint        # ESLint (with the sim determinism rules) and Prettier
npm test            # Vitest: content, sim, protocol, art, client, tools
npm run build       # client, gallery and a dry-run Worker bundle
npm run e2e         # Playwright: co-op, solo and determinism specs (starts its own servers)
npm run bench       # headless sim benchmarks; fails over the worldgen and tick budgets
```

The first `npm run e2e` on a new machine needs a browser: `npx playwright install chromium`.

## Layout

| Path | What |
|---|---|
| `packages/sim` | Deterministic simulation: contracts, worldgen, rules, commands, systems, saves |
| `packages/content` | Game data and its types |
| `packages/protocol` | Network messages, RoomCore and storage adapters |
| `packages/art` | Procedural geometry, palette and materials |
| `apps/client` | The game (Vite, Three.js, Preact) |
| `apps/gallery` | Style kit viewer (`npm run dev -w @qoti/gallery`) |
| `apps/server` | Cloudflare Worker and the ValleyRoom Durable Object |
| `tools/dev-server` | Local relay for development and end to end tests |
| `tools/bench` | Benchmarks |

## Deploying

One time, by a human: create a free Cloudflare account, run `npx wrangler login`, then `npm run deploy`. It prints the game's URL. Details in [docs/spec/21-networking-and-saves.md](docs/spec/21-networking-and-saves.md#hosting).
