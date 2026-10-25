# 31. Parallel development

How several agent sessions (Claude Cowork or Claude Code) build City Qoti at the same time without stepping on each other.

## Waves and cycles

A **cycle** is one agent session working from one brief on one branch, ending in one PR into `main`. A **wave** is a set of cycles that run in parallel. Each iteration is: a short serial contracts cycle, a parallel wave, then an integration cycle.

| Iteration | Serial first | Parallel wave | Integration |
|---|---|---|---|
| I0 | C1 foundation | C2A world and sim, C2B render and art kit, C2C co-op and saves, C2D client UX | C2X |
| I1 | C3.0 hamlet contracts | C3A residents, C3B Hearth v1, C3C Ledger v1, C3D hamlet art and rendering, C3E hamlet UI | C3X (also writes the I2 briefs) |
| I2 to I5 | written by the previous integration cycle | | |

Briefs live in `docs/build/`. The board in `docs/build/README.md` tracks status.

## Tracks and ownership

Each brief names the paths it owns. Owners may change anything inside them. Outside them, a cycle may only make small, necessary edits (a registry line, a missing export, a type it needs added) and must list them in its PR.

| Track | Owns |
|---|---|
| Sim and world | `packages/sim/src/map`, `src/rules`, `src/commands`, `src/systems/<its systems>`, `packages/content/src` (its data), `tools/bench` |
| Render and art | `packages/art`, `apps/gallery`, `apps/client/src/render` |
| Co-op and saves | `packages/protocol`, `apps/server`, `tools/dev-server`, `apps/client/src/net`, `packages/sim/src/state` (serialize, hash, migrations) |
| Client UX | `apps/client/src/app`, `src/input`, `src/ui`, `src/state` |
| Integration | everything, but only to merge, fix and tune |

## Contracts policy

Contracts are the shared types every track codes against:

- `packages/sim/src/contracts/**`
- `packages/protocol/src/messages.ts`
- `packages/content/src/types.ts`
- `apps/client/src/render/api.ts`, `src/input/tool.ts`, `src/net/connection.ts`, `src/worker/messages.ts`

Rules:

1. Contracts are defined by the serial cycle at the start of each iteration (C1, C3.0, ...).
2. During a parallel wave, contract changes are **additive only**: new optional fields, new union members, new types. Never rename, remove or change meaning.
3. A cycle that truly needs a breaking change stops that part of the work, writes the proposal in its PR description, and works around it. The integration cycle decides.
4. Adding a union member (a new command or event) in a wave: add it in the contracts file in its own commit, so merges are trivial.

## Registries, not edits

To keep parallel PRs from colliding, every extensible list is a registry with one line per entry:

- commands: `packages/sim/src/commands/index.ts`
- systems: `packages/sim/src/systems/index.ts`
- content: `packages/content/src/index.ts`
- render layers: `apps/client/src/render/layers/index.ts`
- tools: `apps/client/src/input/tools/index.ts`
- lens toolbars: `apps/client/src/ui/lenses.ts`
- panels: `apps/client/src/ui/panels/index.ts`
- art kits: `packages/art/src/kits/index.ts`

Keep registry entries sorted alphabetically: two PRs adding different lines then merge cleanly in almost every case.

## Branches and pull requests

- `main` is always green and deployable.
- Branch per cycle: `cycle/<id>-<slug>`, for example `cycle/02b-render-kit`.
- Rebase or merge `main` into your branch before opening the PR and again if `main` moves. Run the full checks after.
- PR title: `C2B: render and art kit`. Body: what changed, how to try it, screenshots, bench numbers, contract additions, edits outside owned paths, follow-ups.
- Merge order inside a wave does not matter; the second PR resolves conflicts against `main`.
- Who merges: the human, or the integration cycle. Wave PRs may also be merged as they turn green, if their brief says so.

## Integration cycles

An integration cycle (C2X, C3X, ...):

1. Merges the wave's PRs in a sensible order, resolving conflicts.
2. Runs everything: tests, e2e with two browsers, bench, a manual playthrough script.
3. Fixes integration bugs, removes duplicated helpers, tunes numbers against the spec.
4. Deploys (if credentials exist) and prepares the playtest notes file.
5. Updates the spec where reality differs, and the cycle board.
6. Writes the next iteration's briefs (C3X writes the I2 briefs from `30-roadmap.md` and the playtest).

## How to run a cycle

Requirements: a shell with git and Node 22+, network access to GitHub and the npm registry, push access to the repo. A browser (Playwright's Chromium) is needed for e2e and screenshots. If an environment lacks something, the agent says so in its PR and does what it can.

Kickoff prompt (paste into a Cowork or Claude Code session, changing the cycle id):

```
You are a developer on City Qoti, a cozy two-player town builder for the browser.
Repository: github.com/evglissin-hue/city-qoti
1. Clone the repo (or update your copy) and check out main.
2. Read CLAUDE.md, then docs/build/cycle-02b-render-kit.md. Read only the other docs that brief lists.
3. Create the branch named in the brief, do the work, and commit in small steps.
4. When every acceptance criterion passes, push and open a PR into main as the brief describes.
5. Report back: the PR link, what passed, bench numbers, and anything you could not do.
```

## Writing a brief

Use `docs/build/_template.md`: goal, read list (as short as possible), owned paths, inputs it can rely on, tasks, acceptance criteria, out of scope, notes. A good brief fits in about two pages and links to spec sections instead of copying them.
