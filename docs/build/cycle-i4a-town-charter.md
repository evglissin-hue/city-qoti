# I4A: The Town Charter, its trial, Merchants and the era

**Iteration**: I4 Town, wave one. **Wave**: parallel. **Branch**: `cycle/i4a-town-charter`, from `cycle/i4x-integration`; PR into `cycle/i4x-integration`. **Recommended effort**: xhigh.
**Depends on**: I4.0. **Runs alongside**: I4B to I4H, V5A, V5B. **Ports**: client 5271, relay 8881.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

A grown Village can claim the Town Charter when its goals are met, and the County then sends a bandit gang to test it: a Medium raid at dusk on day 5 of the next season, telegraphed like any raid. Repelled, the Charter is sealed and the valley enters the Age of Steam: the Chronicle opens a chapter titled for it, `era.changed` goes to both seats, the Charter board lists what the era opens in both lanes, and from the next morning builders put up new buildings in the era. Failed, the trial comes round again next season and costs nothing beyond the raid's own losses. Households with the means move up to Merchants, who ask for more variety, a clinic and a school in reach, Watch cover and better evenings.

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (Rulings, File ownership I4A, Handshakes, the order of a day)
- `docs/spec/15-progression.md`: Ranks and Charters (Town; from the redesign; Eras; the rank-up moment; As built C5A, trials; Trials; The end of the Village chapter)
- `docs/spec/18-eras.md`: Rules, The era moment, Data
- `docs/spec/14-challenge.md`: Telegraphing, Raid resolution, As built (C5D), Difficulty dials
- `docs/spec/13-ledger.md`: Households, Population tiers; `docs/spec/19-evenings.md`: Good evenings (the tiers' evenings)
- `docs/spec/20-architecture.md`: I4 contracts (I4.0)

## You own

The I4A paths in the wave notes: `packages/sim/src/systems/charter/**`, `systems/trials/**`, `scheduleTrialRaid` in `systems/threats/api.ts` (only that), `systems/tiers/**`, `systems/services/**`, `systems/era/**`, `view/era.ts`, the Town lines of the Charter's view; content `charters.ts`, `era.ts`, the Merchants row in `baskets.ts` and the tier's wants, `townBuildings.ts`; tests `packages/sim/test/i4a/**`.

## You can rely on

- I4.0: `WorldState.era` and `eraSince`, `Building.era` set at a site's creation, `EraView`, `era.changed`, `eraLookOf`, the Town Charter's content with its goals, trial and unlocks (the claim held shut by a stand-in), the `raid` trial kind's slot, `merchantsMet` wired into tiers, the clinic's def, the counts the goals read.
- C5A's trials machinery (`TRIAL_KINDS`, open, measure, judge, seal; the letter, the Chronicle page, renown); C5D's raids (schedule, telegraph, resolution, the result card, repelled and held); C4D's claim and rank-up moment; R1A's baskets and tiers by amount and variety; R2B's evenings need; R3E's variety check (`tools/bench/src/variety.ts`).

## Tasks

1. **The claim**: the Town Charter claimable once its goals hold (the stand-in's claim opens), the rank-up moment as C4D's (the proclamation, a mood lift, `rank.up`). The Village chapter card loses its "the Town Charter comes in a later update" line and leads to the Town Charter instead.
2. **The raid trial** (a `raid` row in `TRIAL_KINDS`): announced at the claim for day 5 of the next season (`15-progression.md`, Trials; the kind's season is "the next one", I4.0's additive field), the raid booked through `scheduleTrialRaid` as a Medium band (C5D's sizes, x1.5 on Fierce as any raid), telegraphed two days ahead with its side and band, resolved by C5D's rules. Judged the next morning: repelled (C5D's meaning: nothing stolen, or more raiders turned back than got away) seals the Charter; otherwise it returns next season and takes nothing more. Proposed (R3X draft): a trial raid resets pressure as a raid does and is the season's one raid.
3. **The seal and the era moment** (the sim's half, `18-eras.md`): `era` turns to `steam`, `eraSince` is today, `era.changed` with `EraView` (what the era opens: the palette, the Steam Engine's row, districts' Steam styles, Merchants), a Chronicle chapter page titled "The Age of Steam" (words in `era.ts`), the County letter, the trial's renown. Village and Market Town keep their era (`18-eras.md`). New sites take the era from the next site created; nothing already standing changes.
4. **Merchants** (`13-ledger.md`, Population tiers): `merchantsMet` from amount, variety (Food 5, Wares 3, Treats 3 against what the household saw in three days), evenings of 65, a school and a clinic in reach, Watch cover, and savings; up after three days running, down after four failing, as built for Craftsfolk; the upgrade's materials as a site (R1X: home upgrades are sites). The home's Next tier line says what is missing in words.
5. **The clinic** (a Town unlock): a service with a reach and capacity, numbers in `townBuildings.ts`; its cover counts for Merchants.
6. **The goals in the new terms**: each Charter goal measured by a count, with the master and pages (R3) on the board; the Charter view's Town lines and the trial's view (for I4G).
7. **Tests**: the claim opens only with every goal met; the trial raid is booked for day 5 of the next season, telegraphed, and seals the Charter when repelled; a failed trial returns and changes nothing else; the era turns once, on the seal, and `Building.era` of sites created after it is `steam` while every older building stays `old`; a Merchants household moves up and slides back as specified; a seat joining mid-trial reads its partner's trial and raid; a year with a sealed Town hashes the same twice; the Town Charter's feat (if the master adds A Town Now) has a setup and leaves `PENDING`.

## Acceptance criteria

- [ ] `grep -rn "I4 stand-in (I4A)" packages apps tools --exclude-dir=dist` is empty.
- [ ] A headless run from a Town fixture (I4H's, or a scripted one) claims the Town, meets its trial raid on day 5 of the next season, seals on a repelled raid and turns the era once; with no Watch and no walls the trial fails and returns.
- [ ] Merchants households appear in a town that meets the wants and slide back when it stops; the home's line names what is missing.
- [ ] Every number is in content; a year hashes the same in Node and a browser worker; the lanes test passes on both profiles; typecheck, lint, unit tests and build pass.

## Out of scope

Drawing the era (V5A, V5B), the title card, the trial card and the Charter board on screen (I4G), steam works and smoke (I4B), restyling (I4C), the advisors that prepare for the trial (I4H), the bandit chief and the other threats (wave two).

## Notes

- Proposed (R3X draft): the trial is the Medium gang raid of `15-progression.md`; the bandit chief waits for wave two (the owner's call; the wave notes, For the owner to confirm, 3).
- Open: what the trial is on the Peaceful dial (no raids); proposed (R3X draft) for discussion only: a drill at dusk that always holds, so the era still turns. Settle with the master before building it.
- Open: whether a household moving up to Merchants needs glass for its upgrade (I4.0's call), and whether Merchants take skilled jobs only (`13-ledger.md`: "R1X tunes whether keepers and level 3 crews become skilled jobs").
- Open: "Watch cover" for a Merchants home (I4.0 settles; proposed, R3X draft: inside a Watch House's or watchtower's reach).
- The trial raid draws its side from the `threats` stream like any raid; nothing else in I4A rolls dice.
- The Town Charter's 40 Craftsfolk sits far above the Craftsfolk share R3 left (wave notes, Starting after R3X): measure the claim day with I4H's fixture and report it; tune the goals only with the master (I4X).
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
