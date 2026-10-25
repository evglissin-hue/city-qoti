# City Qoti: agent guide

A cozy two-player town builder for the browser. TypeScript monorepo: a deterministic simulation that runs in both players' browsers in lockstep, Three.js rendering, a Preact UI, and a Cloudflare Durable Object that relays commands and stores the town.

## Read only what your task needs

1. This file.
2. Your cycle brief in `docs/build/`. It lists the spec sections you need.
3. Nothing else unless the brief says so. `docs/spec/README.md` is the index if you are lost.

## Commands

These are created in cycle C1; keep this list accurate.

- `npm ci`: install (also generates `packages/sim/src/version.generated.ts`)
- `npm run dev`: client and local relay (client on http://localhost:5173, relay on :8787)
- `npm test`: unit tests (Vitest); `npm run e2e`: Playwright (starts its own servers; first run needs `npx playwright install chromium`)
- `npm run typecheck`, `npm run lint` (ESLint and Prettier check), `npm run format`, `npm run build`
- `npm run bench`: headless simulation benchmarks with budget checks
- `npm run deploy`: Cloudflare deploy (needs credentials)
- `npm run golden -w @qoti/sim`: regenerate `packages/sim/test/golden/i0-basic.json` (only when the script format changes)

## Layout

| Path | What |
|---|---|
| `packages/sim` | Deterministic simulation. No DOM, no Three, no network, no timers. |
| `packages/content` | Game data and its types. No logic. |
| `packages/protocol` | Network messages, RoomCore, storage adapters. |
| `packages/art` | Procedural geometry, palette, materials. |
| `apps/client` | The game: `app/`, `net/`, `worker/`, `state/`, `render/`, `input/`, `ui/`. |
| `apps/gallery` | Style kit viewer. |
| `apps/server` | Cloudflare Worker and the ValleyRoom Durable Object. |
| `tools/dev-server` | Local Node relay for development and e2e. |
| `tools/bench` | Benchmarks. |

Your brief says which paths you own. Outside them, make only small, necessary edits (a registry line, an export, an additive contract change) and list them in your PR.

## Hard rules

- **Determinism** in `packages/sim`: no `Math.random`, `Date`, `performance`, timers, `async`, `Intl`, or `Math.sin|cos|tan|atan2|exp|log|pow|hypot|cbrt` (and no `**`). Use the seeded RNG streams. Iterate arrays or Maps, never object keys. Per-good quantities are arrays indexed by good index. Every state change goes through a command. Lint enforces most of this.
- **Contracts** (`packages/sim/src/contracts/`, `packages/protocol/src/messages.ts`, `packages/content/src/types.ts`, and the client interfaces listed in `docs/spec/31-parallel-development.md`): additive changes only during parallel cycles. Never rename or remove; if you must, stop and propose it in your PR.
- **Registries**: add commands, systems, content, render layers, tools, lens entries, panels and art kits through their registries, one alphabetically sorted line each.
- **Saves**: any change to the shape of saved state bumps `SAVE_VERSION` and adds a migration with a test.
- **Budgets** in `docs/spec/22-quality.md` are acceptance criteria.
- **Writing**: never use em dashes anywhere (docs, UI text, content, comments, commit messages). In-game text is warm, dry and witty, never babyish. US spelling.

## Workflow

- Branch `cycle/<id>-<slug>` from `main`; one PR per cycle into `main`, using the PR template.
- Before opening the PR: typecheck, lint, unit tests, build, e2e and bench pass.
- Update the spec where behavior differs from it, add a line to `CHANGELOG.md`, and update your row in `docs/build/README.md`.
- If you run out of time or context: push, open a draft PR, and list what is done and what remains.
