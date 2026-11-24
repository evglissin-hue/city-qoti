# V4X perf: the merged head (round one)

`QOTI_HOLD=1 QOTI_FIXEDRES=1 node apps/client/e2e/v4-perf.mjs street village far120`, the grown village at 11:00 with the sim paused, 1440 x 900, on `cycle/v4x-integration` at cbe43353 (V4.0, V4A, V4B, V4C, `main` with P3A, and V4X's round one including the lot pad), in the build container's headless Chromium. It draws in software (SwiftShader), so only draws and triangles mean anything; milliseconds are ratios at best, and a 10 s path holds one or two frames, so the moving columns are whichever frames it caught (V4A saw the same code differ by up to 0.36 M triangles from run to run). "Not settled" is the script's 60 s limit in software, not the laptop's 0.6 s.

## As it is (refinement on)

| Scene | Preset | Moving GPU ms (avg / p95) | Moving draws, triangles | Settle ms (frames, samples) | Still frame GPU ms (avg / p95), draws | Settled idle GPU ms (avg / p95) | Rest frames moving / still / idle / sample |
|---|---|---|---|---|---|---|---|
| street | low | 1649.9 / 1716.7 (frame) | 130, 0.54 M | n/a (no still-frame cache) | n/a | 3138.8 / 3349.9 (frame) | 3 / 0 / 0 / 0 |
| street | medium | 3138.7 / 3316.5 (frame) | 119, 0.54 M | 27583 (10, 8 of 8), 2756.0 frame | 2633.2 / 2633.2 (frame), 153 | 202.4 / 283.3 (frame) | 0 / 34 / 0 / 8 |
| street | high | 2966.6 / 3383.2 (frame) | 97, 0.77 M | 58108 (18, 16 of 16), 3227.0 frame | 3199.9 / 3199.9 (frame), 129 | 237.0 / 433.4 (frame) | 0 / 34 / 0 / 2 |
| street | ultra | 3991.5 / 4049.8 (frame) | 101, 0.89 M | 64126 (not settled) (18, 16 of 32), 3561.5 frame | 5783.1 / 5783.1 (frame), 219 | 2772.1 / 3083.2 (frame) | 0 / 3 / 0 / 0 |
| village | low | 1799.9 / 2166.6 (frame) | 97, 0.36 M | n/a (no still-frame cache) | n/a | 1906.6 / 2116.6 (frame) | 5 / 0 / 0 / 0 |
| village | medium | 4499.8 / 4549.8 (frame) | 173, 0.63 M | 41081 (10, 8 of 8), 4105.0 frame | 4166.5 / 4166.5 (frame), 205 | 217.9 / 333.3 (frame) | 0 / 35 / 0 / 4 |
| village | high | 5783.0 / 5783.0 (frame) | 199, 1.65 M | 64953 (not settled) (12, 10 of 16), 5410.7 frame | 6083.0 / 6083.0 (frame), 197 | 3591.6 / 3849.9 (frame) | 0 / 2 / 0 / 0 |
| village | ultra | 6266.4 / 6266.4 (frame) | 183, 2.06 M | 65163 (not settled) (9, 7 of 32), 7238.4 frame | 9233.0 / 9233.0 (frame), 317 | 5316.5 / 5316.5 (frame) | 0 / 1 / 0 / 0 |
| far120 | low | 1939.9 / 2099.9 (frame) | 98, 0.42 M | n/a (no still-frame cache) | n/a | 2083.3 / 2333.2 (frame) | 4 / 0 / 0 / 0 |
| far120 | medium | 4449.8 / 4616.4 (frame) | 116, 0.49 M | 38950 (10, 8 of 8), 3893.1 frame | 4816.4 / 4816.4 (frame), 135 | 223.7 / 366.7 (frame) | 0 / 36 / 0 / 2 |
| far120 | high | 5483.1 / 5483.1 (frame) | 207, 1.69 M | 60931 (not settled) (10, 8 of 16), 6091.3 frame | 3899.9 / 3899.9 (frame), 191 | 3683.2 / 3699.8 (frame) | 0 / 2 / 0 / 0 |
| far120 | ultra | 7449.6 / 7449.6 (frame) | 200, 3.39 M | 61945 (not settled) (8, 6 of 32), 7739.6 frame | 10616.2 / 10616.2 (frame), 343 | 4099.8 / 4099.8 (frame) | 0 / 1 / 0 / 0 |

## Refinement off on the same build (`QOTI_QUERY=refine=0`)

| Scene | Preset | Moving GPU ms (avg / p95) | Moving draws, triangles | Settle ms (frames, samples) | Still frame GPU ms (avg / p95), draws | Settled idle GPU ms (avg / p95) | Rest frames moving / still / idle / sample |
|---|---|---|---|---|---|---|---|
| street | low | 1627.7 / 1999.9 (frame) | 125, 0.60 M | n/a (no still-frame cache) | n/a | 1823.3 / 1950.0 (frame) | 5 / 0 / 0 / 0 |
| street | medium | 3199.9 / 3516.5 (frame) | 119, 0.53 M | 3098 (2, 0), 1545.4 frame | 3483.1 / 3483.1 (frame), 153 | 168.9 / 333.2 (frame) | 0 / 35 / 8 / 0 |
| street | high | 1939.9 / 2133.2 (frame) | 127, 1.36 M | 3388 (2, 0), 1687.7 frame | 1950.0 / 1950.0 (frame), 130 | 57.5 / 116.6 (frame) | 0 / 25 / 59 / 0 |
| street | ultra | 2041.6 / 2366.6 (frame) | 104, 1.05 M | 3742 (2, 0), 1865.5 frame | 3049.9 / 3049.9 (frame), 219 | 1594.4 / 1783.2 (frame) | 0 / 6 / 0 / 0 |
| village | low | 846.9 / 983.3 (frame) | 109, 0.33 M | n/a (no still-frame cache) | n/a | 1221.4 / 1283.2 (frame) | 7 / 0 / 0 / 0 |
| village | medium | 2370.7 / 2599.8 (frame) | 164, 0.63 M | 4412 (2, 0), 2197.7 frame | 2433.2 / 2433.2 (frame), 205 | 63.9 / 116.7 (frame) | 0 / 26 / 54 / 0 |
| village | high | 3194.3 / 3349.9 (frame) | 157, 1.32 M | 6550 (2, 0), 3269.7 frame | 3233.2 / 3233.2 (frame), 199 | 67.5 / 133.3 (frame) | 0 / 27 / 51 / 0 |
| village | ultra | 3741.5 / 3799.9 (frame) | 157, 1.89 M | 8307 (2, 0), 4138.9 frame | 5316.5 / 5316.5 (frame), 317 | 3691.5 / 4366.4 (frame) | 0 / 2 / 0 / 0 |
| far120 | low | 941.6 / 1066.6 (frame) | 110, 0.38 M | n/a (no still-frame cache) | n/a | 1277.7 / 1433.3 (frame) | 6 / 0 / 0 / 0 |
| far120 | medium | 2616.6 / 2900.0 (frame) | 135, 0.53 M | 4747 (2, 0), 2364.2 frame | 2633.1 / 2633.1 (frame), 95 | 61.2 / 116.6 (frame) | 0 / 29 / 56 / 0 |
| far120 | high | 3122.1 / 3249.8 (frame) | 183, 1.82 M | 6054 (2, 0), 3022.9 frame | 3183.2 / 3183.2 (frame), 140 | 63.1 / 116.7 (frame) | 0 / 26 / 53 / 0 |
| far120 | ultra | 4308.1 / 4366.4 (frame) | 176, 2.74 M | 8361 (2, 0), 4170.2 frame | 6116.4 / 6116.4 (frame), 346 | 1611.0 / 1899.9 (frame) | 0 / 6 / 0 / 0 |
