import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../app/session';
import type { RenderApi } from '../render/api';
import { copy } from './copy';

interface Mark {
  seat: number;
  name: string;
  /** What they are doing, when it is more than looking around. */
  doing: string;
  color: string;
  x: number;
  y: number;
  alpha: number;
  onScreen: boolean;
  angle: number;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * The partner's pointer: an arrow in their color with their name (and the tool in hand) beside it,
 * standing on the smoothed point the renderer draws their ground spot at, so pointer and spot glide
 * together; a soft arrow at the edge of the screen when they are elsewhere in the valley.
 */
export function PresenceLabels({ session }: { session: Session }) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const frame = useRef(0);
  useEffect(() => {
    const step = () => {
      frame.current = requestAnimationFrame(step);
      // Optional contract: the renderer may not implement these, so read them defensively.
      const api = session.renderer as unknown as Partial<RenderApi> | null;
      const project = api?.project?.bind(api);
      const presenceAt = api?.presenceAt?.bind(api);
      const cursors = session.ui.cursors.value;
      const seats = session.mirror.seats.value;
      const w = innerWidth;
      const h = innerHeight;
      const next: Mark[] = [];
      if (project) {
        for (const s of seats) {
          if (s.seat === session.seat) continue;
          const c = cursors.get(s.seat);
          const at = presenceAt ? presenceAt(s.seat) : c ? { x: c.x, y: 0, z: c.z, alpha: 1 } : null;
          if (!at) continue;
          const p = project(at.x, at.y, at.z);
          if (!p) continue;
          const cx = w / 2;
          const cy = h / 2;
          const angle = Math.atan2(p.y - cy, p.x - cx);
          const pad = 36;
          const tool =
            c?.tool && c.tool !== 'inspect' ? session.tools?.tools.find((t) => t.id === c.tool) : null;
          next.push({
            seat: s.seat,
            name: s.name || copy.presence.partner,
            doing: tool?.label ?? '',
            color: hex(s.color),
            x: p.onScreen ? p.x : Math.min(w - pad, Math.max(pad, p.x)),
            y: p.onScreen ? p.y : Math.min(h - pad, Math.max(pad + 40, p.y)),
            alpha: at.alpha,
            onScreen: p.onScreen,
            angle,
          });
        }
      }
      setMarks((m) => (m.length === 0 && next.length === 0 ? m : next));
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [session]);

  return (
    <div class="presence-layer" aria-hidden="true">
      {marks.map((m) =>
        m.onScreen ? (
          <span
            key={m.seat}
            class="presence-cursor"
            data-testid={`cursor-label-${m.seat}`}
            style={{
              transform: `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0)`,
              opacity: m.alpha,
              '--seat': m.color,
            }}
          >
            <svg viewBox="0 0 20 22" width="20" height="22" class="presence-pointer">
              <path d="M2 1.5 L2 17.5 L6.4 13.6 L9.3 20 L12.4 18.6 L9.6 12.4 L15.5 12.2 Z" />
            </svg>
            <span class="presence-label">
              {m.name}
              {m.doing && <small> · {m.doing}</small>}
            </span>
          </span>
        ) : (
          <span
            key={m.seat}
            class="presence-arrow"
            data-testid={`cursor-arrow-${m.seat}`}
            style={{ left: `${m.x}px`, top: `${m.y}px`, opacity: m.alpha, '--seat': m.color }}
          >
            <i style={{ transform: `rotate(${m.angle}rad)` }} />
            <b>{m.name}</b>
          </span>
        ),
      )}
    </div>
  );
}

/** "Go to partner" for the top bar: glides the camera to their cursor. */
export function GoToPartner({ session }: { session: Session }) {
  const cursors = session.ui.cursors.value;
  const partner = [...cursors.entries()].find(([seat]) => seat !== session.seat);
  if (!partner) return null;
  const [, c] = partner;
  return (
    <button
      type="button"
      class="ghost-button go-partner"
      data-testid="go-to-partner"
      title={copy.presence.goToPartnerHint}
      onClick={() => session.renderer?.focus(Math.floor(c.x), Math.floor(c.z))}
    >
      {copy.presence.goToPartner}
    </button>
  );
}
