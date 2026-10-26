import type { Session } from '../../app/session';
import { alertsForLens, computeAlerts, type Alert } from '../alerts';
import { Glyph } from '../icons';
import type { ReportTab } from '../state';
import { showPlan } from './Plans';
import { openLetter } from './StoryLetter';

const SHOWN = 5;

/** The left feed: a few lens-filtered alerts, each a click away from what it is about. */
export function AlertsPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.revision.value;
  void m.hamletRevision.value;
  void m.stocks.value;
  void m.budget.value;
  void m.clock.value;
  void m.villageRevision.value;
  void m.market.value;
  void m.charter.value;
  if (m.settings.value.mode !== 'standard') return null;
  const lens = session.ui.lens.value;
  const who = { seat: session.seat, lettersRead: session.ui.lettersRead.value };
  const all = alertsForLens(
    computeAlerts(m, session.ui.letters.value, who),
    lens,
    session.ui.dismissed.value,
  );
  if (!all.length) return null;
  const open = session.ui.alertsOpen.value;
  const dismiss = (a: Alert) =>
    (session.ui.dismissed.value = new Set([...session.ui.dismissed.value, a.key]));
  return (
    <section class={`panel alerts lens-${lens}`} data-testid="alerts">
      <header>
        <h3>{lens === 'hearth' ? 'News from the lanes' : 'For the books'}</h3>
        <span class="alert-count">{all.length}</span>
        <button
          type="button"
          class="close"
          title={open ? 'Fold away' : 'Unfold'}
          onClick={() => (session.ui.alertsOpen.value = !open)}
        >
          {open ? '−' : '+'}
        </button>
      </header>
      {open && (
        <ul>
          {all.slice(0, SHOWN).map((a) => (
            <li key={a.key} class={`alert tone-${a.tone}`} data-testid={`alert-${a.key}`}>
              <button type="button" class="alert-body" onClick={() => act(session, a)}>
                <Glyph id={a.icon} />
                <span>{a.text}</span>
              </button>
              <button type="button" class="dismiss" title="Got it" onClick={() => dismiss(a)}>
                ×
              </button>
            </li>
          ))}
          {all.length > SHOWN && <li class="muted small more">and {all.length - SHOWN} more</li>}
        </ul>
      )}
    </section>
  );
}

export function act(session: Session, a: Alert): void {
  const action = a.action;
  if (!action) return;
  const m = session.mirror;
  switch (action.kind) {
    case 'building': {
      const b = m.buildings.get(action.id);
      if (!b) return;
      session.ui.selection.value = { kind: 'building', id: b.id };
      session.render?.focus(b.x, b.z);
      break;
    }
    case 'wish': {
      const w = m.wishes.get(action.id);
      session.ui.panel.value = 'wishes';
      if (w?.area) {
        session.ui.wishFocus.value = w.id;
        session.render?.highlight?.({ ...w.area, tone: w.lane });
        session.render?.focus(w.area.x, w.area.z);
      }
      break;
    }
    case 'panel':
      session.ui.panel.value = action.panel;
      if (action.panel === 'reports' && action.page) session.ui.reportTab.value = action.page as ReportTab;
      if (action.panel === 'patterns') session.ui.bookPage.value = action.page ?? null;
      break;
    case 'place':
      session.render?.focus(action.x, action.z);
      break;
    // I2 (C4F)
    case 'letter': {
      const letter = m.letters.value.find((l) => l.arc === action.arc && l.step === action.step);
      if (letter) openLetter(session, letter);
      break;
    }
    case 'plan': {
      const p = m.plans.get(action.id);
      session.ui.panel.value = 'plans';
      if (p) showPlan(session, p);
      break;
    }
    case 'request': {
      session.ui.requestsOpen.value = true;
      const r = m.requests.get(action.id);
      if (r?.ask.kind === 'charm') {
        session.render?.focus(r.ask.x, r.ask.z);
        session.render?.highlight?.({ x: r.ask.x, z: r.ask.z, radius: r.ask.radius, tone: 'hearth' });
      } else if (r?.ask.kind === 'goods' && r.ask.at) {
        session.ui.selection.value = { kind: 'building', id: r.ask.at };
      }
      break;
    }
    case 'market':
      session.ui.lens.value = 'ledger';
      session.ui.marketTab.value = 'prices';
      session.ui.marketGood.value = action.good;
      session.ui.panel.value = 'market';
      break;
  }
}
