# V3.0 before: headless perf on the grown village

Headless Chromium draws in software (SwiftShader), so the frame and GPU milliseconds below are
slow-renderer numbers: only draws and triangles carry over to a laptop. Run the script on a laptop
with `QOTI_HEADED=1` for timings. All scenes are the grown village (`?debug&fixture=grown`, 152
residents, 158 buildings, village rank) in the summer clear look, 1440 x 900, dynamic resolution on
(as the script leaves it). The street camera looks at the door of the high street business nearest
the shops' middle (distance 12, tilt -0.22), the village view is at 70, the far views at 120, 200
and 240.

Commands (dev server: `npx vite --port 5230` in `apps/client`):

```
QOTI_CLIENT_PORT=5230 QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_PRESETS=low,medium,high,ultra QOTI_HOUR=11 node apps/client/e2e/v3-perf.mjs
QOTI_CLIENT_PORT=5230 QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_PRESETS=medium QOTI_HOUR=22 node apps/client/e2e/v3-perf.mjs
```

The first took 1306 s, the second 826 s. A single run is noisy (the software renderer shares one
CPU with the scene's own streaming), so compare triangles and draws first and times only in broad
strokes.

## All presets at 11:00

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 11:00 | 802.7 / 999.9 | 756.7 / 994.3 | 1157.1 / 1316.6 | 1114.3 / 1306.1 | 125 | 0.45 M | 7 / 0 / 0, 7 |
| street | medium | 11:00 | 1547.1 / 3016.5 | 1496.0 / 1688.7 | 2333.2 / 2716.7 | 2232.5 / 2643.5 | 117 | 0.51 M | 0 / 4 / 0, 4 |
| street | high | 11:00 | 1555.5 / 1950.0 | 1907.3 / 2307.7 | 3261.0 / 5499.8 | 3191.2 / 4194.9 | 146 | 1.33 M | 0 / 3 / 0, 3 |
| street | ultra | 11:00 | 2354.1 / 6049.7 | 2357.8 / 3270.2 | 4341.6 / 5366.5 | 4232.0 / 5278.7 | 180 | 2.23 M | 0 / 2 / 0, 2 |
| village | low | 11:00 | 823.6 / 883.4 | 773.1 / 867.4 | 1116.6 / 1183.3 | 1066.0 / 1118.8 | 137 | 0.33 M | 7 / 0 / 0, 7 |
| village | medium | 11:00 | 2133.3 / 2299.9 | 2109.1 / 2210.0 | 2166.6 / 2533.3 | 2289.4 / 2785.8 | 186 | 0.59 M | 0 / 3 / 0, 3 |
| village | high | 11:00 | 3149.9 / 6283.1 | 3011.2 / 3023.2 | 2855.4 / 3466.5 | 2767.4 / 3415.2 | 191 | 1.71 M | 0 / 3 / 0, 3 |
| village | ultra | 11:00 | 12182.9 / 12182.9 | 4074.8 / 4096.1 | 2699.9 / 5299.8 | 3930.0 / 5226.1 | 364 | 4.24 M | 0 / 3 / 0, 3 |
| far120 | low | 11:00 | 933.3 / 1066.7 | 886.1 / 1042.6 | 1135.4 / 1200.0 | 1080.4 / 1174.9 | 137 | 0.34 M | 8 / 0 / 0, 8 |
| far120 | medium | 11:00 | 2683.2 / 5533.1 | 2450.6 / 2450.6 | 2429.1 / 2749.9 | 2411.4 / 2673.9 | 186 | 0.51 M | 0 / 4 / 0, 4 |
| far120 | high | 11:00 | 3549.8 / 3549.8 | 3389.0 / 3448.3 | 3299.9 / 3600.0 | 3399.3 / 3707.5 | 266 | 2.23 M | 0 / 2 / 0, 2 |
| far120 | ultra | 11:00 | 4966.5 / 4966.5 | 4822.9 / 4830.2 | 6599.7 / 6599.7 | 5239.2 / 6681.1 | 479 | 6.79 M | 0 / 1 / 0, 1 |
| far200 | low | 11:00 | 1191.6 / 1400.0 | 1126.0 / 1318.2 | 1152.3 / 1200.1 | 1087.4 / 1159.1 | 171 | 0.41 M | 7 / 0 / 0, 7 |
| far200 | medium | 11:00 | 2491.6 / 2649.8 | 2527.4 / 2630.9 | 2449.9 / 2633.2 | 2423.7 / 2624.6 | 219 | 0.61 M | 0 / 4 / 0, 4 |
| far200 | high | 11:00 | 1899.9 / 2949.8 | 2615.0 / 2811.9 | 1636.0 / 4349.9 | 1595.3 / 2683.3 | 234 | 0.60 M | 0 / 1 / 5, 1 |
| far200 | ultra | 11:00 | 2261.0 / 5099.8 | 5123.2 / 5158.9 | 3766.5 / 4166.5 | 2903.6 / 4108.4 | 364 | 1.89 M | 0 / 2 / 0, 2 |
| far240 | low | 11:00 | 1152.0 / 1316.6 | 1080.4 / 1251.3 | 1154.7 / 1216.7 | 1082.9 / 1161.7 | 179 | 0.41 M | 7 / 0 / 0, 7 |
| far240 | medium | 11:00 | 2711.0 / 2883.2 | 2651.7 / 2801.9 | 2449.9 / 2666.6 | 2398.4 / 2536.2 | 231 | 0.63 M | 0 / 4 / 0, 4 |
| far240 | high | 11:00 | 2237.4 / 3033.2 | 2916.7 / 2985.3 | 2549.9 / 2799.9 | 2444.3 / 2733.7 | 239 | 0.57 M | 0 / 3 / 0, 3 |
| far240 | ultra | 11:00 | 3649.9 / 7266.4 | n/a / n/a | 3194.3 / 6799.7 | 3235.5 / 4015.0 | 379 | 0.89 M | 0 / 3 / 0, 3 |

## Medium at 22:00

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | medium | 22:00 | 948.1 / 1666.6 | 934.6 / 1603.8 | 3216.6 / 3349.8 | 2537.7 / 3113.0 | 106 | 0.43 M | 0 / 3 / 0, 3 |
| village | medium | 22:00 | 1372.2 / 2599.9 | 1336.6 / 2574.8 | 2454.1 / 2749.9 | 2400.5 / 2728.3 | 129 | 0.38 M | 0 / 4 / 0, 4 |
| far120 | medium | 22:00 | 1647.1 / 2583.3 | 1588.4 / 2439.7 | 2805.4 / 3149.9 | 2688.7 / 3044.4 | 156 | 0.38 M | 0 / 3 / 0, 3 |
| far200 | medium | 22:00 | 1302.3 / 2733.2 | 1557.0 / 2708.9 | 2505.5 / 2733.3 | 2433.4 / 2659.8 | 170 | 0.37 M | 0 / 1 / 2, 1 |
| far240 | medium | 22:00 | 1447.2 / 2899.9 | 1407.9 / 2892.6 | 2688.8 / 2766.5 | 2584.5 / 2692.1 | 176 | 0.36 M | 0 / 3 / 0, 3 |
