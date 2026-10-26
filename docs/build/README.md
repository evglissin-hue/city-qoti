# Build board

One row per cycle. A cycle is one agent session working from one brief on one branch, ending in one PR into `main`. How cycles work: `docs/spec/31-parallel-development.md`.

| Cycle | Iteration | Wave | Brief | Depends on | Status |
|---|---|---|---|---|---|
| C1 Foundation | I0 | serial | `cycle-01-foundation.md` | none | PR open ([#1](https://github.com/evglissin-hue/city-qoti/pull/1)) |
| C2A World and sim | I0 | parallel | `cycle-02a-world-sim.md` | C1 | waiting |
| C2B Render and art kit | I0 | parallel | `cycle-02b-render-kit.md` | C1 | waiting |
| C2C Co-op and saves | I0 | parallel | `cycle-02c-coop-saves.md` | C1 | waiting |
| C2D Client UX | I0 | parallel | `cycle-02d-client-ux.md` | C1 | waiting |
| C2X I0 integration | I0 | integration | `cycle-02x-integration.md` | C2A to C2D | waiting |
| C3.0 Hamlet contracts | I1 | serial | `cycle-03-0-hamlet-contracts.md` | C2X | waiting |
| C3A Residents | I1 | parallel | `cycle-03a-residents.md` | C3.0 | waiting |
| C3B Hearth v1 | I1 | parallel | `cycle-03b-hearth-v1.md` | C3.0 | waiting |
| C3C Ledger v1 | I1 | parallel | `cycle-03c-ledger-v1.md` | C3.0 | waiting |
| C3D Hamlet art and rendering | I1 | parallel | `cycle-03d-hamlet-art.md` | C3.0 | waiting |
| C3E Hamlet UI | I1 | parallel | `cycle-03e-hamlet-ui.md` | C3.0 | waiting |
| C3X I1 integration and I2 planning | I1 | integration | `cycle-03x-integration.md` | C3A to C3E | waiting |
| C4.0 onward | I2 | | written by C3X | C3X | |

Status values: waiting (dependencies not merged), ready, in progress (add the session link), PR open (add the PR link), merged.

## Starting a cycle

Paste the kickoff prompt from `docs/spec/31-parallel-development.md` into a new Cowork or Claude Code session, with the cycle's brief file name. For a parallel wave, start one session per brief at the same time once the wave's dependency is merged.
