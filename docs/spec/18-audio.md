# 18. Audio

A small valley band plays original tunes that follow the hour, the season and the weather, and grows with the town. Everything is client-side; audio never runs in the sim and never changes state.

**Principles served**: P46 (art made in code: the score is authored as data and played live by sampled instruments), P48 (Sound: a band that grows from a lone guitar to a little orchestra, a tune of your own, ambience from what is nearby), P1 and P51 (two players, often on two laptops in one room: they never hear two songs at once).

## The Valley Band [I2]

The band plays from a **Songbook**, the way a jazz combo plays from a fake book. Charts are data; the **Arranger** turns a chart into parts bar by bar; a **Sampler** plays real, recorded acoustic instruments. Nothing is a loop of a stock stem, so every tune fits the key, hour and season by construction.

The ensemble grows with rank, a visible reward for progress:

| Rank | Joins | Iteration |
|---|---|---|
| Hamlet | nylon guitar, a whistle | I2 |
| Village | upright bass, brushes | I2 |
| Town | upright piano, clarinet | I4 |
| Market Town | vibraphone, muted trumpet or flugelhorn | I5 |
| City | small string section, a second horn | I5 |

Each `InstrumentDef` has a `minRank`; the ensemble is every instrument at or below the town's rank. Seasonal colors (whistle, celesta, glockenspiel) are guest instruments any rank may use. Where a table below names an instrument the town has not unlocked yet, the nearest unlocked one takes its part (guitar for piano, guitar's low strings for cello). The Charter that raises a rank reveals the new player with a stinger (see Stingers); with Calm on, the new player simply enters at the next phrase.

## The Songbook [I2]

One file per tune in `packages/content/src/audio/songbook/`. Tunes are original: no covers, no recognizable melodies. Target 28 tunes by I5 (6 at I2, 14 at I3, 20 at I4).

| Field | Meaning |
|---|---|
| `title` | warm, dry, witty (see the example) |
| `key`, `meter` | tonic and mode; 4/4, 3/4 or 6/8 |
| `tempo` | `[min, max]` BPM; the director picks a seeded value inside it |
| `feel` | folk, bossa, swing, ballad, waltz, lightFunk, stomp, rubato |
| `form` | named sections and bar counts: AABA 32, ABAC, folk 16 |
| `bars` | chord symbol per bar (two symbols split the bar): maj7, maj9, 6/9, m7, m9, m11, 7, 9, 13, m7b5, sus4, slash chords |
| `melody` | notes as `[bar, beat, pitch, beats]`, per section; a beat is a quarter note in 4/4 and 3/4 and an eighth note in 6/8 (strong beats 1 and 4) |
| `tags` | phases, seasons [I3], `minRank`, moods, `festival` id, `building` (plays only when one exists, e.g. the Market Square), `diegetic` flags |

```ts
// packages/content/src/audio/songbook/porters-lament.ts (an I3 tune: it has season tags)
export const portersLament: TuneChart = {
  id: 'porters-lament',
  title: "Porter's Lament (He Carried the Piano Up the Hill)",
  key: 'Eb', meter: '4/4', tempo: [76, 88], feel: 'ballad',
  form: [{ id: 'A', bars: 8 }, { id: 'A', bars: 8 }, { id: 'B', bars: 8 }, { id: 'A', bars: 8 }],
  bars: {
    A: ['Ebmaj9', 'Cm9', 'Fm9', 'Bb13', 'Ebmaj9/G', 'Abmaj7', 'Abm6', 'Ebmaj7 Bb7sus4'],
    B: ['Gm7b5', 'C7b9', 'Fm9', 'Bb13', 'Abmaj7', 'Abm6', 'Gm7', 'Bb7sus4'],
  },
  melody: {
    A: [[1, 1, 'G4', 2], [1, 3, 'Bb4', 1.5], [2, 1, 'C5', 3], [3, 1, 'Ab4', 2] /* ... */],
    B: [[1, 1, 'D5', 2] /* ... */],
  },
  tags: { phases: ['dusk'], seasons: ['autumn', 'winter'], minRank: 'village', moods: ['wistful'] },
};
```

**Tag rules**

- A tune is eligible when the current phase and season are in its tags (an empty list means any), the town rank is at least `minRank`, and its `building` exists. Before I3 there are no seasons: the director treats season tags as any, and I2 tunes author phases only.
- Festival tunes carry a `festival` id and play only for that festival (and as its diegetic music).
- Tune choice is a pure function, so both seats agree (see Choosing the next tune).
- Every chart must be playable by the Hamlet ensemble (guitar and whistle) so a small band is never silent.

## Sound and vocabulary [I2]

Warm, melodic, jazz and funk literate. Never elevator music, never commercial pop.

**Harmony**: maj7, maj9, 6/9, m9, m11, dominant 9 and 13, sus4 resolving, backdoor ii-V (iv7 to bVII7 to I), tritone substitutions, modal interchange (minor iv in a major key), Lydian color (#11) at dawn, Dorian minor in autumn.

**Grooves**

| Groove | Where | Bass | Drums |
|---|---|---|---|
| Brushed swing | day, dusk | two-feel, walking at higher intensity | light brushes, 2 and 4 |
| Bossa nova | day, summer | root-fifth | cross-stick, soft |
| Folk 6/8 | spring, Blossom Fair | root and fifth, dotted | none or hand drum |
| Jazz waltz | winter | one-dot-dot | brushes |
| Light funk | the Market Square by day [I2], market days and the Midsummer dance [I3] | melodic, syncopated | soft four-on-the-floor, clean guitar chops |
| Stomp | Harvest Supper, autumn [I3] | root-fifth, driving | soft kick and claps on 1 and 3 |
| Rubato | dawn, night | sparse | none |

**Arranger** (pure functions from `(chart, bar, seed, intensity, ensemble)` to note events):

- Comping: voicings with smooth voice leading and guide tones; drop-2 on guitar, rootless on piano.
- Bass: line per groove above, always in range.
- Drums: brushes or a light kit pattern, fills at phrase ends.
- Melody: head in, embellished variation from chord tones and approach notes, head out. Tag ending with a ritardando and a final fermata on a 6/9 or maj9.
- Variation is seeded, never noodling: phrases stay 4 and 8 bars, call and response, a melody always resolves.

**Mix and sound quality**: clean, warm, clear. One shared convolution reverb (small outdoor space by day, a little bigger at night). Gentle tape-style saturation on the music bus, high-pass at 40 Hz, light bus compression. No harsh highs, no mud.

## What the music follows [I2, I3]

Inputs are Mirror signals and worker events; the sim never knows the music exists.

| Phase | Mood | Typical | Tempo (BPM) |
|---|---|---|---|
| Dawn | sparse, rubato, open | solo guitar (piano from Town), Lydian color | free to 72 |
| Day | bright, walking | full band at current rank, folk swing or bossa | 92 to 112 |
| Dusk | golden, jazz chords | ballad or medium swing, maj9 and 13 | 70 to 90 |
| Night | quiet, lots of air | piano and bass duo (guitar and bass before Town), soft brushes or none | 60 to 76 |

| Season [I3] | Color |
|---|---|
| Spring | lighter voicings, whistle or flute melody, more 6 and 9 |
| Summer | more groove; bossa, light funk on market days [I3] |
| Autumn | Dorian minor, clarinet or cello where unlocked, warmer and lower |
| Winter | jazz waltzes in 3/4, celesta or glockenspiel color, slower |

**Weather** [I3]: rain softens the band (lowpass on the music bus, longer reverb, fewer drums); fog thins to a duo; storm drops to held chords and a low pulse; snow adds celesta.

**Intensity** 0 to 3 (vertical layering): `a = 0.5 * build + 0.3 * zoom + 0.2 * speed`, where `build` is commands applied by either seat in the last 60 s over 30, `zoom` is 1 when fully zoomed out and 0 when fully in, `speed` is 0 at 1x and 1 at the top speed, each clamped to 0..1; intensity is `floor(a * 3.99)`, re-read once per bar, moving at most one step per phrase *(tune)*. 0 is the melody instrument and one comp; 3 is the full ensemble with fills. Zoomed in: music a touch lower, ambience higher. Zoomed out: the reverse (about 3 dB each way *(tune)*).

**Pause and speed**: paused, the band keeps playing at -6 dB behind an 800 Hz lowpass, ramped over 1 s, with no tempo change *(tune)*. Game speed never changes tempo. A hidden tab fades the master to silence over 2 s unless Play in background is on.

**Transitions** happen on phrase boundaries (4 or 8 bars), never mid-bar. A tune finishes its form before the next starts. A phase change queues the next tune; it does not cut the current one, except that a stinger for a big event may enter on the next bar.

**The music breathes**: after a tune (2 to 4 minutes) comes 30 to 120 s of ambience only *(tune)*. Silence is part of the design.

**Choosing the next tune**: the n-th tune of a phase is `pick(valley seed, day, phase, n)`, a pure function over the eligible list using a client-side seeded RNG (never `Math.random`). It excludes the tunes chosen for the previous 8 picks (about 25 minutes), which the same function recomputes, so no history is stored and both seats agree. Tempo within the tune's range and the gap after it come from the same key. In Synced and Shared speaker modes, tune starts and gap ends land on bars of the shared beat grid; in Off mode each laptop runs free with the same choices.

| Frequency setting | Gap length |
|---|---|
| Often | 15 to 45 s |
| Sometimes (default) | 30 to 120 s |
| Rarely | 120 to 300 s |

## The valley motif [I2]

At founding, a 4-bar motif is generated from the valley seed: a hand-authored `MotifShape` (contour and rhythm skeleton) plus seeded transposition, rhythm and interval variation. Always singable, range of a 9th or less, resolves to a chord tone of the tune's tonic. Both seats derive the identical motif; it is never saved.

It recurs in: the title screen for that valley, stingers, the first bar of Charter fanfares, the Chronicle, festival openings, and resident humming.

## Stingers [I2, I3, I5]

Short cues in the current key, quantized, ducking the band 3 dB. Each is a `StingerDef` in the stingers registry.

| Event | Cue | Quantize | Iteration |
|---|---|---|---|
| Resident arrives | 2-note rising figure | next beat | I2 |
| Wish granted | motif fragment | next beat | I2 |
| Pattern discovered | motif with a sus resolve | next beat | I2 |
| Achievement | motif harmonized | next bar | I2 |
| Charter earned | full fanfare with the band, new player revealed | next bar | I2 (ensemble upgrades as they land) |
| First sighting in the Field Guide | little glockenspiel figure | next beat | I3 |
| The Gate Held | motif harmonized in major, band returns | next bar | I3 |
| The Gate Fell | gentle minor reprise, never a punishment sting | next bar | I3 |
| Birth or wedding | motif waltz fragment | next bar | I2 |

**Captions** [I5]: every stinger has a caption string in the style of the game (for example "A small, hopeful tune: someone has moved in."). The Captions setting shows them in the notification area.

**Calm** [I5]: turns stingers off entirely. The band, ambience and UI sounds continue. Captions follow the Captions setting.

## Diegetic music [I3, I4]

**Festival stage and the Bandstand Green**: a positional emitter that plays the current tune in the same tempo and key as the score. The score yields to it (ducks to -9 dB *(tune)*) when the camera is near. Festival music quality (`12-hearth.md`, Music) chooses the arrangement:

| Quality tier | Arrangement | Iteration |
|---|---|---|
| No musician in town | a lone fiddle | I3 |
| Juniper Reed in town (she arrives in I2) | a trio | I3 |
| Festival held at the Bandstand Green pattern | full band plus a dance tune | I4 |
| Juniper Reed's arc complete | adds a choir: sung "oohs" on the motif | I4 |

**Tavern at night** [I4]: a muffled honky-tonk piano plays the same tune (lowpass, a little detuned), audible only when the camera is near.

**Humming**: residents whistle or hum the valley motif when happy and close to the camera. Rare, at most one at a time, never over a stinger.

**Festival tunes** [I3] (each festival gets one in the Songbook):

| Festival | Tune feel |
|---|---|
| Spring Blossom Fair | folk 6/8 |
| Midsummer Lantern Night | light funk dance |
| Harvest Supper | Dorian stomp (`stomp`) |
| Winter Hearth Feast | jazz waltz |

## Challenge music [I3]

When threat telegraphing (`14-challenge.md`) announces a trial or raid, a low ostinato enters under the band at dusk. Tension lives in the harmony (sus chords, minor iv, pedal tones), never horror. When the gate holds, the band returns with the valley motif harmonized in major (The Gate Held). If it falls, a gentle minor reprise. The ostinato is a layer, so the tune is not cut.

## Same-room co-op [I2]

Music is client-side, but both seats pick tunes and arrangement choices with the same pure `pick` (see Choosing the next tune), so both players hear the same tunes in any mode.

Settings, Audio, **Playing in the same room**:

| Mode | Behavior |
|---|---|
| Off | each laptop plays the score on its own (the default for solo and for players in different rooms) |
| Shared speaker | music plays on one laptop only (either player picks which); the other plays ambience and UI sounds only |
| Synced | both laptops play the score aligned to a shared beat grid |

**Clock sync (Synced)**: the additive `time.sync` request and reply (`21-networking-and-saves.md`) carries the server clock. On connect each client sends a burst of 5 requests, estimates the offset at each round-trip midpoint, takes the median, and re-estimates every 60 s. Times are milliseconds of the room's server clock. The first Synced tune waits for the median (well under a second), which keeps it inside the 3 s first-tune budget. Tunes start on a grid bar (grid origin is a server-time epoch per valley). The AudioContext clock is mapped to server time through the offset; drift under 20 ms is ignored, larger drift is corrected by nudging the next bar start, never by a mid-bar jump.

**Default**: for a new online valley, a small card asks once in the first session ("Are you in the same room?"), then the answer is remembered per device. A solo valley never asks.

Ambience and UI sounds stay local on each laptop. A partner's ping plays its soft sound on both.

## Ambience and UI sounds [I2, I3]

At most 8 emitters active, with distance and zoom attenuation and crossfaded loops. UI sounds and the first ambience bed (wind, river) arrive in I2.

| Emitter | Source in the Mirror | Iteration |
|---|---|---|
| River | water tiles near the camera | I2 |
| Wind | height, time of day (weather from I3) | I2 |
| Birds | habitat (trees, meadow, water), time of day | I3 |
| Market chatter | stall count and density | I3 |
| Mill creak | working mills | I3 |
| Saw and hammer | workshops and construction sites in work | I3 |
| Festival crowd | active festival attendance | I3 |
| Watch bell | Watch phase events | I3 |
| Rain, snow hush | weather | I3 |

**UI sounds** [I2]: paper rustle (panels), soft clicks, pencil scratch for plans, a soft ping for partner pings. Short, dry, never shrill.

## Engine architecture [I2]

`apps/client/src/audio/` (owned by the Audio track):

| Module | Job |
|---|---|
| `engine.ts` | AudioContext; buses master > music, ambience, effects (UI and world), per-channel gain; shared reverb send; music bus filter and saturation; ducking; unlock on first user gesture; fade on hidden tab |
| `director.ts` | MusicDirector: picks tunes by phase, season, weather, rank and history; gaps, transitions, stingers, intensity |
| `band/` | arranger and players (comp, bass, drums, melody); pure `(chart, bar, seed, intensity, ensemble)` to note events |
| `sampler.ts` | lazy sample loading per unlocked instrument, voices, ADSR, velocity layers, round robin, voice stealing |
| `scheduler.ts` | lookahead scheduler: a 25 ms timer schedules notes 120 ms ahead on AudioContext time |
| `ambience.ts` | emitters from the Mirror, crossfaded loops |
| `sfx.ts` | UI sounds and world one-shots |
| `sync.ts` | same-room modes, clock offset, beat grid |

```ts
// apps/client/src/audio/api.ts (client contract, like RenderApi)
export interface AudioApi {
  init(opts: { settings: AudioSettings }): Promise<void>;
  unlock(): Promise<void>;                       // first user gesture
  setVolumes(v: { master: number; music: number; ambience: number; effects: number }): void;
  setSameRoomMode(mode: 'off' | 'shared' | 'synced', playsMusicHere: boolean): void;
  onEvent(e: AudioEvent): void;                  // stingers, pings, UI, world one-shots
  update(f: AudioFrameState): void;              // phase, season, weather, rank, zoom, speed, paused, emitters
  dispose(): void;
}
```

**Registries** (one alphabetically sorted line each): tunes `packages/content/src/audio/songbook/index.ts`; instruments `packages/content/src/audio/instruments/index.ts`; ambience emitters `apps/client/src/audio/ambience/index.ts`; stingers `apps/client/src/audio/stingers/index.ts`.

**Content types** (additive, `packages/content/src/types.ts`): `TuneChart`, `InstrumentDef`, `MotifShape`, `StingerDef`.

**Saves**: nothing about music is in sim state. Audio settings are per device in local storage; the motif derives from the seed. No `SAVE_VERSION` bump.

## Sources and licensing [I2]

Candidates: VSCO 2 Community Edition (CC0) for orchestral and band instruments; Salamander Grand Piano (CC-BY) for piano. Verify the license of each used sample set during the cycle and record it in `CREDITS.md` (title, author, license, URL, what we changed). Anything with unclear terms is dropped.

**Formats**: Opus in WebM or Ogg, with an AAC (m4a) fallback for Safari; 48 kHz; mono samples where possible, 2 to 3 per octave, 2 velocity layers. Reverb impulse responses are short and shared. Featured recordings (title theme, Charter fanfares, festival anthems) are optional and may stream [I5].

## Settings [I2, I5]

Per device, in local storage:

| Setting | Values | Default |
|---|---|---|
| Master, Music, Ambience, Effects | 0 to 100 sliders | 80, 70, 70, 80 *(tune)* |
| Music frequency | often, sometimes, rarely | sometimes |
| Calm [I5] | off, on (no stingers) | off |
| Playing in the same room | off, shared speaker, synced | off (asked once online) |
| Play in background | off, on | off (fades when the tab is hidden) |
| Mono output | off, on | off |
| Captions [I5] | off, on | off |

## Budgets and tests

Budgets live in the table in `22-quality.md`. Summary: audio main thread 0.5 ms per frame; at most 48 voices (steal the quietest); 4 MB compressed before the first tune and 25 MB total at City, never in the initial JS budget; decoded samples 120 MB at City; first tune within 3 s of entering a valley on a warm load; loudness music -18 LUFS, ambience -24, UI -20, true peak below -1 dBTP; every gain change ramped 10 ms or more; zero dropouts on reference laptops at Medium.

Tests:

- **Content, every chart**: bar count matches the form; chord symbols parse; melody within the instrument's range; melody notes fit the chord or are approach notes on weak beats.
- **Arranger unit tests**: deterministic for a seed; voice leading moves no voice more than a 5th between chords; bass in range; phrases end on chord tones.
- **Motif**: same seed gives the same motif; range at most a 9th; resolves.
- **Director**: no repeat within 25 minutes when the Songbook allows; transitions only on phrase boundaries; both seats choose the same tune from the same inputs.
- **OfflineAudioContext render** (Playwright): render 30 s of each phase; no NaN, peak below -1 dBFS, RMS within 3 dB of target.
- **Sync**: two browser contexts with simulated clock skew start a tune on the same grid bar within 20 ms.

## Delivery by iteration

| Iteration | Scope |
|---|---|
| I2 Village | **Band v1**: engine, Songbook format, arranger for guitar, upright bass and brushes; 6 tunes (dawn, day x2, dusk, night, a Market Square light funk groove); nylon guitar, whistle, upright bass and brushes samples; valley motif; stingers for arrival, wish granted, pattern discovered, achievement, Charter, birth or wedding; UI sounds; river and wind ambience; same-room setting (both modes); volume sliders; budgets and tests. The ensemble grows Hamlet to Village. |
| I3 Seasons and the Watch | seasons and weather in the director; 8 more tunes including 4 festival tunes and 2 winter waltzes; the diegetic festival stage with the first two quality tiers; challenge music; ambience emitters; Field Guide stinger |
| I4 Town | piano and clarinet join; tavern piano; theater; the Bandstand Green tier; 6 more tunes; Juniper Reed's choir |
| I5 | vibraphone, horns, strings; Market Town and City tunes (8 more, 28 total); captions; Calm; optional featured recordings; polish |

## Working material

`docs/audio/` holds drafts the audio cycles port into data: `songbook-drafts.md` (lead sheets for the first 10 tunes), `motifs-and-stingers.md` (motif shapes, the generator, stinger notes and captions) and `sources.md` (sample libraries and their licenses). The draft brief for the I2 cycle is `docs/build/cycle-04-audio-band-v1-draft.md`.

## Audition sketch

`docs/sketches/music/index.html` is a synthesized sketch of the harmony, grooves and layering, for direction only; production uses sampled instruments.
