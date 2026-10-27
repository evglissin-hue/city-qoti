// Render jobs (C5G): a sound described as plain data, so it can be rendered in the audio worker
// (or, without workers, in idle time on the main thread) and cached by its key.
import type { SoundCueId } from '../api';
import { renderAmbience, type AmbienceId } from './ambience';
import { renderCue } from './cues';
import { renderNote, type Instrument } from './instruments';

export type RenderJob =
  | { kind: 'note'; inst: Instrument; midi: number }
  | { kind: 'cue'; id: SoundCueId }
  | { kind: 'ambience'; id: AmbienceId };

export function jobKey(job: RenderJob): string {
  return job.kind === 'note' ? `${job.inst}:${job.midi}` : `${job.kind}:${job.id}`;
}

export function renderJob(job: RenderJob): Float32Array {
  switch (job.kind) {
    case 'note':
      return renderNote(job.inst, job.midi);
    case 'cue':
      return renderCue(job.id);
    case 'ambience':
      return renderAmbience(job.id);
  }
}
