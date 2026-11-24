# V4A after: perf in software

`QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_FIXEDRES=1 QOTI_HOLD=1 QOTI_MOVE=5 QOTI_REST=5 node apps/client/e2e/v4-perf.mjs street village far120`, on frozen builds of the P3C base: the before is `main` at `3612826`, V4A is this branch on that base (before `main`'s forest-floor follow-up merged in, so the forest floor does not muddy the compare), with refinement and with `QOTI_QUERY=refine=0` on the same build. The grown village in summer, 11:00, the sim paused, in the build container's software renderer (SwiftShader, no GPU timer): draws and triangles are real; milliseconds are the CPU doing the GPU's work, ratios at best, one or two frames a part (a sample frame takes 2 to 5 s here). Read the columns as `v4-before-perf.md` says: the Settled idle column rests where the camera path ends (in software often past 240 tiles under the endpaper map), so it means something only on a laptop.

The settling part waits for the valley to go quiet after `runPerf` (V4A's change to the script): the path ends with a jump home, and the buildings, nature and terrain then swap their levels of detail a batch a frame, each a static change and a still frame with a shadow render. In software that runs for 20 frames or more, about a minute, and with a goal above 0 it kept the first sample from ever starting (the first V4A run read "not settled, 0 of 16" on High). Those stills are the same frame for frame with refinement on and off (a probe at 300 tiles: the same stills, the same layers bumped, the same shadow renders); with a goal of 0 the measure stops at the first still and never sees them. The `refine=0` and before tables below were taken with the script before that change; their settling stops at the first still either way.

Settling counts frames: on a laptop at 60 fps, Medium's 10 frames (the nudge's moving frame, one still, 8 samples) are 0.15 s, High's 18 are 0.28 s, and Ultra's 34 would be 0.55 s; in software the 60 s limit cuts Ultra (and High's village, at 15 of 16) short.

## V4A, refinement on

| Scene | Preset | Moving GPU ms (avg / p95) | Moving draws, triangles | Settle ms (frames, samples) | Still frame GPU ms (avg / p95), draws | Settled idle GPU ms (avg / p95) | Rest frames moving / still / idle / sample |
|---|---|---|---|---|---|---|---|
| street | low | 1129.1 / 1283.2 (frame) | 109, 0.41 M | n/a (no still-frame cache) | n/a | 1433.3 / 1516.5 (frame) | 2 / 0 / 0 / 0 |
| street | medium | 2166.6 / 2166.6 (frame) | 131, 0.61 M | 21565 (10, 8 of 8), 2154.7 frame | 2350.0 / 2350.0 (frame), 156 | 3583.2 / 3583.2 (frame) | 0 / 1 / 0 / 0 |
| street | high | 2474.9 / 2616.6 (frame) | 130, 1.13 M | 38882 (18, 16 of 16), 2159.1 frame | 2683.2 / 2683.2 (frame), 129 | 174.2 / 200.0 (frame) | 0 / 20 / 0 / 0 |
| street | ultra | 2616.5 / 2616.5 (frame) | 127, 1.24 M | 62143 (not settled) (25, 23 of 32), 2485.3 frame | 2766.5 / 2766.5 (frame), 220 | 3733.2 / 3733.2 (frame) | 0 / 1 / 0 / 0 |
| village | low | 1199.9 / 1316.7 (frame) | 95, 0.28 M | n/a (no still-frame cache) | n/a | 1405.5 / 1566.6 (frame) | 3 / 0 / 0 / 0 |
| village | medium | 3183.2 / 3183.2 (frame) | 214, 0.73 M | 28424 (10, 8 of 8), 2840.5 frame | 3216.5 / 3216.5 (frame), 201 | 2583.2 / 2583.2 (frame) | 0 / 1 / 0 / 0 |
| village | high | 3733.2 / 3733.2 (frame) | 200, 1.64 M | 63604 (not settled) (17, 15 of 16), 3740.8 frame | 4216.6 / 4216.6 (frame), 198 | 2533.2 / 2533.2 (frame) | 0 / 1 / 0 / 0 |
| village | ultra | 4499.7 / 4499.7 (frame) | 184, 2.06 M | 62941 (not settled) (13, 11 of 32), 4840.2 frame | 5916.4 / 5916.4 (frame), 319 | 3299.8 / 3299.8 (frame) | 0 / 1 / 0 / 0 |
| far120 | low | 1394.4 / 1433.3 (frame) | 100, 0.37 M | n/a (no still-frame cache) | n/a | 1588.8 / 1650.0 (frame) | 3 / 0 / 0 / 0 |
| far120 | medium | 3283.2 / 3283.2 (frame) | 136, 0.53 M | 29360 (10, 8 of 8), 2934.4 frame | 3433.2 / 3433.2 (frame), 136 | 2583.2 / 2583.2 (frame) | 0 / 1 / 0 / 0 |
| far120 | high | 3899.8 / 3899.8 (frame) | 208, 1.68 M | 62199 (18, 16 of 16), 3454.8 frame | 4649.8 / 4649.8 (frame), 208 | 3133.2 / 3133.2 (frame) | 0 / 1 / 0 / 0 |
| far120 | ultra | 5116.5 / 5116.5 (frame) | 202, 3.39 M | 62712 (not settled) (12, 10 of 32), 5225.0 frame | 6616.4 / 6616.4 (frame), 350 | 2033.3 / 2249.9 (frame) | 0 / 2 / 0 / 0 |

## V4A, `refine=0` (the same build)

| Scene | Preset | Moving GPU ms (avg / p95) | Moving draws, triangles | Settle ms (frames, samples) | Still frame GPU ms (avg / p95), draws | Settled idle GPU ms (avg / p95) | Rest frames moving / still / idle / sample |
|---|---|---|---|---|---|---|---|
| street | low | 1149.9 / 1316.5 (frame) | 130, 0.55 M | n/a (no still-frame cache) | n/a | 1622.2 / 1683.3 (frame) | 3 / 0 / 0 / 0 |
| street | medium | 2258.3 / 2349.9 (frame) | 132, 0.65 M | 4281 (2, 0), 2104.9 frame | 2266.6 / 2266.6 (frame), 156 | 3133.3 / 3133.3 (frame) | 0 / 1 / 0 / 0 |
| street | high | 2499.8 / 2499.8 (frame) | 133, 1.34 M | 4681 (2, 0), 2334.0 frame | 2483.3 / 2483.3 (frame), 132 | 2491.6 / 2616.5 (frame) | 0 / 2 / 0 / 0 |
| street | ultra | 2766.5 / 2766.5 (frame) | 130, 1.58 M | 4697 (2, 0), 2342.9 frame | 3849.8 / 3849.8 (frame), 225 | 3883.3 / 3883.3 (frame) | 0 / 1 / 0 / 0 |
| village | low | 1141.6 / 1183.2 (frame) | 96, 0.28 M | n/a (no still-frame cache) | n/a | 1208.3 / 1216.6 (frame) | 2 / 0 / 0 / 0 |
| village | medium | 3199.8 / 3199.8 (frame) | 214, 0.74 M | 5489 (2, 0), 2735.5 frame | 2983.2 / 2983.2 (frame), 201 | 2374.9 / 2566.6 (frame) | 0 / 2 / 0 / 0 |
| village | high | 3733.2 / 3733.2 (frame) | 203, 1.68 M | 7657 (2, 0), 3819.0 frame | 3999.8 / 3999.8 (frame), 201 | 2449.9 / 2449.9 (frame) | 0 / 1 / 0 / 0 |
| village | ultra | 4483.1 / 4483.1 (frame) | 187, 2.34 M | 8315 (2, 0), 4117.8 frame | 5966.4 / 5966.4 (frame), 325 | 3716.5 / 3716.5 (frame) | 0 / 1 / 0 / 0 |
| far120 | low | 1283.3 / 1366.6 (frame) | 100, 0.38 M | n/a (no still-frame cache) | n/a | 1491.7 / 1516.7 (frame) | 2 / 0 / 0 / 0 |
| far120 | medium | 3149.8 / 3149.8 (frame) | 136, 0.53 M | 5783 (2, 0), 2876.4 frame | 3016.6 / 3016.6 (frame), 136 | 2466.5 / 2533.2 (frame) | 0 / 2 / 0 / 0 |
| far120 | high | 3883.2 / 3883.2 (frame) | 211, 1.69 M | 7396 (2, 0), 3684.9 frame | 4183.2 / 4183.2 (frame), 211 | 3099.8 / 3099.8 (frame) | 0 / 1 / 0 / 0 |
| far120 | ultra | 5183.2 / 5183.2 (frame) | 205, 3.47 M | 10347 (2, 0), 5161.5 frame | 6983.1 / 6983.1 (frame), 356 | 1841.6 / 1999.9 (frame) | 0 / 2 / 0 / 0 |

## Before (`3612826`)

| Scene | Preset | Moving GPU ms (avg / p95) | Moving draws, triangles | Settle ms (frames, samples) | Still frame GPU ms (avg / p95), draws | Settled idle GPU ms (avg / p95) | Rest frames moving / still / idle / sample |
|---|---|---|---|---|---|---|---|
| street | low | 1145.8 / 1266.5 (frame) | 130, 0.55 M | n/a (no still-frame cache) | n/a | 1461.1 / 1533.3 (frame) | 3 / 0 / 0 / 0 |
| street | medium | 2216.6 / 2283.2 (frame) | 131, 0.63 M | 4149 (2, 0), 2041.7 frame | 2216.6 / 2216.6 (frame), 156 | 3133.2 / 3133.2 (frame) | 0 / 1 / 0 / 0 |
| street | high | 2483.2 / 2483.2 (frame) | 133, 1.33 M | 4482 (2, 0), 2228.9 frame | 2500.0 / 2500.0 (frame), 132 | 2425.0 / 2516.5 (frame) | 0 / 2 / 0 / 0 |
| street | ultra | 2816.5 / 2816.5 (frame) | 130, 1.58 M | 4825 (2, 0), 2401.1 frame | 4083.2 / 4083.2 (frame), 225 | 4066.5 / 4066.5 (frame) | 0 / 1 / 0 / 0 |
| village | low | 1183.3 / 1300.0 (frame) | 97, 0.30 M | n/a (no still-frame cache) | n/a | 1324.9 / 1400.0 (frame) | 2 / 0 / 0 / 0 |
| village | medium | 3016.6 / 3016.6 (frame) | 214, 0.74 M | 5845 (2, 0), 2911.1 frame | 3083.2 / 3083.2 (frame), 201 | 2499.9 / 2650.0 (frame) | 0 / 2 / 0 / 0 |
| village | high | 3816.5 / 3816.5 (frame) | 203, 1.68 M | 7412 (2, 0), 3672.8 frame | 3816.6 / 3816.6 (frame), 203 | 3166.5 / 3166.5 (frame) | 0 / 1 / 0 / 0 |
| village | ultra | 4166.5 / 4166.5 (frame) | 187, 1.98 M | 7684 (2, 0), 3828.1 frame | 5366.4 / 5366.4 (frame), 325 | 1974.9 / 2133.2 (frame) | 0 / 2 / 0 / 0 |
| far120 | low | 1277.7 / 1316.6 (frame) | 101, 0.37 M | n/a (no still-frame cache) | n/a | 1458.3 / 1533.2 (frame) | 2 / 0 / 0 / 0 |
| far120 | medium | 3199.9 / 3199.9 (frame) | 136, 0.53 M | 5770 (2, 0), 2873.8 frame | 3183.2 / 3183.2 (frame), 136 | 2333.2 / 2349.9 (frame) | 0 / 2 / 0 / 0 |
| far120 | high | 4016.4 / 4016.4 (frame) | 211, 1.69 M | 7405 (2, 0), 3690.4 frame | 4349.8 / 4349.8 (frame), 211 | 3083.2 / 3083.2 (frame) | 0 / 1 / 0 / 0 |
| far120 | ultra | 5249.8 / 5249.8 (frame) | 205, 3.48 M | 10217 (2, 0), 5099.1 frame | 7299.8 / 7299.8 (frame), 356 | 1883.3 / 2016.6 (frame) | 0 / 2 / 0 / 0 |

## A sample frame

From `v4-shots.mjs v4a` (the renderer's own counts on a sample frame: the static scene from the jittered camera, the sample's shadow pass and the fold, with the moving layers and the final pass):

| Preset | Street: draws, triangles | Village: draws, triangles |
|---|---|---|
| Medium | 145 to 151, 0.77 to 0.79 M | 193 to 199, 0.86 to 0.87 M |
| High | 119 to 125, 1.22 to 1.26 M | 189 to 196, 1.86 to 2.03 M |
| Ultra | 119 to 125, 1.22 to 1.42 M | 167 to 174, 2.09 to 2.41 M |

A sample frame draws no AO pass (Ultra's AO is drawn once a still frame), so on Ultra it draws fewer than the still frame (319 at the village) and about what a moving frame draws; in software it takes about a moving frame's time (the settling column's frame ms against the moving column).
