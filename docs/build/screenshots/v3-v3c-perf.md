# V3C after: headless perf on the grown village

Same scenes and method as `v3-before-perf.md` (the grown village, summer clear, 1440 x 900, dynamic
resolution on), taken from a production build of `cycle/v3c-long-view` (`vite preview`) in the build
container's software renderer: only draws and triangles carry over to a laptop. A moving average
mixes in the still frames a slow renderer takes between path steps (a still frame that re-renders
the sun's shadows can add 60 to 80 draws), so a single row is noisy: Medium's street read 139 draws
on the first run and 99 on a second (`QOTI_PRESETS=medium node apps/client/e2e/v3-perf.mjs street`).

```
QOTI_CLIENT_PORT=5263 QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_PRESETS=low,medium,high,ultra QOTI_HOUR=11 node apps/client/e2e/v3-perf.mjs
QOTI_CLIENT_PORT=5263 QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_PRESETS=medium QOTI_HOUR=22 node apps/client/e2e/v3-perf.mjs
```

## All presets at 11:00

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 11:00 | 890.9 / 1083.3 | 844.4 / 1073.7 | 1130.9 / 1266.6 | 1076.3 / 1237.1 | 124 | 0.53 M | 7 / 0 / 0, 7 |
| street | medium | 11:00 | 1583.3 / 3116.6 | 1567.5 / 1692.6 | 3122.1 / 3299.9 | 3003.8 / 3295.2 | 139 | 0.90 M | 0 / 3 / 0, 3 |
| street | high | 11:00 | 1937.4 / 2066.6 | 1955.4 / 2439.7 | 2483.3 / 2899.9 | 2468.2 / 2892.7 | 114 | 1.12 M | 0 / 3 / 0, 3 |
| street | ultra | 11:00 | 2079.1 / 6033.0 | 2013.3 / 2046.4 | 1899.9 / 1899.9 | 1858.6 / 1858.6 | 120 | 1.34 M | 0 / 1 / 0, 1 |
| village | low | 11:00 | 786.1 / 883.3 | 744.0 / 821.6 | 1164.2 / 1366.6 | 1101.7 / 1345.7 | 95 | 0.32 M | 7 / 0 / 0, 7 |
| village | medium | 11:00 | 2254.1 / 2366.5 | 2122.4 / 2290.5 | 2405.4 / 2649.8 | 2299.8 / 2536.8 | 164 | 0.68 M | 0 / 3 / 0, 3 |
| village | high | 11:00 | 3733.2 / 3866.5 | 3682.9 / 3780.4 | 2694.3 / 4666.4 | 2653.4 / 3407.9 | 199 | 2.45 M | 0 / 1 / 2, 1 |
| village | ultra | 11:00 | 2583.2 / 6049.7 | 5297.8 / 6025.4 | 4666.5 / 4666.5 | 4493.7 / 6079.5 | 202 | 3.12 M | 0 / 1 / 0, 1 |
| far120 | low | 11:00 | 983.3 / 1749.9 | 926.7 / 1076.1 | 1188.0 / 1250.0 | 1138.3 / 1233.5 | 99 | 0.45 M | 7 / 0 / 0, 7 |
| far120 | medium | 11:00 | 2404.1 / 2516.5 | 2327.4 / 2447.7 | 2462.4 / 5116.4 | 2393.7 / 2507.9 | 122 | 0.58 M | 0 / 4 / 0, 4 |
| far120 | high | 11:00 | 2472.1 / 3833.1 | 3495.9 / 3776.0 | 3133.2 / 5816.5 | 3007.9 / 3791.6 | 182 | 1.97 M | 0 / 1 / 2, 1 |
| far120 | ultra | 11:00 | 3808.2 / 7599.7 | 7115.9 / 7564.5 | 4516.5 / 4516.5 | 4525.1 / 4525.1 | 246 | 5.01 M | 0 / 1 / 0, 1 |
| far200 | low | 11:00 | 1243.7 / 1366.7 | 1172.5 / 1302.6 | 1097.6 / 1199.9 | 1043.0 / 1138.3 | 97 | 0.54 M | 7 / 0 / 0, 7 |
| far200 | medium | 11:00 | 1822.2 / 5433.1 | 2693.9 / 2780.8 | 2049.9 / 3333.1 | 2008.0 / 2488.8 | 93 | 0.57 M | 0 / 2 / 2, 2 |
| far200 | high | 11:00 | 3294.3 / 3399.8 | 3229.9 / 3322.8 | 2472.1 / 4799.9 | 2382.3 / 2459.8 | 131 | 0.72 M | 0 / 3 / 0, 3 |
| far200 | ultra | 11:00 | 3310.9 / 6599.7 | 3261.8 / 3293.9 | 2622.1 / 2849.8 | 2594.1 / 2853.4 | 190 | 1.31 M | 0 / 3 / 0, 3 |
| far240 | low | 11:00 | 1247.9 / 1433.3 | 1181.5 / 1346.4 | 1190.4 / 1349.9 | 1118.0 / 1257.5 | 97 | 0.50 M | 7 / 0 / 0, 7 |
| far240 | medium | 11:00 | 2799.9 / 2983.3 | 2738.5 / 2919.3 | 2516.6 / 2666.6 | 2480.4 / 2593.4 | 88 | 0.52 M | 0 / 3 / 0, 3 |
| far240 | high | 11:00 | 3094.3 / 3233.2 | 3008.3 / 3175.3 | 2688.8 / 3033.2 | 2587.3 / 2877.2 | 111 | 0.57 M | 0 / 3 / 0, 3 |
| far240 | ultra | 11:00 | 11666.3 / 11666.3 | 3211.6 / 3245.0 | 3261.0 / 5283.2 | 3225.2 / 4470.3 | 258 | 1.34 M | 0 / 3 / 0, 3 |

## Medium at 22:00

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | medium | 22:00 | 964.8 / 1699.9 | 913.6 / 1626.9 | 2427.7 / 2983.2 | 2309.6 / 2774.5 | 100 | 0.47 M | 0 / 3 / 0, 3 |
| village | medium | 22:00 | 1166.6 / 2433.2 | 1131.2 / 2412.6 | 2622.1 / 2933.2 | 2498.5 / 2781.7 | 108 | 0.44 M | 0 / 3 / 0, 3 |
| far120 | medium | 22:00 | 1209.5 / 2533.2 | 1162.9 / 2422.4 | 2649.9 / 2699.9 | 2571.7 / 2657.8 | 101 | 0.44 M | 0 / 2 / 0, 2 |
| far200 | medium | 22:00 | 2777.7 / 5499.8 | 2810.9 / 2810.9 | 2477.7 / 2483.3 | 2374.3 / 2405.9 | 91 | 0.49 M | 0 / 2 / 1, 2 |
| far240 | medium | 22:00 | 1566.6 / 2949.9 | 1524.6 / 2892.8 | 2708.2 / 2833.2 | 2547.7 / 2756.4 | 90 | 0.53 M | 0 / 2 / 0, 2 |

## Round two (the rim painted away, the haze toward the sky), the far scenes at 11:00

The same command with `far120 far200 far240`. Ultra rows average one or two frames in software, so they swing with whether a still frame or a shadow re-render fell in the window (far120 Ultra read 246 draws on the first run and 347 on this one, both under the 450 budget and the 479 before).

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| far120 | low | 11:00 | 1025.9 / 1133.3 | 936.8 / 1049.6 | 1200.0 / 1283.4 | 1144.5 / 1266.8 | 94 | 0.41 M | 7 / 0 / 0, 7 |
| far120 | medium | 11:00 | 2283.2 / 2383.2 | 2227.9 / 2307.6 | 2338.8 / 2599.9 | 2381.8 / 2640.1 | 135 | 0.63 M | 0 / 3 / 0, 3 |
| far120 | high | 11:00 | 3708.2 / 7383.0 | n/a / n/a | 4149.8 / 4966.5 | 2685.7 / 3319.0 | 167 | 1.84 M | 0 / 2 / 0, 2 |
| far120 | ultra | 11:00 | 12616.2 / 12616.2 | 5283.4 / 5283.4 | 6899.7 / 6899.7 | 4686.7 / 6888.8 | 347 | 7.24 M | 0 / 1 / 0, 1 |
| far200 | low | 11:00 | 1187.5 / 1316.6 | 1134.7 / 1247.8 | 1120.8 / 1199.9 | 1055.9 / 1127.4 | 92 | 0.50 M | 8 / 0 / 0, 8 |
| far200 | medium | 11:00 | 1991.6 / 2683.3 | 2632.6 / 2662.0 | 2449.9 / 4799.8 | 2358.8 / 2581.5 | 85 | 0.49 M | 0 / 4 / 0, 4 |
| far200 | high | 11:00 | 2649.9 / 2883.3 | 2574.0 / 2739.7 | 2424.9 / 2583.2 | 2333.7 / 2519.5 | 117 | 0.59 M | 0 / 4 / 0, 4 |
| far200 | ultra | 11:00 | 3049.8 / 3049.8 | n/a / n/a | 2741.5 / 2816.6 | 3542.0 / 4378.6 | 316 | 2.41 M | 0 / 2 / 0, 2 |
| far240 | low | 11:00 | 1206.2 / 1483.3 | 1146.1 / 1414.7 | 1190.4 / 1299.9 | 1114.5 / 1184.9 | 86 | 0.51 M | 7 / 0 / 0, 7 |
| far240 | medium | 11:00 | 2855.5 / 5783.1 | 2798.0 / 2941.5 | 2433.3 / 2716.5 | 2377.6 / 2639.3 | 84 | 0.53 M | 0 / 4 / 0, 4 |
| far240 | high | 11:00 | 2949.9 / 5983.1 | 2899.7 / 2977.1 | 2408.2 / 4666.5 | 2350.5 / 2446.8 | 104 | 0.57 M | 0 / 4 / 0, 4 |
| far240 | ultra | 11:00 | 3122.1 / 9283.0 | 3122.4 / 3161.6 | 2749.9 / 2799.9 | 2976.1 / 4095.1 | 157 | 0.80 M | 0 / 2 / 0, 2 |
