import { MAX_COMMENT_CHARS, MAX_PLAN_NAME_CHARS, type PlanView } from '@qoti/sim';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../../app/session';
import { seatLabel, shortDate } from '../format';
import { Glyph } from '../icons';
import { planCenter, planSummary } from '../plans';
import { partnerName } from '../village';
import { Empty, Frame } from './parts';

/** Shows a plan's blueprint on the valley and glides there. */
export function showPlan(session: Session, p: PlanView): void {
  session.ui.planFocus.value = p.id;
  const c = planCenter(p.items, session.mirror);
  if (c) session.render?.focus(c[0], c[1]);
}

/** Starts a sketch: from now on the tools draw blueprints instead of building. */
export function startSketch(session: Session): void {
  session.ui.sketch.value = { items: [], basedOn: null };
  session.ui.planFocus.value = null;
}

/**
 * The plans layer (docs/spec/16-coop.md): sketch with the ordinary tools, propose, talk it over,
 * then either of you approves (it builds what still fits) or discards. A tool for talking, not a gate.
 */
export function PlansPanel({ session }: { session: Session }) {
  const m = session.mirror;
  void m.villageRevision.value;
  const sketch = session.ui.sketch.value;
  const plans = [...m.plans.values()];
  const open = plans.filter((p) => p.status === 'open').sort((a, b) => b.tick - a.tick || b.id - a.id);
  const done = plans.filter((p) => p.status !== 'open').sort((a, b) => b.tick - a.tick || b.id - a.id);
  const close = () => {
    session.ui.panel.value = null;
    session.ui.planFocus.value = null;
  };
  return (
    <Frame id="plans" class="book-panel plans" icon="plan" kicker="Together" title="Plans" onClose={close}>
      {sketch ? (
        <SketchCard session={session} />
      ) : (
        <div class="sketch-start">
          <p class="small">
            Sketch with the usual tools: roads, buildings, decor and zones you place become blueprint instead
            of building, until one of you approves.
          </p>
          <button
            type="button"
            class="primary"
            data-testid="sketch-start"
            onClick={() => startSketch(session)}
          >
            <Glyph id="plan" /> Sketch a plan
          </button>
        </div>
      )}
      {open.length === 0 && !sketch && <Empty>No plans on the table. The table is very tidy.</Empty>}
      <ul class="plan-list">
        {open.map((p) => (
          <PlanCard key={p.id} session={session} p={p} />
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <h4 class="flourish">
            <span>Settled</span>
          </h4>
          <ul class="plan-list settled">
            {done.slice(0, 6).map((p) => (
              <li key={p.id} class={`plan settled status-${p.status}`} data-testid={`plan-${p.id}`}>
                <p>
                  <b>{p.name}</b>{' '}
                  <span class="muted small">
                    {p.status === 'approved'
                      ? `approved: ${p.applied ?? 0} built${p.skipped ? `, ${p.skipped} skipped (no longer fit)` : ''}`
                      : 'set aside'}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Frame>
  );
}

function SketchCard({ session }: { session: Session }) {
  const sketch = session.ui.sketch.value!;
  const [name, setName] = useState('');
  const n = sketch.items.length;
  const propose = (e: Event) => {
    e.preventDefault();
    if (!n) return;
    const title = name.trim() || 'A small idea';
    session.submit({ t: 'plan.add', name: title.slice(0, MAX_PLAN_NAME_CHARS), items: sketch.items });
    session.ui.sketch.value = null;
  };
  return (
    <form class="sketch-card" data-testid="sketch-card" onSubmit={propose}>
      <p class="sketch-title">
        <Glyph id="plan" /> <b>Sketching</b>
        <span class="muted small">
          {n ? planSummary(sketch.items) : 'Pick a tool and place things; they stay ink until approved.'}
        </span>
      </p>
      <input
        type="text"
        maxLength={MAX_PLAN_NAME_CHARS}
        placeholder="Name it: A green by the mill"
        value={name}
        data-testid="sketch-name"
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
      />
      <div class="row-actions">
        <button
          type="button"
          class="small-button"
          disabled={!n}
          data-testid="sketch-undo"
          onClick={() => (session.ui.sketch.value = { ...sketch, items: sketch.items.slice(0, -1) })}
        >
          Take the last one back
        </button>
        <span class="spacer" />
        <button
          type="button"
          class="small-button"
          data-testid="sketch-cancel"
          onClick={() => (session.ui.sketch.value = null)}
        >
          Throw it away
        </button>
        <button type="submit" class="primary small-button" data-testid="sketch-propose" disabled={!n}>
          Propose
        </button>
      </div>
    </form>
  );
}

function PlanCard({ session, p }: { session: Session; p: PlanView }) {
  const m = session.mirror;
  const seats = m.seats.value;
  const me = session.seat;
  const mine = p.by === me;
  const seenByMe = p.seenBy.includes(me);
  const partnerSaw = p.seenBy.some((s) => s !== me);
  const focused = session.ui.planFocus.value === p.id;
  const [text, setText] = useState('');
  // Opening the panel on a plan counts as having seen it.
  useEffect(() => {
    if (!seenByMe) session.submit({ t: 'plan.seen', id: p.id });
  }, [p.id, seenByMe]);
  const comment = (e: Event) => {
    e.preventDefault();
    if (!text.trim()) return;
    session.submit({ t: 'plan.comment', id: p.id, text: text.trim().slice(0, MAX_COMMENT_CHARS) });
    setText('');
  };
  const approve = () => {
    session.submit({ t: 'plan.approve', id: p.id });
    if (focused) session.ui.planFocus.value = null;
  };
  const discard = async () => {
    const ok = await confirmDiscard(session, p);
    if (!ok) return;
    session.submit({ t: 'plan.remove', id: p.id });
    if (focused) session.ui.planFocus.value = null;
  };
  return (
    <li class={`plan ${focused ? 'focused' : ''} ${seenByMe ? '' : 'new'}`} data-testid={`plan-${p.id}`}>
      <header>
        <h4>{p.name}</h4>
        {!seenByMe && <span class="new-chip">New</span>}
      </header>
      <p class="small plan-meta">
        {mine ? 'Your plan' : `${seatLabel(seats, p.by, me)}'s plan`}, {shortDate(p.tick)}.{' '}
        {mine && !partnerSaw && (
          <span class="unseen" data-testid={`plan-unseen-${p.id}`}>
            Not yet seen by {partnerName(seats, me)}.
          </span>
        )}
      </p>
      <p class="plan-summary">{planSummary(p.items)}</p>
      {p.comments.length > 0 && (
        <ul class="comments">
          {p.comments.map((c, i) => (
            <li key={i} class={c.by === me ? 'mine' : 'theirs'}>
              <b>{c.by === me ? 'You' : seatLabel(seats, c.by, me)}</b> {c.text}
            </li>
          ))}
        </ul>
      )}
      <form class="comment-form" onSubmit={comment}>
        <input
          type="text"
          maxLength={MAX_COMMENT_CHARS}
          placeholder={mine ? 'Add a thought' : 'Say what you think'}
          value={text}
          data-testid={`plan-comment-${p.id}`}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="small-button" disabled={!text.trim()} data-testid={`plan-say-${p.id}`}>
          <Glyph id="comment" /> Say
        </button>
      </form>
      <div class="row-actions">
        <button
          type="button"
          class={`small-button ${focused ? 'active' : ''}`}
          aria-pressed={focused}
          data-testid={`plan-show-${p.id}`}
          onClick={() => (focused ? (session.ui.planFocus.value = null) : showPlan(session, p))}
        >
          <Glyph id="eye" /> {focused ? 'Showing' : 'Show me'}
        </button>
        <span class="spacer" />
        <button
          type="button"
          class="small-button"
          data-testid={`plan-discard-${p.id}`}
          onClick={() => void discard()}
        >
          Set aside
        </button>
        <button
          type="button"
          class="primary small-button"
          data-testid={`plan-approve-${p.id}`}
          onClick={approve}
        >
          <Glyph id="check" /> Approve
        </button>
      </div>
    </li>
  );
}

/** Setting aside the partner's plan asks first; your own goes quietly. */
function confirmDiscard(session: Session, p: PlanView): Promise<boolean> {
  if (p.by === session.seat) return Promise.resolve(true);
  const name = seatLabel(session.mirror.seats.value, p.by, session.seat);
  return new Promise((resolve) => {
    session.ui.dialog.value = {
      kind: 'confirm',
      text: `Set aside ${name}'s plan, "${p.name}"? Perhaps leave a comment first.`,
      ok: 'Set it aside',
      cancel: 'Keep it',
      resolve,
    };
  });
}
