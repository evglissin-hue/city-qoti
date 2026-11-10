# V2 before numbers (scratch)

A scratch file for the V2.0 master to fold into `docs/build/v2-wave-notes.md`. Taken on 2026-11-10 on `cycle/v2-0-look-contracts` plus the V2.0 executor's commits (the grown village fixture, `__qoti.grownInfo()` and the two scripts; no rendering change, so the renderer draws exactly as `main` does).

How they were taken: headless Chromium in the build container, which has no GPU, so WebGL runs in SwiftShader (software). Draw calls and triangles are real; **every millisecond below, frame and GPU alike, is the CPU doing the GPU's work in SwiftShader**, good for ratios at best. The container is shared with other sessions, so even the ratios wobble. The owner's and Kat's laptops give the real timings (Measure this laptop).

## Scenes

- **hamlet**: the hamlet fixture (`?debug&fixture=hamlet`).
- **village**: the village fixture dressed by the dense village showcase (`villageShowcase(true)`, 140 buildings), the village of 130.
- **town**: `townShowcase()` (1,000 buildings, 4,000 decor, 2,000 trees, 2,000 synthetic residents).
- **winter**: the winter fixture.
- **grown**: `?debug&fixture=grown`, the village the bench's autoplayer grew (seed rowan, 60 days: 155 residents, 61 households, Village rank since day 32, 153 buildings of which 33 grew on lots, 875 decor including 157 lanterns, at least eight festivals held, renown level 3). Regrow it with `npm run fixture:grown -w @qoti/client`. Its high street (the middle of its six shop lots) is at about (145, 87) and the middle of its buildings at (137, 85).

## Shots

`QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5216 node apps/client/e2e/v2-shots.mjs before` (Medium, 1440 x 900, interface hidden, dynamic resolution off; stills in `docs/build/screenshots/v2-before-*.png`). Every scene pins its season's look and clear weather (`season=summer&day=3&weather=clear`, the winter fixture `season=winter&day=3&weather=clear`): unpinned, the hamlet fixture starts on the first morning of spring mid-thaw, so its day shot came out snowy and its night shot green, and the grown village starts an hour before autumn.

Read the draws and triangles here with care: they are the last frame drawn before the screenshot, and once a scene has settled that is often a still-cache frame, which draws only the moving layers over the cached picture (the hamlet's 12 draws and 2,500 triangles). They do not compare shot to shot; the perf tables below do.

| Scene | Shot | Draws | Triangles | Frame ms (CPU) | GPU ms |
|---|---|---|---|---|---|
| hamlet | day | 73 | 0.12 M | 4.4 | 2440.4 |
| hamlet | golden | 12 | 0.00 M | 4.1 | 1096.0 |
| hamlet | night | 12 | 0.00 M | 1.1 | 510.0 |
| hamlet | close | 7 | 0.00 M | 1.0 | 345.7 |
| village | wide | 153 | 0.34 M | 7.8 | 3150.5 |
| village | golden | 83 | 0.07 M | 1.7 | 2663.7 |
| village | night | 77 | 0.07 M | 2.2 | 859.8 |
| village | street | 69 | 0.06 M | 2.1 | 803.5 |
| town | wide | 122 | 0.49 M | 5.2 | 2043.7 |
| town | golden | 46 | 0.14 M | 4.6 | 1578.1 |
| town | night | 46 | 0.12 M | 1.7 | 608.8 |
| town | street | 29 | 0.07 M | 1.5 | 734.1 |
| winter | day | 86 | 0.09 M | 2.1 | 1406.9 |
| winter | night | 31 | 0.02 M | 1.5 | 702.7 |
| grown | wide | 37 | 0.05 M | 2.0 | 1472.6 |
| grown | golden | 62 | 0.06 M | 1.6 | 208.0 |
| grown | night | 55 | 0.05 M | 2.9 | 745.7 |
| grown | street | 43 | 0.05 M | 1.5 | 546.9 |

## Perf, Medium, sim paused

`QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5216 QOTI_FIXEDRES=1 QOTI_HOLD=1 QOTI_PRESETS=medium node apps/client/e2e/v2-perf.mjs` (about 10 minutes). 10 s moving (the scripted pan, orbit and zoom), 10 s idle, at each scene's default camera (the hamlet at 45 tiles, the village at 70, the town at 90, the grown village at 70 from the middle of its buildings). Draws and triangles are averages over the moving part.

headless (software renderer), lean engine, fixed resolution, sim paused, 1440 x 900, 10 s moving, 10 s idle:

| Scene | Preset | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|
| hamlet | medium | 1304.7 / 5099.8 | 1276.6 / 2846.1 | 3308.2 / 3683.2 | 3204.1 / 3664.0 | 71 | 0.27 M | 0 / 1 / 1, 1 |
| village | medium | 1613.9 / 4099.8 | 1590.6 / 4188.3 | 4049.8 / 4116.5 | 4012.5 / 4081.2 | 141 | 0.28 M | 0 / 1 / 1, 1 |
| town | medium | 408.3 / 683.4 | 406.6 / 573.7 | 3841.5 / 4083.1 | 3825.8 / 4059.2 | 97 | 0.31 M | 0 / 1 / 1, 1 |
| grown | medium | 1483.3 / 3716.6 | 1454.7 / 3692.6 | 3958.2 / 3983.2 | 3883.5 / 3934.5 | 128 | 0.40 M | 0 / 2 / 0, 2 |

In the idle 10 s a software frame takes about four seconds, so the rest holds only one or two frames (the last column): the idle columns are one frame's cost, the cache's first still render, not an idle average.

## Perf, every preset, sim running

`QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5216 QOTI_FIXEDRES=1 node apps/client/e2e/v2-perf.mjs` (22 minutes, 19:59 to 20:21). The same cameras, each preset in turn, with the sim running at speed 1.

headless (software renderer), lean engine, fixed resolution, 1440 x 900, 10 s moving, 10 s idle:

| Scene | Preset | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|
| hamlet | low | 945.0 / 2516.6 | 877.4 / 1013.5 | 975.0 / 1350.0 | 939.3 / 1268.3 | 72 | 0.05 M | 8 / 0 / 0, 2 |
| hamlet | medium | 2037.4 / 2983.1 | 1952.1 / 2867.5 | 2287.4 / 2466.6 | 2183.4 / 2355.0 | 75 | 0.21 M | 0 / 3 / 1, 3 |
| hamlet | high | 3416.5 / 3649.8 | 3305.7 / 3519.7 | 3649.9 / 3799.9 | 3539.4 / 3676.0 | 91 | 0.78 M | 0 / 2 / 0, 2 |
| hamlet | ultra | 0.0 / 0.0 | n/a / n/a | 2241.6 / 5816.5 | 3145.1 / 6229.8 | 0 | 0.00 M | 0 / 2 / 2, 2 |
| village | low | 1283.3 / 1549.9 | 1139.4 / 1267.6 | 2029.1 / 2349.8 | 1970.2 / 2333.8 | 119 | 0.22 M | 4 / 0 / 0, 3 |
| village | medium | 2395.8 / 3283.3 | 3092.6 / 3247.4 | 3383.1 / 3383.1 | 3421.2 / 3637.6 | 190 | 0.34 M | 0 / 1 / 0, 1 |
| village | high | 4608.1 / 4683.1 | 4548.6 / 4563.1 | 4058.1 / 4816.4 | 3949.0 / 4742.6 | 224 | 1.99 M | 0 / 2 / 0, 2 |
| village | ultra | 0.0 / 0.0 | n/a / n/a | 3299.9 / 8982.9 | 3322.4 / 9207.0 | 0 | 0.00 M | 0 / 1 / 2, 1 |
| town | low | 1454.2 / 1683.3 | 1388.0 / 1564.0 | 1696.6 / 2749.8 | 1674.9 / 1868.9 | 83 | 0.31 M | 5 / 0 / 0, 1 |
| town | medium | 0.0 / 0.0 | n/a / n/a | 1644.4 / 3899.9 | 1580.1 / 3869.5 | 0 | 0.00 M | 0 / 2 / 4, 2 |
| town | high | 3458.2 / 6883.1 | n/a / n/a | 7233.1 / 7233.1 | 7183.3 / 7183.3 | 88 | 0.68 M | 0 / 1 / 0, 1 |
| town | ultra | 0.0 / 0.0 | n/a / n/a | 0.0 / 0.0 | n/a / n/a | 0 | 0.00 M | 0 / 0 / 0, 0 |
| grown | low | 1261.8 / 1866.5 | 1383.8 / 1833.3 | 1696.6 / 3299.8 | 1666.2 / 1784.1 | 112 | 0.26 M | 5 / 0 / 0, 5 |
| grown | medium | 3424.9 / 6816.4 | n/a / n/a | 3758.2 / 4366.5 | 3702.3 / 4296.7 | 183 | 0.56 M | 0 / 2 / 0, 2 |
| grown | high | 5799.8 / 5799.8 | 5795.6 / 5968.6 | 5649.7 / 5649.7 | 5567.7 / 5567.7 | 213 | 2.05 M | 0 / 1 / 0, 1 |
| grown | ultra | 33.3 / 33.3 | n/a / n/a | 7633.1 / 7633.1 | 6664.8 / 7605.8 | 54 | 0.07 M | 0 / 1 / 0, 1 |

The zeros are not fast frames: when one software frame takes longer than the part being measured, the part records no frame (0.0 ms, n/a, 0 draws), as on Ultra moving in most scenes, the town's Medium moving and every part of the town on Ultra. The grown village's Ultra moving row (33.3 ms, 54 draws, 0.07 M) is a single partial frame and means nothing. The rows that do compare: draws and triangles where a moving frame was recorded, and Low, where frames are short enough to count several.

## What the before set says, for the wave

- **The grown village is the heaviest of the four on Medium**: 183 draws and 0.56 M triangles moving with the sim running (the village of 130: 190 and 0.34 M), 128 draws and 0.40 M with the sim paused, and 213 draws and 2.05 M on High. Its 875 decor (157 lanterns, 165 cherry trees, 483 planters and flower beds) and 8,250 trees are real, not a showcase, so it is the scene to judge V2's night lighting and green by.
- **Draw calls fit everywhere measured**: at most 224 (the village on High; budget 450) and 190 on Medium (budget 300).
- **Night matters most**: in the night shots today's light is lit windows, the street lamps' pools and a lantern's glow on the ground at a few spots (the grown village's 157 lanterns light almost nothing around them); these are the light map's first writers.
- **One number to distrust**: the town's paused Medium moving average (408 ms) is far below every other scene's; with frames this slow it likely counts a few cheap frames during the camera path, not a lighter town.
- **Software timings are not budgets**: a Medium frame takes 1.3 to 4 s here; the laptops' tables decide.
