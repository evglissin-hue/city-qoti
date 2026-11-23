// P3D: the title's backdrop layer. The painted valley renders at once; the live one (the real renderer,
// a small town with its folk, smoke and lamps) is started after the first paint with a dynamic import,
// so Three.js and the sim worker never delay the menu, and fades in over the painted one when its
// first frame is drawn. No WebGL keeps the painted one. Unmounting disposes everything.
// This file must not import the renderer, the worker host or Three.js, statically or otherwise.
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadSettings } from '../../ui/settings';
import './backdrop.css';
import { Painted } from './Painted';
import {
  backdrop,
  backdropPhase,
  backdropStats,
  type BackdropPhase,
  type Framing,
  type TitleLight,
} from './shared';

/** True when this browser can give the renderer a WebGL2 context. */
export function webglAvailable(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    (gl as WebGL2RenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function calmMotion(): boolean {
  try {
    return loadSettings().reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Whether to start the live valley at all: not without WebGL, and not under automation unless the
 * page asks for it with `?backdrop=live` (as audio waits for `?audio`): the end-to-end specs that only
 * walk the menu keep the painted valley, so a software renderer drawing a town behind them never
 * slows their clicks. The P3D backdrop specs, shot scripts and boot numbers opt in.
 */
export function wantsLive(): boolean {
  if (navigator.webdriver && new URLSearchParams(location.search).get('backdrop') !== 'live') return false;
  return webglAvailable();
}

/** The longest the live backdrop waits for an idle moment after the first paint. */
const IDLE_MS = 500;

export function TitleBackdrop(props: { light: TitleLight; framing: Framing }) {
  const liveRef = useRef<HTMLDivElement>(null);
  const [phase, setPhaseState] = useState<BackdropPhase>('painted');
  const framing = useRef(props.framing);
  framing.current = props.framing;

  useEffect(() => {
    backdrop.current?.setFraming(props.framing);
  }, [props.framing.x, props.framing.y]);

  useEffect(() => {
    const setPhase = (p: BackdropPhase) => {
      backdropPhase.value = p;
      setPhaseState(p);
    };
    setPhase('painted');
    let cancelled = false;
    let handle: { dispose(): void } | null = null;
    let raf = 0;
    let idle: ReturnType<typeof setTimeout> | number = 0;
    let idleKind: 'idle' | 'timeout' | null = null;
    // The timers this layer holds, counted in `backdropStats.liveTimers` with the host's own.
    const held = new Set<string>();
    const hold = (k: string) => {
      if (!held.has(k)) backdropStats.liveTimers++;
      held.add(k);
    };
    const release = (k: string) => {
      if (held.delete(k)) backdropStats.liveTimers--;
    };

    const load = () => {
      release('idle');
      idle = 0;
      idleKind = null;
      if (cancelled || !liveRef.current) return;
      setPhase('loading');
      void import('./backdrop').then(
        (m) => {
          if (cancelled || !liveRef.current) return;
          handle = m.startBackdrop({
            container: liveRef.current,
            light: props.light,
            framing: framing.current,
            calm: calmMotion(),
            onFirstFrame: () => {
              if (!cancelled) setPhase('live');
            },
            onFail: () => {
              if (!cancelled) setPhase('painted');
            },
          });
        },
        () => {
          if (!cancelled) setPhase('painted');
        },
      );
    };

    if (wantsLive()) {
      // After the first paint, then when the browser is idle (or half a second on), whichever first.
      hold('raf');
      raf = requestAnimationFrame(() => {
        release('raf');
        raf = 0;
        if (cancelled) return;
        hold('idle');
        if (typeof requestIdleCallback === 'function') {
          idleKind = 'idle';
          idle = requestIdleCallback(load, { timeout: IDLE_MS });
        } else {
          idleKind = 'timeout';
          idle = setTimeout(load, 120);
        }
      });
    }

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (idle) {
        if (idleKind === 'idle') cancelIdleCallback(idle as number);
        else clearTimeout(idle);
      }
      for (const k of [...held]) release(k);
      handle?.dispose();
      handle = null;
      backdrop.current = null;
      backdropPhase.value = 'gone';
    };
  }, [props.light]);

  return (
    <div class="title-backdrop" data-backdrop={phase} data-light={props.light} aria-hidden="true">
      <Painted light={props.light} />
      <div class="title-backdrop-live" ref={liveRef} />
    </div>
  );
}
