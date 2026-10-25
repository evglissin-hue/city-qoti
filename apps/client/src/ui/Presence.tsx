import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../app/session';
import type { RenderApi } from '../render/api';
import { copy } from './copy';

interface Mark {
  seat: number;
  name: string;
  color: string;
  x: number;
  y: number;
  onScreen: boolean;
  angle: number;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Partner name labels over their cursor, or a soft arrow at the edge when they are off screen. */
export function PresenceLabels({ session }: { session: Session }) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const frame = useRef(0);
  useEffect(() => {
    const step = () => {
      frame.current = requestAnimationFrame(step);
      // Optional contract: the renderer may not implement project yet, so read it defensively.
      const api = session.renderer as unknown as Partial<RenderApi> | null;
      const project = api?.project?.bind(api);
      const cursors = session.ui.cursors.value;
      if (!project || cursors.size === 0) {
        setMarks((m) => (m.length ? [] : m));
        return;
      }
      const seats = session.mirror.seats.value;
      const w = innerWidth;
      const h = innerHeight;
      const next: Mark[] = [];
      for (const [seat, c] of cursors) {
        if (seat === session.seat) continue;
        const p = project(c.x + 0.5, 0, c.z + 0.5);
        if (!p) continue;
        const info = seats.find((s) => s.seat === seat);
        const cx = w / 2;
        const cy = h / 2;
        const angle = Math.atan2(p.y - cy, p.x - cx);
        const pad = 36;
        const x = p.onScreen ? p.x : Math.min(w - pad, Math.max(pad, p.x));
        const y = p.onScreen ? p.y : Math.min(h - pad, Math.max(pad + 40, p.y));
        next.push({
          seat,
          name: info?.name ?? copy.presence.partner,
          color: info ? hex(info.color) : '#5f93b3',
          x,
          y,
          onScreen: p.onScreen,
          angle,
        });
      }
      setMarks(next);
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
            class="presence-label"
            data-testid={`cursor-label-${m.seat}`}
            style={{ left: `${m.x}px`, top: `${m.y}px`, '--seat': m.color }}
          >
            {m.name}
          </span>
        ) : (
          <span
            key={m.seat}
            class="presence-arrow"
            data-testid={`cursor-arrow-${m.seat}`}
            style={{ left: `${m.x}px`, top: `${m.y}px`, '--seat': m.color }}
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
      onClick={() => session.renderer?.focus(c.x + 0.5, c.z + 0.5)}
    >
      {copy.presence.goToPartner}
    </button>
  );
}
