// The audio engine (C5G): a Web Audio graph (master, then music, ambience and effects buses, a
// shared room reverb), the music player, the ambience voices around the camera and the cues. It is
// created on the first user gesture and loaded as its own chunk, so the title screen loads no
// audio. Sound reads the Mirror and never touches the sim.
import type { Mirror, MirrorChange } from '../state/mirror';
import type { AudioApi, SoundCueId } from './api';
import { mixAmbience, type EmitterLevel } from './ambience';
import { SoundBank } from './bank';
import { CUE_GAP, CueLimiter } from './cues/limiter';
import { cueForCommand, cueScene, cuesFor, type CueScene } from './cues/index';
import { MusicPlayer } from './music';
import { Sampler } from './sampler';
import { sampleScene } from './scene';
import { TUNED_CUES } from './synth/cues';
import { busGain, type AudioSettings } from './settings';
import type { AmbienceId } from './synth/ambience';

/** Where the camera looks: ground focus in tiles, yaw in radians, distance in world units. */
export interface Look {
  x: number;
  z: number;
  yaw: number;
  distance: number;
}

export interface AudioSource {
  mirror: Mirror;
  look: () => Look | null;
}

export type Bus = 'music' | 'ambience' | 'effects';

/** Music sits under letters, the rank-up and raids at this fraction. */
const DUCK = 0.3;
/** Seconds between ambience mixes. */
const AMBIENCE_EVERY = 0.5;
/** Time constant of an ambience voice's fade, seconds (about a second to settle). */
const AMBIENCE_FADE = 0.3;

interface AmbienceVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
  /** Audio time it went silent, or -1 while heard. */
  quietSince: number;
}

/** Semitones from C to the key's tonic, the short way round (-5 to 6). */
export function keyShift(key: number): number {
  const s = (((key - 48) % 12) + 12) % 12;
  return s > 6 ? s - 12 : s;
}

/** A soft room: two channels of decaying noise, darker as it fades. */
function roomImpulse(ctx: BaseAudioContext, seconds = 2.4): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const ir = ctx.createBuffer(2, len, rate);
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.15 + 0.8 * (1 - t);
      lp += (rnd() * 2 - 1 - lp) * k;
      d[i] = lp * Math.pow(1 - t, 3) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
    }
  }
  return ir;
}

export class AudioEngine implements AudioApi {
  readonly bank: SoundBank;
  private readonly master: GainNode;
  private readonly buses: Record<Bus, GainNode>;
  private readonly duckGain: GainNode;
  private readonly music: MusicPlayer;
  private readonly limiter = new CueLimiter();
  private readonly ambience = new Map<AmbienceId, AmbienceVoice>();
  private levels: EmitterLevel[] = [];
  private settings: AudioSettings;
  private source: AudioSource | null = null;
  private scene: CueScene | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastMix = -1;
  private nextThunder = 0;
  private raidDuck = false;
  private focus: { x: number; z: number; zoom: number } | null = null;
  private readonly cleanup: (() => void)[] = [];
  /** Main-thread milliseconds spent in the last few updates, for the budget check. */
  readonly cost: number[] = [];

  constructor(
    readonly ctx: AudioContext,
    settings: AudioSettings,
  ) {
    this.settings = settings;
    this.bank = new SoundBank(ctx);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    const reverb = ctx.createConvolver();
    reverb.buffer = roomImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    reverb.connect(wet).connect(this.master);
    this.buses = { music: ctx.createGain(), ambience: ctx.createGain(), effects: ctx.createGain() };
    this.duckGain = ctx.createGain();
    this.buses.music.connect(this.duckGain).connect(this.master);
    this.buses.ambience.connect(this.master);
    this.buses.effects.connect(this.master);
    const send = (bus: GainNode, amount: number): void => {
      const g = ctx.createGain();
      g.gain.value = amount;
      bus.connect(g).connect(reverb);
    };
    send(this.duckGain, 0.55);
    send(this.buses.effects, 0.25);
    send(this.buses.ambience, 0.08);
    this.music = new MusicPlayer(
      ctx,
      this.bank,
      this.buses.music,
      Math.floor(Math.random() * 1e9),
      new Sampler(ctx),
    );
    this.apply(settings, true);
    // Cues are short; render them all up front so the first click already has its sound.
    for (const id of Object.keys(CUE_GAP) as SoundCueId[]) this.bank.want({ kind: 'cue', id });
  }

  /** Starts listening to a valley: music, ambience and cues. */
  attach(source: AudioSource): void {
    this.source = source;
    this.scene = cueScene(source.mirror);
    this.cleanup.push(source.mirror.onChange((c) => this.onChange(c)));
    this.timer = setInterval(() => this.update(), 100);
    const vis = (): void => {
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    };
    document.addEventListener('visibilitychange', vis);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', vis));
  }

  detach(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const fn of this.cleanup.splice(0)) fn();
    this.music.stop();
    for (const id of [...this.ambience.keys()]) this.dropVoice(id);
    this.bank.dispose();
    this.source = null;
  }

  // --- AudioApi ---------------------------------------------------------------------------------

  cue(id: SoundCueId): void {
    if (this.ctx.state !== 'running') return;
    const buffer = this.bank.get(this.bank.want({ kind: 'cue', id }));
    // Not rendered yet (only in the first second or so): skip it rather than wait.
    if (!buffer || !this.limiter.allow(id, this.ctx.currentTime)) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    // Musical cues are written in C and play in the music's key, so a chime never clashes.
    if (TUNED_CUES.has(id)) src.playbackRate.value = Math.pow(2, keyShift(this.music.key) / 12);
    const g = this.ctx.createGain();
    g.gain.value = id === 'bell' || id === 'raid-horn' || id === 'thunder' ? 0.8 : 0.4;
    src.connect(g).connect(this.buses.effects);
    src.start();
    if (id === 'rank-up' || id === 'raid-horn') this.duckFor(id === 'rank-up' ? 3 : 2.5);
  }

  setFocus(x: number, z: number, zoom: number): void {
    this.focus = { x, z, zoom };
  }

  duck(on: boolean): void {
    const now = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setTargetAtTime(on ? DUCK : 1, now, on ? 0.15 : 0.6);
  }

  /** The player's own command: place and remove sounds right away, before the turn lands. */
  command(t: string): void {
    const id = cueForCommand(t);
    if (id) this.cue(id);
  }

  // --- Settings and inspection ------------------------------------------------------------------

  apply(s: AudioSettings, instant = false): void {
    this.settings = s;
    const now = this.ctx.currentTime;
    for (const bus of ['music', 'ambience', 'effects'] as const) {
      const g = this.buses[bus].gain;
      if (instant) g.value = busGain(s, bus);
      else g.setTargetAtTime(busGain(s, bus), now, 0.05);
    }
  }

  /** The target gain of each bus (what the sliders set). */
  gains(): Record<Bus, number> {
    return {
      music: busGain(this.settings, 'music'),
      ambience: busGain(this.settings, 'ambience'),
      effects: busGain(this.settings, 'effects'),
    };
  }

  /** What is playing, for the debug hook. */
  playing(): { music: string; ambience: EmitterLevel[] } {
    return { music: this.music.style, ambience: this.levels };
  }

  // --- Internals --------------------------------------------------------------------------------

  private duckFor(seconds: number): void {
    this.duck(true);
    setTimeout(() => this.duck(this.raidDuck), seconds * 1000);
  }

  private onChange(change: MirrorChange): void {
    if (!this.source) return;
    const t0 = performance.now();
    const next = cueScene(this.source.mirror);
    const prev = this.scene ?? next;
    this.scene = next;
    for (const id of cuesFor(prev, next, change)) this.cue(id);
    if (change.letters.length > 0 || change.rankUp) this.duckFor(2.5);
    this.track(t0);
  }

  private update(): void {
    if (!this.source || this.ctx.state !== 'running') return;
    const t0 = performance.now();
    const m = this.source.mirror;
    const clock = m.clock.value;
    const hour = clock.hour + clock.minute / 60;
    this.music.update(hour, clock.season);
    // Raids keep the music low while they last.
    const raid = m.raid.value !== null;
    if (raid !== this.raidDuck) {
      this.raidDuck = raid;
      this.duck(raid);
    }
    const now = this.ctx.currentTime;
    if (now - this.lastMix >= AMBIENCE_EVERY) {
      this.lastMix = now;
      this.mix(hour, clock.season);
    }
    this.track(t0);
  }

  private mix(hour: number, season: number): void {
    const m = this.source!.mirror;
    const look = this.source!.look();
    const f =
      look ?? (this.focus ? { x: this.focus.x, z: this.focus.z, yaw: 0, distance: this.focus.zoom } : null);
    if (!f) return;
    const weather = m.weather.value;
    const scene = sampleScene(m.layers, m.buildings.values(), f.x, f.z, f.distance);
    this.levels = mixAmbience(scene, {
      hour,
      season,
      weather: weather?.today ?? 'clear',
      frozen: weather?.frozen ?? false,
      festival: m.festival.value?.live ?? false,
      zoom: f.distance,
      yaw: f.yaw,
    });
    const now = this.ctx.currentTime;
    const heard = new Set<AmbienceId>();
    for (const lv of this.levels) {
      heard.add(lv.id);
      const v = this.ambience.get(lv.id) ?? this.startVoice(lv.id);
      if (!v) continue;
      v.quietSince = -1;
      v.gain.gain.setTargetAtTime(lv.gain, now, AMBIENCE_FADE);
      v.pan.pan.setTargetAtTime(lv.pan, now, AMBIENCE_FADE);
    }
    for (const [id, v] of this.ambience) {
      if (heard.has(id)) continue;
      if (v.quietSince < 0) {
        v.quietSince = now;
        v.gain.gain.setTargetAtTime(0, now, AMBIENCE_FADE);
      } else if (now - v.quietSince > 3) this.dropVoice(id);
    }
    // Now and then in a storm, thunder rolls in.
    if (weather?.today === 'storm' && now > this.nextThunder) {
      if (this.nextThunder > 0) this.cue('thunder');
      this.nextThunder = now + 25 + Math.random() * 45;
    }
  }

  /** Starts a looping voice, silent, once its loop is rendered (it is asked for until then). */
  private startVoice(id: AmbienceId): AmbienceVoice | null {
    const buffer = this.bank.get(this.bank.want({ kind: 'ambience', id }));
    if (!buffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const pan = this.ctx.createStereoPanner();
    src.connect(gain).connect(pan).connect(this.buses.ambience);
    // Start somewhere in the loop so two visits never sound the same.
    src.start(0, Math.random() * buffer.duration);
    const v = { src, gain, pan, quietSince: -1 };
    this.ambience.set(id, v);
    return v;
  }

  private dropVoice(id: AmbienceId): void {
    const v = this.ambience.get(id);
    if (!v) return;
    v.src.stop();
    v.src.disconnect();
    v.pan.disconnect();
    this.ambience.delete(id);
  }

  private track(t0: number): void {
    this.cost.push(performance.now() - t0);
    if (this.cost.length > 60) this.cost.shift();
  }
}
