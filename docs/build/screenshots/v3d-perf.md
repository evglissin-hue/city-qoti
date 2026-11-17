# V3D perf (v3-perf.mjs village far200 far240, QOTI_FIXEDRES=1, 6 s moving and 6 s idle)

Headless software renderer: draws and triangles are real, milliseconds are not. Draws is the mean over the moving path, which zooms in and out (so far240 mixes frames under the full map, 1 draw, with frames below 240 tiles, where the scene draws).

| Scene | Preset | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|
| village | low | 2191.6 / 4349.7 | 2370.8 / 2370.8 | 2999.8 / 5983.0 | n/a / n/a | 137 | 0.28 M | 2 / 0 / 0, 0 |
| village | medium | 587.5 / 1916.6 | 831.6 / 831.6 | 13516.1 / 13516.1 | 2797.0 / 2797.0 | 156 | 0.60 M | 0 / 1 / 0, 1 |
| village | high | 1544.4 / 4049.9 | n/a / n/a | 9949.7 / 9949.7 | 2533.4 / 2533.4 | 176 | 1.73 M | 0 / 1 / 0, 1 |
| village | ultra | 11632.8 / 11632.8 | n/a / n/a | 2799.9 / 2833.3 | 2709.3 / 2709.3 | 338 | 4.33 M | 0 / 2 / 0, 2 |
| far200 | low | 219.0 / 1266.7 | 1201.3 / 1240.5 | 926.6 / 983.3 | 882.3 / 944.6 | 184 | 0.42 M | 5 / 0 / 0, 2 |
| far200 | medium | 1605.5 / 1833.3 | n/a / n/a | 1466.6 / 2883.2 | n/a / n/a | 191 | 0.46 M | 0 / 2 / 0, 2 |
| far200 | high | 15966.0 / 15966.0 | n/a / n/a | 1258.3 / 2466.6 | 2810.4 / 2810.4 | 248 | 0.69 M | 0 / 2 / 0, 2 |
| far200 | ultra | 392.4 / 3116.6 | 1098.0 / 3108.7 | 3899.8 / 3899.8 | 2312.1 / 4059.9 | 279 | 1.10 M | 0 / 1 / 0, 1 |
| far240 | low | 181.8 / 1733.2 | 45.2 / 79.0 | 45.9 / 99.9 | 31.1 / 33.7 | 1 | 0.00 M | 98 / 0 / 0, 0 |
| far240 | medium | 115.8 / 233.3 | 79.0 / 89.5 | 7199.7 / 7199.7 | n/a / n/a | 60 | 0.17 M | 0 / 1 / 0, 0 |
| far240 | high | 2291.6 / 3266.5 | n/a / n/a | 883.3 / 1866.6 | 1663.7 / 1663.7 | 122 | 0.47 M | 0 / 6 / 0, 6 |
| far240 | ultra | 3483.1 / 3483.1 | n/a / n/a | 3416.6 / 3416.6 | n/a / n/a | 275 | 0.79 M | 0 / 1 / 0, 1 |
