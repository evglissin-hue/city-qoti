# 22. Quality

## Performance budgets

Acceptance criteria for every cycle that touches the area. Reference machines: a laptop with integrated graphics (Intel Iris Xe class or Apple M1), 8 GB RAM, latest Chrome, Edge, Firefox or Safari (P50).

| Metric | Budget |
|---|---|
| Frame rate | 60 fps at 1080p on Medium on the weaker laptop with a City-scale scene while the camera moves; 30 fps floor on Low on older machines |
| GPU frame time | 12 ms or less on Medium on the weaker laptop, measured with `EXT_disjoint_timer_query_webgl2` where the browser offers it, else frame time minus main thread time; shown in the `?debug` overlay [V1] |
| Idle frame [V1] | GPU frame time 4 ms or less on Medium on the weaker laptop while the camera rests and residents move (the still-frame cache, `20-architecture.md`, Lean renderer) |
| Main thread frame time | 12 ms or less on average (render, UI, mirror) |
| Draw calls | Low and Medium 300; High and Ultra 450 |
| Triangles on screen | Low 1.5 M; Medium 3 M; High 6 M; Ultra 12 M *(tune: confirm on both laptops with the V0 concept viewer's readout)* |
| Sim tick (worker) | I0: 1 ms; I1 40-resident hamlet: 0.5 ms; with 2,000 residents: 4 ms average, 12 ms worst |
| World generation | 300 ms in Node |
| Chunk rebuild | 4 ms each, at most 2 per frame |
| Catch-up | 300 turns at 3x in 1.5 s |
| Snapshot | 2 MB gzipped at City scale; serialize in 150 ms |
| State hash | 30 ms |
| Memory | Low and Medium 800 MB per tab; High and Ultra 1.5 GB |
| Load | interactive in 5 s cold, 2 s warm; initial JS 1.5 MB gzipped |
| Input | ghost follows the cursor within 1 frame; online command visible within 250 ms |

**Why these numbers (V0, 2026-11-01)**: v1's 1.5 M triangles and 300 draws were a guess made before anything was measured, and a village of 130 already draws 0.8 to 1.15 M triangles (`30-roadmap.md`, I2 As built). On integrated graphics fill rate costs more than triangles: post passes, shadow map size, overdraw and the pixel ratio decide the frame long before geometry does. So the frame rate and the GPU frame time on the weaker laptop are the real criteria, triangles are a guide, and detail is spent where the camera is (levels of detail near, impostors far away). Draw calls stay low because each costs main thread time; more detail comes from batching and instancing, never from more calls.

**Moving and idle frames (V1)**: the render budgets above are measured on moving frames (V1.0's perf script pans, orbits and zooms across each scene); a frame with the camera at rest has its own row, because the lean renderer draws only the moving layers then. The V0 concept on its first engine ran at about 20 to 25 fps on High on the owner's laptop, which is what the lean renderer answers.

**As built (V1D, 2026-11-03)**: the lean renderer, measured so far only in a container without a GPU (headless Chromium in SwiftShader, 1440 x 900, Medium, `QOTI_FIXEDRES=1 QOTI_PRESETS=medium node apps/client/e2e/v1-perf.mjs`, both engines on the same build; `QOTI_ENGINE=classic` is the chain before V1D). Every millisecond is the CPU doing the GPU's work, and each 10 s phase holds only a few frames, so read them as ratios. Draws and triangles are real. The laptop rows (every budget above, moving and idle, on both laptops) are still to be taken with `QOTI_HEADED=1` or `await __qoti.perf()`.

| Scene | Engine | Moving GPU ms (avg) | Idle GPU ms (avg) | Draws (moving) | Triangles (moving) | Rest frames: moving / still / idle |
|---|---|---|---|---|---|---|
| hamlet | classic | 2280 | 3927 | 94 | 0.13 M | 2 / 0 / 0 |
| hamlet | lean | 959 | 575 | 68 | 0.10 M | 0 / 3 / 10 |
| hamlet | lean, sim paused | 868 | 325 | 66 | 0.10 M | 0 / 0 / 28 |
| village of 130 | classic | 4457 | 4495 | 225 | 0.88 M | 2 / 0 / 0 |
| village of 130 | lean | 1651 | 4386 | 159 | 0.66 M | 0 / 3 / 0 |
| town | classic | 5780 | 5033 | 176 | 1.26 M | 1 / 0 / 0 |
| town | lean | 1998 | 3075 | 108 | 0.64 M | 0 / 3 / 0 |
| town | lean, sim paused | 402 | 3189 | 91 | 0.43 M | 0 / 1 / 3 |

Moving frames cost the GPU 2.4 to 2.9 times less than the classic chain's on the same build (one scene pass, no full-resolution post passes, and the shadow map drawn only when due); held still (`QOTI_HOLD=1`), the town's moving frames skip the shadow pass altogether. An idle frame (the cache restored, the moving layers, the blur and the final pass) costs a twelfth of a classic frame in the hamlet. In the village and the town the software rest is still mostly still frames: a frame there takes seconds, so the sim moves dozens of turns between frames and something static (a stock pile, the sun's quarter-hour step, a building's level swap after the zoom) changes in nearly every one, which a laptop at 60 fps sees once in a hundred frames or more. Compared with V1.0's before table (which drew every frame at a lower dynamic resolution, so its milliseconds are not comparable), the town's moving triangles on Medium went from 2.66 M to 0.64 M. That run predates the building distance floor (`20-architecture.md`, Lean renderer, As built), so it drew buildings to 60 tiles on Medium; with the floor they go to 75 as before. The final shots (`v1-shots.mjs v1d`, stills `docs/build/screenshots/v1-v1d-*.png`): the town's camera pass went from 1.31 M to 0.58 M triangles in the wide shot, 1.47 M to 0.95 M at night and 1.18 M to 0.63 M in the street, almost all from decor culled per chunk and leveled (800 k to 62 k, 337 k and 256 k); its night frame, still frame and shadow pass included, from 3.46 M (over Medium's budget) to 2.47 M. The hamlet and the village of 130 draw what they drew (their big layers are trees and buildings, V1C's and V1B's). The shots' own draws and triangles columns now show the last frame drawn, which at rest is an idle one (a hamlet at dusk: 13 draws, a few thousand triangles), so compare per layer.

**As built (V1X, 2026-11-03)**: V1A, V1B and V1C merged on V1D, in the same container's software renderer (headless Chromium in SwiftShader, no GPU; milliseconds are the CPU doing the GPU's work, good for ratios only; draws and triangles are real). `QOTI_FIXEDRES=1 node apps/client/e2e/v1-perf.mjs`, every scene and preset, the sim running:

| town | ultra | 2187.4 / 3683.2 | 3166.8 / 3825.5 | 2304.1 / 2833.2 | 2261.4 / 2770.0 | 163 | 1.98 M | 0 / 3 / 1, 3 |
| Scene | Preset | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
| hamlet | low | 418.8 / 866.7 | 396.9 / 445.8 | 395.4 / 416.7 | 381.1 / 403.8 | 53 | 0.04 M | 22 / 0 / 0, 1 |
| hamlet | medium | 943.3 / 1100.0 | 910.2 / 1011.6 | 305.7 / 1083.2 | 288.5 / 1080.8 | 70 | 0.10 M | 0 / 2 / 27, 2 |
| hamlet | high | 791.6 / 1149.9 | 764.1 / 1091.6 | 240.7 / 1083.3 | 223.9 / 1035.1 | 66 | 0.14 M | 0 / 1 / 35, 1 |
| hamlet | ultra | 780.5 / 1066.6 | 840.0 / 2013.4 | 722.2 / 1850.0 | 633.6 / 1788.4 | 67 | 0.17 M | 0 / 3 / 9, 3 |
| village | low | 499.1 / 1216.7 | 497.8 / 619.1 | 1064.5 / 1399.9 | 1032.2 / 1358.9 | 105 | 0.20 M | 8 / 0 / 0, 3 |
| village | medium | 1319.0 / 1416.6 | 1279.8 / 1394.5 | 1603.3 / 2150.0 | 1559.5 / 2091.8 | 160 | 0.31 M | 0 / 3 / 2, 3 |
| village | high | 1713.3 / 1799.9 | 1666.7 / 1801.1 | 2404.1 / 2749.9 | 2376.6 / 2702.6 | 174 | 1.21 M | 0 / 4 / 0, 4 |
| village | ultra | 2074.9 / 6766.4 | 2086.1 / 3393.7 | 2722.1 / 3199.8 | 2704.7 / 3188.2 | 145 | 1.43 M | 0 / 2 / 1, 2 |
| town | low | 650.0 / 1783.3 | 623.5 / 771.9 | 600.0 / 1049.9 | 563.4 / 990.1 | 90 | 0.41 M | 15 / 0 / 0, 1 |
| town | medium | 1147.2 / 1666.6 | 1100.3 / 1615.7 | 1147.9 / 1550.0 | 1271.5 / 1520.0 | 122 | 0.58 M | 0 / 8 / 0, 8 |
| town | high | 2404.1 / 3416.5 | 2347.6 / 3353.8 | 1786.6 / 2249.9 | 1737.6 / 2231.5 | 135 | 1.27 M | 0 / 3 / 2, 3 |
| town | ultra | 2187.4 / 3683.2 | 3166.8 / 3825.5 | 2304.1 / 2833.2 | 2261.4 / 2770.0 | 163 | 1.98 M | 0 / 3 / 1, 3 |

The same on Medium with the sim held (`QOTI_HOLD=1`), which is what a laptop at 60 fps sees between the sun's quarter-hour steps:

| town | medium | 993.3 / 4433.1 | 1093.4 / 1707.3 | 434.8 / 1616.7 | 426.2 / 1598.9 | 116 | 0.37 M | 0 / 1 / 22, 1 |
| Scene | Preset | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
| hamlet | medium | 667.8 / 2199.8 | 660.5 / 944.5 | 183.3 / 966.5 | 177.9 / 914.9 | 62 | 0.09 M | 0 / 0 / 47, 0 |
| village | medium | 831.8 / 2400.0 | 821.7 / 1273.0 | 468.5 / 2183.3 | 459.6 / 2178.4 | 139 | 0.25 M | 0 / 0 / 18, 0 |
| town | medium | 993.3 / 4433.1 | 1093.4 / 1707.3 | 434.8 / 1616.7 | 426.2 / 1598.9 | 116 | 0.37 M | 0 / 1 / 22, 1 |

- **Budgets that can be read here hold**: at most 174 draws (the village on High; budget 450) and 160 on Medium (budget 300); Medium moves at 0.10 M (hamlet), 0.31 M (village) and 0.58 M (town) triangles against a 3 M budget, and Ultra's town at 1.98 M against 12 M. The town on Medium moved at 2.66 M before V1 (V1.0's table): V1D's decor culling, V1B's far levels and V1C's tree levels took it down 4.6 times while the near buildings gained their whole detail kit.
- **Resting**: with the sim held every rest frame is idle in all three scenes (V1C's run had the village at 7 still frames and no idle ones), and an idle frame costs a quarter to a half of a moving one in software (hamlet 178 ms against 660, village 460 against 822, town 426 against 1,093). With the sim running, a software frame spans over a second, so the sun's quarter-hour step (every 5 s of real time at 1x) and real changes (a site rising, a stock pile) still land in most rest frames; on a laptop at 60 fps that is one still frame in about 300. `__qoti.staticChanges()` shows what dropped the cache.
- **Not measured: every GPU millisecond on the laptops.** The acceptance rows (Medium within 12 ms moving and 4 ms idle on the weaker laptop, High at 60 fps moving on the stronger one) need `QOTI_HEADED=1 node apps/client/e2e/v1-perf.mjs` (or `await __qoti.perf()` in a `?debug` valley's console, scene by scene) on Kat's laptop and the owner's, plugged in with the battery frame cap off. That is the first human step left from V1X.

**Shots (V1X)**: `v1-shots.mjs after`, Medium, 1440 x 900, software renderer; stills `docs/build/screenshots/v1-after-*.png`, sheets with the concept and the before still beside them `v1x-compare-*.jpg`. Draws and triangles are the last frame drawn, which at rest is an idle frame (the moving layers over the still-frame cache), so they are far below V1.0's before table, which drew everything every frame; compare per layer below.

| Scene | Shot | Draws | Triangles (idle frame) | GPU ms (software) |
|---|---|---|---|---|
| hamlet | default | 7 | 0.00 M | 890 |
| hamlet | close | 3 | 0.00 M | 85 |
| hamlet | dusk | 12 | 0.00 M | 105 |
| hamlet | night | 12 | 0.00 M | 138 |
| village of 130 | wide | 148 | 0.34 M | 1454 |
| village of 130 | golden | 75 | 0.07 M | 1075 |
| village of 130 | night | 73 | 0.07 M | 150 |
| village of 130 | street | 67 | 0.06 M | 456 |
| town | wide | 117 | 0.49 M | 1543 |
| town | night | 45 | 0.14 M | 1314 |
| town | street | 29 | 0.08 M | 827 |
| winter | wide | 78 | 0.06 M | 1091 |

Camera pass triangles per layer (`QOTI_LAYERS=1`), against V1.0's before table: village wide 0.48 M to 0.22 M (trees 283 k to 89 k, buildings 77 k to 18 k); village street 0.45 M to 0.25 M (trees 220 k to 37 k); town wide 1.31 M to 0.28 M (decor 800 k to 62 k, buildings 335 k to 79 k); town night 1.47 M to 0.68 M; town street 1.18 M to 0.62 M (buildings 193 k to 162 k at the full near detail kit, decor 800 k to 256 k). The effects layer (smoke, sails) is a steady 32 k in every village and town shot.

`tools/bench` builds synthetic valleys (I0: 1,000 buildings and 6,000 decor; I1: a 40-resident hamlet; later a synthetic 2,000-resident town) and reports ms per tick, memory and snapshot size. CI fails when a sim or worldgen budget is exceeded.

**As built (C5E, 2026-11-03)**: seasons and weather on the V1 renderer, same container and method (`QOTI_HOLD=1 QOTI_FIXEDRES=1 QOTI_PRESETS=medium v1-perf.mjs village village-winter village-crowd raid`, Medium, 1440 x 900): the village of 130 draws 134 calls and 0.22 M triangles clear, 139 and 0.24 M in winter with snow falling, 145 and 0.24 M with 80 more folk about, and the raid fixture 48 and 0.07 M, all within Medium's budgets. In software the snowy village's idle frame costs about twice the clear one's (transparent snow is slow to rasterize on the CPU); the laptop numbers decide it (`cycle-05e-seasons-art.md`, As built).

**As built (C5E part 2, 2026-11-04)**: the I3 pieces drawn (defenses, festival art and fireworks, the new buildings and modules, flood water, telegraph signs), same container and method (`QOTI_HOLD=1 QOTI_FIXEDRES=1 QOTI_PRESETS=medium v1-perf.mjs village i3-pieces raid`): the village of 130 draws 129 calls and 0.20 M triangles, the raid fixture with its defenses 50 and 0.08 M, and the `i3-pieces` scene (every new piece, a festival, the circus, fireworks, a flood and omens) 67 and 0.14 M, all far within Medium's budgets. A resting valley with all of it on show reaches idle frames (`c5e-seasons.spec.ts`); the laptop timings are still to take (`cycle-05e-seasons-art.md`, As built part 2).

## The redesign: measuring first, then budgets [V2 to V4, R1 to R3]

Added 2026-11-10 with the redesign (`30-roadmap.md`).

**Measuring the laptops** [V2, first]. Every render number above was taken in a software renderer, good for ratios only; the one real number is the owner's laptop on the concept viewer (about 100 fps on Ultra, `v1-wave-notes.md`). Kat's laptop, the one Medium is promised on, has never been measured. So before any V2 art lands:

- Settings gains **Measure this laptop**: it runs the perf script (`__qoti.perf()`: pan, orbit and zoom for 10 s, rest for 10 s, on each preset with the light at 11:00, and on Medium and High again at 22:00, since V2's acceptance is a night one) in the valley on screen and in the village and town showcases, shows the table with each row's hour, and offers Copy.
- The table is saved with the valley for that seat (`/api/valleys/:id/perf`, outside sim state, last three runs a seat), with the browser, the screen and the build, so either player can export it and a build session can be handed it. `docs/playtests/V1.md` takes the first two runs.
- V2X, V3X and V4X each record both laptops' tables here, before and after. A row that fails on Kat's laptop on Medium is cut back before the wave ships: the frame budget is the floor (P50).

**As built (V2A, 2026-11-12), night with the light map**: the map and the 32-light loop it replaces on the same build (`?debug&lights=loop`), at 22:00 with the sim held, in the build container's software renderer (SwiftShader: ratios only, a handful of frames a phase): `QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_FIXEDRES=1 QOTI_HOLD=1 QOTI_HOUR=22 QOTI_PRESETS=medium,high node apps/client/e2e/v2-perf.mjs grown village town`, and again with `QOTI_QUERY=lights=loop`. Moving GPU ms (avg / p95), map against loop: Medium, the village 846 / 1531 against 973 / 1587, the town 1151 / 2168 against 1145 / 2143, the grown village 1057 / 2035 against 1061 / 1978; High, the village 2683 against 2909, the town 3301 against 3312, the grown village 2824 against 2832. So a moving night frame costs no more with the map than with the loop, within the software renderer's noise, and less in the village of 130. Moving frames add no pass (the map is drawn only on a frame a light changed, outside the scene pass); draws stay at 131 to 141 on Medium and 170 to 192 on High (budgets 300 and 450). A redraw of 470 to 570 discs (the grown village and the village of 130) is two draws and took 0.4 to 2.4 ms in software as a rule and up to 9 ms while the shared container was busy, with the GPU's time included (`?debug` waits for it), the first one with its programs' compile 18 to 41 ms; at rest with the sim held, neither night drops the still frame or renders the shadow map. The laptops' 22:00 rows (Measure this laptop, Medium and High) against `docs/playtests/V1.md`'s before tables are V2X's to take.

**As built (V2X, 2026-11-12), the merged wave in software**: V2A, V2C and V2B merged, the readers on one curve, decor with a far level kept in view far off, then the master's round (pools, amber lamplight, calmer crowns, softer smoke), measured from a production build of `a6ee677` (`vite preview`) in the build container's SwiftShader, so every millisecond is the CPU doing the GPU's work (ratios at best, the container shared); draws and triangles are real. Before is V2.0's table above (the wave notes, Before numbers).

Medium, sim held, on the first after build (`1f7d728`, before the master's round; `QOTI_FIXEDRES=1 QOTI_HOLD=1 QOTI_PRESETS=medium node apps/client/e2e/v2-perf.mjs`), after against before:

| Scene | Moving GPU ms avg (after / before) | Draws (after / before) | Triangles (after / before) | Rest: moving / still / idle, shadow renders (after) |
|---|---|---|---|---|
| hamlet | 963 / 1277 | 66 / 71 | 0.19 M / 0.27 M | 0 / 1 / 16, 1 |
| village | 938 / 1591 | 135 / 141 | 0.27 M / 0.28 M | 0 / 6 / 0, 6 |
| town | 909 / 407 (V2.0's distrusted number) | 102 / 97 | 0.35 M / 0.31 M | 0 / 1 / 7, 1 |
| grown | 1307 / 1455 | 132 / 128 | 0.45 M / 0.40 M | 0 / 3 / 0, 3 |

Every preset, sim running, on the final build (`QOTI_FIXEDRES=1 node apps/client/e2e/v2-perf.mjs`): moving GPU ms avg, draws and moving triangles after (before):

| Scene | Low | Medium | High | Ultra |
|---|---|---|---|---|
| hamlet | 727, 58, 0.05 M (877, 72, 0.05 M) | 2025, 84, 0.29 M (1952, 75, 0.21 M) | 2230, 79, 0.58 M (3306, 91, 0.78 M) | 2297, 110, 1.26 M (no frame) |
| village | 1007, 133, 0.24 M (1139, 119, 0.22 M) | 2346, 188, 0.41 M (3093, 190, 0.34 M) | 4375, 225, 2.50 M (4549, 224, 1.99 M) | 3818, 358, 4.54 M (no frame) |
| town | 1218, 109, 0.34 M (1388, 83, 0.31 M) | 3224, 169, 0.71 M (no frame) | n/a, 181, 4.03 M (n/a, 88, 0.68 M) | 5520, 292, 4.33 M (no frame) |
| grown | 1164, 123, 0.36 M (1384, 112, 0.26 M) | 2774, 214, 0.80 M (n/a, 183, 0.56 M) | 4015, 201, 1.78 M (5796, 213, 2.05 M) | n/a, 374, 5.41 M (a partial frame) |

Every row is inside its draw and triangle budget (Medium 300 and 3 M, High 450 and 6 M, Ultra 450 and 12 M); the most is the grown village on Medium (214 draws, 0.80 M) and on Ultra (374 draws, 5.41 M). What V2 adds on Medium is the meadow carpet (60 to 100 k triangles at the default camera), the dabbed crowns and, from V2X, far decor (the grown village's wide shot: 0.51 M against 0.45 M, 182 draws against 166); the master's round took dabs out again (the village of 130 on Medium, 0.55 M on the first after build, 0.41 M on the final).

Night, Medium, 22:00, sim held, the light map against the 32-light loop on the same build (`QOTI_HOUR=22 QOTI_HOLD=1 QOTI_PRESETS=medium ... grown village town`, again with `QOTI_QUERY=lights=loop`), moving GPU ms avg / p95:

| Scene | Light map, final build | 32-light loop, final build | Earlier pairs (map / loop, avg) |
|---|---|---|---|
| grown | 1205 / 3086 | 1549 / 2876 | 1486 / 1287 |
| village | 987 / 2386 | 1123 / 2795 | 1304 / 1126, and a loop run of 986 |
| town | 1024 / 2980 | 349 / 422 | 709 / 371, and a loop run of 1247 |

In software the two nights cannot be told apart: the map was cheaper on the final build in the grown village and the village of 130 and dearer in the first pair, and the town's loop rows swing from 349 to 1247 ms between runs of the same build (the cheap frames V2.0 distrusted). V2A's own two pairs found them level. So the laptops' 22:00 rows decide the night acceptance and the loop's retirement.

**The rest check** (`apps/client/e2e/v2-rest.mjs`, new): a static layer that changes every frame at rest would keep the still frame redrawing with nothing on screen to say so. With the sim held, the grown village on Medium at 22:00 changed nothing in 40 s after a four-minute settle; with the sim running, the town on Low changed three times in 40 s (two buildings the sim was building, one lamp). The rests in the tables above end in still frames because one software frame spans most of the 10 s rest, which on a laptop is a fraction of a second of settling.

**Still to come**: both laptops' before and after tables (Measure this laptop, `docs/playtests/V1.md` and `V2.md`), which decide the night acceptance, the idle budget, the carpet's reach per preset and the 32-light loop's retirement (the V2X PR says what the owner and Kat run).

**Budgets** for what the redesign adds, on the weaker laptop on Medium unless a preset is named, all *(tune against the measured tables)*:

| Metric | Budget |
|---|---|
| Moving frames [V2 to V4] | no new full-screen pass; the 12 ms GPU and 300 draw budgets above stand |
| Night with the light map [V2] | a night moving frame costs no more GPU time than the 32-light loop it replaces, on the same scene; redrawing the map under 2 ms, one instanced draw, only when a light changes |
| Painted green [V2] | trees and meadows within 0.5 M triangles in the village scene; opaque geometry only |
| Dressing [V3] | 0.3 M triangles and 12 draws, inside the decor detail distance |
| Endpaper map [V3] | redrawn in a worker in under 150 ms, never on the main thread; no scene draw while it shows in full |
| Rest-frame refinement [V4] | each sample frame within 12 ms; idle back within 4 ms once settled; settled inside 0.6 s on High at 60 fps |
| Trade choice and growth [R1] | under 2 ms a night at City scale |
| The carrier [R1] | under 0.5 ms a day |
| The place pass [R2] | 1 ms an hour at Village scale, 3 ms at City scale |
| Planning the round [R2] | under 0.4 ms a tick for 2,000 residents between 17:00 and 17:30 |
| Gaps, supplies, masters, the Town Book [R2, R3] | under 1 ms an hour together |

**The lanes test** [R1 records it, R2 enforces it]. P2 becomes a bench assertion. `npm run lanes -w @qoti/bench` plays each bench seed for 70 days three ways: both lanes, the Hearth's advisors off, and the Ledger's off after founding (no new zones, specialized buildings or streets; the carrier on its defaults). From R2 it fails unless each one-lane town ends with at most three quarters of the residents of the town played by both, and no more than half its Craftsfolk households. The Ledger's advisor places no decor and the Hearth's zones nothing, so neither can stand in for the other. On 2026-11-10, before the redesign, the Hearth-off town ended with 106% (willow) and 84% (hazel) of the residents (`19-evenings.md`).

**Decisions, not chores** [R1]. The bench counts the autoplayer's commands by kind and fails if the Ledger needed more than 150 in 70 days or used a pause to balance labor (`13-ledger.md`, Tuning targets). The count before the redesign was about 700, 261 of them pauses and 321 order changes.

## Tests

| Layer | What | Where |
|---|---|---|
| Sim unit | every command (validate and apply), every system, rules, worldgen properties (river spans the map, start area flat, deposits present), serialize round trip, migrations | `packages/sim/**/*.test.ts` |
| Determinism | golden scripts (seed, settings, turns) replayed twice in Node must give identical hashes; the same script in a browser worker (Playwright) must match the Node hash | `packages/sim/test/golden/`, `apps/client/e2e/determinism.spec.ts` |
| Content | unique ids, valid references, sane values; every art kit id exists | `packages/content`, `apps/client` |
| Protocol | RoomCore with fake connections: ordering, `sys.*` injection, empty turns, snapshots and pruning, desync and version flows, limits | `packages/protocol` |
| Client unit | road route proposals, mirror patching, ghost validity equals sim validation (property test) | `apps/client/src/**/*.test.ts` |
| End to end | two browser contexts on the dev server: create, invite, join, both build, both see the same thing, hashes match, reload and catch up, pause from one pauses both | `apps/client/e2e/` |
| Visual review | gallery screenshots at fixed seeds, uploaded as CI artifacts (no pixel assertions) | `apps/gallery/e2e/` |
| Playability (P1) | the dead-end hunt: `npm run audit -w @qoti/bench` plays several seeds through a year and one through the Village chapter, watching for no builders, a building idle for want of an input a whole season, a wish nobody could grant, a festival that never started, a standing order never filled (`HealthWatch`, read-only), and reports wishes offered and never granted; the repo tests check statically that every player command has a sender in the client, every removable building can be placed again, and every wish, goal, guide step and plaque can be met by content | `tools/bench/src/audit.ts`, `test/every-command-has-a-sender.test.ts`, `packages/sim/test/p1/` |
| Playability, from the redesign | the audit's health kinds follow the new rules: a business without its raw good for a whole day while its family's rule lets the carrier buy [R1]; a demand bar lit for a season while suitable land is zoned and free [R1]; a gap that no command could close, a place nobody can reach [R2]; a supplied piece that can never be supplied, a master's good with no shelf to sell from, a Town Book page content cannot produce [R3]. The static achievable check covers every wish, twist, guide step, gap and page | `tools/bench/src/audit.ts`, `packages/sim/test/` |
| The lanes test, decisions not chores | see the redesign section above | `tools/bench/src/lanes.ts` |

## CI

GitHub Actions on every pull request and on `main`: install (cached), typecheck, lint, unit tests, build, end-to-end (Chromium), bench (fails on sim and worldgen budgets). Artifacts: Playwright report, gallery screenshots, bench report. A deploy job on `main` runs when Cloudflare secrets are configured.

## Definition of done (every cycle)

1. Every acceptance criterion in the brief is met and demonstrated by a test, a bench number or a screenshot.
2. Typecheck, lint, unit, determinism and end-to-end tests pass, with no new warnings.
3. If the saved state shape changed: `SAVE_VERSION` bumped, migration and test added.
4. Budgets for the touched areas are met; numbers are in the PR.
5. Spec sections updated where behavior differs from the docs; one line in `CHANGELOG.md`.
6. No em dashes in any text; UI copy follows the tone in `17-presentation.md`.
7. The playability audit runs clean (`npm run audit -w @qoti/bench`), or the PR explains each flag; a playtest problem the audit missed gets a check for its whole class (P1, `31-parallel-development.md`, Build and review loop).
8. A PR into `main` with what changed, how to try it, screenshots or a short clip for anything visual, and follow-ups.

## Playtests

At the end of each iteration the two players play at least one evening together on the live link and fill in `docs/playtests/I<n>.md`:

- What was the best moment? What felt like a chore?
- Was anything confusing? Where did you get stuck?
- Did each lane have enough to do? Did you need each other?
- Bugs, desyncs, performance on each laptop (fps from the debug overlay).
- Three things to change before the next iteration.

## Issue labels

`bug`, `desync`, `perf`, `art`, `ux`, `balance`, `content`, `spec`, plus the iteration (`I1`) and track (`track:render`).
