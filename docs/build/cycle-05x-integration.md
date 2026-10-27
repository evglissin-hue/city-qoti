# C5X: I3 integration and I4 planning

**Iteration**: I3. **Wave**: integration. **Branch**: `cycle/05x-integration`.
**Depends on**: C5A to C5H open or merged. **Ports**: the defaults (5173 and 8787).

## Goal

Seasons and the Watch shipped and tuned: a Village gets through its first winter and its first raid in ordinary play without dead ends, both laptops play a full year on the live link, the playtest sheet is ready, and the I4 Town briefs are written.

## Read

- `CLAUDE.md`, `docs/spec/30-roadmap.md` (I3, I4), `docs/spec/31-parallel-development.md`, `docs/build/i3-wave-notes.md` (especially the stand-ins table and the decisions)
- The eight wave PRs, `docs/playtests/I2.md`, the C4X commits (what integration learned)

## You own

Everything, for merging, fixing and tuning, plus new briefs.

## Tasks

1. **Merge** the wave (sim tracks first, C5A before the others since everything reads the season; then C5E, C5F, C5G and C5H), re-running checks after each. Expect cross-track test assumptions to break once real systems run together (the bell over the festival, drought and pollinators on one farm, the Watch taking workers from a bakery in winter); isolate unit tests with `withoutSystems` and fix behavior where the combination exposes a real gap.
2. **Remove every stand-in** listed in the wave notes, and say in the PR which remain and why.
3. **Tune with the autoplayer** (`npm run tune -w @qoti/bench`), one coherent player with every system on, seeds willow, hazel and two more: from founding through two years. Targets: a Village in about two to three evenings as in I2; every winter eaten through on stored food; no cold household in any winter after the first Village one (the trial weathered first time on most seeds); every season with a festival and a 3-star one in the first Village year; the first raid telegraphed and repelled or with modest losses, recovered within a season; 10+ Field Guide species in the first Village year; no famine, deadlock, labor starvation, lean-time spiral or treasury that trends down across a year; the money invariant across the whole run. Look for dead ends on purpose (a late farm, a lost storehouse, a frozen water sawmill, a raid on the only food store, a Village with no exports) and fix each one you find. Record the final values in the spec.
4. **Play** two browsers for a full year (four seasons, compressed with speed), with a festival, a flood or cold snap, a raid at dusk and the winter trial; fix what feels wrong, with special attention to the playtest flags (floaty walking, Retina performance, plain menus, half-lit lanterns) under snow, crowds and raids.
5. **Ship**: merge into `main`; merges deploy automatically through Cloudflare Workers Builds, so check the live URL serves the new build (`/version.json`), that an I2 valley loads and migrates, and that image upload works online. Write `docs/playtests/I3.md` (the template from `22-quality.md` plus an evening plan: plan the Winter Hearth Feast, stockpile firewood, meet a raid at dusk, find ten species).
6. **Docs**: the I3 acceptance list in `30-roadmap.md` checked with evidence (an "As built (C5X)" block like I1's), the spec updated where reality differs, the board, the changelog.
7. **I4 briefs** from `30-roadmap.md` (I4 scope) and the playtest: a contracts cycle and parallel tracks, for example Town Charter and the bandit raid trial with the Merchants tier; districts, policies and styles; contracts, Port Amberly, canals and barges; parcels, expansion and Watch expeditions (camps, dens, the great owl, river raiders, the bandit chief); the block builder and landmarks; Town art; Town UI. Carry the I1 to I3 integration lessons into their Notes.

## Acceptance criteria

- [ ] All I3 acceptance criteria in `30-roadmap.md` checked with evidence (tune output, tests, screenshots, bench numbers).
- [ ] CI green on `main`; the live URL serves the I3 build; remaining human steps in the PR.
- [ ] `docs/playtests/I3.md`, I4 briefs and an updated board committed.

## Proposed I3 acceptance (C5.0 copies it into `30-roadmap.md`)

- A Village prepares for and gets through its first winter: everyone fed on stored food, everyone warm, the trial weathered; unprepared, some are cold and a few leave, and nothing worse.
- Every season ends in a planned festival whose stars follow its site, menu, music and twist; a 5-star festival is reachable.
- Every raid is telegraphed with time to prepare; defenses, lanterns and the Watch visibly change its outcome; nobody is hurt and every loss can be rebuilt; captured bandits can join the town.
- About 30 species can be found; the Field Guide fills for both seats; bees and songbirds change yields.
- Weather and events (flood, drought, early frost, cold snap, circus) are forecast and felt in both lanes.
- Renown, commissions, the River Dock, modules, photo mode and Chronicle pictures work; the 6 new patterns and 5 new achievements can be earned.
- Each lane has seasonal work and needs the other (festival supplies, winter stock, walls dressed for charm, morale from festivals).
- Music follows the hour and the season, ambience follows the camera, and every recording is CC0 and credited.
- A new standard valley's first days are guided for both lanes, and the guide can be hidden by either player.
- Benches within budget at Village scale in winter, during a festival and during a raid; hashes match over a full year, including a raid, in Node and a browser worker.

## Notes

- Lessons from I1 and I2 integration: unit tests that assumed other systems were absent broke on merge; four tracks' autoplayer logic overbuilt and starved labor; dead ends (a Trading Post needing bricks before the kiln, upkeep draining a Village with no external income) surfaced only here. Budget the time for them.
