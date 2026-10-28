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
} from './director';
import { seededRand, type Rand } from './rng';
import {
  INSTRUMENT_LEVEL,
  INSTRUMENT_PAN,
  RELEASE,
  SUSTAINED,
  UNPITCHED,
  noteSeconds,
} from './synth/instruments';
import { jobKey, type RenderJob } from './synth/jobs';

/** Seconds of notes scheduled ahead of the clock. */
const LOOKAHEAD = 0.6;

/** Each part's level in the band. */
export const VOICE_LEVEL: Record<Voice, number> = {
  lead: 1.2,
  sparkle: 0.35,
  comp: 0.5,
  bass: 0.9,
  pad: 0.6,
  drums: 0.9,
};

/** The rendered note a score note plays: soft or firm touch, by its velocity. */
export function noteJob(n: Pick<Note, 'inst' | 'midi' | 'vel'>): RenderJob {
  return { kind: 'note', inst: n.inst, midi: n.midi, layer: UNPITCHED.has(n.inst) || n.vel >= 0.5 ? 1 : 0 };
}

/** How loud a note plays (the touch layer already carries the brightness). */
export function noteGain(n: Pick<Note, 'inst' | 'vel' | 'voice'>): number {
  return n.vel * INSTRUMENT_LEVEL[n.inst] * VOICE_LEVEL[n.voice];
}

/** Where a note sits: the instrument's place, and pianos spread low to high. */
export function notePan(n: Pick<Note, 'inst' | 'midi'>): number {
  const spread = n.inst === 'piano' || n.inst === 'epiano' ? (n.midi - 64) / 70 : 0;
  return Math.max(-0.8, Math.min(0.8, INSTRUMENT_PAN[n.inst] + spread));
}

/** When a note's sound is let go: held notes at their end, struck notes may ring a little on. */
export function noteRelease(n: Pick<Note, 'inst' | 'dur' | 'midi'>): { at: number; tau: number } {
  const ring = SUSTAINED.has(n.inst)
    ? n.dur
    : Math.max(n.dur, Math.min(1.2, noteSeconds(n.inst, n.midi)) * 0.4);
  return { at: Math.min(ring, noteSeconds(n.inst, n.midi)), tau: RELEASE[n.inst] / 3 };
}

interface Playing {
  piece: Piece;
  style: string;
  start: number;
  next: number;
  out: GainNode;
  pans: Map<number, StereoPannerNode>;
}

export class MusicPlayer {
  private director: DirectorState;
  private readonly rand: Rand;
  private playing: Playing | null = null;
  private fading: Playing[] = [];
  /** A chosen piece waiting for its notes to render. */
  private waiting: { choice: PieceChoice; piece: Piece } | null = null;
  /** The key of the music now or last played (cues are tuned to it). */
  key = 48;

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
    return this.playing ? this.playing.style : '';
  }

  /** Called a few times a second with the valley's hour and season. */
  update(hour: number, season: number): void {
    const now = this.ctx.currentTime;
    // The hour turned to a new style: let this piece go and start the new one right away.
    if (this.playing && styleFor(hour, season).id !== this.playing.style && !this.waiting) {
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
        for (const n of piece.notes) this.bank.want(noteJob(n));
        this.waiting = { choice, piece };
      }
    }
    if (this.waiting && this.waiting.piece.notes.every((n) => this.bank.has(jobKey(noteJob(n))))) {
      const { piece } = this.waiting;
      this.waiting = null;
      this.playing = this.begin(piece, now + 0.1);
      this.key = piece.key;
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

  private begin(piece: Piece, start: number): Playing {
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0, start);
    out.gain.linearRampToValueAtTime(1, start + (this.fading.length ? CROSSFADE_SECONDS : 0.05));
    out.connect(this.out);
    return { piece, style: piece.style, start, next: 0, out, pans: new Map() };
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
    const notes = p.piece.notes;
    while (p.next < notes.length) {
      const n = notes[p.next]!;
      const at = p.start + n.time;
      if (at > now + LOOKAHEAD) break;
      p.next++;
      if (at < now - 0.05) continue;
      this.playNote(p, n, at);
    }
  }

  /** One panner per position, shared by the notes that sit there. */
  private panner(p: Playing, pan: number): StereoPannerNode {
    const key = Math.round(pan * 20);
    let node = p.pans.get(key);
    if (!node) {
      node = this.ctx.createStereoPanner();
      node.pan.value = key / 20;
      node.connect(p.out);
      p.pans.set(key, node);
    }
    return node;
  }

  private playNote(p: Playing, n: Note, at: number): void {
    const buffer = this.bank.get(jobKey(noteJob(n)));
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    const t = Math.max(this.ctx.currentTime, at);
    g.gain.setValueAtTime(noteGain(n), t);
    const rel = noteRelease(n);
    g.gain.setTargetAtTime(0, t + rel.at, rel.tau);
    src.connect(g).connect(this.panner(p, notePan(n)));
    src.start(t);
    src.stop(Math.min(t + buffer.duration, t + rel.at + rel.tau * 8));
  }
}
