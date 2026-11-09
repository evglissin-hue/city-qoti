# Valley Band sketch

`index.html` is a standalone Web Audio page: a small band synthesized in the browser, playing seven original tunes that follow the time of day, season, rank, weather and intensity, with stingers and a seeded valley motif. It is a direction study for the game's music, not game code. Nothing in `apps/` or `packages/` imports it. Open the file in a browser and press Play.

## Note for whoever merges next

This came from a session that started on a stale branch (forked before C1), so it touches nothing outside this folder and the CHANGELOG line. It was merged into `main` while other systems were being merged by a separate session. If you are merging after it, there is nothing to reconcile: no code, contracts, saves or spec files changed.

## Mix chain (worth porting to `apps/client/src/audio/engine.ts`)

- Persistent channel strips per instrument: trim, EQ, StereoPanner, post-pan reverb send. Notes connect to their strip; no per-note panners.
- Reverb: 18 ms pre-delay, HP 240 Hz, convolver with early reflections, LP 7.5 kHz, returned after the saturator.
- Music bus: two cascaded 32 Hz highpasses, -1.5 dB at 320 Hz, +1.5 dB shelf at 10 kHz, gentle `tanh(1.6x)` saturation.
- Master: glue compressor, makeup gain, limiter, soft clipper with a -1 dBFS ceiling. Chrome's DynamicsCompressor adds hidden makeup gain (about +4.8 dB at ratio 2, threshold -16), so compensate for it.
- Phase trims so dawn and night sit about 2.5 dB under day.

The game's engine today has one compressor (threshold -14, ratio 3) before the output and no limiter or bus EQ.

## Measured (headless Chromium, 14 s per scene, BS.1770 loudness)

| Scene | Before | After | Peak after | Correlation after |
|---|---|---|---|---|
| Day, village | -7.8 LUFS, 6 clipped samples | -18.1 | -6.2 dBFS | 0.87 |
| Day, city, market funk | -7.3 | -17.0 | -6.8 | 0.81 |
| Dusk, town | -8.7 | -18.7 | -8.5 | 0.80 |
| Dusk, city, rain | -8.0 | -17.4 | -7.3 | 0.75 |
| Night, town | -10.5 | -20.5 | -9.2 | 0.81 |
| Dawn, hamlet | -12.0 | -20.5 | -10.5 | 0.81 |

Before the pass every scene was mono (correlation 0.99 or more). The performance is also humanized: seeded micro-timing and velocity, metric accents, up and down strums, a singing top note in piano chords, phrase arcs, walking bass shaping and ghost brushes.

## Ideas from the sketch session not yet in the game

Drafted against the old spec and kept in git history (commit `3442843`): an ensemble that grows with rank (a lone guitar in the hamlet to strings in the city), a valley motif generated from the seed that recurs in stingers, stingers in the current key quantized to the beat, festival music tiers, challenge music, and a same-room setting so two laptops never play two songs at once (one speaker, or synced to a shared beat grid). Songbook lead sheets for 10 tunes and 12 motif shapes are in that commit under `docs/audio/`.
