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

- `apps/client/src/audio/director.ts` picks the style by hour and season and paces pieces and gaps; `composer.ts` writes a piece (A A B A, 12 to 24 bars) from a seed: bass line (walking in the evening), chords (arpeggiated guitar, comped piano, waltz oom-pah-pah, night pad), a motif melody that resolves home, brushes on two and four. Same seed, same piece.
- `synth/` renders the band (Karplus-Strong guitar and bass, an additive piano with two detuned strings and a hammer, a music box tine, brushes, a pad), nine ambience loops (loop-clean, RMS-normalized so they sit under the music) and sixteen cues, all as Float32Arrays at 22.05 kHz, in `synth/render.worker.ts`; the main thread never renders.
- `music.ts` schedules notes 0.6 s ahead on the audio clock with a little human timing and touch, and starts a piece only once its notes are rendered.
- `ambience.ts` and `scene.ts` sample about 300 tiles and the working buildings around the camera every half second; `engine.ts` fades up to eight looping voices toward those levels and pans them by screen side.
- `cues/index.ts` has one rule per cue (scene before and after each update); the player's own place and remove sounds come from the session at submit; `cues/limiter.ts` keeps a box drag to one sound and caps cues at four a second.
- `install.ts` loads the engine chunk (28 kB) on the first pointer or key press in a valley; the title screen loads nothing. The context suspends while the tab is hidden.
- Settings has sliders for everything, music, the valley and clicks and chimes, and a hush; saved per browser (`qoti.audio.v1`).
- `npm run audio:preview` (`tools/audio/demo.ts`) renders a five-minute WAV of the styles with their ambience, then every cue, to listen to outside the game.
- Small edits outside the owned paths: `audio/api.ts` gains the `built` and `emote` cue ids (additive); `input/camera.ts` exposes `look` (focus, yaw, distance); `app/session.ts` installs the engine and plays place, remove, ping and emote; `app/debug.ts` adds `__qoti.audio`; `ui/SettingsPanel.tsx`, `ui/copy.ts` and `ui/theme.css` add the sound card; root `package.json` adds `audio:fetch` and `audio:preview`.
- Not done: captions (optional), sheep and cows, the mill's creak, the plans' pencil scratch.

