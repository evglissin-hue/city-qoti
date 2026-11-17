# V3X after: headless perf on the grown village

The same method as `v3-before-perf.md`: headless Chromium in software (SwiftShader), so the frame and GPU milliseconds are slow-renderer numbers and only draws and triangles carry over to a laptop. The grown village (`?debug&fixture=grown`) in the summer clear look, 1440 x 900, dynamic resolution on, the sim running. Taken on `cycle/v3x-integration` after V3A to V3D merged and V3X's tuning (the far view, the river, the dressing rules).

```
QOTI_CLIENT_PORT=5235 QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_PRESETS=low,medium,high,ultra QOTI_HOUR=11 node apps/client/e2e/v3-perf.mjs
QOTI_CLIENT_PORT=5235 QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_PRESETS=medium QOTI_HOUR=22 node apps/client/e2e/v3-perf.mjs
```

A single run is noisy: the sim runs, so residents, level-of-detail swaps and shadow renders differ between runs by tens of draws (V3A's and V3B's A/B runs measured it). The far240 rows are means over a path that zooms in and out, so they mix frames under the map (1 draw) with frames below 240 tiles.

## 11:00, every preset

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 11:00 | 1361.1 / 1933.3 | 1549.2 / 1894.3 | 1909.9 / 2716.5 | 2288.5 / 2682.3 | 124 | 0.49 M | 5 / 0 / 0, 5 |
| street | medium | 11:00 | 2483.3 / 4949.8 | 3641.7 / 3707.8 | 3483.2 / 3533.2 | 3397.9 / 3506.1 | 129 | 0.63 M | 0 / 2 / 0, 2 |
| street | high | 11:00 | 2274.9 / 4533.1 | 4448.1 / 4526.3 | 4499.8 / 4499.9 | 4442.7 / 4467.1 | 124 | 1.21 M | 0 / 2 / 0, 2 |
| street | ultra | 11:00 | 2474.9 / 4916.5 | 4710.9 / 4854.6 | 4416.6 / 4416.6 | 4238.1 / 4238.1 | 100 | 1.13 M | 0 / 1 / 0, 1 |
| village | low | 11:00 | 1428.5 / 3299.8 | 1583.2 / 1862.3 | 1107.4 / 5499.8 | 440.0 / 1911.0 | 96 | 0.34 M | 9 / 0 / 0, 9 |
| village | medium | 11:00 | 3383.2 / 6749.7 | n/a / n/a | 4099.8 / 4099.8 | 3468.5 / 4047.4 | 167 | 0.69 M | 0 / 1 / 0, 1 |
| village | high | 11:00 | 5683.1 / 5683.1 | 5693.9 / 5762.7 | 2391.6 / 3899.8 | 3120.6 / 3883.2 | 194 | 2.48 M | 0 / 4 / 0, 4 |
| village | ultra | 11:00 | 83.3 / 83.3 | n/a / n/a | 2974.8 / 4299.8 | 5494.8 / 6714.1 | 318 | 4.24 M | 0 / 2 / 0, 2 |
| far120 | low | 11:00 | 1185.4 / 1299.9 | 1113.8 / 1226.2 | 607.7 / 4099.8 | 291.8 / 1285.5 | 90 | 0.40 M | 15 / 0 / 0, 15 |
| far120 | medium | 11:00 | 2688.8 / 5283.1 | 2770.8 / 2770.8 | 1922.2 / 2966.5 | 1798.4 / 2877.5 | 140 | 0.60 M | 0 / 3 / 0, 3 |
| far120 | high | 11:00 | 2033.3 / 4049.8 | 3916.5 / 4018.5 | 3649.9 / 3683.2 | 3602.5 / 3661.0 | 174 | 1.91 M | 0 / 2 / 0, 2 |
| far120 | ultra | 11:00 | 5383.1 / 5383.1 | 5452.4 / 5452.4 | 2699.9 / 4016.5 | 2669.0 / 4020.0 | 366 | 7.06 M | 0 / 3 / 0, 3 |
| far200 | low | 11:00 | 1705.5 / 2249.9 | 1678.8 / 2205.0 | 903.7 / 1833.3 | 864.7 / 998.7 | 94 | 0.58 M | 9 / 0 / 0, 7 |
| far200 | medium | 11:00 | 2429.1 / 3316.5 | 3219.1 / 3300.6 | 5099.8 / 5099.8 | 1824.5 / 2721.2 | 88 | 0.49 M | 0 / 1 / 0, 1 |
| far200 | high | 11:00 | 1733.3 / 3449.8 | 3335.3 / 3407.1 | 3038.8 / 3116.6 | 3026.2 / 3111.0 | 117 | 0.60 M | 0 / 3 / 0, 3 |
| far200 | ultra | 11:00 | 3749.9 / 3749.9 | 3776.5 / 3779.3 | 4316.4 / 5283.0 | 4271.9 / 5220.8 | 325 | 2.36 M | 0 / 2 / 0, 2 |
| far240 | low | 11:00 | 163.3 / 1016.6 | 109.0 / 994.5 | 72.6 / 116.6 | 35.2 / 43.5 | 8 | 0.04 M | 117 / 0 / 0, 2 |
| far240 | medium | 11:00 | 310.5 / 2549.9 | 191.6 / 144.9 | 710.7 / 2999.9 | 468.6 / 2701.1 | 14 | 0.07 M | 0 / 14 / 0, 14 |
| far240 | high | 11:00 | 163.3 / 216.7 | 137.2 / 103.0 | 353.6 / 2499.9 | 85.2 / 97.5 | 9 | 0.04 M | 2 / 1 / 20, 1 |
| far240 | ultra | 11:00 | 1175.0 / 3633.3 | 1314.9 / 3635.1 | 2933.2 / 6366.4 | 2804.7 / 6270.6 | 96 | 0.95 M | 0 / 3 / 0, 3 |

## 22:00, Medium

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | medium | 22:00 | 1081.4 / 1933.2 | 1064.5 / 1878.0 | 3624.9 / 3633.3 | 3504.4 / 3532.8 | 113 | 0.58 M | 0 / 2 / 0, 2 |
| village | medium | 22:00 | 2262.4 / 2983.3 | 2195.6 / 2910.2 | 3027.7 / 3083.3 | 2974.6 / 3073.6 | 167 | 0.82 M | 0 / 3 / 0, 3 |
| far120 | medium | 22:00 | 1452.7 / 2749.9 | 1401.3 / 2693.3 | 2949.9 / 6233.1 | 2836.0 / 3101.9 | 103 | 0.43 M | 0 / 2 / 0, 2 |
| far200 | medium | 22:00 | 1416.6 / 2983.2 | 1383.5 / 2953.7 | 203.6 / 216.6 | 168.1 / 118.4 | 78 | 0.40 M | 0 / 8 / 34, 8 |
| far240 | medium | 22:00 | 183.0 / 233.4 | 136.9 / 95.2 | 199.3 / 233.4 | 192.9 / 104.8 | 9 | 0.04 M | 0 / 3 / 37, 3 |
