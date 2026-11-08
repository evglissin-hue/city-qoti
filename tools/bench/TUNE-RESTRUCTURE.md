# Autoplayer restructure (C5.0, task 11): before and after

The two I2 players (`Players`, `Together`, `VillagePlayer`) became one planner (`src/planner.ts`: one build queue, one labor budget, one money reserve) fed by advisors in `src/advisors/` (charter, hamlet, hearth, money, street, together, village). The acceptance: the same tune output for willow and hazel.

## Switches

- `TUNE_POST=1` did nothing since C4C's Trading Post landed (`standInPost` only lends the tag while content has no post): its output equaled the run without it, byte for byte, for both seeds, with and without `TUNE_VILLAGE`.
- The new default (no switches) **matches the old `TUNE_VILLAGE=1`** (and so `TUNE_POST=1 TUNE_VILLAGE=1`): `tune.ts` now always passes `village: true`. Both switches are retired. The old default without `TUNE_VILLAGE` is still reachable through `autoplay(seed, days)`, which the I1 and I2 tests call, and it is compared below.
- The year view is printed last, after everything the old run printed (table, street map, `TUNE_SAVE`, `TUNE_ACTIONS`), so the old output is an exact prefix of the new one.

## How it was compared

Before: the untouched `tools/bench` at `db1f7fe` (copied aside, with `node_modules/@qoti/*` pointing at this checkout's packages). After: this branch. The timing on the first line (`(41.2 s)`) is replaced by `(T s)` in both; everything else is raw stdout.

| Run (`npm run tune -w @qoti/bench ...`) | before | after |
|---|---|---|
| `90 willow` with `TUNE_ACTIONS=1 TUNE_VILLAGE=1` (old) / `TUNE_ACTIONS=1` (new) | 68,775 bytes, sha256 `6952e4225e611928` | same bytes, then the year view |
| `90 hazel`, same | 91,896 bytes, sha256 `9e8b5ae3b96df2de` | same bytes, then the year view |
| `12 willow` / `12 hazel` (`TUNE_VILLAGE=1` old, default new) | `8db3460ebd97ab6d` / `84dbe0d1c21707e0` | same |
| `40 <seed> standard 20` (granted Village on day 20, street map), both seeds | | identical |
| `60 <seed> standard - 45` (hands off from day 45), both seeds | | identical |

Also compared through `autoplay()` directly, table, action log and `hashState` of the final world, for both seeds: 90 days with no options (the I1/I2 player), 44 days with `standInPost`, 30 days with `hearth: false, together: false`, and 80 days with `village: true, handsOff: 70`. All eight identical.

The check (new output must start with the old one, and what follows must be the year view):

```
api-*-{plain,post,quiet,village}.txt (8 files): identical
willow|hazel-{12,40-vday20,60-handsoff,90}-village.txt (8 files): identical prefix
ALL MATCH
```

Day 90 of each seed, before and after:

```
day  pop hh vac coins food made eaten plank stone mood mis wish grant pat ach left lean built sites  cpl wed born sea story req plan | rank    charter        sav wage sale  tax trade owed bask wl tx crafts inv lots hom sh cr fa grw want+ grew+
 90  268 93   1   247  648  286   278   106    93   87   0    9    45   5  10    0   no   214     5   10  10   49   4    22  45   14 | village 0/0            1221  507  535  101   164   66   99  85 20     12   5   55  38  4  0  2   0  8010  0000   (willow)
 90  138 49   0  2147  287  148   152    42   616   92   0   10    43   5  10    0   no   117     5    8   8   23   2    22  14   10 | village 0/0            1799  319  216   32    45    0  100 100 10      0   5   33  19  2  0  0   0  5000  0000   (hazel)
```

## The year view

Until C5.0's state and the C5A to C5D systems fill it, every I3 column prints `-` (`src/yearRow.ts` reads `weather`, `festival`, `threats`, `raid` and `Household.warmth` through a local optional view; a frozen river marks the weather with `*`):

```
Year view
day  yr season    weather  cold stars threat     raid
  1   1 Spring 1  -           -     - -          -
  2   1 Spring 2  -           -     - -          -
```

## Tests

`npx vitest run tools/bench`: before 3 files, 12 tests passed; after 5 files, 16 tests passed (the 12 unchanged, plus the advisor registry and the year view).
