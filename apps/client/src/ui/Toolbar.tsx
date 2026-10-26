import type { Session } from '../app/session';
import { lenses, toolsForLens } from './lenses';

export function Toolbar({ session }: { session: Session }) {
  const manager = session.tools;
  if (!manager) return null;
  const lens = session.ui.lens.value;
  const active = manager.active.value;
  const tools = toolsForLens(manager.tools, lens);
  const current = manager.tool(active);
  const accent = lenses.find((l) => l.id === lens)?.accent ?? '#888';

  return (
    <footer class="toolbar" style={{ '--accent': accent }}>
      {current?.variants && current.variant && (
        <div class="variants panel">
          {current.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              class={current.variant!.value === v.id ? 'active' : ''}
              data-testid={`variant-${v.id}`}
              onClick={() => manager.select(current.id, v.id)}
            >
              {v.label}
            </button>
          ))}
          {current.hint && <span class="muted hint">{current.hint}</span>}
        </div>
      )}
      <div class="toolbar-row panel">
        <div class="lenses" title="Tab switches lens">
          {lenses.map((l) => (
            <button
              key={l.id}
              type="button"
              class={`lens ${lens === l.id ? 'active' : ''}`}
              style={{ '--lens': l.accent }}
              data-testid={`lens-${l.id}`}
              title={l.blurb}
              onClick={() => (session.ui.lens.value = l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div class="tools">
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              class={`tool ${active === t.id ? 'active' : ''}`}
              data-testid={`tool-${t.id}`}
              title={t.hint ? `${t.label}: ${t.hint}` : t.label}
              onClick={() => manager.select(t.id)}
            >
              <span class="icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}
