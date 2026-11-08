# C4: Audio: Band v1

**Status**: Draft written alongside the audio spec; C3X finalizes the cycle id, dependencies and numbers when it writes the I2 briefs.

**Iteration**: I2. **Wave**: parallel. **Branch**: `cycle/04-audio-band-v1`.
**Depends on**: C4.0 merged (adds the audio contracts: `AudioApi`, `TuneChart`, `InstrumentDef`, `MotifShape`, `StingerDef`, and the `time.sync` messages). **Runs alongside**: the other I2 parallel cycles.

## Goal

The valley has a band. A lone nylon guitar and a hum open the day; at Village rank an upright bass and brushes join. Six original tunes follow the hour, a motif born from the valley seed shows up in the stingers, river and wind sit underneath, and UI sounds are soft and dry. Two laptops in one room can share one speaker or play in sync. Everything is client-side and never touches sim state.

## Read

- `CLAUDE.md`
- `docs/spec/18-audio.md` (all)
- `docs/spec/22-quality.md`: the audio rows (budgets, test table, definition of done)
- `docs/spec/21-networking-and-saves.md`: `time.sync`
- `docs/audio/songbook-drafts.md` and `docs/audio/motifs-and-stingers.md` (source material for the tunes, motif and stingers)

## You own

`apps/client/src/audio`, `packages/content/src/audio`, `CREDITS.md`, `apps/client/e2e/audio.spec.ts`.

Outside these paths: only small, necessary edits (registry lines, a settings panel line in `ui/panels/index.ts`, wiring `AudioApi` into app boot), listed in the PR.

## You can rely on

- C4.0 contracts: `AudioApi`, `TuneChart`, `InstrumentDef`, `MotifShape`, `StingerDef`, and the `time.sync` request and reply in `packages/protocol`.
- The Mirror signals and worker events the director reads (phase, rank, zoom, speed, paused, water and wind inputs).

## Tasks

1. **Engine and buses** (`engine.ts`): AudioContext; master > music, ambience, effects; shared reverb send; music bus high-pass at 40 Hz, saturation and light compression; ducking; unlock on first gesture; fade on hidden tab; every gain change ramped 10 ms or more.
2. **Scheduler** (`scheduler.ts`): 25 ms timer scheduling 120 ms ahead on AudioContext time.
3. **Sampler** (`sampler.ts`): lazy loading per unlocked instrument, voices, ADSR, velocity layers, round robin, stealing the quietest at 48 voices. Opus with AAC fallback, 48 kHz. Verify each sample set's license and record it in `CREDITS.md`; drop anything unclear.
4. **Instruments** (`packages/content/src/audio/instruments`): nylon guitar, upright bass, brushes, hum or whistle, gated by the `ensemble` list per rank. Registry line each.
5. **Arranger** (`band/`): pure `(chart, bar, seed, intensity, ensemble)` to note events for comp (drop-2 guitar), bass (per groove), brushes (fills at phrase ends) and melody (head in, seeded variation, head out, tag ending).
6. **Director** (`director.ts`): tune choice by phase, rank and history (seasons and weather arrive in I3); seeded by `(valley seed, in-game day, phase)`; no repeat within 25 minutes; transitions on phrase boundaries; gaps by the frequency setting; intensity 0 to 3 smoothed over a bar; pause softens with a lowpass.
7. **Six tunes** (`songbook/`), ported from `docs/audio/songbook-drafts.md`: dawn, day x2, dusk, night, and a market-day light funk groove. Each playable by guitar and hum alone. Registry line each.
8. **Valley motif**: generate from the valley seed and a `MotifShape`; range at most a 9th; resolves to a tonic chord tone; never saved.
9. **I2 stingers** (`stingers/`), from `docs/audio/motifs-and-stingers.md`: resident arrives, wish granted, pattern discovered, achievement, Charter (ensemble reveal), birth or wedding. Quantized, ducking the band 3 dB.
10. **UI sounds** (`sfx.ts`): paper rustle, soft click, pencil scratch, partner ping (plays on both seats).
11. **Ambience** (`ambience.ts`): river from water tiles near the camera, wind from height; crossfaded loops; at most 8 emitters; zoom attenuation.
12. **Same-room modes and sync** (`sync.ts`): off, shared speaker, synced. Median of 5 `time.sync` round trips, re-estimate every 60 s, grid-bar starts, ignore drift under 20 ms, correct larger drift on the next bar start. The one-time "Are you in the same room?" card for online valleys, remembered per device.
13. **Settings panel**: master, music, ambience and effects sliders, music frequency, same-room mode, play in background, mono output; one line in `ui/panels/index.ts`, values in local storage.
14. **Caption strings**: write a caption for every stinger and store it in the stinger registry even though the Captions setting lands in I5.
15. **Tests and bench**: every test listed in `18-audio.md` (below), plus an audio CPU measurement in `npm run bench`.

## Acceptance criteria

- [ ] Audio main thread averages 0.5 ms per frame or less and no more than 48 voices (bench number; a voice-stealing unit test).
- [ ] 4 MB or less compressed before the first tune; 25 MB total at City; decoded samples 120 MB or less at City; none of it in the initial JS bundle (build output check).
- [ ] First tune within 3 s of entering a valley on a warm load (Playwright timing).
- [ ] Loudness: music -18 LUFS, ambience -24, UI -20, true peak below -1 dBTP; no gain change ramped under 10 ms (OfflineAudioContext measurement and a unit test).
- [ ] Zero dropouts at Medium on a reference laptop (recording attached to the PR).
- [ ] Content test, every chart: bar count matches the form, chords parse, melody in instrument range, melody fits the chord or is an approach note on a weak beat.
- [ ] Arranger tests: deterministic for a seed, no voice moves more than a 5th between chords, bass in range, phrases end on chord tones.
- [ ] Motif tests: same seed gives the same motif, range at most a 9th, resolves.
- [ ] Director tests: no repeat within 25 minutes when the Songbook allows, transitions only on phrase boundaries, both seats choose the same tune from the same inputs.
- [ ] OfflineAudioContext render (Playwright): 30 s of each phase with no NaN, peak below -1 dBFS, RMS within 3 dB of target.
- [ ] Sync e2e: two browser contexts with simulated clock skew start a tune on the same grid bar within 20 ms.
- [ ] `CREDITS.md` lists every sample set with title, author, license, URL and changes.
- [ ] Player-chair check: play an evening. The band never repeats a tune within 25 minutes, transitions land on phrase boundaries, and two laptops in Synced mode stay within 20 ms.
- [ ] Definition of done in `docs/spec/22-quality.md`

## Out of scope

- Seasons, weather, festival tunes, diegetic music, challenge music and the remaining ambience emitters (I3).
- Piano, clarinet and the tavern piano (I4); vibraphone, horns, strings, Calm and the Captions setting (I5).

## Notes

- Audio never runs in the sim and never changes state; no `SAVE_VERSION` bump. Settings live per device in local storage.
- Both seats must pick identical tunes from identical inputs, so use only the seeded client-side RNG, never `Math.random`.
- `time.sync` is rate-limited to 1 per second and is never part of sim state.
- Tunes are original and warm, dry and witty in their titles. No em dashes anywhere.
