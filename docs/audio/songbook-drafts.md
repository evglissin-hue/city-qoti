# Songbook drafts: the first 10 tunes

These are composed lead sheet drafts for the I2 and I3 audio cycles. Six tunes are for I2 (dawn, two for day, dusk, night, a Market Square groove) and four are festival tunes for I3. A later cycle ports each one to `TuneChart` data in `packages/content/src/audio/songbook/`. The source of truth for the format is `docs/spec/18-audio.md`; where this file differs, the spec wins. All tunes are original.

Conventions used below:

- Melody notes are `[bar, beat, pitch, beats]`. Beat 1 starts the bar; halves are offbeats. In 4/4 and 3/4 a beat is a quarter note. In 6/8 a "beat" here is one eighth note, so a bar has 6 and the strong beats are 1 and 4.
- Chord bars are separated by " | ", 4 bars per line. Two symbols in one bar split it in half (in 3/4 the second symbol takes beat 3).
- Strong-beat notes are chord tones (extensions such as the 9th, 11th and 13th count). Weak-beat notes may be passing or approach tones.
- Only the A section melody is written out; B melodies are left for the porting cycle to derive in the same style.
- Where a bar says `B4` over a flat-9 or Cb spelling, it is the enharmonic note.
- Season tags on the six I2 tunes take effect from I3; before then the director treats them as any (`18-audio.md`, Tag rules).
- Every chart must remain playable by guitar and whistle at Hamlet; piano parts fall to guitar, bass parts to guitar low strings until the upright joins.

---

## 1. Rooster Negotiations (Nobody Won)

Mood: unhurried, first light, a little smug about the dew.

| Field | Value |
|---|---|
| key | F Lydian (F major with B natural) |
| meter | 4/4 |
| tempo | 54 to 66 |
| feel | rubato |
| form | A 8, B 8, A 8 (24 bars) |
| tags | phases: dawn; seasons: any; minRank: hamlet; moods: calm, hopeful |

Changes:

```
A: Fmaj7#11 | G6/9 | Fmaj9 | Am9
   Bbmaj7#11 | Gm9 | Gm7 C13 | Fmaj9
B: Dm9 | G13 | Fmaj7#11 | Em7 A7sus4
   Bbmaj9 | Am7 D7 | Gm9 C13 | Fmaj9
```

Melody, A (range F4 to E5):

```ts
A: [
  [1, 1, 'F4', 2], [1, 3, 'A4', 1], [1, 4, 'B4', 1],
  [2, 1, 'A4', 2], [2, 3, 'G4', 2],
  [3, 1, 'C5', 3], [3, 4, 'B4', 1],
  [4, 1, 'A4', 2], [4, 3, 'C5', 2],
  [5, 1, 'D5', 2], [5, 3, 'E5', 2],
  [6, 1, 'D5', 2], [6, 3, 'Bb4', 2],
  [7, 1, 'G4', 2], [7, 3, 'E4', 1], [7, 4, 'Bb4', 1],
  [8, 1, 'F4', 4],
]
```

Arranging: no drums. Guitar rolls each chord slowly (open voicings, #11 on top at intensity 0); bass only on bar downbeats, roots and fifths, with the hum carrying the head. At intensity 3 add a second melodic pass an octave up and let the bass answer in the gaps. Ends with a fermata on Fmaj9.

---

## 2. The Baker Is Never Late (The Clock Is Early)

Mood: sunny, brisk, a man on a bicycle with strong opinions about rolls.

| Field | Value |
|---|---|
| key | G major |
| meter | 4/4 |
| tempo | 108 to 120 |
| feel | swing |
| form | AABA, 8 bars each (32 bars) |
| tags | phases: day; seasons: spring, summer, autumn; minRank: hamlet; moods: cheerful |

Changes:

```
A: G6/9 | E7 | Am9 | D13
   Bm7 E7 | Am7 D7 | G6/9 Em7 | Am7 D7
B: Am9 | D13 | Gmaj9 | Em9
   Cm7 | F13 | Gmaj9 | Am7 D7
```

The Cm7 to F13 to Gmaj9 in B is a backdoor ii-V. On the last A, bar 8 is a tag: G6/9 held, melody `[8, 1, 'G4', 4]`.

Melody, A (range F#4 to E5):

```ts
A: [
  [1, 1, 'B4', 1.5], [1, 2.5, 'D5', 0.5], [1, 3, 'E5', 2],
  [2, 1, 'D5', 1], [2, 2, 'B4', 1], [2, 3, 'G#4', 2],
  [3, 1, 'A4', 1.5], [3, 2.5, 'C5', 0.5], [3, 3, 'E5', 2],
  [4, 1, 'D5', 1], [4, 2, 'C5', 1], [4, 3, 'A4', 2],
  [5, 1, 'B4', 2], [5, 3, 'G#4', 2],
  [6, 1, 'A4', 2], [6, 3, 'F#4', 2],
  [7, 1, 'G4', 1.5], [7, 2.5, 'B4', 0.5], [7, 3, 'E5', 1], [7, 4, 'D5', 1],
  [8, 1, 'A4', 2], [8, 3, 'F#4', 2],
]
```

Arranging: brushed swing, brushes on 2 and 4; bass in a two-feel, walking quarter notes from the B section at intensity 2 and up. Guitar comps drop-2 voicings on 2 and 4. At intensity 0 it is guitar and hum only; at 3 the second A is an embellished variation with call and response between hum and guitar.

---

## 3. Siesta Is a Municipal Service

Mood: shutters half closed, warm stone, nothing urgent has ever happened.

| Field | Value |
|---|---|
| key | C major |
| meter | 4/4 |
| tempo | 100 to 114 |
| feel | bossa |
| form | A 8, B 8, A 8 (24 bars) |
| tags | phases: day; seasons: spring, summer; minRank: hamlet; moods: lazy, warm |

Changes:

```
A: Cmaj9 | Am9 | Dm9 | G13
   Em7 A7 | Dm9 | Db13 | Cmaj9
B: Fmaj9 | Em7 A7b13 | Dm9 | G13
   Fm7 | Bb13 | Cmaj9 | Cmaj9 G7sus4
```

Bar 7 of A is a tritone substitution (Db13 for G13). B ends with a backdoor (Fm7 to Bb13 to Cmaj9) and the minor iv colors the turn.

Melody, A (range A4 to F5):

```ts
A: [
  [1, 1, 'E5', 1.5], [1, 2.5, 'D5', 0.5], [1, 3, 'C5', 2],
  [2, 1, 'E5', 1], [2, 2, 'C5', 1], [2, 3, 'A4', 2],
  [3, 1, 'D5', 1.5], [3, 2.5, 'E5', 0.5], [3, 3, 'F5', 1], [3, 4, 'E5', 1],
  [4, 1, 'D5', 2], [4, 3, 'B4', 2],
  [5, 1, 'B4', 2], [5, 3, 'C#5', 2],
  [6, 1, 'D5', 2], [6, 3, 'A4', 2],
  [7, 1, 'F5', 1], [7, 2, 'Db5', 1], [7, 3, 'B4', 2],
  [8, 1, 'C5', 4],
]
```

Arranging: bass root and fifth (bossa pattern), cross-stick drums at low volume, guitar plays the syncopated bossa comp with 9th and 13th voicings. At intensity 0 only guitar and soft bass; at 3 add brushes ghost notes and the hum doubling the head.

---

## 4. The Last Streetlamp Takes Its Time

Mood: dusk settles, the lamplighter is not paid by the hour and acts like it.

| Field | Value |
|---|---|
| key | Ab major |
| meter | 4/4 |
| tempo | 68 to 80 |
| feel | ballad |
| form | A 8, A 8, B 8, A 8 (32 bars) |
| tags | phases: dusk; seasons: autumn, winter; minRank: village; moods: wistful, tender |

Changes:

```
A: Abmaj9 | Fm9 | Bbm9 | Eb13
   Abmaj7 Ab7 | Dbmaj9 | Dbm6 | Abmaj9 Eb7sus4
B: Cm7b5 | F7b9 | Bbm9 | Eb13
   Dbmaj9 | Dbm6 | Cm7 Bbm7 | Eb7sus4 Eb7
```

Dbm6 is the minor iv borrowed from the parallel minor.

Melody, A (range G4 to F5):

```ts
A: [
  [1, 1, 'Eb5', 2], [1, 3, 'C5', 1], [1, 4, 'Bb4', 1],
  [2, 1, 'C5', 3], [2, 4, 'Eb5', 1],
  [3, 1, 'Db5', 2], [3, 3, 'Bb4', 2],
  [4, 1, 'Bb4', 2], [4, 3, 'C5', 1], [4, 4, 'G4', 1],
  [5, 1, 'Eb5', 2], [5, 3, 'C5', 2],
  [6, 1, 'F5', 2], [6, 3, 'Db5', 2],
  [7, 1, 'Db5', 2], [7, 3, 'Bb4', 2],
  [8, 1, 'C5', 4],
]
```

Arranging: light brushes, two-feel bass with long notes; guitar spreads wide 9th voicings. At intensity 0 guitar alone, slow arpeggios; at 3 the upright walks the B section and the hum takes the high line. Ritardando and fermata on the last Abmaj9.

---

## 5. Two Chairs, One Candle, No Reservations

Mood: the tavern is closed, the music is not, and the last two people are in no rush.

| Field | Value |
|---|---|
| key | D major |
| meter | 4/4 |
| tempo | 56 to 68 |
| feel | rubato |
| form | A 8, B 8, A 8 (24 bars) |
| tags | phases: night; seasons: any; minRank: village; moods: intimate, dreamy; diegetic: tavern |

Changes:

```
A: Dmaj9 | Bm11 | Em9 | A13
   F#m7 B7 | Em9 | Eb13 | Dmaj9
B: Gmaj9 | Gm6 | F#m7 | B7b9
   Em9 | A13 | Dmaj9 | Em7 A7
```

Eb13 in A is a tritone substitution for A13. Written as a piano and upright bass duo; before the town has a piano the guitar takes the piano part.

Melody, A (range F#4 to E5):

```ts
A: [
  [1, 1, 'F#4', 2], [1, 3, 'A4', 1], [1, 4, 'C#5', 1],
  [2, 1, 'B4', 2], [2, 3, 'E5', 2],
  [3, 1, 'D5', 2], [3, 3, 'B4', 2],
  [4, 1, 'C#5', 2], [4, 3, 'E4', 2],
  [5, 1, 'A4', 2], [5, 3, 'D#5', 2],
  [6, 1, 'E5', 2], [6, 3, 'B4', 2],
  [7, 1, 'Bb4', 2], [7, 3, 'G4', 2],
  [8, 1, 'F#4', 4],
]
```

Arranging: no drums. Rootless voicings in the comping, free time (the Arranger stretches each bar by a seeded amount); bass plays sparse long roots and occasional fifths. At intensity 0 only bass and a single melody line; at 3 fuller left hand with inner-voice movement and a slow walking line in B.

---

## 6. Peaches Firm, Opinions Firmer

Mood: market day, a crowd, a scale that is definitely rigged in someone's favor.

| Field | Value |
|---|---|
| key | E Dorian |
| meter | 4/4 |
| tempo | 96 to 108 |
| feel | lightFunk |
| form | A 8, B 8 (16 bars, repeated) |
| tags | phases: day; seasons: summer, spring; minRank: village; moods: busy, playful; building: market-square (market days favor it from I3) |

Changes:

```
A: Em9 | A13 | Em9 | A13
   Gmaj9 | F#m7b5 B7b9 | Em9 | Em9
B: Cmaj9 | Bm7 | Em9 | A13
   Gmaj9 | Cmaj7#11 | Bm7 E7 | Em9
```

Melody, A (range E4 to F#5):

```ts
A: [
  [1, 1, 'B4', 0.5], [1, 1.5, 'D5', 1], [1, 3, 'E5', 0.5], [1, 3.5, 'D5', 0.5], [1, 4, 'B4', 1],
  [2, 1, 'C#5', 0.5], [2, 1.5, 'E5', 1], [2, 3, 'A4', 1], [2, 4, 'G4', 1],
  [3, 1, 'B4', 0.5], [3, 1.5, 'D5', 1], [3, 3, 'E5', 1], [3, 4, 'F#5', 1],
  [4, 1, 'E5', 2], [4, 3, 'C#5', 2],
  [5, 1, 'D5', 1.5], [5, 2.5, 'B4', 0.5], [5, 3, 'G4', 2],
  [6, 1, 'A4', 2], [6, 3, 'D#5', 2],
  [7, 1, 'E5', 1.5], [7, 2.5, 'B4', 0.5], [7, 3, 'G4', 2],
  [8, 1, 'B4', 1.5], [8, 2.5, 'G4', 0.5], [8, 3, 'E4', 2],
]
```

Bass figure, 2 bars over Em9 then A13 (eighths and a sixteenth push):

```ts
bass: [
  [1, 1, 'E2', 0.5], [1, 1.75, 'E3', 0.25], [1, 2.5, 'G2', 0.5], [1, 3, 'B2', 0.5], [1, 4, 'D3', 0.5], [1, 4.5, 'E3', 0.5],
  [2, 1, 'A2', 0.5], [2, 2, 'C#3', 0.5], [2, 2.5, 'E3', 0.5], [2, 3.5, 'G3', 0.5], [2, 4.5, 'A2', 0.5],
]
```

Arranging: melodic syncopated bass as above, soft four-on-the-floor kick with a closed-hat 16th feel, clean guitar chops on the offbeats (2 and the "and" of 4). Intensity 0: bass and chops only, melody in the hum; intensity 3: add ghost-note snare, a bass fill into each B bar 4, and a second guitar line over the changes.

---

## 7. Petals in the Pie (A Gentle Warning)

Mood: the Blossom Fair, a lot of cheerful chaos, one pie with more flowers than filling.

| Field | Value |
|---|---|
| key | D major |
| meter | 6/8 |
| tempo | 96 to 110 (dotted quarter) |
| feel | folk |
| form | A 8, B 8, A 8 (24 bars) |
| tags | phases: day; seasons: spring; minRank: hamlet; moods: festive; festival: blossom-fair |

Changes:

```
A: D6/9 | Bm7 | Gmaj9 | A7sus4
   D6/9 | F#m7 | Em9 A13 | D6/9
B: Gmaj9 | D/F# | Em9 | A7sus4
   Bm7 | Gmaj7 Gm6 | D6/9 Bm7 | Em7 A7
```

Melody, A (beats are eighths; range F#4 to E5):

```ts
A: [
  [1, 1, 'F#4', 2], [1, 3, 'A4', 1], [1, 4, 'D5', 3],
  [2, 1, 'B4', 2], [2, 3, 'A4', 1], [2, 4, 'F#4', 3],
  [3, 1, 'G4', 2], [3, 3, 'B4', 1], [3, 4, 'D5', 3],
  [4, 1, 'E5', 2], [4, 3, 'D5', 1], [4, 4, 'A4', 3],
  [5, 1, 'A4', 2], [5, 3, 'B4', 1], [5, 4, 'D5', 3],
  [6, 1, 'C#5', 2], [6, 3, 'A4', 1], [6, 4, 'F#4', 3],
  [7, 1, 'B4', 3], [7, 4, 'C#5', 3],
  [8, 1, 'D5', 6],
]
```

Arranging: root and fifth bass in a dotted pattern (strong 1, softer 4), hand drum or none; guitar strums a lilting 6/8 with open strings ringing, whistle or celesta may double the head at intensity 2 and up. Intensity 0 is guitar and bass only; 3 adds the hand drum and the hum in thirds.

---

## 8. Lantern Night Is Mandatory (Gently)

Mood: a long warm evening, string lights, a dance floor nobody admits to wanting.

| Field | Value |
|---|---|
| key | F major |
| meter | 4/4 |
| tempo | 112 to 124 |
| feel | lightFunk |
| form | A 8, B 8, A 8 (24 bars) |
| tags | phases: dusk, night; seasons: summer; minRank: village; moods: joyful, danceable; festival: midsummer-lantern-night |

Changes:

```
A: Fmaj9 | Dm9 | Gm9 | C13
   Fmaj9 | Dm9 | Gm9 C13 | Fmaj9
B: Bbmaj9 | Bbm7 | Eb13 | Fmaj9 Dm7
   Gm9 | Gb13 | Fmaj9 | C13
```

Bbm7 to Eb13 to Fmaj9 is a backdoor ii-V; Gb13 is a tritone substitution for C13.

Melody, A (range A4 to F5):

```ts
A: [
  [1, 1, 'C5', 0.5], [1, 1.5, 'A4', 0.5], [1, 2, 'C5', 1], [1, 3, 'E5', 0.5], [1, 3.5, 'C5', 0.5], [1, 4, 'A4', 1],
  [2, 1, 'D5', 1.5], [2, 2.5, 'F5', 0.5], [2, 3, 'A4', 1], [2, 4, 'C5', 1],
  [3, 1, 'Bb4', 0.5], [3, 1.5, 'D5', 1], [3, 3, 'F5', 1.5], [3, 4.5, 'D5', 0.5],
  [4, 1, 'E5', 1.5], [4, 2.5, 'C5', 0.5], [4, 3, 'Bb4', 2],
  [5, 1, 'A4', 0.5], [5, 1.5, 'C5', 0.5], [5, 2, 'E5', 1], [5, 3, 'F5', 1.5], [5, 4.5, 'E5', 0.5],
  [6, 1, 'D5', 2], [6, 3, 'C5', 0.5], [6, 3.5, 'A4', 0.5], [6, 4, 'A4', 1],
  [7, 1, 'D5', 2], [7, 3, 'E5', 2],
  [8, 1, 'A4', 1], [8, 2, 'C5', 1], [8, 3, 'F5', 2],
]
```

Bass figure, 2 bars over Fmaj9 then Dm9:

```ts
bass: [
  [1, 1, 'F2', 0.5], [1, 1.75, 'F3', 0.25], [1, 2.5, 'C3', 0.5], [1, 3.5, 'A2', 0.5], [1, 4.5, 'C3', 0.5],
  [2, 1, 'D3', 0.5], [2, 1.75, 'D2', 0.25], [2, 2.5, 'A2', 0.5], [2, 3, 'C3', 0.5], [2, 4, 'D3', 0.5], [2, 4.5, 'F3', 0.5],
]
```

Arranging: soft four-on-the-floor kick, open hat on the offbeat, clean guitar chops in 16th scratches; bass as written, octave pops on the "and" of 1. Intensity 0: kick and chops only, a lighter bass; intensity 3: full kit, bass fill at bars 4 and 8, hum doubling the head.

---

## 9. Second Helpings, Third Opinions

Mood: a long table, an honest stomp, someone is certain there is more gravy.

| Field | Value |
|---|---|
| key | D Dorian |
| meter | 4/4 |
| tempo | 100 to 112 |
| feel | folk |
| form | A 8, A 8, B 8, A 8 (32 bars) |
| tags | phases: dusk, night; seasons: autumn; minRank: hamlet; moods: earthy, communal; festival: harvest-supper |

Changes:

```
A: Dm9 | G13 | Dm11 | Cmaj9
   Dm9 | G13 | Fmaj9 Em7 | Dm9
B: Fmaj9 | Cmaj9 | Dm9 | G13
   Fmaj9 | Em7 | A7sus4 | Dm9
```

The major IV (G13) is the Dorian signature.

Melody, A (range D4 to E5):

```ts
A: [
  [1, 1, 'D4', 1], [1, 2, 'F4', 1], [1, 3, 'A4', 2],
  [2, 1, 'B4', 1], [2, 2, 'A4', 1], [2, 3, 'G4', 2],
  [3, 1, 'F4', 1], [3, 2, 'A4', 1], [3, 3, 'C5', 2],
  [4, 1, 'G4', 1], [4, 2, 'B4', 1], [4, 3, 'C5', 2],
  [5, 1, 'D5', 1], [5, 2, 'C5', 1], [5, 3, 'A4', 2],
  [6, 1, 'B4', 1], [6, 2, 'D5', 1], [6, 3, 'E5', 2],
  [7, 1, 'C5', 2], [7, 3, 'B4', 1], [7, 4, 'G4', 1],
  [8, 1, 'A4', 1], [8, 2, 'F4', 1], [8, 3, 'D4', 2],
]
```

Arranging: stomping folk groove, bass on roots with a heavy beat 1 and a walk to the next root on beat 4; no drums, or a stomped kick and clap for intensity 2 and up. Guitar strums open Dorian voicings with a hammered 6th. Intensity 0: guitar and hum; 3: bass pickups into each phrase and call and response between hum and guitar.

---

## 10. Chestnuts Under Advisement

Mood: a fire, a blanket, and a warning that the chestnuts will pop.

| Field | Value |
|---|---|
| key | Eb major |
| meter | 3/4 |
| tempo | 120 to 138 |
| feel | waltz |
| form | A 8, B 8, A 8 (24 bars) |
| tags | phases: dusk, night; seasons: winter; minRank: hamlet; moods: cozy, gentle; festival: winter-hearth-feast |

Changes:

```
A: Ebmaj9 | Cm9 | Fm9 | Bb13
   Gm7 C7 | Fm9 | Abmaj7 Abm6 | Ebmaj9 Bb7sus4
B: Abmaj9 | Abm7 | Db13 | Ebmaj9
   Gm7b5 | C7b9 | Fm9 | Bb7sus4
```

Abm7 to Db13 to Ebmaj9 is a backdoor ii-V; Abm6 in A is the minor iv.

Melody, A (3/4; range G4 to Eb5, one low Ab4):

```ts
A: [
  [1, 1, 'G4', 2], [1, 3, 'Bb4', 1],
  [2, 1, 'C5', 2], [2, 3, 'Bb4', 1],
  [3, 1, 'C5', 1], [3, 2, 'Eb5', 1], [3, 3, 'C5', 1],
  [4, 1, 'D5', 2], [4, 3, 'Bb4', 1],
  [5, 1, 'D5', 2], [5, 3, 'E5', 1],
  [6, 1, 'C5', 2], [6, 3, 'Ab4', 1],
  [7, 1, 'Eb5', 2], [7, 3, 'Ab4', 1],
  [8, 1, 'G4', 3],
]
```

Arranging: jazz waltz, bass one-dot-dot, brushes lightly circling; guitar comps on beats 2 and 3 with rich 9th voicings. Intensity 0: guitar alone, a soft pulse; 3: walking bass on the B section, brush fills at phrase ends, celesta or glockenspiel on the head as a seasonal guest.
