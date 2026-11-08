import { describe, expect, it } from 'vitest';
import { chordInfo, chordScale, compose, type Note } from './composer';
import { STYLES, type PieceChoice, type Style } from './director';
import { adaptMotif, valleyMotif } from './motif';
import { Sampler } from './sampler';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

/** The chord reader as it was before the richer grammar (diatonic quality from the scale). */
function oldChordInfo(symbol: string, mode: 'major' | 'minor'): number[] {
  const step = (scale: number[], n: number) => scale[((n % 7) + 7) % 7]! + 12 * Math.floor(n / 7);
  const m = /^([ivIV]+)(.*)$/.exec(symbol);
  const degree = Math.max(0, NUMERALS.indexOf((m?.[1] ?? 'i').toLowerCase()));
  const color = m?.[2] ?? '';
  const scale = mode === 'major' ? MAJOR : MINOR;
  const root = step(scale, degree);
  let third = step(scale, degree + 2);
  if (mode === 'minor' && degree === 4) third = step(scale, degree + 2) + 1;
  if (color.includes('sus4')) third = step(scale, degree + 3);
  const tones = [root, third, step(scale, degree + 4)];
  const ninth = color.includes('9');
  const seventh = color.includes('7') || (ninth && !color.includes('add9'));
  if (seventh) tones.push(step(scale, degree + 6));
  if (color.includes('6')) tones.push(step(scale, degree + 5));
  if (ninth) tones.push(step(scale, degree + 8));
  return tones;
}

// Every symbol the styles used at 794ade6, by the mode of the style that used it.
const OLD_MAJOR = [
  'I',
  'I6',
  'IV',
  'IVadd9',
  'IVmaj7',
  'Iadd9',
  'Imaj7',
  'V',
  'V7',
  'V7sus4',
  'V9',
  'ii',
  'ii7',
  'ii9',
  'iii',
  'iii7',
  'vi',
  'vi7',
  'vi9',
];
const OLD_MINOR = ['III', 'V', 'V7', 'VI', 'VII', 'VImaj7', 'i', 'i7', 'iv', 'iv7'];

const semis = (symbol: string, mode: 'major' | 'minor') => chordInfo(symbol, mode).tones;

describe('chord grammar', () => {
  it('reads every old symbol to the same tones as before', () => {
    // Where the case of the numeral already matched the diatonic quality, nothing changed.
    for (const s of OLD_MAJOR) expect(semis(s, 'major'), s).toEqual(oldChordInfo(s, 'major'));
    for (const s of OLD_MINOR) expect(semis(s, 'minor'), s).toEqual(oldChordInfo(s, 'minor'));
  });

  it('spells the jazz and folk colors', () => {
    const t = (s: string, mode: 'major' | 'minor' = 'major') => semis(s, mode);
    expect(t('Imaj9')).toEqual([0, 4, 7, 11, 14]);
    expect(t('V13')).toEqual([7, 11, 14, 17, 21, 28]);
    expect(t('V7b9')).toEqual([7, 11, 14, 17, 20]);
    expect(t('bII7')).toEqual([1, 5, 8, 11]);
    expect(t('bVII13')).toEqual([10, 14, 17, 20, 24, 31]);
    expect(t('IVmaj7#11')).toEqual([5, 9, 12, 16, 23]);
    expect(t('iv6')).toEqual([5, 8, 12, 14]);
    expect(t('I69')).toEqual([0, 4, 7, 9, 14]);
    expect(t('Iadd9')).toEqual([0, 4, 7, 14]);
    expect(t('V7sus4')).toEqual([7, 12, 14, 17]);
    expect(t('V9sus4')).toEqual([7, 12, 14, 17, 21]);
    expect(t('iiø7')).toEqual([2, 5, 8, 12]);
    expect(t('viio7')).toEqual([11, 14, 17, 20]);
    expect(t('vio')).toEqual([9, 12, 15]);
    expect(t('i11', 'minor')).toEqual([0, 3, 7, 10, 14, 17]);
    expect(t('i9', 'minor')).toEqual([0, 3, 7, 10, 14]);
  });

  it('keeps triad as root, third (or the fourth of a sus) and fifth', () => {
    expect(chordInfo('V7sus4', 'major').triad).toEqual([7, 12, 14]);
    expect(chordInfo('ii9', 'major').triad).toEqual([2, 5, 9]);
  });
});

describe('the valley motif', () => {
  it('is the same for the same seed and varies with it', () => {
    expect(valleyMotif(12345)).toEqual(valleyMotif(12345));
    const shapes = new Set<string>();
    for (let s = 1; s < 60; s++) shapes.add(JSON.stringify(valleyMotif(s * 7919)));
    expect(shapes.size).toBeGreaterThan(8);
  });

  it('is four bars, singable and resolves to 1, 3 or 5', () => {
    for (let s = 0; s < 400; s++) {
      const m = valleyMotif(s * 2654435761);
      expect(m.degrees.length).toBe(m.rhythm.length);
      expect(m.rhythm.reduce((a, b) => a + b, 0)).toBeCloseTo(16, 9);
      expect(Math.max(...m.degrees) - Math.min(...m.degrees)).toBeLessThanOrEqual(8);
      const end = (((m.degrees[m.degrees.length - 1]! - 1) % 7) + 7) % 7;
      expect([0, 2, 4]).toContain(end);
      expect(Math.min(...m.rhythm)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('adapts to 3/4 in twelve beats', () => {
    for (let s = 0; s < 100; s++) {
      const m = adaptMotif(valleyMotif(s * 40503), 3);
      expect(m.rhythm.reduce((a, b) => a + b, 0)).toBeCloseTo(12, 9);
      expect(m.degrees.length).toBe(m.rhythm.length);
    }
  });
});

const style = (id: string): Style => STYLES.find((s) => s.id === id)!;

function choiceOf(over: Partial<PieceChoice> & { id: string }): PieceChoice {
  const { id, ...rest } = over;
  return { style: style(id), seed: 3, key: 53, ...rest };
}

const byVoice = (notes: Note[], voice: Note['voice']) => notes.filter((n) => n.voice === voice);
const insts = (notes: Note[], voice: Note['voice']) => new Set(byVoice(notes, voice).map((n) => n.inst));

describe('compose', () => {
  it('is deterministic', () => {
    const c = choiceOf({ id: 'morning', valleySeed: 99, ensemble: 3, weather: 'rain' });
    expect(compose(c)).toEqual(compose(c));
  });

  it('opens the first A with the valley motif when the seed allows', () => {
    const base = choiceOf({ id: 'morning', seed: 6, valleySeed: 4242 });
    const withM = compose(base);
    const without = compose({ ...base, seed: 7 });
    expect(withM.notes.length).toBeGreaterThan(0);
    const m = valleyMotif(4242);
    const firstA = byVoice(withM.notes, 'lead').filter(
      (n) => n.time >= (2 * 4 * 60) / withM.tempo - 0.05 && n.time < (4 * 4 * 60) / withM.tempo - 0.05,
    );
    const inTwoBars = m.rhythm
      .reduce<number[]>((a, r) => [...a, (a[a.length - 1] ?? 0) + r], [])
      .filter((_e, i, all) => (all[i - 1] ?? 0) < 8).length;
    expect(firstA.length).toBe(inTwoBars);
    expect(without.notes.length).toBeGreaterThan(0);
    // Without a valley seed there is no motif.
    const plain = compose({ ...base, valleySeed: undefined });
    expect(plain.notes).not.toEqual(withM.notes);
  });

  it('plays the new grooves with the new kit', () => {
    for (const [pattern, kit] of [
      ['bossa', 'bossa'],
      ['chops', 'funk'],
    ] as const) {
      const s: Style = {
        ...style('afternoon'),
        id: `t-${pattern}`,
        comp: { inst: 'guitar', pattern },
        bass: { inst: 'bass', pattern: pattern === 'bossa' ? 'bossa' : 'funk' },
        drums: kit,
      };
      const p = compose({ style: s, seed: 2, key: 50 });
      expect(byVoice(p.notes, 'comp').length).toBeGreaterThan(50);
      expect(byVoice(p.notes, 'bass').length).toBeGreaterThan(50);
      expect(byVoice(p.notes, 'drums').length).toBeGreaterThan(50);
      expect(insts(p.notes, 'drums').has('rim')).toBe(true);
      if (kit === 'funk') expect(insts(p.notes, 'drums').has('kick')).toBe(true);
    }
    const w = compose({
      style: {
        ...style('waltz'),
        comp: { inst: 'piano', pattern: 'jazzwaltz' },
        bass: { inst: 'bass', pattern: 'waltz' },
        drums: 'waltz',
      },
      seed: 5,
      key: 48,
    });
    expect(w.meter).toBe(3);
    expect(byVoice(w.notes, 'bass').length).toBeGreaterThan(20);
    expect(insts(w.notes, 'drums')).toEqual(new Set(['brush']));
  });

  it('never gives the kick or rim a recording', () => {
    const sampler = new Sampler({} as BaseAudioContext, async () => new ArrayBuffer(0));
    expect(sampler.pick('kick', 1, 1)).toBeNull();
    expect(sampler.pick('rim', 1, 1)).toBeNull();
  });

  it('grows the band with the rank', () => {
    const at = (ensemble?: number, weather?: string) =>
      compose(choiceOf({ id: 'evening', ensemble, weather }));
    const hamlet = at(0);
    expect([...insts(hamlet.notes, 'comp')]).toEqual(['guitar']);
    for (const v of ['bass', 'drums', 'pad', 'sparkle'] as const)
      expect(byVoice(hamlet.notes, v)).toHaveLength(0);
    expect(byVoice(hamlet.notes, 'lead').length).toBeGreaterThan(0);

    const village = at(1);
    expect(byVoice(village.notes, 'bass').length).toBeGreaterThan(0);
    expect([...insts(village.notes, 'drums')].every((i) => i === 'brush')).toBe(true);
    expect(byVoice(village.notes, 'pad')).toHaveLength(0);

    const town = at(2);
    expect(insts(town.notes, 'drums').has('ride')).toBe(true);
    expect(byVoice(town.notes, 'pad')).toHaveLength(0);

    const market = compose(choiceOf({ id: 'afternoon', ensemble: 3 }));
    expect(byVoice(market.notes, 'sparkle').length).toBeGreaterThan(0);
    expect(byVoice(market.notes, 'pad').length).toBe(0); // the afternoon style has no pad of its own

    const autumn3 = compose(choiceOf({ id: 'autumn', ensemble: 3 }));
    const autumn4 = compose(choiceOf({ id: 'autumn', ensemble: 4 }));
    expect(byVoice(autumn4.notes, 'pad').length).toBeGreaterThan(byVoice(autumn3.notes, 'pad').length);
    expect(byVoice(autumn4.notes, 'lead').length).toBeGreaterThan(byVoice(autumn3.notes, 'lead').length);
    const full = compose(choiceOf({ id: 'autumn' }));
    expect(byVoice(full.notes, 'drums').length).toBe(byVoice(autumn3.notes, 'drums').length);
  });

  it('plays the weather', () => {
    const base = choiceOf({ id: 'autumn' });
    const clear = compose(base);
    const peak = (p: { notes: Note[] }, v: Note['voice']) =>
      Math.max(0, ...byVoice(p.notes, v).map((n) => n.vel));
    const rain = compose({ ...base, weather: 'rain' });
    expect(peak(rain, 'drums')).toBeLessThan(peak(clear, 'drums') * 0.8);
    const storm = compose(choiceOf({ id: 'afternoon', weather: 'storm' }));
    expect(byVoice(storm.notes, 'sparkle')).toHaveLength(0);
    expect(byVoice(storm.notes, 'pad').length).toBeGreaterThan(0);
    const fog = compose({ ...base, weather: 'fog' });
    expect(byVoice(fog.notes, 'drums')).toHaveLength(0);
    expect(peak(fog, 'comp')).toBeLessThan(peak(clear, 'comp'));
    const snow = compose(choiceOf({ id: 'evening', weather: 'snow' }));
    expect(['celesta', 'glock']).toContain([...insts(snow.notes, 'sparkle')][0]);
  });

  it('sounds no melody note a half step from a chord tone it is held over (chromatic chords)', () => {
    const s: Style = {
      ...style('evening'),
      id: 'chroma',
      a: {
        open: [['Imaj7', 'VI7b9', 'bII7', 'bVII13']],
        close: [['ii9', 'bII7', 'Imaj9', 'I69']],
      },
    };
    const p = compose({ style: s, seed: 4, key: 48 });
    expect(byVoice(p.notes, 'lead').length).toBeGreaterThan(10);
    for (const n of p.notes) expect(Number.isFinite(n.time + n.dur + n.vel)).toBe(true);
    // The chord scale: no note sits a half step above a chord tone, and chord tones are all in it.
    for (const sym of ['bII7', 'bVII13', 'VI7b9', 'V7b9', 'bVImaj7']) {
      const chord = chordInfo(sym, 'major');
      const scale = chordScale(chord, 'major')!;
      const tones = chord.tones.map((t) => ((t % 12) + 12) % 12);
      expect(scale.length, sym).toBeGreaterThanOrEqual(5);
      for (const t of tones) expect(scale, sym).toContain(t);
      for (const n of scale)
        if (!tones.includes(n)) expect(tones.includes((n + 11) % 12), `${sym} ${n}`).toBe(false);
    }
    expect(chordScale(chordInfo('Imaj7', 'major'), 'major')).toBeNull();
  });

  it('keeps velocities and timing sane across every style, rank and weather', () => {
    for (const st of STYLES)
      for (const ensemble of [undefined, 0, 1, 2, 3, 4])
        for (const weather of [undefined, 'rain', 'fog', 'snow', 'storm']) {
          const p = compose({ style: st, seed: 9, key: 51, valleySeed: 7, ensemble, weather });
          for (const n of p.notes) {
            expect(n.vel).toBeGreaterThan(0);
            expect(n.vel).toBeLessThanOrEqual(1);
            expect(n.time).toBeGreaterThanOrEqual(0);
            expect(n.time).toBeLessThan(p.seconds);
          }
        }
  });

  it('rolls a guitar chord from string to string', () => {
    const p = compose(choiceOf({ id: 'evening', ensemble: 0 }));
    const guitar = byVoice(p.notes, 'comp');
    expect(guitar.every((n) => n.inst === 'guitar')).toBe(true);
    const s: Style = { ...style('afternoon'), comp: { inst: 'guitar', pattern: 'block' } };
    const q = compose({ style: s, seed: 1, key: 48 });
    const comp = byVoice(q.notes, 'comp');
    // Notes of one chord start a few milliseconds apart.
    const gaps: number[] = [];
    for (let i = 1; i < comp.length; i++) {
      const d = comp[i]!.time - comp[i - 1]!.time;
      if (d > 0.004 && d < 0.03) gaps.push(d);
    }
    expect(gaps.length).toBeGreaterThan(10);
  });
});
