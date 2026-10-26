# Build board

One row per cycle. A cycle is one agent session working from one brief on one branch, ending in one PR into `main`. I1 ran as C3.0 then six parallel agents (C3D split into world look and hamlet art), merged and tuned in C3X on one branch. Wave 2 of I0 ran as six parallel agents (C2B and C2D were each split in two) and landed as one integration PR stacked on #1. How cycles work: `docs/spec/31-parallel-development.md`.

| Cycle | Iteration | Wave | Brief | Depends on | Status |
|---|---|---|---|---|---|
| C1 Foundation | I0 | serial | `cycle-01-foundation.md` | none | PR open ([#1](https://github.com/evglissin-hue/city-qoti/pull/1)) |
| C2A World and sim | I0 | parallel | `cycle-02a-world-sim.md` | C1 | PR open ([#2](https://github.com/evglissin-hue/city-qoti/pull/2)), partial: remainder listed in the PR |
| C2B Render and art kit | I0 | parallel | `cycle-02b-render-kit.md` | C1 | PR open ([#2](https://github.com/evglissin-hue/city-qoti/pull/2)), partial: remainder listed in the PR |
| C2C Co-op and saves | I0 | parallel | `cycle-02c-coop-saves.md` | C1 | PR open ([#2](https://github.com/evglissin-hue/city-qoti/pull/2)), partial: remainder listed in the PR |
| C2D Client UX | I0 | parallel | `cycle-02d-client-ux.md` | C1 | PR open ([#2](https://github.com/evglissin-hue/city-qoti/pull/2)), partial: remainder listed in the PR |
| C2X I0 integration | I0 | integration | `cycle-02x-integration.md` | C2A to C2D | PR open ([#2](https://github.com/evglissin-hue/city-qoti/pull/2)); deploy, the 30-minute session and the I1 brief review remain |
| C3.0 Hamlet contracts | I1 | serial | `cycle-03-0-hamlet-contracts.md` | C2X | merged into the C3X branch |
| C3A Residents | I1 | parallel | `cycle-03a-residents.md` | C3.0 | merged into the C3X branch |
| C3B Hearth v1 | I1 | parallel | `cycle-03b-hearth-v1.md` | C3.0 | merged into the C3X branch |
| C3C Ledger v1 | I1 | parallel | `cycle-03c-ledger-v1.md` | C3.0 | merged into the C3X branch |
| C3D Hamlet art and rendering | I1 | parallel | `cycle-03d-hamlet-art.md` | C3.0 | merged into the C3X branch (split in two: world look, hamlet art) |
| C3E Hamlet UI | I1 | parallel | `cycle-03e-hamlet-ui.md` | C3.0 | merged into the C3X branch |
| C3X I1 integration and I2 planning | I1 | integration | `cycle-03x-integration.md` | C3A to C3E | done on `ccr-7441f212-64lp1y`; deploy and the playtest evening remain |
| C4.0 Village contracts | I2 | serial | `cycle-04-0-village-contracts.md` | C3X | done on `cycle/04-0-village-contracts`; wave notes in `i2-wave-notes.md` |
| C4A Market and money | I2 | parallel | `cycle-04a-market-money.md` | C4.0 | waiting |
| C4B Growth | I2 | parallel | `cycle-04b-growth.md` | C4.0 | waiting |
| C4C Village chains, services and tiers | I2 | parallel | `cycle-04c-village-chains.md` | C4.0 | waiting |
| C4D Lives, story characters and co-op tools | I2 | parallel | `cycle-04d-lives-and-coop.md` | C4.0 | waiting |
| C4E Village art and rendering | I2 | parallel | `cycle-04e-village-art.md` | C4.0 | done on `cycle/04e-village-art`, waiting for C4X |
| C4F Village UI | I2 | parallel | `cycle-04f-village-ui.md` | C4.0 | waiting |
| C4X I2 integration and I3 planning | I2 | integration | `cycle-04x-integration.md` | C4A to C4F | waiting |

Status values: waiting (dependencies not merged), ready, in progress (add the session link), PR open (add the PR link), merged.

## Starting a cycle

Paste the kickoff prompt from `docs/spec/31-parallel-development.md` into a new Cowork or Claude Code session, with the cycle's brief file name. For a parallel wave, start one session per brief at the same time once the wave's dependency is merged.
