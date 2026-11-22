# V4 before: perf in software (V4.0)

`QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_FIXEDRES=1 QOTI_HOLD=1 QOTI_MOVE=5 QOTI_REST=5 node apps/client/e2e/v4-perf.mjs street village far120` on V4.0's branch (no change on screen against `main` 8d00cb7), the grown village in summer, 11:00, the sim paused, in the build container's software renderer (SwiftShader, no GPU timer): draws and triangles are real; milliseconds are the CPU doing the GPU's work, ratios at best, a handful of frames a part. The Settled idle column rests where the camera path ends: in software the path's zoom, scaled by frame time, ends past 240 tiles under the endpaper map (a frame of a few draws), so read it only on a laptop; the still and settling columns are at the scene's own view.
| Scene | Preset | Moving GPU ms (avg / p95) | Moving draws, triangles | Settle ms (frames, samples) | Still frame GPU ms (avg / p95), draws | Settled idle GPU ms (avg / p95) | Rest frames moving / still / idle / sample |
|---|---|---|---|---|---|---|---|
| street | low | 1899.9 / 2000.0 (frame) | 128, 0.56 M | n/a (no still-frame cache) | n/a | 2483.2 / 2633.1 (frame) | 2 / 0 / 0 / 0 |
| street | medium | 4066.5 / 4066.5 (frame) | 161, 0.87 M | 7307 (2, 0), 3638.8 frame | 3916.5 / 3916.5 (frame), 153 | 405.5 / 566.6 (frame) | 0 / 9 / 0 / 0 |
| street | high | 4683.2 / 4683.2 (frame) | 130, 1.14 M | 7932 (2, 0), 3946.7 frame | 4966.4 / 4966.4 (frame), 129 | 340.0 / 450.1 (frame) | 0 / 10 / 0 / 0 |
| street | ultra | 4816.6 / 4816.6 (frame) | 127, 1.25 M | 7219 (2, 0), 3593.5 frame | 5149.7 / 5149.7 (frame), 219 | 2383.3 / 2383.3 (frame) | 0 / 1 / 0 / 0 |
| village | low | 1999.9 / 2066.5 (frame) | 103, 0.33 M | n/a (no still-frame cache) | n/a | 2499.9 / 2583.3 (frame) | 2 / 0 / 0 / 0 |
| village | medium | 5916.4 / 5916.4 (frame) | 214, 0.75 M | 9736 (2, 0), 4856.6 frame | 5399.7 / 5399.7 (frame), 205 | 355.0 / 516.7 (frame) | 0 / 10 / 0 / 0 |
| village | high | 7533.0 / 7533.0 (frame) | 199, 1.81 M | 12837 (2, 0), 6401.5 frame | 7016.4 / 7016.4 (frame), 199 | 356.6 / 483.3 (frame) | 0 / 10 / 0 / 0 |
| village | ultra | 7283.0 / 7283.0 (frame) | 186, 2.11 M | 13904 (2, 0), 6937.9 frame | 8999.7 / 8999.7 (frame), 323 | 3266.6 / 3266.6 (frame) | 0 / 1 / 0 / 0 |
| far120 | low | 1808.3 / 1966.6 (frame) | 91, 0.37 M | n/a (no still-frame cache) | n/a | 1933.3 / 2099.9 (frame) | 2 / 0 / 0 / 0 |
| far120 | medium | 5416.4 / 5416.4 (frame) | 134, 0.53 M | 10287 (2, 0), 5119.9 frame | 5233.2 / 5233.2 (frame), 134 | 5633.1 / 5633.1 (frame) | 0 / 1 / 0 / 0 |
| far120 | high | 6566.4 / 6566.4 (frame) | 209, 1.89 M | 13215 (2, 0), 6593.0 frame | 7266.3 / 7266.3 (frame), 206 | 306.0 / 416.6 (frame) | 0 / 11 / 0 / 0 |
| far120 | ultra | 9232.9 / 9232.9 (frame) | 202, 3.84 M | 18263 (2, 0), 9118.3 frame | 12482.8 / 12482.8 (frame), 350 | 2999.8 / 2999.8 (frame) | 0 / 1 / 0 / 0 |
