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
| C4A Market and money | I2 | parallel | `cycle-04a-market-money.md` | C4.0 | done on `cycle/04a-market-money` (merged by C4X) |
| C4B Growth | I2 | parallel | `cycle-04b-growth.md` | C4.0 | done on `cycle/04b-growth` (merged by C4X) |
| C4C Village chains, services and tiers | I2 | parallel | `cycle-04c-village-chains.md` | C4.0 | done on `cycle/04c-village-chains` (merged locally by C4X) |
| C4D Lives, story characters and co-op tools | I2 | parallel | `cycle-04d-lives-and-coop.md` | C4.0 | done on `cycle/04d-lives-coop` (merged locally by C4X) |
| C4E Village art and rendering | I2 | parallel | `cycle-04e-village-art.md` | C4.0 | done on `cycle/04e-village-art` (merged locally by C4X) |
| C4F Village UI | I2 | parallel | `cycle-04f-village-ui.md` | C4.0 | done on `cycle/04f-village-ui` (merged locally by C4X); screenshots `c4f-*` |
| C4X I2 integration and I3 planning | I2 | integration | `cycle-04x-integration.md` | C4A to C4F | done on `ccr-7441f212-64lp1y`; playtest sheet `docs/playtests/I2.md` |
| C4P Roads and folk polish | I2 polish | alongside C5.0 | `cycle-04p-polish.md` | C4X | done on `claude/epic-hawking-e32pnd` (stairs, roads, folk looks and motions; screenshots `c4p-*`) |
| C5.0 Seasons contracts | I3 | serial | `cycle-05-0-seasons-contracts.md` | C4X | ready (C4X is merged) |
| C5A Seasons, weather and the first winter | I3 | parallel | `cycle-05a-seasons-weather.md` | C5.0 | waiting |
| C5B Festivals, renown, commissions and the River Dock | I3 | parallel | `cycle-05b-festivals-renown.md` | C5.0 | waiting |
| C5C Nature, the Field Guide and Hearth craft | I3 | parallel | `cycle-05c-nature-field-guide.md` | C5.0 | waiting |
| C5D Threats, defenses and the Watch | I3 | parallel | `cycle-05d-threats-watch.md` | C5.0 | waiting |
| C5E Seasons art and rendering | I3 | parallel | `cycle-05e-seasons-art.md` | C5.0 | waiting |
| C5F Seasons UI | I3 | parallel | `cycle-05f-seasons-ui.md` | C5.0 | waiting |
| C5G Music and sound | I3 | parallel | `cycle-05g-audio.md` | C5.0 | waiting |
| C5H The first days guide | I3 | parallel | `cycle-05h-first-days.md` | C5.0 | waiting |
| C5X I3 integration and I4 planning | I3 | integration | `cycle-05x-integration.md` | C5A to C5H | waiting |

Status values: waiting (dependencies not merged), ready, in progress (add the session link), PR open (add the PR link), merged.

## Starting a cycle

Paste the kickoff prompt from `docs/spec/31-parallel-development.md` into a new Cowork or Claude Code session, with the cycle's brief file name. For a parallel wave, start one session per brief at the same time once the wave's dependency is merged.
