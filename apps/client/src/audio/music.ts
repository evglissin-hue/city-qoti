// The music player (C5G): asks the director what to play, writes it with the composer, and
// schedules the notes a little ahead on the audio clock. A new style at a phase change crossfades
// over CROSSFADE_SECONDS; otherwise pieces end on their own and the valley is quiet in between.
import type { SoundBank } from './bank';
import { compose, type Note, type Piece, type Voice } from './composer';
import {
  CROSSFADE_SECONDS,
  startDirector,
  stepDirector,
  styleFor,
  type DirectorState,
  type PieceChoice,
  type Style,
} from './director';
import { seededRand, type Rand } from './rng';
import { NOTE_SECONDS, type Instrument } from './synth/instruments';
import { jobKey } from './synth/jobs';

/** Seconds of notes scheduled ahead of the clock. */
const LOOKAHEAD = 0.6;

/** Voice mix: level and pan. */
export const VOICE_MIX: Record<Voice, { gain: number; pan: number }> = {
  lead: { gain: 0.6, pan: 0.15 },
  comp: { gain: 0.32, pan: -0.25 },
  bass: { gain: 0.26, pan: 0 },
  brush: { gain: 0.9, pan: 0.3 },
  pad: { gain: 0.3, pan: -0.1 },
};

/** Evens out the instruments: a plucked string dies away fast, so it is played up to match. */
export const INSTRUMENT_TRIM: Record<Instrument, number> = {
  bass: 1,
  bell: 1,
  brush: 1,
  guitar: 2.4,
  pad: 1,
  piano: 1,
};

export function instrumentFor(voice: Voice, style: Style): Instrument {
  if (voice === 'bass' || voice === 'brush' || voice === 'pad') return voice;
  if (voice === 'lead') return style.lead;
  return style.lead === 'bell' ? 'pad' : style.lead;
}

/** The rendered note a score note plays. Brushes vary hit to hit: four rendered strokes. */
function noteJob(
  inst: Instrument,
  note: Note,
  index: number,
): { kind: 'note'; inst: Instrument; midi: number } {
  return { kind: 'note', inst, midi: inst === 'brush' ? 1 + (index % 4) : note.midi };
}

interface Playing {
  piece: Piece;
  style: Style;
  start: number;
  next: number;
  out: GainNode;
  voices: Map<Voice, StereoPannerNode>;
}

export class MusicPlayer {
  private director: DirectorState;
  private readonly rand: Rand;
  private playing: Playing | null = null;
  private fading: Playing[] = [];
  /** A chosen piece waiting for its notes to render. */
  private waiting: { choice: PieceChoice; piece: Piece } | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bank: SoundBank,
    private readonly out: AudioNode,
    seed: number,
  ) {
    this.director = startDirector(ctx.currentTime);
    this.rand = seededRand(seed);
  }

  /** The style playing now, or '' in a quiet gap. */
  get style(): string {
    return this.playing ? this.playing.style.id : '';
  }

  /** Called a few times a second with the valley's hour and season. */
  update(hour: number, season: number): void {
    const now = this.ctx.currentTime;
    // The hour turned to a new style: let this piece go and start the new one right away.
    if (this.playing && styleFor(hour, season).id !== this.playing.style.id && !this.waiting) {
      this.fadeOut(this.playing, now);
      this.playing = null;
      this.director.mode = 'quiet';
      this.director.until = now;
    }
    if (this.playing && now > this.playing.start + this.playing.piece.seconds) this.playing = null;
    if (!this.waiting) {
      const choice = stepDirector(this.director, now, hour, season, this.rand, (c) => compose(c).seconds);
      if (choice) {
        const piece = compose(choice);
        this.warm(piece, choice.style);
        this.waiting = { choice, piece };
      }
    }
    if (this.waiting && this.ready(this.waiting.piece, this.waiting.choice.style)) {
      const { piece, choice } = this.waiting;
      this.waiting = null;
      this.playing = this.begin(piece, choice.style, now + 0.1);
      // The director's clock starts when the sound does.
      this.director.until = this.playing.start + piece.seconds;
    }
    if (this.playing) this.schedule(this.playing, now);
    this.fading = this.fading.filter((p) => now < p.start + p.piece.seconds && p.out.gain.value > 0.001);
  }

  /** Stops everything (the tab closed or the engine was torn down). */
  stop(): void {
    const now = this.ctx.currentTime;
    if (this.playing) this.fadeOut(this.playing, now, 0.3);
    this.playing = null;
  }

  private warm(piece: Piece, style: Style): void {
    piece.notes.forEach((n, i) => this.bank.want(noteJob(instrumentFor(n.voice, style), n, i)));
  }

  private ready(piece: Piece, style: Style): boolean {
    return piece.notes.every((n, i) => this.bank.has(jobKey(noteJob(instrumentFor(n.voice, style), n, i))));
  }

  private begin(piece: Piece, style: Style, start: number): Playing {
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0, start);
    out.gain.linearRampToValueAtTime(1, start + (this.fading.length ? CROSSFADE_SECONDS : 0.05));
    out.connect(this.out);
    const voices = new Map<Voice, StereoPannerNode>();
    for (const v of ['lead', 'comp', 'bass', 'brush', 'pad'] as const) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = VOICE_MIX[v].pan;
      p.connect(out);
      voices.set(v, p);
    }
    return { piece, style, start, next: 0, out, voices };
  }

  private fadeOut(p: Playing, now: number, seconds = CROSSFADE_SECONDS): void {
    p.out.gain.cancelScheduledValues(now);
    p.out.gain.setValueAtTime(p.out.gain.value, now);
    p.out.gain.linearRampToValueAtTime(0, now + seconds);
    // Notes already scheduled ring out under the fade; no new ones are added.
    this.fading.push(p);
    setTimeout(() => p.out.disconnect(), (seconds + 0.5) * 1000);
  }

  private schedule(p: Playing, now: number): void {
    const spb = 60 / p.piece.tempo;
    const notes = p.piece.notes;
    while (p.next < notes.length) {
      const n = notes[p.next]!;
      const at = p.start + n.beat * spb;
      if (at > now + LOOKAHEAD) break;
      const i = p.next++;
      if (at < now - 0.05) continue;
      this.playNote(p, n, i, at, spb);
    }
  }

  private playNote(p: Playing, n: Note, index: number, at: number, spb: number): void {
    const inst = instrumentFor(n.voice, p.style);
    const buffer = this.bank.get(jobKey(noteJob(inst, n, index)));
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    // A little looseness, like a person playing: timing within 8 ms, touch within 10%.
    const human = n.voice === 'bass' ? 0 : (this.rand() - 0.5) * 0.016;
    const t = Math.max(this.ctx.currentTime, at + human);
    const vel = n.vel * VOICE_MIX[n.voice].gain * INSTRUMENT_TRIM[inst] * (0.9 + this.rand() * 0.2);
    g.gain.setValueAtTime(vel, t);
    const ring = Math.min(NOTE_SECONDS[inst], n.len * spb + 0.25);
    g.gain.setTargetAtTime(0, t + ring, 0.12);
    src.connect(g).connect(p.voices.get(n.voice)!);
    src.start(t);
    src.stop(t + ring + 0.8);
  }
}
