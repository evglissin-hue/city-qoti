# R3F perf, before (a9a51d3, cycle/r3x-integration) and after (R3F)

Software renderer in the build container (SwiftShader, no GPU): draws and triangles are real, milliseconds are the CPU doing the GPU's work and good for ratios at best. Sim held, the hour pinned, fixed resolution, 1440 x 900. Moving rows are means over V3's scripted camera path, which swing from run to run (two runs of one build differ by up to about 18 draws); the fixed-camera rows and the repeated grown village rows below are the steady comparison. Scripts: `v3-perf.mjs street village far120` (every preset, 11:00 and 22:00), `v2-perf.mjs grown` (22:00), `v3-shots.mjs street village` (day and night), `r3f-walk.mjs`.

## v3-perf, 11:00 (run a)

### before
```
street:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 11:00 | 705.1 / 866.6 | n/a / n/a | 1183.3 / 1716.6 | n/a / n/a | 122 | 0.50 M | 7 / 0 / 0, 7 |
| street | medium | 11:00 | 2170.8 / 2416.5 | n/a / n/a | 42.7 / 100.0 | n/a / n/a | 134 | 0.65 M | 0 / 24 / 64, 24 |
| street | high | 11:00 | 1627.7 / 1833.2 | n/a / n/a | 40.7 / 83.4 | n/a / n/a | 122 | 1.29 M | 0 / 21 / 69, 21 |
| street | ultra | 11:00 | 1779.9 / 1833.3 | n/a / n/a | 1447.2 / 1749.9 | n/a / n/a | 102 | 1.09 M | 0 / 6 / 0, 6 |

village:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| village | low | 11:00 | 712.8 / 800.0 | n/a / n/a | 1070.8 / 1099.9 | n/a / n/a | 102 | 0.29 M | 8 / 0 / 0, 8 |
| village | medium | 11:00 | 1939.9 / 2149.8 | n/a / n/a | 48.6 / 100.0 | n/a / n/a | 153 | 0.60 M | 0 / 23 / 62, 23 |
| village | high | 11:00 | 2833.2 / 2966.5 | n/a / n/a | 48.2 / 116.6 | n/a / n/a | 176 | 1.83 M | 0 / 25 / 58, 25 |
| village | ultra | 11:00 | 3299.9 / 3549.9 | n/a / n/a | 1580.5 / 2016.6 | n/a / n/a | 143 | 1.81 M | 0 / 6 / 0, 6 |

far120:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| far120 | low | 11:00 | 815.2 / 983.3 | n/a / n/a | 1118.7 / 1216.7 | n/a / n/a | 100 | 0.38 M | 8 / 0 / 0, 8 |
| far120 | medium | 11:00 | 2145.7 / 2316.5 | n/a / n/a | 41.2 / 83.4 | n/a / n/a | 129 | 0.57 M | 0 / 24 / 64, 24 |
| far120 | high | 11:00 | 3066.6 / 3233.2 | n/a / n/a | 56.5 / 116.6 | n/a / n/a | 185 | 2.07 M | 0 / 24 / 60, 24 |
| far120 | ultra | 11:00 | 4283.2 / 4366.4 | n/a / n/a | 1430.5 / 1616.6 | n/a / n/a | 178 | 3.25 M | 0 / 6 / 0, 6 |

headless (software renderer), lean engine, fixed resolution, sim paused, 1440 x 900, 10 s moving, 10 s idle:

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 11:00 | 705.1 / 866.6 | n/a / n/a | 1183.3 / 1716.6 | n/a / n/a | 122 | 0.50 M | 7 / 0 / 0, 7 |
| street | medium | 11:00 | 2170.8 / 2416.5 | n/a / n/a | 42.7 / 100.0 | n/a / n/a | 134 | 0.65 M | 0 / 24 / 64, 24 |
| street | high | 11:00 | 1627.7 / 1833.2 | n/a / n/a | 40.7 / 83.4 | n/a / n/a | 122 | 1.29 M | 0 / 21 / 69, 21 |
| street | ultra | 11:00 | 1779.9 / 1833.3 | n/a / n/a | 1447.2 / 1749.9 | n/a / n/a | 102 | 1.09 M | 0 / 6 / 0, 6 |
| village | low | 11:00 | 712.8 / 800.0 | n/a / n/a | 1070.8 / 1099.9 | n/a / n/a | 102 | 0.29 M | 8 / 0 / 0, 8 |
| village | medium | 11:00 | 1939.9 / 2149.8 | n/a / n/a | 48.6 / 100.0 | n/a / n/a | 153 | 0.60 M | 0 / 23 / 62, 23 |
| village | high | 11:00 | 2833.2 / 2966.5 | n/a / n/a | 48.2 / 116.6 | n/a / n/a | 176 | 1.83 M | 0 / 25 / 58, 25 |
| village | ultra | 11:00 | 3299.9 / 3549.9 | n/a / n/a | 1580.5 / 2016.6 | n/a / n/a | 143 | 1.81 M | 0 / 6 / 0, 6 |
| far120 | low | 11:00 | 815.2 / 983.3 | n/a / n/a | 1118.7 / 1216.7 | n/a / n/a | 100 | 0.38 M | 8 / 0 / 0, 8 |
| far120 | medium | 11:00 | 2145.7 / 2316.5 | n/a / n/a | 41.2 / 83.4 | n/a / n/a | 129 | 0.57 M | 0 / 24 / 64, 24 |
| far120 | high | 11:00 | 3066.6 / 3233.2 | n/a / n/a | 56.5 / 116.6 | n/a / n/a | 185 | 2.07 M | 0 / 24 / 60, 24 |
| far120 | ultra | 11:00 | 4283.2 / 4366.4 | n/a / n/a | 1430.5 / 1616.6 | n/a / n/a | 178 | 3.25 M | 0 / 6 / 0, 6 |
```

### after
```
street:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 11:00 | 703.5 / 1099.9 | n/a / n/a | 1033.3 / 1099.9 | n/a / n/a | 124 | 0.52 M | 8 / 0 / 0, 8 |
| street | medium | 11:00 | 1611.1 / 1766.6 | n/a / n/a | 42.1 / 83.4 | n/a / n/a | 140 | 0.73 M | 0 / 21 / 67, 21 |
| street | high | 11:00 | 1619.4 / 1733.2 | n/a / n/a | 43.6 / 83.4 | n/a / n/a | 119 | 1.21 M | 0 / 21 / 67, 21 |
| street | ultra | 11:00 | 1783.3 / 1833.2 | n/a / n/a | 1516.6 / 1849.9 | n/a / n/a | 101 | 1.09 M | 0 / 6 / 0, 6 |

village:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| village | low | 11:00 | 702.4 / 800.0 | n/a / n/a | 1129.1 / 1233.2 | n/a / n/a | 104 | 0.31 M | 8 / 0 / 0, 8 |
| village | medium | 11:00 | 2120.8 / 2316.5 | n/a / n/a | 39.0 / 83.4 | n/a / n/a | 157 | 0.59 M | 0 / 24 / 65, 24 |
| village | high | 11:00 | 2799.9 / 2899.8 | n/a / n/a | 37.8 / 83.4 | n/a / n/a | 178 | 1.89 M | 0 / 23 / 66, 23 |
| village | ultra | 11:00 | 3072.1 / 3116.5 | n/a / n/a | 1361.9 / 1616.7 | n/a / n/a | 143 | 1.85 M | 0 / 7 / 0, 7 |

far120:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| far120 | low | 11:00 | 815.3 / 933.4 | n/a / n/a | 1077.1 / 1116.6 | n/a / n/a | 100 | 0.38 M | 8 / 0 / 0, 8 |
| far120 | medium | 11:00 | 2091.6 / 2250.0 | n/a / n/a | 38.9 / 83.4 | n/a / n/a | 128 | 0.58 M | 0 / 23 / 66, 23 |
| far120 | high | 11:00 | 3005.4 / 3149.9 | n/a / n/a | 45.2 / 100.0 | n/a / n/a | 185 | 2.06 M | 0 / 26 / 61, 26 |
| far120 | ultra | 11:00 | 4216.4 / 4316.4 | n/a / n/a | 1447.2 / 1683.4 | n/a / n/a | 177 | 3.28 M | 0 / 6 / 0, 6 |

headless (software renderer), lean engine, fixed resolution, sim paused, 1440 x 900, 10 s moving, 10 s idle:

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 11:00 | 703.5 / 1099.9 | n/a / n/a | 1033.3 / 1099.9 | n/a / n/a | 124 | 0.52 M | 8 / 0 / 0, 8 |
| street | medium | 11:00 | 1611.1 / 1766.6 | n/a / n/a | 42.1 / 83.4 | n/a / n/a | 140 | 0.73 M | 0 / 21 / 67, 21 |
| street | high | 11:00 | 1619.4 / 1733.2 | n/a / n/a | 43.6 / 83.4 | n/a / n/a | 119 | 1.21 M | 0 / 21 / 67, 21 |
| street | ultra | 11:00 | 1783.3 / 1833.2 | n/a / n/a | 1516.6 / 1849.9 | n/a / n/a | 101 | 1.09 M | 0 / 6 / 0, 6 |
| village | low | 11:00 | 702.4 / 800.0 | n/a / n/a | 1129.1 / 1233.2 | n/a / n/a | 104 | 0.31 M | 8 / 0 / 0, 8 |
| village | medium | 11:00 | 2120.8 / 2316.5 | n/a / n/a | 39.0 / 83.4 | n/a / n/a | 157 | 0.59 M | 0 / 24 / 65, 24 |
| village | high | 11:00 | 2799.9 / 2899.8 | n/a / n/a | 37.8 / 83.4 | n/a / n/a | 178 | 1.89 M | 0 / 23 / 66, 23 |
| village | ultra | 11:00 | 3072.1 / 3116.5 | n/a / n/a | 1361.9 / 1616.7 | n/a / n/a | 143 | 1.85 M | 0 / 7 / 0, 7 |
| far120 | low | 11:00 | 815.3 / 933.4 | n/a / n/a | 1077.1 / 1116.6 | n/a / n/a | 100 | 0.38 M | 8 / 0 / 0, 8 |
| far120 | medium | 11:00 | 2091.6 / 2250.0 | n/a / n/a | 38.9 / 83.4 | n/a / n/a | 128 | 0.58 M | 0 / 23 / 66, 23 |
| far120 | high | 11:00 | 3005.4 / 3149.9 | n/a / n/a | 45.2 / 100.0 | n/a / n/a | 185 | 2.06 M | 0 / 26 / 61, 26 |
| far120 | ultra | 11:00 | 4216.4 / 4316.4 | n/a / n/a | 1447.2 / 1683.4 | n/a / n/a | 177 | 3.28 M | 0 / 6 / 0, 6 |
```

### Combined

| Scene | Preset | Draws b/a | Tris b/a | Moving ms b/a | Idle ms b/a | GPU ms |
|---|---|---|---|---|---|---|
| street | low | 122 / 124 | 0.50 M / 0.52 M | 705.1 / 703.5 | 1183.3 / 1033.3 | n/a |
| street | medium | 134 / 140 | 0.65 M / 0.73 M | 2170.8 / 1611.1 | 42.7 / 42.1 | n/a |
| street | high | 122 / 119 | 1.29 M / 1.21 M | 1627.7 / 1619.4 | 40.7 / 43.6 | n/a |
| street | ultra | 102 / 101 | 1.09 M / 1.09 M | 1779.9 / 1783.3 | 1447.2 / 1516.6 | n/a |
| village | low | 102 / 104 | 0.29 M / 0.31 M | 712.8 / 702.4 | 1070.8 / 1129.1 | n/a |
| village | medium | 153 / 157 | 0.60 M / 0.59 M | 1939.9 / 2120.8 | 48.6 / 39.0 | n/a |
| village | high | 176 / 178 | 1.83 M / 1.89 M | 2833.2 / 2799.9 | 48.2 / 37.8 | n/a |
| village | ultra | 143 / 143 | 1.81 M / 1.85 M | 3299.9 / 3072.1 | 1580.5 / 1361.9 | n/a |
| far120 | low | 100 / 100 | 0.38 M / 0.38 M | 815.2 / 815.3 | 1118.7 / 1077.1 | n/a |
| far120 | medium | 129 / 128 | 0.57 M / 0.58 M | 2145.7 / 2091.6 | 41.2 / 38.9 | n/a |
| far120 | high | 185 / 185 | 2.07 M / 2.06 M | 3066.6 / 3005.4 | 56.5 / 45.2 | n/a |
| far120 | ultra | 178 / 177 | 3.25 M / 3.28 M | 4283.2 / 4216.4 | 1430.5 / 1447.2 | n/a |

## v3-perf, 22:00 (run b)

### before
```
street:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 22:00 | 726.9 / 900.0 | n/a / n/a | 1018.7 / 1133.4 | n/a / n/a | 121 | 0.52 M | 8 / 0 / 0, 8 |
| street | medium | 22:00 | 1746.6 / 1950.0 | n/a / n/a | 35.6 / 83.4 | n/a / n/a | 128 | 0.68 M | 0 / 24 / 65, 24 |
| street | high | 22:00 | 1641.6 / 1783.3 | n/a / n/a | 39.5 / 83.4 | n/a / n/a | 117 | 1.19 M | 0 / 21 / 67, 21 |
| street | ultra | 22:00 | 1793.3 / 1816.6 | n/a / n/a | 1547.1 / 1766.5 | n/a / n/a | 101 | 1.09 M | 0 / 6 / 0, 6 |

village:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| village | low | 22:00 | 794.4 / 949.9 | n/a / n/a | 1089.5 / 1133.2 | n/a / n/a | 107 | 0.32 M | 8 / 0 / 0, 8 |
| village | medium | 22:00 | 2154.1 / 2300.0 | n/a / n/a | 52.1 / 116.6 | n/a / n/a | 154 | 0.59 M | 0 / 26 / 57, 26 |
| village | high | 22:00 | 2922.1 / 2983.2 | n/a / n/a | 52.2 / 100.0 | n/a / n/a | 174 | 1.87 M | 0 / 27 / 58, 27 |
| village | ultra | 22:00 | 3272.1 / 3333.1 | n/a / n/a | 1461.1 / 1683.2 | n/a / n/a | 139 | 1.81 M | 0 / 6 / 0, 6 |

far120:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| far120 | low | 22:00 | 808.3 / 983.3 | n/a / n/a | 895.0 / 1200.0 | n/a / n/a | 98 | 0.38 M | 10 / 0 / 0, 10 |
| far120 | medium | 22:00 | 2266.6 / 2533.2 | n/a / n/a | 42.3 / 83.4 | n/a / n/a | 129 | 0.57 M | 0 / 23 / 65, 23 |
| far120 | high | 22:00 | 3049.9 / 3183.3 | n/a / n/a | 55.7 / 100.0 | n/a / n/a | 183 | 2.05 M | 0 / 23 / 63, 23 |
| far120 | ultra | 22:00 | 4374.8 / 4416.4 | n/a / n/a | 1383.3 / 1583.3 | n/a / n/a | 175 | 3.24 M | 0 / 7 / 0, 7 |

headless (software renderer), lean engine, fixed resolution, sim paused, 1440 x 900, 10 s moving, 10 s idle:

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 22:00 | 726.9 / 900.0 | n/a / n/a | 1018.7 / 1133.4 | n/a / n/a | 121 | 0.52 M | 8 / 0 / 0, 8 |
| street | medium | 22:00 | 1746.6 / 1950.0 | n/a / n/a | 35.6 / 83.4 | n/a / n/a | 128 | 0.68 M | 0 / 24 / 65, 24 |
| street | high | 22:00 | 1641.6 / 1783.3 | n/a / n/a | 39.5 / 83.4 | n/a / n/a | 117 | 1.19 M | 0 / 21 / 67, 21 |
| street | ultra | 22:00 | 1793.3 / 1816.6 | n/a / n/a | 1547.1 / 1766.5 | n/a / n/a | 101 | 1.09 M | 0 / 6 / 0, 6 |
| village | low | 22:00 | 794.4 / 949.9 | n/a / n/a | 1089.5 / 1133.2 | n/a / n/a | 107 | 0.32 M | 8 / 0 / 0, 8 |
| village | medium | 22:00 | 2154.1 / 2300.0 | n/a / n/a | 52.1 / 116.6 | n/a / n/a | 154 | 0.59 M | 0 / 26 / 57, 26 |
| village | high | 22:00 | 2922.1 / 2983.2 | n/a / n/a | 52.2 / 100.0 | n/a / n/a | 174 | 1.87 M | 0 / 27 / 58, 27 |
| village | ultra | 22:00 | 3272.1 / 3333.1 | n/a / n/a | 1461.1 / 1683.2 | n/a / n/a | 139 | 1.81 M | 0 / 6 / 0, 6 |
| far120 | low | 22:00 | 808.3 / 983.3 | n/a / n/a | 895.0 / 1200.0 | n/a / n/a | 98 | 0.38 M | 10 / 0 / 0, 10 |
| far120 | medium | 22:00 | 2266.6 / 2533.2 | n/a / n/a | 42.3 / 83.4 | n/a / n/a | 129 | 0.57 M | 0 / 23 / 65, 23 |
| far120 | high | 22:00 | 3049.9 / 3183.3 | n/a / n/a | 55.7 / 100.0 | n/a / n/a | 183 | 2.05 M | 0 / 23 / 63, 23 |
| far120 | ultra | 22:00 | 4374.8 / 4416.4 | n/a / n/a | 1383.3 / 1583.3 | n/a / n/a | 175 | 3.24 M | 0 / 7 / 0, 7 |
```

### after
```
street:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 22:00 | 765.3 / 916.7 | n/a / n/a | 1104.1 / 1250.0 | n/a / n/a | 123 | 0.54 M | 8 / 0 / 0, 8 |
| street | medium | 22:00 | 1686.6 / 1866.6 | n/a / n/a | 45.1 / 100.0 | n/a / n/a | 128 | 0.68 M | 0 / 26 / 61, 26 |
| street | high | 22:00 | 1803.3 / 1916.5 | n/a / n/a | 49.9 / 116.7 | n/a / n/a | 102 | 0.91 M | 0 / 23 / 60, 23 |
| street | ultra | 22:00 | 1816.6 / 1933.3 | n/a / n/a | 1505.5 / 1816.7 | n/a / n/a | 102 | 1.09 M | 0 / 6 / 0, 6 |

village:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| village | low | 22:00 | 712.8 / 816.6 | n/a / n/a | 1075.0 / 1100.0 | n/a / n/a | 99 | 0.28 M | 8 / 0 / 0, 8 |
| village | medium | 22:00 | 2066.6 / 2166.6 | n/a / n/a | 39.2 / 83.4 | n/a / n/a | 157 | 0.59 M | 0 / 22 / 65, 22 |
| village | high | 22:00 | 2894.3 / 2999.9 | n/a / n/a | 39.9 / 83.4 | n/a / n/a | 156 | 1.51 M | 0 / 23 / 66, 23 |
| village | ultra | 22:00 | 3188.8 / 3216.6 | n/a / n/a | 1472.2 / 1666.6 | n/a / n/a | 142 | 1.84 M | 0 / 6 / 0, 6 |

far120:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| far120 | low | 22:00 | 833.3 / 933.3 | n/a / n/a | 1145.2 / 1183.3 | n/a / n/a | 98 | 0.36 M | 7 / 0 / 0, 7 |
| far120 | medium | 22:00 | 2187.4 / 2316.6 | n/a / n/a | 39.4 / 83.4 | n/a / n/a | 131 | 0.57 M | 0 / 23 / 65, 23 |
| far120 | high | 22:00 | 3099.9 / 3299.9 | n/a / n/a | 39.8 / 83.4 | n/a / n/a | 183 | 2.04 M | 0 / 23 / 66, 23 |
| far120 | ultra | 22:00 | 4133.2 / 4149.9 | n/a / n/a | 1425.0 / 1699.9 | n/a / n/a | 176 | 3.29 M | 0 / 6 / 0, 6 |

headless (software renderer), lean engine, fixed resolution, sim paused, 1440 x 900, 10 s moving, 10 s idle:

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| street | low | 22:00 | 765.3 / 916.7 | n/a / n/a | 1104.1 / 1250.0 | n/a / n/a | 123 | 0.54 M | 8 / 0 / 0, 8 |
| street | medium | 22:00 | 1686.6 / 1866.6 | n/a / n/a | 45.1 / 100.0 | n/a / n/a | 128 | 0.68 M | 0 / 26 / 61, 26 |
| street | high | 22:00 | 1803.3 / 1916.5 | n/a / n/a | 49.9 / 116.7 | n/a / n/a | 102 | 0.91 M | 0 / 23 / 60, 23 |
| street | ultra | 22:00 | 1816.6 / 1933.3 | n/a / n/a | 1505.5 / 1816.7 | n/a / n/a | 102 | 1.09 M | 0 / 6 / 0, 6 |
| village | low | 22:00 | 712.8 / 816.6 | n/a / n/a | 1075.0 / 1100.0 | n/a / n/a | 99 | 0.28 M | 8 / 0 / 0, 8 |
| village | medium | 22:00 | 2066.6 / 2166.6 | n/a / n/a | 39.2 / 83.4 | n/a / n/a | 157 | 0.59 M | 0 / 22 / 65, 22 |
| village | high | 22:00 | 2894.3 / 2999.9 | n/a / n/a | 39.9 / 83.4 | n/a / n/a | 156 | 1.51 M | 0 / 23 / 66, 23 |
| village | ultra | 22:00 | 3188.8 / 3216.6 | n/a / n/a | 1472.2 / 1666.6 | n/a / n/a | 142 | 1.84 M | 0 / 6 / 0, 6 |
| far120 | low | 22:00 | 833.3 / 933.3 | n/a / n/a | 1145.2 / 1183.3 | n/a / n/a | 98 | 0.36 M | 7 / 0 / 0, 7 |
| far120 | medium | 22:00 | 2187.4 / 2316.6 | n/a / n/a | 39.4 / 83.4 | n/a / n/a | 131 | 0.57 M | 0 / 23 / 65, 23 |
| far120 | high | 22:00 | 3099.9 / 3299.9 | n/a / n/a | 39.8 / 83.4 | n/a / n/a | 183 | 2.04 M | 0 / 23 / 66, 23 |
| far120 | ultra | 22:00 | 4133.2 / 4149.9 | n/a / n/a | 1425.0 / 1699.9 | n/a / n/a | 176 | 3.29 M | 0 / 6 / 0, 6 |
```

### Combined

| Scene | Preset | Draws b/a | Tris b/a | Moving ms b/a | Idle ms b/a | GPU ms |
|---|---|---|---|---|---|---|
| street | low | 121 / 123 | 0.52 M / 0.54 M | 726.9 / 765.3 | 1018.7 / 1104.1 | n/a |
| street | medium | 128 / 128 | 0.68 M / 0.68 M | 1746.6 / 1686.6 | 35.6 / 45.1 | n/a |
| street | high | 117 / 102 | 1.19 M / 0.91 M | 1641.6 / 1803.3 | 39.5 / 49.9 | n/a |
| street | ultra | 101 / 102 | 1.09 M / 1.09 M | 1793.3 / 1816.6 | 1547.1 / 1505.5 | n/a |
| village | low | 107 / 99 | 0.32 M / 0.28 M | 794.4 / 712.8 | 1089.5 / 1075.0 | n/a |
| village | medium | 154 / 157 | 0.59 M / 0.59 M | 2154.1 / 2066.6 | 52.1 / 39.2 | n/a |
| village | high | 174 / 156 | 1.87 M / 1.51 M | 2922.1 / 2894.3 | 52.2 / 39.9 | n/a |
| village | ultra | 139 / 142 | 1.81 M / 1.84 M | 3272.1 / 3188.8 | 1461.1 / 1472.2 | n/a |
| far120 | low | 98 / 98 | 0.38 M / 0.36 M | 808.3 / 833.3 | 895.0 / 1145.2 | n/a |
| far120 | medium | 129 / 131 | 0.57 M / 0.57 M | 2266.6 / 2187.4 | 42.3 / 39.4 | n/a |
| far120 | high | 183 / 183 | 2.05 M / 2.04 M | 3049.9 / 3099.9 | 55.7 / 39.8 | n/a |
| far120 | ultra | 175 / 176 | 3.24 M / 3.29 M | 4374.8 / 4133.2 | 1383.3 / 1425.0 | n/a |

## v2-perf grown, 22:00, Medium and High (run c)

### before
```
grown:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| grown | medium | 22:00 | 1497.2 / 2266.6 | n/a / n/a | 714.3 / 2683.2 | n/a / n/a | 115 | 0.45 M | 0 / 3 / 9, 3 |
| grown | high | 22:00 | 2938.8 / 2999.9 | n/a / n/a | 47.5 / 100.0 | n/a / n/a | 155 | 1.43 M | 0 / 24 / 64, 24 |

headless (software renderer), lean engine, fixed resolution, sim paused, 1440 x 900, 10 s moving, 10 s idle:

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| grown | medium | 22:00 | 1497.2 / 2266.6 | n/a / n/a | 714.3 / 2683.2 | n/a / n/a | 115 | 0.45 M | 0 / 3 / 9, 3 |
| grown | high | 22:00 | 2938.8 / 2999.9 | n/a / n/a | 47.5 / 100.0 | n/a / n/a | 155 | 1.43 M | 0 / 24 / 64, 24 |
```

### after
```
grown:
| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| grown | medium | 22:00 | 1447.2 / 2133.3 | n/a / n/a | 322.6 / 2433.3 | n/a / n/a | 119 | 0.44 M | 0 / 3 / 16, 3 |
| grown | high | 22:00 | 2838.8 / 2933.3 | n/a / n/a | 40.2 / 99.9 | n/a / n/a | 175 | 1.82 M | 0 / 24 / 64, 24 |

headless (software renderer), lean engine, fixed resolution, sim paused, 1440 x 900, 10 s moving, 10 s idle:

| Scene | Preset | Hour | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|---|
| grown | medium | 22:00 | 1447.2 / 2133.3 | n/a / n/a | 322.6 / 2433.3 | n/a / n/a | 119 | 0.44 M | 0 / 3 / 16, 3 |
| grown | high | 22:00 | 2838.8 / 2933.3 | n/a / n/a | 40.2 / 99.9 | n/a / n/a | 175 | 1.82 M | 0 / 24 / 64, 24 |
```

### Combined

| Scene | Preset | Draws b/a | Tris b/a | Moving ms b/a | Idle ms b/a | GPU ms |
|---|---|---|---|---|---|---|
| grown | medium | 115 / 119 | 0.45 M / 0.44 M | 1497.2 / 1447.2 | 714.3 / 322.6 | n/a |
| grown | high | 155 / 175 | 1.43 M / 1.82 M | 2938.8 / 2838.8 | 47.5 / 40.2 | n/a |

## Rows where after costs more draws or triangles

All within the scripted path's swing: other rows move the other way by as much (run b's street on High 117 to 102, village on High 174 to 156), R3F adds no draw by day, and the fixed cameras and the repeated grown village rows below are level.

- run a street low: draws +2, tris +0.02 M
- run a street medium: draws +6, tris +0.08 M
- run a village low: draws +2, tris +0.02 M
- run a village medium: draws +4, tris -0.01 M
- run a village high: draws +2, tris +0.06 M
- run a village ultra: draws +0, tris +0.04 M
- run a far120 medium: draws -1, tris +0.01 M
- run a far120 ultra: draws -1, tris +0.03 M
- run b street low: draws +2, tris +0.02 M
- run b street ultra: draws +1, tris +0.00 M
- run b village medium: draws +3, tris +0.00 M
- run b village ultra: draws +3, tris +0.03 M
- run b far120 medium: draws +2, tris +0.00 M
- run b far120 ultra: draws +1, tris +0.05 M
- run c grown medium: draws +4, tris -0.01 M
- run c grown high: draws +20, tris +0.39 M
## Fixed cameras and the grown village on High, twice each

### R3F before (a9a51d3) vs after (31ab29b), medium 1440x900

| Scene | Shot | Draws b/a | Triangles b/a | Frame ms b/a |
|---|---|---|---|---|
| street | day | 27/27 | 0.03 M/0.03 M | 0.9/1.7 |
| street | night | 25/25 | 0.03 M/0.03 M | 1.3/1.9 |
| village | day | 39/39 | 0.03 M/0.03 M | 1.2/1.5 |
| village | night | 30/35 | 0.03 M/0.03 M | 1.3/1.3 |

### Grown, High, 22:00

| Run | Draws | Triangles | Moving ms avg | Idle ms avg |
|---|---|---|---|---|
| before 1 | 158 | 1.55 M | 2861.0 | 2555.4 |
| before 2 | 158 | 1.55 M | 2827.7 | 2449.9 |
| after 1 | 156 | 1.55 M | 2861.0 | 2494.3 |
| after 2 | 155 | 1.53 M | 2877.7 | 2555.5 |

## The round at rest (r3f-walk.mjs)

```
| 12.75 | 0 | 0 | 1 | 1 | yes |
| 13 | 0 | 0 | 1 | 1 | yes |
| 13.25 | 0 | 0 | 1 | 1 | yes |
| 13.5 | 0 | 0 | 1 | 1 | yes |
| 13.75 | 0 | 0 | 1 | 1 | yes |
| 14 | 0 | 0 | 1 | 1 | yes |
| 14.25 | 0 | 0 | 1 | 1 | yes |
| 14.5 | 0 | 0 | 1 | 1 | yes |
| 14.75 | 0 | 0 | 1 | 1 | yes |
| 15 | 0 | 0 | 1 | 1 | yes |
| 15.25 | 0 | 0 | 1 | 1 | yes |
| 15.5 | 0 | 0 | 1 | 1 | yes |
| 15.75 | 0 | 0 | 1 | 1 | yes |
| 16 | 0 | 0 | 1 | 1 | yes |
| 16.25 | 0 | 0 | 1 | 1 | yes |
| 16.5 | 0 | 0 | 1 | 1 | yes |
| 16.75 | 0 | 0 | 1 | 1 | yes |
| 17 | 0 | 0 | 1 | 1 | yes |
| 17.25 | 0 | 0 | 1 | 1 | yes |
| 17.5 | 0 | 1 | 1 | 1 | yes |
| 17.5 | 1 | 1 | 1 | 0 |  |
| 17.5 | 2 | 1 | 1 | 0 |  |
| 17.5 | 3 | 1 | 1 | 0 |  |
| 17.75 | 3 | 1 | 2 | 1 | yes |
| 17.75 | 4 | 1 | 1 | 0 |  |
| 17.75 | 5 | 1 | 1 | 0 |  |
| 17.75 | 6 | 1 | 1 | 0 |  |
| 18 | 19 | 2 | 2 | 1 | yes |
| 18 | 20 | 1 | 1 | 0 |  |
| 18 | 21 | 1 | 1 | 0 |  |
| 18 | 22 | 1 | 1 | 0 |  |
| 18.25 | 22 | 1 | 2 | 1 | yes |
| 18.25 | 23 | 1 | 1 | 0 |  |
| 18.25 | 24 | 1 | 1 | 0 |  |
| 18.25 | 25 | 1 | 1 | 0 |  |
| 18.5 | 25 | 1 | 2 | 1 | yes |
| 18.5 | 26 | 1 | 1 | 0 |  |
| 18.5 | 27 | 1 | 1 | 0 |  |
| 18.5 | 28 | 1 | 1 | 0 |  |
| 18.75 | 28 | 0 | 1 | 1 | yes |

lamp steps 15; light map redraws a lamp step at most 1; shadow renders on lamp steps 0; redraws logged 28, ms min 0.20 median 0.40 max 55.90 (discs 573)
```
