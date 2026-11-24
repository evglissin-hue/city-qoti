// P3D: the title's living backdrop, the host side (no Preact). A small lived-in valley in the real
// renderer behind the menu: a SimHost and a Mirror like a session's, but no room, no tools, no audio.
// It is loaded with a dynamic import by Backdrop.tsx after the first paint, so Three.js and the sim
// worker never sit in the menu's way. Everything it makes is counted in `backdropStats` and torn down
// by `dispose()`, which is safe to call at any moment, including while the valley is still loading.
import { TURN_MS } from '@qoti/protocol';
import { base64ToBytes, peekSaveVersion, type SeatedCommand, type Turn, type ViewSnapshot } from '@qoti/sim';
import { IdbStorage } from '../../net/idb';
import type { CameraView } from '../../input/camera';
import { isQuality, type Quality } from '../../render/quality';
import { Renderer, type RenderStats } from '../../render/renderer';
import { Mirror } from '../../state/mirror';
import { SimHost } from '../../worker/host';
import { findRecent, listRecent } from '../recent';
import {
  backdrop,
  backdropStats,
  MARK_BACKDROP,
  type BackdropControl,
  type Framing,
  type TitleLight,
} from './shared';
import {
  aimAt,
  chooseValley,
  driftView,
  framedTarget,
  HOURS,
  townCenter,
  type TownAim,
} from './backdropMath';

const OLDEST_SAVE = 6;
const QUALITY_KEY = 'qoti.quality.v1';

export interface BackdropOptions {
  container: HTMLElement;
  light: TitleLight;
  framing: Framing;
  /** Calm motion at the start (the player's setting or prefers-reduced-motion). */
  calm: boolean;
  /** Called once, on the first frame drawn by the live renderer. */
  onFirstFrame(): void;
  /** Called when the live backdrop cannot run (the painted one stays). */
  onFail?(why: string): void;
}

export interface LiveBackdrop {
  /** Resolves true when the first frame is drawn, false when it failed or was disposed first. */
  ready: Promise<boolean>;
  dispose(): void;
}

/** `?quality=`, then the saved choice, else the gentlest preset: never the device guess. */
export function backdropQuality(): Quality {
  const fromUrl = new URLSearchParams(location.search).get('quality');
  if (isQuality(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    if (isQuality(saved)) return saved;
  } catch {
    // Storage blocked: the gentlest preset is right anyway.
  }
  return 'low';
}

/** The pinned hour: `?titleHour=` (0 to 24, for shots comparing hours), else the light's own. */
function titleHour(light: TitleLight): number {
  const h = Number(new URLSearchParams(location.search).get('titleHour') ?? NaN);
  return Number.isFinite(h) && h >= 0 && h < 24 ? h : HOURS[light];
}

/** Both seats join, so the clock runs at its own pace even in a together-only valley. */
function joinCommands(): SeatedCommand[] {
  return ([0, 1] as const).map((seat) => ({ seat, seq: 0, cmd: { t: 'sys.seatJoined', seat } }));
}

export function startBackdrop(opts: BackdropOptions): LiveBackdrop {
  backdropStats.created++;
  let disposed = false;
  let host: SimHost | null = null;
  let renderer: Renderer | null = null;
  let wake: (() => void) | null = null;
  const gone = new Promise<'gone'>((resolve) => (wake = () => resolve('gone')));
  const rafs = new Set<number>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  const cleanups: (() => void)[] = [];

  const raf = (fn: FrameRequestCallback): number => {
    const id = requestAnimationFrame((t) => {
      rafs.delete(id);
      backdropStats.liveTimers--;
      fn(t);
    });
    rafs.add(id);
    backdropStats.liveTimers++;
    return id;
  };
  const every = (fn: () => void, ms: number): void => {
    const id = setInterval(fn, ms);
    intervals.add(id);
    backdropStats.liveTimers++;
  };

  const state = {
    calm: opts.calm,
    framing: opts.framing,
  };

  const control: BackdropControl = {
    setQuality: (q) => renderer?.setQuality(q),
    setCalm: (on) => {
      state.calm = on;
    },
    setFraming: (f) => {
      state.framing = f;
    },
  };

  /** Everything made so far, in reverse order of making. Idempotent. */
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const id of rafs) {
      cancelAnimationFrame(id);
      backdropStats.liveTimers--;
    }
    rafs.clear();
    for (const id of intervals) {
      clearInterval(id);
      backdropStats.liveTimers--;
    }
    intervals.clear();
    for (const fn of cleanups.splice(0).reverse()) fn();
    if (renderer) {
      try {
        renderer.dispose();
      } finally {
        renderer = null;
        backdropStats.liveRenderers--;
      }
    }
    if (host) {
      host.terminate();
      host = null;
      backdropStats.liveWorkers--;
    }
    if (backdrop.current === control) backdrop.current = null;
    backdropStats.disposed++;
    wake?.();
  }

  const race = <T>(p: Promise<T>): Promise<T | 'gone'> => Promise.race([p, gone]);

  async function run(): Promise<boolean> {
    const mirror = new Mirror();
    const h = new SimHost();
    host = h;
    backdropStats.liveWorkers++;
    let failure: string | null = null;
    h.onError = (m) => {
      failure = m;
      wake?.();
    };

    // The valley: the player's own last town when it has grown, else the grown village.
    const picked = await race(pickSnapshot());
    if (picked === 'gone' || disposed) return false;
    let view: ViewSnapshot | 'gone' | null = null;
    if (picked.mine) {
      view = await race(h.init({ kind: 'snapshot', data: picked.mine }).catch(() => null));
      if (view === 'gone' || disposed) return false;
      if (view && !chooseValley(view.buildings.length)) view = null;
    }
    if (!view) {
      const bytes = await race(grownBytes());
      if (bytes === 'gone' || disposed) return false;
      view = await race(h.init({ kind: 'snapshot', data: bytes }));
      if (view === 'gone' || disposed || failure) return false;
    }
    mirror.load(view);

    // The first frame, and the loop that keeps the view where we put it.
    let lastTurn = view.lastTurn;
    let acked = lastTurn;
    h.onUpdate = (u) => {
      acked = u.t;
      mirror.apply(u);
    };
    h.onAgents = (t, data) => mirror.applyAgents(t, data, performance.now());

    let r: Renderer;
    try {
      r = new Renderer(opts.container, mirror, backdropQuality());
    } catch (err) {
      opts.onFail?.(err instanceof Error ? err.message : String(err));
      return false;
    }
    renderer = r;
    // V4X: `?debug` lets the shot scripts read the backdrop's own frames (does a still backdrop
    // develop, does a drifting one stay a moving frame); nothing for players.
    if (new URLSearchParams(location.search).has('debug'))
      (globalThis as { __qotiBackdropStats?: () => RenderStats }).__qotiBackdropStats = () => r.stats;
    backdropStats.liveRenderers++;
    r.canvas.tabIndex = -1;
    r.canvas.setAttribute('aria-hidden', 'true');
    r.photo.setTimeOfDay(titleHour(opts.light));

    const aim: TownAim = aimAt(townCenter([...mirror.buildings.values()]));
    // For the shot script and the tests: where the camera was aimed and how big the town is.
    opts.container.dataset.aim = JSON.stringify({ ...aim, buildings: view.buildings.length });
    const t0 = performance.now();
    let first = true;
    const frame = (): void => {
      if (disposed || !renderer) return;
      backdropStats.frames++;
      const seconds = state.calm ? 0 : (performance.now() - t0) / 1000;
      const aspect = Math.max(0.2, opts.container.clientWidth / Math.max(1, opts.container.clientHeight));
      const v: CameraView = framedTarget(driftView(aim, seconds), aim, state.framing, aspect);
      // Every frame, even when nothing moves: the rig's own key handling can never carry us away.
      r.rig.restoreView(v);
      if (first) {
        first = false;
        // The renderer's own loop draws after this callback; mark the frame that holds our view.
        raf(() => {
          if (disposed) return;
          performance.mark(MARK_BACKDROP);
          opts.onFirstFrame();
        });
      }
      raf(frame);
    };
    raf(frame);

    // Folk walk: empty turns at the room's pace, from the snapshot's last turn. The first one
    // carries the seats' arrival, which is what starts the clock in a stored valley.
    let sentJoin = false;
    every(() => {
      if (disposed || !host || document.visibilityState === 'hidden') return;
      if (lastTurn - acked > 6) return;
      const turn: Turn = { t: lastTurn + 1, cmds: sentJoin ? [] : joinCommands() };
      sentJoin = true;
      lastTurn = turn.t;
      host.turns([turn]);
    }, TURN_MS);

    backdrop.current = control;
    return true;
  }

  const ready = run().then(
    (ok) => {
      if (!ok && !disposed) {
        opts.onFail?.('The valley did not load.');
        dispose();
      }
      return ok && !disposed;
    },
    (err) => {
      if (!disposed) {
        opts.onFail?.(err instanceof Error ? err.message : String(err));
        dispose();
      }
      return false;
    },
  );
  return { ready, dispose };
}

/** The most recent valley's stored snapshot when it qualifies, else nothing (the grown village). */
async function pickSnapshot(): Promise<{ mine: Uint8Array | null }> {
  try {
    const v = listRecent()[0];
    if (!v || v.mode !== 'solo' || v.old || v.pending || !findRecent(v.valleyId)) return { mine: null };
    const store = new IdbStorage(v.valleyId);
    try {
      const snap = await store.latestSnapshot();
      if (!snap) return { mine: null };
      const bytes = base64ToBytes(snap.data);
      const version = peekSaveVersion(bytes);
      return { mine: version !== null && version >= OLDEST_SAVE ? bytes : null };
    } finally {
      await store.close();
    }
  } catch {
    return { mine: null };
  }
}

/** The grown village's file bytes, handed to the worker as they are. */
async function grownBytes(): Promise<Uint8Array> {
  const url = (await import('../fixtures/grown.qoti?url')).default;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The grown village did not load (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}
