// R2D: paper tags on the ground at each open gap (docs/spec/19-evenings.md, Gaps), in both lenses.
// A small slip with a short label, tinted by lane, tied to its tile by a pin. The full words and
// what would close it are on hover; a click centers the camera there. Drawn in the UI over the
// canvas (the render layers belong to another track): positions are projected each frame, written
// straight to the elements so nothing re-renders, and only while there are gaps to show.
import { useEffect, useRef } from 'preact/hooks';
import type { Session } from '../app/session';
import type { RenderApi } from '../render/api';
import { levelY } from '../render/coords';
import { gapLabel, gapSpot } from './gaps';

type Project = (x: number, y: number, z: number) => { x: number; y: number; onScreen: boolean } | null;

export function GapTags({ session }: { session: Session }) {
  const m = session.mirror;
  const open = m.gaps.value?.open ?? [];
  const standard = m.settings.value.mode === 'standard';
  const refs = useRef(new Map<number, HTMLElement>());
  const live = standard && open.length > 0;
  useEffect(() => {
    if (!live) return;
    let frame = 0;
    const step = () => {
      frame = requestAnimationFrame(step);
      const api = session.renderer as unknown as Partial<RenderApi> | null;
      const project = api?.project?.bind(api) as Project | undefined;
      const gaps = m.gaps.peek()?.open ?? [];
      for (const g of gaps) {
        const el = refs.current.get(g.id);
        if (!el) continue;
        const { x, z } = gapSpot(g);
        const p = project?.(x, levelY(m.height(Math.floor(x), Math.floor(z))), z);
        if (!p || !p.onScreen) {
          if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
          continue;
        }
        if (el.style.visibility !== 'visible') el.style.visibility = 'visible';
        el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [session, m, live]);
  if (!live) return null;
  return (
    <div class="gap-layer" aria-hidden="false" data-testid="gap-tags">
      {open.map((g) => (
        <span
          key={g.id}
          class="gap-anchor"
          style={{ visibility: 'hidden' }}
          ref={(el) => {
            if (el) refs.current.set(g.id, el);
            else refs.current.delete(g.id);
          }}
        >
          <button
            type="button"
            class={`gap-tag lane-${g.lane}`}
            data-testid={`gap-tag-${g.id}`}
            title={`${g.text}\n${g.closes}`}
            style={{ '--tilt': `${((g.id * 7) % 5) - 2}deg` }}
            onClick={() => {
              const { x, z } = gapSpot(g);
              session.render?.focus(x, z);
            }}
          >
            {gapLabel(g)}
          </button>
        </span>
      ))}
    </div>
  );
}
