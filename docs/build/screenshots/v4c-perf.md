# V4C: a tea break's frames, by preset

The grown village (`?debug&fixture=grown`), 1280 x 800, in the build container's software renderer (SwiftShader): draws and triangles are real, milliseconds are ratios at best and each 8 s phase holds only a few frames. `QOTI_CHROMIUM=/opt/pw-browsers/chromium node apps/client/e2e/v4c-tea-break.mjs perf` (V4C's port 5263; these runs used 5273). Each preset runs a tea break for 8 s, then a scripted turn of the camera by hand for 8 s (a moving path) for comparison.

A tea break is a moving camera: every one of its frames is `moving` (no `still`, `idle` or `sample` frame), so the still frame and its refinement never run under one. Its draws and triangles sit at or under the hand-turned path on every preset and far inside the moving budgets (`22-quality.md`: Low and Medium 300 draws, High and Ultra 450; 1.5, 3, 6 and 12 M triangles), since it looks from 26 to 34 tiles rather than the player's 70.

## By day (11:00): the busiest place's circle (34 tiles, 45 degrees)

| Preset | Camera | Frames | Modes | Draws P50 / P95 | Triangles P50 / P95 | Frame ms P50 / P95 |
|---|---|---|---|---|---|---|
| low | tea break | 7 | moving 7 | 84 / 123 | 187053 / 281809 | 5.5 / 9.0 |
| low | turning by hand | 6 | moving 6 | 82 / 83 | 207762 / 207762 | 3.7 / 7.4 |
| medium | tea break | 3 | moving 3 | 134 / 136 | 461438 / 467332 | 6.3 / 14.9 |
| medium | turning by hand | 3 | still 1, moving 2 | 134 / 200 | 598122 / 968708 | 5.0 / 5.8 |
| high | tea break | 3 | moving 3 | 131 / 131 | 937612 / 939378 | 6.0 / 9.0 |
| high | turning by hand | 3 | still 1, moving 2 | 132 / 181 | 1083865 / 2012012 | 5.1 / 6.2 |
| ultra | tea break | 3 | moving 3 | 124 / 124 | 1003748 / 1120369 | 7.9 / 8.7 |
| ultra | turning by hand | 2 | still 1, moving 1 | 293 / 293 | 3286408 / 3286408 | 12.1 / 12.1 |

## In the evening (18:15, the grown village run on a day by `r2x-evening-save.ts`): a follow on the round (26 tiles)

| Preset | Camera | Frames | Modes | Draws P50 / P95 | Triangles P50 / P95 | Frame ms P50 / P95 |
|---|---|---|---|---|---|---|
| low | tea break | 6 | moving 6 | 93 / 95 | 190110 / 190859 | 4.0 / 11.9 |
| low | turning by hand | 6 | moving 6 | 90 / 90 | 211047 / 211051 | 5.3 / 14.1 |
| medium | tea break | 3 | moving 3 | 161 / 161 | 471930 / 482298 | 6.3 / 7.2 |
| medium | turning by hand | 3 | still 1, moving 2 | 161 / 226 | 612250 / 983958 | 4.0 / 7.5 |
| high | tea break | 3 | moving 3 | 147 / 147 | 953048 / 1037309 | 4.0 / 11.9 |
| high | turning by hand | 2 | still 1, moving 1 | 196 / 196 | 2026717 / 2026717 | 8.0 / 8.0 |
| ultra | tea break | 3 | moving 3 | 140 / 140 | 1024572 / 1043573 | 7.3 / 12.3 |
| ultra | turning by hand | 2 | still 1, moving 1 | 328 / 328 | 3364070 / 3364070 | 11.2 / 11.2 |

The hand-turned path's `still` frame is its first, before the turn starts. The frames' names: `v4c-grown-day-0.png` to `-5.png` (the circle) and `v4c-grown-evening-0.png` to `-7.png` (the follow gliding in from the player's 70-tile view), 1.5 s apart.
