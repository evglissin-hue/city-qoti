# Build board

One row per cycle. A cycle is one agent session working from one brief on one branch, ending in one PR into `main`. I1 ran as C3.0 then six parallel agents (C3D split into world look and hamlet art), merged and tuned in C3X on one branch. Wave 2 of I0 ran as six parallel agents (C2B and C2D were each split in two) and landed as one integration PR stacked on #1. The visual overhaul runs as V iterations between the gameplay ones (`docs/spec/30-roadmap.md`, Visual overhaul); V1 runs beside the I3 wave. How cycles work: `docs/spec/31-parallel-development.md`.

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
| C5.0 Seasons contracts | I3 | serial | `cycle-05-0-seasons-contracts.md` | C4X | done on `claude/epic-hawking-e32pnd`; wave notes in `i3-wave-notes.md` |
| C5A Seasons, weather and the first winter | I3 | parallel | `cycle-05a-seasons-weather.md` | C5.0 | merged into `main` (built on `claude/stoic-gauss-cshmwm`, finished on `claude/great-rubin-8f16hk`; see As built in the brief) |
| C5B Festivals, renown, commissions and the River Dock | I3 | parallel | `cycle-05b-festivals-renown.md` | C5.0 | merged into `main` by C5X part 1 (#19) |
| C5C Nature, the Field Guide and Hearth craft | I3 | parallel | `cycle-05c-nature-field-guide.md` | C5.0 | merged into `main` by C5X part 1 (#20) |
| C5D Threats, defenses and the Watch | I3 | parallel | `cycle-05d-threats-watch.md` | C5.0 | merged into `main` by C5X part 1 (#17) |
| C5E Seasons art and rendering | I3 | parallel | `cycle-05e-seasons-art.md` | C5.0, V1X | done in two slices: seasons, weather, critters, figures, overlays and photo mode (first); defenses with damage and mending, festival art and fireworks, the new buildings and modules, flood water, breath and winter smoke, telegraph signs and the gallery's seasonal trees (part 2); what is left for the laptops is in the brief's As built |
| C5F Seasons UI | I3 | parallel | `cycle-05f-seasons-ui.md` | C5.0 | merged into `main` by C5X part 1 (#15); screenshots `c5f-*` |
| C5G Music and sound | I3 | parallel | `cycle-05g-audio.md` | C5.0 | done on `claude/epic-hawking-e32pnd`, synthesized (see As built in the brief) |
| C5H The first days guide | I3 | parallel | `cycle-05h-first-days.md` | C5.0 | merged into `main` by C5X part 1 (#18) |
| C5X I3 integration and I4 planning | I3 | integration | `cycle-05x-integration.md` | C5A to C5H | merged: part 1 (#22) merged and tuned the gameplay wave; part 2 tuned the economy, winter and festivals, fixed the dead ends, removed the stand-ins and shipped I3 (see As built in the brief). The I4 briefs wait for P1; the playtest evening (`docs/playtests/I3.md`) and laptop numbers remain |
| P1 Quality audit and polish | I3 to I4 | serial | `cycle-p1-polish.md` | C5X | merged into `main` ([evglissin-hue/city-qoti#28](https://github.com/evglissin-hue/city-qoti/pull/28)): the owner's 19 playtest items fixed or sliced, the build and review loop with its dead-end hunt, the playability audit (see As built in the brief) |
| V0 Concept and direction | V0 | serial | none (this session) | none | done on `claude/compassionate-dirac-9c0pyz`: B (Painted Miniature) picked by the owner and Kat; concept viewer on the lean renderer (`docs/concepts/v0-look/index.html`, first engine `v1-engine.html`), stills `v0-*`, `18-eras.md`, budgets by preset, the V1 briefs |
| V1.0 Look contracts | V1 | serial | `cycle-v1-0-look-contracts.md` | V0 merged | done (https://github.com/evglissin-hue/city-qoti/pull/12): surface ids, palette 2.0, the pattern array, `Era`, static and moving layers, Ultra, the GPU timer, the `material.ts` and `look.ts` split, the town showcase, the shots and perf scripts and the before numbers (`v1-wave-notes.md`) |
| V1A Materials and light | V1 | parallel | `cycle-v1a-materials-light.md` | V1.0 | merged in V1X (#14) |
| V1B Buildings detail | V1 | parallel | `cycle-v1b-buildings-detail.md` | V1.0 | merged in V1X (#16) |
| V1C Ground, water and nature | V1 | parallel | `cycle-v1c-ground-nature.md` | V1.0 | merged in V1X (#13) |
| V1D Lean renderer | V1 | parallel | `cycle-v1d-lean-renderer.md` | V1.0 | done, pushed to `main` at the owner's request (no PR): the lean frame graph, the still-frame cache, cached shadows, levels for buildings and decor, moving-only dynamic resolution, every preset field; laptop timings remain (see As built in the brief) |
| V1X V1 integration | V1 | integration | `cycle-v1x-integration.md` | V1A to V1D | merged: V1A to V1C on V1D, the resting redraws fixed, the classic chain retired, sun and night tuned, shots and software numbers; laptop perf runs and the playtest evening left for humans |

Status values: waiting (dependencies not merged), ready, in progress (add the session link), PR open (add the PR link), merged.

## Starting a cycle

Paste the kickoff prompt from `docs/spec/31-parallel-development.md` into a new Cowork or Claude Code session, with the cycle's brief file name. For a parallel wave, start one session per brief at the same time once the wave's dependency is merged.
