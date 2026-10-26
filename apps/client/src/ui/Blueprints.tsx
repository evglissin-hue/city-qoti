// The blueprint layer (I2, C4F): plans drawn on the valley in ink-blue (docs/spec/16-coop.md,
// Plans layer), the sketch in progress, and the zone tool's lot preview, as SVG over the canvas.
// Shapes are projected onto the ground every frame while there is something to draw.
import { MAP_SIZE, type PlanItem } from '@qoti/sim';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../app/session';
import type { RenderApi } from '../render/api';
import { levelY } from '../render/coords';
import { seatLabel } from './format';
import { groundMarks, groundNote, type GroundMark } from './marks';
import { shapesOf, type BlueprintShape } from './plans';
import { ZONE_INK, zoneInk } from './village';

interface Drawn {
  d: string;
  cls: string;
  ink?: string;
}

interface Tag {
  key: string;
  x: number;
  y: number;
  text: string;
  cls: string;
}

const LIFT = 0.06;

type Project = (x: number, y: number, z: number) => { x: number; y: number; onScreen: boolean } | null;

/** The layers the blueprint draws right now, from UI state. */
function collect(session: Session): {
  plans: { id: number; label: string; items: PlanItem[]; sketch: boolean }[];
  marks: GroundMark[];
} {
  const m = session.mirror;
  const ui = session.ui;
  const seats = m.seats.value;
  const plans: { id: number; label: string; items: PlanItem[]; sketch: boolean }[] = [];
  const sketch = ui.sketch.value;
  if (sketch && sketch.items.length)
    plans.push({ id: -1, label: 'Your sketch', items: sketch.items, sketch: true });
  const active = session.tools?.active.value;
  const focus = ui.planFocus.value;
  for (const p of m.plans.values()) {
    if (p.status !== 'open') continue;
    if (p.id !== focus && active !== 'plan') continue;
    const who = p.by === session.seat ? 'Your plan' : `${seatLabel(seats, p.by, session.seat)}'s plan`;
    plans.push({ id: p.id, label: `${who}: ${p.name}`, items: p.items, sketch: false });
  }
  const marks = [...groundMarks.value];
  // While zoning, the lots already cut show faintly, so new paint can line up with them.
  if (active === 'zone') {
    for (const l of m.lots.values()) {
      marks.push({ x: l.x, z: l.z, w: l.w, d: l.d, ink: zoneInk(l.zone), dashed: true });
    }
  }
  return { plans, marks };
}

export function Blueprints({ session }: { session: Session }) {
  const [drawn, setDrawn] = useState<{ paths: Drawn[]; tags: Tag[] }>({ paths: [], tags: [] });
  const frame = useRef(0);
  const last = useRef('');
  useEffect(() => {
    const step = () => {
      frame.current = requestAnimationFrame(step);
      const api = session.renderer as unknown as Partial<RenderApi> | null;
      const project = api?.project?.bind(api) as Project | undefined;
      const { plans, marks } = collect(session);
      if (!project || (!plans.length && !marks.length)) {
        if (last.current) {
          last.current = '';
          setDrawn({ paths: [], tags: [] });
        }
        return;
      }
      const next = draw(session, project, plans, marks);
      const key = next.paths.map((p) => p.d).join('|') + next.tags.map((t) => `${t.x},${t.y}`).join('|');
      if (key !== last.current) {
        last.current = key;
        setDrawn(next);
      }
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [session]);
  const note = groundNote.value;
  return (
    <div class="blueprint-layer" aria-hidden="true" data-testid="blueprints">
      <svg class="blueprint-svg" width="100%" height="100%">
        {drawn.paths.map((p, i) => (
          <path key={i} d={p.d} class={p.cls} style={p.ink ? { '--ink': p.ink } : undefined} />
        ))}
      </svg>
      {drawn.tags.map((t) => (
        <span key={t.key} class={`blueprint-tag ${t.cls}`} style={{ left: `${t.x}px`, top: `${t.y}px` }}>
          {t.text}
        </span>
      ))}
      {note && <span class="ground-note">{note}</span>}
    </div>
  );
}

function draw(
  session: Session,
  project: Project,
  plans: { id: number; label: string; items: PlanItem[]; sketch: boolean }[],
  marks: GroundMark[],
): { paths: Drawn[]; tags: Tag[] } {
  const m = session.mirror;
  const height = (x: number, z: number) => {
    const tx = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(x)));
    const tz = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(z)));
    return levelY(m.height(tx, tz)) + LIFT;
  };
  const pt = (x: number, z: number) => project(x, height(x, z), z);
  /** A ground polygon through the given points, or null when it is all off screen. */
  const poly = (points: [number, number][], closed: boolean): string | null => {
    let any = false;
    const out: string[] = [];
    for (const [x, z] of points) {
      const p = pt(x, z);
      if (!p) return null;
      if (p.onScreen) any = true;
      out.push(`${out.length ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
    if (!any) return null;
    return out.join(' ') + (closed ? ' Z' : '');
  };
  const rectPoints = (x: number, z: number, w: number, d: number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i < w; i += 0.5) pts.push([x + i, z]);
    for (let i = 0; i < d; i += 0.5) pts.push([x + w, z + i]);
    for (let i = w; i > 0; i -= 0.5) pts.push([x + i, z + d]);
    for (let i = d; i > 0; i -= 0.5) pts.push([x, z + i]);
    return pts;
  };
  const paths: Drawn[] = [];
  const tags: Tag[] = [];

  for (const plan of plans) {
    const base = plan.sketch ? 'bp sketch' : 'bp plan';
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (const { cmd } of plan.items) {
      for (const s of shapesOf(cmd, m)) {
        const cls = `${base}${s.removal ? ' removal' : ''}`;
        drawShape(s, cls, paths, poly, rectPoints);
        const c = centerOf(s);
        sx += c[0];
        sz += c[1];
        n++;
      }
    }
    if (n) {
      const p = pt(sx / n, sz / n);
      if (p?.onScreen)
        tags.push({
          key: `plan-${plan.id}`,
          x: p.x,
          y: p.y,
          text: plan.label,
          cls: plan.sketch ? 'sketch' : 'plan',
        });
    }
  }
  for (const mk of marks) {
    const d = poly(rectPoints(mk.x + 0.06, mk.z + 0.06, mk.w - 0.12, mk.d - 0.12), true);
    if (d) paths.push({ d, cls: `bp lot ${mk.dashed ? 'faint' : ''}`, ink: mk.ink });
    if (mk.door) {
      const cx = mk.x + mk.w / 2;
      const cz = mk.z + mk.d / 2;
      const [a, b] =
        mk.door === 'n'
          ? [
              [cx - 0.3, mk.z + 0.06],
              [cx + 0.3, mk.z + 0.06],
            ]
          : mk.door === 's'
            ? [
                [cx - 0.3, mk.z + mk.d - 0.06],
                [cx + 0.3, mk.z + mk.d - 0.06],
              ]
            : mk.door === 'w'
              ? [
                  [mk.x + 0.06, cz - 0.3],
                  [mk.x + 0.06, cz + 0.3],
                ]
              : [
                  [mk.x + mk.w - 0.06, cz - 0.3],
                  [mk.x + mk.w - 0.06, cz + 0.3],
                ];
      const door = poly([a as [number, number], b as [number, number]], false);
      if (door) paths.push({ d: door, cls: 'bp lot-door', ink: mk.ink });
    }
  }
  return { paths, tags };
}

function centerOf(s: BlueprintShape): [number, number] {
  if (s.kind === 'rect') return [s.x + s.w / 2, s.z + s.d / 2];
  if (s.kind === 'dot') return [s.x, s.z];
  const pts = s.kind === 'line' ? s.points : s.tiles.map(([x, z]) => [x + 0.5, z + 0.5] as [number, number]);
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    z += p[1];
  }
  return pts.length ? [x / pts.length, z / pts.length] : [0, 0];
}

function drawShape(
  s: BlueprintShape,
  cls: string,
  paths: Drawn[],
  poly: (points: [number, number][], closed: boolean) => string | null,
  rectPoints: (x: number, z: number, w: number, d: number) => [number, number][],
): void {
  if (s.kind === 'rect') {
    const d = poly(rectPoints(s.x + 0.04, s.z + 0.04, s.w - 0.08, s.d - 0.08), true);
    if (d) paths.push({ d, cls: `${cls} area` });
    if (s.removal) {
      const x1 = poly(
        [
          [s.x + 0.3, s.z + 0.3],
          [s.x + s.w - 0.3, s.z + s.d - 0.3],
        ],
        false,
      );
      const x2 = poly(
        [
          [s.x + s.w - 0.3, s.z + 0.3],
          [s.x + 0.3, s.z + s.d - 0.3],
        ],
        false,
      );
      if (x1) paths.push({ d: x1, cls: `${cls} cross` });
      if (x2) paths.push({ d: x2, cls: `${cls} cross` });
    }
    return;
  }
  if (s.kind === 'dot') {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      pts.push([s.x + Math.cos(a) * s.r, s.z + Math.sin(a) * s.r]);
    }
    const d = poly(pts, true);
    if (d) paths.push({ d, cls: `${cls} area` });
    return;
  }
  if (s.kind === 'line') {
    const d = poly(s.points, false);
    if (d) paths.push({ d, cls: `${cls} road` });
    return;
  }
  const ink = s.tone ? ZONE_INK[s.tone] : undefined;
  for (const [x, z] of s.tiles) {
    const d = poly(
      [
        [x + 0.08, z + 0.08],
        [x + 0.92, z + 0.08],
        [x + 0.92, z + 0.92],
        [x + 0.08, z + 0.92],
      ],
      true,
    );
    if (d) paths.push(ink ? { d, cls: `${cls} tile zoned`, ink } : { d, cls: `${cls} tile` });
  }
}
