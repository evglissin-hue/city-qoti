// Small shared pieces for the hamlet panels: frames, meters, good chips, hearts, toggles and the
// sparkline. Paper, ink and a few hand-drawn flourishes.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { InspectKind, InspectResult } from '@qoti/sim';
import { goodName } from '../format';
import { Glyph } from '../icons';

/** A paper panel with a title row and a close button. */
export function Frame({
  id,
  title,
  kicker,
  icon,
  onClose,
  class: cls,
  children,
}: {
  id: string;
  title: ComponentChildren;
  /** A small line above the title ("Resident", "Construction site"). */
  kicker?: ComponentChildren;
  icon?: string;
  onClose?: () => void;
  class?: string;
  children: ComponentChildren;
}) {
  return (
    <section class={`panel hamlet-panel ${cls ?? ''}`} data-testid={id}>
      <header class="panel-head">
        {icon && <Glyph id={icon} class="head-icon" />}
        <div class="panel-titles">
          {kicker && <span class="kicker">{kicker}</span>}
          <h3>{title}</h3>
        </div>
        {onClose && (
          <button type="button" class="close" title="Close" data-testid={`${id}-close`} onClick={onClose}>
            ×
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

/** A section heading with a little inked flourish. */
export function Heading({ children }: { children: ComponentChildren }) {
  return (
    <h4 class="flourish">
      <span>{children}</span>
    </h4>
  );
}

/** A labeled bar from 0 to 1. `tone` picks the ink. */
export function Meter({
  label,
  value,
  note,
  tone = 'sage',
  testid,
}: {
  label?: ComponentChildren;
  value: number;
  note?: ComponentChildren;
  tone?: 'sage' | 'ochre' | 'rose' | 'river' | 'warn';
  testid?: string;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div class={`meter tone-${tone}`} data-testid={testid}>
      {(label || note) && (
        <div class="meter-row">
          <span>{label}</span>
          {note !== undefined && <span class="muted">{note}</span>}
        </div>
      )}
      <div
        class="meter-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
      >
        <i style={{ width: `${(v * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}

/** "12 planks" as a little paper chip. */
export function GoodChip({ good, qty, of }: { good: string; qty: number; of?: number }) {
  return (
    <span class={`good-chip good-${good}`}>
      <i class="good-dot" />
      <b>{of === undefined ? qty : `${qty}/${of}`}</b> {goodName(good).toLowerCase()}
    </span>
  );
}

export function GoodList({ items, empty }: { items: [string, number][]; empty?: string }) {
  if (!items.length) return empty ? <p class="muted small">{empty}</p> : null;
  return (
    <div class="good-list">
      {items.map(([g, q]) => (
        <GoodChip key={g} good={g} qty={q} />
      ))}
    </div>
  );
}

/** Up to five hearts, filled to `level`. */
export function Hearts({ level, max = 5, title }: { level: number; max?: number; title?: string }) {
  return (
    <span class="hearts" title={title ?? `${level} of ${max}`} aria-label={`${level} of ${max} hearts`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" class={i < level ? 'on' : 'off'} aria-hidden="true">
          <path d="M12 20s-7.5-4.6-7.5-10A4 4 0 0 1 12 8a4 4 0 0 1 7.5 2c0 5.4-7.5 10-7.5 10z" />
        </svg>
      ))}
    </span>
  );
}

/** A small on/off switch with a label. */
export function Toggle({
  on,
  label,
  onChange,
  testid,
  disabled,
}: {
  on: boolean;
  label: ComponentChildren;
  onChange: (on: boolean) => void;
  testid?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      class={`toggle ${on ? 'on' : ''}`}
      data-testid={testid}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <i class="toggle-track">
        <b />
      </i>
      <span>{label}</span>
    </button>
  );
}

/** An inked line through the last days' values, with a dot on today. */
export function Sparkline({
  values,
  width = 84,
  height = 22,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <svg class="sparkline" width={width} height={height} aria-hidden="true" />;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const step = (width - 6) / (values.length - 1);
  const pts = values.map((v, i) => [3 + i * step, height - 3 - ((v - min) / span) * (height - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;
  const area = `${d} L${last[0].toFixed(1)} ${height - 2} L3 ${height - 2} Z`;
  const trend = values[values.length - 1]! - values[0]!;
  return (
    <svg
      class={`sparkline ${trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat'}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Trend over ${values.length} days`}
    >
      <path d={area} class="spark-area" />
      <path d={d} class="spark-line" />
      <circle cx={last[0]} cy={last[1]} r="2.2" class="spark-dot" />
    </svg>
  );
}

/** Empty state with a quiet line. */
export function Empty({ children }: { children: ComponentChildren }) {
  return <p class="empty muted">{children}</p>;
}

/**
 * Asks the sim worker for detail and refreshes it every `everyMs` and whenever `key` changes.
 * Returns undefined while the first answer is on its way, null when the entity is gone.
 */
export function useInspect<T extends InspectResult>(
  inspect: (kind: InspectKind, id: number) => Promise<InspectResult>,
  kind: InspectKind,
  id: number | null,
  key: unknown,
  everyMs = 1500,
): T | null | undefined {
  const [data, setData] = useState<{ id: number | null; value: T | null } | undefined>(undefined);
  useEffect(() => {
    if (id === null) return;
    let live = true;
    const load = () =>
      void inspect(kind, id).then((value) => {
        if (live) setData({ id, value: value as T | null });
      });
    load();
    const timer = everyMs > 0 ? setInterval(load, everyMs) : 0;
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [kind, id, key]);
  if (!data || data.id !== id) return undefined;
  return data.value;
}
