# C5G: Music and sound

**Iteration**: I3. **Wave**: parallel. **Branch**: `cycle/05g-audio`.
**Depends on**: C5.0 merged. **Runs alongside**: C5A to C5F, C5H. **Ports**: client 5197, relay 8807.

## Goal

The valley sounds like a cozy evening in: gentle acoustic and jazz-tinged music that follows the hour and the season, ambience from what is near the camera (the river, wind, birds by the woods, crickets at night, the mill, the saw, the smithy, market chatter, sheep and cows, rain, the festival crowd, the watch bell), and soft sounds for placing, removing, coins, letters, pings and the rank-up. Every recording is CC0, credited and fetched by a script. Sound never changes the simulation and costs nothing on the frame budget.

## Read

- `CLAUDE.md`, `docs/build/i3-wave-notes.md` (audio handshakes), `docs/spec/17-presentation.md` (Audio), `docs/spec/01-principles.md` (P48)
- `docs/spec/22-quality.md` (budgets)

## You own

- `apps/client/src/audio/**` (behind the `api.ts` contract C5.0 adds), `apps/client/public/audio/**`, `tools/audio/**`
- The audio section of the Settings panel (sliders) and its keys in `apps/client/src/ui/settings.ts`

Outside these paths: only small, necessary edits (the line that starts the audio engine in the client, a cue call where no event exists), listed in the PR.

## You can rely on

The client's render mirror (tiles, buildings, agents in view), the camera focus and zoom, the sim events the client already receives (`building.*`, `story.step`, `rank.*`, ledger sales, pings and emotes), and the I3 events from C5.0 (`season.started`, `weather.updated`, `festival.*`, `raid.*`, `watch.ringBell`). `audio/api.ts` from C5.0 with a no-op stub, so other tracks can call `audio.cue(id)` before you land.

## Tasks

1. **Sources, CC0 only**: pick recordings from CC0 sources (Freesound filtered to CC0, OpenGameArt filtered to CC0, Kenney audio packs, FreePD, Free Music Archive's CC0 tag; public domain recordings from Musopen only where the recording itself is marked public domain or CC0). No CC-BY, no "royalty free" licenses. Record each file in `tools/audio/manifest.json` (id, source page URL, download URL, author, license, sha256 of the original).
2. **Fetch and process**: `npm run audio:fetch` (in `tools/audio`) downloads from the manifest, checks each hash, trims, normalizes loudness (music -18 LUFS, ambience -22, effects -16) and transcodes to AAC `.m4a` (music stereo 96 kbps, ambience and effects mono 64 kbps) with ffmpeg. Commit the processed files and `apps/client/public/audio/CREDITS.md` (generated, one line per file). If the environment blocks downloads, commit the manifest and the script, say so in the PR, and leave the human the one command to run.
3. **Engine**: a Web Audio graph (master, then music, ambience, effects and interface buses), started on the first user gesture, suspended while the tab is hidden, with volume per bus and mute in Settings (saved per browser, not in the valley). Music streams through a media element; short sounds are decoded lazily and cached. No audio loads before the title screen is done.
4. **Music director**: playlists by time of day (morning, afternoon, evening, night) and by season (a winter set), a 4 s crossfade at phase changes, quiet gaps of 20 to 90 s between tracks, never one of the last two tracks again, and the music ducks under letters, the rank-up and the raid.
5. **Ambience**: emitters from what is in view around the camera focus (river and pond tiles, forest tiles by day, open grass at night for crickets, wind on high ground and when zoomed out, working workplaces by kind, market stalls by density, pens with animals, rain and storm from the weather, the festival crowd, the bell), at most 8 voices, loudness by distance and zoom, pan by screen position, fading in and out over a second.
6. **Effects**: cues for place, remove, a site finished, a sale (soft coins), a letter, a ping, an emote, a pattern found, an achievement and the rank-up, mapped from events in `audio/cues/index.ts` (one line per cue); rate-limited so a box drag of 40 houses plays one sound.
7. **Captions** (optional, if time allows): short captions for the bell, the howl and the raid for players with sound off.

## Acceptance criteria

- [ ] Every file in `public/audio` has a manifest line with a CC0 or public domain license and its source page; `CREDITS.md` is generated from the manifest; a unit test fails if a file has no manifest line.
- [ ] Unit tests for the director (hour and season to playlist, no repeats, gaps), emitter choice and loudness, and cue rate limits.
- [ ] e2e: the title screen loads no audio; after the first click the audio context is running; the sliders change bus gains; no console errors.
- [ ] Main-thread audio work under 0.3 ms a frame in the village fixture; audio adds nothing to initial load; at most 25 MB of audio in total, music at most 16 MB.
- [ ] Nothing in `packages/sim` imports or reads audio; golden scripts unchanged.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Layered stems that follow the town's size (I5, if CC0 stems are found), positional 3D audio, voice lines, captions for every cue (I5).

## Notes

- P48 asks for stems that follow the hour and the season; with CC0 recordings, whole tracks by phase with crossfades are the honest version. Note the gap in `17-presentation.md`.
- Keep files short and loop-clean for ambience (8 to 30 s with a crossfaded loop point).

## As built

The CC0 hosts (Freesound, OpenGameArt, Kenney, FreePD, the Free Music Archive, Musopen, archive.org) were blocked by the build environment's network policy, so every sound is synthesized in the browser instead, which the owner allowed. The manifest, `npm run audio:fetch` (hash check, trim, loudnorm, AAC) and the manifest test are in place for recordings added later.

Later, with the owner's go-ahead, the band gained recordings: VSCO-2 CE (CC0, cloned from GitHub) for the piano (Ivy Audio's upright, every major third, two dynamics), the double bass pizzicato, the string section (cellos, violas and violins by register), the flute, the clarinet (new), the harp (new) and the marimba. `npm run audio:samples -- <checkout>` (`tools/audio/samples.ts`) checks each note's pitch, trims and cuts it, matches its loudness to the synthesized instrument it replaces and writes mono AAC plus the zone table (`audio/sampler.zones.ts`); `audio/sampler.ts` picks the nearest note of the same touch and retunes it, and the music player waits up to 8 s for a piece's recordings before the synth stands in. 163 files, 6.9 MB (budget 16 MB). Clarinet leads join spring mornings, autumn and evenings; the harp arpeggiates autumn and leads some winter mornings and nights.

Second pass (after the owner's first listen: "not great, needs way more attention"):

- **Instruments** (`synth/instruments.ts`, rendered at 32 kHz in `synth/render.worker.ts`):
  - **Nylon guitar and upright bass**: tuned plucked strings. Karplus-Strong with an allpass for the fractional delay, a pluck-point comb, a fingertip lowpass and wooden body modes. The first pass rounded the delay to whole samples, so high notes sat up to 35 cents flat.
  - **Felt piano**: up to 18 stretched partials shaped by a hammer lowpass and the strike point. Two or three strings a hair apart, with a double decay. Tuned so the partials that set the heard pitch sit on the note.
  - **Electric piano**: two-operator FM.
  - **Mallets**: marimba, vibraphone with its tremolo, celesta, glockenspiel and kalimba, as struck bars with modal partials.
  - **Flute**: breath and delayed vibrato.
  - **Strings**: three detuned soft sawtooths.
  - **Drums**: brushes, a ride and a shaker.
  - Every instrument renders a soft and a firm touch, so a firm note is brighter as well as louder.
- **Styles** (`director.ts`):

  | When | Style |
  |---|---|
  | Spring morning | fingerpicked guitar and flute or kalimba, a shaker |
  | Summer morning | arpeggiated guitar and marimba |
  | Winter morning | rolling piano and celesta, strings |
  | Afternoon | piano and vibraphone, bass, brushes |
  | Autumn afternoon | minor key; guitar and piano or flute, strings |
  | Evening | electric piano comping, walking bass, vibraphone, a swung ride (0.63) |
  | Night | celesta over strings, a pedal bass |
  | Winter afternoons, evenings and nights | a waltz: oom-pah-pah piano, celesta, strings |

- **Composition** (`composer.ts`):
  - **Form**: intro, A, A with a new ending, B, A again as it first was, then an outro. The last A has a glockenspiel doubling.
  - **Phrases**: four-bar phrases; the first ends away from home, the second comes home. B hands back to the theme.
  - **Melody**: chord tones on the strong beats and steps between them (over 85% of moves are steps), an arched contour, and a second bar that answers the first a step away.
  - **Accompaniment**: chords voice-led to the nearest inversion, rootless in the evening. Comp, bass and drum figures suit the style.
  - **Timing**: a slowing outro, a player's small looseness, and the lead laid back a few milliseconds.
- **Mix** (`music.ts`):
  - Levels set by measurement: lead on top, the comp 3 to 5 dB under, bass 6 to 8, drums 10 to 15.
  - Pianos spread across the stereo field by pitch.
  - A damper release on struck notes, and a release on held ones.
- **Effects** (`synth/cues.ts`):
  - Built from the band's own instruments: a marimba knock for placing, kalimba for finished sites and pings, celesta and paper for letters, glockenspiel arpeggios for patterns and achievements, piano and glockenspiel for the rank-up.
  - The musical cues are tuned to the key of the music now playing.
  - The bell is struck bronze, with its hum, prime, tierce, quint and nominal.
- **Ambience** (`synth/ambience.ts`):
  - A brook made of about 90 bubbles a second over a moving bed.
  - Four kinds of bird: a warbler, a tit, a sparrow and a wood pigeon.
  - Dense rain with the odd drip from the eaves, and four crickets.
  - A new hearth crackle near homes on winter days and cold autumn evenings.
- **Bank** (`bank.ts`): least recently used sounds go first under a 32 MB cap. A piece's notes render in the worker in 0.1 to 4.4 s, inside the quiet before it.
- **Preview**: `npm run audio:preview -- out.wav` mixes eight styles, with their ambience, then every cue, the way the engine plays them.
- **Edits outside the owned paths**:
  - `audio/api.ts` gains the `built` and `emote` cue ids (additive).
  - `input/camera.ts` exposes `look` (focus, yaw and distance).
  - `app/session.ts` installs the engine and plays place, remove, ping and emote.
  - `app/debug.ts` adds `__qoti.audio`.
  - `ui/SettingsPanel.tsx`, `ui/copy.ts` and `ui/theme.css` add the sound card.
  - The root `package.json` adds `audio:fetch` and `audio:preview`.
- **Not done**: captions (optional), sheep and cows, the mill's creak, and the plans' pencil scratch.
