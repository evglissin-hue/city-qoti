// V2.0: Measure this laptop (docs/spec/22-quality.md, Measuring the laptops). Opened from Settings:
// a confirm card with an honest estimate, a progress card while the twelve rows run (Escape or Stop
// ends it at once, the valley put back), then the table with Copy, kept with the valley for this seat
// (online) or on this device (solo), with the runs both seats kept before.
import { signal } from '@preact/signals';
import type { PerfMachine, PerfRun } from '@qoti/protocol';
import { useEffect, useState } from 'preact/hooks';
import {
  isPerfAborted,
  measureLaptop,
  measureMarkdown,
  measureSeconds,
  perfMachine,
  type MeasureOptions,
  type MeasureProgress,
  type MeasureScene,
  type PerfRow,
} from '../../app/perf';
import type { Session } from '../../app/session';
import { perfStore, runsToShow } from '../../net/perf';
import { seatLabel } from '../format';
import './measure.css';

export const MEASURE_COPY = {
  heading: 'Measure this laptop',
  settingsHint:
    'Times every picture preset here and in two showcase towns, so the art knows what this laptop can carry.',
  settingsButton: 'Measure this laptop',
  confirm: (minutes: string) =>
    `Twelve short runs: every preset in this valley, then in a showcase village and a showcase town. It takes ${minutes}. Plug the laptop in, close everything else and leave the mouse be; the valley comes back exactly as it was.`,
  start: 'Start measuring',
  notNow: 'Not now',
  ready: 'Getting ready',
  loading: (scene: string) => `Setting out the ${scene.toLowerCase()}`,
  measuring: (scene: string, preset: string) => `${scene}, ${preset}`,
  restoring: 'Putting your valley back',
  stepOf: (step: number, total: number) => `${step} of ${total}`,
  stopHint: 'Esc stops it at once.',
  stop: 'Stop',
  done: 'Done. Your valley is back as it was.',
  doneOdd: 'Done. Your valley is back, though its counts disagree with before; a reload will settle it.',
  stopped: 'Stopped. Your valley is back as it was.',
  failed: (why: string) => `The measuring tripped over something (${why}). Your valley is back as it was.`,
  saving: 'Keeping it with the valley.',
  savedOnline: 'Kept with the valley, for both of you to see.',
  savedSolo: 'Kept on this device, with the valley.',
  saveFailed: 'Could not keep it with the valley this time. Copy still works.',
  copy: 'Copy as Markdown',
  copied: 'Copied',
  copyFailed: 'The clipboard said no',
  kept: 'Kept runs',
  keptNone: 'Nothing kept yet.',
  keptFailed: 'Could not fetch the kept runs just now.',
  close: 'Close',
} as const;

const SCENE_NAMES: Record<MeasureScene, string> = {
  valley: 'This valley',
  village: 'Village showcase',
  town: 'Town showcase',
};

const PRESET_NAMES: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };

const sceneName = (scene: string): string => SCENE_NAMES[scene as MeasureScene] ?? scene;
const presetName = (q: string): string => PRESET_NAMES[q] ?? q;

/** `?debug&measure=quick`: a second of movement and of rest per row, for the e2e in a software renderer. */
const QUICK: MeasureOptions | null = (() => {
  try {
    const q = new URLSearchParams(location.search);
    return q.has('debug') && q.get('measure') === 'quick'
      ? { move: 1, rest: 1, settle: 0.5, settleMax: 4 }
      : null;
  } catch {
    return null;
  }
})();

/** An honest estimate for the confirm card. */
export function estimateText(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? 'about a minute' : `about ${minutes} minutes`;
}

type SaveState = 'saving' | 'saved' | 'failed';

type MeasureState =
  | { k: 'closed' }
  | { k: 'confirm' }
  | { k: 'running'; progress: MeasureProgress | null; controller: AbortController }
  | {
      k: 'done';
      rows: PerfRow[];
      text: string;
      save: SaveState;
      same: boolean;
    }
  | { k: 'stopped'; rows: PerfRow[] }
  | { k: 'failed'; why: string };

/** One run at a time per page; module state, so photo mode or a re-render cannot lose it. */
export const measureState = signal<MeasureState>({ k: 'closed' });
const keptRuns = signal<PerfRun[] | null | 'loading'>('loading');

/** Opens the confirm card (Settings' button). */
export function openMeasure(session: Session): void {
  session.ui.settingsOpen.value = false;
  measureState.value = { k: 'confirm' };
  void refreshKept(session);
}

async function refreshKept(session: Session): Promise<void> {
  keptRuns.value = 'loading';
  const runs = await perfStore(session.target).list();
  keptRuns.value = runs ? runsToShow(runs) : null;
}

async function run(session: Session): Promise<void> {
  const controller = new AbortController();
  measureState.value = { k: 'running', progress: null, controller };
  const ui = session.ui;
  const panel = ui.panel.value;
  const selection = ui.selection.value;
  ui.panel.value = null;
  ui.selection.value = null;
  let rows: PerfRow[] = [];
  try {
    const r = await measureLaptop(session, {
      ...QUICK,
      signal: controller.signal,
      onProgress: (progress) => {
        const s = measureState.value;
        if (s.k === 'running') measureState.value = { ...s, progress };
      },
    });
    rows = r.rows;
    const machine: PerfMachine = perfMachine(session.renderer);
    measureState.value = {
      k: 'done',
      rows,
      text: measureMarkdown(r.table, machine),
      save: 'saving',
      same: r.restored?.same ?? true,
    };
    const ok = await perfStore(session.target).put({ machine, rows, table: r.table });
    const s = measureState.value;
    if (s.k === 'done') measureState.value = { ...s, save: ok ? 'saved' : 'failed' };
    void refreshKept(session);
  } catch (e) {
    measureState.value = isPerfAborted(e)
      ? { k: 'stopped', rows }
      : { k: 'failed', why: e instanceof Error ? e.message : String(e) };
  } finally {
    ui.panel.value = panel;
    ui.selection.value = selection;
  }
}

/** Copies text, saying how it went on the button for a moment. */
function CopyButton({ text, testid, primary }: { text: string; testid: string; primary?: boolean }) {
  const [said, setSaid] = useState<string | null>(null);
  const copyIt = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setSaid(MEASURE_COPY.copied);
    } catch {
      setSaid(MEASURE_COPY.copyFailed);
    }
    setTimeout(() => setSaid(null), 1800);
  };
  return (
    <button type="button" class={primary ? 'primary' : ''} data-testid={testid} onClick={() => void copyIt()}>
      {said ?? MEASURE_COPY.copy}
    </button>
  );
}

const ms = (v: number | null): string => (v === null ? 'n/a' : v.toFixed(1));
/** A part's average and 95th percentile, or n/a when it caught no frames at all. */
const pair = (frames: number, avg: number | null, p95: number | null): string =>
  frames > 0 && avg !== null ? `${ms(avg)} / ${ms(p95)}` : 'n/a';

/** The rows as a table: frame and GPU ms (average and 95th percentile), moving and idle. */
export function MeasureTable({ rows }: { rows: readonly PerfRow[] }) {
  return (
    <div class="measure-table-wrap">
      <table class="measure-table" data-testid="measure-table">
        <thead>
          <tr>
            <th rowSpan={2}>Scene</th>
            <th rowSpan={2}>Preset</th>
            <th colSpan={2}>Moving, ms avg / p95</th>
            <th colSpan={2}>Idle, ms avg / p95</th>
            <th rowSpan={2}>Draws</th>
            <th rowSpan={2}>Triangles</th>
          </tr>
          <tr>
            <th>Frame</th>
            <th>GPU</th>
            <th>Frame</th>
            <th>GPU</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              data-testid="measure-row"
              class={i > 0 && rows[i - 1]!.scene !== r.scene ? 'new-scene' : ''}
            >
              <td>{i === 0 || rows[i - 1]!.scene !== r.scene ? sceneName(r.scene) : ''}</td>
              <td>{presetName(r.quality)}</td>
              <td>{pair(r.moving.frames, r.moving.frameAvg, r.moving.frameP95)}</td>
              <td>{pair(r.moving.frames, r.moving.gpuAvg, r.moving.gpuP95)}</td>
              <td>{pair(r.idle.frames, r.idle.frameAvg, r.idle.frameP95)}</td>
              <td>{pair(r.idle.frames, r.idle.gpuAvg, r.idle.gpuP95)}</td>
              <td>{r.moving.frames > 0 ? r.moving.draws : 'n/a'}</td>
              <td>{r.moving.frames > 0 ? `${(r.moving.triangles / 1e6).toFixed(2)} M` : 'n/a'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The runs both seats kept, newest first, each with its own Copy. */
function KeptRuns({ session }: { session: Session }) {
  const runs = keptRuns.value;
  const seats = session.mirror.seats.value;
  const who = (seat: number): string => {
    const name = seatLabel(seats, seat, session.seat);
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  return (
    <section class="measure-kept" data-testid="measure-kept">
      <h4>{MEASURE_COPY.kept}</h4>
      {runs === 'loading' ? null : runs === null ? (
        <p class="muted">{MEASURE_COPY.keptFailed}</p>
      ) : runs.length === 0 ? (
        <p class="muted">{MEASURE_COPY.keptNone}</p>
      ) : (
        <ul>
          {runs.map((r) => (
            <li key={`${r.seat}-${r.created}`} data-testid="measure-kept-run">
              <span>
                <strong>{who(r.seat)}</strong>,{' '}
                {new Date(r.created).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                <span class="muted">
                  {' '}
                  {r.machine.gpu ?? 'unnamed GPU'}, {r.machine.screen[0]} x {r.machine.screen[1]} at{' '}
                  {r.machine.pixelRatio}x
                </span>
              </span>
              <CopyButton text={measureMarkdown(r.table, r.machine)} testid="measure-kept-copy" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Progress({ state }: { state: Extract<MeasureState, { k: 'running' }> }) {
  const p = state.progress;
  const line = !p
    ? MEASURE_COPY.ready
    : p.stage === 'restoring'
      ? MEASURE_COPY.restoring
      : p.stage === 'loading'
        ? MEASURE_COPY.loading(SCENE_NAMES[p.scene])
        : MEASURE_COPY.measuring(SCENE_NAMES[p.scene], presetName(p.quality ?? ''));
  const step = p ? Math.max(p.step, 0) : 0;
  const total = p?.total ?? 12;
  return (
    <>
      {/* Hands off the valley while it runs: a stray drag or key would spoil the numbers. */}
      <div class="measure-shield" data-testid="measure-shield" />
      <div class="panel measure-progress" role="status" data-testid="measure-progress">
        <div class="measure-line">
          <strong>{line}</strong>
          {p?.stage !== 'restoring' && <span class="muted">{MEASURE_COPY.stepOf(step, total)}</span>}
        </div>
        <div class="measure-bar" aria-hidden="true">
          <span style={{ width: `${Math.round((step / total) * 100)}%` }} />
        </div>
        <div class="measure-line">
          <span class="muted">{MEASURE_COPY.stopHint}</span>
          <button
            type="button"
            data-testid="measure-stop"
            disabled={p?.stage === 'restoring' || state.controller.signal.aborted}
            onClick={() => state.controller.abort()}
          >
            {MEASURE_COPY.stop}
          </button>
        </div>
      </div>
    </>
  );
}

/** The overlay panel: confirm, progress, then the table. */
export function MeasurePanel({ session }: { session: Session }) {
  const state = measureState.value;
  // Keys belong to the panel while it shows: Escape stops a run or closes the card, and nothing
  // reaches the camera or the tools meanwhile.
  useEffect(() => {
    if (state.k === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      const s = measureState.value;
      if (s.k === 'closed') return;
      if (s.k === 'running') {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') s.controller.abort();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        measureState.value = { k: 'closed' };
      }
    };
    addEventListener('keydown', onKey, { capture: true });
    return () => removeEventListener('keydown', onKey, { capture: true });
  }, [state.k]);

  if (state.k === 'closed') return null;
  if (state.k === 'running') return <Progress state={state} />;
  const close = () => (measureState.value = { k: 'closed' });
  const wide = state.k === 'done' || (state.k === 'stopped' && state.rows.length > 0);
  return (
    <div class="modal-backdrop" onClick={close}>
      <div
        class={`panel modal measure ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-label={MEASURE_COPY.heading}
        data-testid="measure"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{MEASURE_COPY.heading}</h3>
        {state.k === 'confirm' && (
          <p data-testid="measure-estimate">
            {MEASURE_COPY.confirm(estimateText(measureSeconds(QUICK ?? {})))}
          </p>
        )}
        {state.k === 'done' && (
          <>
            <p data-testid="measure-done">{state.same ? MEASURE_COPY.done : MEASURE_COPY.doneOdd}</p>
            <MeasureTable rows={state.rows} />
            <p class="muted" data-testid="measure-saved" data-save={state.save}>
              {state.save === 'saving'
                ? MEASURE_COPY.saving
                : state.save === 'failed'
                  ? MEASURE_COPY.saveFailed
                  : session.target.mode === 'online'
                    ? MEASURE_COPY.savedOnline
                    : MEASURE_COPY.savedSolo}
            </p>
          </>
        )}
        {state.k === 'stopped' && (
          <>
            <p data-testid="measure-stopped">{MEASURE_COPY.stopped}</p>
            {state.rows.length > 0 && <MeasureTable rows={state.rows} />}
          </>
        )}
        {state.k === 'failed' && <p data-testid="measure-failed">{MEASURE_COPY.failed(state.why)}</p>}
        <KeptRuns session={session} />
        {state.k === 'confirm' ? (
          <div class="actions">
            <button type="button" data-testid="measure-close" onClick={close}>
              {MEASURE_COPY.notNow}
            </button>
            <button
              type="button"
              class="primary"
              data-testid="measure-start"
              disabled={!session.renderer}
              onClick={() => void run(session)}
            >
              {MEASURE_COPY.start}
            </button>
          </div>
        ) : (
          <div class="actions">
            {state.k === 'done' && <CopyButton text={state.text} testid="measure-copy" primary />}
            <button type="button" data-testid="measure-close" onClick={close}>
              {MEASURE_COPY.close}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
