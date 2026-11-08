# Valley motif shapes, generator and stinger designs

Source: `docs/spec/18-audio.md`, "The valley motif" and "Stingers". Iteration tags follow the spec. Values marked *(tune)* are starting points for the ear.

## Part 1: The valley motif generator

The motif runs in the client audio engine, not in `packages/sim`, so `Math` functions are allowed. It must still be a pure function of the valley seed: both seats derive the identical motif and it is never saved.

### Notation

- Degrees are major-scale degrees. `1` is the tonic, `8` is the tonic an octave up, `9` is the 2nd above that. A trailing comma means the octave below (`5,` is the 5th below the tonic, degree -2).
- Rhythm is beats per note in 4/4, one entry per contour note. Every shape sums to 16 beats (4 bars).
- Singable rule: span from lowest to highest degree is a 9th or less (highest minus lowest is at most 8 steps). Ending note is 1, 3 or 5 in any octave, or 8, which counts as 1.

### Twelve hand-authored shapes

| id | name | contour | rhythm (beats) | character |
|---|---|---|---|---|
| `porch-light` | Porch Light | 3 5 6 5 3 5 8 7 6 5 3 | 1 1 1 1 1 1 2 / 1 1 2 4 | Steady and welcoming, a lamp left on. |
| `kettle-on` | Kettle On | 5 5 6 5 8 7 / 5 5 6 5 9 7 5 | 1 1 1 1 2 2 / 1 1 1 1 1 1 2 | Bustling, a little proud of itself. |
| `river-stones` | River Stones | 1 2 3 2 1 2 3 5 / 3 2 3 5 6 5 3 | 1 .5 .5 1 1 1 1 2 / 1 1 1 1 1 1 2 | Stepwise hopping, never in a hurry. |
| `lantern-walk` | Lantern Walk | 5, 1 3 5 3 / 6 5 3 2 3 5 6 5 3 | 2 1 1 2 2 / 1 .5 .5 1 1 1 .5 .5 2 | Rises from low and wanders home at dusk. |
| `hay-wagon` | Hay Wagon | 1 3 5 5 6 5 3 / 2 3 5 3 2 1 | 1 1 1 .5 .5 1 3 / 1 1 1 1 1 3 | Plodding, contented, slightly bumpy. |
| `morning-bread` | Morning Bread | 8 7 5 3 5 6 / 5 3 2 3 1 | 2 1 1 2 1 1 / 1 1 1 1 4 | Starts high and settles, like steam. |
| `low-fog` | Low Fog | 5, 6, 1 2 3 2 1 6, / 5, 6, 1 3 2 1 5, | 2 .5 .5 1 1 1 1 1 / 1 1 1 1 1 1 2 | Hushed and close to the ground. |
| `swallow-turn` | Swallow Turn | 5 8 7 5 6 / 5 3 2 3 5 3 | 1 2 1 2 2 / 1 1 1 1 2 2 | One bright swoop, then a tidy landing. |
| `market-bell` | Market Bell | 5 5 8 6 5 3 5 / 6 8 7 6 5 | 1 1 2 1 1 1 1 / 1 1 1 1 4 | Pealing repeated notes, open-air cheerful. |
| `candle-stub` | Candle Stub | 3 2 1 2 3 5 6 / 5 3 2 3 1 | 1 1 1 1 1 1 2 / 1 1 1 1 4 | Small, flickering, kind of sleepy. |
| `old-gate` | Old Gate | 1 5 6 5 3 2 / 3 5 6 8 6 5 | 2 1 1 2 1 1 / 1 1 1 1 1 3 | Leaps out, creaks open, swings shut. |
| `fiddle-skip` | Fiddle Skip | 3 5 3 1 3 5 / 6 8 7 6 5 3 | 1.5 .5 1 1 2 2 / 1.5 .5 1 1 1 3 | Dotted and dancey, ready for a barn. |

The slash marks the 2-bar halves only for reading. Spans: `lantern-walk` 5, to 6 is a 9th; `low-fog` 6, to 3 is a 9th at most; all others are an octave or less.

### Types

```ts
export type Degree = number;            // 1..9, <= 0 for notes below the tonic (5, = -2)

export interface MotifShape {
  id: string;                           // 'porch-light'
  name: string;                         // 'Porch Light'
  contour: readonly Degree[];           // scale degrees in major
  rhythm: readonly number[];            // beats per note, same length, sums to 16
  character: string;                    // one-line note
}

export interface MotifNote {
  beat: number;                         // onset in beats from bar 1, 0..16
  degree: Degree;
  beats: number;                        // duration
}

export interface Motif {
  shapeId: string;
  key: KeyName;                         // 'F' | 'Bb' | 'Eb' | 'G' | 'D' | 'C'
  tonicMidi: number;
  notes: readonly MotifNote[];          // degrees, so stingers can re-key and re-harmonize
  varied: boolean;                      // false when validation fell back to the plain shape
}

export type KeyName = 'F' | 'Bb' | 'Eb' | 'G' | 'D' | 'C';
```

### Algorithm

1. Hash the seed string with FNV-1a 32 (offset 2166136261, prime 16777619, `Math.imul`, `>>> 0`).
2. Seed mulberry32 with the hash. Every random choice below draws from this one stream, in this order, so the result is stable.
3. Pick a shape: `shapes[floor(rng() * 12)]`.
4. Pick a key from `['F','Bb','Eb','G','D','C']` the same way. Tonic MIDI: C 60, D 62, Eb 63, F 65, G 67, Bb 58 (voices transpose by octave as needed).
5. Build `notes` from the shape by accumulating `rhythm` into onsets.
6. Draw the variation count, 0 to 2 (`floor(rng() * 3)`). For each, pick a kind from the four below and apply it to a seeded note index. If the kind cannot apply, skip it (the draw still happens).
   - **Neighbor ornament**: on a weak beat (onset with odd whole beat, 2 or 4 of the bar) and a note of at least 1 beat, split it into the note, then an upper or lower scale neighbor for 0.5 beats, then the note again for the rest.
   - **Rhythmic displacement**: move one onset (not the first) an eighth earlier. The previous note loses 0.5 beats (needs at least 1), this note gains 0.5.
   - **Passing tone**: where two consecutive notes are a third apart, insert the middle degree for 0.5 beats, taken from the earlier note (needs at least 1).
   - **Interval swap**: move one interior note by one degree while keeping the up or down direction against both neighbors, so the contour is unchanged.
7. Validate: span is 8 steps or less, final degree is 1, 3, 5 or 8, total beats equal 16, no beat is shorter than 0.5.
8. If validation fails, discard the variations and use the plain shape (`varied: false`).
9. Return the motif. Same seed, same motif, on any machine.

### Sketch

```ts
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS: readonly [KeyName, number][] =
  [['F', 65], ['Bb', 58], ['Eb', 63], ['G', 67], ['D', 62], ['C', 60]];

export function generateMotif(seed: string): Motif {
  const rng = mulberry32(fnv1a(seed));
  const shape = MOTIF_SHAPES[Math.floor(rng() * MOTIF_SHAPES.length)];
  const [key, tonicMidi] = KEYS[Math.floor(rng() * KEYS.length)];

  const plain = toNotes(shape);                       // accumulates onsets
  let notes = plain;
  const count = Math.floor(rng() * 3);                // 0..2
  for (let i = 0; i < count; i++) {
    const kind = Math.floor(rng() * 4);               // drawn even when skipped
    const pick = rng();
    notes = VARIATIONS[kind](notes, pick) ?? notes;   // returns null if not applicable
  }

  const ok = validate(notes);
  return {
    shapeId: shape.id,
    key,
    tonicMidi,
    notes: ok ? notes : plain,
    varied: ok && notes !== plain,
  };
}

function validate(n: readonly MotifNote[]): boolean {
  const ds = n.map(x => x.degree);
  const last = n[n.length - 1];
  return Math.max(...ds) - Math.min(...ds) <= 8
    && [1, 3, 5, 8].includes(last.degree)
    && Math.abs(last.beat + last.beats - 16) < 1e-9
    && n.every(x => x.beats >= 0.5);
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export function degreeToMidi(tonic: number, d: number): number {
  const i = d - 1;
  return tonic + 12 * Math.floor(i / 7) + MAJOR[((i % 7) + 7) % 7];
}
```

## Part 2: Stinger designs

Shared rules from the spec: every stinger is a `StingerDef` in the stingers registry, is in the current key, quantizes as listed, and ducks the band 3 dB. Proposed duck envelope *(tune)*: attack 80 ms, hold for the cue length, release 400 ms. Calm turns stingers off; captions follow the Captions setting.

Ranks used: Hamlet is the small ensemble (guitar, upright bass, brushes). City adds the I4 and I5 players (piano, clarinet, vibraphone, horns, strings). Ranks between add players in the order they land in the spec. Examples below are in C major, written `[beat, pitch, beats]`, with the motif taken from `porch-light` (E4 G4 A4 G4 E4 G4 C5 B4 A4 G4 E4). In play, degrees are re-keyed to the current key.

### Resident arrives (next beat, I2)

- Hamlet: one plucked nylon guitar. City: the same guitar with a soft vibraphone doubling an octave up.
- Length: 3 beats, plus ring.
- Uses key: rising 5th to 1 of the current key. Motif: none (two notes only, so it stays a greeting).
- Notes: `[0, G4, 1]`, `[1, C5, 2]`
- Ducking: standard.
- Caption: "A small, hopeful tune: someone has moved in."

### Wish granted (next beat, I2)

- Hamlet: guitar carrying the line over a held upright bass root. City: vibraphone carries the line over soft strings.
- Length: 4 beats, plus ring.
- Uses key and motif: the first four notes of the motif, then a lift to the tonic.
- Notes: `[0, E4, 1]`, `[1, G4, 1]`, `[2, A4, 1]`, `[3, C5, 2]`; bass `[0, C3, 4]`
- Ducking: standard.
- Caption: "Somebody's wish came true. The tune is mostly relief."

### Pattern discovered (next beat, I2)

- Hamlet: guitar with a soft bass pedal. City: clarinet takes the line, strings hold the suspension.
- Length: 8 beats.
- Uses key and motif: the opening of the motif, then a suspended 4th over the tonic chord that resolves down to the 3rd.
- Notes: `[0, E4, 1]`, `[1, G4, 1]`, `[2, A4, 1]`, `[3, F5, 2]`, `[5, E5, 3]`; pedal `[0, C3, 8]`
- Ducking: standard.
- Caption: "A pattern, noticed. The town hums, pleased with itself."

### Achievement (next bar, I2)

- Hamlet: guitar in parallel thirds with bass roots. City: piano and vibraphone on the thirds, horns on the chord at the end.
- Length: 8 beats (2 bars).
- Uses key and motif: first two bars of the motif harmonized a third below.
- Notes: upper `[0, E4, 1]`, `[1, G4, 1]`, `[2, A4, 1]`, `[3, G4, 1]`, `[4, E4, 1]`, `[5, G4, 1]`, `[6, C5, 2]`; lower `[0, C4, 1]`, `[1, E4, 1]`, `[2, F4, 1]`, `[3, E4, 1]`, `[4, C4, 1]`, `[5, E4, 1]`, `[6, G4, 2]`; bass `[0, C3, 4]`, `[4, C3, 4]`
- Ducking: standard.
- Caption: "An achievement, politely fanfared."

### Charter earned (next bar, I2, ensemble upgrades as it lands)

- Hamlet: guitar, bass and brushes play it out, and a single plucked line announces the new player. Village: adds the I2 voices. Town: piano and clarinet. Market Town: vibraphone and horns. City: full strings, horns and the whole band, with the newly revealed player given the last bar alone.
- Length: 16 beats (4 bars). Bar 1 is the motif's first bar, per spec.
- Uses key and motif: bar 1 states the motif head, bar 2 answers it, bar 3 climbs the tonic chord, bar 4 lands on the tonic chord with the new player's voice on top.
- Notes: `[0, E4, 1]`, `[1, G4, 1]`, `[2, A4, 1]`, `[3, G4, 1]`, `[4, E4, 1]`, `[5, G4, 1]`, `[6, C5, 2]`, `[8, D5, 1]`, `[9, E5, 1]`, `[10, G5, 2]`, `[12, C5, 4]` with chord `[12, C4+E4+G4, 4]`; bass `[0, C3, 4]`, `[4, F2, 4]`, `[8, G2, 4]`, `[12, C3, 4]`
- Ducking: standard, held for the full 16 beats, so the band yields to the fanfare and returns on the downbeat after.
- Caption: "The Charter is signed. A new player steps up to the microphone."

### First sighting in the Field Guide (next beat, I3)

- Hamlet and City: a little glockenspiel, same in both. At City rank a faint celesta-like shimmer from the vibraphone is allowed.
- Length: 2 beats.
- Uses key: tonic triad arpeggio in the upper register. No motif, so it reads as a different kind of news.
- Notes: `[0, G5, 0.5]`, `[0.5, C6, 0.5]`, `[1, E6, 1]`
- Ducking: standard, with a short hold (2 beats).
- Caption: "A new entry in the Field Guide. Someone has been taking notes."

### The Gate Held (next bar, I3)

- Hamlet: guitar and bass with brushes returning on the last bar. City: horns and strings state the motif, full band returns.
- Length: 8 beats (2 bars), then the band continues under it.
- Uses key and motif: motif harmonized in major (always major, even if the current tune leans minor), ending on a full tonic chord as the band returns.
- Notes: melody `[0, E4, 1]`, `[1, G4, 1]`, `[2, A4, 1]`, `[3, G4, 1]`, `[4, E4, 1]`, `[5, G4, 1]`, `[6, C5, 2]`; harmony `[0, C4, 1]`, `[1, E4, 1]`, `[2, F4, 1]`, `[3, E4, 1]`, `[4, C4, 1]`, `[5, E4, 1]`, `[6, G4, 2]`; bass `[0, C3, 4]`, `[4, G2, 2]`, `[6, C3, 2]`; band re-enters at beat 6
- Ducking: standard for the first 6 beats, released as the band returns.
- Caption: "The gate held. The band comes back in, a little smug."

### The Gate Fell (next bar, I3)

- Hamlet: one guitar, soft, no brushes. City: cello and piano, the same slow tempo feel (half-time), no horns and no percussion. Never a sting.
- Length: 8 beats, then a long ring-out.
- Uses key and motif: the motif's opening in the parallel minor (lowered 3rd and 6th), then it settles on the tonic. It is a reprise, not a punishment.
- Notes: `[0, Eb4, 1.5]`, `[1.5, G4, 1.5]`, `[3, Ab4, 1.5]`, `[4.5, G4, 1.5]`, `[6, Eb4, 2]`; resolve `[8, C4, 4]`; bass `[0, C3, 8]`
- Ducking: standard, with a slower release *(tune: 1.5 s)* so the band eases back rather than snapping in.
- Caption: "The gate fell. A gentle tune, which is more than the gate got."

### Birth or wedding (next bar, I2)

- Hamlet: guitar and bass in three. City: strings and glockenspiel on top. A wedding adds a fiddle at every rank, a birth adds the glockenspiel at every rank.
- Length: 6 beats (2 bars of 3/4), then ring.
- Uses key and motif: the motif head re-metered as a waltz.
- Notes: `[0, E4, 1]`, `[1, G4, 1]`, `[2, A4, 1]`, `[3, G4, 2]`, `[5, E4, 1]`; bass `[0, C3, 1]`, `[3, G2, 1]`, accompaniment chords on beats 1 and 2 of each bar
- Ducking: standard.
- Caption (birth): "A new arrival, in three-quarter time."
- Caption (wedding): "Two households, one tune, a great deal of rice."
